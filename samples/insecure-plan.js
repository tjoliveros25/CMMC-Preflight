// The demo plan with problems, as the page's "Sample with problems" button loads it.
// Same content as samples/weak-plan.json. Edit samples/definitions.js to change it.
import { makePlan } from './make-plan.js';
import { weak } from './definitions.js';

export default makePlan(weak);
