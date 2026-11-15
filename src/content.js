// Plain-English wording for every check. Edit this file to change what the report says;
// no check logic lives here.
//
// Each entry: title, requirements (NIST SP 800-171 Rev 2 numbers), why, limits ("what this
// does not prove"), fix(name) -> Terraform snippet, and messages keyed by a finding's reason.
//
// The requirement numbers are a proposed mapping. Confirm each against the NIST text.

const n = (v) => v.name ?? 'this resource';

export const content = {
  'storage-public': {
    title: 'Storage is not public',
    requirements: ['3.1.22', '3.1.3'],
    why: 'Any file placed in a public bucket, including CUI, can be read by anyone.',
    limits: 'That CUI is stored only in these buckets, or who inside the company can read them.',
    fix: (name) => `resource "aws_s3_bucket_public_access_block" "${name}" {
  bucket                  = aws_s3_bucket.${name}.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# If the bucket already has an aws_s3_bucket_acl set to public-read, change it too.
# This check fails on a public ACL even when the block above is in place.
#   acl = "private"`,
    messages: {
      no_buckets: () => 'This plan contains no storage buckets, so this check was skipped.',
      public_acl: (v) => `The storage bucket "${n(v)}" is set to be readable by anyone on the internet.`,
      no_block: (v) => `The storage bucket "${n(v)}" has no public access block, so it can be made public.`,
      block_incomplete: (v) => `The storage bucket "${n(v)}" has a public access block, but these settings are off: ${v.settings}.`,
      block_unknown: (v) => `We could not tell whether public access is fully blocked on "${n(v)}". The setting is only decided when the plan is applied.`,
      account_block: (v) => `Public access to "${n(v)}" is blocked for the whole account.`,
      blocked: (v) => `Public access is blocked on the storage bucket "${n(v)}".`,
    },
  },

  'disk-encryption': {
    title: 'Disks are encrypted',
    requirements: ['3.13.16'],
    why: 'If a disk or its backup is copied, unencrypted contents can be read directly.',
    limits: 'That the encryption meets the validated-cryptography requirement (3.13.11). An assessor will ask about that separately.',
    fix: (name) => `resource "aws_ebs_volume" "${name}" {
  encrypted = true
}

# For a server's main disk, inside the aws_instance block:
root_block_device {
  encrypted = true
}

# Or turn encryption on for every new disk in the account:
resource "aws_ebs_encryption_by_default" "all" {
  enabled = true
}`,
    messages: {
      no_disks: () => 'This plan contains no disks or servers, so this check was skipped.',
      default_on: () => 'Encryption is turned on by default for every new disk in the account.',
      volume_fail: (v) => `The disk "${n(v)}" stores data unencrypted.`,
      volume_pass: (v) => `The disk "${n(v)}" is encrypted.`,
      root_fail: (v) => `The main disk of the server "${n(v)}" stores data unencrypted.`,
      root_pass: (v) => `The main disk of the server "${n(v)}" is encrypted.`,
      extra_fail: (v) => `The disk ${v.device} on the server "${n(v)}" stores data unencrypted.`,
      extra_pass: (v) => `The disk ${v.device} on the server "${n(v)}" is encrypted.`,
      not_set: (v) => `The plan does not say whether "${n(v)}" is encrypted. It depends on an account setting this plan does not show. Check it in the AWS console.`,
      root_not_set: (v) => `The plan does not say whether the main disk of the server "${n(v)}" is encrypted. It depends on an account setting this plan does not show.`,
    },
  },

  'database-encryption': {
    title: 'Databases are encrypted',
    requirements: ['3.13.16'],
    why: 'Databases are the most likely place for contract and technical data to sit.',
    limits: 'That backups exported outside the database are encrypted. Note that an existing database cannot be switched to encrypted in place; it has to be restored from an encrypted copy.',
    fix: (name) => `resource "aws_db_instance" "${name}" {
  storage_encrypted = true
}`,
    messages: {
      no_databases: () => 'This plan contains no databases, so this check was skipped.',
      not_encrypted: (v) => `The database "${n(v)}" stores data unencrypted.`,
      encrypted: (v) => `The database "${n(v)}" is encrypted.`,
      inherits: (v) => `The database "${n(v)}" is created from a copy, so its encryption follows the original. Check the original.`,
      unknown: (v) => `We could not tell whether the database "${n(v)}" is encrypted. The setting is only decided when the plan is applied.`,
    },
  },

  'database-public': {
    title: 'Databases are not on the internet',
    requirements: ['3.13.1'],
    why: 'A database reachable from the internet can be attacked directly, with only a password in the way.',
    limits: 'That the firewall rules around the database are tight. See the two firewall checks.',
    fix: (name) => `resource "aws_db_instance" "${name}" {
  publicly_accessible = false
}`,
    messages: {
      no_databases: () => 'This plan contains no databases, so this check was skipped.',
      public: (v) => `The database "${n(v)}" has a public internet address.`,
      private: (v) => `The database "${n(v)}" has no public address.`,
      unknown: (v) => `We could not tell whether the database "${n(v)}" has a public address.`,
    },
  },

  'admin-ports': {
    title: 'No remote admin ports open to the world',
    requirements: ['3.13.1', '3.13.6'],
    why: 'Open remote login ports are scanned constantly and are a common way in.',
    limits: 'That remote logins use multi-factor authentication, which is its own requirement (3.5.3).',
    fix: () => `# Do this for port 22 and for port 3389 (remote desktop):
ingress {
  from_port   = 22
  to_port     = 22
  protocol    = "tcp"
  cidr_blocks = ["203.0.113.10/32"] # replace with your office address
}

# Also remove or narrow any rule that allows all protocols from 0.0.0.0/0.
# Such a rule opens ports 22 and 3389 too, so this check keeps failing.`,
    messages: {
      no_firewall: () => 'This plan contains no firewall rules, so this check was skipped.',
      open: (v) => `The firewall rule "${n(v)}" lets anyone on the internet attempt a remote login on port ${v.ports}.`,
      closed: () => 'No firewall rule opens remote login ports (22 or 3389) to the internet.',
      unknown: (v) => `We could not read the rules of "${n(v)}". They are only decided when the plan is applied.`,
    },
  },

  'wide-open-rules': {
    title: 'No wide-open firewall rules',
    requirements: ['3.13.6'],
    why: 'The requirement is to block everything by default and allow only what is needed. A rule that accepts everything does the opposite.',
    limits: 'That each allowed port has a documented business reason. An assessor will ask for that list.',
    fix: () => `ingress {
  from_port   = 443
  to_port     = 443
  protocol    = "tcp"
  cidr_blocks = ["0.0.0.0/0"] # only the ports and addresses that need access
}`,
    messages: {
      no_firewall: () => 'This plan contains no firewall rules, so this check was skipped.',
      wide_open: (v) => `The firewall rule "${n(v)}" accepts traffic from anywhere on every port.`,
      narrow: () => 'No firewall rule accepts all traffic from the internet.',
      unknown: (v) => `We could not read the rules of "${n(v)}". They are only decided when the plan is applied.`,
    },
  },

  'activity-logging': {
    title: 'Activity logging is on and protected',
    requirements: ['3.3.1', '3.3.8'],
    why: 'Without a record of who did what, an incident cannot be investigated or reported.',
    limits: 'That anyone reviews the logs, or how long they are kept. Logging may also be set up outside this plan.',
    fix: () => `resource "aws_cloudtrail" "main" {
  name                       = "account-activity"
  s3_bucket_name             = aws_s3_bucket.logs.id
  is_multi_region_trail      = true
  enable_log_file_validation = true
}`,
    messages: {
      missing: () => 'Nothing in this plan records who did what in the AWS account.',
      weak: (v) => `Activity logging "${n(v)}" is on, but ${v.gaps}.`,
      protected: (v) => `Account activity is logged in every region by "${n(v)}", and the logs are tamper-evident.`,
    },
  },

  'traffic-logging': {
    title: 'Network traffic is logged',
    requirements: ['3.14.6'],
    why: 'Traffic records are how unusual connections and data leaving the network get noticed.',
    limits: 'That the records are monitored or that alerts exist.',
    fix: (name) => `resource "aws_flow_log" "${name}" {
  vpc_id               = aws_vpc.${name}.id
  traffic_type         = "ALL"
  log_destination_type = "s3"
  log_destination      = aws_s3_bucket.logs.arn
}`,
    messages: {
      no_networks: () => 'This plan contains no networks, so this check was skipped.',
      not_logged: (v) => `The network "${n(v)}" keeps no record of the traffic passing through it.`,
      logged: (v) => `Traffic is logged on the network "${n(v)}".`,
    },
  },

  'admin-permissions': {
    title: 'No blanket admin permissions',
    requirements: ['3.1.5'],
    why: 'Anyone or anything holding a policy like this can read, change, or delete everything in the account.',
    limits: "That the remaining policies are as narrow as they should be, or who has AWS's own built-in administrator policy attached.",
    fix: () => `resource "aws_iam_policy" "ops" {
  name = "ops-drawings"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject"]
      Resource = "arn:aws:s3:::your-bucket-name/*"
    }]
  })
}

# Write the bucket name out in full. If the policy refers to another resource
# (such as a bucket's arn), the plan cannot show its text yet and this tool
# will report "could not determine".`,
    messages: {
      no_policies: () => 'This plan contains no permission policies, so this check was skipped.',
      blanket: (v) => `The permission policy "${n(v)}" allows every action on every resource.`,
      scoped: (v) => `None of the ${v.count} permission ${v.count === 1 ? 'policy' : 'policies'} in this plan grants unlimited access.`,
      unknown: (v) => `We could not read the policy "${n(v)}". Its contents are only decided when the plan is applied. This usually means the policy refers to another resource; writing the resource name out in full makes it readable.`,
      unreadable: (v) => `We could not read the policy "${n(v)}". It is not valid JSON.`,
    },
  },

  'transit-encryption': {
    title: 'Traffic is encrypted in transit',
    requirements: ['3.13.8'],
    why: 'Unencrypted traffic can be read by anyone between the user and the server.',
    limits: 'That traffic between internal systems is encrypted.',
    fix: () => `resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.web.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}`,
    messages: {
      no_listeners: () => 'This plan contains no web load balancers, so this check was skipped.',
      plain_http: (v) => `The load balancer listener "${n(v)}" accepts unencrypted web traffic on port ${v.port}.`,
      redirects: (v) => `The listener "${n(v)}" redirects unencrypted traffic to an encrypted connection.`,
      encrypted: (v) => `The listener "${n(v)}" accepts encrypted traffic only.`,
      unknown: (v) => `We could not tell which protocol the listener "${n(v)}" uses.`,
    },
  },
};

export const STATUS_LABEL = {
  fail: 'Needs fixing',
  unknown: 'Could not determine',
  pass: 'Passed',
  na: 'Did not apply',
};

export const DISCLAIMER =
  'CMMC Preflight reviewed 10 technical settings out of the 110 requirements in NIST SP 800-171 Revision 2. ' +
  'It is not a CMMC assessment, does not produce an SPRS score, and a pass here does not mean a requirement is met. ' +
  'It checks what the plan says will be built, not what is running.';
