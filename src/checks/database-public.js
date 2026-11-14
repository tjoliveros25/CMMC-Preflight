// Check 4: databases are not on the internet.
import { finding, ofType, isUnknown } from './util.js';

const id = 'database-public';

export default {
  id,
  run(resources) {
    const dbs = ofType(resources, 'aws_db_instance', 'aws_rds_cluster_instance');
    if (dbs.length === 0) return [finding(id, 'na', null, 'no_databases')];
    return dbs.map((db) => {
      if (isUnknown(db, 'publicly_accessible')) return finding(id, 'unknown', db, 'unknown');
      return db.values.publicly_accessible === true
        ? finding(id, 'fail', db, 'public')
        : finding(id, 'pass', db, 'private');
    });
  },
};
