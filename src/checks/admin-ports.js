// Check 5: no remote admin ports (SSH 22, RDP 3389) open to the world.
import { finding } from './util.js';
import { inboundRules, hasFirewallResources, fromWorld, coversPort } from './firewall-rules.js';

const id = 'admin-ports';
const ADMIN_PORTS = [22, 3389];

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
      if (!fromWorld(rule)) continue;
      const open = ADMIN_PORTS.filter((port) => coversPort(rule, port));
      if (open.length > 0) findings.push(finding(id, 'fail', rule.resource, 'open', { ports: open.join(' and ') }));
    }
    return findings.length > 0 ? findings : [finding(id, 'pass', null, 'closed')];
  },
};
