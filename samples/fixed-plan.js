// Sample plan that passes all ten checks. Mirrors fixtures/fixed/main.tf.
import { makePlan } from './make-plan.js';

const block = (name) => ({
  type: 'aws_s3_bucket_public_access_block',
  name,
  values: {
    block_public_acls: true,
    block_public_policy: true,
    ignore_public_acls: true,
    restrict_public_buckets: true,
  },
  unknown: { bucket: true },
  refs: { bucket: [`aws_s3_bucket.${name}.id`, `aws_s3_bucket.${name}`] },
});

export default makePlan([
  { type: 'aws_s3_bucket', name: 'drawings', values: { bucket: 'acme-drawings-archive' } },
  block('drawings'),
  { type: 'aws_s3_bucket', name: 'logs', values: { bucket: 'acme-logs' } },
  block('logs'),

  { type: 'aws_ebs_volume', name: 'data', values: { availability_zone: 'us-east-1a', size: 200, encrypted: true } },
  {
    type: 'aws_instance',
    name: 'app',
    values: {
      ami: 'ami-00000000000000000',
      instance_type: 't3.medium',
      root_block_device: [{ encrypted: true, volume_size: 50 }],
    },
  },

  {
    type: 'aws_db_instance',
    name: 'orders',
    values: {
      engine: 'postgres',
      instance_class: 'db.t3.medium',
      allocated_storage: 100,
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
    refs: { vpc_id: ['aws_vpc.main.id', 'aws_vpc.main'], log_destination: ['aws_s3_bucket.logs.arn', 'aws_s3_bucket.logs'] },
  },
  {
    type: 'aws_security_group',
    name: 'admin',
    values: {
      name: 'admin-access',
      ingress: [
        { from_port: 22, to_port: 22, protocol: 'tcp', cidr_blocks: ['203.0.113.10/32'], ipv6_cidr_blocks: [] },
      ],
    },
    unknown: { vpc_id: true },
    refs: { vpc_id: ['aws_vpc.main.id', 'aws_vpc.main'] },
  },
  {
    type: 'aws_security_group',
    name: 'web',
    values: {
      name: 'web',
      ingress: [{ from_port: 443, to_port: 443, protocol: 'tcp', cidr_blocks: ['0.0.0.0/0'], ipv6_cidr_blocks: [] }],
    },
    unknown: { vpc_id: true },
    refs: { vpc_id: ['aws_vpc.main.id', 'aws_vpc.main'] },
  },

  {
    type: 'aws_cloudtrail',
    name: 'main',
    values: { name: 'account-activity', is_multi_region_trail: true, enable_log_file_validation: true },
    unknown: { s3_bucket_name: true },
    refs: { s3_bucket_name: ['aws_s3_bucket.logs.id', 'aws_s3_bucket.logs'] },
  },

  {
    type: 'aws_iam_policy',
    name: 'ops',
    values: {
      name: 'ops-drawings',
      policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['s3:GetObject', 's3:PutObject'],
            Resource: 'arn:aws:s3:::acme-drawings-archive/*',
          },
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
    unknown: { load_balancer_arn: true },
    refs: { load_balancer_arn: ['aws_lb.web.arn', 'aws_lb.web'] },
  },
]);
