// Check 2: disks are encrypted.
// Covers standalone EBS volumes plus the root and extra disks on servers.
import { finding, ofType, isUnknown, asArray } from './util.js';

const id = 'disk-encryption';

// true = encrypted, false = not encrypted, anything else = we can't tell.
const judge = (value) => (value === true ? 'pass' : value === false ? 'fail' : 'unknown');

export default {
  id,
  run(resources) {
    const volumes = ofType(resources, 'aws_ebs_volume');
    const instances = ofType(resources, 'aws_instance');
    if (volumes.length === 0 && instances.length === 0) return [finding(id, 'na', null, 'no_disks')];

    // Account-level default encryption makes every new disk encrypted.
    const byDefault = ofType(resources, 'aws_ebs_encryption_by_default').some((d) => d.values.enabled !== false);
    if (byDefault) return [finding(id, 'pass', null, 'default_on')];

    const findings = [];
    // Standalone EBS volumes.
    for (const volume of volumes) {
      const status = isUnknown(volume, 'encrypted') ? 'unknown' : judge(volume.values.encrypted);
      findings.push(finding(id, status, volume, status === 'unknown' ? 'not_set' : `volume_${status}`));
    }
    for (const instance of instances) {
      // Each server's boot disk. If the plan doesn't describe it, we can't say it's encrypted.
      const root = asArray(instance.values.root_block_device);
      if (root.length === 0) {
        findings.push(finding(id, 'unknown', instance, 'root_not_set'));
      } else {
        const status = judge(root[0].encrypted);
        findings.push(finding(id, status, instance, status === 'unknown' ? 'root_not_set' : `root_${status}`));
      }
      // Any extra disks attached to the server.
      for (const extra of asArray(instance.values.ebs_block_device)) {
        const status = judge(extra.encrypted);
        findings.push(
          finding(id, status, instance, status === 'unknown' ? 'not_set' : `extra_${status}`, {
            device: extra.device_name ?? 'additional disk',
          }),
        );
      }
    }
    return findings;
  },
};
