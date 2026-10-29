// Test helper: a day-walking oracle for the working-time arithmetic of `buildWorkingCalendar`.
// It shares no code with the engine (no weekday-cycle arithmetic, no holiday prefix sums, no
// galloping search): it walks every local day once from the epoch, tabulates W at each local
// midnight and answers every question from the table, one day at a time. Dates are local
// instants; a day calendar measures elapsed day fractions, an hour calendar wall-clock hours.
import type { GanttHourRange } from '../types';

const MS_PER_DAY = 24 * 3600 * 1000;

/** The calendar the oracle walks: the raw facts, before the engine's resolution. */
export interface OracleSpec {
  unit: 'day' | 'hour';
  /** Weekdays off (0 = Sunday) */
  weekends: ReadonlySet<number>;
  /** Holidays as epoch days (local days from 1970-01-01) */
  holidays: ReadonlySet<number>;
  /** Working ranges of a weekday, as given (any order, may overlap or reach out of 0–24); unset: all day */
  hours: ((weekday: number) => readonly GanttHourRange[]) | null;
}

/** Epoch day of the local day of `date` (1970-01-01 = 0). */
export const epochDayOf = (date: Date): number =>
  Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY);

/** Local midnight of an epoch day. */
export const midnightOf = (day: number): Date => {
  const base = new Date(day * MS_PER_DAY);
  return new Date(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
};

const weekdayOf = (day: number): number => new Date(day * MS_PER_DAY).getUTCDay();

/** Sorted, clamped, merged working ranges (the union of what was given). */
export function unionRanges(ranges: readonly GanttHourRange[]): GanttHourRange[] {
  const sorted = ranges
    .map(r => ({ start: Math.max(0, r.start), end: Math.min(24, r.end) }))
    .filter(r => r.end > r.start)
    .sort((a, b) => a.start - b.start);
  const out: GanttHourRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** Wall-clock hours since the local midnight. */
const wall = (d: Date): number =>
  d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 + d.getMilliseconds() / 3_600_000;

export interface Oracle {
  /** Working ranges of an epoch day (empty on a weekend or a holiday; all day in a day calendar) */
  rangesOn(day: number): readonly GanttHourRange[];
  /** Working time from the epoch to `date` */
  w(date: Date): number;
  /** The first instant with W = w */
  end(w: number): Date;
  /** The last instant with W = w */
  start(w: number): Date;
  /** Working time follows `date` at once */
  isWorking(date: Date): boolean;
  /** Working time ends at `date` or runs through it */
  workedUpTo(date: Date): boolean;
  /** The local day of `date` has working time */
  isWorkingDay(date: Date): boolean;
  /** Length of the local day of `date` in hours (23, 24, 25, 23.5 …) */
  dayHours(date: Date): number;
}

/** Walk the days from `first` to `last` (epoch days) and tabulate W at each midnight. */
export function buildOracle(spec: OracleSpec, first = -4000, last = 24500): Oracle {
  const weekRanges = Array.from({ length: 7 }, (_, wd) =>
    spec.unit === 'hour' && spec.hours ? unionRanges(spec.hours(wd)) : [{ start: 0, end: 24 }],
  );
  const rangesOn = (day: number): readonly GanttHourRange[] =>
    spec.weekends.has(weekdayOf(day)) || spec.holidays.has(day) ? [] : weekRanges[weekdayOf(day)];
  const unitsOn = (day: number): number =>
    spec.unit === 'day' ? (rangesOn(day).length ? 1 : 0) : rangesOn(day).reduce((s, r) => s + r.end - r.start, 0);

  // cum[i]: W at the local midnight of epoch day first + i, walked from day 0 in both directions
  const cum = new Float64Array(last - first + 2);
  for (let day = 1; day <= last + 1; day++) cum[day - first] = cum[day - 1 - first] + unitsOn(day - 1);
  for (let day = -1; day >= first; day--) cum[day - first] = cum[day + 1 - first] - unitsOn(day);
  const at = (day: number): number => {
    if (day < first || day > last + 1) throw new Error(`oracle: day ${day} outside ${first}…${last + 1}`);
    return cum[day - first];
  };

  const withinDay = (date: Date): number => {
    const day = epochDayOf(date);
    const ranges = rangesOn(day);
    if (!ranges.length) return 0;
    if (spec.unit === 'day') {
      const m0 = midnightOf(day).getTime();
      const m1 = midnightOf(day + 1).getTime();
      return (date.getTime() - m0) / (m1 - m0);
    }
    const h = wall(date);
    return ranges.reduce((s, r) => s + Math.min(Math.max(h - r.start, 0), r.end - r.start), 0);
  };

  /** The instant `amount` units into the working time of `day`; on a range boundary the end of the first or the start of the next. */
  const instant = (day: number, amount: number, atEnd: boolean): Date => {
    const m0 = midnightOf(day);
    if (spec.unit === 'day') {
      const m1 = midnightOf(day + 1).getTime();
      return new Date(m0.getTime() + Math.round(amount * (m1 - m0.getTime())));
    }
    let rest = amount;
    for (const r of rangesOn(day)) {
      const len = r.end - r.start;
      if (atEnd ? rest <= len : rest < len) {
        return new Date(
          m0.getFullYear(),
          m0.getMonth(),
          m0.getDate(),
          0,
          0,
          0,
          Math.round((r.start + rest) * 3_600_000),
        );
      }
      rest -= len;
    }
    throw new Error(`oracle: ${amount} is past the working time of day ${day}`);
  };

  /** The first day in [first, last] for which `test` holds (a monotone predicate; a plain bisection over the table). */
  const firstDayWhere = (test: (day: number) => boolean): number => {
    let lo = first;
    let hi = last + 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (test(mid)) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };

  const rangeCovers = (date: Date): boolean => {
    const ranges = rangesOn(epochDayOf(date));
    if (spec.unit === 'day') return ranges.length > 0;
    const h = wall(date);
    return ranges.some(r => r.start <= h && h < r.end);
  };

  return {
    rangesOn,
    w: date => at(epochDayOf(date)) + withinDay(date),
    // cum[day] < w ≤ cum[day + 1]: the day working time reaches w on
    end: w => {
      const day = firstDayWhere(d => at(d + 1) >= w);
      return instant(day, w - at(day), true);
    },
    // cum[day] ≤ w < cum[day + 1]: the day working time passes w on
    start: w => {
      const day = firstDayWhere(d => at(d) > w) - 1;
      return instant(day, w - at(day), false);
    },
    isWorking: rangeCovers,
    // Working time runs up to `date` when it covers the millisecond before it
    workedUpTo: date => rangeCovers(new Date(date.getTime() - 1)),
    isWorkingDay: date => rangesOn(epochDayOf(date)).length > 0,
    dayHours: date => {
      const day = epochDayOf(date);
      return (midnightOf(day + 1).getTime() - midnightOf(day).getTime()) / 3_600_000;
    },
  };
}

// ─── Seeded random calendars ─────────────────────────────────

/** A small seeded generator (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RandomCalendar {
  /** `options.nonWorkingTime` for `resolveNonWorking` */
  options: {
    weekends: number[];
    holidays: { start: Date; end: Date }[];
    workingHours?: GanttHourRange[] | Partial<Record<number, GanttHourRange[]>>;
  };
  /** What the oracle walks (the same facts) */
  spec: Omit<OracleSpec, 'unit'>;
}

/** Quarter-hour multiples keep the sums exact in binary floating point. */
const quarter = (rand: () => number, lo: number, hi: number): number =>
  lo + Math.floor(rand() * ((hi - lo) * 4 + 1)) / 4;

function randomRanges(rand: () => number): GanttHourRange[] {
  const count = 1 + Math.floor(rand() * 3);
  const out: GanttHourRange[] = [];
  for (let i = 0; i < count; i++) {
    const start = quarter(rand, i === 0 && rand() < 0.1 ? -2 : 0, 22);
    const end = Math.min(start + quarter(rand, 0.25, 9), rand() < 0.1 ? 26 : 24);
    out.push({ start, end });
  }
  // Touching or overlapping ranges, out of order, are part of the input
  return rand() < 0.5 ? out : out.reverse();
}

/**
 * A random calendar around 2024–2028 (plus a few holidays near the epoch): 0–3 weekend days, up to
 * 60 holidays (single days and runs, some on weekends), and one of five working-hours shapes.
 * `heavy` adds a closure of 400 days, to make the engine gallop over a long run of holidays.
 */
export function randomCalendar(seed: number, heavy = false): RandomCalendar {
  const rand = seeded(seed);
  const weekends = [0, 1, 2, 3, 4, 5, 6].filter(() => rand() < 0.3).slice(0, 3);
  if (weekends.length === 7) weekends.length = 0;
  const holidays: { start: Date; end: Date }[] = [];
  const holidayDays = new Set<number>();
  const addHoliday = (start: Date, length: number): void => {
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + length - 1);
    holidays.push({ start, end });
    for (let d = epochDayOf(start); d <= epochDayOf(end); d++) holidayDays.add(d);
  };
  const count = Math.floor(rand() * 60);
  for (let i = 0; i < count; i++) {
    const start = new Date(2024, 0, 1 + Math.floor(rand() * 5 * 366));
    addHoliday(start, rand() < 0.7 ? 1 : 2 + Math.floor(rand() * 12));
  }
  for (let i = 0; i < 3; i++) addHoliday(new Date(1969, 11, 20 + Math.floor(rand() * 20)), 1 + Math.floor(rand() * 4));
  if (heavy) addHoliday(new Date(2025, 5, 1), 400);

  const shape = Math.floor(rand() * 5);
  let workingHours: RandomCalendar['options']['workingHours'];
  let hours: OracleSpec['hours'] = null;
  if (shape === 1) {
    const one = randomRanges(rand).slice(0, 1);
    workingHours = one;
    hours = () => one;
  } else if (shape === 2) {
    const list = randomRanges(rand);
    workingHours = list;
    hours = () => list;
  } else if (shape === 3) {
    // A per-weekday map: some weekdays have no hours at all
    const map: Partial<Record<number, GanttHourRange[]>> = {};
    for (let wd = 0; wd < 7; wd++) if (rand() < 0.75) map[wd] = randomRanges(rand);
    workingHours = map;
    hours = wd => map[wd] ?? [];
  } else if (shape === 4) {
    const lunch = [
      { start: quarter(rand, 6, 9), end: 12 },
      { start: 13, end: quarter(rand, 16, 19) },
    ];
    workingHours = lunch;
    hours = () => lunch;
  }
  const spec: RandomCalendar['spec'] = { weekends: new Set(weekends), holidays: holidayDays, hours };
  return { options: workingHours ? { weekends, holidays, workingHours } : { weekends, holidays }, spec };
}

/** Whether the calendar has any working time in the unit (the engine builds `null` otherwise). */
export function hasWorkingTime(spec: OracleSpec): boolean {
  for (let wd = 0; wd < 7; wd++) {
    if (spec.weekends.has(wd)) continue;
    if (spec.unit === 'day' || !spec.hours || unionRanges(spec.hours(wd)).length) return true;
  }
  return false;
}
