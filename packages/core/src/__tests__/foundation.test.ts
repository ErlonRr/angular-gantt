// ─────────────────────────────────────────────────────────────
//  Tests — Steps 1-3 foundation validation
//  Run with: npx vitest (or jest)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  dateToPixel,
  pixelToDate,
  addDays,
  diffDays,
  generateHeaderRows,
  zoomIn,
  zoomOut,
  getTimelineRange,
} from '../gantt-math';
import { flattenTree, filterVisible, reindexVisible } from '../gantt-data';
import { computeCriticalPath } from '../gantt-cpm';
import { ViewMode, DependencyType, type GanttTask } from '../types';

// ─── gantt-math ───────────────────────────────────────────────

describe('dateToPixel / pixelToDate', () => {
  const origin = new Date('2026-01-01T00:00:00Z');
  const pxPerDay = 8;

  it('origin maps to 0', () => {
    expect(dateToPixel(origin, origin, pxPerDay)).toBe(0);
  });

  it('7 days later = 56px', () => {
    const d = addDays(origin, 7);
    expect(dateToPixel(d, origin, pxPerDay)).toBe(56);
  });

  it('round-trips within ±1px', () => {
    const d = addDays(origin, 42);
    const px = dateToPixel(d, origin, pxPerDay);
    const back = pixelToDate(px, origin, pxPerDay);
    expect(Math.abs(back.getTime() - d.getTime())).toBeLessThan(86_400_000);
  });

  it('negative offset (before origin)', () => {
    const d = addDays(origin, -10);
    expect(dateToPixel(d, origin, pxPerDay)).toBe(-80);
  });
});

describe('diffDays', () => {
  it('same day = 0', () => {
    const d = new Date('2026-03-01');
    expect(diffDays(d, d)).toBe(0);
  });

  it('1 month ≈ 31 days for March', () => {
    const s = new Date('2026-03-01');
    const e = new Date('2026-04-01');
    expect(diffDays(s, e)).toBe(31);
  });
});

describe('generateHeaderRows — Month view', () => {
  const start = new Date('2026-01-01');
  const end = new Date('2026-06-30');
  const pxPerDay = 8;

  it('top row has Q1 and Q2', () => {
    const [top] = generateHeaderRows(ViewMode.Month, start, end, pxPerDay);
    const labels = top.cells.map(c => c.label);
    expect(labels.some(l => l.startsWith('Q1'))).toBe(true);
    expect(labels.some(l => l.startsWith('Q2'))).toBe(true);
  });

  it('bottom row has 6 months', () => {
    const [, bot] = generateHeaderRows(ViewMode.Month, start, end, pxPerDay);
    expect(bot.cells.length).toBe(6);
  });

  it('cell x coordinates are non-decreasing', () => {
    const [, bot] = generateHeaderRows(ViewMode.Month, start, end, pxPerDay);
    for (let i = 1; i < bot.cells.length; i++) {
      expect(bot.cells[i].x).toBeGreaterThan(bot.cells[i - 1].x);
    }
  });
});

describe('zoomIn / zoomOut', () => {
  it('Month → Week on zoomIn', () => {
    expect(zoomIn(ViewMode.Month)).toBe(ViewMode.Week);
  });
  it('Month → Quarter on zoomOut', () => {
    expect(zoomOut(ViewMode.Month)).toBe(ViewMode.Quarter);
  });
  it('Hour cannot zoom in further', () => {
    expect(zoomIn(ViewMode.Day)).toBe(ViewMode.Hour);
    expect(zoomIn(ViewMode.Hour)).toBe(ViewMode.Hour);
  });
  it('Year cannot zoom out further', () => {
    expect(zoomOut(ViewMode.Year)).toBe(ViewMode.Year);
  });
});

// ─── gantt-data ───────────────────────────────────────────────

const makeTasks = (): GanttTask[] => [
  { id: 'p1', name: 'Project 1', start: new Date('2026-01-01'), end: new Date('2026-03-31') },
  { id: 't1', name: 'Task 1.1', start: new Date('2026-01-01'), end: new Date('2026-01-15'), parentId: 'p1' },
  { id: 't2', name: 'Task 1.2', start: new Date('2026-01-16'), end: new Date('2026-02-28'), parentId: 'p1' },
  { id: 'p2', name: 'Project 2', start: new Date('2026-04-01'), end: new Date('2026-06-30') },
  { id: 't3', name: 'Task 2.1', start: new Date('2026-04-01'), end: new Date('2026-04-30'), parentId: 'p2' },
];

describe('flattenTree', () => {
  it('produces all rows', () => {
    const rows = flattenTree(makeTasks());
    expect(rows.length).toBe(5);
  });

  it('root rows have level 0', () => {
    const rows = flattenTree(makeTasks());
    const roots = rows.filter(r => r.level === 0);
    expect(roots.length).toBe(2);
  });

  it('children have level 1', () => {
    const rows = flattenTree(makeTasks());
    const children = rows.filter(r => r.level === 1);
    expect(children.length).toBe(3);
  });

  it('children follow their parent', () => {
    const rows = flattenTree(makeTasks());
    const p1Idx = rows.findIndex(r => r.task.id === 'p1');
    const t1Idx = rows.findIndex(r => r.task.id === 't1');
    const t2Idx = rows.findIndex(r => r.task.id === 't2');
    expect(t1Idx).toBeGreaterThan(p1Idx);
    expect(t2Idx).toBeGreaterThan(p1Idx);
  });

  it('collapsed parent hides children', () => {
    const rows = flattenTree(makeTasks(), new Set(['p1']));
    const visible = filterVisible(rows);
    expect(visible.find(r => r.task.id === 't1')).toBeUndefined();
    expect(visible.find(r => r.task.id === 't2')).toBeUndefined();
    expect(visible.find(r => r.task.id === 'p1')).toBeDefined();
  });

  it('visibleIndex is contiguous after reindex', () => {
    const rows = flattenTree(makeTasks(), new Set(['p1']));
    const visible = reindexVisible(filterVisible(rows));
    visible.forEach((r, i) => expect(r.visibleIndex).toBe(i));
  });
});

describe('getTimelineRange', () => {
  it('encompasses tasks in Month mode (snapped to period, no sub-period padding)', () => {
    const tasks = makeTasks();
    const range = getTimelineRange(tasks, ViewMode.Month, 7);
    // Month/Quarter/Year snap to the period boundary and do NOT add sub-period
    // padding (it would create unreadable "sliver" cells in the header).
    expect(range.start.getTime()).toBeLessThanOrEqual(tasks[0].start.getTime());
    expect(range.end.getTime()).toBeGreaterThanOrEqual(tasks[tasks.length - 1].end.getTime());
  });

  it('adds day padding in Day mode', () => {
    const tasks = makeTasks();
    const range = getTimelineRange(tasks, ViewMode.Day, 7);
    expect(range.start.getTime()).toBeLessThan(tasks[0].start.getTime());
    expect(range.end.getTime()).toBeGreaterThan(tasks[tasks.length - 1].end.getTime());
  });
});

// ─── gantt-cpm ───────────────────────────────────────────────

describe('computeCriticalPath', () => {
  // Linear chain: A(5d) → B(3d) → C(4d)
  // Critical path = all three tasks (float = 0)
  const linearTasks: GanttTask[] = [
    { id: 'A', name: 'A', start: new Date('2026-01-01'), end: new Date('2026-01-06'), dependency: undefined },
    { id: 'B', name: 'B', start: new Date('2026-01-06'), end: new Date('2026-01-09'), dependency: 'A' },
    { id: 'C', name: 'C', start: new Date('2026-01-09'), end: new Date('2026-01-13'), dependency: 'B' },
  ];

  it('all tasks critical in a pure chain', () => {
    const { criticalIds } = computeCriticalPath(linearTasks);
    expect(criticalIds.has('A')).toBe(true);
    expect(criticalIds.has('B')).toBe(true);
    expect(criticalIds.has('C')).toBe(true);
  });

  // Parallel paths: A(10d), B(3d) — both end at same finish
  // A is critical, B has float
  it('identifies non-critical parallel task', () => {
    const parallelTasks: GanttTask[] = [
      { id: 'A', name: 'A', start: new Date('2026-01-01'), end: new Date('2026-01-11') },
      { id: 'B', name: 'B', start: new Date('2026-01-01'), end: new Date('2026-01-04') },
      { id: 'C', name: 'C', start: new Date('2026-01-11'), end: new Date('2026-01-15'), dependency: 'A' },
    ];
    const { criticalIds, floatMap } = computeCriticalPath(parallelTasks);
    expect(criticalIds.has('A')).toBe(true);
    expect(floatMap.get('B') ?? 0).toBeGreaterThan(0);
  });

  it('handles empty task array', () => {
    const { criticalIds } = computeCriticalPath([]);
    expect(criticalIds.size).toBe(0);
  });

  it('handles missing predecessor gracefully', () => {
    const tasks: GanttTask[] = [
      { id: 'X', name: 'X', start: new Date('2026-01-01'), end: new Date('2026-01-05'), dependency: 'MISSING' },
    ];
    const { warnings } = computeCriticalPath(tasks);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('MISSING');
  });

  it('FS with lag shifts Early Start', () => {
    const tasks: GanttTask[] = [
      { id: 'A', name: 'A', start: new Date('2026-01-01'), end: new Date('2026-01-06') },
      {
        id: 'B',
        name: 'B',
        start: new Date('2026-01-09'),
        end: new Date('2026-01-14'),
        dependency: { taskId: 'A', type: DependencyType.FS, lag: 3 },
      },
    ];
    const { floatMap } = computeCriticalPath(tasks);
    // B starts 3 days after A finishes — still critical (no slack)
    expect(floatMap.get('A')).toBe(0);
  });
});
