// Stress test: run many random plans from tools/make_random_plan.py through the real parser
// and all ten checks, and fail if anything crashes or produces a malformed report.
//
//   npm run fuzz             # 200 random plans
//   npm run fuzz -- 1000     # as many as you like
//
// Needs Python 3 (the generator uses the standard library only). Separate from `npm test`
// so the unit tests keep running with Node alone.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parsePlanText } from '../src/parser.js';
import { buildReport } from '../src/report.js';
import { checks } from '../src/checks/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const count = Number(process.argv[2] ?? 200);
const STATUSES = new Set(['fail', 'unknown', 'pass', 'na']);

// "python3" on macOS and Linux, often just "python" on Windows.
function findPython() {
  for (const cmd of ['python3', 'python', 'py']) {
    try {
      execFileSync(cmd, ['--version'], { stdio: 'ignore' });
      return cmd;
    } catch {
      /* try the next name */
    }
  }
  console.error('Python 3 was not found. Install it, or run the unit tests alone with: npm test');
  process.exit(1);
}

const python = findPython();
const tally = { fail: 0, unknown: 0, pass: 0, na: 0 };
const scores = new Set();
const problems = [];

for (let seed = 1; seed <= count; seed++) {
  const text = execFileSync(python, ['tools/make_random_plan.py', '--seed', String(seed), '--stdout'], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  }).toString();
  try {
    const report = buildReport(parsePlanText(text).resources);
    if (report.checks.length !== checks.length) problems.push(`seed ${seed}: ${report.checks.length} checks, expected ${checks.length}`);
    for (const check of report.checks) {
      if (!STATUSES.has(check.status)) problems.push(`seed ${seed}: ${check.id} has status "${check.status}"`);
      tally[check.status] += 1;
      for (const f of check.findings) {
        // A finding whose text is just its reason code means content.js is missing a sentence.
        if (!f.text || f.text === f.reason) problems.push(`seed ${seed}: ${check.id} has no wording for "${f.reason}"`);
      }
    }
    scores.add(report.passed);
  } catch (error) {
    problems.push(`seed ${seed}: crashed: ${error.message}`);
  }
}

const range = [...scores].sort((a, b) => a - b);
console.log(`${count} random plans checked.`);
console.log(`Check results: ${tally.fail} needs fixing, ${tally.unknown} could not determine, ${tally.pass} passed, ${tally.na} did not apply.`);
console.log(`Scores ranged from ${range[0]} to ${range.at(-1)} of 10.`);
if (problems.length > 0) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems.slice(0, 20)) console.log(`  ${p}`);
  process.exit(1);
}
console.log('No crashes and no malformed reports.');
