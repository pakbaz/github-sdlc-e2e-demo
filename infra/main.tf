###############################################################################
# Nimbus Store — static site infrastructure
#
# ─────────────────────────────────────────────────────────────────────────────
# DEMO SCENARIO: "infra" — Priority P1 / Risk HIGH  →  HUMAN-GATE LANE
# ─────────────────────────────────────────────────────────────────────────────
# This file contains intentional, realistic infrastructure-as-code defects used
# by the Agentic SDLC demo. It is never applied anywhere — it exists so the demo
# has a credible high-risk change surface.
#
# `.github/CODEOWNERS` maps `infra/**` to a human owner, so any pull request
# touching this directory REQUIRES code-owner approval before it can merge, no
# matter how confident the agent is. An agent silently "fixing" a bucket policy
# and shipping it to production unreviewed is precisely the outcome this demo
# is designed to prevent.
#
# The defects:
#   1. The assets bucket is world-readable (`acl = "public-read"`).
#   2. There is no bucket public-access block.
#   3. Server-side encryption is not configured.
#   4. Plaintext HTTP is allowed — no TLS-only bucket policy.
#   5. Access logging and versioning are both disabled.
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

# BUG: the bucket is public-read and has no public access block, so every
# object placed in it is readable by anyone on the internet.
resource "aws_s3_bucket" "assets" {
  bucket = "nimbus-store-assets-${var.environment}"
  acl    = "public-read"

  tags = {
    Application = "nimbus-store"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# BUG: versioning disabled — an accidental or malicious overwrite is
# unrecoverable.
resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id

  versioning_configuration {
    status = "Disabled"
  }
}

# BUG: this policy permits `s3:GetObject` for everyone and does NOT deny
# requests made over plaintext HTTP (`aws:SecureTransport = false`).
resource "aws_s3_bucket_policy" "assets" {
  bucket = aws_s3_bucket.assets.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.assets.arn}/*"
      }
    ]
  })
}

# BUG: no `aws_s3_bucket_server_side_encryption_configuration` resource exists,
# so objects are stored unencrypted.

# BUG: no `aws_s3_bucket_logging` resource exists, so there is no audit trail
# of who read what.

output "assets_bucket_name" {
  description = "Name of the Nimbus Store assets bucket."
  value       = aws_s3_bucket.assets.bucket
}

output "assets_bucket_domain" {
  description = "Public domain of the assets bucket."
  value       = aws_s3_bucket.assets.bucket_domain_name
}
