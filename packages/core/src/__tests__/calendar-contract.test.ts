// ─────────────────────────────────────────────────────────────
//  Tests — Phase 13 contract (step 1.0): the working-time arithmetic
//  of `buildWorkingCalendar` / `createWorkingCalendar` (both units, a
//  holiday, a lunch break, a per-weekday map), the measured durations
//  and their texts (`formatDuration`, `formatFloat`), and the task
//  date helpers (`taskDateLike`, the snaps, `followTaskEnd`). October
//  2026: Monday the 12th, Saturday the 17th, the 21st (Wednesday) a
//  holiday. Dates are built with `new Date(y, m, d, …)`, so every
//  assertion holds in any time zone (`pnpm test:tz`).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  addDuration,
  buildWorkingCalendar,
  createWorkingCalendar,
  durationFactor,
  durationLabel,
  editCalendar,
  followTaskEnd,
  formatDuration,
  formatFloat,
  measureBetween,
  measuresWorkingTime,
  resolveConfig,
  resolveNonWorking,
  snapTaskEnd,
  snapTaskStart,
  spanDuration,
  taskDateLike,
  taskDuration,
  type GanttOptions,
  type WorkingCalendar,
} from '../index';

/** Local date in October 2026 (day, hour, minute). */
const oct = (day: number, h = 0, mi = 0): Date => new Date(2026, 9, day, h, mi);
const HOLIDAY = oct(21);
const LUNCH = [
  { start: 8, end: 12 },
  { start: 13, end: 17 },
];

/** Mon–Fri, Wednesday 21 Oct a holiday; a working day counts all day. */
const DAY = createWorkingCalendar({ nonWorkingTime: { holidays: [HOLIDAY] } })!;
/** The same week with hours: 8–12 and 13–17. */
const HOUR = createWorkingCalendar({
  calendar: { unit: 'hour' },
  nonWorkingTime: { holidays: [HOLIDAY], workingHours: LUNCH },
})!;
/** Mon–Wed 8–12 / 13–17, Friday 8–12, no hours on Thursday. */
const MAP = createWorkingCalendar({
  calendar: { unit: 'hour' },
  nonWorkingTime: { workingHours: { 1: LUNCH, 2: LUNCH, 3: LUNCH, 5: [{ start: 8, end: 12 }] } },
})!;

const reading = (options: GanttOptions) => resolveConfig(options);
const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('day calendar (Mon–Fri, one holiday)', () => {
  it('counts working days between instants, signed', () => {
    expect(DAY.workingDuration(oct(12), oct(17))).toBe(5);
    expect(DAY.workingDuration(oct(12), oct(19))).toBe(5);
    expect(DAY.workingDuration(oct(12), oct(12, 12))).toBe(0.5);
    expect(DAY.workingDuration(oct(16, 12), oct(19, 12))).toBe(1);
    expect(DAY.workingDuration(oct(17), oct(19))).toBe(0);
    expect(DAY.workingDuration(oct(19), oct(26))).toBe(4); // the holiday is not counted
    expect(DAY.workingDuration(oct(17), oct(12))).toBe(-5);
    expect(DAY.workingDuration(oct(21), oct(22))).toBe(0);
  });

  it('is continuous, non-decreasing and crosses the epoch', () => {
    // Monday 29 Dec 1969 … Monday 5 Jan 1970: one working week; Thursday 1 Jan 1970 (day 0) and Friday
    expect(DAY.workingDuration(new Date(1969, 11, 29), new Date(1970, 0, 5))).toBe(5);
    expect(DAY.workingDuration(new Date(1970, 0, 1), new Date(1970, 0, 5))).toBe(2);
    expect(DAY.workingDuration(new Date(1969, 11, 31), new Date(1970, 0, 1))).toBe(1);
    expect(DAY.workingDuration(new Date(2100, 0, 4), new Date(2100, 0, 11))).toBe(5);
    let last = -Infinity;
    for (let h = 0; h < 24 * 21; h += 5) {
      const w = DAY.toWorking(new Date(2026, 9, 10, h));
      expect(w).toBeGreaterThanOrEqual(last);
      last = w;
    }
  });

  it('adds working time after an instant, forward (an end) and back (a start)', () => {
    expect(DAY.addWorking(oct(12), 1)).toEqual(oct(13));
    expect(DAY.addWorking(oct(12), 5)).toEqual(oct(17)); // an end sits right after Friday
    expect(DAY.addWorking(oct(16), 1)).toEqual(oct(17));
    expect(DAY.addWorking(oct(17, 12), 1)).toEqual(oct(20)); // from the weekend: Monday's working day
    expect(DAY.addWorking(oct(12), 0.5)).toEqual(oct(12, 12));
    expect(DAY.addWorking(oct(19), 2)).toEqual(oct(21)); // ends before the holiday
    expect(DAY.addWorking(oct(19), 3)).toEqual(oct(23)); // … and skips it
    expect(DAY.addWorking(oct(19), -1)).toEqual(oct(16)); // a start sits where working time begins
    expect(DAY.addWorking(oct(19), -5)).toEqual(oct(12));
    expect(DAY.addWorking(oct(17, 12), -1)).toEqual(oct(16));
    expect(DAY.addWorking(oct(22), -1)).toEqual(oct(20));
    const t = oct(14, 6);
    expect(DAY.addWorking(t, 0)).toBe(t);
  });

  it('round-trips exactly to the ms', () => {
    for (const n of [0.25, 1, 2.5, 7]) {
      const start = oct(12, 6);
      const end = DAY.addWorking(start, n);
      near(DAY.workingDuration(start, end), n);
      expect(DAY.addWorking(end, -n).getTime()).toBe(start.getTime());
    }
    expect(DAY.addWorking(DAY.addWorking(oct(12), 3), -3)).toEqual(oct(12));
  });

  it('tells working days and working instants apart', () => {
    expect(DAY.isWorking(oct(12))).toBe(true);
    expect(DAY.isWorking(oct(16, 23, 59))).toBe(true);
    expect(DAY.isWorking(oct(17))).toBe(false);
    expect(DAY.isWorking(oct(18, 12))).toBe(false);
    expect(DAY.isWorking(HOLIDAY)).toBe(false);
    expect(DAY.isWorking(oct(22))).toBe(true);
    expect(DAY.isWorkingDay(oct(21, 12))).toBe(false);
    expect(DAY.isWorkingDay(oct(22, 3))).toBe(true);
    expect(DAY.isWorkingDay(oct(17))).toBe(false);
    expect(DAY.hoursOn(1)).toBe(24);
    expect(DAY.hoursOn(0)).toBe(0);
    expect(DAY.hoursOn(6)).toBe(0);
    expect(DAY.unit).toBe('day');
  });

  it('snaps a start forward and an end back, the same object when nothing moves', () => {
    const mon = oct(12, 9, 30);
    expect(DAY.snapStart(mon)).toBe(mon);
    expect(DAY.snapStart(oct(16))).toEqual(oct(16));
    expect(DAY.snapStart(oct(17, 10))).toEqual(oct(19));
    expect(DAY.snapStart(oct(18))).toEqual(oct(19));
    expect(DAY.snapStart(oct(21, 6))).toEqual(oct(22));

    const satMidnight = oct(17);
    expect(DAY.snapEnd(satMidnight)).toBe(satMidnight); // right after Friday
    const fri = oct(16, 12);
    expect(DAY.snapEnd(fri)).toBe(fri); // runs through it
    expect(DAY.snapEnd(oct(18, 12))).toEqual(oct(17));
    expect(DAY.snapEnd(oct(19))).toEqual(oct(17));
    expect(DAY.snapEnd(oct(21))).toEqual(oct(21)); // after Tuesday
    expect(DAY.snapEnd(oct(21, 12))).toEqual(oct(21));
    expect(DAY.snapEnd(oct(22))).toEqual(oct(21)); // back over the holiday
  });

  it('keeps the closed interval of equal working time: the end side, then the start side', () => {
    const w = DAY.toWorking(oct(17, 5));
    expect(DAY.fromWorkingEnd(w)).toEqual(oct(17));
    expect(DAY.fromWorkingStart(w)).toEqual(oct(19));
    // Inside a working day both sides are the same instant
    const mid = DAY.toWorking(oct(13, 6));
    expect(DAY.fromWorkingEnd(mid)).toEqual(oct(13, 6));
    expect(DAY.fromWorkingStart(mid)).toEqual(oct(13, 6));
  });

  it('is DST-safe on the x axis: midnight to midnight is one day', () => {
    const everyDay = createWorkingCalendar({ nonWorkingTime: { weekends: false } })!;
    for (const [m, d] of [
      [9, 25],
      [10, 1],
      [2, 8],
    ] as const) {
      near(everyDay.workingDuration(new Date(2026, m, d), new Date(2026, m, d + 1)), 1);
      expect(everyDay.addWorking(new Date(2026, m, d), 1)).toEqual(new Date(2026, m, d + 1));
    }
  });
});

describe('hour calendar (8–12, 13–17, one holiday)', () => {
  it('counts working hours, lunch excluded', () => {
    expect(HOUR.workingDuration(oct(12, 8), oct(12, 17))).toBe(8);
    expect(HOUR.workingDuration(oct(12, 8), oct(12, 12, 30))).toBe(4);
    expect(HOUR.workingDuration(oct(12, 12), oct(12, 13))).toBe(0);
    expect(HOUR.workingDuration(oct(12, 10), oct(13, 10))).toBe(8);
    expect(HOUR.workingDuration(oct(12), oct(19))).toBe(40);
    expect(HOUR.workingDuration(oct(19), oct(26))).toBe(32); // minus the holiday
    expect(HOUR.workingDuration(oct(12, 17), oct(13, 8))).toBe(0);
    expect(HOUR.workingDuration(oct(13, 8), oct(12, 8))).toBe(-8);
    expect(HOUR.unit).toBe('hour');
    expect(HOUR.hoursOn(1)).toBe(8);
    expect(HOUR.hoursOn(6)).toBe(0);
  });

  it('adds working hours, skipping the lunch, the night and the weekend', () => {
    expect(HOUR.addWorking(oct(12, 9), 8)).toEqual(oct(13, 9));
    expect(HOUR.addWorking(oct(12, 8), 8)).toEqual(oct(12, 17)); // right after the afternoon
    expect(HOUR.addWorking(oct(12, 8), 4)).toEqual(oct(12, 12)); // right before lunch
    expect(HOUR.addWorking(oct(12, 8), 5)).toEqual(oct(12, 14));
    expect(HOUR.addWorking(oct(12, 12, 30), 1)).toEqual(oct(12, 14));
    expect(HOUR.addWorking(oct(16, 16), 1)).toEqual(oct(16, 17));
    expect(HOUR.addWorking(oct(16, 16), 2)).toEqual(oct(19, 9));
    expect(HOUR.addWorking(oct(19, 8), 16)).toEqual(oct(20, 17));
    expect(HOUR.addWorking(oct(20, 16), 2)).toEqual(oct(22, 9)); // over the holiday
    expect(HOUR.addWorking(oct(19, 9), -1)).toEqual(oct(19, 8));
    expect(HOUR.addWorking(oct(19, 8), -1)).toEqual(oct(16, 16));
    expect(HOUR.addWorking(oct(12, 14), -2)).toEqual(oct(12, 11));
    expect(HOUR.addWorking(oct(12, 13), -1)).toEqual(oct(12, 11)); // lunch has no working time
    expect(HOUR.addWorking(oct(22, 8), -8)).toEqual(oct(20, 8));
    const t = oct(14, 6);
    expect(HOUR.addWorking(t, 0)).toBe(t);
  });

  it('is half-open: working time starts at the first instant of a range and ends at its end', () => {
    expect(HOUR.isWorking(oct(12, 7, 59))).toBe(false);
    expect(HOUR.isWorking(oct(12, 8))).toBe(true);
    expect(HOUR.isWorking(oct(12, 11, 59))).toBe(true);
    expect(HOUR.isWorking(oct(12, 12))).toBe(false);
    expect(HOUR.isWorking(oct(12, 12, 59))).toBe(false);
    expect(HOUR.isWorking(oct(12, 13))).toBe(true);
    expect(HOUR.isWorking(oct(12, 16, 59))).toBe(true);
    expect(HOUR.isWorking(oct(12, 17))).toBe(false);
    expect(HOUR.isWorking(oct(17, 10))).toBe(false);
    expect(HOUR.isWorking(oct(21, 10))).toBe(false);
    // A day has working time whatever the hour
    expect(HOUR.isWorkingDay(oct(12, 3))).toBe(true);
    expect(HOUR.isWorkingDay(oct(21, 10))).toBe(false);
    expect(HOUR.isWorkingDay(oct(18, 10))).toBe(false);
  });

  it('has the two sides of the lunch plateau', () => {
    const w = HOUR.toWorking(oct(12, 12, 30));
    expect(HOUR.fromWorkingEnd(w)).toEqual(oct(12, 12));
    expect(HOUR.fromWorkingStart(w)).toEqual(oct(12, 13));
    expect(HOUR.toWorking(oct(12, 13)) - HOUR.toWorking(oct(12, 8))).toBe(4);
  });

  it('snaps to the hours', () => {
    const nine = oct(12, 9);
    expect(HOUR.snapStart(nine)).toBe(nine);
    expect(HOUR.snapStart(oct(12, 7))).toEqual(oct(12, 8));
    expect(HOUR.snapStart(oct(12, 12, 30))).toEqual(oct(12, 13));
    expect(HOUR.snapStart(oct(12, 17))).toEqual(oct(13, 8));
    expect(HOUR.snapStart(oct(16, 17, 30))).toEqual(oct(19, 8));
    expect(HOUR.snapStart(oct(20, 18))).toEqual(oct(22, 8));

    const noon = oct(12, 12);
    expect(HOUR.snapEnd(noon)).toBe(noon);
    const five = oct(12, 17);
    expect(HOUR.snapEnd(five)).toBe(five);
    const mid = oct(12, 9);
    expect(HOUR.snapEnd(mid)).toBe(mid);
    expect(HOUR.snapEnd(oct(12, 12, 30))).toEqual(oct(12, 12));
    expect(HOUR.snapEnd(oct(12, 13))).toEqual(oct(12, 12));
    expect(HOUR.snapEnd(oct(12, 20))).toEqual(oct(12, 17));
    expect(HOUR.snapEnd(oct(13, 7))).toEqual(oct(12, 17));
    expect(HOUR.snapEnd(oct(17, 12))).toEqual(oct(16, 17));
  });

  it('counts the wall clock on a daylight-saving day: 9–17 is 8 hours', () => {
    const everyDay = createWorkingCalendar({
      calendar: { unit: 'hour' },
      nonWorkingTime: { weekends: false },
    })!;
    for (const [m, d] of [
      [9, 25], // Europe falls back
      [10, 1], // the US falls back
      [2, 8], // the US springs forward
    ] as const) {
      near(everyDay.workingDuration(new Date(2026, m, d, 9), new Date(2026, m, d, 17)), 8);
      expect(everyDay.addWorking(new Date(2026, m, d, 9), 8)).toEqual(new Date(2026, m, d, 17));
    }
  });
});

describe('per-weekday hours', () => {
  it('works the hours of each weekday and skips a weekday missing from the map', () => {
    expect(MAP.hoursOn(1)).toBe(8);
    expect(MAP.hoursOn(4)).toBe(0); // Thursday is missing
    expect(MAP.hoursOn(5)).toBe(4);
    expect(MAP.hoursOn(6)).toBe(0);
    expect(MAP.isWorkingDay(oct(15))).toBe(false); // Thursday 15 Oct
    expect(MAP.isWorkingDay(oct(16))).toBe(true);
    expect(MAP.addWorking(oct(14, 16), 1)).toEqual(oct(14, 17));
    expect(MAP.addWorking(oct(14, 16), 2)).toEqual(oct(16, 9)); // Thursday has no hours
    expect(MAP.addWorking(oct(16, 8), 4)).toEqual(oct(16, 12)); // the short Friday
    expect(MAP.isWorking(oct(16, 12))).toBe(false);
    expect(MAP.addWorking(oct(16, 8), 5)).toEqual(oct(19, 9));
    expect(MAP.workingDuration(oct(12), oct(19))).toBe(8 * 3 + 4);
    expect(MAP.snapStart(oct(15, 10))).toEqual(oct(16, 8));
    expect(MAP.snapEnd(oct(16, 15))).toEqual(oct(16, 12));
  });

  it('lets weekends and holidays win over hours', () => {
    const cal = createWorkingCalendar({
      calendar: { unit: 'hour' },
      nonWorkingTime: { holidays: [HOLIDAY], workingHours: { 0: LUNCH, 3: LUNCH, 6: LUNCH } },
    })!;
    expect(cal.hoursOn(6)).toBe(0);
    expect(cal.hoursOn(0)).toBe(0);
    expect(cal.hoursOn(3)).toBe(8);
    expect(cal.isWorking(oct(17, 10))).toBe(false);
    expect(cal.isWorking(oct(21, 10))).toBe(false);
    expect(cal.isWorking(oct(14, 10))).toBe(true);
    expect(cal.workingDuration(oct(14), oct(28))).toBe(8); // only Wednesdays have hours: the 14th works, the 21st is a holiday
  });

  it('merges overlapping and touching ranges and clamps them to the day', () => {
    const cal = createWorkingCalendar({
      calendar: { unit: 'hour' },
      nonWorkingTime: {
        workingHours: [
          { start: 13, end: 17 },
          { start: 8, end: 12 },
          { start: 11, end: 13 },
          { start: 16, end: 30 },
        ],
      },
    })!;
    expect(cal.hoursOn(1)).toBe(16); // 8–24
    expect(cal.workingDuration(oct(12, 8), oct(13, 0))).toBe(16);
  });

  it('works all day without hours (a calendar built from `nonWorkingTime: false`, or without hours)', () => {
    const open = buildWorkingCalendar(null, 'hour')!;
    expect(open.hoursOn(0)).toBe(24);
    expect(open.workingDuration(oct(17), oct(18))).toBe(24);
    const noHours = buildWorkingCalendar(resolveNonWorking({}), 'hour')!;
    expect(noHours.addWorking(oct(12), 24)).toEqual(oct(13));
    expect(noHours.hoursOn(6)).toBe(0);
    expect(buildWorkingCalendar(resolveNonWorking({ weekends: [0, 1, 2, 3, 4, 5, 6] }), 'day')).toBeNull();
  });
});

describe('invariants over every calendar (seeded instants)', () => {
  const calendars: [string, WorkingCalendar][] = [
    ['day', DAY],
    ['hour', HOUR],
    ['map', MAP],
    ['24/7 hours', createWorkingCalendar({ calendar: { unit: 'hour' }, nonWorkingTime: false })!],
    ['Saturdays on', createWorkingCalendar({ nonWorkingTime: { weekends: [0], holidays: [HOLIDAY] } })!],
  ];

  function rng(seed: number): () => number {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it.each(calendars)('%s: representatives, snaps and additions agree with W', (_name, cal) => {
    const rand = rng(13);
    for (let i = 0; i < 400; i++) {
      // 2026-10-05 … 2026-11-09, any minute
      const t = new Date(2026, 9, 5, 0, Math.floor(rand() * 35 * 24 * 60));
      const w = cal.toWorking(t);
      const end = cal.fromWorkingEnd(w);
      const start = cal.fromWorkingStart(w);
      expect(end.getTime()).toBeLessThanOrEqual(t.getTime());
      expect(start.getTime()).toBeGreaterThanOrEqual(t.getTime());
      near(cal.toWorking(end), w);
      near(cal.toWorking(start), w);

      const s = cal.snapStart(t);
      expect(s.getTime()).toBeGreaterThanOrEqual(t.getTime());
      expect(cal.snapStart(s)).toBe(s);
      near(cal.toWorking(s), w);
      if (s !== t) expect(cal.isWorking(s)).toBe(true);
      else expect(cal.isWorking(t)).toBe(true);

      const e = cal.snapEnd(t);
      expect(e.getTime()).toBeLessThanOrEqual(t.getTime());
      expect(cal.snapEnd(e)).toBe(e);
      near(cal.toWorking(e), w);

      for (const n of [0.5, 1, 3.25]) {
        near(cal.workingDuration(t, cal.addWorking(t, n)), n);
        near(cal.workingDuration(cal.addWorking(t, -n), t), n);
      }
      const later = new Date(t.getTime() + Math.floor(rand() * 5 * 24 * 60) * 60_000);
      expect(cal.toWorking(later)).toBeGreaterThanOrEqual(w);
    }
  });
});

describe('measured durations', () => {
  const none = reading({});
  const workDays = reading({ calendar: true, nonWorkingTime: { holidays: [HOLIDAY] } });
  const calDays = reading({ calendar: { durations: 'calendar' }, nonWorkingTime: { holidays: [HOLIDAY] } });
  const workHours = reading({ calendar: { unit: 'hour' }, nonWorkingTime: { holidays: [HOLIDAY] } });
  const sixHours = reading({ calendar: { unit: 'hour', hoursPerDay: 6 }, nonWorkingTime: { holidays: [HOLIDAY] } });

  it('reads the mode and the day length', () => {
    expect(measuresWorkingTime(none)).toBe(false);
    expect(measuresWorkingTime(calDays)).toBe(false);
    expect(measuresWorkingTime(workDays)).toBe(true);
    expect(durationFactor(none)).toBe(1);
    expect(durationFactor(workDays)).toBe(1);
    expect(durationFactor(calDays)).toBe(1);
    expect(durationFactor(workHours)).toBe(8);
    expect(durationFactor(sixHours)).toBe(6);
  });

  it('measures calendar days without a calendar and with calendar durations', () => {
    for (const r of [none, calDays]) {
      expect(measureBetween(oct(12), oct(19), r)).toBe(7);
      expect(measureBetween(oct(19), oct(12), r)).toBe(-7);
      expect(measureBetween(oct(12), oct(12, 12), r)).toBe(0.5);
      expect(spanDuration({ start: oct(19), end: oct(12) }, r)).toBe(0);
    }
  });

  it('measures working days, or working hours ÷ hours per day', () => {
    expect(measureBetween(oct(12), oct(26), workDays)).toBe(9);
    expect(measureBetween(oct(26), oct(12), workDays)).toBe(-9);
    expect(spanDuration({ start: oct(17), end: oct(19) }, workDays)).toBe(0);
    expect(measureBetween(oct(12, 9), oct(13, 13), workHours)).toBe(1.5);
    expect(measureBetween(oct(12, 9), oct(12, 15), workHours)).toBe(0.75);
    expect(measureBetween(oct(12, 9), oct(12, 15), sixHours)).toBe(1);
  });

  it('measures a task as drawn: inclusive ends cover their day', () => {
    const task = { start: oct(12), end: oct(16) };
    expect(taskDuration(task, workDays)).toBe(4);
    expect(taskDuration(task, reading({ calendar: true, endDateMode: 'inclusive' }))).toBe(5);
    expect(taskDuration(task, none)).toBe(4);
    expect(taskDuration({ start: oct(12), end: oct(12) }, workDays)).toBe(0);
    // A task without an end is a milestone
    expect(taskDuration({ start: oct(12) } as { start: Date; end: Date }, workDays)).toBe(0);
  });

  it('adds a duration to a drawn start', () => {
    expect(addDuration(oct(12), 5, workDays)).toEqual(oct(17));
    expect(addDuration(oct(12), 7, workDays)).toEqual(oct(21));
    expect(addDuration(oct(17), 1, workDays)).toEqual(oct(20)); // from the next working time
    expect(addDuration(oct(12), 7, calDays)).toEqual(oct(19));
    expect(addDuration(oct(12), 7, none)).toEqual(oct(19));
    expect(addDuration(oct(12), 1.5, none)).toEqual(oct(13, 12));
    expect(addDuration(oct(12, 9), 1.5, workHours)).toEqual(oct(13, 13));
    expect(addDuration(oct(12, 9), 1, sixHours)).toEqual(oct(12, 15));
    expect(addDuration(oct(12, 9), 0, workHours)).toEqual(oct(12, 9));
  });
});

describe('formatDuration', () => {
  const none = reading({});
  const calDays = reading({ calendar: { durations: 'calendar' } });
  const calHours = reading({ calendar: { unit: 'hour', durations: 'calendar' } });
  const days = reading({ calendar: true, nonWorkingTime: { holidays: [HOLIDAY] } });
  const hours = reading({ calendar: { unit: 'hour' }, nonWorkingTime: { holidays: [HOLIDAY] } });
  const six = reading({ calendar: { unit: 'hour', hoursPerDay: 6 }, nonWorkingTime: { holidays: [HOLIDAY] } });
  const span = (start: Date, end: Date) => ({ start, end });

  it('is `durationLabel`, byte for byte, without a calendar or with calendar durations', () => {
    function rng(seed: number): () => number {
      let a = seed;
      return () => {
        a = (a + 0x9e3779b9) | 0;
        let t = Math.imul(a ^ (a >>> 16), 0x85ebca6b);
        t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
        return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
      };
    }
    const rand = rng(7);
    const packs = [
      undefined,
      {
        durationDay: 'un giorno',
        durationDays: (n: number) => `${n} giorni`,
        durationWeeks: (w: number) => `${w} sett.`,
      },
    ];
    for (let i = 0; i < 500; i++) {
      const start = new Date(2026, Math.floor(rand() * 12), 1 + Math.floor(rand() * 28), Math.floor(rand() * 24));
      const minutes = Math.floor(rand() * 60 * 24 * 60);
      const end = new Date(start.getTime() + minutes * 60_000);
      for (const labels of packs) {
        const expected = durationLabel(start, end, labels);
        expect(formatDuration(span(start, end), none, labels)).toBe(expected);
        expect(formatDuration(span(start, end), { endDateMode: 'exclusive', normalizeDateOnly: true }, labels)).toBe(
          expected,
        );
        expect(formatDuration(span(start, end), calDays, labels)).toBe(expected);
        expect(formatDuration(span(start, end), calHours, labels)).toBe(expected);
      }
    }
  });

  it('reads working days: "n days", never weeks, up to 2 decimals', () => {
    expect(formatDuration(span(oct(12), oct(17)), days)).toBe('5 days');
    expect(formatDuration(span(oct(12), oct(13)), days)).toBe('1 day');
    expect(formatDuration(span(oct(12), oct(26)), days)).toBe('9 days'); // two calendar weeks, not "2w"
    expect(formatDuration(span(oct(12), oct(12, 12)), days)).toBe('0.5 days');
    expect(formatDuration(span(oct(16, 12), oct(19, 12)), days)).toBe('1 day');
    expect(formatDuration(span(oct(17), oct(19)), days)).toBe('0 days');
    expect(formatDuration(span(oct(12), oct(12)), days)).toBe('0 days');
    expect(formatDuration(span(oct(12), oct(12, 8)), days)).toBe('0.33 days');
    expect(formatDuration(span(oct(19), oct(12)), days)).toBe('0 days');
  });

  it('reads working hours under a working day, then days of `hoursPerDay`', () => {
    expect(formatDuration(span(oct(12, 9), oct(12, 15)), hours)).toBe('6 hours');
    expect(formatDuration(span(oct(12, 9), oct(12, 10)), hours)).toBe('1 hour');
    expect(formatDuration(span(oct(12, 9), oct(12, 17)), hours)).toBe('1 day');
    expect(formatDuration(span(oct(12, 9), oct(13, 13)), hours)).toBe('1.5 days');
    expect(formatDuration(span(oct(12, 9), oct(12, 9)), hours)).toBe('0 days');
    expect(formatDuration(span(oct(17, 9), oct(18, 9)), hours)).toBe('0 days');
    expect(formatDuration(span(oct(12, 9), oct(12, 9, 30)), hours)).toBe('0.5 hours');
    expect(formatDuration(span(oct(12, 9), oct(12, 12)), six)).toBe('3 hours');
    expect(formatDuration(span(oct(12, 9), oct(12, 15)), six)).toBe('1 day');
    expect(formatDuration(span(oct(12, 9), oct(12, 17)), six)).toBe('1.33 days');
  });

  it('takes the labels of the pack', () => {
    const labels = {
      durationDay: '1 Tag',
      durationDays: (n: number) => `${n} Tage`,
      durationHours: (h: number) => `${h} Std.`,
    };
    expect(formatDuration(span(oct(12), oct(13)), days, labels)).toBe('1 Tag');
    expect(formatDuration(span(oct(12), oct(17)), days, labels)).toBe('5 Tage');
    expect(formatDuration(span(oct(17), oct(19)), days, labels)).toBe('0 Tage');
    expect(formatDuration(span(oct(12, 9), oct(12, 15)), hours, labels)).toBe('6 Std.');
    expect(formatDuration(span(oct(12, 9), oct(14, 9)), hours, labels)).toBe('2 Tage');
  });

  it('formats the float: days rounded to 0.1, hours under a working day of an hour calendar', () => {
    for (const r of [none, calDays, days]) {
      expect(formatFloat(2, r)).toBe('2d');
      expect(formatFloat(0.5, r)).toBe('0.5d');
      expect(formatFloat(2.04, r)).toBe('2d');
      expect(formatFloat(0, r)).toBe('0d');
    }
    expect(formatFloat(0.5, hours)).toBe('4h');
    expect(formatFloat(0.25, hours)).toBe('2h');
    expect(formatFloat(0.3, hours)).toBe('2.4h');
    expect(formatFloat(1, hours)).toBe('1d');
    expect(formatFloat(2.5, hours)).toBe('2.5d');
    expect(formatFloat(0, hours)).toBe('0d');
    expect(formatFloat(0.5, six)).toBe('3h');
    expect(formatFloat(0.5, calHours)).toBe('0.5d');
    expect(formatFloat(0.5, hours, { ttFloatHours: h => `${h} Std.` })).toBe('4 Std.');
    expect(formatFloat(3, days, { ttFloatDays: d => `${d} Tage` })).toBe('3 Tage');
  });
});

describe('task dates in the task’s own form', () => {
  const utc = (day: number) => new Date(Date.UTC(2026, 9, day));
  const none = reading({});
  const days = reading({ calendar: true, nonWorkingTime: { holidays: [HOLIDAY] } });
  const keep = reading({ calendar: { skipNonWorking: false }, nonWorkingTime: { holidays: [HOLIDAY] } });
  const inclusive = reading({ calendar: true, endDateMode: 'inclusive' });

  it('`taskDateLike`: whole local days from the original keep its shape, else the local date', () => {
    const timed = oct(12, 9);
    expect(taskDateLike(timed, oct(19, 9))).toEqual(oct(19, 9));
    expect(taskDateLike(timed, oct(12, 9))).toBe(timed);
    const other = oct(19, 9, 30);
    expect(taskDateLike(timed, other)).toBe(other);
    // A UTC date-only value stays date-only (the same instant in a zone at UTC)
    expect(taskDateLike(utc(12), oct(19)).getTime()).toBe(Date.UTC(2026, 9, 19));
    expect(taskDateLike(utc(12), oct(10)).getTime()).toBe(Date.UTC(2026, 9, 10));
    expect(taskDateLike(utc(12), oct(12)).getTime()).toBe(Date.UTC(2026, 9, 12));
    // … unless it gains a time
    expect(taskDateLike(utc(12), oct(19, 9)).getTime()).toBe(oct(19, 9).getTime());
    // Raw values (`normalizeDateOnly: false`) are compared as they are
    const raw = reading({ normalizeDateOnly: false });
    expect(taskDateLike(timed, oct(14, 9), raw)).toEqual(oct(14, 9));
  });

  it('`snapTaskStart` moves a start forward onto working time, in the task’s form', () => {
    const fri = oct(16, 9);
    expect(snapTaskStart(fri, days)).toBe(fri);
    expect(snapTaskStart(oct(17), days)).toEqual(oct(19));
    expect(snapTaskStart(oct(21), days)).toEqual(oct(22));
    expect(snapTaskStart(utc(17), days).getTime()).toBe(Date.UTC(2026, 9, 19));
    expect(snapTaskStart(utc(16), days).getTime()).toBe(Date.UTC(2026, 9, 16));
    const sat = oct(17);
    expect(snapTaskStart(sat, keep)).toBe(sat);
    expect(snapTaskStart(sat, none)).toBe(sat);
    expect(snapTaskStart(oct(17, 10), reading({ calendar: { unit: 'hour' } }))).toEqual(oct(19, 9));
  });

  it('`snapTaskEnd` moves an end back onto the end of working time', () => {
    const satMidnight = oct(17);
    expect(snapTaskEnd(satMidnight, days)).toBe(satMidnight);
    expect(snapTaskEnd(oct(18), days)).toEqual(oct(17));
    expect(snapTaskEnd(oct(19), days)).toEqual(oct(17));
    expect(snapTaskEnd(oct(22), days)).toEqual(oct(21)); // back over the holiday
    expect(snapTaskEnd(utc(19), days).getTime()).toBe(Date.UTC(2026, 9, 17));
    const sun = oct(18);
    expect(snapTaskEnd(sun, keep)).toBe(sun);
    expect(snapTaskEnd(sun, none)).toBe(sun);
    expect(snapTaskEnd(oct(12, 20), reading({ calendar: { unit: 'hour' } }))).toEqual(oct(12, 17));
  });

  it('`snapTaskEnd` of an inclusive end: the last working day, not the midnight after it', () => {
    const fri = oct(16);
    expect(snapTaskEnd(fri, inclusive)).toBe(fri);
    expect(snapTaskEnd(oct(18), inclusive)).toEqual(oct(16)); // a Sunday end covers Sunday: back to Friday
    expect(snapTaskEnd(oct(17), inclusive)).toEqual(oct(16));
    expect(snapTaskEnd(utc(18), inclusive).getTime()).toBe(Date.UTC(2026, 9, 16));
    const mon = oct(19);
    expect(snapTaskEnd(mon, inclusive)).toBe(mon);
  });

  describe('`followTaskEnd`', () => {
    const task = { start: oct(15), end: oct(19) }; // Thursday → Monday: two working days over a weekend

    it('keeps the working length with working durations', () => {
      expect(followTaskEnd(task, oct(19), days)).toEqual(oct(21)); // Mon, Tue
      expect(followTaskEnd(task, oct(16), days)).toEqual(oct(20)); // Fri, Mon
      expect(followTaskEnd(task, oct(22), days)).toEqual(oct(24)); // Thu, Fri
      expect(followTaskEnd(task, oct(17), days)).toEqual(oct(21)); // from Saturday: the next two working days
    });

    it('keeps the calendar length with calendar durations and without a calendar', () => {
      const calDays = reading({ calendar: { durations: 'calendar' } });
      for (const r of [none, calDays]) expect(followTaskEnd(task, oct(19), r)).toEqual(oct(23));
      expect(followTaskEnd({ start: oct(12, 9), end: oct(12, 15) }, oct(14, 10), none)).toEqual(oct(14, 16));
    });

    it('keeps the working time of a timed task across the night', () => {
      const hours = reading({ calendar: { unit: 'hour' } });
      const task6 = { start: oct(12, 9), end: oct(12, 15) };
      expect(followTaskEnd(task6, oct(16, 15), hours)).toEqual(oct(19, 13)); // 2 h on Friday, 4 h on Monday
      expect(followTaskEnd(task6, oct(14, 9), hours)).toEqual(oct(14, 15));
    });

    it('writes the end in the task’s form', () => {
      const dateOnly = { start: utc(15), end: utc(19) };
      expect(followTaskEnd(dateOnly, utc(19), days).getTime()).toBe(Date.UTC(2026, 9, 21));
      // An inclusive end stays inclusive: Monday → Friday is five working days, ending on Friday
      const week = { start: oct(12), end: oct(16) };
      expect(followTaskEnd(week, oct(19), inclusive)).toEqual(oct(23));
      expect(followTaskEnd({ start: utc(12), end: utc(16) }, utc(26), inclusive).getTime()).toBe(Date.UTC(2026, 9, 30));
    });

    it('keeps milestones zero-length and unworked spans their calendar length', () => {
      expect(followTaskEnd({ start: oct(12), end: oct(12) }, oct(14), days)).toEqual(oct(14));
      expect(followTaskEnd({ start: oct(12) } as { start: Date; end: Date }, oct(14), days)).toEqual(oct(14));
      // Saturday → Monday has two calendar days and no working time
      expect(followTaskEnd({ start: oct(17), end: oct(19) }, oct(24), days)).toEqual(oct(26));
    });
  });

  it('`editCalendar` is null without a calendar (the matrix is in edit-calendar.test.ts)', () => {
    expect(editCalendar(none, 'day')).toBeNull();
    expect(editCalendar(none, 'hour')).toBeNull();
  });
});
