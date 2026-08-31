###############################################################################
# Nimbus Store — static site infrastructure
#
# ─────────────────────────────────────────────────────────────────────────────
# DEMO SCENARIO: "infra" — Priority P1 / Risk HIGH  →  HUMAN-GATE LANE
# ─────────────────────────────────────────────────────────────────────────────
# This file is never applied anywhere. It exists so the Agentic SDLC demo has a
# credible high-risk change surface.
#
# `.github/CODEOWNERS` maps `infra/**` to a human owner, so any pull request
# touching this directory REQUIRES code-owner approval before it can merge, no
# matter how confident the agent is. An agent silently "fixing" a bucket policy
# and shipping it to production unreviewed is precisely the outcome this demo
# is designed to prevent.
#
# The assets bucket is private: public access is blocked, the policy denies
# plaintext HTTP, objects are encrypted at rest, versioning is on, and reads
# are logged to a separate bucket. Anything that genuinely has to be public is
# served through a CDN origin access identity, never by opening the bucket.
# `tests/unit/infra.test.ts` pins each of those properties.
###############################################################################

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  description = "Region hosting the Nimbus Store assets."
  type        = string
  default     = "us-west-2"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "production"
}

locals {
  tags = {
    Application = "nimbus-store"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

data "aws_caller_identity" "current" {}

###############################################################################
# Access log bucket
###############################################################################

resource "aws_s3_bucket" "logs" {
  bucket = "nimbus-store-assets-logs-${var.environment}"

  tags = local.tags
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket = aws_s3_bucket.logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "logs" {
  bucket = aws_s3_bucket.logs.id

  versioning_configuration {
    status = "Enabled"
  }
}

# ACLs are disabled on the log bucket, so S3 server access logging delivers
# through the service principal instead of the log-delivery ACL group.
resource "aws_s3_bucket_policy" "logs" {
  bucket = aws_s3_bucket.logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowServerAccessLogDelivery"
        Effect = "Allow"
        Principal = {
          Service = "logging.s3.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.logs.arn}/assets/*"
        Condition = {
          ArnLike = {
            "aws:SourceArn" = aws_s3_bucket.assets.arn
          }
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.logs.arn,
          "${aws_s3_bucket.logs.arn}/*",
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
    ]
  })
}

###############################################################################
# Assets bucket
###############################################################################

resource "aws_s3_bucket" "assets" {
  bucket = "nimbus-store-assets-${var.environment}"

  tags = local.tags
}

# Nothing in the bucket is reachable from the internet. Public objects are
# served through a CDN origin access identity, not by relaxing this block.
resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_logging" "assets" {
  bucket = aws_s3_bucket.assets.id

  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "assets/"
}

# The only statement on the assets bucket is a deny: every request that is not
# made over TLS is rejected, whoever makes it.
resource "aws_s3_bucket_policy" "assets" {
  bucket = aws_s3_bucket.assets.id

  # The public access block must exist first, otherwise a policy naming a `*`
  # principal can be rejected as a public grant.
  depends_on = [aws_s3_bucket_public_access_block.assets]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.assets.arn,
          "${aws_s3_bucket.assets.arn}/*",
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

output "assets_bucket_name" {
  description = "Name of the Nimbus Store assets bucket."
  value       = aws_s3_bucket.assets.bucket
}

output "assets_bucket_domain" {
  description = "Regional domain of the assets bucket. Private — reach it through the CDN."
  value       = aws_s3_bucket.assets.bucket_regional_domain_name
}

output "assets_logs_bucket_name" {
  description = "Bucket receiving server access logs for the assets bucket."
  value       = aws_s3_bucket.logs.bucket
}
