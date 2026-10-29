// ─────────────────────────────────────────────────────────────
//  Tests — Phase 13 step 2.4: move mode (`KeyboardEditSession`) under
//  a working calendar (plan D11 / D13 / D14): every arrow press moves
//  one snap unit of working time — no dead key over a weekend in
//  either direction —, the end follows the working length, resizes
//  never go below one unit, and a commit is one `move` whose amount
//  is the real calendar shift. October 2026: Monday the 12th, Friday
//  the 16th, Monday the 19th, Wednesday the 21st a holiday. Dates are
//  built with `new Date(y, m, d, …)` (`pnpm test:tz`).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { dateToPixel } from '../gantt-math';
import {
  KeyboardEditSession,
  editTiming,
  keyboardEditChange,
  resolveConfig,
  type DragTiming,
  type GanttOptions,
  type GanttTask,
  type KeyLike,
} from '../index';

const oct = (day: number, h = 0): Date => new Date(2026, 9, day, h);
const HOLIDAY = oct(21);
const ORIGIN = oct(5);
const ROW = { y: 40, height: 32 };

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

const task = (start: Date, end: Date): GanttTask => ({ id: 'a', name: 'Build', start, end });
const sessionOf = (t: GanttTask, timing: DragTiming) => new KeyboardEditSession(t, ROW, timing);

const key = (name: string, mods: Partial<KeyLike> = {}): KeyLike => ({ key: name, ...mods });
const right = key('ArrowRight');
const left = key('ArrowLeft');
const shiftRight = key('ArrowRight', { shiftKey: true });
const shiftLeft = key('ArrowLeft', { shiftKey: true });
const altRight = key('ArrowRight', { altKey: true });
const altLeft = key('ArrowLeft', { altKey: true });

describe('move mode (working days)', () => {
  const timing = timingOf(WORK);

  it('→ from Friday lands on Monday and the end follows the working day', () => {
    const s = sessionOf(task(oct(16), oct(17)), timing); // Friday only
    s.handleKey(right);
    expect(s.state.start).toEqual(oct(19));
    expect(s.state.end).toEqual(oct(20));
    expect(s.state.startUnits).toBe(1);
    expect(s.state.endUnits).toBe(1);
    expect(s.preview().delta).toBe(1);
    expect(s.preview().start).toEqual(oct(19));
    expect(s.commit()).toEqual([
      {
        kind: 'drag',
        event: {
          taskId: 'a',
          oldStart: oct(16),
          oldEnd: oct(17),
          newStart: oct(19),
          newEnd: oct(20),
          daysMoved: 3,
        },
      },
    ]);
  });

  it('← from Monday lands on Friday', () => {
    const s = sessionOf(task(oct(19), oct(20)), timing);
    s.handleKey(left);
    expect(s.state.start).toEqual(oct(16));
    expect(s.state.end).toEqual(oct(17));
    const [event] = s.commit();
    expect(event).toMatchObject({ kind: 'drag', event: { daysMoved: -3 } });
  });

  it('a two-day task keeps its working days across the weekend and the holiday', () => {
    const s = sessionOf(task(oct(16), oct(20)), timing); // Friday, Monday
    s.handleKey(right); // Monday, Tuesday
    expect(s.state.start).toEqual(oct(19));
    expect(s.state.end).toEqual(oct(21));
    s.handleKey(right); // Tuesday, then Thursday (the holiday between)
    expect(s.state.start).toEqual(oct(20));
    expect(s.state.end).toEqual(oct(23));
    s.handleKey(left);
    s.handleKey(left);
    expect(s.state.start).toEqual(oct(16));
    expect(s.state.end).toEqual(oct(20));
    expect(s.state.changed).toBe(false);
  });

  it('every press moves: no dead key over the weekend', () => {
    const s = sessionOf(task(oct(15), oct(16)), timing); // Thursday
    const starts = [];
    for (let i = 0; i < 4; i++) {
      s.handleKey(right);
      starts.push(s.state.start.getTime());
    }
    expect(starts).toEqual([oct(16), oct(19), oct(20), oct(22)].map(d => d.getTime()));
  });

  it('Shift + → resizes the end by one working day, over the weekend', () => {
    const s = sessionOf(task(oct(16), oct(17)), timing);
    const result = s.handleKey(shiftRight);
    expect(result).toMatchObject({ type: 'step', changed: true });
    expect(s.state.start).toEqual(oct(16));
    expect(s.state.end).toEqual(oct(20));
    expect(s.preview().delta).toBe(1);
    expect(s.commit()).toEqual([
      {
        kind: 'resize',
        event: {
          taskId: 'a',
          edge: 'end',
          handle: 'right',
          oldStart: oct(16),
          oldEnd: oct(17),
          newStart: oct(16),
          newEnd: oct(20),
          daysDelta: 3,
        },
      },
    ]);
  });

  it('Alt + ← resizes the start back over the weekend', () => {
    const s = sessionOf(task(oct(19), oct(21)), timing);
    s.handleKey(altLeft);
    expect(s.state.start).toEqual(oct(16));
    expect(s.state.end).toEqual(oct(21));
    expect(s.commit()).toMatchObject([{ kind: 'resize', event: { edge: 'start', handle: 'left', daysDelta: -3 } }]);
  });

  it('never shrinks below one working day', () => {
    const s = sessionOf(task(oct(16), oct(17)), timing); // one day
    expect(s.handleKey(shiftLeft)).toMatchObject({ type: 'step', changed: false });
    expect(s.handleKey(altRight)).toMatchObject({ type: 'step', changed: false });
    expect(s.state.changed).toBe(false);
    expect(s.commit()).toEqual([]);
    const two = sessionOf(task(oct(19), oct(21)), timing);
    expect(two.handleKey(shiftLeft)).toMatchObject({ changed: true });
    expect(two.state.end).toEqual(oct(20));
    expect(two.handleKey(shiftLeft)).toMatchObject({ changed: false });
    expect(two.state.end).toEqual(oct(20));
  });

  it('a move then a resize of the end: a drag by the start shift, then a resize for the rest', () => {
    const s = sessionOf(task(oct(16), oct(17)), timing);
    s.handleKey(right); // Monday
    s.handleKey(shiftRight); // end one working day later
    expect(s.state.start).toEqual(oct(19));
    expect(s.state.end).toEqual(oct(21));
    const events = s.commit();
    expect(events.map(e => e.kind)).toEqual(['drag', 'resize']);
    expect(events[0]).toMatchObject({ event: { newStart: oct(19), newEnd: oct(20), daysMoved: 3 } });
    expect(events[1]).toMatchObject({ event: { oldEnd: oct(20), newEnd: oct(21), daysDelta: 1 } });
  });

  it('resizing the start alone leaves the end exactly where it was', () => {
    // an end in the middle of the weekend, which a working step would normalise to Saturday 00:00
    const s = sessionOf(task(oct(14), oct(17, 12)), timing);
    s.handleKey(altRight);
    expect(s.state.start).toEqual(oct(15));
    expect(s.state.end).toEqual(oct(17, 12));
    expect(s.commit()).toMatchObject([{ kind: 'resize', event: { edge: 'start', newEnd: oct(17, 12) } }]);
  });

  it('cancel restores the task', () => {
    const s = sessionOf(task(oct(16), oct(20)), timing);
    s.handleKey(right);
    s.cancel();
    expect(s.state.start).toEqual(oct(16));
    expect(s.state.end).toEqual(oct(20));
  });
});

describe('keyboardEditChange under a calendar', () => {
  const timing = timingOf(WORK);

  it('a working move is one move op, even when the end shifts by other days than the start', () => {
    // Wednesday 14 – Friday 16 00:00: Wednesday and Thursday
    const t = task(oct(14), oct(16));
    const s = sessionOf(t, timing);
    s.handleKey(right);
    s.handleKey(right); // Friday 16: start +2 days, end Tuesday 20 00:00: +5 days
    expect(s.state.start).toEqual(oct(16));
    expect(s.state.end).toEqual(oct(20));
    expect(s.dates).toBe(timing.dates);
    const change = keyboardEditChange(s, t);
    expect(change?.source).toBe('keyboard');
    expect(change?.coalesceKey).toBe('kbd:a');
    expect(change?.updates).toEqual([
      { taskId: 'a', before: { start: oct(14), end: oct(16) }, after: { start: oct(16), end: oct(20) } },
    ]);
    expect(change?.ops).toEqual([
      {
        op: 'move',
        event: { taskId: 'a', oldStart: oct(14), oldEnd: oct(16), newStart: oct(16), newEnd: oct(20), daysMoved: 2 },
      },
    ]);
  });

  it('without the session’s reading the same dates read as a move and a resize', () => {
    const t = task(oct(14), oct(16));
    const bare: DragTiming = { ...timing, dates: undefined };
    const s = sessionOf(t, bare);
    s.handleKey(right);
    s.handleKey(right);
    expect(s.dates).toBeUndefined();
    expect(keyboardEditChange(s, t)?.ops.map(o => o.op)).toEqual(['move', 'resize']);
  });

  it('a resize of the end is one resize op', () => {
    const t = task(oct(16), oct(17));
    const s = sessionOf(t, timing);
    s.handleKey(shiftRight);
    expect(keyboardEditChange(s, t)?.ops).toMatchObject([
      { op: 'resize', event: { edge: 'end', handle: 'right', daysDelta: 3 } },
    ]);
  });

  it('matches commit() event for event', () => {
    const t = task(oct(16), oct(17));
    const s = sessionOf(t, timing);
    s.handleKey(shiftRight);
    s.handleKey(altRight);
    const change = keyboardEditChange(s, t);
    expect(change?.ops.map(o => o.event)).toEqual(s.commit().map(e => e.event));
  });
});

describe('an hour scale (09:00–17:00, 8 hours a day)', () => {
  const timing = timingOf(HOURS, 240);

  it('→ moves one working hour; Friday 16:00 → 17:00 is Monday 09:00', () => {
    const s = sessionOf(task(oct(16, 15), oct(16, 17)), timing); // two hours
    s.handleKey(right);
    expect(s.state.start).toEqual(oct(16, 16));
    expect(s.state.end).toEqual(oct(19, 10)); // one hour on Friday, one on Monday
    s.handleKey(right);
    expect(s.state.start).toEqual(oct(19, 9));
    expect(s.state.end).toEqual(oct(19, 11));
    expect(s.preview().unit).toBe('hour');
    expect(s.preview().delta).toBe(2);
    expect(s.commit()).toMatchObject([{ kind: 'drag', event: { daysMoved: (24 * 3 - 6) / 24 } }]);
  });

  it('← steps back over the evening and the weekend, the end keeps the two working hours', () => {
    const s = sessionOf(task(oct(19, 10), oct(19, 12)), timing);
    s.handleKey(left);
    expect(s.state.start).toEqual(oct(19, 9));
    expect(s.state.end).toEqual(oct(19, 11));
    s.handleKey(left); // Monday 09:00 is Friday 17:00: the next step back is Friday 16:00
    expect(s.state.start).toEqual(oct(16, 16));
    expect(s.state.end).toEqual(oct(19, 10));
    s.handleKey(left);
    expect(s.state.start).toEqual(oct(16, 15));
    expect(s.state.end).toEqual(oct(16, 17));
  });

  it('never shorter than one working hour', () => {
    const s = sessionOf(task(oct(19, 9), oct(19, 11)), timing);
    expect(s.handleKey(shiftLeft)).toMatchObject({ changed: true });
    expect(s.state.end).toEqual(oct(19, 10));
    expect(s.handleKey(shiftLeft)).toMatchObject({ changed: false });
  });
});

describe('a day scale of an hour calendar', () => {
  it('→ moves one working day, whatever hoursPerDay is', () => {
    const timing = timingOf({ ...HOURS, viewMode: 'Day', calendar: { unit: 'hour', hoursPerDay: 6 } });
    expect(timing.snap).toBe('day');
    const s = sessionOf(task(oct(19, 9), oct(19, 12)), timing);
    s.handleKey(right);
    expect(s.state.start).toEqual(oct(20, 9));
    expect(s.state.end).toEqual(oct(20, 12)); // the same three working hours
  });
});

describe('a day scale of an hour calendar whose days are not hoursPerDay hours', () => {
  // 7 working hours a day (09:00–12:00, 13:00–17:00) with hoursPerDay 8; Fridays work 09:00–13:00
  const SEVEN: GanttOptions = {
    ...HOURS,
    viewMode: 'Day',
    nonWorkingTime: {
      holidays: [HOLIDAY],
      workingHours: [
        { start: 9, end: 12 },
        { start: 13, end: 17 },
      ],
    },
  };
  const FRIDAY_HALF: GanttOptions = {
    ...HOURS,
    viewMode: 'Day',
    nonWorkingTime: {
      holidays: [HOLIDAY],
      workingHours: {
        1: [{ start: 9, end: 17 }],
        2: [{ start: 9, end: 17 }],
        3: [{ start: 9, end: 17 }],
        4: [{ start: 9, end: 17 }],
        5: [{ start: 9, end: 13 }],
      },
    },
  };

  it('7 h days: → keeps the shift start and ← comes back to it', () => {
    const s = sessionOf(task(oct(19, 9), oct(19, 17)), timingOf(SEVEN));
    expect(s.unit).toBe('day');
    s.handleKey(right);
    expect(s.state.start).toEqual(oct(20, 9));
    expect(s.state.end).toEqual(oct(20, 17));
    s.handleKey(right); // Wednesday the 21st is the holiday
    expect(s.state.start).toEqual(oct(22, 9));
    expect(s.state.end).toEqual(oct(22, 17));
    s.handleKey(left);
    s.handleKey(left);
    expect(s.state.start).toEqual(oct(19, 9));
    expect(s.commit()).toEqual([]);
  });

  it('7 h days: the end can shrink to one day, not below', () => {
    const s = sessionOf(task(oct(19, 9), oct(20, 17)), timingOf(SEVEN));
    expect(s.handleKey(shiftLeft)).toMatchObject({ changed: true });
    expect(s.state.end).toEqual(oct(19, 17));
    expect(s.handleKey(shiftLeft)).toMatchObject({ changed: false });
    expect(s.state.end).toEqual(oct(19, 17));
  });

  it('half Friday: → from Thursday lands on Friday, then on Monday, at the shift start', () => {
    const s = sessionOf(task(oct(15, 9), oct(15, 17)), timingOf(FRIDAY_HALF));
    s.handleKey(right);
    expect(s.state.start).toEqual(oct(16, 9));
    expect(s.state.end).toEqual(oct(19, 13)); // the 8 working hours: Friday’s 4 and Monday’s first 4
    s.handleKey(right);
    expect(s.state.start).toEqual(oct(19, 9));
    expect(s.state.end).toEqual(oct(19, 17));
  });

  it('half Friday: ⇧→ from Thursday 17:00 ends at the end of Friday’s shift', () => {
    const s = sessionOf(task(oct(14, 9), oct(15, 17)), timingOf(FRIDAY_HALF));
    s.handleKey(shiftRight);
    expect(s.state.end).toEqual(oct(16, 13));
    s.handleKey(shiftLeft);
    expect(s.state.end).toEqual(oct(15, 17));
  });

  it('half Friday: ⌥→ shrinks a Thursday–Friday task to Friday alone (4 h), but not a Thursday to half a day', () => {
    const s = sessionOf(task(oct(15, 9), oct(16, 13)), timingOf(FRIDAY_HALF));
    expect(s.handleKey(altRight)).toMatchObject({ changed: true });
    expect(s.state.start).toEqual(oct(16, 9));
    const thursday = sessionOf(task(oct(14, 9), oct(15, 17)), timingOf(FRIDAY_HALF));
    expect(thursday.handleKey(shiftLeft)).toMatchObject({ changed: true });
    expect(thursday.state.end).toEqual(oct(14, 17));
    expect(thursday.handleKey(shiftLeft)).toMatchObject({ changed: false });
  });
});

describe('without a calendar: unchanged', () => {
  const plain = timingOf({});
  const bare: DragTiming = { ...plain, dates: undefined, calendar: undefined };
  const script: KeyLike[] = [right, right, shiftRight, left, altLeft, shiftLeft, altRight, right];

  it('the same keys give the same states, previews, events and change', () => {
    const t = task(oct(14), oct(19));
    const a = sessionOf(t, bare);
    const b = sessionOf(t, plain);
    for (const k of script) {
      expect(b.handleKey(k)).toEqual(a.handleKey(k));
      expect(b.state).toEqual(a.state);
    }
    expect(b.dates?.calendar).toBeNull();
    expect(keyboardEditChange(b, t)).toEqual(keyboardEditChange(a, t));
    expect(b.commit()).toEqual(a.commit());
  });

  it('amounts are the snap units', () => {
    const s = sessionOf(task(oct(16), oct(17)), plain);
    s.handleKey(right);
    expect(s.state.start).toEqual(oct(17));
    expect(s.commit()).toMatchObject([{ kind: 'drag', event: { daysMoved: 1 } }]);
  });
});
