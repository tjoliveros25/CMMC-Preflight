// Check 1: storage is not public.
// Could a stranger read files in these buckets? A public ACL fails right away.
// Otherwise each bucket needs a public access block with all four settings on,
// unless the whole account already blocks public access.
import { finding, ofType, isUnknown, linkedTo } from './util.js';

const id = 'storage-public';
// The four switches on a public access block. All four have to be on.
const SETTINGS = ['block_public_acls', 'block_public_policy', 'ignore_public_acls', 'restrict_public_buckets'];
const PUBLIC_ACLS = new Set(['public-read', 'public-read-write']);

export default {
  id,
  run(resources) {
    const buckets = ofType(resources, 'aws_s3_bucket');
    // No buckets in the plan, so there's nothing to judge.
    if (buckets.length === 0) return [finding(id, 'na', null, 'no_buckets')];

    const blocks = ofType(resources, 'aws_s3_bucket_public_access_block');
    const acls = ofType(resources, 'aws_s3_bucket_acl');
    // An account-wide block covers every bucket, so it counts as a pass for all of them.
    const accountBlock = ofType(resources, 'aws_s3_account_public_access_block').some((b) =>
      SETTINGS.every((s) => b.values[s] === true),
    );

    return buckets.map((bucket) => {
      // The ACL can be set on the bucket itself or in a separate aws_s3_bucket_acl resource.
      const publicAcl =
        PUBLIC_ACLS.has(bucket.values.acl) ||
        acls.some((a) => linkedTo(a, 'bucket', bucket, ['id', 'bucket']) && PUBLIC_ACLS.has(a.values.acl));
      // A public ACL fails the bucket even when a block exists, so the block alone doesn't fix it.
      if (publicAcl) return finding(id, 'fail', bucket, 'public_acl');
      if (accountBlock) return finding(id, 'pass', bucket, 'account_block');

      // Find the block that belongs to this bucket (by reference, since the id is unknown in a real plan).
      const block = blocks.find((b) => linkedTo(b, 'bucket', bucket, ['id', 'bucket']));
      if (!block) return finding(id, 'fail', bucket, 'no_block');

      // Settings that are clearly off. Unknown ones aren't counted as off.
      const off = SETTINGS.filter((s) => block.values[s] !== true && !isUnknown(block, s));
      if (off.length > 0) return finding(id, 'fail', bucket, 'block_incomplete', { settings: off.join(', ') });
      if (SETTINGS.some((s) => isUnknown(block, s))) return finding(id, 'unknown', bucket, 'block_unknown');
      return finding(id, 'pass', bucket, 'blocked');
    });
  },
};
