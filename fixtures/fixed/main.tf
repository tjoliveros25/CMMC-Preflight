# The insecure fixture with every finding fixed. Should pass all ten ReadyCheck checks.
#
# Export it:
#   terraform init
#   terraform plan -out=tfplan
#   terraform show -json tfplan > plan.json
#
# Not yet run. See the note in fixtures/insecure/main.tf about the provider block.

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

# 1. Storage with public access blocked
resource "aws_s3_bucket" "drawings" {
  bucket = "acme-drawings-archive"
}

resource "aws_s3_bucket_public_access_block" "drawings" {
  bucket                  = aws_s3_bucket.drawings.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket" "logs" {
  bucket = "acme-logs"
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket                  = aws_s3_bucket.logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 2. Encrypted disks
resource "aws_ebs_volume" "data" {
  availability_zone = "us-east-1a"
  size              = 200
  encrypted         = true
}

resource "aws_instance" "app" {
  ami           = "ami-00000000000000000"
  instance_type = "t3.medium"

  root_block_device {
    encrypted   = true
    volume_size = 50
  }
}

# 3 and 4. Encrypted database with no public address
resource "aws_db_instance" "orders" {
  engine              = "postgres"
  instance_class      = "db.t3.medium"
  allocated_storage   = 100
  username            = "orders"
  password            = "change-me-placeholder"
  storage_encrypted   = true
  publicly_accessible = false
  skip_final_snapshot = true
}

# 8. Network with traffic logging
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_flow_log" "main" {
  vpc_id               = aws_vpc.main.id
  traffic_type         = "ALL"
  log_destination_type = "s3"
  log_destination      = aws_s3_bucket.logs.arn
}

# 5. Remote login from one office address only
resource "aws_security_group" "admin" {
  name   = "admin-access"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["203.0.113.10/32"]
  }
}

# 6. Only the web port is open to the world
resource "aws_security_group" "web" {
  name   = "web"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# 7. Account activity logging, all regions, tamper-evident
resource "aws_cloudtrail" "main" {
  name                       = "account-activity"
  s3_bucket_name             = aws_s3_bucket.logs.id
  is_multi_region_trail      = true
  enable_log_file_validation = true
}

# 9. Permissions limited to what is needed
resource "aws_iam_policy" "ops" {
  name = "ops-drawings"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject"]
      Resource = "arn:aws:s3:::acme-drawings-archive/*"
    }]
  })
}

# 10. Web traffic encrypted; plain HTTP redirects to HTTPS
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
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.web.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = "arn:aws:acm:us-east-1:000000000000:certificate/00000000-0000-0000-0000-000000000000"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}
