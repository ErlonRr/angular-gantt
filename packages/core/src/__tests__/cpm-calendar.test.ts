// ─────────────────────────────────────────────────────────────
//  Tests — the critical path in working time (Phase 13): durations,
//  lags and float count working days (or working hours ÷ hours per
//  day) with `calendar.durations: 'working'`, calendar days
//  otherwise; `CPMResult.durations` says which. October 2026: Monday
//  the 12th, Saturday the 17th, Wednesday the 21st a holiday. Dates
//  are built with `new Date(y, m, d, …)`: every assertion holds in any
//  time zone (`pnpm test:tz`).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { computeCriticalPath, longestChain } from '../gantt-cpm';
import { formatFloat } from '../calendar/durations';
import { resolveConfig } from '../render/config';
import { DependencyType, type GanttOptions, type GanttTask } from '../types';

/** A local instant in October 2026. Timed values avoid whole hours that are UTC midnight somewhere (`:15`). */
const oct = (day: number, h = 0, mi = 0): Date => new Date(2026, 9, day, h, mi);
const HOLIDAYS: NonNullable<GanttOptions['nonWorkingTime']> = { holidays: [oct(21)] };

const WORKING = resolveConfig({ calendar: true, nonWorkingTime: HOLIDAYS });
const CALENDAR_DAYS = resolveConfig({ calendar: { durations: 'calendar' }, nonWorkingTime: HOLIDAYS });
const NONE = resolveConfig({ nonWorkingTime: HOLIDAYS });

const task = (id: string, from: number, to: number, extra: Partial<GanttTask> = {}): GanttTask => ({
  id,
  name: id,
  start: oct(from),
  end: oct(to),
  ...extra,
});
const sorted = (ids: Set<string>) => [...ids].sort();
const near = (a: number | undefined, b: number, eps = 1e-6) => expect(Math.abs((a ?? NaN) - b)).toBeLessThan(eps);

describe('computeCriticalPath — working time', () => {
  // A: Mon 12 → Fri 16 (4 days), B: Fri 16 → Mon 19 (3 calendar days, 1 working day) after A,
  // E: Mon 19 → Thu 22 (3 calendar days; the 21st is a holiday: 2 working days) one day after B,
  // C: Mon 12 → Sat 17 (5 days both ways), alone.
  const chain: GanttTask[] = [
    task('A', 12, 16),
    task('B', 16, 19, { dependency: 'A' }),
    task('E', 19, 22, { dependency: [{ taskId: 'B', type: DependencyType.FS, lag: 1 }] }),
    task('C', 12, 17),
  ];

  it('measures durations, lags and float in working days', () => {
    const r = computeCriticalPath(chain, WORKING);
    expect(r.durations).toBe('working');
    // A 4 + B 1 + lag 1 + E 2 = 8 working days; C is 5 days: float 3
    expect(sorted(r.criticalIds)).toEqual(['A', 'B', 'E']);
    expect(r.floatMap.get('C')).toBe(3);
    expect(r.floatMap.get('A')).toBe(0);
    expect(r.warnings).toEqual([]);
  });

  it('measures the same tasks in calendar days without a calendar', () => {
    const r = computeCriticalPath(chain, NONE);
    expect(r.durations).toBe('calendar');
    // A 4 + B 3 + lag 1 + E 3 = 11 calendar days; C is 5 days: float 6
    expect(sorted(r.criticalIds)).toEqual(['A', 'B', 'E']);
    expect(r.floatMap.get('C')).toBe(6);
  });

  it("`durations: 'calendar'` reads like no calendar", () => {
    const r = computeCriticalPath(chain, CALENDAR_DAYS);
    expect(r.durations).toBe('calendar');
    const plain = computeCriticalPath(chain, NONE);
    expect(sorted(r.criticalIds)).toEqual(sorted(plain.criticalIds));
    expect([...r.floatMap]).toEqual([...plain.floatMap]);
  });

  it('two tasks equal in working days but not in calendar days: the critical set changes with the mode', () => {
    // P crosses a weekend (7 calendar days, 5 working), Q does not (5 calendar days, 5 working)
    const tasks = [task('P', 12, 19), task('Q', 12, 17)];
    const calendar = computeCriticalPath(tasks, NONE);
    expect(sorted(calendar.criticalIds)).toEqual(['P']);
    expect(calendar.floatMap.get('Q')).toBe(2);
    const working = computeCriticalPath(tasks, WORKING);
    expect(sorted(working.criticalIds)).toEqual(['P', 'Q']);
    expect(working.floatMap.get('Q')).toBe(0);
  });

  it('a lag is working days: a one-day lead over a weekend', () => {
    // b follows a by one day of lag: a working day, so the weekend does not count
    const tasks = [task('a', 12, 17), task('b', 19, 20, { dependency: [{ taskId: 'a', lag: 1 }] }), task('z', 12, 21)];
    // working: a 5 + lag 1 + b 1 = 7; z (12 → 21 = 12, 13, 14, 15, 16, 19, 20 = 7) ties
    const working = computeCriticalPath(tasks, WORKING);
    expect(working.floatMap.get('z')).toBe(0);
    // calendar: a 5 + 1 + 1 = 7; z = 9
    const calendar = computeCriticalPath(tasks, NONE);
    expect(calendar.floatMap.get('a')).toBe(2);
    expect(sorted(calendar.criticalIds)).toEqual(['z']);
  });

  it('every dependency type works in working days', () => {
    const base = [task('p', 12, 17), task('q', 17, 20)]; // 5 and 1 working days (Sat 17 → Tue 20: Mon 19)
    const types = [DependencyType.FS, DependencyType.SS, DependencyType.FF, DependencyType.SF];
    const floats = types.map(type => {
      const tasks = [base[0], { ...base[1], dependency: [{ taskId: 'p', type, lag: 0 }] }];
      return [...computeCriticalPath(tasks, WORKING).floatMap.values()];
    });
    // FS: q starts when p ends (6 days in all); SS: q starts with p, so it has 4 days of float; FF: q ends
    // with p, so it is critical; SF: q ends when p starts, so it has 4 days of float
    expect(floats).toEqual([
      [0, 0],
      [0, 4],
      [0, 0],
      [0, 4],
    ]);
  });

  it('an inclusive end counts its last working day', () => {
    // Mon 12 .. Fri 16 inclusive = 5 working days; Mon 12 .. Sat 17 exclusive is the same
    const inclusive = resolveConfig({ calendar: true, endDateMode: 'inclusive', nonWorkingTime: HOLIDAYS });
    const tasks = [task('x', 12, 16), task('y', 12, 17)];
    const r = computeCriticalPath(tasks, inclusive);
    expect(sorted(r.criticalIds)).toEqual(['x', 'y']);
  });

  it('measures the float of an hour calendar in working hours ÷ hours per day', () => {
    const hours = resolveConfig({ calendar: { unit: 'hour', hoursPerDay: 8 } }); // 09:00–17:00
    const tasks: GanttTask[] = [
      { id: 'T1', name: 'T1', start: oct(12, 9, 15), end: oct(12, 16, 15) }, // 7 h = 0.875 days
      { id: 'T2', name: 'T2', start: oct(12, 9, 15), end: oct(13, 13, 15) }, // 7.75 h + 4.25 h = 1.5 days
    ];
    const r = computeCriticalPath(tasks, hours);
    expect(r.durations).toBe('working');
    expect(sorted(r.criticalIds)).toEqual(['T2']);
    near(r.floatMap.get('T1'), 0.625);
    expect(formatFloat(r.floatMap.get('T1') ?? NaN, hours)).toBe('5h');
    expect(formatFloat(r.floatMap.get('T2') ?? NaN, hours)).toBe('0d');
    // six hours per day: the same tasks are 1.17 and 2 days long, the float 0.83 days = 5 h
    const six = resolveConfig({ calendar: { unit: 'hour', hoursPerDay: 6 } });
    const r6 = computeCriticalPath(tasks, six);
    near(r6.floatMap.get('T1'), 5 / 6);
    expect(formatFloat(r6.floatMap.get('T1') ?? NaN, six)).toBe('5h');
  });

  it('`durations` is set even without tasks', () => {
    expect(computeCriticalPath([], WORKING).durations).toBe('working');
    expect(computeCriticalPath([], NONE).durations).toBe('calendar');
    expect(computeCriticalPath([]).durations).toBe('calendar');
  });

  it('reports cycles and unknown predecessors as before', () => {
    const tasks = [
      task('m', 12, 14, { dependency: 'n' }),
      task('n', 14, 16, { dependency: 'm' }),
      task('o', 12, 13, { dependency: 'ghost' }),
    ];
    const r = computeCriticalPath(tasks, WORKING);
    expect(r.warnings.some(w => w.includes('Cycle'))).toBe(true);
    expect(r.warnings.some(w => w.includes("'ghost'"))).toBe(true);
  });
});

describe('computeCriticalPath — no calendar is exactly today', () => {
  const tasks: GanttTask[] = [
    task('A', 12, 16),
    task('B', 16, 19, { dependency: 'A' }),
    task('E', 19, 22, { dependency: [{ taskId: 'B', type: DependencyType.FS, lag: 1 }] }),
    task('C', 12, 17),
    { id: 'H', name: 'H', start: oct(12, 8, 15), end: oct(12, 20, 15) },
  ];
  const result = (options: Parameters<typeof computeCriticalPath>[1]) => {
    const r = computeCriticalPath(tasks, options);
    return { critical: [...r.criticalIds], float: [...r.floatMap], warnings: r.warnings, durations: r.durations };
  };

  it('an unset, null or undefined calendar and the old options shape agree', () => {
    const today = result({});
    expect(result(undefined)).toEqual(today);
    expect(result({ endDateMode: 'exclusive', normalizeDateOnly: true })).toEqual(today);
    expect(result({ calendar: null })).toEqual(today);
    expect(result({ calendar: undefined })).toEqual(today);
    expect(result(NONE)).toEqual(today);
    expect(today.durations).toBe('calendar');
  });

  it('keeps the hand-computed calendar-day numbers', () => {
    const r = computeCriticalPath(tasks, {});
    // A 4 + B 3 + lag 1 + E 3 = 11 days; C 5 days (float 6); H half a day (float 10.5)
    expect(r.floatMap.get('C')).toBe(6);
    expect(r.floatMap.get('H')).toBe(10.5);
    expect(r.floatMap.get('E')).toBe(0);
  });

  it('seeded random networks: the same result with and without a null calendar', () => {
    let seed = 7;
    const next = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
    const many: GanttTask[] = Array.from({ length: 300 }, (_, i) => {
      const from = Math.floor(next() * 40);
      const t: GanttTask = {
        id: `t${i}`,
        name: `t${i}`,
        start: new Date(2026, 9, 1 + from, Math.floor(next() * 3) * 8),
        end: new Date(2026, 9, 2 + from + Math.floor(next() * 12)),
      };
      if (i > 0 && next() < 0.7) {
        const type = [DependencyType.FS, DependencyType.SS, DependencyType.FF, DependencyType.SF][
          Math.floor(next() * 4)
        ];
        t.dependency = [{ taskId: `t${Math.floor(next() * i)}`, type, lag: Math.floor(next() * 5) - 1 }];
      }
      return t;
    });
    const plain = computeCriticalPath(many);
    const nulled = computeCriticalPath(many, { calendar: null });
    const asCalendarDays = computeCriticalPath(many, CALENDAR_DAYS);
    for (const other of [nulled, asCalendarDays]) {
      expect([...other.criticalIds]).toEqual([...plain.criticalIds]);
      expect([...other.floatMap]).toEqual([...plain.floatMap]);
      expect(other.warnings).toEqual(plain.warnings);
    }
  });
});

describe('longestChain — working time', () => {
  // x1 → x2 cross the weekend and the holiday: Thu 15 → Fri 16 → Wed 21 is 6 calendar days but 4 working
  // days; z (Mon 12 → Sat 17) is 5 days either way and starts before both can follow it.
  const tasks: GanttTask[] = [task('x1', 15, 16), task('x2', 16, 21), task('z', 12, 17)];

  it('picks the chain with the most calendar days without a calendar', () => {
    expect(longestChain(tasks, NONE)).toEqual(['x1', 'x2']);
    expect(longestChain(tasks)).toEqual(['x1', 'x2']);
    expect(longestChain(tasks, { calendar: null })).toEqual(['x1', 'x2']);
    expect(longestChain(tasks, CALENDAR_DAYS)).toEqual(['x1', 'x2']);
  });

  it('picks the chain with the most working days with a calendar', () => {
    expect(longestChain(tasks, WORKING)).toEqual(['z']);
  });
});

describe('computeCriticalPath — performance (D19)', () => {
  /** 100 chains of 100 tasks, timed, over 2026–2028 with a holiday per month. */
  const holidays = Array.from({ length: 36 }, (_, i) => new Date(2026 + Math.floor(i / 12), i % 12, 15));
  const config = resolveConfig({ calendar: true, nonWorkingTime: { holidays } });
  const tasks: GanttTask[] = Array.from({ length: 10_000 }, (_, i) => {
    const link = i % 100;
    const start = new Date(2026, 0, 1 + ((link * 3) % 300));
    const t: GanttTask = {
      id: `t${i}`,
      name: `t${i}`,
      start,
      end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1 + (i % 9)),
    };
    if (link > 0) t.dependency = `t${i - 1}`;
    return t;
  });

  it('runs a 10 000-task network with a calendar in a few hundred ms', () => {
    let best = Infinity;
    let result = computeCriticalPath([]);
    for (let run = 0; run < 3; run++) {
      const t0 = performance.now();
      result = computeCriticalPath(tasks, config);
      best = Math.min(best, performance.now() - t0);
    }
    expect(result.durations).toBe('working');
    expect(result.floatMap.size).toBe(10_000);
    expect(best).toBeLessThan(400); // D19: 200 ms, widened for loaded machines
  });
});
