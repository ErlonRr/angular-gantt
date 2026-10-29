// ─────────────────────────────────────────────────────────────
//  gantt-core · render/drag-steps.ts
//  What `DragSession` and `KeyboardEditSession` share: the snap unit
//  of a `DragTiming` in px, a date moved by snap units (through the
//  editing rules of a working calendar, or by whole days / hours),
//  the minimum length and the amount an event reports.
//  Internal: not exported from the package.
// ─────────────────────────────────────────────────────────────

import { addHours } from '../calendar/time';
import { addDays, dateShiftDays } from '../gantt-math';
import type { DragTiming } from './drag';

/** Pixels in one snap unit: a day, or an hour on hour scales. */
export const pxPerUnit = (t: DragTiming): number => (t.snap === 'hour' ? t.pxPerDay / 24 : t.pxPerDay);

/** `date` plus `units` snap units, calendar-free. */
export const shiftBy = (t: DragTiming, date: Date, units: number): Date =>
  t.snap === 'hour' ? addHours(date, units) : addDays(date, units);

/** The start (`edge` `'start'`) or end of a task `units` snap units from `from`, by the working calendar's rules when there is one. */
export const stepEdge = (
  t: DragTiming,
  edge: 'start' | 'end',
  from: Date,
  units: number,
  by: 'pointer' | 'keyboard',
): Date => (t.calendar ? t.calendar[edge](from, units, by) : shiftBy(t, from, units));

/** The drawn px rule, or at least one snap unit of working time under working durations. */
export function longEnough(t: DragTiming, start: Date, end: Date): boolean {
  const working = t.calendar?.longEnough;
  if (working) return working(start, end);
  const span = t.span(start, end);
  return t.toX(span.end) - t.toX(span.start) >= pxPerUnit(t) - 0.5;
}

/**
 * The amount of a `daysMoved` / `daysDelta`: the snap `units` as days, or under a working
 * calendar the real calendar shift from `from` to `to` (`dateShiftDays`).
 */
export const shiftAmount = (t: DragTiming, units: number, from: Date, to: Date): number =>
  t.calendar ? dateShiftDays(from, to) : t.snap === 'hour' ? units / 24 : units;
