// Writes samples/weak-plan.json and samples/fixed-plan.json from samples/definitions.js.
//
//   node samples/build-sample-files.js
//
// Those two files are what the demo drops onto the page. They carry the same planned_values,
// resource_changes and configuration sections that real `terraform show -json` output has,
// including the references that tie a public access block to its bucket and a flow log to its
// network.
//
// These two are synthetic: they follow the documented format but were built by hand.
// samples/real-insecure-plan.json and samples/real-fixed-plan.json are the genuine article,
// exported from fixtures/ with `terraform plan` and `terraform show -json`. The page offers
// the real insecure plan as its download, and the tests check both pairs.

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
