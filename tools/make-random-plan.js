#!/usr/bin/env node
//
// Generates a random, structurally valid Terraform plan representation, for testing the
// parser and the checks against shapes nobody wrote by hand.
//
//   node tools/make-random-plan.js                      print a random plan
//   node tools/make-random-plan.js --out plan.json      write it to a file
//   node tools/make-random-plan.js --seed 42            reproduce an exact plan
//   node tools/make-random-plan.js --check              generate one and report on it
//   node tools/make-random-plan.js --fuzz 500           generate 500 and look for crashes
//
// A NOTE ON WHAT THIS PRODUCES
//
// `terraform plan -out=tfplan` does NOT write JSON. That file is binary and opaque, and
// `cat tfplan | jq` gets you nothing. The JSON comes from a second command:
//
//   terraform show -json tfplan > plan.json
//
// which emits the documented "plan representation", the format carrying a `format_version`
// key. That is what this script imitates and what the tool reads. Real plans can also hold
// secrets, which is why they stay out of version control and why the tool reads them in the
// browser rather than uploading them.
//
// This generator covers the fields the checks read. It is not a complete implementation of
// the format, so it complements real exports rather than replacing them: samples/real-*.json
// came out of Terraform itself and remain the authority.

import { writeFileSync } from 'node:fs';
import { makePlan } from '../samples/make-plan.js';

// ---------- A small seeded generator, so a run can be reproduced ----------

function rng(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

let random = rng(Date.now());
const pick = (list) => list[Math.floor(random() * list.length)];
const between = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1));
const chance = (p) => random() < p;

const NAMES = ['cui_data', 'drawings', 'records', 'app_data', 'archive', 'exports', 'quotes', 'ndas', 'logs', 'backups'];
const ZONES = ['us-east-1a', 'us-east-1b', 'us-gov-west-1a'];
const OFFICE = ['10.0.0.0/16', '192.168.1.0/24', '203.0.113.10/32', '172.16.0.0/12'];
const WORLD = ['0.0.0.0/0', '::/0'];

let counter = 0;
const uniq = (base) => `${base}_${(counter += 1)}`;

// ---------- Resource builders, each able to come out good, bad or undecided ----------

function storage() {
  const name = uniq(pick(NAMES));
  const out = [{ type: 'aws_s3_bucket', name, values: { bucket: `acme-${name.replace(/_/g, '-')}` } }];
  const mood = pick(['blocked', 'open-acl', 'no-block', 'partial', 'unknown']);
  const ref = { bucket: [`aws_s3_bucket.${name}.id`, `aws_s3_bucket.${name}`] };

  if (mood === 'open-acl') {
    out.push({ type: 'aws_s3_bucket_acl', name, values: { acl: 'public-read' }, refs: ref });
  } else if (mood === 'blocked' || mood === 'partial' || mood === 'unknown') {
    const all = ['block_public_acls', 'block_public_policy', 'ignore_public_acls', 'restrict_public_buckets'];
    const values = {};
    const unknown = {};
    for (const key of all) {
      if (mood === 'blocked') values[key] = true;
      else if (mood === 'partial') values[key] = chance(0.7);
      else if (chance(0.5)) unknown[key] = true;
      else values[key] = true;
    }
    out.push({ type: 'aws_s3_bucket_public_access_block', name, values, unknown, refs: ref });
  }
  // 'no-block' adds nothing, which is itself a finding.
  return out;
}

function disk() {
  const name = uniq('vol');
  const mood = pick(['on', 'off', 'unknown']);
  const values = { availability_zone: pick(ZONES), size: between(8, 500) };
  const unknown = {};
  if (mood === 'unknown') unknown.encrypted = true;
  else values.encrypted = mood === 'on';
  return [{ type: 'aws_ebs_volume', name, values, unknown }];
}

function server() {
  const name = uniq('app');
  const mood = pick(['on', 'off', 'absent']);
  const values = { ami: `ami-${String(between(1e5, 9e5))}0000000000`, instance_type: pick(['t3.small', 't3.medium', 'm5.large']) };
  if (mood !== 'absent') values.root_block_device = [{ encrypted: mood === 'on', volume_size: between(20, 200) }];
  return [{ type: 'aws_instance', name, values }];
}

function database() {
  const name = uniq('db');
  const values = {
    engine: pick(['postgres', 'mysql', 'sqlserver-ex']),
    instance_class: pick(['db.t3.micro', 'db.t3.medium', 'db.m5.large']),
    allocated_storage: between(20, 500),
  };
  const unknown = {};
  if (chance(0.15)) unknown.storage_encrypted = true;
  else values.storage_encrypted = chance(0.6);
  if (chance(0.15)) unknown.publicly_accessible = true;
  else values.publicly_accessible = chance(0.4);
  return [{ type: 'aws_db_instance', name, values, unknown }];
}

function network(withFlowLog, logsBucket) {
  const name = uniq('vpc');
  const out = [{ type: 'aws_vpc', name, values: { cidr_block: `10.${between(0, 250)}.0.0/16` } }];
  if (withFlowLog) {
    out.push({
      type: 'aws_flow_log',
      name,
      values: { traffic_type: pick(['ALL', 'REJECT']), log_destination_type: 's3' },
      unknown: { vpc_id: true, log_destination: true },
      refs: { vpc_id: [`aws_vpc.${name}.id`], log_destination: [`aws_s3_bucket.${logsBucket}.arn`] },
    });
  }
  return out;
}

function firewall(vpcName) {
  const name = uniq('sg');
  const style = pick(['inline', 'rule', 'modern']);
  const port = pick([22, 3389, 443, 80, 8080]);
  const source = chance(0.45) ? pick(WORLD) : pick(OFFICE);
  const wideOpen = chance(0.18);

  if (style === 'inline') {
    const ingress = [{
      from_port: wideOpen ? 0 : port,
      to_port: wideOpen ? 0 : port,
      protocol: wideOpen ? '-1' : 'tcp',
      cidr_blocks: source.includes(':') ? [] : [source],
      ipv6_cidr_blocks: source.includes(':') ? [source] : [],
    }];
    if (chance(0.4)) {
      ingress.push({ from_port: 443, to_port: 443, protocol: 'tcp', cidr_blocks: ['0.0.0.0/0'], ipv6_cidr_blocks: [] });
    }
    return [{
      type: 'aws_security_group',
      name,
      values: { name: name.replace(/_/g, '-'), ingress },
      unknown: { vpc_id: true },
      refs: { vpc_id: [`aws_vpc.${vpcName}.id`] },
    }];
  }
  if (style === 'rule') {
    return [{
      type: 'aws_security_group_rule',
      name,
      values: {
        type: chance(0.85) ? 'ingress' : 'egress',
        protocol: wideOpen ? '-1' : 'tcp',
        from_port: wideOpen ? 0 : port,
        to_port: wideOpen ? 0 : between(port, port + between(0, 40)),
        [source.includes(':') ? 'ipv6_cidr_blocks' : 'cidr_blocks']: [source],
      },
      unknown: chance(0.1) ? { cidr_blocks: true } : {},
    }];
  }
  return [{
    type: 'aws_vpc_security_group_ingress_rule',
    name,
    values: {
      ip_protocol: wideOpen ? '-1' : 'tcp',
      from_port: wideOpen ? 0 : port,
      to_port: wideOpen ? 0 : port,
      [source.includes(':') ? 'cidr_ipv6' : 'cidr_ipv4']: source,
    },
  }];
}

function trail(logsBucket) {
  return [{
    type: 'aws_cloudtrail',
    name: uniq('trail'),
    values: {
      name: 'account-activity',
      is_multi_region_trail: chance(0.6),
      enable_log_file_validation: chance(0.6),
    },
    unknown: { s3_bucket_name: true },
    refs: { s3_bucket_name: [`aws_s3_bucket.${logsBucket}.id`] },
  }];
}

function policy() {
  const name = uniq('policy');
  const mood = pick(['wildcard', 'scoped', 'deny-wildcard', 'service-wide', 'unreadable', 'unknown']);
  if (mood === 'unknown') return [{ type: 'aws_iam_policy', name, values: {}, unknown: { policy: true } }];
  if (mood === 'unreadable') return [{ type: 'aws_iam_policy', name, values: { policy: '{ not json' } }];

  const statement =
    mood === 'wildcard' ? { Effect: 'Allow', Action: '*', Resource: '*' }
    : mood === 'deny-wildcard' ? { Effect: 'Deny', Action: '*', Resource: '*' }
    : mood === 'service-wide' ? { Effect: 'Allow', Action: 's3:*', Resource: '*' }
    : { Effect: 'Allow', Action: ['s3:GetObject', 's3:PutObject'], Resource: 'arn:aws:s3:::acme/*' };

  return [{
    type: pick(['aws_iam_policy', 'aws_iam_role_policy', 'aws_iam_user_policy']),
    name,
    values: { name: name.replace(/_/g, '-'), policy: JSON.stringify({ Version: '2012-10-17', Statement: [statement] }) },
  }];
}

function loadBalancer() {
  const name = uniq('lb');
  const out = [{ type: 'aws_lb', name, values: { name: name.replace(/_/g, '-'), load_balancer_type: 'application' } }];
  const refs = { load_balancer_arn: [`aws_lb.${name}.arn`] };
  const mood = pick(['plain-http', 'redirect', 'https', 'tcp']);

  if (mood === 'plain-http') {
    out.push({ type: 'aws_lb_listener', name: uniq('http'), values: { port: 80, protocol: 'HTTP', default_action: [{ type: 'forward' }] }, refs, unknown: { load_balancer_arn: true } });
  } else if (mood === 'redirect') {
    out.push({ type: 'aws_lb_listener', name: uniq('http'), values: { port: 80, protocol: 'HTTP', default_action: [{ type: 'redirect', redirect: [{ port: '443', protocol: 'HTTPS', status_code: 'HTTP_301' }] }] }, refs, unknown: { load_balancer_arn: true } });
  } else if (mood === 'https') {
    out.push({ type: 'aws_lb_listener', name: uniq('https'), values: { port: 443, protocol: 'HTTPS', default_action: [{ type: 'forward' }] }, refs, unknown: { load_balancer_arn: true, certificate_arn: true } });
  } else {
    out.push({ type: 'aws_lb_listener', name: uniq('tcp'), values: { port: between(1000, 9000), protocol: 'TCP', default_action: [{ type: 'forward' }] }, refs, unknown: { load_balancer_arn: true } });
  }
  return out;
}

// Resources the checks ignore, so a generated plan is not suspiciously tidy.
function noise(vpcName) {
  return [{
    type: pick(['aws_subnet', 'aws_lb_target_group', 'aws_route_table', 'aws_iam_role']),
    name: uniq('extra'),
    values: { cidr_block: `10.0.${between(1, 250)}.0/24` },
    unknown: { vpc_id: true },
    refs: { vpc_id: [`aws_vpc.${vpcName}.id`] },
  }];
}

// ---------- Assembling one plan ----------

export function randomPlan() {
  counter = 0;
  const resources = [];

  const logsBucket = 'logs_store';
  resources.push({ type: 'aws_s3_bucket', name: logsBucket, values: { bucket: 'acme-logs' } });

  for (let i = 0; i < between(1, 3); i += 1) resources.push(...storage());
  for (let i = 0; i < between(0, 3); i += 1) resources.push(...disk());
  for (let i = 0; i < between(0, 2); i += 1) resources.push(...server());
  for (let i = 0; i < between(0, 2); i += 1) resources.push(...database());

  const vpcs = between(1, 2);
  const vpcNames = [];
  for (let i = 0; i < vpcs; i += 1) {
    const made = network(chance(0.5), logsBucket);
    vpcNames.push(made[0].name);
    resources.push(...made);
  }
  const vpcName = vpcNames[0];

  for (let i = 0; i < between(1, 4); i += 1) resources.push(...firewall(vpcName));
  if (chance(0.6)) resources.push(...trail(logsBucket));
  for (let i = 0; i < between(0, 3); i += 1) resources.push(...policy());
  for (let i = 0; i < between(0, 2); i += 1) resources.push(...loadBalancer());
  for (let i = 0; i < between(0, 4); i += 1) resources.push(...noise(vpcName));

  // Some real plans put resources inside modules; exercise that path too.
  if (chance(0.35)) {
    const moduleName = pick(['network', 'storage', 'platform']);
    for (const r of resources) if (chance(0.4)) r.module = moduleName;
  }

  return makePlan(resources);
}

// ---------- Command line ----------

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : (process.argv[i + 1] ?? true);
}

async function main() {
  const seedArg = arg('--seed');
  const seed = seedArg === null ? (Date.now() & 0xffffffff) : Number(seedArg);
  random = rng(seed);

  const fuzz = arg('--fuzz');
  if (fuzz !== null) {
    const { parsePlanText } = await import('../src/parser.js');
    const { buildReport } = await import('../src/report.js');
    const runs = Number(fuzz) || 100;
    const tally = { fail: 0, unknown: 0, pass: 0, na: 0 };
    let failures = 0;

    for (let i = 0; i < runs; i += 1) {
      const plan = randomPlan();
      try {
        const report = buildReport(parsePlanText(JSON.stringify(plan)).resources);
        for (const check of report.checks) {
          tally[check.status] += 1;
          // Every finding must carry a sentence, not a bare reason code.
          for (const f of check.findings) {
            if (!f.text || f.text === f.reason) throw new Error(`${check.id}: no wording for "${f.reason}"`);
          }
        }
      } catch (error) {
        failures += 1;
        console.error(`run ${i + 1} failed: ${error.message}`);
        writeFileSync(`failing-plan-${i + 1}.json`, JSON.stringify(plan, null, 2));
        console.error(`  plan written to failing-plan-${i + 1}.json`);
        if (failures >= 5) break;
      }
    }

    const checksRun = runs * 10;
    console.log(`\n${runs} random plans, ${checksRun} checks run, seed ${seed}`);
    for (const [status, n] of Object.entries(tally)) {
      console.log(`  ${status.padEnd(8)} ${String(n).padStart(5)}  ${((n / checksRun) * 100).toFixed(1)}%`);
    }
    console.log(failures === 0 ? '\nNo crashes, and every finding had wording.' : `\n${failures} failure(s). See failing-plan-*.json`);
    process.exit(failures === 0 ? 0 : 1);
  }

  const plan = randomPlan();
  const json = `${JSON.stringify(plan, null, 2)}\n`;
  const out = arg('--out');

  if (out && out !== true) {
    writeFileSync(out, json);
    console.log(`wrote ${out} (seed ${seed}, ${plan.planned_values.root_module.resources.length} root resources)`);
  } else if (arg('--check') === null) {
    process.stdout.write(json);
  }

  if (arg('--check') !== null) {
    const { parsePlanText } = await import('../src/parser.js');
    const { buildReport } = await import('../src/report.js');
    const report = buildReport(parsePlanText(json).resources);
    console.log(`seed ${seed}: ${report.passed} of ${report.applicable} passed`);
    for (const check of report.checks) {
      console.log(`  ${check.status.padEnd(8)} ${String(check.number).padStart(2)}. ${check.title}`);
    }
  }
}

main();
