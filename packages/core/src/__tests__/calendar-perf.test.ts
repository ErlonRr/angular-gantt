// ─────────────────────────────────────────────────────────────
//  Tests — Phase 13 (step 2.1): the working-time engine stays fast with
//  many holidays (D19: O(log H) per call, built once per `resolveConfig`).
//  Budgets are load-sensitive (parallel agents, CI): each takes the best of
//  several runs and is wide; a linear scan over the holidays misses them by
//  an order of magnitude, a noisy machine does not.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  buildWorkingCalendar,
  calendarDays,
  resolveNonWorking,
  type GanttHourRange,
  type WorkingCalendar,
} from '../index';
import { buildOracle, seeded } from './calendar-oracle';

const SHIFTS: GanttHourRange[] = [
  { start: 8, end: 12 },
  { start: 13, end: 17 },
];

/** `count` one-day holidays spread over 2020–2029. */
const holidaysOf = (count: number): Date[] =>
  Array.from({ length: count }, (_, i) => new Date(2020, 0, 1 + Math.floor((i * 3650) / count)));

function calendarOf(unit: 'day' | 'hour', holidays: number): WorkingCalendar {
  const nonWorking = resolveNonWorking(
    { holidays: holidaysOf(holidays), ...(unit === 'hour' ? { workingHours: SHIFTS } : {}) },
    null,
  );
  return buildWorkingCalendar(nonWorking, unit)!;
}

const best = (runs: number, fn: () => void): number => {
  let ms = Infinity;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    ms = Math.min(ms, performance.now() - t0);
  }
  return ms;
};

const rand = seeded(2026);
const INSTANTS = Array.from(
  { length: 200_000 },
  () => new Date(2020, 0, 1 + Math.floor(rand() * 3650), Math.floor(rand() * 24)),
);

/** 100k `workingDuration` calls over random pairs of instants. */
const workingDurations = (cal: WorkingCalendar): void => {
  let sum = 0;
  for (let i = 0; i < 100_000; i++) sum += cal.workingDuration(INSTANTS[2 * i], INSTANTS[2 * i + 1]);
  if (!Number.isFinite(sum)) throw new Error('not finite');
};

/** 200k plain `calendarDays` calls: the date arithmetic every `toWorking` pays before it searches anything. */
const dateArithmetic = (): void => {
  let sum = 0;
  for (const d of INSTANTS) sum += calendarDays(d, false);
  if (!Number.isFinite(sum)) throw new Error('not finite');
};

describe.each(['day', 'hour'] as const)('%s calendar performance', unit => {
  // D19 budgets 150 ms (ten years of public holidays) and 150 ms (3 000), widened for loaded machines
  it('100k workingDuration over ten years of holidays < 250 ms', () => {
    const cal = calendarOf(unit, 130); // a country's public holidays for ten years
    expect(best(5, () => workingDurations(cal))).toBeLessThan(250);
  });

  it('100k workingDuration over 3 000 holidays < 500 ms', () => {
    const cal = calendarOf(unit, 3000);
    expect(best(5, () => workingDurations(cal))).toBeLessThan(500);
  });

  it('costs a few times the date arithmetic it is built on, whatever the load', () => {
    const cal = calendarOf(unit, 3000);
    let ratio = Infinity;
    for (let round = 0; round < 5; round++) {
      const t0 = performance.now();
      dateArithmetic();
      const t1 = performance.now();
      workingDurations(cal);
      const t2 = performance.now();
      ratio = Math.min(ratio, (t2 - t1) / (t1 - t0));
    }
    // ~1.2 (day) and ~2 (hour) measured; a scan over the holidays is 30× and more
    expect(ratio).toBeLessThan(6);
  });

  it('does not grow with the holidays: 3 000 take under 5× what 30 take', () => {
    const few = calendarOf(unit, 30);
    const many = calendarOf(unit, 3000);
    const fewMs = best(5, () => workingDurations(few));
    const manyMs = best(5, () => workingDurations(many));
    expect(manyMs).toBeLessThan(5 * fewMs);
  });

  it('50k addWorking and 50k snaps over ten years of holidays < 300 ms each', () => {
    const cal = calendarOf(unit, 130);
    expect(
      best(5, () => {
        for (let i = 0; i < 50_000; i++) cal.addWorking(INSTANTS[i], (i % 9) - 4.5);
      }),
    ).toBeLessThan(300);
    expect(
      best(5, () => {
        for (let i = 0; i < 25_000; i++) {
          cal.snapStart(INSTANTS[i]);
          cal.snapEnd(INSTANTS[i]);
        }
      }),
    ).toBeLessThan(300);
  });

  it('builds from ten years of holidays in under 50 ms', () => {
    const holidays = holidaysOf(3650);
    const hours = unit === 'hour' ? { workingHours: SHIFTS } : {};
    expect(
      best(5, () => {
        buildWorkingCalendar(resolveNonWorking({ holidays, ...hours }, null), unit);
      }),
    ).toBeLessThan(50);
  });
});

describe('a ten-year closure', () => {
  it('jumps across it in a few probes: 20k addWorking calls < 300 ms, and lands where the oracle does', () => {
    const closure = [{ start: new Date(2020, 0, 1), end: new Date(2029, 11, 31) }];
    const nonWorking = resolveNonWorking({ holidays: closure }, null);
    const cal = buildWorkingCalendar(nonWorking, 'day')!;
    const oracle = buildOracle({
      unit: 'day',
      weekends: new Set([0, 6]),
      holidays: new Set(Array.from(nonWorking!.holidayByDay.keys())),
      hours: null,
    });
    const monday = new Date(2019, 11, 30);
    // 30 Dec and 31 Dec 2019 work, then 2030-01-01 (a Tuesday) is the next working day
    expect(cal.addWorking(monday, 2)).toEqual(new Date(2020, 0, 1));
    expect(cal.addWorking(monday, 3)).toEqual(new Date(2030, 0, 2));
    expect(cal.addWorking(monday, 3)).toEqual(oracle.end(oracle.w(monday) + 3));
    expect(cal.addWorking(new Date(2030, 0, 2), -1)).toEqual(new Date(2030, 0, 1));
    expect(cal.addWorking(new Date(2030, 0, 1), -1)).toEqual(new Date(2019, 11, 31));
    expect(cal.workingDuration(monday, new Date(2030, 0, 2))).toBe(3);
    expect(cal.snapStart(new Date(2025, 5, 1))).toEqual(new Date(2030, 0, 1));
    expect(cal.snapEnd(new Date(2025, 5, 1))).toEqual(new Date(2020, 0, 1));
    expect(
      best(5, () => {
        for (let i = 0; i < 20_000; i++) cal.addWorking(i % 2 ? monday : new Date(2030, 0, 2), i % 2 ? 3 : -3);
      }),
    ).toBeLessThan(300);
  });
});
