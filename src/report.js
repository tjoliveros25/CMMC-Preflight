// Report model: runs every check and joins the findings with their plain-English wording.
// Pure data in, pure data out, so it can be tested without a browser.
import { checks } from './checks/index.js';
import { content } from './content.js';

const SEVERITY = { fail: 0, unknown: 1, pass: 2, na: 3 };

export function overallStatus(findings) {
  return findings.reduce((worst, f) => (SEVERITY[f.status] < SEVERITY[worst] ? f.status : worst), 'na');
}

export function buildReport(resources) {
  const results = checks.map((check, index) => {
    const entry = content[check.id];
    const findings = check.run(resources).map((f) => ({
      ...f,
      text: (entry.messages[f.reason] ?? (() => `${f.reason}`))(f.vars),
    }));
    findings.sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status]);
    const status = overallStatus(findings);
    const firstProblem = findings.find((f) => f.status === 'fail' && f.vars.name);
    return {
      number: index + 1,
      id: check.id,
      title: entry.title,
      requirements: entry.requirements,
      why: entry.why,
      limits: entry.limits,
      fix: entry.fix(firstProblem ? firstProblem.vars.name : 'example'),
      status,
      findings,
    };
  });

  const counts = { fail: 0, unknown: 0, pass: 0, na: 0 };
  for (const r of results) counts[r.status] += 1;

  return {
    checks: results,
    // Problems first, then things we could not determine, then passes.
    ordered: [...results].sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status] || a.number - b.number),
    counts,
    passed: counts.pass,
    applicable: results.length - counts.na,
    total: results.length,
  };
}
