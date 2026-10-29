// ─────────────────────────────────────────────────────────────
//  Tests — Phase 13 step 2.4: the ops of an edit under a working
//  calendar (plan D13 / D14 / D29): a change that keeps the measured
//  length of both edges is one `move` (`deriveOps`, `taskChange`,
//  `dragChange`, `prepareChange`: one `task-dragged`, no
//  `task-resized`), consecutive moves merge into one, undo inverts
//  it, and `editing.validate` gets the working calendar. Without a
//  calendar everything is what it was. October 2026: Monday the 12th,
//  Friday the 16th, Monday the 19th, Wednesday the 21st a holiday.
//  Dates are built with `new Date(y, m, d, …)` (`pnpm test:tz`).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LABELS,
  applyChange,
  dateShiftDays,
  deriveOps,
  dragChange,
  invertChange,
  isEmptyChange,
  mergeChanges,
  prepareChange,
  progressChange,
  resolveConfig,
  taskChange,
  type GanttChange,
  type GanttOptions,
  type GanttTask,
  type GanttTaskUpdate,
  type PrepareChangeContext,
  type TaskDragEvent,
  type WorkingCalendar,
} from '../index';

const oct = (day: number, h = 0): Date => new Date(2026, 9, day, h);
const HOLIDAY = oct(21);

const WORK: GanttOptions = { calendar: true, nonWorkingTime: { holidays: [HOLIDAY] } };
const CALENDAR_DAYS: GanttOptions = { calendar: { durations: 'calendar' }, nonWorkingTime: { holidays: [HOLIDAY] } };
const working = resolveConfig(WORK);
const calendarDays = resolveConfig(CALENDAR_DAYS);
const none = resolveConfig({});

const task = (start: Date, end: Date, id = 'a'): GanttTask => ({ id, name: id, start, end });
const dragEvent = (t: GanttTask, newStart: Date, newEnd: Date, daysMoved: number): TaskDragEvent => ({
  taskId: t.id,
  oldStart: t.start,
  oldEnd: t.end ?? t.start,
  newStart,
  newEnd,
  daysMoved,
});
const ctxOf = (options: GanttOptions, tasks: readonly GanttTask[]): PrepareChangeContext => ({
  tasks,
  config: resolveConfig(options),
  labels: DEFAULT_LABELS,
});
const prepared = (change: GanttChange, options: GanttOptions, tasks: readonly GanttTask[]) => {
  const r = prepareChange(change, ctxOf(options, tasks));
  if (!r.ok) throw new Error(`rejected: ${r.code} ${r.message}`);
  return r;
};

// Wednesday – Friday 00:00 (two working days) moved to Friday – Tuesday 00:00 (Friday and Monday)
const T = task(oct(14), oct(16));
const MOVED = { start: oct(16), end: oct(20) };
const update = (before: Partial<GanttTask>, after: Partial<GanttTask>): GanttTaskUpdate => ({
  taskId: 'a',
  before,
  after,
});
const moveUpdate = update({ start: oct(14), end: oct(16) }, { start: oct(16), end: oct(20) });

describe('deriveOps', () => {
  it('working durations: both edges with the same working length are one move', () => {
    const ops = deriveOps([moveUpdate], [T], working);
    expect(ops).toEqual([
      {
        op: 'move',
        event: { taskId: 'a', oldStart: oct(14), oldEnd: oct(16), newStart: oct(16), newEnd: oct(20), daysMoved: 2 },
      },
    ]);
  });

  it('a different working length is a move + a resize, as before', () => {
    const longer = update({ start: oct(14), end: oct(16) }, { start: oct(16), end: oct(21) });
    expect(deriveOps([longer], [T], working).map(o => o.op)).toEqual(['move', 'resize']);
  });

  it('calendar durations measure calendar days: the widened bar is a move + a resize', () => {
    expect(deriveOps([moveUpdate], [T], calendarDays).map(o => o.op)).toEqual(['move', 'resize']);
  });

  it('equal calendar shifts are a move whatever the calendar', () => {
    const shifted = update({ start: oct(14), end: oct(16) }, { start: oct(15), end: oct(17) });
    for (const dates of [working, calendarDays, none]) {
      expect(deriveOps([shifted], [T], dates).map(o => o.op)).toEqual(['move']);
    }
  });

  it('one edge is a resize whatever the calendar', () => {
    const end = update({ end: oct(16) }, { end: oct(20) });
    for (const dates of [working, calendarDays, none]) {
      expect(deriveOps([end], [T], dates)).toMatchObject([{ op: 'resize', event: { edge: 'end', daysDelta: 4 } }]);
    }
  });

  it('without dates, or without a calendar, it is today’s derivation', () => {
    const cases: GanttTaskUpdate[] = [
      moveUpdate,
      update({ start: oct(14), end: oct(16) }, { start: oct(15), end: oct(17) }),
      update({ start: oct(14), end: oct(16) }, { start: oct(15), end: oct(21) }),
      update({ start: oct(14) }, { start: oct(12) }),
      update({ progress: 10 }, { progress: 20 }),
    ];
    for (const u of cases) {
      expect(deriveOps([u], [T], none)).toEqual(deriveOps([u], [T]));
      expect(deriveOps([u], [T], undefined)).toEqual(deriveOps([u], [T]));
    }
  });
});

describe('taskChange and dragChange', () => {
  it('taskChange derives with the dates it is given', () => {
    const withDates = taskChange(T, MOVED, 'cell', { dates: working });
    expect(withDates.ops.map(o => o.op)).toEqual(['move']);
    const without = taskChange(T, MOVED, 'cell');
    expect(without.ops.map(o => o.op)).toEqual(['move', 'resize']);
    expect(taskChange(T, MOVED, 'cell', { dates: none })).toEqual(without);
  });

  it('a drag under a calendar is one move with the drag’s amount', () => {
    const event = dragEvent(T, oct(16), oct(20), 2);
    const change = dragChange(event, T, 'drag', working);
    expect(change.ops).toEqual([{ op: 'move', event }]);
    expect(change.source).toBe('drag');
    expect(change.updates).toEqual([moveUpdate]);
  });

  it('a drag is a move even when the working length changed', () => {
    const event = dragEvent(T, oct(16), oct(21), 2);
    const change = dragChange(event, T, 'drag', working);
    expect(change.ops).toEqual([{ op: 'move', event }]);
  });

  it('keeps the event’s amount: the calendar shift of the start', () => {
    const friday = task(oct(16), oct(17));
    const event = dragEvent(friday, oct(19), oct(20), dateShiftDays(oct(16), oct(19)));
    expect(event.daysMoved).toBe(3);
    expect(dragChange(event, friday, 'drag', working).ops).toMatchObject([{ op: 'move', event: { daysMoved: 3 } }]);
  });

  it('a resize event under a calendar stays a resize with its amount', () => {
    const resize = {
      taskId: 'a',
      edge: 'end' as const,
      handle: 'right' as const,
      oldStart: oct(14),
      oldEnd: oct(16),
      newStart: oct(14),
      newEnd: oct(17),
      daysDelta: 1,
    };
    expect(dragChange(resize, T, 'drag', working).ops).toMatchObject([
      { op: 'resize', event: { edge: 'end', daysDelta: 1 } },
    ]);
  });

  it('without dates it is today’s dragChange', () => {
    const event = dragEvent(T, oct(16), oct(20), 2);
    expect(dragChange(event, T, 'drag').ops.map(o => o.op)).toEqual(['move', 'resize']);
    expect(dragChange(event, T, 'drag', none)).toEqual(dragChange(event, T, 'drag'));
    const equal = dragEvent(T, oct(15), oct(17), 1);
    expect(dragChange(equal, T, 'drag', none)).toEqual(dragChange(equal, T, 'drag'));
    expect(dragChange(equal, T, 'drag', working)).toEqual(dragChange(equal, T, 'drag'));
  });
});

describe('prepareChange', () => {
  it('a working move fires one task-dragged and no task-resized', () => {
    const change = dragChange(dragEvent(T, oct(16), oct(20), 2), T, 'drag', working);
    const r = prepared(change, WORK, [T]);
    expect(r.events.map(e => e.type)).toEqual(['task-dragged', 'task-updated']);
  });

  it('derives the ops of a change that has none with the config', () => {
    const bare: GanttChange = { source: 'api', updates: [moveUpdate], ops: [] };
    expect(prepared(bare, WORK, [T]).events.map(e => e.type)).toEqual(['task-dragged', 'task-updated']);
    expect(prepared(bare, CALENDAR_DAYS, [T]).events.map(e => e.type)).toEqual([
      'task-dragged',
      'task-resized',
      'task-updated',
    ]);
    expect(prepared(bare, {}, [T]).events.map(e => e.type)).toEqual(['task-dragged', 'task-resized', 'task-updated']);
  });

  it('announces the move in the start’s calendar days', () => {
    const change = dragChange(dragEvent(T, oct(16), oct(20), 2), T, 'drag', working);
    expect(prepared(change, WORK, [T]).announcement).toMatch(/2 days later/);
  });

  it('applies the new dates', () => {
    const change = dragChange(dragEvent(T, oct(16), oct(20), 2), T, 'drag', working);
    const r = prepared(change, WORK, [T]);
    expect(r.proposed).toEqual([{ ...T, start: oct(16), end: oct(20) }]);
  });
});

describe('merging working moves', () => {
  // Wed 14 – Fri 16 (2 working days) → Fri 16 – Tue 20 → Mon 19 – Wed 21 → Tue 20 – Fri 23
  const t0 = T;
  const t1 = task(oct(16), oct(20));
  const t2 = task(oct(19), oct(21));
  const m1 = dragChange(dragEvent(t0, t1.start, t1.end, 2), t0, 'keyboard', working);
  const m2 = dragChange(dragEvent(t1, t2.start, t2.end, 3), t1, 'keyboard', working);
  const m3 = dragChange(dragEvent(t2, oct(20), oct(23), 1), t2, 'keyboard', working);

  it('two moves are one move, not a move + a resize', () => {
    const merged = mergeChanges(m1, m2);
    expect(merged.updates).toEqual([update({ start: oct(14), end: oct(16) }, { start: oct(19), end: oct(21) })]);
    expect(merged.ops).toEqual([
      {
        op: 'move',
        event: { taskId: 'a', oldStart: oct(14), oldEnd: oct(16), newStart: oct(19), newEnd: oct(21), daysMoved: 5 },
      },
    ]);
  });

  it('three moves fold into one, from the first old dates to the last new ones', () => {
    const merged = mergeChanges(mergeChanges(m1, m2), m3);
    expect(merged.updates).toEqual([update({ start: oct(14), end: oct(16) }, { start: oct(20), end: oct(23) })]);
    expect(merged.ops).toEqual([
      {
        op: 'move',
        event: { taskId: 'a', oldStart: oct(14), oldEnd: oct(16), newStart: oct(20), newEnd: oct(23), daysMoved: 6 },
      },
    ]);
    const other = mergeChanges(m1, mergeChanges(m2, m3));
    expect(other.ops).toEqual(merged.ops);
    expect(other.updates).toEqual(merged.updates);
  });

  it('a single working move stays one move when a non-date change is merged in', () => {
    // Move mode: ← → then ↑, one coalesce key; a move that widens over the weekend is not a move + a resize
    const progress = progressChange({ taskId: 'a', oldProgress: 0, newProgress: 5 }, t1, 'keyboard');
    const merged = mergeChanges(m1, progress);
    expect(merged.ops.map(o => o.op)).toEqual(['move', 'progress']);
    expect(merged.ops[0]).toEqual({
      op: 'move',
      event: { taskId: 'a', oldStart: oct(14), oldEnd: oct(16), newStart: oct(16), newEnd: oct(20), daysMoved: 2 },
    });
    expect(invertChange(merged, 'undo').ops.map(o => o.op)).toEqual(['progress', 'move']);
    // the same with the progress first
    expect(
      mergeChanges(progressChange({ taskId: 'a', oldProgress: 0, newProgress: 5 }, t0, 'keyboard'), m1).ops.map(
        o => o.op,
      ),
    ).toEqual(['move', 'progress']);
  });

  it('moves that end where they started merge into nothing', () => {
    const back = dragChange(dragEvent(t1, t0.start, t0.end, -2), t1, 'keyboard', working);
    expect(isEmptyChange(mergeChanges(m1, back))).toBe(true);
  });

  it('a move then a resize reads as the net change, as before', () => {
    const resize = taskChange(t1, { end: oct(21) }, 'keyboard', { dates: working });
    const merged = mergeChanges(m1, resize);
    expect(merged.ops.map(o => o.op)).toEqual(['move', 'resize']);
  });

  it('keeps the first source, the last coalesce key', () => {
    const merged = mergeChanges({ ...m1, coalesceKey: 'k1' }, { ...m2, coalesceKey: 'k2' });
    expect(merged.source).toBe('keyboard');
    expect(merged.coalesceKey).toBe('k2');
  });

  it('without a calendar two moves are the one move they always were', () => {
    const a = task(oct(14), oct(16));
    const b = task(oct(15), oct(17));
    const first = dragChange(dragEvent(a, b.start, b.end, 1), a, 'drag');
    const second = dragChange(dragEvent(b, oct(18), oct(20), 3), b, 'drag');
    const merged = mergeChanges(first, second);
    expect(merged.ops).toEqual([
      {
        op: 'move',
        event: { taskId: 'a', oldStart: oct(14), oldEnd: oct(16), newStart: oct(18), newEnd: oct(20), daysMoved: 4 },
      },
    ]);
  });
});

describe('undo and redo', () => {
  const change = dragChange(dragEvent(T, oct(16), oct(20), 2), T, 'drag', working);

  it('inverts to one move back, and restores the dates', () => {
    const undo = invertChange(change, 'undo');
    expect(undo.ops).toEqual([
      {
        op: 'move',
        event: { taskId: 'a', oldStart: oct(16), oldEnd: oct(20), newStart: oct(14), newEnd: oct(16), daysMoved: -2 },
      },
    ]);
    const after = applyChange([T], change);
    expect(applyChange(after, undo)).toEqual([T]);
  });

  it('undo through the pipeline fires one task-dragged with the negated amount', () => {
    const after = applyChange([T], change);
    const r = prepared(invertChange(change, 'undo'), WORK, after);
    expect(r.events.map(e => e.type)).toEqual(['task-dragged', 'task-updated']);
    expect(r.events[0]?.detail).toMatchObject({ daysMoved: -2 });
    const redo = prepared(change, WORK, [T]);
    expect(redo.change.ops).toEqual(change.ops);
  });
});

describe('editing.validate receives the working calendar (D29)', () => {
  const change = dragChange(dragEvent(T, oct(16), oct(20), 2), T, 'drag', working);

  it('a calendar when there is one, null when there is none', () => {
    const seen: (WorkingCalendar | null | undefined)[] = [];
    const validate = (_c: GanttChange, ctx: { calendar?: WorkingCalendar | null | undefined }) => {
      seen.push(ctx.calendar);
      return true;
    };
    prepared(change, { ...WORK, editing: { validate } }, [T]);
    prepared(change, { editing: { validate } }, [T]);
    expect(seen[0]).not.toBeNull();
    expect(seen[0]?.isWorkingDay(oct(21))).toBe(false);
    expect(seen[0]?.isWorkingDay(oct(22))).toBe(true);
    expect(seen[1]).toBeNull();
  });

  it('an app rule: no task starts on a holiday', () => {
    const noHolidayStarts = (c: GanttChange, ctx: { calendar?: WorkingCalendar | null | undefined }) => {
      const starts = c.updates.map(u => u.after.start).filter((d): d is Date => d instanceof Date);
      return starts.every(d => ctx.calendar?.isWorkingDay(d) ?? true) || 'No work on a holiday';
    };
    const options: GanttOptions = { ...WORK, editing: { validate: noHolidayStarts } };
    const long = task(oct(14), oct(24));
    const onHoliday = taskChange(long, { start: HOLIDAY }, 'api', { dates: working });
    const r = prepareChange(onHoliday, ctxOf(options, [long]));
    expect(r).toMatchObject({ ok: false, code: 'custom', message: 'No work on a holiday' });
    expect(prepareChange(change, ctxOf(options, [T])).ok).toBe(true);
    // the same rule without a calendar has nothing to ask
    expect(prepareChange(onHoliday, ctxOf({ editing: { validate: noHolidayStarts } }, [long])).ok).toBe(true);
  });
});
