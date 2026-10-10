// ─────────────────────────────────────────────────────────────
//  Tests — PagedLoader (the data source behind every binding)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from 'vitest';
import { PagedLoader } from '../state/paged-loader';

/** Fetcher over `total` numbered items; records the pages requested. */
function pages(total: number) {
  const calls: number[] = [];
  const fetcher = async (page: number, size: number) => {
    calls.push(page);
    const from = (page - 1) * size;
    return Array.from({ length: Math.max(0, Math.min(size, total - from)) }, (_, i) => from + i);
  };
  return { calls, fetcher };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('PagedLoader', () => {
  it('loads pages in order and stops after a short page', async () => {
    const { calls, fetcher } = pages(25);
    const loader = new PagedLoader({ fetcher, pageSize: 10 });
    await loader.loadNext();
    await loader.loadNext();
    await loader.loadNext();
    await loader.loadNext(); // exhausted: no-op
    expect(calls).toEqual([1, 2, 3]);
    expect(loader.loadedCount).toBe(25);
    expect(loader.hasMore).toBe(false);
    expect(loader.page).toBe(3);
  });

  it('shares the in-flight load instead of fetching twice', async () => {
    const { calls, fetcher } = pages(100);
    const loader = new PagedLoader({ fetcher, pageSize: 10 });
    await Promise.all([loader.loadNext(), loader.loadNext()]);
    expect(calls).toEqual([1]);
  });

  it('initialPage: 0 waits for loadNext(), then starts at page 1', async () => {
    const { calls, fetcher } = pages(100);
    const loader = new PagedLoader({ fetcher, pageSize: 10, initialPage: 0 });
    expect(loader.autoStart).toBe(false);
    expect(loader.hasMore).toBe(true);
    await loader.loadNext();
    expect(calls).toEqual([1]);
  });

  it('initialPage: n starts at page n', async () => {
    const { calls, fetcher } = pages(100);
    const loader = new PagedLoader({ fetcher, pageSize: 10, initialPage: 3 });
    await loader.loadNext();
    expect(calls).toEqual([3]);
    expect(loader.items[0]).toBe(20);
  });

  it('reset() replaces the items instead of appending to them', async () => {
    const { fetcher } = pages(100);
    const loader = new PagedLoader({ fetcher, pageSize: 10 });
    await loader.loadNext();
    await loader.loadNext();
    await loader.reset();
    expect(loader.items).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(loader.page).toBe(1);
  });

  it('reset() discards a load still in flight', async () => {
    let release!: (v: number[]) => void;
    const slow = new Promise<number[]>(r => {
      release = r;
    });
    let first = true;
    const loader = new PagedLoader<number>({
      fetcher: async () => (first ? ((first = false), slow) : [42]),
      pageSize: 1,
    });
    const stale = loader.loadNext();
    await loader.reset();
    release([7]);
    await stale;
    expect(loader.items).toEqual([42]);
  });

  it('retries a failed page with exponential backoff, then sets error', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => {
      throw new Error('offline');
    });
    const loader = new PagedLoader<number>({ fetcher, retries: 2, retryDelay: 100 });
    const done = loader.loadNext();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(199);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(loader.isLoading).toBe(false);
    expect((loader.error as Error).message).toBe('offline');
  });

  it('does not fetch again while error is set; retry() does', async () => {
    let fail = true;
    const fetcher = vi.fn(async (page: number) => {
      if (fail) throw new Error('boom');
      return [page];
    });
    const loader = new PagedLoader<number>({ fetcher, pageSize: 1, retries: 0 });
    await loader.loadNext();
    await loader.loadNext();
    await loader.loadNext();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(loader.hasMore).toBe(true);
    fail = false;
    await loader.retry();
    expect(loader.error).toBeNull();
    expect(loader.items).toEqual([1]);
    expect(fetcher).toHaveBeenLastCalledWith(1, 1);
  });

  it('notifies listeners and stops after destroy()', async () => {
    const { fetcher } = pages(100);
    const loader = new PagedLoader({ fetcher, pageSize: 10 });
    const listener = vi.fn();
    loader.subscribe(listener);
    await loader.loadNext();
    expect(listener).toHaveBeenCalledTimes(2); // loading → loaded
    loader.destroy();
    await loader.loadNext();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('treats a non-array page as a failure without touching the items', async () => {
    const loader = new PagedLoader<number>({
      fetcher: async () => ({ items: [1] }) as unknown as number[],
      retries: 0,
    });
    await loader.loadNext();
    expect(loader.items).toEqual([]);
    expect(loader.error).toBeInstanceOf(TypeError);
  });

  it('replace() shows static items and stops paging', async () => {
    const { calls, fetcher } = pages(100);
    const loader = new PagedLoader({ fetcher, pageSize: 10 });
    loader.replace([1, 2]);
    await loader.loadNext();
    expect(loader.items).toEqual([1, 2]);
    expect(calls).toEqual([]);
  });
});
