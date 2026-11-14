// Sample plan that fails all ten checks. Mirrors fixtures/insecure/main.tf.
import { makePlan } from './make-plan.js';

export default makePlan([
  { type: 'aws_s3_bucket', name: 'drawings', values: { bucket: 'acme-drawings-archive' } },
  {
    type: 'aws_s3_bucket_acl',
    name: 'drawings',
    values: { acl: 'public-read' },
    unknown: { bucket: true },
    refs: { bucket: ['aws_s3_bucket.drawings.id', 'aws_s3_bucket.drawings'] },
  },
  { type: 'aws_s3_bucket', name: 'logs', values: { bucket: 'acme-logs' } },

  { type: 'aws_ebs_volume', name: 'data', values: { availability_zone: 'us-east-1a', size: 200, encrypted: false } },
  {
    type: 'aws_instance',
    name: 'app',
    values: {
      ami: 'ami-00000000000000000',
      instance_type: 't3.medium',
      root_block_device: [{ encrypted: false, volume_size: 50 }],
    },
  },

  {
    type: 'aws_db_instance',
    name: 'orders',
    values: {
      engine: 'postgres',
      instance_class: 'db.t3.medium',
      allocated_storage: 100,
      storage_encrypted: false,
      publicly_accessible: true,
    },
  },

  { type: 'aws_vpc', name: 'main', values: { cidr_block: '10.0.0.0/16' } },
  {
    type: 'aws_security_group',
    name: 'admin',
    values: {
      name: 'admin-access',
      ingress: [
        { from_port: 22, to_port: 22, protocol: 'tcp', cidr_blocks: ['0.0.0.0/0'], ipv6_cidr_blocks: [] },
        { from_port: 3389, to_port: 3389, protocol: 'tcp', cidr_blocks: ['0.0.0.0/0'], ipv6_cidr_blocks: [] },
      ],
    },
    unknown: { vpc_id: true },
    refs: { vpc_id: ['aws_vpc.main.id', 'aws_vpc.main'] },
  },
  {
    type: 'aws_security_group',
    name: 'legacy',
    values: {
      name: 'legacy-allow-all',
      ingress: [{ from_port: 0, to_port: 0, protocol: '-1', cidr_blocks: ['0.0.0.0/0'], ipv6_cidr_blocks: [] }],
    },
    unknown: { vpc_id: true },
    refs: { vpc_id: ['aws_vpc.main.id', 'aws_vpc.main'] },
  },

  {
    type: 'aws_iam_policy',
    name: 'ops',
    values: {
      name: 'ops-everything',
      policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Action: '*', Resource: '*' }],
      }),
    },
  },

  { type: 'aws_lb', name: 'web', values: { name: 'web', load_balancer_type: 'application' } },
  {
    type: 'aws_lb_listener',
    name: 'http',
    values: { port: 80, protocol: 'HTTP', default_action: [{ type: 'forward' }] },
    unknown: { load_balancer_arn: true },
    refs: { load_balancer_arn: ['aws_lb.web.arn', 'aws_lb.web'] },
  },
]);
