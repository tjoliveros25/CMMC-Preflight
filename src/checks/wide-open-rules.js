// Check 6: no inbound firewall rule accepts every port from the world.
// Different from check 5: this catches the "allow everything" rule (all protocols, or ports 0-65535).
// Outbound rules are ignored on purpose.
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
      // Open to the whole internet AND on every port: the worst kind of rule.
      if (fromWorld(rule) && allPorts(rule)) findings.push(finding(id, 'fail', rule.resource, 'wide_open'));
    }
    return findings.length > 0 ? findings : [finding(id, 'pass', null, 'narrow')];
  },
};
