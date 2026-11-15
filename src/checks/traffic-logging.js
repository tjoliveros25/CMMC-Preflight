// Check 8: network traffic is logged (VPC flow logs).
// Every VPC needs a flow log pointing at it.
import { finding, ofType, linkedTo } from './util.js';

const id = 'traffic-logging';

export default {
  id,
  run(resources) {
    const networks = ofType(resources, 'aws_vpc');
    if (networks.length === 0) return [finding(id, 'na', null, 'no_networks')];
    const flowLogs = ofType(resources, 'aws_flow_log');
    return networks.map((network) =>
      // Does any flow log point at this network? linkedTo also matches the config reference,
      // because the VPC id doesn't exist yet in a real plan.
      flowLogs.some((log) => linkedTo(log, 'vpc_id', network, ['id']))
        ? finding(id, 'pass', network, 'logged')
        : finding(id, 'fail', network, 'not_logged'),
    );
  },
};
