// ─────────────────────────────────────────────────────────────
//  gantry · editing/parse.ts
//  Text ↔ value for the built-in cell editors (D14): predecessors
//  (`a FS+2d; b SS`), durations (`5`, `5d`, `2w`, `4h`, `1.5d`) and the
//  values of `<input type=date | datetime-local>`. Dates go through
//  `addDays` / `normalizeDateOnly` rules: a UTC date-only task date
//  gives a UTC date-only result, so undo restores the user's shape.
//
//  Durations are whole local calendar days plus real hours: `1d 4h`
//  from a start is "the same time the next day, then 4 hours later",
//  which is how the x axis (local calendar days) and the hour-scale
//  drags (`DragSession`) measure them, daylight-saving days included.
//  With a working calendar (`DateReading.calendar`, `durations:
//  'working'`) durations and lags are measured days instead: `w` is the
//  working week, `h` an hour of the working day, and an end counts
//  working time from the start (`calendar/durations`).
// ─────────────────────────────────────────────────────────────

import { addDayAmount, addDuration, measuresWorkingTime, spanDuration } from '../calendar/durations';
import { taskDateLike } from '../calendar/edit';
import { round2 } from '../calendar/time';
import { addDays, calendarDays, isUtcDateOnly, toLocalDay } from '../gantt-math';
import type { DateReading } from '../render/config';
import { taskDependencies } from '../render/columns';
import { spanEndToTaskEnd, taskSpan } from '../render/timeline';
import { DependencyType, type GanttDependency, type GanttTask } from '../types';

/** Why a text could not be parsed: an unknown task, a name shared by several tasks, or bad syntax. */
export type ParseErrorCode = 'unknown' | 'ambiguous' | 'syntax';

/** Thrown by the parsers: `code` and the offending `ref` (a task reference, or the text). */
export class ParseError extends Error {
  readonly code: ParseErrorCode;
  readonly ref: string;

  constructor(code: ParseErrorCode, ref: string, message = `${code}: ${ref}`) {
    super(message);
    this.name = 'ParseError';
    this.code = code;
    this.ref = ref;
  }
}

// ─── Day amounts (durations, lags) ────────────────────────────

const MINUTE_MS = 60_000;
const MINUTES_PER_DAY = 1440;

/**
 * An amount of days as editable text: whole days `5d`; sub-day amounts in hours (`4h`); other
 * amounts in days when two decimals hold them to the minute (`1.5d`), else in hours (`28h`).
 * Negative amounts keep their sign (`-2d`). Exact to the minute. Working durations of an hour
 * calendar count the hours of a working day (`hoursPerDay`): whole days `2d`, else hours (`20h`).
 */
function formatDayAmount(days: number, dates?: DateReading): string {
  const c = dates?.calendar;
  if (c?.durations === 'working' && c.unit === 'hour') {
    const whole = Math.round(days);
    return Math.abs(days - whole) < 1e-6 ? `${whole || 0}d` : `${round2(days * c.hoursPerDay)}h`;
  }
  const minutes = Math.round(days * MINUTES_PER_DAY);
  if (minutes % MINUTES_PER_DAY === 0) return `${minutes / MINUTES_PER_DAY || 0}d`;
  const hours = `${round2(minutes / 60)}h`;
  if (Math.abs(minutes) < MINUTES_PER_DAY) return hours;
  const d2 = round2(days);
  return Math.round(d2 * MINUTES_PER_DAY) === minutes ? `${d2}d` : hours;
}

const UNIT_DAYS: Readonly<Record<string, number>> = { d: 1, w: 7, h: 1 / 24 };

/**
 * `value` of `unit` (`d`, `w`, `h`) as measured days. Calendar durations (no reading, no calendar,
 * or `durations: 'calendar'`): a week is 7 days and an hour 1/24 day. Working durations: a week is
 * the weekdays with working time (`daysPerWeek`) and, with `unit: 'hour'`, an hour is
 * 1/`hoursPerDay` of a day.
 */
function amountDays(value: number, unit: string, dates?: DateReading): number {
  const c = dates?.calendar;
  if (c?.durations !== 'working') return value * UNIT_DAYS[unit]!;
  if (unit === 'w') return value * c.daysPerWeek;
  return unit === 'h' && c.unit === 'hour' ? value / c.hoursPerDay : value * UNIT_DAYS[unit]!;
}

/** A positive decimal (`5`, `1.5`, `.5`; `decimalComma` also takes `1,5`), or `NaN`. */
function readDecimal(text: string, decimalComma: boolean): number {
  const t = decimalComma && !text.includes('.') ? text.replace(',', '.') : text;
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(t) ? Number(t) : NaN;
}

/**
 * The days from `start` to `end` (both local, `end` ≥ `start`): whole local calendar days, plus
 * the real time left over (minute precision). The inverse of `addDayAmount`.
 */
function dayAmountBetween(start: Date, end: Date): number {
  // The calendar-day difference is within a day of the answer: days are 23–25 h long around a
  // daylight-saving change, so `start + whole days` is checked against `end`
  let whole = Math.max(0, Math.floor(calendarDays(end, false) - calendarDays(start, false)));
  while (addDays(start, whole + 1).getTime() <= end.getTime()) whole++;
  while (whole > 0 && addDays(start, whole).getTime() > end.getTime()) whole--;
  const restMinutes = Math.round((end.getTime() - addDays(start, whole).getTime()) / MINUTE_MS);
  return whole + Math.max(0, restMinutes) / MINUTES_PER_DAY;
}

// ─── Predecessors ─────────────────────────────────────────────

/** What `parsePredecessors` resolves references against. */
export interface ParsePredecessorsContext {
  tasks: readonly GanttTask[];
  /** The task being edited (a reference to it is a self link, left to validation) */
  selfId: string;
  /** How lags are measured (`w`, `h` units): the chart's config; unset: calendar days */
  dates?: DateReading | undefined;
}

const LINK_TYPES: Readonly<Record<string, DependencyType>> = {
  FS: DependencyType.FS,
  SS: DependencyType.SS,
  FF: DependencyType.FF,
  SF: DependencyType.SF,
};

/** `<rest><±n[d|w|h]>` at the end of an entry: the lag (no decimal comma, `,` separates entries). */
const LAG_RE = /^(.*?)\s*([+-])\s*(\d+(?:\.\d*)?|\.\d+)\s*([dwh])?$/i;
/** `<ref> <type>`: the type after whitespace */
const TYPE_SPACED_RE = /^(.*?)\s+(FS|SS|FF|SF)$/i;
/** `<ref><type>` (`2FS`, numeric ids as in MS Project) */
const TYPE_JOINED_RE = /^(.+?)(FS|SS|FF|SF)$/i;

type RefResult = { kind: 'hit'; id: string } | { kind: 'ambiguous' } | { kind: 'unknown' };

/** Resolves a reference: an exact id, else a unique exact name, else a unique id or name ignoring case. */
function refResolver(tasks: readonly GanttTask[]): (ref: string) => RefResult {
  const ids = new Set(tasks.map(t => t.id));
  let byName: Map<string, string[]> | undefined;
  let byLower: Map<string, Set<string>> | undefined;
  const push = <V>(map: Map<string, V[]>, key: string, value: V) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };
  return ref => {
    if (ids.has(ref)) return { kind: 'hit', id: ref };
    if (!byName) {
      byName = new Map();
      byLower = new Map();
      for (const t of tasks) {
        const name = t.name.trim();
        push(byName, name, t.id);
        for (const key of [t.id.toLowerCase(), name.toLowerCase()]) {
          const set = byLower.get(key) ?? new Set<string>();
          set.add(t.id);
          byLower.set(key, set);
        }
      }
    }
    const exact = byName.get(ref);
    if (exact) return exact.length === 1 ? { kind: 'hit', id: exact[0]! } : { kind: 'ambiguous' };
    const loose = byLower?.get(ref.toLowerCase());
    if (!loose) return { kind: 'unknown' };
    return loose.size === 1 ? { kind: 'hit', id: [...loose][0]! } : { kind: 'ambiguous' };
  };
}

interface EntryReading {
  ref: string;
  type: DependencyType;
  lag: number;
}

/**
 * The readings of one entry, most literal first: the whole text as a ref; the ref before a lag;
 * the ref before a spaced type (and lag); the ref joined to a type (`2FS`). Empty refs are left out.
 */
function entryReadings(
  entry: string,
  dates?: DateReading,
): { readings: EntryReading[]; errorRef: string | null; onlyLag: boolean } {
  const readings: EntryReading[] = [{ ref: entry, type: DependencyType.FS, lag: 0 }];
  let rest = entry;
  let lag = 0;
  let onlyLag = false;
  // The ref an unknown entry reports: the name before a type, or before an obvious lag (`+n`, `-nd`)
  let errorRef: string | null = null;
  const m = LAG_RE.exec(entry);
  if (m) {
    const value = amountDays(Number(m[3]), (m[4] ?? 'd').toLowerCase(), dates);
    lag = m[2] === '-' ? -value : value;
    rest = m[1]!.trim();
    if (rest) readings.push({ ref: rest, type: DependencyType.FS, lag });
    else onlyLag = true;
    if (rest && (m[4] || m[2] === '+')) errorRef = rest;
  }
  const spaced = TYPE_SPACED_RE.exec(rest);
  if (spaced?.[1]) {
    errorRef = spaced[1].trim();
    readings.push({ ref: errorRef, type: LINK_TYPES[spaced[2]!.toUpperCase()]!, lag });
  } else {
    const joined = TYPE_JOINED_RE.exec(rest);
    if (joined?.[1]?.trim()) {
      readings.push({ ref: joined[1].trim(), type: LINK_TYPES[joined[2]!.toUpperCase()]!, lag });
    }
  }
  return { readings, errorRef, onlyLag };
}

/**
 * The `predecessors` cell's text as dependencies. Entries are separated by `;` or `,`; each is
 * `<ref>[ <FS|SS|FF|SF>][±n[d|w|h]]` (case-insensitive; the lag unit defaults to days, `w` = 7
 * days, `h` = 1/24; in working days `w` is the working week and `h` an hour of the working day,
 * `ctx.dates`). A ref is a task id, else the name of exactly one task (exact first, then
 * ignoring case). Empty text, or only separators: `[]`.
 *
 * Each entry is read most literally first, so ids such as `task-2` or names with spaces stay
 * whole: the entire text as a ref, then the ref before a lag (`a+2d`), then before a type
 * (`a SS`, `a SS-1w`, `2FS+3d`). The first reading whose ref is found (or is ambiguous) wins.
 *
 * Results are minimal objects in text order: `{ taskId }`, plus `type` when it isn't FS and `lag`
 * (days) when it isn't 0. A reference to `ctx.selfId` and repeated entries are returned as they
 * are (validation rejects them). Throws `ParseError`: `unknown` (no such task; `ref` is the text
 * before the type or an obvious lag such as `+2` or `-1d`, else the entry), `ambiguous` (a name
 * shared by several tasks) or `syntax` (an entry without a ref, such as `+2d`).
 */
export function parsePredecessors(text: string, ctx: ParsePredecessorsContext): GanttDependency[] {
  const resolve = refResolver(ctx.tasks);
  const out: GanttDependency[] = [];
  for (const raw of text.split(/[;,]/)) {
    const entry = raw.trim();
    if (!entry) continue;
    const { readings, errorRef, onlyLag } = entryReadings(entry, ctx.dates);
    let found: GanttDependency | null = null;
    for (const r of readings) {
      const hit = resolve(r.ref);
      if (hit.kind === 'unknown') continue;
      if (hit.kind === 'ambiguous') throw new ParseError('ambiguous', r.ref);
      found = { taskId: hit.id };
      if (r.type !== DependencyType.FS) found.type = r.type;
      if (r.lag) found.lag = r.lag;
      break;
    }
    if (!found) {
      if (onlyLag && readings.length === 1) throw new ParseError('syntax', entry);
      throw new ParseError('unknown', errorRef ?? entry);
    }
    out.push(found);
  }
  return out;
}

/**
 * The predecessors of `task` as editable text, by id (`a; b SS+2d`): what `parsePredecessors`
 * reads back. The type shows when it isn't FS or a lag follows (`a FS+2d`); lags are whole days
 * (`+2d`), hours under a day (`-4h`), or days with up to two decimals (`+1.5d`). With working
 * durations of an hour calendar (`dates`) the hours are those of a working day (`-4h`, `+20h`).
 */
export function formatPredecessors(task: GanttTask, dates?: DateReading): string {
  return taskDependencies(task)
    .map(d => {
      const type = d.type ?? DependencyType.FS;
      const lag = d.lag ?? 0;
      const typed = type !== DependencyType.FS || lag ? ` ${type}` : '';
      const lagText = lag ? `${lag > 0 ? '+' : ''}${formatDayAmount(lag, dates)}` : '';
      return `${d.taskId}${typed}${lagText}`;
    })
    .join('; ');
}

// ─── Durations ────────────────────────────────────────────────

/**
 * A duration text in days: `5` and `5d` (days), `2w` (weeks), `4h` (hours), decimals allowed
 * (`1.5d`, `1,5d`), case-insensitive, spaces around the unit ignored. Not negative. Throws
 * `ParseError` (`syntax`) on anything else, empty text included. `dates` (the chart's config)
 * sets what the units measure: with working durations a week is the working week and, in an hour
 * calendar, an hour is 1/`hoursPerDay` of a day; without it, 7 days and 1/24.
 */
export function parseDuration(text: string, dates?: DateReading): number {
  const m = /^\s*([\d.,]+)\s*([dwh]?)\s*$/i.exec(text);
  const value = m ? readDecimal(m[1]!, true) : NaN;
  if (!m || !Number.isFinite(value)) throw new ParseError('syntax', text);
  return amountDays(value, (m[2] || 'd').toLowerCase(), dates);
}

/**
 * The duration of `task` as editable text, as drawn (`taskSpan`: date-only normalisation,
 * inclusive ends): whole days `5d`, sub-day durations in hours (`6h`), others in days when two
 * decimals hold them (`1.5d`), else in hours (`28h`). With working durations the days are
 * measured days (`spanDuration`), and in an hour calendar the hours are those of a working day:
 * whole days `2d`, else hours (`20h`). What `parseDuration` reads back.
 */
export function formatDurationInput(task: Pick<GanttTask, 'start' | 'end'>, dates: DateReading): string {
  const span = taskSpan(task, dates);
  const days = measuresWorkingTime(dates) ? spanDuration(span, dates) : dayAmountBetween(span.start, span.end);
  return formatDayAmount(days, dates);
}

/**
 * The end that gives `task` a drawn duration of `days` (`parseDuration`) from its drawn start.
 * Whole days on a whole-day task move the stored end with `addDays` (a date-only end stays
 * date-only, an inclusive end stays inclusive); otherwise the drawn end is the start plus the
 * amount and becomes a task end through the `endDateMode` rule (`spanEndToTaskEnd`). With working
 * durations the amount is working time counted from the start (from the next working time when
 * the start is off), the end sits right after it, and it is written in the task's own form
 * (`taskDateLike`). What the built-in duration editor writes.
 */
export function endForDuration(task: Pick<GanttTask, 'start' | 'end'>, days: number, dates: DateReading): Date {
  const span = taskSpan(task, dates);
  const end = task.end ?? task.start;
  if (measuresWorkingTime(dates)) {
    return taskDateLike(end, spanEndToTaskEnd(addDuration(span.start, days, dates), dates), dates);
  }
  const current = dayAmountBetween(span.start, span.end);
  if (Number.isInteger(days) && Number.isInteger(current)) return addDays(end, days - current);
  return spanEndToTaskEnd(addDayAmount(span.start, days), dates);
}

// ─── Date inputs ──────────────────────────────────────────────

/** The value of a date editor: `<input type=date>` or `<input type=datetime-local>`. */
export type DateInputKind = 'date' | 'datetime-local';

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/**
 * `date` as an input's value (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`), read as a local calendar day
 * (`toLocalDay`: a UTC date-only value shows its own day). Seconds are dropped.
 */
export function formatDateInput(date: Date, kind: DateInputKind): string {
  const d = toLocalDay(date);
  const day = `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return kind === 'date' ? day : `${day}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?$/;

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** A local date from fields, years below 100 included (`new Date` maps them to 19xx). */
function localDate(y: number, mo: number, d: number, h = 0, mi = 0, s = 0, ms = 0): Date {
  const out = new Date(2000, 0, 1, h, mi, s, ms);
  out.setFullYear(y, mo, d);
  return out;
}

/** A UTC date-only value from fields. */
function utcDay(y: number, mo: number, d: number): Date {
  const out = new Date(0);
  out.setUTCFullYear(y, mo, d);
  return out;
}

/**
 * An input's value as a date shaped like `like`: a UTC date-only `like` gives a UTC date-only
 * result (`normalizeDateOnly`) when the value has no time of day, otherwise the result is local.
 * A `date` value keeps the local time of day of `like`. `datetime-local` takes `T` or a space
 * before the time and optional seconds. Throws `ParseError` (`syntax`) on an empty or invalid
 * value (a day the month doesn't have included).
 */
export function parseDateInput(value: string, kind: DateInputKind, like: Date): Date {
  const text = value.trim();
  const m = (kind === 'date' ? DATE_RE : DATETIME_RE).exec(text);
  if (!m) throw new ParseError('syntax', value);
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const ref = toLocalDay(like);
  const h = kind === 'date' ? ref.getHours() : Number(m[4]);
  const mi = kind === 'date' ? ref.getMinutes() : Number(m[5]);
  const s = kind === 'date' ? ref.getSeconds() : Number(m[6] ?? 0);
  const ms = kind === 'date' ? ref.getMilliseconds() : Number((m[7] ?? '0').padEnd(3, '0'));
  if (mo < 0 || mo > 11) throw new ParseError('syntax', value);
  const daysInMonth = mo === 1 && isLeap(y) ? 29 : MONTH_DAYS[mo]!;
  if (d < 1 || d > daysInMonth || h > 23 || mi > 59 || s > 59) throw new ParseError('syntax', value);
  if (isUtcDateOnly(like) && h === 0 && mi === 0 && s === 0 && ms === 0) return utcDay(y, mo, d);
  return localDate(y, mo, d, h, mi, s, ms);
}
