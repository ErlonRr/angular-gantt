// ─────────────────────────────────────────────────────────────
//  gantry · calendar/edit.ts
//  Task dates under a working calendar: the snaps of `skipNonWorking`,
//  the end that follows a moved start, and writing a result back in
//  the task's own form (a UTC date-only value stays date-only, an
//  inclusive end stays inclusive), so undo restores the user's shape.
//  `EditCalendar` is what drags and move mode step with.
// ─────────────────────────────────────────────────────────────

import { addDays, calendarDays, toLocalDay } from '../gantt-math';
import type { DateReading } from '../render/config';
import { spanEndToTaskEnd, taskSpan } from '../render/timeline';
import type { GanttTask } from '../types';
import { addHours, msOfDay } from './time';

/** Working time below this many units counts as none (≈ 0.1 s of a day). */
const EPS = 1e-6;

/** A task start as drawn (`taskSpan`'s rule: a UTC date-only value is its local day). */
const drawnStart = (start: Date, dates: Pick<DateReading, 'normalizeDateOnly'>): Date =>
  dates.normalizeDateOnly ? toLocalDay(start) : start;

/** A task end as drawn (`taskSpan`'s rule: an inclusive midnight end covers its day). */
const drawnEnd = (end: Date, dates: DateReading): Date => taskSpan({ start: end, end }, dates).end;

/**
 * `local` (a drawn instant) written in the form of the task date `like`: when it lies whole local
 * days from `like` as read (`normalizeDateOnly`, default true: a UTC date-only value is its local
 * day), `addDays(like, n)` — a date-only value stays date-only, and `like` itself for 0 days —;
 * else `local`.
 */
export function taskDateLike(like: Date, local: Date, dates?: Pick<DateReading, 'normalizeDateOnly'>): Date {
  const reading = dates?.normalizeDateOnly === false ? like : toLocalDay(like);
  const days = Math.round(calendarDays(local, false) - calendarDays(reading, false));
  if (addDays(reading, days).getTime() !== local.getTime()) return local;
  return days === 0 ? like : addDays(like, days);
}

/**
 * A task start that skips non-working time (`calendar.skipNonWorking`): the next start of working
 * time, in the task's form (`taskDateLike`). `start` itself when it is already on working time,
 * without a calendar, or with `skipNonWorking: false`.
 */
export function snapTaskStart(start: Date, dates: DateReading): Date {
  const c = dates.calendar;
  if (!c?.skipNonWorking) return start;
  const drawn = drawnStart(start, dates);
  const snapped = c.working.snapStart(drawn);
  return snapped.getTime() === drawn.getTime() ? start : taskDateLike(start, snapped, dates);
}

/**
 * A task end that skips non-working time (`calendar.skipNonWorking`): the end of the last working
 * time before the drawn end (`taskSpan`: an inclusive midnight end covers its day), written back
 * as a task end (`spanEndToTaskEnd`, an inclusive end stays inclusive) in the task's form. `end`
 * itself when working time runs up to it, without a calendar, or with `skipNonWorking: false`.
 */
export function snapTaskEnd(end: Date, dates: DateReading): Date {
  const c = dates.calendar;
  if (!c?.skipNonWorking) return end;
  const drawn = drawnEnd(end, dates);
  const snapped = c.working.snapEnd(drawn);
  return snapped.getTime() === drawn.getTime() ? end : taskDateLike(end, spanEndToTaskEnd(snapped, dates), dates);
}

/**
 * The end that keeps `task`'s calendar length when its start becomes `start`: shifted by the
 * same local calendar days and time of day. A whole-day shift moves the stored end with `addDays`
 * (its shape kept); a time shift moves the drawn end, which becomes a task end through
 * `endDateMode`.
 */
function endKeepingDuration(task: Pick<GanttTask, 'start' | 'end'>, start: Date, dates: DateReading): Date {
  const before = drawnStart(task.start, dates);
  const after = drawnStart(start, dates);
  const days = Math.floor(calendarDays(after, false)) - Math.floor(calendarDays(before, false));
  const ms = msOfDay(after) - msOfDay(before);
  const end = task.end ?? task.start;
  if (ms === 0) return addDays(end, days);
  const e = taskSpan(task, dates).end;
  const drawn = new Date(
    e.getFullYear(),
    e.getMonth(),
    e.getDate() + days,
    e.getHours(),
    e.getMinutes(),
    e.getSeconds(),
    e.getMilliseconds() + ms,
  );
  return spanEndToTaskEnd(drawn, dates);
}

/**
 * The end of `task` when its start moves to `newStart` (a move, a start cell). Working durations:
 * the same working time from the new start (the bar widens over the days off it now spans); a
 * task without working time keeps its calendar length. Otherwise the same calendar length: the
 * same local days and time of day (a milestone stays zero-length); with `skipNonWorking` that end
 * is snapped back to the end of the last working time (`snapTaskEnd`), so a Monday–Tuesday task
 * moved to Friday ends Saturday 00:00, never Sunday — unless no working time would be left after
 * the start. In the task's form (`taskDateLike`, `spanEndToTaskEnd`). `EditCalendar.follow` is
 * this function.
 */
export function followTaskEnd(task: Pick<GanttTask, 'start' | 'end'>, newStart: Date, dates: DateReading): Date {
  const c = dates.calendar;
  if (c?.durations === 'working') {
    const span = taskSpan(task, dates);
    const length = c.working.workingDuration(span.start, span.end);
    if (length > EPS) {
      const to = c.working.addWorking(drawnStart(newStart, dates), length);
      return taskDateLike(task.end ?? task.start, spanEndToTaskEnd(to, dates), dates);
    }
  }
  const end = endKeepingDuration(task, newStart, dates);
  if (c?.durations === 'calendar' && c.skipNonWorking) {
    const span = taskSpan(task, dates);
    if (span.end.getTime() > span.start.getTime()) {
      const snapped = snapTaskEnd(end, dates);
      if (c.working.workingDuration(drawnStart(newStart, dates), drawnEnd(snapped, dates)) > EPS) return snapped;
    }
  }
  return end;
}

/**
 * How a drag, a resize and move mode step under a working calendar (`editCalendar`). Dates in
 * and out are task dates; `units` are the edit's snap units (`'day'` / `'hour'`).
 */
export interface EditCalendar {
  /** The start moved by `units`: shifted then snapped (pointer), or stepped in working time (keyboard) */
  start(start: Date, units: number, by: 'pointer' | 'keyboard'): Date;
  /** The end moved by `units`, likewise */
  end(end: Date, units: number, by: 'pointer' | 'keyboard'): Date;
  /** The end of a task `start`–`end` whose start moves to `newStart` (`followTaskEnd`) */
  follow(start: Date, end: Date, newStart: Date): Date;
  /** Working durations: at least one snap unit of working time; `null`: the drawn px rule (as without a calendar) */
  longEnough: ((start: Date, end: Date) => boolean) | null;
}

/** `w` without the float noise of adding 1/24 s: a step that lands on a day boundary lands exactly on it. */
const clean = (w: number): number => Math.round(w * 1e9) / 1e9;

/**
 * The editing rules of a reading's calendar for a snap unit, or `null` for calendar-time editing
 * (no calendar, or calendar durations without skipping): drags and move mode then take the
 * calendar-free path. `snap` is the session's unit: `'day'` or `'hour'` (`DragTiming.snap`).
 *
 * - **Pointer**: an edge moves by the pointer's calendar units (days or hours), then, with
 *   `skipNonWorking`, a start snaps forward and an end back (`snapTaskStart` / `snapTaskEnd`).
 * - **Keyboard**: an edge steps by one snap unit of working time, so no key press is lost over a
 *   weekend in either direction. A day of an hour calendar on a day scale is a working *day*, not
 *   `hoursPerDay` hours: the edge moves to the next working day at the same time of day, then
 *   snaps to working time (`snapStart` / `snapEnd`), so a 7 h day or a half Friday never drifts it
 *   off the shift start.
 * - **A move's end** follows the start (`followTaskEnd`).
 * - **Minimum** (working durations): one snap unit of working time; a day-scale hour calendar
 *   keeps at least the working hours of its edges' own weekdays (a 7 h day or a half Friday is
 *   still one day).
 *
 * A step of 0 units returns the date itself, even one on non-working time.
 */
export function editCalendar(dates: DateReading, snap: 'day' | 'hour'): EditCalendar | null {
  const c = dates.calendar;
  if (!c || (c.durations !== 'working' && !c.skipNonWorking)) return null;
  const { working, skipNonWorking: skip } = c;
  // An hour calendar on a day scale: a day is a working day, whatever its hours
  const byDay = snap === 'day' && c.unit === 'hour';
  // One snap unit of working time, in the calendar's unit (days or hours)
  const unit = snap === 'day' ? (c.unit === 'day' ? 1 : c.hoursPerDay) : c.unit === 'day' ? 1 / 24 : 1;
  // The working hours of the weekday of `d`: a short day (7 h, a half Friday) is still one day
  const ownHours = (d: Date): number => working.hoursOn(d.getDay()) || unit;
  const shift = (date: Date, units: number): Date => (snap === 'hour' ? addHours(date, units) : addDays(date, units));
  // `date` moved `days` working days, keeping its time of day (the next working day, and so on)
  const stepDays = (date: Date, days: number): Date => {
    const dir = days > 0 ? 1 : -1;
    let left = Math.abs(days);
    let day = date;
    while (left > 0 && !Number.isNaN(day.getTime())) {
      day = addDays(day, dir);
      if (working.isWorkingDay(day)) left--;
    }
    return day;
  };
  return {
    start(start, units, by) {
      if (units === 0) return start;
      if (by === 'pointer') {
        const moved = shift(start, units);
        return skip ? snapTaskStart(moved, dates) : moved;
      }
      const from = drawnStart(start, dates);
      const to = byDay
        ? working.snapStart(stepDays(from, units))
        : working.fromWorkingStart(clean(working.toWorking(from) + units * unit));
      return taskDateLike(start, to, dates);
    },
    end(end, units, by) {
      if (units === 0) return end;
      if (by === 'pointer') {
        const moved = shift(end, units);
        return skip ? snapTaskEnd(moved, dates) : moved;
      }
      const drawn = drawnEnd(end, dates);
      const to = byDay
        ? working.snapEnd(stepDays(drawn, units))
        : working.fromWorkingEnd(clean(working.toWorking(drawn) + units * unit));
      return taskDateLike(end, spanEndToTaskEnd(to, dates), dates);
    },
    follow: (start, end, newStart) => followTaskEnd({ start, end }, newStart, dates),
    longEnough:
      c.durations === 'working'
        ? (start, end) => {
            const span = taskSpan({ start, end }, dates);
            const least = byDay ? Math.min(unit, ownHours(span.start), ownHours(span.end)) : unit;
            return working.workingDuration(span.start, span.end) >= least - EPS;
          }
        : null,
  };
}
