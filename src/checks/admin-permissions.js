// Check 9: no permission policy allows every action on every resource.
// We're looking for Allow + Action "*" + Resource "*". A Deny with wildcards is fine, since it takes access away.
import { finding, ofType, isUnknown, asArray } from './util.js';

const id = 'admin-permissions';
const TYPES = ['aws_iam_policy', 'aws_iam_role_policy', 'aws_iam_user_policy', 'aws_iam_group_policy'];
// "*" and "*:*" both mean every action in every AWS service.
const ANY_ACTION = new Set(['*', '*:*']);

export default {
  id,
  run(resources) {
    const policies = ofType(resources, ...TYPES);
    if (policies.length === 0) return [finding(id, 'na', null, 'no_policies')];

    const findings = [];
    for (const policy of policies) {
      // Policy text built at apply time can't be read yet, for example when it refers to another resource's arn.
      if (isUnknown(policy, 'policy') || typeof policy.values.policy !== 'string') {
        findings.push(finding(id, 'unknown', policy, 'unknown'));
        continue;
      }
      let document;
      try {
        document = JSON.parse(policy.values.policy);
      } catch {
        findings.push(finding(id, 'unknown', policy, 'unreadable'));
        continue;
      }
      // The dangerous combination: Allow, every action, every resource.
      const blanket = asArray(document.Statement).some(
        (statement) =>
          statement.Effect === 'Allow' &&
          asArray(statement.Action).some((action) => ANY_ACTION.has(action)) &&
          asArray(statement.Resource).includes('*'),
      );
      if (blanket) findings.push(finding(id, 'fail', policy, 'blanket'));
    }
    return findings.length > 0 ? findings : [finding(id, 'pass', null, 'scoped', { count: policies.length })];
  },
};
