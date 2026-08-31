import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  fetchAllPages,
  getJson,
  MAX_PAGES,
} from '../../src/features/api/client';

function jsonResponse(body: unknown, init: { status?: number; link?: string } = {}): Response {
  const headers = new Headers();
  if (init.link) {
    headers.set('Link', init.link);
  }
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getJson timeout', () => {
  it('aborts a request that never responds', async () => {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit = {}) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getJson('https://example.test/hang', { timeoutMs: 20 })).rejects.toThrow(
      /timed out/i,
    );
  });

  it('still resolves when the response arrives inside the timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true })));
    await expect(getJson('https://example.test/fast', { timeoutMs: 1000 })).resolves.toEqual({
      ok: true,
    });
  });
});

describe('getJson retries', () => {
  it('retries a transient failure and returns the eventual success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'bad gateway' }, { status: 502 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getJson('https://example.test/flaky', { retryDelayMs: 0 }),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after the retry budget and reports the last status', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getJson('https://example.test/down', { retries: 2, retryDelayMs: 0 }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-retryable status', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getJson('https://example.test/missing', { retryDelayMs: 0 })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('fetchAllPages', () => {
  it('follows Link rel="next" until it is exhausted', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse([1, 2], { link: '<https://example.test/items?page=2>; rel="next"' }),
      )
      .mockResolvedValueOnce(
        jsonResponse([3, 4], { link: '<https://example.test/items?page=3>; rel="next"' }),
      )
      .mockResolvedValueOnce(jsonResponse([5]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAllPages<number>('https://example.test/items')).resolves.toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops at the page cap when a server always advertises a next page', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse([1], { link: '<https://example.test/items?page=next>; rel="next"' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const items = await fetchAllPages<number>('https://example.test/items');
    expect(fetchMock).toHaveBeenCalledTimes(MAX_PAGES);
    expect(items).toHaveLength(MAX_PAGES);
  });
});
