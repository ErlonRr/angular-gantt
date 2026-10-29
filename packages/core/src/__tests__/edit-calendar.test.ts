// ─────────────────────────────────────────────────────────────
//  Tests — Phase 13 step 2.4: `editCalendar`, the editing rules of a
//  working calendar (plan D11): the pointer shifts an edge by the
//  snap units and then snaps (a start forward, an end back), the
//  keyboard steps in working time, a move's end follows, the minimum
//  is one snap unit of working time. October 2026: Monday the 12th,
//  Friday the 16th, Saturday the 17th, Monday the 19th, Wednesday the
//  21st a holiday. Dates are built with `new Date(y, m, d, …)`, so
//  every assertion holds in any time zone (`pnpm test:tz`).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { editCalendar, followTaskEnd, resolveConfig, type GanttOptions } from '../index';

const oct = (day: number, h = 0): Date => new Date(2026, 9, day, h);
const utc = (day: number): Date => new Date(Date.UTC(2026, 9, day));
const HOLIDAY = oct(21);

const make = (options: GanttOptions, snap: 'day' | 'hour' = 'day') => {
  const dates = resolveConfig(options);
  return { dates, cal: editCalendar(dates, snap) };
};
const need = <T>(value: T | null): T => {
  if (value === null) throw new Error('expected an EditCalendar');
  return value;
};

const WORK: GanttOptions = { calendar: true, nonWorkingTime: { holidays: [HOLIDAY] } };
// Timed data: a timed instant that is UTC midnight in some zone (Lord Howe 11:00) must not read as date-only
const HOURS: GanttOptions = {
  normalizeDateOnly: false,
  calendar: { unit: 'hour', hoursPerDay: 8 },
  nonWorkingTime: { holidays: [HOLIDAY], workingHours: [{ start: 9, end: 17 }] },
};

describe('editCalendar — when it exists', () => {
  it('is null without a calendar', () => {
    expect(make({}).cal).toBeNull();
    expect(make({ calendar: false }).cal).toBeNull();
  });

  it('is null for calendar durations that do not skip non-working time', () => {
    expect(make({ calendar: { durations: 'calendar', skipNonWorking: false } }).cal).toBeNull();
  });

  it('exists for working durations, or for skipping on its own', () => {
    expect(make(WORK).cal).not.toBeNull();
    expect(make({ calendar: { skipNonWorking: false } }).cal).not.toBeNull();
    expect(make({ calendar: { durations: 'calendar' } }).cal).not.toBeNull();
  });
});

describe('pointer: shift by the snap units, then snap (skipNonWorking)', () => {
  const cal = need(make(WORK).cal);

  it('a start snaps forward onto working time', () => {
    expect(cal.start(oct(16), 1, 'pointer')).toEqual(oct(19)); // Saturday → Monday
    expect(cal.start(oct(16), 2, 'pointer')).toEqual(oct(19)); // Sunday → Monday
    expect(cal.start(oct(16), 3, 'pointer')).toEqual(oct(19));
    expect(cal.start(oct(16), 5, 'pointer')).toEqual(oct(22)); // the holiday → Thursday
    expect(cal.start(oct(19), 1, 'pointer')).toEqual(oct(20));
  });

  it('a start dragged back onto a weekend snaps forward to where it was', () => {
    expect(cal.start(oct(19), -1, 'pointer')).toEqual(oct(19)); // Sunday → Monday
    expect(cal.start(oct(19), -2, 'pointer')).toEqual(oct(19)); // Saturday → Monday
    expect(cal.start(oct(19), -3, 'pointer')).toEqual(oct(16));
  });

  it('an end snaps back to the end of the last working time', () => {
    // exclusive ends: Friday 00:00 is the end of Thursday
    expect(cal.end(oct(16), 1, 'pointer')).toEqual(oct(17)); // right after Friday
    expect(cal.end(oct(16), 2, 'pointer')).toEqual(oct(17)); // Sunday → Saturday 00:00
    expect(cal.end(oct(16), 3, 'pointer')).toEqual(oct(17)); // Monday 00:00 → Saturday 00:00
    expect(cal.end(oct(16), 4, 'pointer')).toEqual(oct(20)); // right after Monday
    expect(cal.end(oct(16), 5, 'pointer')).toEqual(oct(21)); // Wednesday 00:00 is right after Tuesday
    expect(cal.end(oct(16), 6, 'pointer')).toEqual(oct(21)); // the holiday has no working time: Tuesday's end
    expect(cal.end(oct(16), 7, 'pointer')).toEqual(oct(23)); // right after Thursday
  });

  it('returns the same object when nothing moves, and 0 units change nothing', () => {
    const saturday = oct(17);
    expect(cal.start(saturday, 0, 'pointer')).toBe(saturday);
    expect(cal.end(saturday, 0, 'pointer')).toBe(saturday);
    expect(cal.start(saturday, 0, 'keyboard')).toBe(saturday);
    const friday = oct(16);
    expect(cal.end(friday, 1, 'pointer')).toEqual(oct(17));
  });

  it('does not snap with skipNonWorking off (working durations only)', () => {
    const plain = need(make({ calendar: { skipNonWorking: false } }).cal);
    expect(plain.start(oct(16), 1, 'pointer')).toEqual(oct(17));
    expect(plain.end(oct(16), 2, 'pointer')).toEqual(oct(18));
  });

  it('keeps a UTC date-only value date-only', () => {
    const start = cal.start(utc(16), 1, 'pointer');
    expect(start).toEqual(utc(19));
    const end = cal.end(utc(16), 2, 'pointer');
    expect(end).toEqual(utc(17));
  });

  it('snaps in hours on an hour scale (09:00–17:00)', () => {
    const hour = need(make(HOURS, 'hour').cal);
    expect(hour.start(oct(16, 15), 3, 'pointer')).toEqual(oct(19, 9)); // 18:00 → Monday 09:00
    expect(hour.start(oct(16, 9), 2, 'pointer')).toEqual(oct(16, 11));
    expect(hour.end(oct(16, 14), 5, 'pointer')).toEqual(oct(16, 17)); // 19:00 → 17:00
    expect(hour.end(oct(16, 17), 20, 'pointer')).toEqual(oct(16, 17)); // far past the week's end → still Friday
  });

  it('shifts whole days on a day scale of an hour calendar', () => {
    const hour = need(make(HOURS, 'day').cal);
    expect(hour.start(oct(16, 9), 1, 'pointer')).toEqual(oct(19, 9)); // Saturday 09:00 → Monday 09:00
    expect(hour.end(oct(16, 17), 1, 'pointer')).toEqual(oct(16, 17)); // Saturday 17:00 → Friday 17:00
  });
});

describe('keyboard: one snap unit of working time per step', () => {
  const cal = need(make(WORK).cal);

  it('a start steps over a weekend in both directions', () => {
    expect(cal.start(oct(16), 1, 'keyboard')).toEqual(oct(19));
    expect(cal.start(oct(19), -1, 'keyboard')).toEqual(oct(16));
    expect(cal.start(oct(19), 1, 'keyboard')).toEqual(oct(20));
    expect(cal.start(oct(20), 1, 'keyboard')).toEqual(oct(22)); // over the holiday
    expect(cal.start(oct(22), -1, 'keyboard')).toEqual(oct(20));
    expect(cal.start(oct(16), 5, 'keyboard')).toEqual(oct(26));
  });

  it('a start on non-working time steps from the next working day', () => {
    expect(cal.start(oct(17), 1, 'keyboard')).toEqual(oct(20));
    expect(cal.start(oct(17), -1, 'keyboard')).toEqual(oct(16));
  });

  it('an end steps by working time too', () => {
    expect(cal.end(oct(17), 1, 'keyboard')).toEqual(oct(20)); // Friday's end → Monday's end
    expect(cal.end(oct(19), -1, 'keyboard')).toEqual(oct(16)); // → Thursday's end
    expect(cal.end(oct(20), 1, 'keyboard')).toEqual(oct(21)); // Monday's end → Tuesday's end
    expect(cal.end(oct(21), 1, 'keyboard')).toEqual(oct(23)); // over the holiday: Thursday's end
  });

  it('is the same for calendar durations that skip', () => {
    const skipping = need(make({ ...WORK, calendar: { durations: 'calendar' } }).cal);
    expect(skipping.start(oct(16), 1, 'keyboard')).toEqual(oct(19));
    expect(skipping.end(oct(17), 1, 'keyboard')).toEqual(oct(20));
  });

  it('keeps a UTC date-only value date-only and an inclusive end inclusive', () => {
    expect(cal.start(utc(16), 1, 'keyboard')).toEqual(utc(19));
    const inclusive = need(make({ ...WORK, endDateMode: 'inclusive' }).cal);
    expect(inclusive.end(oct(16), 1, 'keyboard')).toEqual(oct(19)); // Friday → Monday, both covering their day
    expect(inclusive.end(oct(19), -1, 'keyboard')).toEqual(oct(16));
    expect(inclusive.end(oct(16), 1, 'pointer')).toEqual(oct(16)); // Saturday → back to Friday
  });

  it('a day is a working day in an hour calendar, an hour on the hour snap', () => {
    const day = need(make(HOURS, 'day').cal);
    expect(day.start(oct(19, 9), 1, 'keyboard')).toEqual(oct(20, 9));
    expect(day.start(oct(16, 9), 1, 'keyboard')).toEqual(oct(19, 9));
    const six = need(make({ ...HOURS, calendar: { unit: 'hour', hoursPerDay: 6 } }, 'day').cal);
    expect(six.start(oct(19, 9), 1, 'keyboard')).toEqual(oct(20, 9)); // hoursPerDay does not shorten a day step
    const hour = need(make(HOURS, 'hour').cal);
    expect(hour.start(oct(16, 15), 1, 'keyboard')).toEqual(oct(16, 16));
    expect(hour.start(oct(16, 16), 1, 'keyboard')).toEqual(oct(19, 9)); // Friday 17:00 is Monday 09:00
    expect(hour.end(oct(16, 17), 1, 'keyboard')).toEqual(oct(19, 10));
  });

  it('an hour step in a day calendar is an hour of the working day', () => {
    const hour = need(make(WORK, 'hour').cal);
    expect(hour.start(oct(19, 10), 1, 'keyboard')).toEqual(oct(19, 11));
    expect(hour.start(oct(16, 23), 1, 'keyboard')).toEqual(oct(19, 0));
    expect(hour.end(oct(19, 10), -1, 'keyboard')).toEqual(oct(19, 9));
  });
});

describe('a move’s end follows the start', () => {
  it('working durations keep the working length (the bar widens over the days off)', () => {
    const { cal } = make(WORK);
    // Monday 12 – Friday 16 00:00: four working days
    expect(need(cal).follow(oct(12), oct(16), oct(16))).toEqual(oct(23)); // Fri, Mon, Tue, Thu
    // one working day, Friday → Monday
    expect(need(cal).follow(oct(16), oct(17), oct(19))).toEqual(oct(20));
  });

  it('calendar durations keep the calendar length', () => {
    const { cal } = make({ ...WORK, calendar: { durations: 'calendar' } });
    expect(need(cal).follow(oct(12), oct(16), oct(16))).toEqual(oct(20));
  });

  it('calendar durations that skip never end on non-working time: the end snaps back', () => {
    const { dates, cal } = make({ ...WORK, calendar: { durations: 'calendar' } });
    // Monday – Tuesday (two days) moved to Friday would end Sunday 00:00: Saturday 00:00 instead
    expect(need(cal).follow(oct(12), oct(14), oct(16))).toEqual(oct(17));
    expect(followTaskEnd({ start: oct(12), end: oct(14) }, oct(16), dates)).toEqual(oct(17));
    // three days: Monday 00:00 is the end of Sunday, so the end of Friday again
    expect(need(cal).follow(oct(12), oct(15), oct(16))).toEqual(oct(17));
    // an end already on working time is left alone (Tuesday 00:00 is right after Monday)
    expect(need(cal).follow(oct(12), oct(14), oct(19))).toEqual(oct(21));
    // one function: the editing rules and followTaskEnd agree
    for (const [start, end, to] of [
      [oct(12), oct(14), oct(16)],
      [oct(12), oct(16), oct(16)],
      [oct(16), oct(18), oct(22)],
    ] as const) {
      expect(need(cal).follow(start, end, to)).toEqual(followTaskEnd({ start, end }, to, dates));
    }
  });

  it('calendar durations without skipping keep the calendar length as it is', () => {
    const dates = resolveConfig({ ...WORK, calendar: { durations: 'calendar', skipNonWorking: false } });
    expect(followTaskEnd({ start: oct(12), end: oct(14) }, oct(16), dates)).toEqual(oct(18)); // Sunday 00:00
  });

  it('a milestone stays zero-length in calendar durations that skip', () => {
    const { dates, cal } = make({ ...WORK, calendar: { durations: 'calendar' } });
    expect(need(cal).follow(oct(12), oct(12), oct(16))).toEqual(oct(16));
    expect(followTaskEnd({ start: oct(12), end: oct(12) }, oct(18), dates)).toEqual(oct(18));
  });

  it('calendar durations that skip keep the calendar length when no working time is left after the start', () => {
    const { cal } = make({ ...WORK, calendar: { durations: 'calendar' } });
    // a weekend task moved to another weekend (a start the caller did not snap): Saturday → Monday
    expect(need(cal).follow(oct(17), oct(19), oct(24))).toEqual(oct(26));
  });

  it('working durations are unchanged by the snap', () => {
    const { cal } = make(WORK);
    expect(need(cal).follow(oct(12), oct(14), oct(16))).toEqual(oct(20)); // Friday and Monday: ends right after Monday
  });

  it('a milestone stays zero-length', () => {
    const { cal } = make(WORK);
    expect(need(cal).follow(oct(12), oct(12), oct(13))).toEqual(oct(13));
  });

  it('a task without working time keeps its calendar length', () => {
    const { cal } = make(WORK);
    expect(need(cal).follow(oct(17), oct(19), oct(24))).toEqual(oct(26)); // Saturday → Monday, two days
  });
});

describe('the minimum length', () => {
  it('working durations: at least one snap unit of working time', () => {
    const { cal } = make(WORK);
    const longEnough = need(cal).longEnough;
    expect(longEnough?.(oct(19), oct(20))).toBe(true);
    expect(longEnough?.(oct(19), oct(19, 12))).toBe(false);
    expect(longEnough?.(oct(17), oct(19))).toBe(false); // a weekend is no working time
    expect(longEnough?.(oct(16), oct(20))).toBe(true);
  });

  it('is a working hour on the hour snap, and hoursPerDay on the day snap of an hour calendar', () => {
    const day = need(make({ ...HOURS, calendar: { unit: 'hour', hoursPerDay: 6 } }, 'day').cal).longEnough;
    expect(day?.(oct(19, 9), oct(19, 15))).toBe(true);
    expect(day?.(oct(19, 9), oct(19, 14))).toBe(false);
    const hour = need(make(HOURS, 'hour').cal).longEnough;
    expect(hour?.(oct(19, 9), oct(19, 10))).toBe(true);
    expect(hour?.(oct(19, 9), oct(19, 9))).toBe(false);
    const dayCalendarHour = need(make(WORK, 'hour').cal).longEnough;
    expect(dayCalendarHour?.(oct(19, 9), oct(19, 10))).toBe(true);
  });

  it('calendar durations use the drawn px rule (null)', () => {
    expect(need(make({ ...WORK, calendar: { durations: 'calendar' } }).cal).longEnough).toBeNull();
    expect(need(make({ calendar: { skipNonWorking: true, durations: 'calendar' } }).cal).longEnough).toBeNull();
  });
});

describe('a weekend-only task and a milestone', () => {
  const { cal } = make(WORK);

  it('a weekend-only task moves by the pointer like a start and keeps its calendar length', () => {
    const start = need(cal).start(oct(17), 7, 'pointer'); // Saturday + 7 → Saturday → Monday
    expect(start).toEqual(oct(26));
    expect(need(cal).follow(oct(17), oct(19), start)).toEqual(oct(28));
  });

  it('a milestone moves like a start', () => {
    const start = need(cal).start(oct(15), 2, 'pointer'); // Thursday + 2 = Saturday → Monday
    expect(start).toEqual(oct(19));
    expect(need(cal).follow(oct(15), oct(15), start)).toEqual(oct(19));
    expect(need(cal).start(oct(15), 1, 'keyboard')).toEqual(oct(16));
  });
});

describe('an hour calendar on a day scale: a day is a working day, not hoursPerDay hours', () => {
  const HOUR_RANGE = { start: 9, end: 17 };
  // 7 working hours (09:00–12:00, 13:00–17:00), hoursPerDay 8
  const seven = need(
    make({
      ...HOURS,
      nonWorkingTime: {
        holidays: [HOLIDAY],
        workingHours: [
          { start: 9, end: 12 },
          { start: 13, end: 17 },
        ],
      },
    }).cal,
  );
  // Monday to Thursday 09:00–17:00, Friday 09:00–13:00
  const half = need(
    make({
      ...HOURS,
      nonWorkingTime: {
        holidays: [HOLIDAY],
        workingHours: {
          1: [HOUR_RANGE],
          2: [HOUR_RANGE],
          3: [HOUR_RANGE],
          4: [HOUR_RANGE],
          5: [{ start: 9, end: 13 }],
        },
      },
    }).cal,
  );

  it('7 h days: the keyboard steps from shift start to shift start, both ways', () => {
    expect(seven.start(oct(19, 9), 1, 'keyboard')).toEqual(oct(20, 9));
    expect(seven.start(oct(20, 9), 1, 'keyboard')).toEqual(oct(22, 9)); // the holiday is skipped
    expect(seven.start(oct(16, 9), 1, 'keyboard')).toEqual(oct(19, 9));
    expect(seven.start(oct(19, 9), -1, 'keyboard')).toEqual(oct(16, 9));
    expect(seven.start(oct(19, 9), 3, 'keyboard')).toEqual(oct(23, 9)); // Tuesday, Thursday, Friday
    expect(seven.end(oct(19, 17), 1, 'keyboard')).toEqual(oct(20, 17));
    expect(seven.end(oct(16, 17), 1, 'keyboard')).toEqual(oct(19, 17));
    expect(seven.end(oct(19, 17), -1, 'keyboard')).toEqual(oct(16, 17));
  });

  it('7 h days: the pointer and the keyboard land on the same time for the same day', () => {
    for (const [from, units] of [
      [oct(19, 9), 1],
      [oct(22, 9), 1],
      [oct(20, 9), -1],
    ] as const) {
      expect(seven.start(from, units, 'pointer')).toEqual(seven.start(from, units, 'keyboard'));
    }
    expect(seven.end(oct(19, 17), 1, 'pointer')).toEqual(seven.end(oct(19, 17), 1, 'keyboard'));
  });

  it('7 h days: a one-day task is long enough, half a day is not', () => {
    const long = seven.longEnough;
    if (!long) throw new Error('expected working durations');
    expect(long(oct(19, 9), oct(19, 17))).toBe(true); // 7 working hours
    expect(long(oct(19, 9), oct(20, 17))).toBe(true);
    expect(long(oct(19, 9), oct(19, 13))).toBe(false); // 3 hours
    expect(long(oct(19, 9), oct(19, 9))).toBe(false);
  });

  it('half Friday: the keyboard ends a step at the end of Friday’s shift and starts one at its beginning', () => {
    expect(half.end(oct(15, 17), 1, 'keyboard')).toEqual(oct(16, 13));
    expect(half.start(oct(15, 9), 1, 'keyboard')).toEqual(oct(16, 9));
    expect(half.start(oct(16, 9), 1, 'keyboard')).toEqual(oct(19, 9));
    expect(half.start(oct(19, 9), -1, 'keyboard')).toEqual(oct(16, 9));
    expect(half.end(oct(16, 13), -1, 'keyboard')).toEqual(oct(15, 13)); // Thursday’s same wall time, still in the shift
  });

  it('half Friday: the pointer agrees with the keyboard on a step that does not cross the weekend', () => {
    expect(half.end(oct(15, 17), 1, 'pointer')).toEqual(half.end(oct(15, 17), 1, 'keyboard'));
    expect(half.start(oct(15, 9), 1, 'pointer')).toEqual(half.start(oct(15, 9), 1, 'keyboard'));
    expect(half.start(oct(16, 9), 1, 'pointer')).toEqual(half.start(oct(16, 9), 1, 'keyboard')); // Saturday → Monday
    expect(half.end(oct(20, 17), -1, 'pointer')).toEqual(half.end(oct(20, 17), -1, 'keyboard'));
  });

  it('half Friday: a Friday alone (4 h) is one day, half a Thursday is not', () => {
    const long = half.longEnough;
    if (!long) throw new Error('expected working durations');
    expect(long(oct(16, 9), oct(16, 13))).toBe(true);
    expect(long(oct(15, 9), oct(16, 13))).toBe(true);
    expect(long(oct(15, 9), oct(15, 13))).toBe(false);
  });
});
