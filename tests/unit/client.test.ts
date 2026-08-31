import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, fetchAllPages, getJson } from '../../src/features/api/client';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('getJson', () => {
  it('aborts a request when its timeout expires', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'));
        });
      });
    });

    const request = getJson('https://api.example.test/hangs', { timeoutMs: 100 });
    const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' });

    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('backs off and retries retryable responses', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));

    const request = getJson<{ ok: boolean }>('https://api.example.test/data');
    await vi.advanceTimersByTimeAsync(100);

    await expect(request).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('bounds retries and does not retry other failures', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 502 }));

    const retryableRequest = getJson('https://api.example.test/retryable');
    const rejection = expect(retryableRequest).rejects.toBeInstanceOf(ApiError);
    await vi.advanceTimersByTimeAsync(300);
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(new Response(null, { status: 400 }));
    await expect(getJson('https://api.example.test/bad-request')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('fetchAllPages', () => {
  it('follows next links and combines every page', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json([1, 2], {
          headers: {
            Link: '<https://api.example.test/items?page=2>; rel="next"',
          },
        }),
      )
      .mockResolvedValueOnce(Response.json([3]));

    await expect(fetchAllPages<number>('https://api.example.test/items?page=1')).resolves.toEqual([
      1, 2, 3,
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.example.test/items?page=2',
      expect.any(Object),
    );
  });

  it('stops pathological pagination at the page cap', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        Response.json([1], {
          headers: {
            Link: '<https://api.example.test/items?page=next>; rel="next"',
          },
        }),
      ),
    );

    await expect(fetchAllPages('https://api.example.test/items')).rejects.toThrow(
      'Pagination exceeded 100 pages',
    );
  });
});
