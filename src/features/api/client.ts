/**
 * Thin HTTP client used by the store and the SDLC dashboard.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEMO SCENARIO: "api" — Priority P1 / Risk MEDIUM  →  HUMAN-GATE LANE
 * ─────────────────────────────────────────────────────────────────────────────
 * This module is shared by every feature, so a careless change here degrades
 * the whole product — medium risk, and owned in `.github/CODEOWNERS`.
 *
 * Requests time out for real, transient failures (429 / 502 / 503 / 504) are
 * retried with exponential backoff, and `fetchAllPages` follows RFC 5988
 * `Link: rel="next"` up to `MAX_PAGES`.
 */

export interface RequestOptions {
  /** Optional bearer token; the dashboard uses this to raise the rate limit. */
  token?: string;
  signal?: AbortSignal;
  /** Milliseconds before the request should be abandoned. */
  timeoutMs?: number;
  /** Extra attempts after the first one, for retryable statuses only. */
  retries?: number;
  /** Base backoff between attempts; doubles on every retry. */
  retryDelayMs?: number;
}

/** Defaults chosen so a single blip never surfaces in the UI. */
export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_RETRIES = 2;
export const DEFAULT_RETRY_DELAY_MS = 300;

/** Upper bound on pages followed, so a pathological server cannot loop forever. */
export const MAX_PAGES = 10;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Perform one GET, aborting it for real once `timeoutMs` has elapsed.
 *
 * The caller's own `signal` is honoured too: whichever fires first wins.
 */
async function requestOnce(url: string, options: RequestOptions): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const external = options.signal;
  const forward = () => controller.abort();
  if (external) {
    if (external.aborted) {
      forward();
    } else {
      external.addEventListener('abort', forward);
    }
  }

  try {
    return await fetch(url, { headers: buildHeaders(options.token), signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new ApiError(`Request timed out after ${timeoutMs}ms`, 408, url);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', forward);
  }
}

/** Perform a JSON GET, retrying transient failures with exponential backoff. */
async function getResponse(url: string, options: RequestOptions): Promise<Response> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const baseDelay = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  for (let attempt = 0; ; attempt += 1) {
    const response = await requestOnce(url, options);
    if (response.ok) {
      return response;
    }
    if (attempt < retries && isRetryableStatus(response.status) && !options.signal?.aborted) {
      await sleep(baseDelay * 2 ** attempt);
      continue;
    }
    throw new ApiError(`Request failed with status ${response.status}`, response.status, url);
  }
}

/** Perform a JSON GET. */
export async function getJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const response = await getResponse(url, options);
  return (await response.json()) as T;
}

/**
 * Follow RFC 5988 `Link: rel="next"` pagination and return every result.
 *
 * Stops at `MAX_PAGES` so a server that always advertises a next page cannot
 * spin forever.
 */
export async function fetchAllPages<T>(
  url: string,
  options: RequestOptions = {},
): Promise<T[]> {
  const items: T[] = [];
  let next: string | null = url;

  for (let page = 0; next && page < MAX_PAGES; page += 1) {
    const response: Response = await getResponse(next, options);
    items.push(...((await response.json()) as T[]));
    next = parseNextLink(response.headers.get('Link'));
  }

  return items;
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
