// Check 10: web traffic is encrypted in transit (load balancer listeners).
import { finding, ofType, isUnknown, asArray } from './util.js';

const id = 'transit-encryption';
const ENCRYPTED = new Set(['HTTPS', 'TLS']);

export default {
  id,
  run(resources) {
    const listeners = ofType(resources, 'aws_lb_listener', 'aws_alb_listener');
    if (listeners.length === 0) return [finding(id, 'na', null, 'no_listeners')];

    const findings = [];
    for (const listener of listeners) {
      const protocol = listener.values.protocol;
      if (protocol === null || protocol === undefined || isUnknown(listener, 'protocol')) {
        findings.push(finding(id, 'unknown', listener, 'unknown'));
      } else if (ENCRYPTED.has(protocol)) {
        findings.push(finding(id, 'pass', listener, 'encrypted'));
      } else if (protocol === 'HTTP') {
        const redirects = asArray(listener.values.default_action).some(
          (action) => action.type === 'redirect' && asArray(action.redirect)[0]?.protocol === 'HTTPS',
        );
        findings.push(
          redirects
            ? finding(id, 'pass', listener, 'redirects')
            : finding(id, 'fail', listener, 'plain_http', { port: listener.values.port ?? 80 }),
        );
      }
      // Other protocols (TCP, UDP) are network-level listeners and are not judged here.
    }
    return findings.length > 0 ? findings : [finding(id, 'na', null, 'no_listeners')];
  },
};
