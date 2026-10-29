// ─────────────────────────────────────────────────────────────
//  Tests — Phase 13 (step 2.1): the fast working-time engine against a
//  day-walking oracle (calendar-oracle.ts). 20 seeded calendars × both
//  units × 2 000 instants around 2024–2028 (plus a few near the epoch
//  and far out): W, both representatives, the snaps, `addWorking`
//  round trips, `isWorking*`. Dates are local, so every assertion holds
//  in any time zone (`pnpm test:tz`); an hour calendar's wall-clock
//  checks skip the days a DST change shortens or lengthens (the DST
//  specs in calendar-dst.test.ts cover those).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { buildWorkingCalendar, resolveNonWorking, type GanttHourRange } from '../index';
import {
  buildOracle,
  epochDayOf,
  hasWorkingTime,
  midnightOf,
  randomCalendar,
  seeded,
  type Oracle,
  type OracleSpec,
  type RandomCalendar,
} from './calendar-oracle';

const CALENDARS = 20;
const INSTANTS = 2000;
const MS = 1;

const near = (actual: number, expected: number, eps: number, what: string): void => {
  if (!(Math.abs(actual - expected) <= eps)) throw new Error(`${what}: ${actual} vs ${expected} (±${eps})`);
};
/** Dates the engine and the oracle compute from the same amount may differ by a rounding millisecond. */
const sameInstant = (actual: Date, expected: Date, what: string): void =>
  near(actual.getTime(), expected.getTime(), 1 * MS, what);

/** A random instant: free, on a midnight, on a range boundary of its day, or on the quarter hour. */
function instantFor(rand: () => number, oracle: Oracle, year0: number, years: number): Date {
  const day = epochDayOf(new Date(year0, 0, 1)) + Math.floor(rand() * years * 365);
  const mid = midnightOf(day);
  const y = mid.getFullYear();
  const m = mid.getMonth();
  const d = mid.getDate();
  const kind = rand();
  if (kind < 0.55) return new Date(y, m, d, 0, 0, 0, Math.floor(rand() * 24 * 3_600_000));
  if (kind < 0.65) return mid;
  if (kind < 0.85) {
    const ranges = oracle.rangesOn(day);
    if (!ranges.length) return new Date(y, m, d, Math.floor(rand() * 24));
    const r = ranges[Math.floor(rand() * ranges.length)];
    return new Date(y, m, d, 0, 0, 0, Math.round((rand() < 0.5 ? r.start : r.end) * 3_600_000));
  }
  return new Date(y, m, d, Math.floor(rand() * 24), Math.floor(rand() * 4) * 15);
}

function check(unit: 'day' | 'hour', cal: RandomCalendar, seed: number): void {
  const spec: OracleSpec = { unit, ...cal.spec };
  const nonWorking = resolveNonWorking(cal.options, null);
  const engine = buildWorkingCalendar(nonWorking, unit);
  if (!hasWorkingTime(spec)) {
    expect(engine).toBeNull();
    return;
  }
  if (!engine) throw new Error(`seed ${seed} ${unit}: no calendar built, the oracle has working time`);
  const oracle = buildOracle(spec);
  const rand = seeded(seed * 7919 + (unit === 'day' ? 1 : 2));
  // An hour calendar reads the hours of a day a DST change moves by their wall time: those days (and the next) are the DST specs'
  const isPlain = (d: Date): boolean =>
    oracle.dayHours(d) === 24 && oracle.dayHours(new Date(d.getTime() - 24 * 3_600_000)) === 24;

  for (let i = 0; i < INSTANTS; i++) {
    // Mostly 2024–2028; every tenth instant is far from it (1965–2035)
    const t = i % 10 === 9 ? instantFor(rand, oracle, 1965, 70) : instantFor(rand, oracle, 2024, 5);
    const tag = `seed ${seed} ${unit} ${t.toString()}`;
    const w = oracle.w(t);
    near(engine.toWorking(t), w, 1e-9 * Math.max(1, Math.abs(w)), `${tag}: W`);
    expect(engine.isWorkingDay(t), `${tag}: isWorkingDay`).toBe(oracle.isWorkingDay(t));
    if (unit === 'hour' && !isPlain(t)) continue;

    expect(engine.isWorking(t), `${tag}: isWorking`).toBe(oracle.isWorking(t));
    sameInstant(engine.fromWorkingEnd(w), oracle.end(w), `${tag}: fromWorkingEnd`);
    sameInstant(engine.fromWorkingStart(w), oracle.start(w), `${tag}: fromWorkingStart`);
    // The instants of one W make an interval that contains t
    expect(engine.fromWorkingEnd(w).getTime(), `${tag}: end ≤ t`).toBeLessThanOrEqual(t.getTime() + MS);
    expect(engine.fromWorkingStart(w).getTime(), `${tag}: t ≤ start`).toBeGreaterThanOrEqual(t.getTime() - MS);

    // Snaps: the same object when nothing moves, else the representative of W(t)
    const snappedStart = engine.snapStart(t);
    if (oracle.isWorking(t)) expect(snappedStart, `${tag}: snapStart keeps`).toBe(t);
    else sameInstant(snappedStart, oracle.start(w), `${tag}: snapStart`);
    const snappedEnd = engine.snapEnd(t);
    if (oracle.workedUpTo(t)) expect(snappedEnd, `${tag}: snapEnd keeps`).toBe(t);
    else sameInstant(snappedEnd, oracle.end(w), `${tag}: snapEnd`);

    // addWorking: forward lands on an end, back on a start, and the amount comes back
    const amount = (unit === 'day' ? 1 : 8) * (0.25 + Math.floor(rand() * 160) / 4) * (rand() < 0.5 ? 1 : -1);
    const moved = engine.addWorking(t, amount);
    sameInstant(moved, amount > 0 ? oracle.end(w + amount) : oracle.start(w + amount), `${tag}: addWorking ${amount}`);
    // The amount comes back unless the result sits on a DST day, where `Date` may have moved a nonexistent wall time
    if (unit === 'day' || isPlain(moved)) {
      near(engine.workingDuration(t, moved), amount, 1e-6, `${tag}: workingDuration round trip`);
      near(engine.workingDuration(moved, t), -amount, 1e-6, `${tag}: workingDuration reversed`);
    }
    expect(engine.addWorking(t, 0)).toBe(t);
  }
}

describe('working calendar engine vs the day-walking oracle', () => {
  for (const unit of ['day', 'hour'] as const) {
    describe(`${unit} calendars`, () => {
      for (let seed = 1; seed <= CALENDARS; seed++) {
        const heavy = seed === CALENDARS;
        it(`seed ${seed}${heavy ? ' (a 400-day closure)' : ''}`, () => {
          check(unit, randomCalendar(seed, heavy), seed);
        });
      }
    });
  }

  it('drops a week without working time (null calendar) in both units', () => {
    const allOff = resolveNonWorking({ weekends: [0, 1, 2, 3, 4, 5, 6] }, null);
    expect(buildWorkingCalendar(allOff, 'day')).toBeNull();
    expect(buildWorkingCalendar(allOff, 'hour')).toBeNull();
    const noHours = resolveNonWorking({ workingHours: [] }, null);
    expect(buildWorkingCalendar(noHours, 'day')).not.toBeNull();
    expect(buildWorkingCalendar(noHours, 'hour')).toBeNull();
  });

  it('reads overlapping, unsorted and out-of-range hours as their union', () => {
    const ranges: GanttHourRange[] = [
      { start: 13, end: 30 },
      { start: -3, end: 9 },
      { start: 8, end: 12 },
      { start: 12, end: 12.5 },
      { start: 20, end: 20 },
    ];
    const engine = buildWorkingCalendar(resolveNonWorking({ weekends: [0, 6], workingHours: ranges }, null), 'hour')!;
    // 0–12.5 and 13–24 on a weekday: 23.5 hours
    expect(engine.workingDuration(new Date(2026, 9, 12), new Date(2026, 9, 13))).toBe(23.5);
    expect(engine.snapStart(new Date(2026, 9, 12, 12, 45))).toEqual(new Date(2026, 9, 12, 13));
    expect(engine.snapEnd(new Date(2026, 9, 12, 12, 45))).toEqual(new Date(2026, 9, 12, 12, 30));
  });
});
