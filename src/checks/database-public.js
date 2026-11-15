// Check 4: databases are not on the internet.
import { finding, ofType, isUnknown } from './util.js';

const id = 'database-public';

export default {
  id,
  run(resources) {
    const dbs = ofType(resources, 'aws_db_instance', 'aws_rds_cluster_instance');
    if (dbs.length === 0) return [finding(id, 'na', null, 'no_databases')];
    return dbs.map((db) => {
      // Decided at apply time, so we can't say.
      if (isUnknown(db, 'publicly_accessible')) return finding(id, 'unknown', db, 'unknown');
      // Only an explicit true fails. Not set means Terraform's default, which is private.
      return db.values.publicly_accessible === true
        ? finding(id, 'fail', db, 'public')
        : finding(id, 'pass', db, 'private');
    });
  },
};
