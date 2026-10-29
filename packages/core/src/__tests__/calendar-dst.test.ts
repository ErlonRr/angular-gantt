// ─────────────────────────────────────────────────────────────
//  Tests — Phase 13 (step 2.1): the working calendar across daylight-saving
//  changes. Each block sets the process time zone (America/Los_Angeles:
//  2026-03-08 is 23 h long, 2026-11-01 is 25 h; Australia/Lord_Howe: a 30-minute
//  change, 2026-04-05 is 24.5 h and 2026-10-04 is 23.5 h; Asia/Kolkata: +05:30,
//  no change) and builds its dates there with `new Date(y, m, d, …)`.
//
//  What is pinned: a day calendar measures elapsed day fractions (a DST day's
//  noon is 11/23 of the way through, not 1/2, but midnight to midnight is 1), an
//  hour calendar measures wall-clock hours (09:00–17:00 is 8 hours on any day), a
//  wall time a change skips is normalised forward by `Date`, one it repeats reads
//  as its wall time (so W does not advance there, and goes back by the repeated hour).
// ─────────────────────────────────────────────────────────────

import { afterEach, describe, it, expect } from 'vitest';
import { createWorkingCalendar, type GanttNonWorkingTime, type WorkingCalendar } from '../index';

const HOUR = 3_600_000;
const QUARTER = 15 * 60 * 1000;
const NINE_TO_FIVE = { start: 9, end: 17 };

const ORIGINAL_TZ = process.env['TZ'];
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env['TZ'];
  else process.env['TZ'] = ORIGINAL_TZ;
});

/** Run `fn` in a time zone; `probe` proves the zone took effect (the test fails loudly if the worker ignores TZ). */
function inZone(tz: string, probe: () => boolean, fn: () => void): void {
  process.env['TZ'] = tz;
  if (!probe()) throw new Error(`TZ=${tz} did not take effect in this worker`);
  fn();
}
const losAngeles = (fn: () => void) =>
  inZone('America/Los_Angeles', () => new Date(2026, 2, 8, 2, 30).getHours() === 3, fn);
const lordHowe = (fn: () => void) =>
  inZone(
    'Australia/Lord_Howe',
    () => new Date(2026, 0, 1).getTimezoneOffset() === -660 && new Date(2026, 3, 5, 12).getTimezoneOffset() === -630,
    fn,
  );
const kolkata = (fn: () => void) => inZone('Asia/Kolkata', () => new Date(2026, 0, 1).getTimezoneOffset() === -330, fn);

const day = (nonWorkingTime: GanttNonWorkingTime): WorkingCalendar => createWorkingCalendar({ nonWorkingTime })!;
const hours = (nonWorkingTime: GanttNonWorkingTime): WorkingCalendar =>
  createWorkingCalendar({ calendar: { unit: 'hour' }, nonWorkingTime })!;

/** Every quarter hour (elapsed) from `from` to `to`: W never goes back and every instant sits inside its W plateau. */
function sweep(cal: WorkingCalendar, from: Date, to: Date): void {
  let last = -Infinity;
  for (let t = from.getTime(); t <= to.getTime(); t += QUARTER) {
    const w = cal.toWorking(new Date(t));
    expect(w, `W at ${new Date(t).toString()}`).toBeGreaterThanOrEqual(last - 1e-9);
    last = w;
    expect(cal.fromWorkingEnd(w).getTime(), `end at ${new Date(t).toString()}`).toBeLessThanOrEqual(t + 1);
    expect(cal.fromWorkingStart(w).getTime(), `start at ${new Date(t).toString()}`).toBeGreaterThanOrEqual(t - 1);
  }
}

describe('America/Los_Angeles, spring forward (Sunday 2026-03-08, 23 hours)', () => {
  it('a day calendar: midnight to midnight is one day, noon is 11/23 through it', () => {
    losAngeles(() => {
      const cal = day({ weekends: [] });
      const sun = new Date(2026, 2, 8);
      const mon = new Date(2026, 2, 9);
      expect((mon.getTime() - sun.getTime()) / HOUR).toBe(23);
      expect(cal.workingDuration(sun, mon)).toBe(1);
      expect(cal.workingDuration(sun, new Date(2026, 2, 8, 12))).toBeCloseTo(11 / 23, 9);
      expect(cal.workingDuration(new Date(2026, 2, 7, 12), new Date(2026, 2, 8, 12))).toBeCloseTo(0.5 + 11 / 23, 9);
      // Representatives round-trip the instant
      const noon = new Date(2026, 2, 8, 12);
      const w = cal.toWorking(noon);
      expect(cal.fromWorkingEnd(w)).toEqual(noon);
      expect(cal.fromWorkingStart(w)).toEqual(noon);
      expect(cal.addWorking(new Date(2026, 2, 7), 2)).toEqual(mon);
      expect(cal.addWorking(mon, -2)).toEqual(new Date(2026, 2, 7));
    });
  });

  it('an hour calendar counts 09:00–17:00 as 8 wall-clock hours', () => {
    losAngeles(() => {
      const cal = hours({ weekends: [], workingHours: NINE_TO_FIVE });
      expect(cal.workingDuration(new Date(2026, 2, 8, 9), new Date(2026, 2, 8, 17))).toBe(8);
      expect(cal.workingDuration(new Date(2026, 2, 8), new Date(2026, 2, 9))).toBe(8);
      expect(cal.workingDuration(new Date(2026, 2, 6, 9), new Date(2026, 2, 9, 17))).toBe(32); // Fri, Sat, Sun, Mon
      expect(cal.addWorking(new Date(2026, 2, 8, 9), 8)).toEqual(new Date(2026, 2, 8, 17));
      // Saturday noon: 5 hours left that day, 3 more on Sunday
      expect(cal.addWorking(new Date(2026, 2, 7, 12), 8)).toEqual(new Date(2026, 2, 8, 12));
      expect(cal.snapStart(new Date(2026, 2, 8, 3))).toEqual(new Date(2026, 2, 8, 9));
      expect(cal.snapEnd(new Date(2026, 2, 8, 20))).toEqual(new Date(2026, 2, 8, 17));
    });
  });

  it('wall hours the change skips: the sum is wall-clock, the instant is normalised forward', () => {
    losAngeles(() => {
      const cal = hours({ weekends: [], workingHours: { start: 1, end: 4 } });
      const midnight = new Date(2026, 2, 8);
      // 01:00 → 04:00 is 3 wall hours, though only 2 hours elapse
      expect(cal.workingDuration(new Date(2026, 2, 8, 1), new Date(2026, 2, 8, 4))).toBe(3);
      expect((new Date(2026, 2, 8, 4).getTime() - new Date(2026, 2, 8, 1).getTime()) / HOUR).toBe(2);
      expect(cal.addWorking(new Date(2026, 2, 8, 1), 3)).toEqual(new Date(2026, 2, 8, 4));
      expect(cal.addWorking(midnight, 2)).toEqual(new Date(2026, 2, 8, 3));
      // 02:00 does not exist: `Date` reads it as 03:00, and W there is the wall time 03:00's
      const skipped = cal.addWorking(new Date(2026, 2, 8, 1), 1);
      expect(skipped).toEqual(new Date(2026, 2, 8, 2));
      expect(skipped.getHours()).toBe(3);
      expect(cal.workingDuration(new Date(2026, 2, 8, 1), skipped)).toBe(2);
    });
  });

  it('an all-day hour calendar counts 24 wall hours on a 23-hour day', () => {
    losAngeles(() => {
      const cal = hours({ weekends: [], workingHours: { start: 0, end: 24 } });
      expect(cal.workingDuration(new Date(2026, 2, 8), new Date(2026, 2, 9))).toBe(24);
      expect(cal.workingDuration(new Date(2026, 2, 7), new Date(2026, 2, 10))).toBe(72);
    });
  });

  it('a working week across the change is 5 days and 40 hours', () => {
    losAngeles(() => {
      const week = [new Date(2026, 2, 2), new Date(2026, 2, 9)] as const;
      expect(day({ weekends: [0, 6] }).workingDuration(...week)).toBe(5);
      expect(hours({ workingHours: NINE_TO_FIVE }).workingDuration(...week)).toBe(40);
      expect(day({ weekends: [0, 6] }).addWorking(week[0], 5)).toEqual(new Date(2026, 2, 7));
      expect(hours({ workingHours: NINE_TO_FIVE }).addWorking(new Date(2026, 2, 2, 9), 40)).toEqual(
        new Date(2026, 2, 6, 17),
      );
    });
  });

  it('is monotone and brackets every quarter hour around the change', () => {
    losAngeles(() => {
      const from = new Date(2026, 2, 5);
      const to = new Date(2026, 2, 11);
      sweep(day({ weekends: [0, 6] }), from, to);
      sweep(day({ weekends: [] }), from, to);
      sweep(hours({ workingHours: NINE_TO_FIVE }), from, to);
      sweep(hours({ weekends: [], workingHours: NINE_TO_FIVE }), from, to);
    });
  });
});

describe('America/Los_Angeles, fall back (Sunday 2026-11-01, 25 hours)', () => {
  it('a day calendar: midnight to midnight is one day, noon is 13/25 through it', () => {
    losAngeles(() => {
      const cal = day({ weekends: [] });
      const sun = new Date(2026, 10, 1);
      const mon = new Date(2026, 10, 2);
      expect((mon.getTime() - sun.getTime()) / HOUR).toBe(25);
      expect(cal.workingDuration(sun, mon)).toBe(1);
      expect(cal.workingDuration(sun, new Date(2026, 10, 1, 12))).toBeCloseTo(13 / 25, 9);
      const noon = new Date(2026, 10, 1, 12);
      expect(cal.fromWorkingEnd(cal.toWorking(noon))).toEqual(noon);
      expect(cal.addWorking(new Date(2026, 9, 31), 2)).toEqual(mon);
    });
  });

  it('an hour calendar counts 09:00–17:00 as 8 wall-clock hours', () => {
    losAngeles(() => {
      const cal = hours({ weekends: [], workingHours: NINE_TO_FIVE });
      expect(cal.workingDuration(new Date(2026, 10, 1, 9), new Date(2026, 10, 1, 17))).toBe(8);
      expect(cal.workingDuration(new Date(2026, 9, 30, 9), new Date(2026, 10, 2, 17))).toBe(32); // Fri, Sat, Sun, Mon
      expect(cal.addWorking(new Date(2026, 10, 1, 9), 8)).toEqual(new Date(2026, 10, 1, 17));
      expect(cal.addWorking(new Date(2026, 10, 1, 17), -8)).toEqual(new Date(2026, 10, 1, 9));
    });
  });

  it('an all-day hour calendar counts 24 wall hours on a 25-hour day', () => {
    losAngeles(() => {
      const cal = hours({ weekends: [], workingHours: { start: 0, end: 24 } });
      expect(cal.workingDuration(new Date(2026, 10, 1), new Date(2026, 10, 2))).toBe(24);
    });
  });

  it('reads a repeated wall hour as its wall time (a limit of wall-clock hours)', () => {
    losAngeles(() => {
      const cal = hours({ weekends: [], workingHours: { start: 1, end: 4 } });
      const midnight = new Date(2026, 10, 1);
      const first = new Date(2026, 10, 1, 1, 30); // 01:30 PDT
      const second = new Date(first.getTime() + HOUR); // 01:30 PST
      expect(second.getHours()).toBe(1);
      expect(cal.workingDuration(midnight, first)).toBe(0.5);
      expect(cal.workingDuration(midnight, second)).toBe(0.5);
      // So W goes back by the repeated hour: from 01:59 PDT (0.98…) to the 01:00 PST that follows it (0)
      const lateFirst = new Date(first.getTime() + 29 * 60 * 1000);
      const earlySecond = new Date(first.getTime() + 30 * 60 * 1000);
      expect(cal.workingDuration(midnight, earlySecond)).toBeLessThan(cal.workingDuration(midnight, lateFirst));
      // Outside the repeated hour W keeps counting wall hours: 04:00 is 3, whatever has elapsed
      expect(cal.workingDuration(midnight, new Date(2026, 10, 1, 4))).toBe(3);
    });
  });

  it('is monotone and brackets every quarter hour around the change', () => {
    losAngeles(() => {
      const from = new Date(2026, 9, 29);
      const to = new Date(2026, 10, 4);
      sweep(day({ weekends: [0, 6] }), from, to);
      sweep(day({ weekends: [] }), from, to);
      sweep(hours({ workingHours: NINE_TO_FIVE }), from, to);
      sweep(
        hours({
          weekends: [],
          workingHours: [
            { start: 9, end: 12 },
            { start: 13, end: 17 },
          ],
        }),
        from,
        to,
      );
    });
  });
});

describe('Australia/Lord_Howe (30-minute changes)', () => {
  it('spring forward, Sunday 2026-10-04 (23.5 hours): a day is one day, an hour calendar keeps 8 hours', () => {
    lordHowe(() => {
      const sun = new Date(2026, 9, 4);
      const mon = new Date(2026, 9, 5);
      expect((mon.getTime() - sun.getTime()) / HOUR).toBe(23.5);
      const cal = day({ weekends: [] });
      expect(cal.workingDuration(sun, mon)).toBe(1);
      expect(cal.workingDuration(sun, new Date(2026, 9, 4, 12))).toBeCloseTo(11.5 / 23.5, 9);
      const noon = new Date(2026, 9, 4, 12);
      expect(cal.fromWorkingEnd(cal.toWorking(noon))).toEqual(noon);
      const shifts = hours({ weekends: [], workingHours: NINE_TO_FIVE });
      expect(shifts.workingDuration(new Date(2026, 9, 4, 9), new Date(2026, 9, 4, 17))).toBe(8);
      expect(shifts.workingDuration(new Date(2026, 9, 2, 9), new Date(2026, 9, 5, 17))).toBe(32);
    });
  });

  it('spring forward: a skipped half hour is normalised forward by Date', () => {
    lordHowe(() => {
      const cal = hours({ weekends: [], workingHours: { start: 1, end: 4 } });
      // 02:00–02:30 does not exist on 2026-10-04
      const skipped = cal.addWorking(new Date(2026, 9, 4, 1), 1.25);
      expect(skipped).toEqual(new Date(2026, 9, 4, 2, 15));
      expect(skipped.getHours() * 60 + skipped.getMinutes()).toBe(2 * 60 + 45);
      expect(cal.workingDuration(new Date(2026, 9, 4, 1), new Date(2026, 9, 4, 4))).toBe(3);
    });
  });

  it('fall back, Sunday 2026-04-05 (24.5 hours): a day is one day, an hour calendar keeps 8 hours', () => {
    lordHowe(() => {
      const sun = new Date(2026, 3, 5);
      const mon = new Date(2026, 3, 6);
      expect((mon.getTime() - sun.getTime()) / HOUR).toBe(24.5);
      const cal = day({ weekends: [] });
      expect(cal.workingDuration(sun, mon)).toBe(1);
      expect(cal.workingDuration(sun, new Date(2026, 3, 5, 12))).toBeCloseTo(12.5 / 24.5, 9);
      const shifts = hours({ weekends: [], workingHours: NINE_TO_FIVE });
      expect(shifts.workingDuration(new Date(2026, 3, 5, 9), new Date(2026, 3, 5, 17))).toBe(8);
      expect(shifts.addWorking(new Date(2026, 3, 4, 17), 8)).toEqual(new Date(2026, 3, 5, 17));
    });
  });

  it('is monotone and brackets every quarter hour around both changes', () => {
    lordHowe(() => {
      for (const [from, to] of [
        [new Date(2026, 9, 1), new Date(2026, 9, 7)],
        [new Date(2026, 3, 2), new Date(2026, 3, 8)],
      ] as const) {
        sweep(day({ weekends: [0, 6] }), from, to);
        sweep(day({ weekends: [] }), from, to);
        sweep(hours({ workingHours: NINE_TO_FIVE }), from, to);
        sweep(hours({ weekends: [], workingHours: NINE_TO_FIVE }), from, to);
      }
    });
  });
});

describe('Asia/Kolkata (+05:30, no change)', () => {
  it('counts days and hours as anywhere', () => {
    kolkata(() => {
      const d = day({ holidays: [new Date(2026, 9, 21)] });
      expect(d.workingDuration(new Date(2026, 9, 12), new Date(2026, 9, 19))).toBe(5);
      expect(d.workingDuration(new Date(2026, 9, 19), new Date(2026, 9, 26))).toBe(4);
      expect(d.workingDuration(new Date(2026, 9, 12), new Date(2026, 9, 12, 12))).toBe(0.5);
      expect(d.addWorking(new Date(2026, 9, 16), 1)).toEqual(new Date(2026, 9, 17));
      const h = hours({
        workingHours: [
          { start: 8, end: 12 },
          { start: 13, end: 17 },
        ],
      });
      expect(h.workingDuration(new Date(2026, 9, 12), new Date(2026, 9, 17))).toBe(40);
      expect(h.addWorking(new Date(2026, 9, 12, 8), 9)).toEqual(new Date(2026, 9, 13, 9));
      expect(h.snapEnd(new Date(2026, 9, 12, 12, 30))).toEqual(new Date(2026, 9, 12, 12));
      sweep(d, new Date(2026, 9, 10), new Date(2026, 9, 24));
      sweep(h, new Date(2026, 9, 10), new Date(2026, 9, 24));
    });
  });
});

describe('the epoch in any zone', () => {
  it('W is 0 at the local midnight of 1970-01-01 and counts days either side of it', () => {
    for (const zone of [losAngeles, lordHowe, kolkata]) {
      zone(() => {
        const cal = day({ weekends: [0, 6] });
        expect(cal.toWorking(new Date(1970, 0, 1))).toBe(0);
        expect(cal.toWorking(new Date(1970, 0, 2))).toBe(1); // Thursday 1 Jan worked
        expect(cal.toWorking(new Date(1969, 11, 31))).toBe(-1);
        expect(cal.fromWorkingEnd(0)).toEqual(new Date(1969, 11, 31, 24)); // right after Wednesday's working day
        expect(cal.fromWorkingStart(0)).toEqual(new Date(1970, 0, 1));
      });
    }
  });
});
