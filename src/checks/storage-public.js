// Check 1: storage is not public.
import { finding, ofType, isUnknown, linkedTo } from './util.js';

const id = 'storage-public';
const SETTINGS = ['block_public_acls', 'block_public_policy', 'ignore_public_acls', 'restrict_public_buckets'];
const PUBLIC_ACLS = new Set(['public-read', 'public-read-write']);

export default {
  id,
  run(resources) {
    const buckets = ofType(resources, 'aws_s3_bucket');
    if (buckets.length === 0) return [finding(id, 'na', null, 'no_buckets')];

    const blocks = ofType(resources, 'aws_s3_bucket_public_access_block');
    const acls = ofType(resources, 'aws_s3_bucket_acl');
    const accountBlock = ofType(resources, 'aws_s3_account_public_access_block').some((b) =>
      SETTINGS.every((s) => b.values[s] === true),
    );

    return buckets.map((bucket) => {
      const publicAcl =
        PUBLIC_ACLS.has(bucket.values.acl) ||
        acls.some((a) => linkedTo(a, 'bucket', bucket, ['id', 'bucket']) && PUBLIC_ACLS.has(a.values.acl));
      if (publicAcl) return finding(id, 'fail', bucket, 'public_acl');
      if (accountBlock) return finding(id, 'pass', bucket, 'account_block');

      const block = blocks.find((b) => linkedTo(b, 'bucket', bucket, ['id', 'bucket']));
      if (!block) return finding(id, 'fail', bucket, 'no_block');

      const off = SETTINGS.filter((s) => block.values[s] !== true && !isUnknown(block, s));
      if (off.length > 0) return finding(id, 'fail', bucket, 'block_incomplete', { settings: off.join(', ') });
      if (SETTINGS.some((s) => isUnknown(block, s))) return finding(id, 'unknown', bucket, 'block_unknown');
      return finding(id, 'pass', bucket, 'blocked');
    });
  },
};
