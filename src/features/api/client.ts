/**
 * Thin HTTP client used by the store and the SDLC dashboard.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEMO SCENARIO: "api" — Priority P1 / Risk MEDIUM  →  HUMAN-GATE LANE
 * ─────────────────────────────────────────────────────────────────────────────
 * This module contains intentional, realistic reliability defects used by the
 * Agentic SDLC demo. It is shared by every feature, so a careless change here
 * degrades the whole product — medium risk, and owned in `.github/CODEOWNERS`.
 *
 * The defects:
 *   1. No timeout, so a hanging server hangs the UI forever.
 *   2. No retry or backoff on transient 5xx / 429 responses.
 *   3. `fetchAllPages` only ever returns the first page, silently truncating
 *      results.
 *   4. Rate-limit responses are not distinguished from other failures.
 */

export interface RequestOptions {
  /** Optional bearer token; the dashboard uses this to raise the rate limit. */
  token?: string;
  signal?: AbortSignal;
  /** Milliseconds before the request should be abandoned. */
  timeoutMs?: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function buildHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Perform a JSON GET.
 *
 * BUG: `timeoutMs` is accepted but never applied, and there is no retry or
 * backoff for transient failures (429 / 502 / 503 / 504). A single blip
 * surfaces as a hard error in the UI.
 */
export async function getJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(url, {
    headers: buildHeaders(options.token),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status, url);
  }

  return (await response.json()) as T;
}

/**
 * Follow RFC 5988 `Link: rel="next"` pagination and return every result.
 *
 * BUG: pagination is never followed. Only the first page is returned, so any
 * caller with more than `per_page` results silently loses data.
 */
export async function fetchAllPages<T>(
  url: string,
  options: RequestOptions = {},
): Promise<T[]> {
  const firstPage = await getJson<T[]>(url, options);
  return firstPage;
}

/** Extract the URL marked `rel="next"` from a Link header, if present. */
export function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/** Whether a status code represents a transient failure worth retrying. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}
