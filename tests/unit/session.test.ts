import { describe, expect, it } from 'vitest';
import {
  createSession,
  hasScope,
  isSessionValid,
  millisUntilExpiry,
  parseSession,
  SESSION_TTL_MS,
  type Session,
} from '../../src/features/auth/session';

const NOW = 1_700_000_000_000;

describe('createSession', () => {
  it('issues a session that expires after the TTL', () => {
    const session = createSession('user-1', NOW);
    expect(session.userId).toBe('user-1');
    expect(session.issuedAt).toBe(NOW);
    expect(session.expiresAt).toBe(NOW + SESSION_TTL_MS);
    expect(session.token).toContain('user-1');
  });
});

describe('isSessionValid', () => {
  it('rejects a missing session', () => {
    expect(isSessionValid(null, NOW)).toBe(false);
  });

  it('rejects a session with no token', () => {
    const session: Session = { ...createSession('user-1', NOW), token: '' };
    expect(isSessionValid(session, NOW)).toBe(false);
  });

  it('accepts a freshly issued session', () => {
    expect(isSessionValid(createSession('user-1', NOW), NOW)).toBe(true);
  });
});

describe('millisUntilExpiry', () => {
  it('is positive before expiry and negative after', () => {
    const session = createSession('user-1', NOW);
    expect(millisUntilExpiry(session, NOW)).toBe(SESSION_TTL_MS);
    expect(millisUntilExpiry(session, NOW + SESSION_TTL_MS + 1)).toBeLessThan(0);
  });
});

describe('hasScope', () => {
  it('grants scopes present on a valid session', () => {
    const session = createSession('user-1', NOW);
    expect(hasScope(session, 'cart:write', NOW)).toBe(true);
  });

  it('denies scopes absent from the session', () => {
    const session = createSession('user-1', NOW);
    expect(hasScope(session, 'admin:write', NOW)).toBe(false);
  });

  it('denies everything for a missing session', () => {
    expect(hasScope(null, 'store:read', NOW)).toBe(false);
  });
});

describe('parseSession', () => {
  it('returns null for empty input', () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession('')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseSession('{not json')).toBeNull();
  });

  it('round-trips a well-formed session', () => {
    const session = createSession('user-1', NOW);
    expect(parseSession(JSON.stringify(session))).toEqual(session);
  });
});

/**
 * DEMO NOTE — the "auth" scenario (P0 / risk HIGH).
 *
 * `isSessionValid` currently ignores `expiresAt` entirely, so an expired
 * session is still accepted. The tests above deliberately do not assert the
 * expiry behaviour, which keeps `main` green while the defect is planted.
 *
 * The seeded issue asks the coding agent to enforce expiry and add regression
 * tests here. Because `src/features/auth/**` has a CODEOWNER, the resulting
 * pull request cannot merge until a human approves it — no matter how good
 * the fix or how green the checks are.
 */
