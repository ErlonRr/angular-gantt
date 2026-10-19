// ─────────────────────────────────────────────────────────────
//  Tests — PagedLoader.patch (Phase 11, D7): the charts' edits to loaded
//  items, kept across pages, in-flight loads and errors; dropped by reset.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from 'vitest';
import { PagedLoader } from '../state/paged-loader';

interface Item {
  id: string;
  n: number;
}

const item = (i: number): Item => ({ id: `t${i}`, n: i });

/** Fetcher over `total` items; records the pages requested. */
function pages(total: number) {
  const calls: number[] = [];
  const fetcher = (page: number, size: number): Promise<Item[]> => {
    calls.push(page);
    const from = (page - 1) * size;
    return Promise.resolve(Array.from({ length: Math.max(0, Math.min(size, total - from)) }, (_, i) => item(from + i)));
  };
  return { calls, fetcher };
}

/** Fetcher whose pages resolve only when the test says so. */
function manualPages() {
  const pending: { page: number; resolve: (items: Item[]) => void; reject: (err: unknown) => void }[] = [];
  const fetcher = (page: number): Promise<Item[]> =>
    new Promise<Item[]>((resolve, reject) => {
      pending.push({ page, resolve, reject });
    });
  return { pending, fetcher };
}

/** Sets `n` of the item `id` (a new object; the others keep their identity), like `applyChange`. */
const setN =
  (id: string, n: number) =>
  (items: readonly Item[]): Item[] =>
    items.map(it => (it.id === id ? { ...it, n } : it));

const ids = (items: readonly Item[]): string[] => items.map(it => it.id);

afterEach(() => {
  vi.useRealTimers();
});

describe('PagedLoader.patch', () => {
  it('replaces the items without fetching and keeps the paging state', async () => {
    const { calls, fetcher } = pages(25);
    const loader = new PagedLoader({ fetcher, pageSize: 10 });
    await loader.loadNext();
    const before = loader.items;
    const listener = vi.fn();
    loader.subscribe(listener);

    loader.patch(setN('t3', 99));

    expect(calls).toEqual([1]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(loader.items).not.toBe(before);
    expect(loader.items[3]).toEqual({ id: 't3', n: 99 });
    expect(loader.items[2]).toBe(before[2]);
    expect(loader.page).toBe(1);
    expect(loader.nextPage).toBe(2);
    expect(loader.hasMore).toBe(true);
    expect(loader.isLoading).toBe(false);
    expect(loader.error).toBeNull();
    expect(loader.loadedCount).toBe(10);
  });

  it('passes the current items to update', async () => {
    const { fetcher } = pages(5);
    const loader = new PagedLoader({ fetcher, pageSize: 10 });
    await loader.loadNext();
    const update = vi.fn((items: readonly Item[]) => items.slice(1));
    const current = loader.items;
    loader.patch(update);
    expect(update).toHaveBeenCalledWith(current);
    expect(ids(loader.items)).toEqual(['t1', 't2', 't3', 't4']);
    expect(loader.loadedCount).toBe(4);
  });

  it('returning the same array changes nothing and notifies no one', async () => {
    const { fetcher } = pages(5);
    const loader = new PagedLoader({ fetcher, pageSize: 10 });
    await loader.loadNext();
    const before = loader.items;
    const listener = vi.fn();
    loader.subscribe(listener);
    loader.patch(items => items as Item[]);
    expect(loader.items).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('throws a TypeError when update does not return an array, keeping the items', async () => {
    const { fetcher } = pages(5);
    const loader = new PagedLoader({ fetcher, pageSize: 10 });
    await loader.loadNext();
    const before = loader.items;
    const listener = vi.fn();
    loader.subscribe(listener);
    expect(() => loader.patch(() => null as unknown as Item[])).toThrow(TypeError);
    expect(loader.items).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('a page in flight is appended to the patched list', async () => {
    const { pending, fetcher } = manualPages();
    const loader = new PagedLoader({ fetcher, pageSize: 2 });
    const first = loader.loadNext();
    pending[0].resolve([item(0), item(1)]);
    await first;

    const second = loader.loadNext();
    expect(loader.isLoading).toBe(true);
    loader.patch(setN('t0', 50));
    expect(loader.isLoading).toBe(true);
    expect(pending).toHaveLength(2);
    pending[1].resolve([item(2), item(3)]);
    await second;

    expect(loader.items).toEqual([{ id: 't0', n: 50 }, item(1), item(2), item(3)]);
    expect(loader.page).toBe(2);
    expect(loader.nextPage).toBe(3);
    expect(loader.isLoading).toBe(false);
  });

  it('loadNext() after a patch continues paging and keeps the edit', async () => {
    const { calls, fetcher } = pages(25);
    const loader = new PagedLoader({ fetcher, pageSize: 10 });
    await loader.loadNext();
    loader.patch(setN('t4', -1));
    await loader.loadNext();
    await loader.loadNext();
    expect(calls).toEqual([1, 2, 3]);
    expect(loader.loadedCount).toBe(25);
    expect(loader.items[4]).toEqual({ id: 't4', n: -1 });
    expect(loader.hasMore).toBe(false);
  });

  it('can add and remove items: paging still follows the page number', async () => {
    const { calls, fetcher } = pages(25);
    const loader = new PagedLoader({ fetcher, pageSize: 10 });
    await loader.loadNext();
    loader.patch(items => [...items.filter(it => it.id !== 't0'), { id: 'new', n: 0 }]);
    await loader.loadNext();
    expect(calls).toEqual([1, 2]);
    expect(loader.loadedCount).toBe(20);
    expect(ids(loader.items).slice(8, 11)).toEqual(['t9', 'new', 't10']);
  });

  it('reset() drops the patch with the other items and loads from the first page', async () => {
    const { calls, fetcher } = pages(25);
    const loader = new PagedLoader({ fetcher, pageSize: 10 });
    await loader.loadNext();
    loader.patch(setN('t1', 7));
    await loader.reset();
    expect(calls).toEqual([1, 1]);
    expect(loader.items[1]).toEqual(item(1));
    expect(loader.page).toBe(1);
  });

  it('a patch after reset() edits the new items; the first page in flight appends to it', async () => {
    const { pending, fetcher } = manualPages();
    const loader = new PagedLoader({ fetcher, pageSize: 2 });
    const first = loader.loadNext();
    pending[0].resolve([item(0), item(1)]);
    await first;

    const again = loader.reset();
    expect(loader.items).toEqual([]);
    loader.patch(items => [...items, { id: 'local', n: 0 }]);
    pending[1].resolve([item(0), item(1)]);
    await again;
    expect(ids(loader.items)).toEqual(['local', 't0', 't1']);

    loader.patch(setN('t1', 42));
    expect(loader.items[2]).toEqual({ id: 't1', n: 42 });
    expect(loader.page).toBe(1);
    expect(loader.hasMore).toBe(true);
  });

  it('a page discarded by reset() never lands on a patched list', async () => {
    const { pending, fetcher } = manualPages();
    const loader = new PagedLoader({ fetcher, pageSize: 2 });
    const stale = loader.loadNext();
    const fresh = loader.reset();
    loader.patch(items => [...items, { id: 'local', n: 0 }]);
    pending[0].resolve([item(8), item(9)]);
    await stale;
    expect(ids(loader.items)).toEqual(['local']);
    pending[1].resolve([item(0)]);
    await fresh;
    expect(ids(loader.items)).toEqual(['local', 't0']);
    expect(loader.hasMore).toBe(false);
  });

  it('keeps the error until retry(), which appends the failed page to the patched list', async () => {
    const { pending, fetcher } = manualPages();
    const loader = new PagedLoader({ fetcher, pageSize: 2, retries: 0 });
    const first = loader.loadNext();
    pending[0].resolve([item(0), item(1)]);
    await first;
    const failing = loader.loadNext();
    const boom = new Error('offline');
    pending[1].reject(boom);
    await failing;
    expect(loader.error).toBe(boom);

    loader.patch(setN('t0', 5));
    expect(loader.error).toBe(boom);
    expect(loader.nextPage).toBe(2);

    const retried = loader.retry();
    pending[2].resolve([item(2)]);
    await retried;
    expect(loader.error).toBeNull();
    expect(loader.items).toEqual([{ id: 't0', n: 5 }, item(1), item(2)]);
  });

  it('patches a replace()d static list without restarting paging', () => {
    const { calls, fetcher } = pages(25);
    const loader = new PagedLoader({ fetcher, pageSize: 10, initialPage: 0 });
    loader.replace([item(0), item(1)]);
    loader.patch(setN('t1', 3));
    expect(loader.items).toEqual([item(0), { id: 't1', n: 3 }]);
    expect(loader.hasMore).toBe(false);
    expect(calls).toEqual([]);
  });
});
