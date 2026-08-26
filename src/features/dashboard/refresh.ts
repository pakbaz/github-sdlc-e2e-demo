/**
 * How often the control tower is allowed to ask GitHub for a new snapshot.
 *
 * This exists because the obvious implementation — poll every 20 seconds —
 * quietly breaks the demo. Anonymous GitHub API callers get 60 requests an
 * hour and one snapshot costs four of them, so a fixed 20s poll burns the
 * entire budget in about four minutes. The board then goes dark, roughly ten
 * minutes into a sixty-minute session, which is exactly when the audience
 * starts watching it.
 */

export const REFRESH_MS = 20_000;
export const MAX_REFRESH_MS = 5 * 60_000;

/**
 * Rate-limited requests per snapshot. `/rate_limit` is free and not counted.
 */
export const REQUESTS_PER_LOAD = 4;

export interface Budget {
  remaining: number | null;
  resetAt: Date | null;
}

/**
 * Spread whatever budget is left evenly over the time until it resets.
 *
 * With a token (5,000/hour) there is far more budget than the floor requires,
 * so this returns {@link REFRESH_MS} and the board stays live. Anonymous, it
 * backs off on its own instead of failing — slower, but never dark.
 */
export function refreshIntervalMs(budget: Budget | undefined, now: number = Date.now()): number {
  const remaining = budget?.remaining;
  const resetAt = budget?.resetAt;
  if (remaining == null || !resetAt) return REFRESH_MS;

  const msUntilReset = Math.max(0, resetAt.getTime() - now);
  const loadsAffordable = Math.floor(remaining / REQUESTS_PER_LOAD);

  // Nothing left to spend: wait for the window to roll over.
  if (loadsAffordable < 1) return Math.max(REFRESH_MS, msUntilReset);

  const spaced = msUntilReset / loadsAffordable;
  return Math.min(MAX_REFRESH_MS, Math.max(REFRESH_MS, spaced));
}

/** "20s" / "4m" — for the budget line in the UI. */
export function describeInterval(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}
