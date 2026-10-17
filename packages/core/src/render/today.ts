// ─────────────────────────────────────────────────────────────
//  gantry · render/today.ts
//  "Now" for an engine that ticks a clock: a quantised `now` that only
//  changes when the local day (the local hour on hour scales) changes,
//  so the timeline is rebuilt at most that often, and the exact x of
//  the today line for every tick, placed on that timeline.
// ─────────────────────────────────────────────────────────────

import type { TimeUnit } from '../types';
import { calendarDays } from '../gantt-math';
import type { TimelineModel } from './timeline';

/**
 * A stand-in for `now` that stays the same for the whole local day, or the whole local hour
 * when `unit` is `'hour'` (pass the finest scale unit). Build the timeline from it and place
 * the today line with `todayX(timeline, now)`: the timeline then changes only when the day or
 * hour does.
 *
 * The value is the first millisecond after the start of the local day / hour, read from the
 * instant's local fields: `now` is an instant, never a date-only value. The extra millisecond
 * keeps it off unit boundaries and away from UTC midnight (which date-only normalisation would
 * read as a calendar date), so every `now`-dependent part of `buildTimeline` except `todayX` —
 * the range that keeps today visible, the current header cells — is the same as for `now`
 * itself. Across a daylight-saving change the day / hour is the local one: a repeated hour is
 * one hour, a skipped one does not occur.
 */
export function quantizeNow(now: Date, unit: TimeUnit): Date {
  const y = now.getFullYear(),
    m = now.getMonth(),
    d = now.getDate();
  const start = unit === 'hour' ? new Date(y, m, d, now.getHours()) : new Date(y, m, d);
  return new Date(start.getTime() + 1);
}

/**
 * x of the today line for the instant `now` on `timeline`, or `null` when it falls outside the
 * timeline. Same placement as `TimelineModel.todayX` (local calendar time, no date-only
 * normalisation), so a timeline built from `quantizeNow(now, unit)` and this x draw exactly what
 * a timeline built from `now` draws. Hiding the line (`config.showToday`) is up to the caller.
 */
export function todayX(timeline: Pick<TimelineModel, 'start' | 'pxPerDay' | 'totalWidth'>, now: Date): number | null {
  const x = Math.round((calendarDays(now, false) - calendarDays(timeline.start, false)) * timeline.pxPerDay);
  return x >= 0 && x <= timeline.totalWidth ? x : null;
}
