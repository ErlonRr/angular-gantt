// ─────────────────────────────────────────────────────────────
//  Tests — Phase 13 step 2.4: `DragSession` and `editTiming` under a
//  working calendar (plan D11 / D14): a move keeps the working length
//  and widens the bar over the days off, resizes snap (a start forward,
//  an end back) and never go below one snap unit of working time, and
//  the event amounts are the edge's real calendar shift. Without a
//  calendar everything is what it was. October 2026: Monday the 12th,
//  Friday the 16th, Saturday the 17th, Monday the 19th, Wednesday the
//  21st a holiday. Dates are built with `new Date(y, m, d, …)`
//  (`pnpm test:tz`).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { dateToPixel } from '../gantt-math';
import { DragSession, editTiming, resolveConfig, type DragHandle, type DragTiming, type GanttOptions } from '../index';

const oct = (day: number, h = 0): Date => new Date(2026, 9, day, h);
const HOLIDAY = oct(21);
const ORIGIN = oct(5);
const ROW = { y: 10, height: 30 };
const START_X = 500;

const WORK: GanttOptions = { calendar: true, nonWorkingTime: { holidays: [HOLIDAY] } };
// Timed data: a timed instant that is UTC midnight in some zone (Lord Howe 11:00) must not read as date-only
const HOURS: GanttOptions = {
  normalizeDateOnly: false,
  viewMode: 'Hour',
  calendar: { unit: 'hour', hoursPerDay: 8 },
  nonWorkingTime: { holidays: [HOLIDAY], workingHours: [{ start: 9, end: 17 }] },
};

const timingOf = (options: GanttOptions, pxPerDay = 20): DragTiming =>
  editTiming({ pxPerDay, toX: d => dateToPixel(d, ORIGIN, pxPerDay) }, resolveConfig(options));

/** A session on a task `start`–`end`, and the x that is `units` snap units from where the grab began. */
function session(handle: DragHandle, start: Date, end: Date, timing: DragTiming) {
  const unitPx = timing.snap === 'hour' ? timing.pxPerDay / 24 : timing.pxPerDay;
  return {
    drag: new DragSession('t', handle, start, end, START_X, ROW, timing),
    at: (units: number) => START_X + units * unitPx,
  };
}

describe('editTiming', () => {
  it('carries no calendar without one', () => {
    const timing = timingOf({});
    expect(timing.calendar).toBeNull();
    expect(timing.dates?.calendar).toBeNull();
    expect(timing.snap).toBe('day');
  });

  it('carries the reading and the editing rules with one', () => {
    const timing = timingOf(WORK);
    expect(timing.calendar).not.toBeNull();
    expect(timing.dates?.calendar?.durations).toBe('working');
    expect(timing.dates?.endDateMode).toBe('exclusive');
  });

  it('follows the bottom scale’s unit for the snap', () => {
    expect(timingOf(HOURS, 240).snap).toBe('hour');
    expect(timingOf(HOURS, 240).calendar).not.toBeNull();
  });

  it('is null for calendar durations that do not skip', () => {
    expect(timingOf({ calendar: { durations: 'calendar', skipNonWorking: false } }).calendar).toBeNull();
  });
});

describe('moving a bar (working days)', () => {
  const timing = timingOf(WORK);

  it('Friday → Monday: keeps the working days, widens over the weekend', () => {
    // Friday 16 – Tuesday 20 00:00: Friday and Monday, two working days
    const { drag, at } = session('bar', oct(16), oct(20), timing);
    const result = drag.finish(at(1)); // Saturday → snaps to Monday
    expect(result?.kind).toBe('drag');
    if (result?.kind !== 'drag') return;
    expect(result.event.newStart).toEqual(oct(19));
    expect(result.event.newEnd).toEqual(oct(21)); // Monday and Tuesday
    expect(result.event.oldStart).toEqual(oct(16));
    expect(result.event.oldEnd).toEqual(oct(20));
    expect(result.event.daysMoved).toBe(3); // the real calendar shift, not 1 unit
  });

  it('the preview counts the pointer’s units and shows the snapped dates', () => {
    const { drag, at } = session('bar', oct(16), oct(20), timing);
    const preview = drag.preview(at(1));
    expect(preview.delta).toBe(1);
    expect(preview.daysDelta).toBe(1);
    expect(preview.unit).toBe('day');
    expect(preview.start).toEqual(oct(19));
    expect(preview.end).toEqual(oct(21));
    expect(preview.x).toBe(dateToPixel(oct(19), ORIGIN, 20));
    expect(preview.width).toBe(dateToPixel(oct(21), ORIGIN, 20) - dateToPixel(oct(19), ORIGIN, 20));
  });

  it('over the holiday the bar widens again', () => {
    const { drag, at } = session('bar', oct(19), oct(21), timing); // Monday, Tuesday
    const result = drag.finish(at(1)); // Tuesday
    expect(result?.kind).toBe('drag');
    if (result?.kind !== 'drag') return;
    expect(result.event.newStart).toEqual(oct(20));
    expect(result.event.newEnd).toEqual(oct(23)); // Tuesday, Thursday
    expect(result.event.daysMoved).toBe(1);
  });

  it('a start that snaps back to where it was changes nothing', () => {
    const { drag, at } = session('bar', oct(19), oct(21), timing);
    expect(drag.finish(at(-1))).toBeNull(); // Sunday → Monday
    expect(drag.finish(at(-2))).toBeNull();
    expect(drag.finish(at(0))).toBeNull();
  });

  it('moving back lands on the previous working day', () => {
    const { drag, at } = session('bar', oct(19), oct(21), timing);
    const result = drag.finish(at(-3)); // Friday
    expect(result?.kind).toBe('drag');
    if (result?.kind !== 'drag') return;
    expect(result.event.newStart).toEqual(oct(16));
    expect(result.event.newEnd).toEqual(oct(20)); // Friday, Monday
    expect(result.event.daysMoved).toBe(-3);
  });

  it('a milestone moves like a start and stays zero-length', () => {
    const { drag, at } = session('bar', oct(15), oct(15), timing);
    const result = drag.finish(at(2)); // Saturday → Monday
    expect(result?.kind).toBe('drag');
    if (result?.kind !== 'drag') return;
    expect(result.event.newStart).toEqual(oct(19));
    expect(result.event.newEnd).toEqual(oct(19));
  });

  it('a task with no working time keeps its calendar length', () => {
    const { drag, at } = session('bar', oct(17), oct(19), timing); // the weekend
    const result = drag.finish(at(7));
    expect(result?.kind).toBe('drag');
    if (result?.kind !== 'drag') return;
    expect(result.event.newStart).toEqual(oct(26)); // Saturday → Monday
    expect(result.event.newEnd).toEqual(oct(28));
  });

  it('calendar durations that skip: the start snaps, the end keeps the calendar length', () => {
    const skipping = timingOf({ ...WORK, calendar: { durations: 'calendar' } });
    const { drag, at } = session('bar', oct(16), oct(20), skipping);
    const result = drag.finish(at(1));
    expect(result?.kind).toBe('drag');
    if (result?.kind !== 'drag') return;
    expect(result.event.newStart).toEqual(oct(19));
    expect(result.event.newEnd).toEqual(oct(23)); // four calendar days
  });

  it('calendar durations that skip: a Monday–Tuesday task moved to Friday ends Saturday, not Sunday', () => {
    const skipping = timingOf({ ...WORK, calendar: { durations: 'calendar' } });
    const { drag, at } = session('bar', oct(12), oct(14), skipping);
    const result = drag.finish(at(4)); // Friday
    expect(result?.kind).toBe('drag');
    if (result?.kind !== 'drag') return;
    expect(result.event.newStart).toEqual(oct(16));
    expect(result.event.newEnd).toEqual(oct(17));
    expect(result.event.daysMoved).toBe(4);
  });

  it('calendar durations without skipping have no editing rules: the plain calendar shift', () => {
    const plain = timingOf({ ...WORK, calendar: { durations: 'calendar', skipNonWorking: false } });
    expect(plain.calendar).toBeNull();
    const { drag, at } = session('bar', oct(12), oct(14), plain);
    const result = drag.finish(at(4));
    expect(result).toMatchObject({ kind: 'drag', event: { newStart: oct(16), newEnd: oct(18), daysMoved: 4 } });
  });

  it('keeps a UTC date-only task date-only', () => {
    const utc = (day: number) => new Date(Date.UTC(2026, 9, day));
    const { drag, at } = session('bar', utc(16), utc(20), timing);
    const result = drag.finish(at(1));
    expect(result?.kind).toBe('drag');
    if (result?.kind !== 'drag') return;
    expect(result.event.newStart).toEqual(utc(19));
    expect(result.event.newEnd).toEqual(utc(21));
  });
});

describe('resizing (working days)', () => {
  const timing = timingOf(WORK);

  it('right onto Sunday: the end snaps back to Saturday 00:00', () => {
    const { drag, at } = session('right', oct(12), oct(16), timing); // Monday – Thursday
    const result = drag.finish(at(2)); // Sunday 00:00
    expect(result?.kind).toBe('resize');
    if (result?.kind !== 'resize') return;
    expect(result.event.edge).toBe('end');
    expect(result.event.handle).toBe('right');
    expect(result.event.newStart).toEqual(oct(12));
    expect(result.event.newEnd).toEqual(oct(17));
    expect(result.event.daysDelta).toBe(1); // Friday 00:00 → Saturday 00:00
  });

  it('right onto Monday 00:00 is still the end of Friday', () => {
    const { drag, at } = session('right', oct(12), oct(16), timing);
    const result = drag.finish(at(3));
    expect(result?.kind).toBe('resize');
    if (result?.kind !== 'resize') return;
    expect(result.event.newEnd).toEqual(oct(17));
  });

  it('left onto Saturday: the start snaps forward to Monday', () => {
    const { drag, at } = session('left', oct(20), oct(23), timing); // Tuesday, Thursday (Wednesday is the holiday)
    const result = drag.finish(at(-3)); // Saturday
    expect(result?.kind).toBe('resize');
    if (result?.kind !== 'resize') return;
    expect(result.event.edge).toBe('start');
    expect(result.event.handle).toBe('left');
    expect(result.event.newStart).toEqual(oct(19));
    expect(result.event.newEnd).toEqual(oct(23));
    expect(result.event.daysDelta).toBe(-1);
  });

  it('left onto the Saturday before a Monday start changes nothing', () => {
    const { drag, at } = session('left', oct(19), oct(23), timing);
    expect(drag.finish(at(-2))).toBeNull();
  });

  it('never goes below one working day', () => {
    // Monday – Wednesday 00:00: Monday and Tuesday
    const right = session('right', oct(19), oct(21), timing);
    const shrunk = right.drag.finish(right.at(-3));
    expect(shrunk?.kind).toBe('resize');
    if (shrunk?.kind !== 'resize') return;
    expect(shrunk.event.newEnd).toEqual(oct(20)); // Monday only
    expect(shrunk.event.daysDelta).toBe(-1);
    const left = session('left', oct(19), oct(21), timing);
    const result = left.drag.finish(left.at(5));
    expect(result?.kind).toBe('resize');
    if (result?.kind !== 'resize') return;
    expect(result.event.newStart).toEqual(oct(20)); // Tuesday only
    expect(result.event.daysDelta).toBe(1);
  });

  it('a task already shorter than one unit does not shrink at all', () => {
    const { drag, at } = session('right', oct(19), oct(19, 6), timing);
    expect(drag.finish(at(-1))).toBeNull();
  });

  it('calendar durations that skip keep the drawn px minimum and snap the ends', () => {
    const skipping = timingOf({ ...WORK, calendar: { durations: 'calendar' } });
    const { drag, at } = session('right', oct(12), oct(16), skipping);
    const result = drag.finish(at(2));
    expect(result?.kind).toBe('resize');
    if (result?.kind !== 'resize') return;
    expect(result.event.newEnd).toEqual(oct(17));
    const shrink = session('right', oct(19), oct(21), skipping);
    const shrunk = shrink.drag.finish(shrink.at(-9));
    expect(shrunk?.kind).toBe('resize');
    if (shrunk?.kind !== 'resize') return;
    expect(shrunk.event.newEnd).toEqual(oct(20)); // one unit of px is kept
  });
});

describe('an hour scale (09:00–17:00)', () => {
  const timing = timingOf(HOURS, 240);

  it('a move over the evening skips to the next morning and keeps the working hours', () => {
    const { drag, at } = session('bar', oct(16, 14), oct(16, 17), timing); // Friday 14:00 – 17:00
    const result = drag.finish(at(4)); // 18:00 → Monday 09:00
    expect(result?.kind).toBe('drag');
    if (result?.kind !== 'drag') return;
    expect(result.event.newStart).toEqual(oct(19, 9));
    expect(result.event.newEnd).toEqual(oct(19, 12)); // three working hours
    expect(result.event.daysMoved).toBeCloseTo(67 / 24, 9);
  });

  it('a resize snaps an end back to the end of the shift', () => {
    const { drag, at } = session('right', oct(16, 9), oct(16, 12), timing);
    const result = drag.finish(at(8)); // 20:00
    expect(result?.kind).toBe('resize');
    if (result?.kind !== 'resize') return;
    expect(result.event.newEnd).toEqual(oct(16, 17));
    expect(result.event.daysDelta).toBeCloseTo(5 / 24, 9);
  });

  it('never goes below one working hour', () => {
    const { drag, at } = session('right', oct(16, 9), oct(16, 12), timing);
    const result = drag.finish(at(-9));
    expect(result?.kind).toBe('resize');
    if (result?.kind !== 'resize') return;
    expect(result.event.newEnd).toEqual(oct(16, 10));
  });
});

describe('a day scale of an hour calendar whose days are not hoursPerDay hours', () => {
  const RANGE = { start: 9, end: 17 };
  const SEVEN = timingOf({
    ...HOURS,
    viewMode: 'Day',
    nonWorkingTime: {
      holidays: [HOLIDAY],
      workingHours: [
        { start: 9, end: 12 },
        { start: 13, end: 17 },
      ],
    },
  });
  const HALF_FRIDAY = timingOf({
    ...HOURS,
    viewMode: 'Day',
    nonWorkingTime: {
      holidays: [HOLIDAY],
      workingHours: { 1: [RANGE], 2: [RANGE], 3: [RANGE], 4: [RANGE], 5: [{ start: 9, end: 13 }] },
    },
  });

  it('7 h days: a two-day task can be resized to one day', () => {
    expect(SEVEN.snap).toBe('day');
    const { drag, at } = session('right', oct(19, 9), oct(20, 17), SEVEN);
    const result = drag.finish(at(-1));
    expect(result?.kind).toBe('resize');
    if (result?.kind !== 'resize') return;
    expect(result.event.newEnd).toEqual(oct(19, 17)); // 7 working hours: one day
    expect(result.event.daysDelta).toBe(-1);
    // and not below it
    const again = session('right', oct(19, 9), oct(19, 17), SEVEN);
    expect(again.drag.finish(again.at(-1))).toBeNull();
  });

  it('7 h days: a move by one day keeps the shift start', () => {
    const { drag, at } = session('bar', oct(19, 9), oct(19, 17), SEVEN);
    const result = drag.finish(at(1));
    expect(result?.kind).toBe('drag');
    if (result?.kind !== 'drag') return;
    expect(result.event.newStart).toEqual(oct(20, 9));
    expect(result.event.newEnd).toEqual(oct(20, 17));
  });

  it('half Friday: a Thursday–Friday task shrinks to the half Friday, not to half a Thursday', () => {
    const left = session('left', oct(15, 9), oct(16, 13), HALF_FRIDAY);
    const friday = left.drag.finish(left.at(1));
    expect(friday?.kind).toBe('resize');
    if (friday?.kind !== 'resize') return;
    expect(friday.event.newStart).toEqual(oct(16, 9)); // Friday alone: 4 working hours
    const right = session('right', oct(15, 9), oct(16, 13), HALF_FRIDAY);
    expect(right.drag.finish(right.at(-1))).toBeNull(); // Thursday 13:00 would be half a Thursday
  });

  it('half Friday: the right edge dragged onto Friday ends at the end of its shift', () => {
    const { drag, at } = session('right', oct(14, 9), oct(15, 17), HALF_FRIDAY);
    const result = drag.finish(at(1));
    expect(result?.kind).toBe('resize');
    if (result?.kind !== 'resize') return;
    expect(result.event.newEnd).toEqual(oct(16, 13));
    expect(result.event.daysDelta).toBeCloseTo(20 / 24, 9); // the real shift: Thursday 17:00 → Friday 13:00
  });
});

describe('without a calendar: unchanged', () => {
  const bare: DragTiming = { ...timingOf({}), dates: undefined, calendar: undefined };
  const plain = timingOf({});

  it('editTiming adds no behaviour', () => {
    for (const handle of ['bar', 'left', 'right'] as const) {
      for (const units of [-12, -3, -1, 0, 1, 2, 3, 9]) {
        const a = session(handle, oct(14), oct(19), bare);
        const b = session(handle, oct(14), oct(19), plain);
        expect(b.drag.finish(b.at(units))).toEqual(a.drag.finish(a.at(units)));
        expect(b.drag.preview(b.at(units))).toEqual(a.drag.preview(a.at(units)));
      }
    }
  });

  it('amounts count the pointer’s snap units', () => {
    const { drag, at } = session('bar', oct(16), oct(20), plain);
    const result = drag.finish(at(1));
    expect(result).toEqual({
      kind: 'drag',
      event: {
        taskId: 't',
        oldStart: oct(16),
        oldEnd: oct(20),
        newStart: oct(17),
        newEnd: oct(21),
        daysMoved: 1,
      },
    });
  });

  it('calendar: false is the same as unset', () => {
    const off = timingOf({ calendar: false, nonWorkingTime: { holidays: [HOLIDAY] } });
    expect(off.calendar).toBeNull();
    const a = session('bar', oct(16), oct(20), off);
    const b = session('bar', oct(16), oct(20), plain);
    expect(a.drag.finish(a.at(1))).toEqual(b.drag.finish(b.at(1)));
  });
});
