// ─────────────────────────────────────────────────────────────
//  Tests — Phase 13 (step 2.3): durations and lags typed and shown in
//  working units (`parseDuration`, `formatDurationInput`,
//  `endForDuration`, `parsePredecessors`, `formatPredecessors`). Without
//  a calendar, and with `durations: 'calendar'`, every result is
//  today's. October 2026: Monday the 12th, Saturday the 17th, Wednesday
//  the 21st a holiday. Hour calendars work 8–12 and 13–16 (seven hours:
//  no shift boundary is a UTC midnight in the test:tz zones). Dates are
//  built with `new Date(y, m, d, …)`; UTC date-only values with Date.UTC.
// ─────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import {
  endForDuration,
  formatDurationInput,
  formatPredecessors,
  parseDuration,
  parsePredecessors,
} from '../editing/parse';
import { isUtcDateOnly } from '../gantt-math';
import { resolveConfig } from '../render/config';
import { taskDuration } from '../calendar/durations';
import { DependencyType, type GanttOptions, type GanttTask } from '../types';

const oct = (day: number, h = 0, mi = 0): Date => new Date(2026, 9, day, h, mi);
const utc = (day: number): Date => new Date(Date.UTC(2026, 9, day));
/** A UTC date-only value is distinguishable from a local date only where the offset isn't 0 (the UTC zone). */
const DATE_ONLY = utc(12).getTimezoneOffset() !== 0;
const HOLIDAY = oct(21);
const SHIFT = [
  { start: 8, end: 12 },
  { start: 13, end: 16 },
];
const config = (options: GanttOptions = {}) => resolveConfig(options);

/** No calendar: today's behaviour. */
const CLEAR = config();
/** A calendar that counts calendar days: the texts stay today's. */
const CAL_DURATIONS = config({ calendar: { durations: 'calendar' } });
/** Working days, Mon–Fri, Wednesday 21 a holiday. */
const DAYS = config({ calendar: true, nonWorkingTime: { holidays: [HOLIDAY] } });
/** Working hours 8–12 / 13–16, a day of `hoursPerDay` hours. */
const hours = (hoursPerDay: number, extra: GanttOptions = {}) =>
  config({ calendar: { unit: 'hour', hoursPerDay }, nonWorkingTime: { workingHours: SHIFT }, ...extra });
const HOURS_7 = hours(7);
const HOURS_8 = hours(8);
const HOURS_6 = hours(6);

const task = (id: string, start: Date, end: Date): GanttTask => ({ id, name: id, start, end });
const TASKS: GanttTask[] = [task('a', oct(12), oct(14)), task('b', oct(14), oct(16))];

describe('parseDuration', () => {
  const TEXTS = ['5', '5d', '2w', '4h', '1.5d', '1,5d', '.5h', '0.25W', '12 H', ' 3 d '];
  const legacy = (text: string): number => {
    const m = /^\s*([\d.,]+)\s*([dwh]?)\s*$/i.exec(text)!;
    return Number(m[1].replace(',', '.')) * { d: 1, w: 7, h: 1 / 24 }[(m[2] || 'd').toLowerCase() as 'd'];
  };

  it('without a reading, with no calendar, or with calendar durations: today’s units, to the bit', () => {
    for (const text of TEXTS) {
      const expected = legacy(text);
      expect(parseDuration(text)).toBe(expected);
      expect(parseDuration(text, CLEAR)).toBe(expected);
      expect(parseDuration(text, CAL_DURATIONS)).toBe(expected);
    }
  });

  it('working days: a week is the working week, an hour 1/24 of a day', () => {
    expect(parseDuration('5d', DAYS)).toBe(5);
    expect(parseDuration('1.5d', DAYS)).toBe(1.5);
    expect(parseDuration('2w', DAYS)).toBe(10);
    expect(parseDuration('12h', DAYS)).toBe(12 * (1 / 24));
    expect(parseDuration('12h', DAYS)).toBe(0.5);
  });

  it('a week is the weekdays with working time', () => {
    expect(parseDuration('1w', config({ calendar: true, nonWorkingTime: { weekends: [0] } }))).toBe(6);
    expect(parseDuration('1w', config({ calendar: true, nonWorkingTime: { weekends: [0, 1, 6] } }))).toBe(4);
  });

  it('working hours: an hour is 1/hoursPerDay of a day', () => {
    expect(parseDuration('20h', HOURS_8)).toBe(2.5);
    expect(parseDuration('4h', HOURS_8)).toBe(0.5);
    expect(parseDuration('9h', HOURS_6)).toBe(1.5);
    expect(parseDuration('10h', HOURS_6)).toBeCloseTo(10 / 6, 12);
    expect(parseDuration('1w', HOURS_8)).toBe(5);
    expect(parseDuration('3d', HOURS_6)).toBe(3);
  });

  it('keeps rejecting what is not a duration', () => {
    for (const reading of [undefined, DAYS, HOURS_8]) {
      for (const text of ['', 'abc', '5x', '-2d', '1d 4h', '..']) {
        expect(() => parseDuration(text, reading)).toThrow(/syntax/);
      }
    }
  });
});

describe('formatDurationInput', () => {
  const span = (start: Date, end: Date) => task('t', start, end);

  it('without a calendar, or with calendar durations: today’s texts', () => {
    const cases: [GanttTask, string][] = [
      [span(oct(12), oct(17)), '5d'],
      [span(oct(12), oct(12, 12)), '12h'],
      [span(oct(12), oct(13, 12)), '1.5d'],
      [span(oct(12, 9), oct(12, 15, 30)), '6.5h'],
      [span(oct(16), oct(20)), '4d'],
      [span(utc(12), utc(17)), '5d'],
    ];
    for (const [t, text] of cases) {
      expect(formatDurationInput(t, CLEAR)).toBe(text);
      expect(formatDurationInput(t, CAL_DURATIONS)).toBe(text);
    }
  });

  it('working days: the days off do not count', () => {
    expect(formatDurationInput(span(oct(19), oct(24)), DAYS)).toBe('4d'); // Mon–Sat, Wednesday a holiday
    expect(formatDurationInput(span(oct(19), oct(24)), CAL_DURATIONS)).toBe('5d');
    expect(formatDurationInput(span(oct(16), oct(20)), DAYS)).toBe('2d'); // Fri + Mon
    expect(formatDurationInput(span(oct(19), oct(20, 12)), DAYS)).toBe('1.5d');
    expect(formatDurationInput(span(oct(16, 12), oct(19, 12)), DAYS)).toBe('1d');
    expect(formatDurationInput(span(oct(17), oct(18)), DAYS)).toBe('0d');
    expect(formatDurationInput(span(oct(19), oct(19, 12)), DAYS)).toBe('12h');
  });

  it('working days: an inclusive end and a UTC date-only task read as drawn', () => {
    const inclusive = config({ calendar: true, endDateMode: 'inclusive', nonWorkingTime: { holidays: [HOLIDAY] } });
    expect(formatDurationInput(span(oct(19), oct(23)), inclusive)).toBe('4d');
    expect(formatDurationInput(span(utc(12), utc(17)), DAYS)).toBe('5d');
  });

  it('working hours: whole days of hoursPerDay, else hours', () => {
    expect(formatDurationInput(span(oct(12, 8), oct(12, 16)), HOURS_7)).toBe('1d');
    expect(formatDurationInput(span(oct(12, 8), oct(13, 12)), HOURS_7)).toBe('11h');
    expect(formatDurationInput(span(oct(12, 8), oct(12, 15)), HOURS_7)).toBe('6h');
    expect(formatDurationInput(span(oct(12, 8), oct(14, 16)), HOURS_7)).toBe('3d');
    expect(formatDurationInput(span(oct(12, 8), oct(12, 16)), HOURS_8)).toBe('7h');
    expect(formatDurationInput(span(oct(12, 8), oct(12, 16)), HOURS_6)).toBe('7h');
    expect(formatDurationInput(span(oct(16, 8), oct(19, 9)), HOURS_7)).toBe('8h'); // Friday + the hour after Monday 8:00
  });

  it('what is shown is read back (to the measured duration)', () => {
    const tasks = [
      span(oct(19), oct(24)),
      span(oct(16), oct(20)),
      span(oct(19), oct(20, 12)),
      span(oct(16, 12), oct(19, 12)),
      span(oct(12, 8), oct(13, 12)),
      span(oct(12, 8), oct(14, 16)),
      span(oct(12, 9), oct(16, 15)),
    ];
    for (const reading of [DAYS, HOURS_7, HOURS_8, HOURS_6]) {
      for (const t of tasks) {
        const text = formatDurationInput(t, reading);
        expect(parseDuration(text, reading)).toBeCloseTo(taskDuration(t, reading), 1);
      }
    }
  });
});

describe('endForDuration', () => {
  it('without a calendar, or with calendar durations: today’s ends', () => {
    const t = task('t', oct(12), oct(17));
    for (const reading of [CLEAR, CAL_DURATIONS]) {
      expect(endForDuration(t, 3, reading)).toEqual(oct(15));
      expect(endForDuration(t, 8, reading)).toEqual(oct(20));
      expect(endForDuration(t, 1.5, reading)).toEqual(oct(13, 12));
      expect(endForDuration(t, 0.5, reading)).toEqual(oct(12, 12));
    }
    const u = task('u', utc(12), utc(17));
    const end = endForDuration(u, 3, CLEAR);
    expect(isUtcDateOnly(end)).toBe(DATE_ONLY);
    expect(end.getTime()).toBe(utc(15).getTime());
  });

  it('working days: the end counts working days from the start, skipping days off', () => {
    const friday = task('f', oct(16), oct(17));
    expect(endForDuration(friday, 3, DAYS)).toEqual(oct(21)); // Fri, Mon, Tue: ends where Wednesday begins
    expect(endForDuration(friday, 4, DAYS)).toEqual(oct(23)); // the holiday is skipped
    expect(endForDuration(friday, 1, DAYS)).toEqual(oct(17));
    expect(endForDuration(friday, 0.5, DAYS)).toEqual(oct(16, 12));
    expect(endForDuration(friday, 3, CAL_DURATIONS)).toEqual(oct(19));
  });

  it('working days: a start on a day off counts from the next working time', () => {
    expect(endForDuration(task('s', oct(17), oct(18)), 2, DAYS)).toEqual(oct(21));
  });

  it('keeps an inclusive end inclusive', () => {
    const inclusive = config({ calendar: true, endDateMode: 'inclusive', nonWorkingTime: { holidays: [HOLIDAY] } });
    const t = task('i', oct(12), oct(16));
    expect(endForDuration(t, 3, inclusive)).toEqual(oct(14));
    expect(endForDuration(t, 6, inclusive)).toEqual(oct(19)); // Mon–Fri, then Monday
    expect(endForDuration(t, 5, inclusive)).toEqual(oct(16));
  });

  it('keeps a UTC date-only task date-only', () => {
    const t = task('u', utc(12), utc(17));
    const end = endForDuration(t, 3, DAYS);
    expect(isUtcDateOnly(end)).toBe(DATE_ONLY);
    expect(end.getTime()).toBe(utc(15).getTime());
    const over = endForDuration(task('v', utc(16), utc(17)), 3, DAYS);
    expect(isUtcDateOnly(over)).toBe(DATE_ONLY);
    expect(over.getTime()).toBe(utc(21).getTime());
  });

  it('working hours: the end counts working hours (the lunch break and the night are skipped)', () => {
    const t = task('h', oct(12, 8), oct(12, 16));
    expect(endForDuration(t, 1, HOURS_7)).toEqual(oct(12, 16));
    expect(endForDuration(t, 6 / 7, HOURS_7)).toEqual(oct(12, 15));
    expect(endForDuration(t, 1.5, HOURS_7)).toEqual(oct(13, 11, 30)); // 7 h + 3.5 h
    expect(endForDuration(t, 2, HOURS_7)).toEqual(oct(13, 16));
    expect(endForDuration(t, 5, HOURS_7)).toEqual(oct(16, 16));
    expect(endForDuration(t, 6, HOURS_7)).toEqual(oct(19, 16));
  });
});

describe('predecessor lags', () => {
  const ctx = (dates?: GanttOptions) => ({
    tasks: TASKS,
    selfId: 'z',
    ...(dates ? { dates: config(dates) } : {}),
  });

  it('without a reading, with no calendar, or with calendar durations: today’s lags', () => {
    for (const dates of [undefined, CLEAR, CAL_DURATIONS]) {
      const c = { tasks: TASKS, selfId: 'z', dates };
      expect(parsePredecessors('a FS+2d', c)).toEqual([{ taskId: 'a', lag: 2 }]);
      expect(parsePredecessors('b SS-4h', c)).toEqual([{ taskId: 'b', type: DependencyType.SS, lag: -4 * (1 / 24) }]);
      expect(parsePredecessors('a+1w; b-12h', c)).toEqual([
        { taskId: 'a', lag: 7 },
        { taskId: 'b', lag: -12 * (1 / 24) },
      ]);
    }
    expect(parsePredecessors('a+2d', ctx())).toEqual([{ taskId: 'a', lag: 2 }]);
  });

  it('working days: a week is the working week, an hour 1/24', () => {
    const c = { tasks: TASKS, selfId: 'z', dates: DAYS };
    expect(parsePredecessors('a+1w', c)).toEqual([{ taskId: 'a', lag: 5 }]);
    expect(parsePredecessors('b-12h', c)).toEqual([{ taskId: 'b', lag: -0.5 }]);
    expect(parsePredecessors('a SS+3d', c)).toEqual([{ taskId: 'a', type: DependencyType.SS, lag: 3 }]);
  });

  it('working hours: an hour is 1/hoursPerDay of a day (hoursPerDay 8 and 6)', () => {
    const at8 = { tasks: TASKS, selfId: 'z', dates: HOURS_8 };
    const at6 = { tasks: TASKS, selfId: 'z', dates: HOURS_6 };
    expect(parsePredecessors('a FS+2d', at8)).toEqual([{ taskId: 'a', lag: 2 }]);
    expect(parsePredecessors('b SS-4h', at8)).toEqual([{ taskId: 'b', type: DependencyType.SS, lag: -0.5 }]);
    const six = parsePredecessors('b SS-4h', at6)[0];
    expect(six.type).toBe(DependencyType.SS);
    expect(six.lag).toBeCloseTo(-4 / 6, 12);
    expect(parsePredecessors('a+3h', at6)[0].lag).toBe(0.5);
  });

  it('formats lags in the units they are typed', () => {
    const links: GanttTask = {
      id: 'z',
      name: 'z',
      start: oct(19),
      end: oct(20),
      dependency: [
        { taskId: 'a', type: DependencyType.FS, lag: 2 },
        { taskId: 'b', type: DependencyType.SS, lag: -0.5 },
      ],
    };
    expect(formatPredecessors(links)).toBe('a FS+2d; b SS-12h');
    expect(formatPredecessors(links, CLEAR)).toBe('a FS+2d; b SS-12h');
    expect(formatPredecessors(links, CAL_DURATIONS)).toBe('a FS+2d; b SS-12h');
    expect(formatPredecessors(links, DAYS)).toBe('a FS+2d; b SS-12h');
    expect(formatPredecessors(links, HOURS_8)).toBe('a FS+2d; b SS-4h');
    expect(formatPredecessors(links, HOURS_6)).toBe('a FS+2d; b SS-3h');
    const half: GanttTask = { ...links, dependency: [{ taskId: 'a', lag: 1.5 }, { taskId: 'b' }] };
    expect(formatPredecessors(half)).toBe('a FS+1.5d; b');
    expect(formatPredecessors(half, DAYS)).toBe('a FS+1.5d; b');
    expect(formatPredecessors(half, HOURS_8)).toBe('a FS+12h; b');
    expect(formatPredecessors({ ...links, dependency: [{ taskId: 'a', lag: -3 }] }, HOURS_6)).toBe('a FS-3d');
  });

  it('what is shown is read back (seeded amounts, hoursPerDay 6 / 7.5 / 8, working days)', () => {
    let seed = 20261012;
    const next = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const readings: [string, GanttOptions][] = [
      ['6', { calendar: { unit: 'hour', hoursPerDay: 6 } }],
      ['7.5', { calendar: { unit: 'hour', hoursPerDay: 7.5 } }],
      ['8', { calendar: { unit: 'hour', hoursPerDay: 8 } }],
      ['days', { calendar: true }],
    ];
    for (const [name, options] of readings) {
      const dates = config(options);
      const perDay = dates.calendar!.unit === 'hour' ? dates.calendar!.hoursPerDay : 24;
      for (let i = 0; i < 100; i++) {
        // half hours of the working day (a quarter of an hour for working days)
        const lag = ((Math.floor(next() * 160) - 80) * (dates.calendar!.unit === 'hour' ? 0.5 : 0.25)) / perDay;
        const holder: GanttTask = { ...TASKS[0], id: 'z', dependency: [{ taskId: 'a', lag }] };
        const text = formatPredecessors(holder, dates);
        const back = parsePredecessors(text, { tasks: TASKS, selfId: 'z', dates })[0];
        expect(back.lag ?? 0, `${name}: ${text}`).toBeCloseTo(lag, 9);
        expect(formatPredecessors({ ...holder, dependency: [back] }, dates)).toBe(text);
      }
    }
  });
});
