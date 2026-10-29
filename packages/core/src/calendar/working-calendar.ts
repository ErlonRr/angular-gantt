// ─────────────────────────────────────────────────────────────
//  gantry · calendar/working-calendar.ts
//  Working-time arithmetic over the resolved `nonWorkingTime`: the
//  same weekends, holidays and working hours the bands paint, so the
//  shading and the measures can't disagree.
//
//  Everything is defined on one function, W(t): the working time from
//  epoch day 0 (1970-01-01, local midnight) to the instant t, negative
//  before it, continuous and non-decreasing. The instants with W = w
//  make a closed interval [a, b]: `fromWorkingEnd(w)` = a (an end sits
//  right after working time), `fromWorkingStart(w)` = b (a start sits
//  where working time begins). Snaps, durations and additions are
//  compositions of the three.
//
//  A day calendar measures local calendar-day fractions (`calendarDays`,
//  like the x axis: DST-safe); an hour calendar measures wall-clock hours
//  (09:00–17:00 is 8 hours on a daylight-saving day too; a wall time a
//  DST change skips is normalised forward by `Date`, one it repeats
//  reads as its wall time).
//
//  Dates in and out are local instants: callers pass drawn dates
//  (`taskSpan`), never raw date-only values.
// ─────────────────────────────────────────────────────────────

import { calendarDays } from '../gantt-math';
import type { ResolvedNonWorking } from '../render/config';
import type { GanttCalendarUnit, GanttHourRange } from '../types';
import { HOUR_MS, msOfDay } from './time';

/**
 * Working-time arithmetic of a calendar (`buildWorkingCalendar`, `createWorkingCalendar`,
 * `ResolvedGanttConfig.calendar.working`). Amounts are in the calendar's unit: working days
 * (`unit: 'day'`) or working hours (`unit: 'hour'`).
 */
export interface WorkingCalendar {
  /** `'day'`: a working day counts all day; `'hour'`: the working hours of each day */
  readonly unit: GanttCalendarUnit;
  /** Working hours of a weekday (0 = Sunday): 24 for a working weekday in a day calendar, 0 for a weekend */
  hoursOn(weekday: number): number;
  /** The local day of `date` has working time: a working weekday, not a holiday */
  isWorkingDay(date: Date): boolean;
  /** Working time follows `date` at once (it is inside a working range, or at its start) */
  isWorking(date: Date): boolean;
  /** Working time from 1970-01-01 local midnight to `date`, negative before it */
  toWorking(date: Date): number;
  /** The last instant with `toWorking(t) === w`: where working time begins (a start) */
  fromWorkingStart(w: number): Date;
  /** The first instant with `toWorking(t) === w`: right after working time (an end) */
  fromWorkingEnd(w: number): Date;
  /** `toWorking(end) − toWorking(start)`, signed */
  workingDuration(start: Date, end: Date): number;
  /**
   * `amount` of working time after `date` (an end: `fromWorkingEnd`), or before it when
   * negative (a start: `fromWorkingStart`); `date` itself for 0
   */
  addWorking(date: Date, amount: number): Date;
  /** The start of the next working time: `date` itself when working time follows it */
  snapStart(date: Date): Date;
  /** The end of the last working time: `date` itself when working time ends at or runs through it */
  snapEnd(date: Date): Date;
}

/** A working day, all of it */
const ALL_DAY: readonly GanttHourRange[] = Object.freeze([Object.freeze({ start: 0, end: 24 })]);
const NO_TIME: readonly GanttHourRange[] = Object.freeze([]);

/** Weekday (0 = Sunday) of an epoch day: 1970-01-01 was a Thursday. */
const weekdayOf = (day: number): number => (((day + 4) % 7) + 7) % 7;

/** Year, month and day of the month of an epoch day. */
function dateOf(day: number): [number, number, number] {
  const utc = new Date(Date.UTC(1970, 0, 1 + day));
  return [utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate()];
}

/** Wall-clock hours of `date` since its local midnight (09:30 → 9.5). */
const wallHours = (d: Date): number => msOfDay(d) / HOUR_MS;

/** Hour ranges clamped to 0–24, without empty ones, sorted and merged where they overlap or touch. */
export function mergeHourRanges(ranges: readonly GanttHourRange[]): GanttHourRange[] {
  const out: GanttHourRange[] = [];
  const clamped = ranges
    .map(r => ({ start: Math.max(0, r.start), end: Math.min(24, r.end) }))
    .filter(r => r.end > r.start)
    .sort((a, b) => a.start - b.start);
  for (const r of clamped) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push(r);
  }
  return out;
}

/**
 * Each weekday's working ranges: none on a weekend; all day in a day calendar, without
 * `nonWorking` (no non-working time) or without working hours; else the merged working hours.
 */
function weekRanges(nonWorking: ResolvedNonWorking | null, unit: GanttCalendarUnit): (readonly GanttHourRange[])[] {
  return Array.from({ length: 7 }, (_, day) => {
    if (nonWorking?.weekends.has(day)) return NO_TIME;
    const hours = unit === 'hour' ? nonWorking?.workingHours : null;
    return hours ? mergeHourRanges(hours(day)) : ALL_DAY;
  });
}

/** Units of working time in a day of `ranges`: 1 or 0 working day, or its hours. */
const unitsOf = (ranges: readonly GanttHourRange[], unit: GanttCalendarUnit): number =>
  unit === 'day' ? (ranges.length ? 1 : 0) : ranges.reduce((sum, r) => sum + r.end - r.start, 0);

/** Holidays (epoch days, ascending, each once) on weekdays with working time: the only ones that count. */
const workingHolidays = (nonWorking: ResolvedNonWorking | null, units: readonly number[]): number[] =>
  nonWorking ? [...nonWorking.holidayByDay.keys()].filter(d => units[weekdayOf(d)]! > 0).sort((a, b) => a - b) : [];

/**
 * The working calendar of a resolved `nonWorkingTime` (`null`: no non-working time — every day
 * works, and with `unit: 'hour'` every hour). `unit: 'day'`: a weekday that is not a weekend or
 * a holiday works all day. `unit: 'hour'`: such a day works its `workingHours` (merged, clamped
 * to 0–24; a weekday missing from a per-weekday map has none; unset hours: all day —
 * `resolveConfig` resolves an hour calendar with `DEFAULT_WORKING_HOURS` instead). Holidays and
 * weekends always win over hours. `null` when the week has no working time.
 */
export function buildWorkingCalendar(
  nonWorking: ResolvedNonWorking | null,
  unit: GanttCalendarUnit,
): WorkingCalendar | null {
  return buildWorkingTime(nonWorking, unit)?.working ?? null;
}

/**
 * `buildWorkingCalendar` and the stable text of the working time it counts (`ResolvedCalendar.key`),
 * from one pass over the week and the holidays: each weekday's ranges and the runs of holidays on
 * working weekdays. Labels, colours and holidays on days off leave the key unchanged.
 */
export function buildWorkingTime(
  nonWorking: ResolvedNonWorking | null,
  unit: GanttCalendarUnit,
): { working: WorkingCalendar; key: string } | null {
  const week = weekRanges(nonWorking, unit);
  const units = week.map(r => unitsOf(r, unit));
  const weekly = units.reduce((a, b) => a + b, 0);
  if (!(weekly > 0)) return null;
  const holidays = Int32Array.from(workingHolidays(nonWorking, units));
  // pre[r]: the units of the first r days of a cycle that starts on epoch day 0 (a Thursday)
  const pre = [0];
  for (let j = 0; j < 7; j++) pre.push(pre[j]! + units[(j + 4) % 7]!);
  // held[i]: the units of the first i holidays, summed in order
  const held = [0];
  for (const h of holidays) held.push(held[held.length - 1]! + units[weekdayOf(h)]!);

  /** How many holidays come before `day` (a binary search): the index of the first one at or after it */
  const holidaysBefore = (day: number): number => {
    let lo = 0;
    let hi = holidays.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (holidays[mid]! < day) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const heldBeforeZero = held[holidaysBefore(0)]!;

  // `at` is `holidaysBefore(day)`, for a caller that needs both the day's ranges and W at its midnight
  /** W at the local midnight of `day` (whole days of the weekday cycle, minus the holidays) */
  const before = (day: number, at = holidaysBefore(day)): number => {
    const q = Math.floor(day / 7);
    return q * weekly + pre[day - 7 * q]! - (held[at]! - heldBeforeZero);
  };
  const rangesOn = (day: number, at = holidaysBefore(day)): readonly GanttHourRange[] =>
    holidays[at] === day ? NO_TIME : (week[weekdayOf(day)] ?? NO_TIME);

  const toWorking = (date: Date): number => {
    const days = calendarDays(date, false);
    if (!Number.isFinite(days)) return NaN;
    const day = Math.floor(days);
    const at = holidaysBefore(day);
    const ranges = rangesOn(day, at);
    let w = before(day, at);
    if (!ranges.length) return w;
    if (unit === 'day') return w + days - day;
    const h = wallHours(date);
    for (const r of ranges) w += Math.min(Math.max(h - r.start, 0), r.end - r.start);
    return w;
  };

  /**
   * The instant `amount` units into the working time of `day`. An amount on the boundary of two
   * ranges is the end of the first (`atEnd`) or the start of the next.
   */
  const instantOn = (day: number, amount: number, atEnd: boolean): Date => {
    const [y, m, d] = dateOf(day);
    if (unit === 'day') {
      const midnight = new Date(y, m, d).getTime();
      return new Date(midnight + Math.round(amount * (new Date(y, m, d + 1).getTime() - midnight)));
    }
    const ranges = rangesOn(day);
    let rest = amount;
    for (const r of ranges) {
      const len = r.end - r.start;
      if (atEnd ? rest <= len : rest < len) return new Date(y, m, d, 0, 0, 0, Math.round((r.start + rest) * HOUR_MS));
      rest -= len;
    }
    // Past the day's last range by a rounding error: its end, or the next working day's first start
    const last = ranges[ranges.length - 1];
    if (atEnd && last) return new Date(y, m, d, 0, 0, 0, Math.round(last.end * HOUR_MS));
    return instantOn(
      firstDay(n => before(n + 1) > before(day + 1), day + 1),
      0,
      false,
    );
  };

  /** The smallest day `test` holds for (`test` is false, then true as days grow). */
  const firstDay = (test: (day: number) => boolean, guess: number): number => {
    let lo = guess;
    let hi = guess;
    let step = 1;
    if (test(guess)) {
      lo = hi - step;
      while (test(lo)) {
        hi = lo;
        step *= 2;
        lo = hi - step;
      }
    } else {
      hi = lo + step;
      while (!test(hi)) {
        lo = hi;
        step *= 2;
        hi = lo + step;
      }
    }
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (test(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  };
  const guessDay = (w: number): number => Math.floor(w / weekly) * 7;

  const fromWorkingEnd = (w: number): Date => {
    if (!Number.isFinite(w)) return new Date(NaN);
    // The day working time reaches w on: before(day) < w ≤ before(day + 1)
    const day = firstDay(d => before(d + 1) >= w, guessDay(w));
    return instantOn(day, w - before(day), true);
  };
  const fromWorkingStart = (w: number): Date => {
    if (!Number.isFinite(w)) return new Date(NaN);
    // The day working time passes w on: before(day) ≤ w < before(day + 1)
    const day = firstDay(d => before(d) > w, guessDay(w)) - 1;
    return instantOn(day, w - before(day), false);
  };

  const isWorking = (date: Date): boolean => {
    const days = calendarDays(date, false);
    if (!Number.isFinite(days)) return false;
    const ranges = rangesOn(Math.floor(days));
    if (unit === 'day') return ranges.length > 0;
    const h = wallHours(date);
    return ranges.some(r => r.start <= h && h < r.end);
  };
  /** Working time ends at `date` or runs through it */
  const workedUpTo = (date: Date): boolean => {
    const days = calendarDays(date, false);
    if (!Number.isFinite(days)) return false;
    const day = Math.floor(days);
    if (unit === 'day') return rangesOn(days > day ? day : day - 1).length > 0;
    const h = wallHours(date);
    return h > 0 ? rangesOn(day).some(r => r.start < h && h <= r.end) : rangesOn(day - 1).some(r => r.end === 24);
  };

  const runs: string[] = [];
  for (let i = 0; i < holidays.length;) {
    let j = i;
    while (j + 1 < holidays.length && holidays[j + 1] === holidays[j]! + 1) j++;
    runs.push(i === j ? `${holidays[i]}` : `${holidays[i]}-${holidays[j]}`);
    i = j + 1;
  }
  const weekKey = week.map(ranges => ranges.map(r => `${r.start}-${r.end}`).join(',')).join('/');

  const working: WorkingCalendar = {
    unit,
    hoursOn: weekday => (unit === 'day' ? (units[weekday] ? 24 : 0) : (units[weekday] ?? 0)),
    isWorkingDay: date => {
      const days = calendarDays(date, false);
      return Number.isFinite(days) && rangesOn(Math.floor(days)).length > 0;
    },
    isWorking,
    toWorking,
    fromWorkingStart,
    fromWorkingEnd,
    workingDuration: (start, end) => toWorking(end) - toWorking(start),
    addWorking: (date, amount) =>
      amount > 0
        ? fromWorkingEnd(toWorking(date) + amount)
        : amount < 0
          ? fromWorkingStart(toWorking(date) + amount)
          : date,
    snapStart: date => (isWorking(date) ? date : fromWorkingStart(toWorking(date))),
    snapEnd: date => (workedUpTo(date) ? date : fromWorkingEnd(toWorking(date))),
  };
  return { working, key: `${weekKey}|${runs.join(',')}` };
}
