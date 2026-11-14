# Deliberately insecure. Fails all ten ReadyCheck checks. Never apply this.
#
# Export it:
#   terraform init
#   terraform plan -out=tfplan
#   terraform show -json tfplan > plan.json
#
# The provider block uses placeholder keys so that `plan` should not need a real AWS
# account. This has not been run; if `plan` asks for credentials, that is the first
# thing to fix.

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region                      = "us-east-1"
  access_key                  = "placeholder"
  secret_key                  = "placeholder"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
}

# 1. Public storage, and no public access block on either bucket
resource "aws_s3_bucket" "cui_data" {
  bucket = "acme-defense-cui"
}

resource "aws_s3_bucket_acl" "cui_data" {
  bucket = aws_s3_bucket.cui_data.id
  acl    = "public-read"
}

resource "aws_s3_bucket" "logs" {
  bucket = "acme-defense-logs"
}

# 2. Unencrypted disks
resource "aws_ebs_volume" "app_data" {
  availability_zone = "us-east-1a"
  size              = 200
  encrypted         = false
}

resource "aws_instance" "app_server" {
  ami           = "ami-00000000000000000"
  instance_type = "t3.medium"

  root_block_device {
    encrypted   = false
    volume_size = 50
  }
}

# 3 and 4. Unencrypted database with a public address
resource "aws_db_instance" "records" {
  engine              = "postgres"
  instance_class      = "db.t3.medium"
  allocated_storage   = 100
  username            = "records"
  password            = "change-me-placeholder"
  storage_encrypted   = false
  publicly_accessible = true
  skip_final_snapshot = true
}

# 8. Network with no flow log
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

# 5. Remote admin ports open to the world
resource "aws_security_group" "admin" {
  name   = "admin-access"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 3389
    to_port     = 3389
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# 6. Everything open to the world
resource "aws_security_group" "legacy" {
  name   = "legacy-allow-all"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# 7. No aws_cloudtrail resource at all

# 9. Blanket admin permissions
resource "aws_iam_policy" "ops" {
  name = "ops-everything"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "*"
      Resource = "*"
    }]
  })
}

# 10. Unencrypted web traffic
resource "aws_subnet" "a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "us-east-1a"
}

resource "aws_subnet" "b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "us-east-1b"
}

resource "aws_lb" "web" {
  name               = "web"
  load_balancer_type = "application"
  subnets            = [aws_subnet.a.id, aws_subnet.b.id]
}

resource "aws_lb_target_group" "web" {
  name     = "web"
  port     = 8080
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.web.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}
