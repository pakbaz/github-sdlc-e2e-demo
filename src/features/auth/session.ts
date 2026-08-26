/**
 * Session handling for the Nimbus Store account area.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEMO SCENARIO: "auth" — Priority P0 / Risk HIGH  →  HUMAN-GATE LANE
 * ─────────────────────────────────────────────────────────────────────────────
 * This module contains an intentional, realistic authentication defect used by
 * the Agentic SDLC demo. It is both critical *and* high risk: a wrong fix here
 * can silently lock every customer out, or worse, let expired and revoked
 * sessions keep working. Blast radius is the entire user base and there is a
 * real security surface.
 *
 * `.github/CODEOWNERS` maps `src/features/auth/**` to a human owner, so any
 * pull request touching this directory REQUIRES code-owner approval before it
 * can merge. That gate is enforced by the repository ruleset, not by a script.
 *
 * The seeded defect covered expiry enforcement and validation of persisted
 * session state. The regression tests exercise both security boundaries.
 */

export interface Session {
  userId: string;
  token: string;
  /** Unix epoch milliseconds at which this session stops being valid. */
  expiresAt: number;
  issuedAt: number;
  scopes: string[];
}

export const SESSION_TTL_MS = 30 * 60 * 1000;

export function createSession(userId: string, now: number = Date.now()): Session {
  return {
    userId,
    token: `nimbus_${userId}_${now.toString(36)}`,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_MS,
    scopes: ['store:read', 'cart:write'],
  };
}

/**
 * Decide whether a session may be used to authorise a request.
 *
 * A session stops being valid at its expiry time.
 */
export function isSessionValid(session: Session | null, now: number = Date.now()): boolean {
  if (!session) {
    return false;
  }
  if (!session.token || session.token.length === 0) {
    return false;
  }
  return now < session.expiresAt;
}

/**
 * Whether a session grants a scope.
 *
 * Expired sessions never grant scopes.
 */
export function hasScope(session: Session | null, scope: string, now: number = Date.now()): boolean {
  if (!isSessionValid(session, now)) {
    return false;
  }
  return session!.scopes.includes(scope);
}

/** Milliseconds until the session expires; negative once it has expired. */
export function millisUntilExpiry(session: Session, now: number = Date.now()): number {
  return session.expiresAt - now;
}

/**
 * Rehydrate a session from persisted JSON.
 *
 * Malformed persisted state is rejected.
 */
export function parseSession(raw: string | null): Session | null {
  if (!raw) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    return isSession(value) ? value : null;
  } catch {
    return null;
  }
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const session = value as Record<string, unknown>;
  return (
    typeof session.userId === 'string' &&
    typeof session.token === 'string' &&
    typeof session.expiresAt === 'number' &&
    Number.isFinite(session.expiresAt) &&
    typeof session.issuedAt === 'number' &&
    Number.isFinite(session.issuedAt) &&
    Array.isArray(session.scopes) &&
    session.scopes.every((scope) => typeof scope === 'string')
  );
}
