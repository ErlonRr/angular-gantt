// ─────────────────────────────────────────────────────────────
//  gantry · calendar/durations.ts
//  What a duration measures and how it reads. Without a working
//  calendar (or with `calendar.durations: 'calendar'`) a duration is
//  local calendar days of the drawn span, as the x axis counts them;
//  with working durations it is working days — with `unit: 'hour'`,
//  working hours ÷ `hoursPerDay` ("measured days"). The Duration
//  column, tooltip, readout, cells, CSV, rollup weights, the critical
//  path, lags and float all measure through `measureBetween`.
// ─────────────────────────────────────────────────────────────

import { addDays, calendarDays, durationLabel, toLocalDay } from '../gantt-math';
import type { DateReading } from '../render/config';
import { taskSpan } from '../render/timeline';
import { DEFAULT_LABELS, type GanttLabels, type GanttTask } from '../types';
import { round1, round2 } from './time';

const MINUTE_MS = 60_000;
const MINUTES_PER_DAY = 1440;

/** Durations count working time: a calendar with `durations: 'working'`. */
export function measuresWorkingTime(dates: DateReading): boolean {
  return dates.calendar?.durations === 'working';
}

/**
 * Units of working time in one measured day: `hoursPerDay` for working durations of an hour
 * calendar, else 1 (a working day, or a calendar day).
 */
export function durationFactor(dates: DateReading): number {
  const c = dates.calendar;
  return c && c.durations === 'working' && c.unit === 'hour' ? c.hoursPerDay : 1;
}

/**
 * Measured days from `from` to `to` (drawn instants, signed): working days (working hours ÷
 * `hoursPerDay`) with working durations, else local calendar days (`calendarDays`).
 */
export function measureBetween(from: Date, to: Date, dates: DateReading): number {
  const c = dates.calendar;
  if (c?.durations === 'working') return c.working.workingDuration(from, to) / durationFactor(dates);
  return calendarDays(to, false) - calendarDays(from, false);
}

/** Measured days of a drawn span (never negative). */
export function spanDuration(span: { start: Date; end: Date }, dates: DateReading): number {
  return Math.max(0, measureBetween(span.start, span.end, dates));
}

/** Measured days of a task as drawn (`taskSpan`: date-only normalisation, inclusive ends). */
export function taskDuration(task: Pick<GanttTask, 'start' | 'end'>, dates: DateReading): number {
  return spanDuration(taskSpan(task, dates), dates);
}

/**
 * Finish variance of a task against its baseline in measured days, signed (the drawn end minus
 * the baseline's drawn end); `null` without a baseline. Unrounded: the Variance column and the
 * tooltip round it to 0.1, the CSV to 2 decimals.
 */
export function measureVariance(
  task: Pick<GanttTask, 'start' | 'end' | 'baseline'>,
  dates: DateReading,
): number | null {
  if (!task.baseline) return null;
  return measureBetween(taskSpan(task.baseline, dates).end, taskSpan(task, dates).end, dates);
}

/**
 * `date` plus `days` of calendar time: the whole days through `addDays` (local calendar days,
 * date-only values stay date-only), the rest as real time rounded to the minute. A date-only
 * value that gains a time is read as its local day first (`toLocalDay`).
 */
export function addDayAmount(date: Date, days: number): Date {
  const whole = Math.floor(days + 1e-9);
  const restMs = Math.round((days - whole) * MINUTES_PER_DAY) * MINUTE_MS;
  const shifted = addDays(date, whole);
  return restMs === 0 ? shifted : new Date(toLocalDay(shifted).getTime() + restMs);
}

/**
 * The drawn end `days` measured days after the drawn `start`: working time with working
 * durations (from the next working time when `start` is off; `fromWorkingEnd`, so it sits right
 * after working time), else calendar time (`addDayAmount`).
 */
export function addDuration(start: Date, days: number, dates: DateReading): Date {
  const c = dates.calendar;
  if (c?.durations === 'working') return c.working.addWorking(start, days * durationFactor(dates));
  return addDayAmount(start, days);
}

/** The labels a duration text reads (the Duration column's, the tooltip's, the drag readout's). */
export type DurationLabels = Pick<
  GanttLabels,
  'durationLessThanDay' | 'durationDay' | 'durationDays' | 'durationWeeks' | 'durationWeeksDays' | 'durationHours'
>;

/**
 * The duration text of a drawn span. Calendar time (no calendar, or `durations: 'calendar'`):
 * `durationLabel` ("< 1 day", "3 days", "2w 1d"). Working days: "1 day" or "n days" with up to
 * 2 decimals ("0 days", "2.5 days"; never weeks: a working week isn't 7 days). Working hours:
 * "n hours" under one working day (`hoursPerDay`), else days of `hoursPerDay` hours ("1.5 days");
 * no working time reads "0 days".
 */
export function formatDuration(
  span: { start: Date; end: Date },
  dates: DateReading,
  labels?: Partial<DurationLabels>,
): string {
  const c = dates.calendar;
  if (c?.durations !== 'working') return durationLabel(span.start, span.end, labels);
  const dayText = (n: number): string =>
    n === 1
      ? (labels?.durationDay ?? DEFAULT_LABELS.durationDay)
      : (labels?.durationDays ?? DEFAULT_LABELS.durationDays)(n);
  const days = spanDuration(span, dates);
  if (c.unit === 'day') return dayText(round2(days));
  const hours = round2(days * c.hoursPerDay);
  if (hours === 0) return dayText(0);
  if (hours < c.hoursPerDay) return (labels?.durationHours ?? DEFAULT_LABELS.durationHours)(hours);
  return dayText(round2(hours / c.hoursPerDay));
}

/**
 * The tooltip's total-float text for `days` measured days (`CPMResult.floatMap`): `ttFloatDays`
 * rounded to 0.1 ("2d", "0.5d"); in working hours (`ttFloatHours`, "4h") when an hour calendar
 * counts working durations and the float is under one working day (and not 0).
 */
export function formatFloat(
  days: number,
  dates: DateReading,
  labels?: Partial<Pick<GanttLabels, 'ttFloatDays' | 'ttFloatHours'>>,
): string {
  const c = dates.calendar;
  if (c?.durations === 'working' && c.unit === 'hour') {
    const hours = round1(days * c.hoursPerDay);
    if (hours !== 0 && Math.abs(hours) < c.hoursPerDay)
      return (labels?.ttFloatHours ?? DEFAULT_LABELS.ttFloatHours)(hours);
  }
  return (labels?.ttFloatDays ?? DEFAULT_LABELS.ttFloatDays)(round1(days));
}
