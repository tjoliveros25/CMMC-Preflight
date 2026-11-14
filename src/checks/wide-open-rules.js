// Check 6: no inbound firewall rule accepts every port from the world.
import { finding } from './util.js';
import { inboundRules, hasFirewallResources, fromWorld, allPorts } from './firewall-rules.js';

const id = 'wide-open-rules';

export default {
  id,
  run(resources) {
    if (!hasFirewallResources(resources)) return [finding(id, 'na', null, 'no_firewall')];
    const findings = [];
    for (const rule of inboundRules(resources)) {
      if (rule.unknown) {
        findings.push(finding(id, 'unknown', rule.resource, 'unknown'));
        continue;
      }
      if (fromWorld(rule) && allPorts(rule)) findings.push(finding(id, 'fail', rule.resource, 'wide_open'));
    }
    return findings.length > 0 ? findings : [finding(id, 'pass', null, 'narrow')];
  },
};
