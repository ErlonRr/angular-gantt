// GanttDataSource.destroy() (Gantry 2 phase 10): the same as the Web Component's — a load in flight is
// dropped, paging stops, the signals show it and the chart's listener hears it once more.
import { describe, it, expect, vi } from 'vitest';
import type { GanttTask } from '@gantryjs/core';
import { GanttDataSource } from './datasource/gantt-datasource';

const task = (i: number): GanttTask => ({
  id: `t${i}`,
  name: `T${i}`,
  start: new Date(2026, 0, 1),
  end: new Date(2026, 0, 2),
});

describe('GanttDataSource.destroy()', () => {
  it('drops the load in flight and stops paging', async () => {
    let release = (): void => undefined;
    const fetcher = vi.fn((page: number) =>
      page === 1 ? Promise.resolve([task(1), task(2)]) : new Promise<GanttTask[]>(r => (release = () => r([task(3)]))),
    );
    const ds = new GanttDataSource({ fetcher, pageSize: 2, retries: 0 });
    await vi.waitFor(() => expect(ds.loadedCount()).toBe(2));
    const second = ds.loadNext();
    expect(ds.isLoading()).toBe(true);
    const heard = vi.fn();
    ds.ɵsubscribe(heard);

    ds.destroy();
    expect(ds.hasMore()).toBe(false);
    expect(heard).toHaveBeenCalledTimes(1);
    release();
    await second;
    expect(ds.items().map(t => t.id)).toEqual(['t1', 't2']);
    expect(heard).toHaveBeenCalledTimes(1);
    await ds.loadNext();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
