// The ten checks, in report order.
// Each one is just { id, run(resources) }. Adding a check = a new file here + its text in content.js.
import storagePublic from './storage-public.js';
import diskEncryption from './disk-encryption.js';
import databaseEncryption from './database-encryption.js';
import databasePublic from './database-public.js';
import adminPorts from './admin-ports.js';
import wideOpenRules from './wide-open-rules.js';
import activityLogging from './activity-logging.js';
import trafficLogging from './traffic-logging.js';
import adminPermissions from './admin-permissions.js';
import transitEncryption from './transit-encryption.js';

export const checks = [
  storagePublic,
  diskEncryption,
  databaseEncryption,
  databasePublic,
  adminPorts,
  wideOpenRules,
  activityLogging,
  trafficLogging,
  adminPermissions,
  transitEncryption,
];
