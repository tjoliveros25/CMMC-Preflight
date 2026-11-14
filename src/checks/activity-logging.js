// Check 7: account activity logging (CloudTrail) is on and protected.
import { finding, ofType } from './util.js';

const id = 'activity-logging';

export default {
  id,
  run(resources) {
    const trails = ofType(resources, 'aws_cloudtrail');
    if (trails.length === 0) return [finding(id, 'fail', null, 'missing')];

    const good = trails.find(
      (t) => t.values.is_multi_region_trail === true && t.values.enable_log_file_validation === true,
    );
    if (good) return [finding(id, 'pass', good, 'protected')];

    return trails.map((trail) => {
      const gaps = [];
      if (trail.values.is_multi_region_trail !== true) gaps.push('it covers one region only');
      if (trail.values.enable_log_file_validation !== true) gaps.push('the logs can be altered without detection');
      return finding(id, 'fail', trail, 'weak', { gaps: gaps.join(' and ') });
    });
  },
};
