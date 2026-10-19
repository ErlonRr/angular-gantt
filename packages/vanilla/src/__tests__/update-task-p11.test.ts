// `updateTask()` / `appendTasks()` (Gantry 2 phase 11): silent data writes into the raw input, as
// Angular's — into the data source when there is one (`patch`), so the next page keeps them, else
// into `tasks` (the consumer's other objects stay the same objects). No `before-change`, no history.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { GanttTask } from '@gantryjs/core';
import { GanttDataSource } from '../datasource/gantt-datasource';
import type { GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import '../index';

const day = (d: number) => new Date(2026, 1, d);
const task = (i: number): GanttTask => ({ id: `t${i}`, name: `T${i}`, start: day(1 + i), end: day(3 + i) });

let el: GantryElement | null = null;
afterEach(() => {
  el?.remove();
  el = null;
});

function mount(): GantryElement {
  el = document.createElement('gantry-element');
  document.body.appendChild(el);
  return el;
}

describe('updateTask / appendTasks', () => {
  it('write the raw tasks silently: other objects keep their identity, no before-change', () => {
    const chart = mount();
    const raw = [task(1), task(2)];
    chart.tasks = raw;
    const before = vi.fn();
    chart.addEventListener('before-change', before);
    chart.updateTask('t1', { name: 'Renamed' });
    chart.appendTasks([task(3)]);
    const now = chart.tasks;
    expect(now.map(t => t.name)).toEqual(['Renamed', 'T2', 'T3']);
    expect(now[1]).toBe(raw[1]);
    expect(before).not.toHaveBeenCalled();
    expect(chart.canUndo).toBe(false);
  });

  it('with a data source, patch it so the next page keeps the change', async () => {
    const chart = mount();
    // Page 2 is held until the edit is made: the page in flight lands after the patched items
    let release = (): void => undefined;
    const page2 = new Promise<GanttTask[]>(resolve => (release = () => resolve([task(3)])));
    const fetcher = vi.fn((page: number) => (page === 1 ? Promise.resolve([task(1), task(2)]) : page2));
    const ds = new GanttDataSource({ fetcher, pageSize: 2, retries: 0 });
    chart.dataSource = ds;
    await vi.waitFor(() => expect(ds.loadedCount).toBe(2));
    chart.updateTask('t2', { name: 'Kept' });
    expect(ds.items.find(t => t.id === 't2')?.name).toBe('Kept');
    void ds.loadNext();
    release();
    await vi.waitFor(() => expect(ds.loadedCount).toBe(3));
    getEngine(chart).flushSync();
    expect(ds.items.map(t => t.name)).toEqual(['T1', 'Kept', 'T3']);
    expect(
      getEngine(chart)
        .graph.tasks.peek()
        .find(t => t.id === 't2')?.name,
    ).toBe('Kept');
  });
});
