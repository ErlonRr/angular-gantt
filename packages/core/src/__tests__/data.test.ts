// ─────────────────────────────────────────────────────────────
//  Tests — task normalisation, root sorting, deterministic range, CPM spans
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  normalizeTasks,
  flattenTree,
  filterVisible,
  reindexVisible,
  sortRoots,
  sortTree,
  columnComparator,
  buildDefaultColumns,
} from '../gantt-data';
import { snapRange } from '../gantt-math';
import { computeCriticalPath, longestChain } from '../gantt-cpm';
import { DEFAULT_LABELS, type GanttFlatRow, type GanttTask } from '../types';

const day = (d: number) => new Date(2026, 0, d);
const task = (id: string, extra: Partial<GanttTask> = {}): GanttTask => ({
  id,
  name: id,
  start: day(1),
  end: day(3),
  ...extra,
});

// ─── normalizeTasks ──────────────────────────────────────────

describe('normalizeTasks', () => {
  it('returns the same array when nothing needs fixing', () => {
    const tasks = [task('a'), task('b', { parentId: 'a' })];
    expect(normalizeTasks(tasks)).toBe(tasks);
  });

  it('turns null, empty, unknown and self parents into roots', () => {
    const tasks = [
      task('a', { parentId: null as unknown as string }),
      task('b', { parentId: '' }),
      task('c', { parentId: 'missing' }),
      task('d', { parentId: 'd' }),
      task('e', { parentId: 'a' }),
    ];
    const out = normalizeTasks(tasks);
    expect(out.map(t => t.parentId)).toEqual([undefined, undefined, undefined, undefined, 'a']);
    expect(out.slice(0, 4).every(t => !('parentId' in t))).toBe(true);
    expect(out[4]).toBe(tasks[4]);
  });

  it('breaks parent cycles so no task is dropped', () => {
    const tasks = [task('a', { parentId: 'c' }), task('b', { parentId: 'a' }), task('c', { parentId: 'b' })];
    const rows = flattenTree(tasks);
    expect(rows.map(r => r.task.id).sort()).toEqual(['a', 'b', 'c']);
    expect(rows.filter(r => r.level === 0)).toHaveLength(1);
  });

  it('falls back to start for a missing end', () => {
    const tasks = [task('a', { end: undefined as unknown as Date })];
    const [out] = normalizeTasks(tasks);
    expect(out.end).toEqual(day(1));
    expect(tasks[0].end).toBeUndefined();
  });

  it('flattenTree keeps tasks whose parentId is null', () => {
    const rows = flattenTree([task('a', { parentId: null as unknown as string }), task('b', { parentId: 'a' })]);
    expect(rows.map(r => [r.task.id, r.level])).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
  });

  it('default columns render a task without end', () => {
    const [row] = flattenTree([task('a', { end: undefined as unknown as Date })]);
    const cols = buildDefaultColumns(DEFAULT_LABELS);
    expect(() => cols.map(c => c.render?.(row))).not.toThrow();
  });
});

// ─── sortRoots ───────────────────────────────────────────────

describe('sortRoots', () => {
  it('sorts root groups and keeps each subtree under its root', () => {
    const tasks = [
      task('b', { start: day(5) }),
      task('b1', { parentId: 'b', start: day(6) }),
      task('a', { start: day(1) }),
      task('a1', { parentId: 'a', start: day(2) }),
      task('a1x', { parentId: 'a1', start: day(2) }),
    ];
    const rows = flattenTree(tasks);
    const desc = sortRoots(rows, columnComparator('start', 'desc'));
    expect(desc.map(r => r.task.id)).toEqual(['b', 'b1', 'a', 'a1', 'a1x']);
    const asc = sortRoots(rows, columnComparator('name', 'asc'));
    expect(asc.map(r => r.task.id)).toEqual(['a', 'a1', 'a1x', 'b', 'b1']);
  });

  it('is stable for equal keys', () => {
    const rows = flattenTree([
      task('x', { start: day(1) }),
      task('y', { start: day(1) }),
      task('z', { start: day(1) }),
    ]);
    expect(sortRoots(rows, columnComparator('progress')).map(r => r.task.id)).toEqual(['x', 'y', 'z']);
  });

  it('sorts 10k rows in linear time', () => {
    const tasks: GanttTask[] = [];
    for (let i = 0; i < 2_000; i++) {
      tasks.push(task(`r${i}`, { start: day(1 + ((i * 7) % 300)) }));
      for (let j = 0; j < 4; j++) tasks.push(task(`r${i}-${j}`, { parentId: `r${i}`, start: day(2) }));
    }
    const rows = flattenTree(tasks);
    expect(rows).toHaveLength(10_000);
    const cmp = columnComparator('start', 'desc');
    sortRoots(rows, cmp); // warm-up
    const t0 = performance.now();
    const sorted = sortRoots(rows, cmp);
    // Linear: a few ms. The old quadratic version took seconds for 10k rows.
    expect(performance.now() - t0).toBeLessThan(200);
    expect(sorted).toHaveLength(10_000);
  });
});

// ─── snapRange ───────────────────────────────────────────────

describe('snapRange', () => {
  it('uses the given now for an empty task list', () => {
    const now = new Date(2026, 9, 9, 15, 30);
    const a = snapRange([], { unit: 'day' }, 3, null, 1, now);
    const b = snapRange([], { unit: 'day' }, 3, null, 1, new Date(now));
    expect(a).toEqual(b);
    expect(a.start.getTime()).toBeLessThanOrEqual(new Date(2026, 9, 9).getTime());
    expect(a.end.getTime()).toBeGreaterThan(now.getTime());
  });
});

// ─── CPM with rendered spans ─────────────────────────────────

describe('computeCriticalPath — end date modes', () => {
  // Chain A → B → C of 2 days each (inclusive: 3 days) vs a lone task D of 7 days (inclusive: 8).
  const tasks: GanttTask[] = [
    task('A', { start: day(1), end: day(3) }),
    task('B', { start: day(3), end: day(5), dependency: 'A' }),
    task('C', { start: day(5), end: day(7), dependency: 'B' }),
    task('D', { start: day(1), end: day(8) }),
  ];

  it('exclusive ends: the 7-day task is critical, the 6-day chain has float', () => {
    const { criticalIds, floatMap } = computeCriticalPath(tasks);
    expect([...criticalIds]).toEqual(['D']);
    expect(floatMap.get('A')).toBe(1);
  });

  it('inclusive ends count the last day: the 9-day chain is critical', () => {
    const { criticalIds, floatMap } = computeCriticalPath(tasks, { endDateMode: 'inclusive' });
    expect([...criticalIds].sort()).toEqual(['A', 'B', 'C']);
    expect(floatMap.get('D')).toBe(1);
  });

  it('hour-level tasks use fractional days', () => {
    const at = (h: number) => new Date(2026, 0, 1, h);
    const hourly: GanttTask[] = [
      task('p', { start: at(8), end: at(9) }),
      task('q', { start: at(9), end: at(10), dependency: 'p' }),
      task('long', { start: at(8), end: at(20) }),
    ];
    const { criticalIds } = computeCriticalPath(hourly);
    expect([...criticalIds]).toEqual(['long']);
  });

  it('longestChain honours the end date mode', () => {
    // Exclusive: z (4d) then w (1d) = 5 beats x→y→w (3d). Inclusive: x→y→w (6d) beats z alone (5d) —
    // z's last day overlaps w's first, so they no longer chain.
    const chainable = [
      task('x', { start: day(1), end: day(2) }),
      task('z', { start: day(1), end: day(5) }),
      task('y', { start: day(3), end: day(4) }),
      task('w', { start: day(5), end: day(6) }),
    ];
    expect(longestChain(chainable)).toEqual(['z', 'w']);
    expect(longestChain(chainable, { endDateMode: 'inclusive' })).toEqual(['x', 'y', 'w']);
  });
});

// ─── reindexVisible: tree position (aria-posinset / setsize) ─

describe('reindexVisible', () => {
  // a ─┬─ a1 ─── a1x
  //    └─ a2
  // b
  // c ─── c1
  const tree = (): GanttTask[] => [
    task('a', { start: day(1) }),
    task('a1', { parentId: 'a', start: day(2) }),
    task('a1x', { parentId: 'a1', start: day(3) }),
    task('a2', { parentId: 'a', start: day(4) }),
    task('b', { start: day(5) }),
    task('c', { start: day(6) }),
    task('c1', { parentId: 'c', start: day(7) }),
  ];
  const place = (rows: GanttFlatRow[]) =>
    rows.map(r => [r.task.id, r.visibleIndex, r.posInSet, r.setSize, r.parentIndex] as const);

  it('sets visibleIndex, posInSet, setSize and parentIndex for an expanded tree', () => {
    expect(place(reindexVisible(filterVisible(flattenTree(tree()))))).toEqual([
      ['a', 0, 1, 3, undefined],
      ['a1', 1, 1, 2, 0],
      ['a1x', 2, 1, 1, 1],
      ['a2', 3, 2, 2, 0],
      ['b', 4, 2, 3, undefined],
      ['c', 5, 3, 3, undefined],
      ['c1', 6, 1, 1, 5],
    ]);
  });

  it('counts only visible rows when a parent is collapsed', () => {
    expect(place(reindexVisible(filterVisible(flattenTree(tree(), new Set(['a', 'c'])))))).toEqual([
      ['a', 0, 1, 3, undefined],
      ['b', 1, 2, 3, undefined],
      ['c', 2, 3, 3, undefined],
    ]);
    expect(place(reindexVisible(filterVisible(flattenTree(tree(), new Set(['a1'])))))).toEqual([
      ['a', 0, 1, 3, undefined],
      ['a1', 1, 1, 2, 0],
      ['a2', 2, 2, 2, 0],
      ['b', 3, 2, 3, undefined],
      ['c', 4, 3, 3, undefined],
      ['c1', 5, 1, 1, 4],
    ]);
  });

  it('follows the sorted order (sortTree keeps subtrees under their parent)', () => {
    const rows = sortTree(flattenTree(tree()), columnComparator('name', 'desc'));
    expect(place(reindexVisible(filterVisible(rows)))).toEqual([
      ['c', 0, 1, 3, undefined],
      ['c1', 1, 1, 1, 0],
      ['b', 2, 2, 3, undefined],
      ['a', 3, 3, 3, undefined],
      ['a2', 4, 1, 2, 3],
      ['a1', 5, 2, 2, 3],
      ['a1x', 6, 1, 1, 5],
    ]);
  });

  it('a row whose parent is missing (a filtered list) belongs to the nearest earlier row of a lower level', () => {
    const rows = filterVisible(flattenTree(tree())).filter(r => r.task.id !== 'a1' && r.task.id !== 'c');
    expect(place(reindexVisible(rows))).toEqual([
      ['a', 0, 1, 2, undefined],
      ['a1x', 1, 1, 2, 0],
      ['a2', 2, 2, 2, 0],
      ['b', 3, 2, 2, undefined],
      ['c1', 4, 1, 1, 3],
    ]);
    // no earlier row of a lower level: a root
    const orphans = filterVisible(flattenTree(tree())).filter(r => r.level > 0);
    expect(place(reindexVisible(orphans)).slice(0, 2)).toEqual([
      ['a1', 0, 1, 3, undefined],
      ['a1x', 1, 1, 1, 0],
    ]);
  });

  it('keeps the other fields, returns new rows and handles an empty list', () => {
    const input = filterVisible(flattenTree(tree()));
    const out = reindexVisible(input);
    expect(out[1]).not.toBe(input[1]);
    expect(out[1]).toMatchObject({ task: input[1]?.task, level: 1, hasChildren: true, barType: 'task' });
    expect(input[1]?.posInSet).toBeUndefined();
    // Reindexing again gives the same positions (a stale parentIndex is overwritten)
    expect(place(reindexVisible(out))).toEqual(place(out));
    expect(reindexVisible([])).toEqual([]);
  });
});
