// ─────────────────────────────────────────────────────────────
//  Tests — rollup of parent rows: progress weights, nested parents,
//  dates as drawn, summary status, colour, the task copies on the rows
//  and the segments of a collapsed parent
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  applyRollups,
  computeRollups,
  rollupSegments,
  rollupSource,
  summaryStatus,
  type RollupContext,
} from '../gantt-rollup';
import { resolveConfig, type ResolvedGanttConfig, type ResolvedRollupOptions } from '../render/config';
import { computeRowGeometries, taskSpan } from '../render/timeline';
import { taskStatus } from '../render/columns';
import { statusPaint, themeVar } from '../render/paint';
import { flattenTree } from '../gantt-data';
import { calendarDays } from '../gantt-math';
import type { GanttFlatRow, GanttTask } from '../types';

const ON: ResolvedRollupOptions = { progress: 'duration', dates: true, color: false, segments: false };
const rollupOf = (o: Partial<ResolvedRollupOptions> = {}): ResolvedRollupOptions => ({ ...ON, ...o });

const EXCLUSIVE = { endDateMode: 'exclusive', normalizeDateOnly: true } as const;
const INCLUSIVE = { endDateMode: 'inclusive', normalizeDateOnly: true } as const;
/** Before every task below: nothing has started */
const EARLY: RollupContext = { now: new Date(2025, 0, 1), dates: EXCLUSIVE };

/** A task from day `from` to day `to` of January 2026 (local midnights, exclusive end). */
function task(id: string, from: number, to: number, extra: Partial<GanttTask> = {}): GanttTask {
  return { id, name: id, start: new Date(2026, 0, from), end: new Date(2026, 0, to), ...extra };
}

/** Rollup info of `id`, failing the test when there is none. */
function infoOf(map: ReturnType<typeof computeRollups>, id: string) {
  const info = map.get(id);
  if (!info) throw new Error(`no rollup for ${id}`);
  return info;
}

// ─── Progress ─────────────────────────────────────────────────

describe('computeRollups — progress', () => {
  it('is the mean of the children weighted by their length in days', () => {
    const tasks = [
      task('p', 1, 2),
      task('a', 1, 11, { parentId: 'p', progress: 0 }), // 10 days
      task('b', 11, 41, { parentId: 'p', progress: 100 }), // 30 days
    ];
    expect(infoOf(computeRollups(tasks, ON, EARLY), 'p').progress).toBe(75);
  });

  it('gives milestones no weight, and uses the plain mean when the total weight is 0', () => {
    const withMilestone = [
      task('p', 1, 2),
      task('a', 1, 3, { parentId: 'p', progress: 50 }),
      task('m', 5, 5, { parentId: 'p', progress: 100, type: 'milestone' }),
    ];
    expect(infoOf(computeRollups(withMilestone, ON, EARLY), 'p').progress).toBe(50);

    // A milestone with a length still weighs 0 (custom `barType: 'milestone'` too)
    const longMilestone = [
      task('p', 1, 2),
      task('a', 1, 3, { parentId: 'p', progress: 20 }),
      task('m', 1, 30, { parentId: 'p', progress: 100, barType: 'milestone' }),
    ];
    expect(infoOf(computeRollups(longMilestone, ON, EARLY), 'p').progress).toBe(20);

    const onlyMilestones = [
      task('p', 1, 2),
      task('m1', 5, 5, { parentId: 'p', progress: 100, type: 'milestone' }),
      task('m2', 6, 6, { parentId: 'p', type: 'milestone' }),
    ];
    expect(infoOf(computeRollups(onlyMilestones, ON, EARLY), 'p').progress).toBe(50);

    // Zero-length tasks weigh 0 as well
    const zeroLength = [
      task('p', 1, 2),
      task('a', 3, 3, { parentId: 'p', progress: 30 }),
      task('b', 4, 4, { parentId: 'p', progress: 60 }),
    ];
    expect(infoOf(computeRollups(zeroLength, ON, EARLY), 'p').progress).toBe(45);
  });

  it("'count' is the plain mean of every child; false keeps the parent's own", () => {
    const tasks = [
      task('p', 1, 2, { progress: 7 }),
      task('a', 1, 11, { parentId: 'p', progress: 0 }),
      task('b', 11, 41, { parentId: 'p', progress: 100 }),
      task('m', 12, 12, { parentId: 'p', progress: 50, type: 'milestone' }),
    ];
    expect(infoOf(computeRollups(tasks, rollupOf({ progress: 'count' }), EARLY), 'p').progress).toBe(50);
    const off = computeRollups(tasks, rollupOf({ progress: false }), EARLY);
    expect(infoOf(off, 'p').progress).toBeNull();
    const rows = applyRollups(flattenTree(tasks), off, rollupOf({ progress: false }));
    expect(rows.find(r => r.task.id === 'p')?.task.progress).toBe(7);
  });

  it('clamps child progress and rounds to a whole percent, 0 and 100 only when exact', () => {
    const third = [
      task('p', 1, 2),
      task('a', 1, 2, { parentId: 'p', progress: 100 }),
      task('b', 2, 3, { parentId: 'p' }),
      task('c', 3, 4, { parentId: 'p', progress: -20 }),
    ];
    expect(infoOf(computeRollups(third, ON, EARLY), 'p').progress).toBe(33);

    const almostDone = [
      task('p', 1, 2),
      task('a', 1, 200, { parentId: 'p', progress: 100 }),
      task('b', 1, 2, { parentId: 'p', progress: 150 - 150 }),
    ];
    // 199 / 200 = 99.5 → would round to 100
    expect(infoOf(computeRollups(almostDone, ON, EARLY), 'p').progress).toBe(99);

    const barelyStarted = [
      task('p', 1, 2),
      task('a', 1, 200, { parentId: 'p' }),
      task('b', 1, 2, { parentId: 'p', progress: 100 }),
    ];
    // 1 / 200 = 0.5 → would round to 1 anyway; 0.4 → 0 is kept at 1
    expect(infoOf(computeRollups(barelyStarted, ON, EARLY), 'p').progress).toBe(1);
    const tiny = [
      task('p', 1, 2),
      task('a', 1, 251, { parentId: 'p' }),
      task('b', 1, 2, { parentId: 'p', progress: 100 }),
    ];
    expect(infoOf(computeRollups(tiny, ON, EARLY), 'p').progress).toBe(1);

    const exact = [
      task('p', 1, 2),
      task('a', 1, 5, { parentId: 'p', progress: 100 }),
      task('b', 2, 9, { parentId: 'p', progress: 100 }),
    ];
    expect(infoOf(computeRollups(exact, ON, EARLY), 'p').progress).toBe(100);
  });
});

// ─── Nested parents ───────────────────────────────────────────

describe('computeRollups — nested parents', () => {
  // g ─┬─ p ─┬─ a  (Jan 1–5, 4 days, 100 %)
  //    │     └─ b  (Jan 9–13, 4 days, 0 %)
  //    └─ c        (Jan 13–17, 4 days, 0 %)
  const tree = (): GanttTask[] => [
    task('g', 20, 21, { progress: 3 }),
    task('p', 25, 26, { parentId: 'g', progress: 90 }),
    task('a', 1, 5, { parentId: 'p', progress: 100 }),
    task('b', 9, 13, { parentId: 'p', progress: 0 }),
    task('c', 13, 17, { parentId: 'g', progress: 0 }),
  ];

  it("rolls a child parent's rolled-up progress and span up into its own parent", () => {
    const map = computeRollups(tree(), ON, EARLY);
    expect([...map.keys()]).toEqual(['g', 'p']);
    const p = infoOf(map, 'p');
    expect(p.progress).toBe(50);
    expect(p.start).toEqual(new Date(2026, 0, 1));
    expect(p.end).toEqual(new Date(2026, 0, 13));
    // g: p weighs its rolled-up span (12 days at 50 %), c 4 days at 0 % → 600 / 16 = 37.5 → 38
    const g = infoOf(map, 'g');
    expect(g.progress).toBe(38);
    expect(g.start).toEqual(new Date(2026, 0, 1));
    expect(g.end).toEqual(new Date(2026, 0, 17));
  });

  it("weighs a child parent by its own dates when dates aren't rolled up", () => {
    const map = computeRollups(tree(), rollupOf({ dates: false }), EARLY);
    // p's own span is 1 day at its rolled-up 50 %, c 4 days at 0 % → 50 / 5 = 10
    expect(infoOf(map, 'g').progress).toBe(10);
    expect(infoOf(map, 'g').start).toBeNull();
    expect(infoOf(map, 'g').end).toBeNull();
  });

  it('lists the direct children in task order, a child parent as its rolled-up copy', () => {
    const tasks = tree();
    const map = computeRollups(tasks, ON, EARLY);
    const g = infoOf(map, 'g');
    expect(g.children.map(c => c.id)).toEqual(['p', 'c']);
    expect(g.children[1]).toBe(tasks[4]);
    const pCopy = g.children[0];
    expect(pCopy).not.toBe(tasks[1]);
    expect(pCopy?.progress).toBe(50);
    expect(rollupSource(pCopy)).toBe(tasks[1]);
    expect(infoOf(map, 'p').children).toEqual([tasks[2], tasks[3]]);
  });

  it('handles a 5 000-level chain without recursion', () => {
    const tasks: GanttTask[] = [task('n0', 1, 2)];
    for (let i = 1; i < 5000; i++) tasks.push(task(`n${i}`, 1, 2, { parentId: `n${i - 1}` }));
    tasks.push(task('leaf', 3, 8, { parentId: 'n4999', progress: 40 }));
    const map = computeRollups(tasks, ON, EARLY);
    expect(map.size).toBe(5000);
    expect(infoOf(map, 'n0').progress).toBe(40);
    expect(infoOf(map, 'n0').end).toEqual(new Date(2026, 0, 8));
  });

  it('reads the tree like flattenTree: unknown, self and cyclic parents make roots', () => {
    const tasks = [
      task('x', 1, 2, { parentId: 'y' }),
      task('y', 3, 4, { parentId: 'x' }),
      task('self', 1, 2, { parentId: 'self' }),
      task('orphan', 1, 2, { parentId: 'missing' }),
    ];
    const map = computeRollups(tasks, ON, EARLY);
    const parents = flattenTree(tasks)
      .filter(r => r.hasChildren)
      .map(r => r.task.id);
    expect([...map.keys()]).toEqual(parents);
    expect(map.has('self')).toBe(false);
    expect(map.has('missing')).toBe(false);
  });

  it('reads a missing end as the start, like normalizeTasks', () => {
    const noEnd = { id: 'a', name: 'a', parentId: 'p', start: new Date(2026, 0, 9) } as unknown as GanttTask;
    const tasks = [task('p', 1, 2), task('b', 3, 5, { parentId: 'p' }), noEnd];
    const info = infoOf(computeRollups(tasks, ON, EARLY), 'p');
    expect(info.start).toEqual(new Date(2026, 0, 3));
    expect(info.end).toBe(noEnd.start);
  });

  it('is empty without rollup, tasks or parents', () => {
    expect(computeRollups(tree(), false, EARLY).size).toBe(0);
    expect(computeRollups([], ON, EARLY).size).toBe(0);
    expect(computeRollups([task('a', 1, 2), task('b', 2, 3)], ON, EARLY).size).toBe(0);
  });
});

// ─── Dates ────────────────────────────────────────────────────

describe('computeRollups — dates', () => {
  it('takes the earliest child start and the latest child end, whatever their order', () => {
    const tasks = [
      task('p', 15, 16),
      task('a', 10, 12, { parentId: 'p' }),
      task('b', 3, 6, { parentId: 'p' }),
      task('c', 8, 20, { parentId: 'p' }),
      task('m', 22, 22, { parentId: 'p', type: 'milestone' }),
    ];
    const info = infoOf(computeRollups(tasks, ON, EARLY), 'p');
    expect(info.start).toBe(tasks[2]?.start);
    expect(info.end).toBe(tasks[4]?.end);
  });

  it('compares ends as drawn: an inclusive midnight end covers its day', () => {
    const ctx: RollupContext = { now: new Date(2025, 0, 1), dates: INCLUSIVE };
    const midnight = task('a', 1, 10, { parentId: 'p' }); // drawn to Jan 11 00:00
    const afternoon: GanttTask = { ...task('b', 2, 10, { parentId: 'p' }), end: new Date(2026, 0, 10, 15) };
    const tasks = [task('p', 1, 2), midnight, afternoon];
    const info = infoOf(computeRollups(tasks, rollupOf(), ctx), 'p');
    // The child's own value: the copy is drawn exactly over it
    expect(info.end).toBe(midnight.end);
    const copy = applyRollups(flattenTree(tasks), computeRollups(tasks, ON, ctx), ON)[0]?.task;
    expect(taskSpan(copy, INCLUSIVE).end).toEqual(new Date(2026, 0, 11));

    // Exclusive: Jan 10 15:00 is later than Jan 10 00:00
    expect(infoOf(computeRollups(tasks, ON, EARLY), 'p').end).toBe(afternoon.end);
  });

  it('keeps date-only values date-only and reads them as local days', () => {
    // Midnight UTC: a local calendar day with `normalizeDateOnly`
    const a: GanttTask = {
      id: 'a',
      name: 'a',
      parentId: 'p',
      start: new Date('2026-03-02'),
      end: new Date('2026-03-06'),
    };
    const b: GanttTask = {
      id: 'b',
      name: 'b',
      parentId: 'p',
      start: new Date('2026-03-04'),
      end: new Date('2026-03-12'),
    };
    const tasks = [task('p', 1, 2), a, b];
    const info = infoOf(computeRollups(tasks, ON, EARLY), 'p');
    expect(info.start).toBe(a.start);
    expect(info.end).toBe(b.end);
    const copy = applyRollups(flattenTree(tasks), computeRollups(tasks, ON, EARLY), ON)[0]?.task;
    const span = taskSpan(copy, EXCLUSIVE);
    expect(span.start).toEqual(new Date(2026, 2, 2));
    expect(span.end).toEqual(new Date(2026, 2, 12));
    // 4 days at 100 % and 8 days at 25 % → (400 + 200) / 12 = 50
    a.progress = 100;
    b.progress = 25;
    expect(infoOf(computeRollups(tasks, ON, EARLY), 'p').progress).toBe(50);
  });

  it("puts the parent's bar exactly over its children", () => {
    const config = resolveConfig({ rollup: true });
    const tasks = [task('p', 20, 21), task('a', 3, 6, { parentId: 'p' }), task('b', 9, 14, { parentId: 'p' })];
    const rows = applyRollups(flattenTree(tasks), computeRollups(tasks, config.rollup, EARLY), config.rollup);
    const origin = calendarDays(new Date(2026, 0, 1), false);
    const toX = (d: Date) => Math.round((calendarDays(d) - origin) * 10);
    const [p, a, b] = computeRowGeometries(rows, { toX }, config);
    expect(p?.barX).toBe(a?.barX);
    expect((p?.barX ?? 0) + (p?.barWidth ?? 0)).toBe((b?.barX ?? 0) + (b?.barWidth ?? 0));
  });
});

// ─── Status and colour ────────────────────────────────────────

describe('computeRollups — status and colour', () => {
  const NOW = new Date(2026, 0, 15);
  const at = (now: Date): RollupContext => ({ now, dates: EXCLUSIVE });

  it('summarises the children at now: overdue, done, not started, in progress', () => {
    const overdue = [
      task('p', 1, 2),
      task('a', 1, 10, { parentId: 'p', progress: 50 }),
      task('b', 1, 30, { parentId: 'p', progress: 100 }),
    ];
    expect(infoOf(computeRollups(overdue, ON, at(NOW)), 'p').status).toBe('overdue');

    const done = [
      task('p', 1, 2),
      task('a', 1, 10, { parentId: 'p', progress: 100 }),
      task('b', 1, 30, { parentId: 'p', status: 'done' }),
    ];
    expect(infoOf(computeRollups(done, ON, at(NOW)), 'p').status).toBe('done');

    const later = [task('p', 1, 2), task('a', 20, 25, { parentId: 'p' }), task('b', 21, 30, { parentId: 'p' })];
    expect(infoOf(computeRollups(later, ON, at(NOW)), 'p').status).toBe('notStarted');

    const mixed = [task('p', 1, 2), task('a', 10, 20, { parentId: 'p' }), task('b', 21, 30, { parentId: 'p' })];
    expect(infoOf(computeRollups(mixed, ON, at(NOW)), 'p').status).toBe('inProgress');

    // The same tasks later on: the first child is past its end
    expect(infoOf(computeRollups(mixed, ON, at(new Date(2026, 0, 22))), 'p').status).toBe('overdue');
  });

  it('counts custom statuses as started and replaces the parent’s own status', () => {
    const tasks = [
      task('p', 1, 2, { status: 'done' }),
      task('a', 20, 25, { parentId: 'p', status: 'blocked' }),
      task('b', 21, 30, { parentId: 'p' }),
    ];
    const map = computeRollups(tasks, ON, at(NOW));
    expect(infoOf(map, 'p').status).toBe('inProgress');
    const copy = applyRollups(flattenTree(tasks), map, ON)[0]?.task;
    expect(copy.status).toBe('inProgress');
    expect(taskStatus(copy, NOW)).toBe('inProgress');
  });

  it("uses a child parent's summary status", () => {
    const tasks = [
      task('g', 1, 2),
      task('p', 1, 2, { parentId: 'g', progress: 100 }), // its own progress says done
      task('a', 10, 30, { parentId: 'p' }),
      task('c', 20, 30, { parentId: 'g', progress: 100 }),
    ];
    const map = computeRollups(tasks, ON, at(NOW));
    expect(infoOf(map, 'p').status).toBe('inProgress');
    expect(infoOf(map, 'g').status).toBe('inProgress');
  });

  it("paints the summary status with color: 'status', nothing with color: false", () => {
    const tasks = [task('p', 1, 2), task('a', 1, 10, { parentId: 'p' }), task('b', 20, 30, { parentId: 'p' })];
    const status = infoOf(computeRollups(tasks, rollupOf({ color: 'status' }), at(NOW)), 'p');
    expect(status.color).toBe(statusPaint('overdue'));
    expect(infoOf(computeRollups(tasks, ON, at(NOW)), 'p').color).toBeNull();
  });

  it('calls a color function with the children and the rolled-up parent', () => {
    const tasks = [
      task('g', 1, 2),
      task('p', 1, 2, { parentId: 'g' }),
      task('a', 3, 5, { parentId: 'p', progress: 100 }),
      task('c', 10, 20, { parentId: 'g' }),
    ];
    const calls: { parent: GanttTask; children: readonly GanttTask[] }[] = [];
    const color = (children: readonly GanttTask[], parent: GanttTask) => {
      calls.push({ parent, children });
      return parent.id === 'p' ? '#123456' : undefined;
    };
    const map = computeRollups(tasks, rollupOf({ color }), at(NOW));
    expect(calls.map(c => c.parent.id)).toEqual(['p', 'g']);
    expect(calls[0]?.parent.progress).toBe(100);
    expect(calls[0]?.parent.start).toBe(tasks[2]?.start);
    expect(calls[1]?.children[0]?.progress).toBe(100); // p's copy
    expect(infoOf(map, 'p').color).toBe('#123456');
    expect(infoOf(map, 'g').color).toBeNull();
  });
});

describe('summaryStatus', () => {
  it('follows overdue > all done > none started > in progress', () => {
    expect(summaryStatus(['done', 'overdue', 'notStarted'])).toBe('overdue');
    expect(summaryStatus(['done', 'done'])).toBe('done');
    expect(summaryStatus(['notStarted', 'notStarted'])).toBe('notStarted');
    expect(summaryStatus(['done', 'notStarted'])).toBe('inProgress');
    expect(summaryStatus(['notStarted', 'on hold'])).toBe('inProgress');
    expect(summaryStatus([])).toBe('notStarted');
  });
});

// ─── Rows ─────────────────────────────────────────────────────

describe('applyRollups', () => {
  const NOW = new Date(2026, 0, 4);
  const ctx: RollupContext = { now: NOW, dates: EXCLUSIVE };
  const tree = (): GanttTask[] => [
    task('g', 20, 21, { progress: 3, draggable: true, status: 'done' }),
    task('p', 25, 26, { parentId: 'g' }),
    task('a', 1, 5, { parentId: 'p', progress: 100 }),
    task('b', 9, 13, { parentId: 'p', progress: 0 }),
    task('c', 13, 17, { parentId: 'g', progress: 0 }),
    task('solo', 2, 3),
  ];

  it('gives each rolled-up parent row a copy with the rolled-up values that cannot be dragged', () => {
    const tasks = tree();
    const map = computeRollups(tasks, ON, ctx);
    const rows = flattenTree(tasks);
    const out = applyRollups(rows, map, ON);
    const byId = new Map(out.map(r => [r.task.id, r]));
    const g = byId.get('g')?.task as GanttTask;
    expect(g).not.toBe(tasks[0]);
    expect(g).toMatchObject({
      id: 'g',
      name: 'g',
      start: tasks[2]?.start,
      end: tasks[4]?.end,
      progress: infoOf(map, 'g').progress,
      status: 'inProgress',
      draggable: false,
    });
    expect(byId.get('p')?.task.draggable).toBe(false);
    // The copy is the one in the grandparent's children
    expect(byId.get('p')?.task).toBe(infoOf(map, 'g').children[0]);
    // Leaf rows are the same objects; the parent rows keep their tree fields
    for (const id of ['a', 'b', 'c', 'solo']) expect(byId.get(id)).toBe(rows.find(r => r.task.id === id));
    const gRow = rows.find(r => r.task.id === 'g') as GanttFlatRow;
    expect({ ...byId.get('g'), task: gRow.task }).toEqual(gRow);
  });

  it('leaves the raw tasks untouched and maps copies back to them', () => {
    const tasks = tree();
    const before = structuredClone(tasks);
    const out = applyRollups(
      flattenTree(tasks),
      computeRollups(tasks, rollupOf({ color: 'status', progress: 'count' }), ctx),
      ON,
    );
    expect(tasks).toEqual(before);
    for (const row of out) expect(tasks).toContain(rollupSource(row.task));
    expect(rollupSource(tasks[0])).toBe(tasks[0]);
  });

  it('keeps the dates and drag of a parent when dates are not rolled up', () => {
    const tasks = tree();
    const cfg = rollupOf({ dates: false });
    const out = applyRollups(flattenTree(tasks), computeRollups(tasks, cfg, ctx), cfg);
    const g = out.find(r => r.task.id === 'g')?.task as GanttTask;
    expect(g.start).toBe(tasks[0]?.start);
    expect(g.end).toBe(tasks[0]?.end);
    expect(g.draggable).toBe(true);
    expect(g.progress).toBe(infoOf(computeRollups(tasks, cfg, ctx), 'g').progress);
  });

  it('is stable: the same copies on every call, the same rows when applied twice', () => {
    const tasks = tree();
    const map = computeRollups(tasks, ON, ctx);
    const rows = flattenTree(tasks);
    const once = applyRollups(rows, map, ON);
    const again = applyRollups(rows, map, ON);
    expect(again.map(r => r.task)).toEqual(once.map(r => r.task));
    once.forEach((r, i) => expect(again[i]?.task).toBe(r.task));
    const twice = applyRollups(once, map, ON);
    twice.forEach((r, i) => expect(r).toBe(once[i]));
  });

  it('rebuilds a copy from a different row task or an older rollup', () => {
    const tasks = tree();
    const first = computeRollups(tasks, ON, ctx);
    const rolled = applyRollups(flattenTree(tasks), first, ON);
    // The clock moves on: new infos, rows still carrying the old copies
    const later = computeRollups(tasks, ON, { now: new Date(2026, 0, 30), dates: EXCLUSIVE });
    const out = applyRollups(rolled, later, ON);
    const g = out.find(r => r.task.id === 'g')?.task as GanttTask;
    expect(g.status).toBe('overdue');
    expect(rollupSource(g)).toBe(tasks[0]);
    // The new info's own copy: still the one in the grandparent's children
    expect(out.find(r => r.task.id === 'p')?.task).toBe(infoOf(later, 'g').children[0]);

    // Rows built from other task objects with the same ids get their own copies
    const clones = tasks.map(t => ({ ...t }));
    const fromClones = applyRollups(flattenTree(clones), first, ON).find(r => r.task.id === 'g')?.task;
    expect(rollupSource(fromClones as GanttTask)).toBe(clones[0]);
  });

  it('returns the rows as they are without rollup or rollups', () => {
    const tasks = tree();
    const rows = flattenTree(tasks);
    expect(applyRollups(rows, computeRollups(tasks, ON, ctx), false)).toBe(rows);
    expect(applyRollups(rows, new Map(), ON)).toBe(rows);
  });
});

// ─── Segments ─────────────────────────────────────────────────

describe('rollupSegments', () => {
  const origin = calendarDays(new Date(2026, 0, 1), false);
  const toX = (d: Date) => Math.round((calendarDays(d) - origin) * 10);
  const cfgOf = (rollup: ResolvedGanttConfig['rollup']) => ({ ...resolveConfig({}), rollup });
  const tasks = [
    task('p', 1, 2),
    task('a', 1, 4, { parentId: 'p', barColor: '#ff0000' }),
    task('m', 6, 6, { parentId: 'p', type: 'milestone' }),
    task('z', 8, 8, { parentId: 'p' }), // zero length: the minimum width
    task('b', 9, 13, { parentId: 'p' }),
  ];
  const info = infoOf(computeRollups(tasks, ON, EARLY), 'p');

  it('is null unless rollup.segments is on', () => {
    expect(rollupSegments(info, { toX, cfg: cfgOf(false) })).toBeNull();
    expect(rollupSegments(info, { toX, cfg: cfgOf(ON) })).toBeNull();
  });

  it("places each child's drawn span in its own colour", () => {
    const cfg = cfgOf(rollupOf({ segments: true }));
    const styleOf = (t: GanttTask) => (t.barColor ? { color: t.barColor } : null);
    expect(rollupSegments(info, { toX, cfg, styleOf })).toEqual([
      { x: 0, width: 30, paint: '#ff0000' },
      { x: 49, width: 2, paint: themeVar('milestoneColor') },
      { x: 70, width: cfg.bar.minWidth, paint: themeVar('barColor') },
      { x: 80, width: 40, paint: themeVar('barColor') },
    ]);
  });

  it('clips the segments to the bar and drops the ones outside it', () => {
    const cfg = cfgOf(rollupOf({ segments: true }));
    const segments = rollupSegments(info, { toX, cfg, bar: { x: 20, width: 40 } });
    expect(segments).toEqual([
      { x: 20, width: 10, paint: themeVar('barColor') },
      { x: 49, width: 2, paint: themeVar('milestoneColor') },
    ]);
    expect(rollupSegments(info, { toX, cfg, bar: { x: 200, width: 10 } })).toBeNull();
  });

  it('draws a child parent over its rolled-up span', () => {
    const nested = [
      task('g', 1, 2),
      task('p', 20, 21, { parentId: 'g' }),
      task('a', 3, 5, { parentId: 'p' }),
      task('b', 7, 9, { parentId: 'p' }),
    ];
    const cfg = cfgOf(rollupOf({ segments: true }));
    const g = infoOf(computeRollups(nested, ON, EARLY), 'g');
    expect(rollupSegments(g, { toX, cfg })).toEqual([{ x: 20, width: 60, paint: themeVar('barColor') }]);
  });
});

// ─── Cost ─────────────────────────────────────────────────────

describe('rollup cost', () => {
  it('rolls up and applies 10 000 tasks in under 80 ms (linear: about 10 ms idle; an O(n²) walk takes seconds)', () => {
    // 1 000 groups under 100 roots, 9 children each (one a milestone)
    const tasks: GanttTask[] = [];
    for (let r = 0; r < 100; r++) tasks.push(task(`r${r}`, 1, 2));
    for (let g = 0; g < 1000; g++) {
      tasks.push(task(`g${g}`, 1, 2, { parentId: `r${g % 100}` }));
      for (let c = 0; c < 9; c++) {
        // Spread over about two years, like a real portfolio
        const from = 1 + ((g * 37 + c * 11) % 700);
        const extra: Partial<GanttTask> = { parentId: `g${g}`, progress: (g * 7 + c * 13) % 101 };
        if (c === 8) extra.type = 'milestone';
        tasks.push(task(`t${g}-${c}`, from, from + 1 + (c % 5), extra));
      }
    }
    expect(tasks.length).toBe(10_100);
    const rows = flattenTree(tasks);
    const config = rollupOf({ color: 'status' });
    const ctx: RollupContext = { now: new Date(2026, 0, 10), dates: EXCLUSIVE };
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const map = computeRollups(tasks, config, ctx);
      applyRollups(rows, map, config);
      best = Math.min(best, performance.now() - t0);
      expect(map.size).toBe(1100);
    }
    // Generous for loaded CI machines (it measured 32–37 ms under parallel load); still catches a quadratic walk
    expect(best).toBeLessThan(80);
  });
});
