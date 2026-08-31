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

## Planted defects

| # | Defect | Why it matters |
|---|---|---|
| 1 | `acl = "public-read"` on the assets bucket | Every object is world-readable |
| 2 | No `aws_s3_bucket_public_access_block` | Nothing prevents future public grants |
| 3 | No server-side encryption configuration | Objects stored unencrypted at rest |
| 4 | Bucket policy allows plaintext HTTP | No `aws:SecureTransport` deny statement |
| 5 | Versioning disabled | Overwrites are unrecoverable |
| 6 | No access logging | No audit trail of reads |

A coding agent asked to fix these should add a public access block, enable
SSE, add an explicit `Deny` for `aws:SecureTransport = false`, enable
versioning, and add a logging target — then a human confirms the blast radius
before it merges.
