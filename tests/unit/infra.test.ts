import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * `infra/main.tf` is never applied, so nothing but this test stands between a
 * well-meaning edit and a world-readable bucket. The assertions below are the
 * six defects the security review found, pinned so they cannot come back.
 */
const tf = readFileSync(resolve(process.cwd(), 'infra/main.tf'), 'utf8');

describe('the assets bucket is not public', () => {
  it('does not set a canned public ACL', () => {
    expect(tf).not.toMatch(/acl\s*=\s*"public-read"/);
    expect(tf).not.toMatch(/acl\s*=\s*"public-read-write"/);
  });

  it('blocks public access on every axis', () => {
    expect(tf).toMatch(/resource\s+"aws_s3_bucket_public_access_block"\s+"assets"/);
    for (const setting of [
      'block_public_acls',
      'block_public_policy',
      'ignore_public_acls',
      'restrict_public_buckets',
    ]) {
      expect(tf).toMatch(new RegExp(`${setting}\\s*=\\s*true`));
    }
  });

  it('does not grant s3:GetObject to everyone', () => {
    expect(tf).not.toMatch(/Effect\s*=\s*"Allow"[\s\S]{0,200}Principal\s*=\s*"\*"/);
  });
});

describe('the bucket policy requires TLS', () => {
  it('denies requests made over plaintext HTTP', () => {
    expect(tf).toMatch(/"aws:SecureTransport"\s*=\s*"false"/);
    expect(tf).toMatch(/Effect\s*=\s*"Deny"/);
  });
});

describe('objects are protected at rest', () => {
  it('configures server-side encryption', () => {
    expect(tf).toMatch(
      /resource\s+"aws_s3_bucket_server_side_encryption_configuration"\s+"assets"/,
    );
    expect(tf).toMatch(/sse_algorithm\s*=\s*"(AES256|aws:kms)"/);
  });

  it('enables versioning so deletes are recoverable', () => {
    expect(tf).toMatch(/status\s*=\s*"Enabled"/);
    expect(tf).not.toMatch(/status\s*=\s*"Disabled"/);
  });

  it('writes access logs to a separate bucket', () => {
    expect(tf).toMatch(/resource\s+"aws_s3_bucket_logging"\s+"assets"/);
    expect(tf).toMatch(/resource\s+"aws_s3_bucket"\s+"logs"/);
  });
});
