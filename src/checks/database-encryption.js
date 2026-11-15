// Check 3: databases are encrypted.
// Looks at storage_encrypted on database instances and clusters.
import { finding, ofType, isUnknown } from './util.js';

const id = 'database-encryption';

export default {
  id,
  run(resources) {
    const instances = ofType(resources, 'aws_db_instance');
    const clusters = ofType(resources, 'aws_rds_cluster');
    if (instances.length === 0 && clusters.length === 0) return [finding(id, 'na', null, 'no_databases')];

    const findings = [];
    for (const db of instances) {
      // Copied from a snapshot or another database? Then it takes that source's encryption setting.
      const inherits =
        db.values.replicate_source_db || db.values.snapshot_identifier ||
        db.refs.replicate_source_db?.length || db.refs.snapshot_identifier?.length;
      if (db.values.storage_encrypted === true) findings.push(finding(id, 'pass', db, 'encrypted'));
      else if (isUnknown(db, 'storage_encrypted')) findings.push(finding(id, 'unknown', db, 'unknown'));
      // We can't see the source, so don't call it a fail.
      else if (inherits) findings.push(finding(id, 'unknown', db, 'inherits'));
      else findings.push(finding(id, 'fail', db, 'not_encrypted'));
    }
    // Aurora-style clusters. Only a clear false fails.
    for (const cluster of clusters) {
      const value = cluster.values.storage_encrypted;
      if (value === true) findings.push(finding(id, 'pass', cluster, 'encrypted'));
      else if (value === false && !isUnknown(cluster, 'storage_encrypted'))
        findings.push(finding(id, 'fail', cluster, 'not_encrypted'));
      else findings.push(finding(id, 'unknown', cluster, 'unknown'));
    }
    return findings;
  },
};
