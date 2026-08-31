import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Terraform in `infra/` is never applied, so nothing else in this repository
 * would notice if the assets bucket went back to being world-readable. These
 * tests read the file as text and pin the security properties a reviewer
 * checks by eye: no public ACL, public access blocked, TLS enforced,
 * encryption at rest, versioning, and access logging.
 *
 * DEMO NOTE: text assertions, not a Terraform plan — the demo runner has no
 * AWS credentials and no terraform binary.
 */
const terraform = readFileSync(resolve(process.cwd(), 'infra/main.tf'), 'utf8');

/** The body of a `resource "<type>" "<name>" { ... }` block, or null. */
function resourceBlock(type: string, name: string): string | null {
  const header = `resource "${type}" "${name}"`;
  const start = terraform.indexOf(header);
  if (start < 0) return null;

  let depth = 0;
  for (let i = terraform.indexOf('{', start); i < terraform.length; i += 1) {
    if (terraform[i] === '{') depth += 1;
    if (terraform[i] === '}') {
      depth -= 1;
      if (depth === 0) return terraform.slice(start, i + 1);
    }
  }
  return null;
}

describe('the assets bucket is not public', () => {
  it('grants no canned public ACL', () => {
    expect(terraform).not.toMatch(/acl\s*=\s*"public-read/);
    expect(terraform).not.toMatch(/acl\s*=\s*"authenticated-read"/);
  });

  it('blocks public access on every bucket', () => {
    for (const bucket of ['assets', 'logs']) {
      const block = resourceBlock('aws_s3_bucket_public_access_block', bucket);
      expect(block, `${bucket} has no public access block`).not.toBeNull();

      for (const setting of [
        'block_public_acls',
        'block_public_policy',
        'ignore_public_acls',
        'restrict_public_buckets',
      ]) {
        expect(block!, `${bucket}.${setting}`).toMatch(
          new RegExp(`${setting}\\s*=\\s*true`),
        );
      }
    }
  });

  it('does not allow s3:GetObject to everyone', () => {
    const policy = resourceBlock('aws_s3_bucket_policy', 'assets') ?? '';
    expect(policy).not.toMatch(/Sid\s*=\s*"PublicReadGetObject"/);
    expect(policy).not.toMatch(/Effect\s*=\s*"Allow"[\s\S]{0,120}Principal\s*=\s*"\*"/);
  });
});

describe('the assets bucket policy denies plaintext HTTP', () => {
  const policy = resourceBlock('aws_s3_bucket_policy', 'assets') ?? '';

  it('has an explicit deny for aws:SecureTransport = false', () => {
    expect(policy).toMatch(/Effect\s*=\s*"Deny"/);
    expect(policy).toMatch(/"aws:SecureTransport"\s*=\s*"false"/);
  });

  it('denies every action on the bucket and its objects', () => {
    expect(policy).toMatch(/Action\s*=\s*"s3:\*"/);
    expect(policy).toContain('aws_s3_bucket.assets.arn');
  });
});

describe('the assets bucket is durable and auditable', () => {
  it('enables versioning', () => {
    const versioning = resourceBlock('aws_s3_bucket_versioning', 'assets');
    expect(versioning).not.toBeNull();
    expect(versioning!).toMatch(/status\s*=\s*"Enabled"/);
    expect(versioning!).not.toMatch(/status\s*=\s*"(Disabled|Suspended)"/);
  });

  it('encrypts objects at rest', () => {
    const sse = resourceBlock(
      'aws_s3_bucket_server_side_encryption_configuration',
      'assets',
    );
    expect(sse).not.toBeNull();
    expect(sse!).toMatch(/sse_algorithm\s*=\s*"(AES256|aws:kms)"/);
  });

  it('writes access logs to a separate bucket', () => {
    const logging = resourceBlock('aws_s3_bucket_logging', 'assets');
    expect(logging).not.toBeNull();
    expect(logging!).toContain('aws_s3_bucket.logs');
  });
});
