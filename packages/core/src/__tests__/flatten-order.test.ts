// ─────────────────────────────────────────────────────────────
//  Tests — `flattenTree(tasks, collapsed, { order })` (Phase 14 step 1.1,
//  D6): the default sorts the roots and the siblings by start date as
//  before; `'input'` keeps the order of the array, which is how the
//  resource view keeps the app's order of resources.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { TaskType, flattenTree, type GanttTask } from '../index';

const d = (day: number) => new Date(2026, 9, day);
const task = (id: string, startDay: number, extra: Partial<GanttTask> = {}): GanttTask => ({
  id,
  name: id,
  start: d(startDay),
  end: d(startDay + 2),
  ...extra,
});

/** Input order deliberately unlike the start order, at both levels. */
const TASKS: GanttTask[] = [
  task('late', 20),
  task('team', 12, { type: TaskType.Group }),
  task('m2', 15, { parentId: 'team' }),
  task('early', 2),
  task('m1', 13, { parentId: 'team' }),
  task('mid', 10),
];
const ids = (rows: { task: GanttTask }[]) => rows.map(r => r.task.id);

describe('flattenTree order', () => {
  it("sorts by start date by default, as before ('start')", () => {
    const expected = ['early', 'mid', 'team', 'm1', 'm2', 'late'];
    expect(ids(flattenTree(TASKS))).toEqual(expected);
    expect(ids(flattenTree(TASKS, new Set()))).toEqual(expected);
    expect(ids(flattenTree(TASKS, new Set(), {}))).toEqual(expected);
    expect(ids(flattenTree(TASKS, new Set(), { order: 'start' }))).toEqual(expected);
    expect(ids(flattenTree(TASKS, new Set(), { order: undefined }))).toEqual(expected);
  });

  it("keeps the input order of the roots and of each task's children ('input')", () => {
    const rows = flattenTree(TASKS, new Set(), { order: 'input' });
    expect(ids(rows)).toEqual(['late', 'team', 'm2', 'm1', 'early', 'mid']);
    expect(rows.map(r => r.level)).toEqual([0, 0, 1, 1, 0, 0]);
    expect(rows.map(r => r.visibleIndex)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('collapses the same way in both orders', () => {
    const collapsed = new Set(['team']);
    const input = flattenTree(TASKS, collapsed, { order: 'input' });
    expect(input.filter(r => r.hidden).map(r => r.task.id)).toEqual(['m2', 'm1']);
    expect(input.find(r => r.task.id === 'team')).toMatchObject({ hasChildren: true, isCollapsed: true });
    expect(input.map(r => r.visibleIndex)).toEqual([0, 1, -1, -1, 2, 3]);
    const start = flattenTree(TASKS, collapsed);
    expect(start.filter(r => r.hidden).map(r => r.task.id)).toEqual(['m1', 'm2']);
  });

  it('is stable for equal start dates in the default order', () => {
    const same = [task('b', 5), task('a', 5), task('c', 5)];
    expect(ids(flattenTree(same))).toEqual(['b', 'a', 'c']);
    expect(ids(flattenTree(same, new Set(), { order: 'input' }))).toEqual(['b', 'a', 'c']);
  });

  it('does not touch the array it is given', () => {
    const copy = TASKS.map(t => t.id);
    flattenTree(TASKS, new Set(), { order: 'input' });
    flattenTree(TASKS);
    expect(TASKS.map(t => t.id)).toEqual(copy);
  });

  it('still cuts a parent cycle in input order, and ignores unknown parents', () => {
    const cyc = [task('a', 1, { parentId: 'b' }), task('b', 2, { parentId: 'a' }), task('c', 3, { parentId: 'ghost' })];
    expect(ids(flattenTree(cyc, new Set(), { order: 'input' })).sort()).toEqual(['a', 'b', 'c']);
    expect(flattenTree(cyc, new Set(), { order: 'input' })).toHaveLength(3);
  });
});
