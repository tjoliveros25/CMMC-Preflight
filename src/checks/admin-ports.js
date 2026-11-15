// Check 5: no remote admin ports (SSH 22, RDP 3389) open to the world.
// "The world" means 0.0.0.0/0 or ::/0. The rules come from firewall-rules.js.
import { finding } from './util.js';
import { inboundRules, hasFirewallResources, fromWorld, coversPort } from './firewall-rules.js';

const id = 'admin-ports';
// 22 is SSH (Linux logins), 3389 is RDP (Windows remote desktop).
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
      // A rule limited to the company's own addresses is fine. We only care about the whole internet.
      if (!fromWorld(rule)) continue;
      // Which admin ports fall inside this rule. An all-protocols rule covers them too.
      const open = ADMIN_PORTS.filter((port) => coversPort(rule, port));
      if (open.length > 0) findings.push(finding(id, 'fail', rule.resource, 'open', { ports: open.join(' and ') }));
    }
    return findings.length > 0 ? findings : [finding(id, 'pass', null, 'closed')];
  },
};
