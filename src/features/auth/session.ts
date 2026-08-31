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
 * The former defect: `isSessionValid` did not check `expiresAt`, so an expired
 * session token was accepted indefinitely, and `parseSession` trusted
 * unvalidated input. Both are now enforced below.
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
 * The clock is injectable so expiry is testable. A session stops being valid
 * at the instant it reaches `expiresAt`.
 */
export function isSessionValid(session: Session | null, now: number = Date.now()): boolean {
  if (!session) {
    return false;
  }
  if (!session.token || session.token.length === 0) {
    return false;
  }
  if (!Number.isFinite(session.expiresAt)) {
    return false;
  }
  return now < session.expiresAt;
}

/**
 * Whether a session grants a scope. Expired sessions grant nothing.
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

/** Whether an unknown value has the exact shape of a `Session`. */
function isSessionShape(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.userId === 'string' &&
    typeof candidate.token === 'string' &&
    typeof candidate.issuedAt === 'number' &&
    Number.isFinite(candidate.issuedAt) &&
    typeof candidate.expiresAt === 'number' &&
    Number.isFinite(candidate.expiresAt) &&
    Array.isArray(candidate.scopes) &&
    candidate.scopes.every((scope) => typeof scope === 'string')
  );
}

/**
 * Rehydrate a session from persisted JSON. Anything that does not match the
 * `Session` shape is rejected rather than trusted.
 */
export function parseSession(raw: string | null): Session | null {
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isSessionShape(parsed) ? parsed : null;
}
