// Writes samples/weak-plan.json and samples/fixed-plan.json from samples/definitions.js.
//
//   node samples/build-sample-files.js
//
// Those two files are what the demo drops onto the page. They carry the same planned_values,
// resource_changes and configuration sections that real `terraform show -json` output has,
// including the references that tie a public access block to its bucket and a flow log to its
// network.
//
// They are still synthetic. The authoritative versions come from exporting fixtures/.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makePlan } from './make-plan.js';
import { weak, fixed } from './definitions.js';

const here = dirname(fileURLToPath(import.meta.url));

for (const [name, resources] of [['weak-plan', weak], ['fixed-plan', fixed]]) {
  const path = join(here, `${name}.json`);
  writeFileSync(path, `${JSON.stringify(makePlan(resources), null, 2)}\n`);
  console.log(`wrote ${path}`);
}

// The page offers example-plan.json for download, so keep it in step with the weak sample.
writeFileSync(join(here, '..', 'example-plan.json'), `${JSON.stringify(makePlan(weak), null, 2)}\n`);
console.log('wrote example-plan.json');
