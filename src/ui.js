// Page behaviour: reads a dropped file in the browser, runs the checks, draws the report.
// Nothing in this file (or anywhere in ReadyCheck) sends data over the network.
import { parsePlan, parsePlanText, PlanError } from './parser.js';
import { buildReport } from './report.js';
import { STATUS_LABEL, DISCLAIMER } from './content.js';
import insecurePlan from '../samples/insecure-plan.js';
import fixedPlan from '../samples/fixed-plan.js';

const $ = (id) => document.getElementById(id);

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

// ---------- Summary rail ----------

function renderSummary(report, source) {
  const order = ['fail', 'unknown', 'pass', 'na'];
  const bar = h('div', { class: 'bar', role: 'img', 'aria-label': order.map((s) => `${report.counts[s]} ${STATUS_LABEL[s].toLowerCase()}`).join(', ') });
  for (const status of order) {
    if (report.counts[status] === 0) continue;
    const segment = h('span', { class: 'bar-seg', 'data-status': status });
    segment.style.flexGrow = String(report.counts[status]);
    bar.append(segment);
  }

  const skipped = report.counts.na;
  $('summary').replaceChildren(
    h('h2', { id: 'summary-heading', text: 'Result' }),
    h('p', { class: 'score' },
      h('span', { class: 'score-num', text: String(report.passed) }),
      h('span', { class: 'score-of', text: `of ${report.applicable}` }),
    ),
    h('p', { class: 'score-label', text: skipped > 0 ? `checks passed. ${skipped} did not apply to this plan.` : 'checks passed' }),
    bar,
    h('ul', { class: 'legend' },
      order.map((status) =>
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
      source.meta.terraformVersion ? [h('dt', { text: 'Terraform' }), h('dd', { text: source.meta.terraformVersion })] : null,
      h('dt', { text: 'Checked' }), h('dd', { text: new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) }),
      h('dt', { text: 'Standard' }), h('dd', { text: 'NIST SP 800-171 Rev 2' }),
    ),
    h('button', { type: 'button', class: 'button button-primary print-button', onclick: printReport, text: 'Print or save as PDF' }),
  );
}

function printReport() {
  // Open every finding so the printed report is complete.
  for (const d of document.querySelectorAll('.check details')) d.open = true;
  try { window.print(); } catch { /* printing is unavailable in some embedded previews */ }
}

// ---------- Findings ----------

function renderCheck(check) {
  const showFix = check.status === 'fail' || check.status === 'unknown';
  const copy = h('button', { type: 'button', class: 'button button-small', text: 'Copy' });
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(check.fix);
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Select and copy';
    }
    setTimeout(() => { copy.textContent = 'Copy'; }, 1800);
  });

  return h('li', { class: 'check', 'data-status': check.status },
    h('details', { open: check.status === 'fail' || check.status === 'unknown' },
      h('summary', {},
        h('span', { class: 'num', text: two(check.number), 'aria-hidden': 'true' }),
        h('span', { class: 'check-title', text: check.title }),
        h('span', { class: 'pill', 'data-status': check.status, text: STATUS_LABEL[check.status] }),
        h('span', { class: 'reqs', 'aria-label': `Requirements ${check.requirements.join(', ')}` },
          check.requirements.map((r) => h('span', { class: 'req', text: r })),
        ),
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

function renderReport(report, source) {
  renderSummary(report, source);
  $('findings').replaceChildren(...report.ordered.map(renderCheck));
  const problems = report.counts.fail;
  $('results-sub').textContent =
    problems > 0
      ? `${problems} ${problems === 1 ? 'check needs' : 'checks need'} fixing. Problems are listed first.`
      : report.counts.unknown > 0
        ? 'Nothing failed, but some checks could not be determined from the plan.'
        : 'Nothing in this plan failed the ten checks.';
  $('disclaimer').textContent = DISCLAIMER;
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
    renderReport(buildReport(resources), { label, meta });
    if (sample) showNotice('sample', 'This is a sample plan.', 'Drop your own plan.json on the left to check it.');
    else $('notice').replaceChildren();
  } catch (error) {
    const message = error instanceof PlanError ? error.message : 'Something went wrong reading this file.';
    showNotice('error', 'We could not read that file.', `${message} The report below is unchanged.`);
    if (!(error instanceof PlanError)) console.error(error);
  }
}

async function loadFile(file) {
  if (!file) return;
  const text = await file.text();
  run(() => parsePlanText(text), file.name, false);
  $('results-heading').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const input = $('plan-file');
input.addEventListener('change', () => { loadFile(input.files[0]); input.value = ''; });

const drop = $('drop-zone');
for (const type of ['dragenter', 'dragover']) {
  drop.addEventListener(type, (event) => { event.preventDefault(); drop.classList.add('is-over'); });
}
for (const type of ['dragleave', 'drop']) {
  drop.addEventListener(type, (event) => { event.preventDefault(); drop.classList.remove('is-over'); });
}
drop.addEventListener('drop', (event) => loadFile(event.dataTransfer?.files?.[0]));
// A file dropped anywhere else on the page should not navigate away from it.
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => event.preventDefault());

$('sample-insecure').addEventListener('click', () => run(() => parsePlan(insecurePlan), 'Sample with problems', true));
$('sample-fixed').addEventListener('click', () => run(() => parsePlan(fixedPlan), 'Sample after fixes', true));

// Open in a working state: show the sample with problems until the visitor loads their own plan.
run(() => parsePlan(insecurePlan), 'Sample with problems', true);
