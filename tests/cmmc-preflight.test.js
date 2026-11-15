// Run with: npm test   (needs Node 20 or newer, no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parsePlan, parsePlanText, PlanError } from '../src/parser.js';
import { buildReport } from '../src/report.js';
import { checks } from '../src/checks/index.js';
import { content } from '../src/content.js';
import { makePlan } from '../samples/make-plan.js';
import insecurePlan from '../samples/insecure-plan.js';
import fixedPlan from '../samples/fixed-plan.js';

const statusOf = (resources, id) => buildReport(parsePlan(makePlan(resources)).resources).checks.find((c) => c.id === id).status;

// ---------- The two sample plans (the answer key) ----------

test('insecure sample fails all ten checks', () => {
  const report = buildReport(parsePlan(insecurePlan).resources);
  assert.deepEqual(report.checks.map((c) => [c.id, c.status]), checks.map((c) => [c.id, 'fail']));
  assert.equal(report.passed, 0);
});

test('fixed sample passes all ten checks', () => {
  const report = buildReport(parsePlan(fixedPlan).resources);
  assert.deepEqual(report.checks.map((c) => [c.id, c.status]), checks.map((c) => [c.id, 'pass']));
  assert.equal(report.passed, 10);
});

test('every finding has plain-English text and names a real resource', () => {
  for (const plan of [insecurePlan, fixedPlan]) {
    const { resources } = parsePlan(plan);
    const addresses = new Set(resources.map((r) => r.address));
    for (const check of buildReport(resources).checks) {
      for (const f of check.findings) {
        assert.ok(f.text.length > 20, `${check.id}/${f.reason} has no sentence`);
        assert.notEqual(f.text, f.reason, `${check.id}/${f.reason} is missing from content.js`);
        if (f.resource) assert.ok(addresses.has(f.resource), `${f.resource} is not in the plan`);
      }
    }
  }
});

test('every check has a content entry with requirement numbers', () => {
  for (const check of checks) {
    const entry = content[check.id];
    assert.ok(entry, `${check.id} missing from content.js`);
    assert.ok(entry.requirements.every((r) => /^3\.\d+\.\d+$/.test(r)));
  }
});

// ---------- Parser ----------

test('parser counts resources and reads modules', () => {
  const { resources, meta } = parsePlan(
    makePlan([
      { type: 'aws_vpc', name: 'main', module: 'network', values: { cidr_block: '10.0.0.0/16' } },
      { type: 'aws_flow_log', name: 'main', module: 'network', values: {}, refs: { vpc_id: ['aws_vpc.main.id'] } },
      { type: 'aws_s3_bucket', name: 'a', values: { bucket: 'a' } },
    ]),
  );
  assert.equal(meta.total, 3);
  assert.ok(resources.some((r) => r.address === 'module.network.aws_vpc.main'));
  // A reference inside a module resolves to the module's own resource.
  assert.equal(buildReport(resources).checks.find((c) => c.id === 'traffic-logging').status, 'pass');
});

test('parser flags unknown values instead of treating them as false', () => {
  const { resources } = parsePlan(
    makePlan([{ type: 'aws_ebs_volume', name: 'd', values: { size: 10 }, unknown: { encrypted: true } }]),
  );
  assert.equal(resources[0].unknown.encrypted, true);
  assert.equal(buildReport(resources).checks.find((c) => c.id === 'disk-encryption').status, 'unknown');
});

test('parser rejects the three likely wrong files with clear errors', () => {
  const code = (fn) => {
    try { fn(); } catch (e) { assert.ok(e instanceof PlanError); return e.code; }
    return 'no error';
  };
  assert.equal(code(() => parsePlanText('this is not json')), 'not_json');
  assert.equal(code(() => parsePlanText('{"hello":"world"}')), 'not_plan');
  assert.equal(code(() => parsePlanText('{"values":{"root_module":{}}}')), 'state_file');
  assert.equal(code(() => parsePlan(makePlan([{ type: 'azurerm_storage_account', name: 'x', values: {} }]))), 'no_aws');
});

// ---------- Edge cases per check ----------

test('1 storage: block with one setting off fails; no buckets is not applicable', () => {
  const bucket = { type: 'aws_s3_bucket', name: 'b', values: { bucket: 'b' } };
  const partial = {
    type: 'aws_s3_bucket_public_access_block', name: 'b',
    values: { block_public_acls: true, block_public_policy: true, ignore_public_acls: true, restrict_public_buckets: false },
    refs: { bucket: ['aws_s3_bucket.b.id'] },
  };
  assert.equal(statusOf([bucket, partial], 'storage-public'), 'fail');
  assert.equal(statusOf([bucket], 'storage-public'), 'fail');
  assert.equal(statusOf([{ type: 'aws_vpc', name: 'v', values: {} }], 'storage-public'), 'na');
});

test('1 storage: block linked by literal bucket name passes', () => {
  assert.equal(
    statusOf(
      [
        { type: 'aws_s3_bucket', name: 'b', values: { bucket: 'acme-b' } },
        {
          type: 'aws_s3_bucket_public_access_block', name: 'x',
          values: { bucket: 'acme-b', block_public_acls: true, block_public_policy: true, ignore_public_acls: true, restrict_public_buckets: true },
        },
      ],
      'storage-public',
    ),
    'pass',
  );
});

test('2 disks: account default encryption passes everything', () => {
  assert.equal(
    statusOf(
      [
        { type: 'aws_ebs_volume', name: 'd', values: { encrypted: false } },
        { type: 'aws_ebs_encryption_by_default', name: 'all', values: { enabled: true } },
      ],
      'disk-encryption',
    ),
    'pass',
  );
});

test('5 admin ports: separate rule resource, port range, IPv6, and narrow address', () => {
  const rule = (values) => [{ type: 'aws_security_group_rule', name: 'r', values: { type: 'ingress', protocol: 'tcp', ...values } }];
  assert.equal(statusOf(rule({ from_port: 22, to_port: 22, cidr_blocks: ['0.0.0.0/0'] }), 'admin-ports'), 'fail');
  assert.equal(statusOf(rule({ from_port: 0, to_port: 1024, cidr_blocks: ['0.0.0.0/0'] }), 'admin-ports'), 'fail');
  assert.equal(statusOf(rule({ from_port: 3389, to_port: 3389, ipv6_cidr_blocks: ['::/0'] }), 'admin-ports'), 'fail');
  assert.equal(statusOf(rule({ from_port: 22, to_port: 22, cidr_blocks: ['203.0.113.10/32'] }), 'admin-ports'), 'pass');
  assert.equal(statusOf(rule({ from_port: 443, to_port: 443, cidr_blocks: ['0.0.0.0/0'] }), 'admin-ports'), 'pass');
  assert.equal(
    statusOf([{ type: 'aws_vpc_security_group_ingress_rule', name: 'r', values: { ip_protocol: 'tcp', from_port: 22, to_port: 22, cidr_ipv4: '0.0.0.0/0' } }], 'admin-ports'),
    'fail',
  );
});

test('6 wide open: protocol -1 fails; outbound rules are ignored', () => {
  assert.equal(
    statusOf([{ type: 'aws_security_group_rule', name: 'r', values: { type: 'ingress', protocol: '-1', from_port: 0, to_port: 0, cidr_blocks: ['0.0.0.0/0'] } }], 'wide-open-rules'),
    'fail',
  );
  assert.equal(
    statusOf([{ type: 'aws_security_group_rule', name: 'r', values: { type: 'egress', protocol: '-1', from_port: 0, to_port: 0, cidr_blocks: ['0.0.0.0/0'] } }], 'wide-open-rules'),
    'pass',
  );
});

test('7 activity logging: missing trail fails; one flag off fails', () => {
  assert.equal(statusOf([{ type: 'aws_vpc', name: 'v', values: {} }], 'activity-logging'), 'fail');
  assert.equal(
    statusOf([{ type: 'aws_cloudtrail', name: 't', values: { is_multi_region_trail: true, enable_log_file_validation: false } }], 'activity-logging'),
    'fail',
  );
});

test('8 traffic logging: two networks, one flow log, fails', () => {
  assert.equal(
    statusOf(
      [
        { type: 'aws_vpc', name: 'a', values: {} },
        { type: 'aws_vpc', name: 'b', values: {} },
        { type: 'aws_flow_log', name: 'a', values: {}, refs: { vpc_id: ['aws_vpc.a.id'] } },
      ],
      'traffic-logging',
    ),
    'fail',
  );
});

test('9 permissions: Deny with wildcards passes; inline role policy with wildcards fails; unknown policy is unknown', () => {
  const policy = (type, statement) => [{ type, name: 'p', values: { policy: JSON.stringify({ Statement: statement }) } }];
  assert.equal(statusOf(policy('aws_iam_policy', [{ Effect: 'Deny', Action: '*', Resource: '*' }]), 'admin-permissions'), 'pass');
  assert.equal(statusOf(policy('aws_iam_role_policy', { Effect: 'Allow', Action: ['*'], Resource: ['*'] }), 'admin-permissions'), 'fail');
  assert.equal(statusOf(policy('aws_iam_policy', [{ Effect: 'Allow', Action: 's3:*', Resource: '*' }]), 'admin-permissions'), 'pass');
  assert.equal(statusOf([{ type: 'aws_iam_policy', name: 'p', values: {}, unknown: { policy: true } }], 'admin-permissions'), 'unknown');
});

test('10 transit: plain HTTP fails; HTTP that redirects to HTTPS passes', () => {
  const listener = (values) => [{ type: 'aws_lb_listener', name: 'l', values }];
  assert.equal(statusOf(listener({ port: 80, protocol: 'HTTP', default_action: [{ type: 'forward' }] }), 'transit-encryption'), 'fail');
  assert.equal(
    statusOf(listener({ port: 80, protocol: 'HTTP', default_action: [{ type: 'redirect', redirect: [{ protocol: 'HTTPS' }] }] }), 'transit-encryption'),
    'pass',
  );
  assert.equal(statusOf(listener({ port: 443, protocol: 'HTTPS', default_action: [{ type: 'forward' }] }), 'transit-encryption'), 'pass');
});

// ---------- Real plans (made with `terraform plan` + `terraform show -json`) ----------
// The two sample plans above are hand-built. These two came from real Terraform
// (v1.16.6, AWS provider 5.x) using fixtures/insecure and fixtures/fixed.

const realPlan = (name) => parsePlanText(readFileSync(new URL(`../samples/${name}`, import.meta.url), 'utf8'));

test('real insecure plan from Terraform fails all ten checks', () => {
  const report = buildReport(realPlan('real-insecure-plan.json').resources);
  assert.deepEqual(report.checks.map((c) => [c.id, c.status]), checks.map((c) => [c.id, 'fail']));
});

test('real fixed plan from Terraform passes all ten checks', () => {
  const report = buildReport(realPlan('real-fixed-plan.json').resources);
  assert.deepEqual(report.checks.map((c) => [c.id, c.status]), checks.map((c) => [c.id, 'pass']));
});
