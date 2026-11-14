// The two demo environments, defined once.
//
// Everything that shows a sample comes from this file:
//   - samples/insecure-plan.js and samples/fixed-plan.js  (the page's sample buttons)
//   - samples/weak-plan.json and samples/fixed-plan.json  (the files dropped in the demo)
//   - fixtures/insecure and fixtures/fixed                (the Terraform source, kept in step by hand)
//
// The company: a small machine shop holding CUI drawings for a defense prime.
//
// Resource shape is make-plan.js's input: { type, name, values, unknown?, refs?, module? }

export const weak = [
  // 1. Public bucket, and a public access block with every setting off
  { type: 'aws_s3_bucket', name: 'cui_data', values: { bucket: 'acme-defense-cui', acl: 'public-read' } },
  {
    type: 'aws_s3_bucket_public_access_block',
    name: 'cui_data',
    values: {
      block_public_acls: false,
      block_public_policy: false,
      ignore_public_acls: false,
      restrict_public_buckets: false,
    },
    refs: { bucket: ['aws_s3_bucket.cui_data.id', 'aws_s3_bucket.cui_data'] },
  },

  // 2. Unencrypted disk
  { type: 'aws_ebs_volume', name: 'app_data', values: { availability_zone: 'us-east-1a', size: 50, encrypted: false } },

  // 3 and 4. Unencrypted database with a public address
  {
    type: 'aws_db_instance',
    name: 'records',
    values: {
      engine: 'postgres',
      instance_class: 'db.t3.medium',
      allocated_storage: 50,
      storage_encrypted: false,
      publicly_accessible: true,
    },
  },

  // 8. Network with no flow log
  { type: 'aws_vpc', name: 'main', values: { cidr_block: '10.0.0.0/16' } },

  // 5. Remote login open to the world
  {
    type: 'aws_security_group',
    name: 'web',
    values: {
      name: 'web-sg',
      ingress: [
        { from_port: 22, to_port: 22, protocol: 'tcp', cidr_blocks: ['0.0.0.0/0'], ipv6_cidr_blocks: [] },
        { from_port: 443, to_port: 443, protocol: 'tcp', cidr_blocks: ['0.0.0.0/0'], ipv6_cidr_blocks: [] },
      ],
    },
    unknown: { vpc_id: true },
    refs: { vpc_id: ['aws_vpc.main.id', 'aws_vpc.main'] },
  },

  // 6. Everything open to the world
  {
    type: 'aws_security_group',
    name: 'legacy',
    values: {
      name: 'legacy-sg',
      ingress: [{ from_port: 0, to_port: 0, protocol: '-1', cidr_blocks: ['0.0.0.0/0'], ipv6_cidr_blocks: [] }],
    },
    unknown: { vpc_id: true },
    refs: { vpc_id: ['aws_vpc.main.id', 'aws_vpc.main'] },
  },

  // 7. No aws_cloudtrail resource at all

  // 9. Blanket admin permissions
  {
    type: 'aws_iam_policy',
    name: 'app',
    values: {
      name: 'app-policy',
      policy: JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: '*', Resource: '*' }] }),
    },
  },

  // 10. Unencrypted web traffic
  { type: 'aws_lb', name: 'web', values: { name: 'web', load_balancer_type: 'application' } },
  {
    type: 'aws_lb_listener',
    name: 'http',
    values: { port: 80, protocol: 'HTTP', default_action: [{ type: 'forward' }] },
    unknown: { load_balancer_arn: true },
    refs: { load_balancer_arn: ['aws_lb.web.arn', 'aws_lb.web'] },
  },
];

export const fixed = [
  { type: 'aws_s3_bucket', name: 'cui_data', values: { bucket: 'acme-defense-cui', acl: 'private' } },
  {
    type: 'aws_s3_bucket_public_access_block',
    name: 'cui_data',
    values: {
      bucket: 'acme-defense-cui',
      block_public_acls: true,
      block_public_policy: true,
      ignore_public_acls: true,
      restrict_public_buckets: true,
    },
    refs: { bucket: ['aws_s3_bucket.cui_data.id', 'aws_s3_bucket.cui_data'] },
  },
  {
    type: 'aws_s3_bucket_server_side_encryption_configuration',
    name: 'cui_data',
    values: { bucket: 'acme-defense-cui' },
    refs: { bucket: ['aws_s3_bucket.cui_data.id', 'aws_s3_bucket.cui_data'] },
  },

  { type: 'aws_s3_bucket', name: 'logs', values: { bucket: 'acme-defense-logs' } },
  {
    type: 'aws_s3_bucket_public_access_block',
    name: 'logs',
    values: {
      bucket: 'acme-defense-logs',
      block_public_acls: true,
      block_public_policy: true,
      ignore_public_acls: true,
      restrict_public_buckets: true,
    },
    refs: { bucket: ['aws_s3_bucket.logs.id', 'aws_s3_bucket.logs'] },
  },

  { type: 'aws_ebs_volume', name: 'app_data', values: { availability_zone: 'us-east-1a', size: 50, encrypted: true } },

  {
    type: 'aws_db_instance',
    name: 'records',
    values: {
      engine: 'postgres',
      instance_class: 'db.t3.medium',
      allocated_storage: 50,
      storage_encrypted: true,
      publicly_accessible: false,
    },
  },

  { type: 'aws_vpc', name: 'main', values: { cidr_block: '10.0.0.0/16' } },
  {
    type: 'aws_flow_log',
    name: 'main',
    values: { traffic_type: 'ALL', log_destination_type: 's3' },
    unknown: { vpc_id: true, log_destination: true },
    refs: {
      vpc_id: ['aws_vpc.main.id', 'aws_vpc.main'],
      log_destination: ['aws_s3_bucket.logs.arn', 'aws_s3_bucket.logs'],
    },
  },

  {
    type: 'aws_security_group',
    name: 'web',
    values: {
      name: 'web-sg',
      ingress: [
        { from_port: 22, to_port: 22, protocol: 'tcp', cidr_blocks: ['10.0.0.0/16'], ipv6_cidr_blocks: [] },
        { from_port: 443, to_port: 443, protocol: 'tcp', cidr_blocks: ['0.0.0.0/0'], ipv6_cidr_blocks: [] },
      ],
    },
    unknown: { vpc_id: true },
    refs: { vpc_id: ['aws_vpc.main.id', 'aws_vpc.main'] },
  },

  {
    type: 'aws_cloudtrail',
    name: 'main',
    values: { name: 'org-trail', is_multi_region_trail: true, enable_log_file_validation: true },
    unknown: { s3_bucket_name: true },
    refs: { s3_bucket_name: ['aws_s3_bucket.logs.id', 'aws_s3_bucket.logs'] },
  },

  {
    type: 'aws_iam_policy',
    name: 'app',
    values: {
      name: 'app-policy',
      policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          { Effect: 'Allow', Action: ['s3:GetObject', 's3:PutObject'], Resource: 'arn:aws:s3:::acme-defense-cui/*' },
        ],
      }),
    },
  },

  { type: 'aws_lb', name: 'web', values: { name: 'web', load_balancer_type: 'application' } },
  {
    type: 'aws_lb_listener',
    name: 'http',
    values: {
      port: 80,
      protocol: 'HTTP',
      default_action: [{ type: 'redirect', redirect: [{ port: '443', protocol: 'HTTPS', status_code: 'HTTP_301' }] }],
    },
    unknown: { load_balancer_arn: true },
    refs: { load_balancer_arn: ['aws_lb.web.arn', 'aws_lb.web'] },
  },
  {
    type: 'aws_lb_listener',
    name: 'https',
    values: { port: 443, protocol: 'HTTPS', default_action: [{ type: 'forward' }] },
    unknown: { load_balancer_arn: true, certificate_arn: true },
    refs: { load_balancer_arn: ['aws_lb.web.arn', 'aws_lb.web'] },
  },
];
