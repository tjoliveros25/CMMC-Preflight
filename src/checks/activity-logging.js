// Check 7: account activity logging (CloudTrail) is on and protected.
// One good trail is enough: every region, with log file validation on so the logs can't be edited quietly.
import { finding, ofType } from './util.js';

const id = 'activity-logging';

export default {
  id,
  run(resources) {
    const trails = ofType(resources, 'aws_cloudtrail');
    // No trail at all means nothing is being recorded, so this is a fail, not "did not apply".
    if (trails.length === 0) return [finding(id, 'fail', null, 'missing')];

    // A good trail covers every region and has log file validation on.
    const good = trails.find(
      (t) => t.values.is_multi_region_trail === true && t.values.enable_log_file_validation === true,
    );
    if (good) return [finding(id, 'pass', good, 'protected')];

    // No good trail: say exactly what each one is missing.
    return trails.map((trail) => {
      const gaps = [];
      if (trail.values.is_multi_region_trail !== true) gaps.push('it covers one region only');
      if (trail.values.enable_log_file_validation !== true) gaps.push('the logs can be altered without detection');
      return finding(id, 'fail', trail, 'weak', { gaps: gaps.join(' and ') });
    });
  },
};
