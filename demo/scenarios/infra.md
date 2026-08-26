Assets bucket is public and allows plaintext HTTP
---
### What is broken?

A security review of `infra/main.tf` found that the product assets bucket is
world-readable and does not require TLS. As written, applying this Terraform
would publish every object in the bucket to the internet over unencrypted
HTTP.

### Reproduction

Read `infra/main.tf`:

1. The bucket ACL is `public-read`.
2. There is no `aws_s3_bucket_public_access_block` resource at all.
3. The bucket policy grants `s3:GetObject` to `*` with no
   `aws:SecureTransport` condition, so plaintext HTTP is allowed.
4. Server-side encryption is not configured.
5. Versioning is `Disabled`, so an accidental or malicious delete is
   unrecoverable.
6. There is no access logging, so we would not know if it were abused.

### Expected behaviour

The bucket should block public access, enforce TLS in the policy, enable
server-side encryption, enable versioning, and write access logs. Any object
that genuinely has to be public should be served through a CDN origin access
identity rather than by opening the bucket.

### Customer impact

Broken — a workflow cannot be completed

### Suspected area (optional)

`infra/main.tf`
