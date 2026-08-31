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

## Hardening applied

The security review in issue #58 found six defects. All six are fixed here and
pinned by `tests/unit/infra.test.ts`, which fails if any of them returns.

| # | Defect | Fix |
|---|---|---|
| 1 | `acl = "public-read"` on the assets bucket | ACL removed; `BucketOwnerEnforced` ownership controls |
| 2 | No `aws_s3_bucket_public_access_block` | Block added on the assets bucket and the logs bucket |
| 3 | No server-side encryption configuration | `AES256` default encryption on both buckets |
| 4 | Bucket policy allows plaintext HTTP | Policy now only denies, on `aws:SecureTransport = false` |
| 5 | Versioning disabled | Versioning `Enabled` |
| 6 | No access logging | `aws_s3_bucket_logging` writing to a private logs bucket |

Nothing grants read access any more. Objects that genuinely have to be public
are meant to be served through a CDN origin access identity, not by opening the
bucket — see the comment above `aws_s3_bucket_policy.assets`.

A human still confirms the blast radius before this merges.
