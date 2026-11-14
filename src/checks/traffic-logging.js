// Check 8: network traffic is logged (VPC flow logs).
import { finding, ofType, linkedTo } from './util.js';

const id = 'traffic-logging';

export default {
  id,
  run(resources) {
    const networks = ofType(resources, 'aws_vpc');
    if (networks.length === 0) return [finding(id, 'na', null, 'no_networks')];
    const flowLogs = ofType(resources, 'aws_flow_log');
    return networks.map((network) =>
      flowLogs.some((log) => linkedTo(log, 'vpc_id', network, ['id']))
        ? finding(id, 'pass', network, 'logged')
        : finding(id, 'fail', network, 'not_logged'),
    );
  },
};
