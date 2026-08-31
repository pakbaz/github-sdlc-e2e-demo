###############################################################################
# Nimbus Store — static site infrastructure
#
# ─────────────────────────────────────────────────────────────────────────────
# DEMO SCENARIO: "infra" — Priority P1 / Risk HIGH  →  HUMAN-GATE LANE
# ─────────────────────────────────────────────────────────────────────────────
# This file is never applied anywhere — it exists so the demo has a credible
# high-risk change surface.
#
# `.github/CODEOWNERS` maps `infra/**` to a human owner, so any pull request
# touching this directory REQUIRES code-owner approval before it can merge, no
# matter how confident the agent is. An agent silently "fixing" a bucket policy
# and shipping it to production unreviewed is precisely the outcome this demo
# is designed to prevent.
#
# The assets bucket is now private: public access is blocked, the policy denies
# plaintext HTTP, objects are encrypted at rest, versioning is on, and reads are
# logged. Anything that has to be public is served through a CDN origin access
# identity, not by opening the bucket. `tests/unit/infra.test.ts` pins all six.
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

# Private by default. Ownership is enforced so ACLs cannot grant access, and a
# public access block covers every axis AWS offers.
resource "aws_s3_bucket" "assets" {
  bucket = "nimbus-store-assets-${var.environment}"

  tags = {
    Application = "nimbus-store"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_s3_bucket_ownership_controls" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Versioning on, so an accidental or malicious overwrite is recoverable.
resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id

  versioning_configuration {
    status = "Enabled"
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

# Separate bucket for access logs, itself private and encrypted, so reads of the
# assets bucket leave an audit trail.
resource "aws_s3_bucket" "logs" {
  bucket = "nimbus-store-assets-logs-${var.environment}"

  tags = {
    Application = "nimbus-store"
    Environment = var.environment
    ManagedBy   = "terraform"
    Purpose     = "access-logs"
  }
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket = aws_s3_bucket.logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_logging" "assets" {
  bucket = aws_s3_bucket.assets.id

  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "assets/"
}

# Nobody is granted read access here. Objects that have to be public are served
# by the CDN, whose origin access identity is the only reader:
#
#   data "aws_iam_policy_document" ... principals { type = "AWS"
#     identifiers = [aws_cloudfront_origin_access_identity.assets.iam_arn] }
#
# The policy below only ever denies: any request that is not TLS is refused,
# whoever makes it.
resource "aws_s3_bucket_policy" "assets" {
  bucket = aws_s3_bucket.assets.id

  # The public access block must exist before a policy is attached, otherwise a
  # future permissive statement could take effect for a moment.
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
  description = "Domain of the assets bucket, for use as a CDN origin."
  value       = aws_s3_bucket.assets.bucket_domain_name
}
