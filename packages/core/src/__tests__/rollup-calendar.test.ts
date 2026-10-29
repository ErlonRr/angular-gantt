// ─────────────────────────────────────────────────────────────
//  Tests — rollup progress weights in working time (Phase 13): a
//  child weighs its measured length (working days, or working hours
//  ÷ hours per day) with a working calendar, calendar days otherwise;
//  the rolled-up dates, status and colour do not change. October
//  2026: Monday the 12th, Saturday the 17th, Wednesday the 21st a
//  holiday. Dates are built with `new Date(y, m, d, …)`: every
//  assertion holds in any time zone (`pnpm test:tz`).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { applyRollups, computeRollups, rollupSource, type RollupContext } from '../gantt-rollup';
import { flattenTree } from '../gantt-data';
import { resolveConfig, type ResolvedRollupOptions } from '../render/config';
import type { GanttOptions, GanttTask } from '../types';

const ON: ResolvedRollupOptions = { progress: 'duration', dates: true, color: false, segments: false };
const NOW = new Date(2025, 0, 1);
/** A local instant in October 2026. Timed values avoid whole hours that are UTC midnight somewhere (`:15`). */
const oct = (day: number, h = 0, mi = 0): Date => new Date(2026, 9, day, h, mi);
const HOLIDAYS: NonNullable<GanttOptions['nonWorkingTime']> = { holidays: [oct(21)] };

const WORKING: RollupContext = { now: NOW, dates: resolveConfig({ calendar: true, nonWorkingTime: HOLIDAYS }) };
const HOURS: RollupContext = {
  now: NOW,
  dates: resolveConfig({ calendar: { unit: 'hour', hoursPerDay: 8 } }),
};
const CALENDAR_DAYS: RollupContext = {
  now: NOW,
  dates: resolveConfig({ calendar: { durations: 'calendar' }, nonWorkingTime: HOLIDAYS }),
};
const NONE: RollupContext = { now: NOW, dates: resolveConfig({ nonWorkingTime: HOLIDAYS }) };
/** The shape the bindings passed before the calendar existed */
const OLD_SHAPE: RollupContext = { now: NOW, dates: { endDateMode: 'exclusive', normalizeDateOnly: true } };

const task = (id: string, from: Date, to: Date, extra: Partial<GanttTask> = {}): GanttTask => ({
  id,
  name: id,
  start: from,
  end: to,
  ...extra,
});
const child = (id: string, from: number, to: number, progress: number, extra: Partial<GanttTask> = {}) =>
  task(id, oct(from), oct(to), { parentId: 'p', progress, ...extra });
const parent = (extra: Partial<GanttTask> = {}) => task('p', oct(12), oct(30), extra);
const progressOf = (tasks: GanttTask[], ctx: RollupContext, id = 'p') =>
  computeRollups(tasks, ON, ctx).get(id)?.progress;

describe('computeRollups — progress weights in working days', () => {
  // a: Fri 16 → Mon 19 (3 calendar days, 1 working day), 0 %; b: Mon 19 → Wed 21 (2 and 2), 100 %
  const tasks = [parent(), child('a', 16, 19, 0), child('b', 19, 21, 100)];

  it('weighs the children by working days: 2 of 3 days done', () => {
    expect(progressOf(tasks, WORKING)).toBe(67);
  });

  it('weighs them by calendar days without a calendar: 2 of 5 days done', () => {
    expect(progressOf(tasks, NONE)).toBe(40);
    expect(progressOf(tasks, OLD_SHAPE)).toBe(40);
  });

  it("`durations: 'calendar'` weighs by calendar days", () => {
    expect(progressOf(tasks, CALENDAR_DAYS)).toBe(40);
  });

  it('a child lying on non-working time weighs nothing', () => {
    // Sat 17 → Mon 19 has no working time and Mon 19 → Tue 20 has one day
    const weekend = [parent(), child('w', 17, 19, 100), child('d', 19, 20, 0)];
    expect(progressOf(weekend, WORKING)).toBe(0);
    expect(progressOf(weekend, NONE)).toBe(67);
  });

  it('children with no working time at all fall back to the plain mean', () => {
    const idle = [parent(), child('w1', 17, 19, 100), child('w2', 24, 26, 50)];
    expect(progressOf(idle, WORKING)).toBe(75);
  });

  it('a milestone still weighs nothing', () => {
    const withMilestone = [parent(), child('a', 12, 14, 50), child('m', 15, 15, 100, { type: 'milestone' as never })];
    expect(progressOf(withMilestone, WORKING)).toBe(50);
  });

  it('an inclusive end counts its last working day', () => {
    // a: Mon 12 .. Fri 16 inclusive = 5 working days; b: Mon 19 .. Mon 19 inclusive = 1
    const inclusive: RollupContext = {
      now: NOW,
      dates: resolveConfig({ calendar: true, endDateMode: 'inclusive', nonWorkingTime: HOLIDAYS }),
    };
    expect(progressOf([parent(), child('a', 12, 16, 0), child('b', 19, 19, 60)], inclusive)).toBe(10);
  });

  it('nested parents weigh by the rolled-up span: a parent inside a parent', () => {
    // g ⊃ [t (Mon 12 → Fri 16: 4 working days, 0 %), p ⊃ [c (Fri 16 → Tue 20: 2 working days, 100 %)]]
    const nested: GanttTask[] = [
      task('g', oct(12), oct(30)),
      task('t', oct(12), oct(16), { parentId: 'g', progress: 0 }),
      task('p', oct(16), oct(20), { parentId: 'g' }),
      task('c', oct(16), oct(20), { parentId: 'p', progress: 100 }),
    ];
    expect(progressOf(nested, WORKING, 'g')).toBe(33);
    expect(progressOf(nested, NONE, 'g')).toBe(50);
  });
});

describe('computeRollups — progress weights in working hours', () => {
  // a: Mon 12 15:15 → Tue 13 11:15 (1.75 h + 2.25 h = 4 working hours, 20 elapsed), 0 %;
  // b: Wed 14 09:15 → 16:15 (7 working hours, 7 elapsed), 90 %
  const tasks = [
    parent(),
    task('a', oct(12, 15, 15), oct(13, 11, 15), { parentId: 'p', progress: 0 }),
    task('b', oct(14, 9, 15), oct(14, 16, 15), { parentId: 'p', progress: 90 }),
  ];

  it('weighs the children by working hours: 7 of 11 hours done', () => {
    expect(progressOf(tasks, HOURS)).toBe(57);
  });

  it('the hours per day only scale the weights: the progress does not change', () => {
    const six: RollupContext = { now: NOW, dates: resolveConfig({ calendar: { unit: 'hour', hoursPerDay: 6 } }) };
    expect(progressOf(tasks, six)).toBe(57);
  });

  it('weighs them by elapsed time without a working calendar: 7 of 27 hours done', () => {
    expect(progressOf(tasks, NONE)).toBe(23);
  });
});

describe('computeRollups — only the weights change', () => {
  const tasks = [
    parent({ status: 'inProgress' }),
    child('a', 16, 19, 20),
    child('b', 19, 21, 100, { status: 'done' }),
    child('c', 22, 26, 10),
  ];

  it('rolls up the same dates, status and children with and without a calendar', () => {
    const working = computeRollups(tasks, ON, WORKING).get('p');
    const none = computeRollups(tasks, ON, NONE).get('p');
    expect(working?.start).toBe(tasks[1]?.start);
    expect(working?.end).toBe(tasks[3]?.end);
    expect(working?.start).toBe(none?.start);
    expect(working?.end).toBe(none?.end);
    expect(working?.status).toBe(none?.status);
    expect(working?.children.map(c => c.id)).toEqual(['a', 'b', 'c']);
    expect(working?.progress).not.toBe(none?.progress);
  });

  it('`count` progress ignores the calendar', () => {
    const count = { ...ON, progress: 'count' } as const;
    expect(computeRollups(tasks, count, WORKING).get('p')?.progress).toBe(
      computeRollups(tasks, count, NONE).get('p')?.progress,
    );
  });

  it('rolled-up parents stay non-draggable, drawn over their children, with the raw task behind', () => {
    const rolled = computeRollups(tasks, ON, WORKING);
    const row = applyRollups(flattenTree(tasks), rolled, ON)[0];
    expect(row?.task.draggable).toBe(false);
    expect(row?.task.start).toBe(tasks[1]?.start);
    expect(row?.task.end).toBe(tasks[3]?.end);
    expect(row?.task.progress).toBe(rolled.get('p')?.progress);
    expect(row && rollupSource(row.task)).toBe(tasks[0]);
  });
});

describe('computeRollups — no calendar is exactly today', () => {
  let seed = 11;
  const next = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
  const many: GanttTask[] = [];
  for (let g = 0; g < 20; g++) {
    many.push(task(`g${g}`, oct(1), oct(30)));
    for (let i = 0; i < 12; i++) {
      const from = 1 + Math.floor(next() * 20);
      many.push(
        task(`g${g}c${i}`, oct(from, Math.floor(next() * 3) * 8), oct(from + 1 + Math.floor(next() * 8)), {
          parentId: `g${g}`,
          progress: Math.floor(next() * 101),
        }),
      );
    }
  }
  const run = (ctx: RollupContext) =>
    [...computeRollups(many, ON, ctx)].map(([id, i]) => [id, i.progress, i.start, i.end, i.status]);

  it('an unset, null or calendar-day reading agrees with the old shape', () => {
    const today = run(OLD_SHAPE);
    expect(today.length).toBe(20);
    expect(run(NONE)).toEqual(today);
    expect(run({ now: NOW, dates: { endDateMode: 'exclusive', normalizeDateOnly: true, calendar: null } })).toEqual(
      today,
    );
    expect(run(CALENDAR_DAYS)).toEqual(today);
  });
});

describe('computeRollups — performance (D19)', () => {
  const holidays = Array.from({ length: 36 }, (_, i) => new Date(2026 + Math.floor(i / 12), i % 12, 15));
  const ctx: RollupContext = { now: NOW, dates: resolveConfig({ calendar: true, nonWorkingTime: { holidays } }) };
  const tasks: GanttTask[] = [];
  for (let g = 0; g < 100; g++) {
    tasks.push(task(`g${g}`, new Date(2026, 0, 1), new Date(2028, 11, 31)));
    for (let i = 0; i < 99; i++) {
      const start = new Date(2026, 0, 1 + ((g * 7 + i * 11) % 700), (i % 3) * 4);
      tasks.push(
        task(`g${g}c${i}`, start, new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1 + (i % 12)), {
          parentId: `g${g}`,
          progress: i % 101,
        }),
      );
    }
  }

  it('rolls up 10 000 tasks with a calendar in a few hundred ms', () => {
    let best = Infinity;
    let rolled = computeRollups([], ON, ctx);
    for (let run = 0; run < 3; run++) {
      const t0 = performance.now();
      rolled = computeRollups(tasks, ON, ctx);
      best = Math.min(best, performance.now() - t0);
    }
    expect(rolled.size).toBe(100);
    expect(best).toBeLessThan(250); // D19: 120 ms, widened for loaded machines
  });
});
