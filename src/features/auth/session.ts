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
 * The defect: `isSessionValid` never checks `expiresAt`, so an expired session
 * token is accepted indefinitely. `parseSession` also trusts unvalidated input.
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
 * BUG: expiry is never evaluated. Any session object that merely *has* a token
 * is treated as valid forever, so revoked or long-expired sessions keep
 * working. The `expiresAt` field is read nowhere in this function.
 */
export function isSessionValid(session: Session | null, _now: number = Date.now()): boolean {
  if (!session) {
    return false;
  }
  if (!session.token || session.token.length === 0) {
    return false;
  }
  return true;
}

/**
 * Whether a session grants a scope.
 *
 * BUG: a session that has expired can still pass this check because it defers
 * entirely to the broken `isSessionValid` above.
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
 * BUG: the parsed value is cast straight to `Session` with no shape validation,
 * so malformed or attacker-controlled storage produces an object that later
 * code trusts.
 */
export function parseSession(raw: string | null): Session | null {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}
