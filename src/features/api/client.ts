/**
 * Thin HTTP client used by the store and the SDLC dashboard.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEMO SCENARIO: "api" — Priority P1 / Risk MEDIUM  →  HUMAN-GATE LANE
 * ─────────────────────────────────────────────────────────────────────────────
 * This module is shared by every feature, so a careless change here degrades
 * the whole product — medium risk, and owned in `.github/CODEOWNERS`.
 */

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 100;
const MAX_PAGES = 100;

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
 * Transient failures (429 / 502 / 503 / 504) are retried with bounded backoff.
 */
export async function getJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { data } = await requestJson<T>(url, options);
  return data;
}

async function requestJson<T>(
  url: string,
  options: RequestOptions,
): Promise<{ data: T; response: Response }> {
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) {
    abort();
  } else {
    options.signal?.addEventListener('abort', abort, { once: true });
  }
  const timeoutId =
    options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetch(url, {
        headers: buildHeaders(options.token),
        signal: controller.signal,
      });

      if (response.ok) {
        return { data: (await response.json()) as T, response };
      }
      if (!isRetryableStatus(response.status) || attempt === MAX_RETRIES) {
        throw new ApiError(`Request failed with status ${response.status}`, response.status, url);
      }

      await wait(RETRY_DELAY_MS * 2 ** attempt, controller.signal);
    }
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    options.signal?.removeEventListener('abort', abort);
  }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(signal.reason ?? new DOMException('The operation was aborted', 'AbortError'));
    };
    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/**
 * Follow RFC 5988 `Link: rel="next"` pagination and return every result.
 *
 * Pagination is capped to prevent a malformed response from looping forever.
 */
export async function fetchAllPages<T>(
  url: string,
  options: RequestOptions = {},
): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = url;

  for (let page = 0; nextUrl; page += 1) {
    if (page === MAX_PAGES) {
      throw new Error(`Pagination exceeded ${MAX_PAGES} pages`);
    }
    const { data, response } = await requestJson<T[]>(nextUrl, options);
    results.push(...data);
    nextUrl = parseNextLink(response.headers.get('Link'));
  }

  return results;
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
