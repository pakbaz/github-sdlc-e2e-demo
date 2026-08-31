# `infra/` — high-risk change surface

Terraform describing where Nimbus Store assets would live. **Nothing in this
directory is ever applied.** It exists so the Agentic SDLC demo has a realistic
*high-risk* change surface alongside its low-risk UI surface.

## Why this directory is gated

`.github/CODEOWNERS` maps `infra/**` to a human owner. The `main` branch ruleset
requires code-owner review, so **any** pull request touching this directory is
blocked until a human approves it — including pull requests opened by the
Copilot coding agent.

That is the point of the demo: agents are trusted to *propose* infrastructure
changes, never to *ship* them unreviewed.

## What the configuration does

| Control | How |
|---|---|
| No public access | `aws_s3_bucket_public_access_block` on both buckets, all four settings `true`; ACLs disabled with `BucketOwnerEnforced` |
| TLS only | Bucket policy denies `s3:*` when `aws:SecureTransport` is `false` |
| Encryption at rest | `aws_s3_bucket_server_side_encryption_configuration` with `AES256` |
| Recoverable objects | Versioning `Enabled` |
| Audit trail | `aws_s3_bucket_logging` writes to a separate log bucket |

Objects that genuinely have to be public are served through a CDN origin
access identity, never by opening the bucket.

`tests/unit/infra.test.ts` reads `main.tf` and asserts each of those controls,
so a future edit cannot quietly make the bucket public again.
