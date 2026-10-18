// ─────────────────────────────────────────────────────────────
//  Tests — interaction/keyboard-edit.ts (keyboard move / resize / progress)
//  (runs under test:tz: dates are built with new Date(y, m, d, h))
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { dateToPixel } from '../gantt-math';
import { DragSession, type DragTiming } from '../render/drag';
import { taskSpan } from '../render/timeline';
import { KeyboardEditSession, keyboardEditAction, type KeyboardEditTask } from '../interaction/keyboard-edit';
import { announceKeyboardEdit } from '../interaction/announce';

const day = (m: number, d: number, h = 0) => new Date(2026, m, d, h);
const origin = day(0, 1);
const timing = (snap: 'day' | 'hour' = 'day', endDateMode: 'exclusive' | 'inclusive' = 'exclusive'): DragTiming => {
  const pxPerDay = snap === 'hour' ? 240 : 20;
  return {
    pxPerDay,
    toX: d => dateToPixel(d, origin, pxPerDay),
    span: (start, end) => taskSpan({ start, end }, { endDateMode, normalizeDateOnly: true }),
    snap,
  };
};
const row = { y: 40, height: 32 };
const task: KeyboardEditTask = { id: 'a', start: day(2, 10), end: day(2, 14), progress: 40 };

describe('keyboardEditAction', () => {
  it('maps arrows, modifiers, Enter / F2 and Escape', () => {
    expect(keyboardEditAction({ key: 'ArrowRight' })).toEqual({ mode: 'move', delta: 1 });
    expect(keyboardEditAction({ key: 'ArrowLeft' })).toEqual({ mode: 'move', delta: -1 });
    expect(keyboardEditAction({ key: 'ArrowRight', shiftKey: true })).toEqual({ mode: 'resizeEnd', delta: 1 });
    expect(keyboardEditAction({ key: 'ArrowLeft', altKey: true })).toEqual({ mode: 'resizeStart', delta: -1 });
    expect(keyboardEditAction({ key: 'ArrowUp' })).toEqual({ mode: 'progress', delta: 1 });
    expect(keyboardEditAction({ key: 'ArrowDown' })).toEqual({ mode: 'progress', delta: -1 });
    expect(keyboardEditAction({ key: 'Enter' })).toBe('commit');
    expect(keyboardEditAction({ key: 'F2' })).toBe('commit');
    expect(keyboardEditAction({ key: 'Escape' })).toBe('cancel');
    expect(keyboardEditAction({ key: 'ArrowRight', ctrlKey: true })).toBeNull();
    expect(keyboardEditAction({ key: 'ArrowRight', shiftKey: true, altKey: true })).toBeNull();
    expect(keyboardEditAction({ key: 'x' })).toBeNull();
  });

  it('time runs right to left in RTL', () => {
    expect(keyboardEditAction({ key: 'ArrowLeft' }, { rtl: true })).toEqual({ mode: 'move', delta: 1 });
    expect(keyboardEditAction({ key: 'ArrowRight', shiftKey: true }, { rtl: true })).toEqual({
      mode: 'resizeEnd',
      delta: -1,
    });
  });
});

describe('KeyboardEditSession — same results as DragSession', () => {
  it('move by N days emits the DragSession drag event', () => {
    const s = new KeyboardEditSession(task, row, timing());
    s.apply({ mode: 'move', delta: 1 });
    s.apply({ mode: 'move', delta: 2 });
    const drag = new DragSession('a', 'bar', task.start, task.end ?? task.start, 0, row, timing());
    const expected = drag.finish(3 * 20);
    expect(s.preview()).toEqual({ ...drag.preview(3 * 20), progress: 40, changed: true });
    expect(s.commit()).toEqual([expected]);
    expect(expected?.kind === 'drag' && expected.event.newStart).toEqual(day(2, 13));
  });

  it('Shift resizes the end, Alt the start — the DragSession resize events', () => {
    const end = new KeyboardEditSession(task, row, timing());
    end.apply({ mode: 'resizeEnd', delta: 2 });
    expect(end.commit()).toEqual([
      new DragSession('a', 'right', task.start, task.end ?? task.start, 0, row, timing()).finish(40),
    ]);

    const start = new KeyboardEditSession(task, row, timing());
    start.apply({ mode: 'resizeStart', delta: -3 });
    const [ev] = start.commit();
    expect(ev).toEqual(new DragSession('a', 'left', task.start, task.end ?? task.start, 0, row, timing()).finish(-60));
    expect(ev?.kind === 'resize' && ev.event).toMatchObject({ handle: 'left', newStart: day(2, 7), daysDelta: -3 });
  });

  it('keeps at least one unit when shrinking (exclusive and inclusive ends)', () => {
    const s = new KeyboardEditSession(task, row, timing());
    expect(s.apply({ mode: 'resizeEnd', delta: -10 })).toBe(true);
    expect(s.state.end).toEqual(day(2, 11));
    expect(s.apply({ mode: 'resizeEnd', delta: -1 })).toBe(false);
    expect(s.apply({ mode: 'resizeStart', delta: 1 })).toBe(false);

    // inclusive: a one-day task (start == end) cannot shrink further
    const one = new KeyboardEditSession(
      { id: 'b', start: day(2, 10), end: day(2, 10) },
      row,
      timing('day', 'inclusive'),
    );
    expect(one.apply({ mode: 'resizeEnd', delta: -1 })).toBe(false);
    expect(one.apply({ mode: 'resizeStart', delta: 1 })).toBe(false);
    expect(one.apply({ mode: 'resizeEnd', delta: 1 })).toBe(true);
    expect(one.state.end).toEqual(day(2, 11));
  });

  it('snaps to hours on hour scales (daysMoved in days, like DragSession)', () => {
    const t = { id: 'h', start: day(2, 10, 9), end: day(2, 10, 12) };
    const s = new KeyboardEditSession(t, row, timing('hour'));
    s.apply({ mode: 'move', delta: 2 });
    const [ev] = s.commit();
    expect(ev).toEqual(new DragSession('h', 'bar', t.start, t.end, 0, row, timing('hour')).finish(20));
    expect(ev?.kind === 'drag' && ev.event).toMatchObject({ newStart: day(2, 10, 11), daysMoved: 2 / 24 });
  });

  it('moves by calendar days across DST changes', () => {
    const t = { id: 'd', start: day(9, 1), end: day(9, 5) };
    const s = new KeyboardEditSession(t, row, timing());
    s.apply({ mode: 'move', delta: 40 });
    expect(s.state).toMatchObject({ start: day(10, 10), end: day(10, 14) });
    expect(s.preview().width).toBe(80);
  });

  it('keeps date-only (UTC midnight) values date-only, like addDays', () => {
    const t = { id: 'u', start: new Date(Date.UTC(2026, 2, 10)), end: new Date(Date.UTC(2026, 2, 12)) };
    const s = new KeyboardEditSession(t, row, timing());
    s.apply({ mode: 'move', delta: 1 });
    expect(s.state.start).toEqual(new Date(Date.UTC(2026, 2, 11)));
    expect(s.state.end).toEqual(new Date(Date.UTC(2026, 2, 13)));
  });
});

describe('KeyboardEditSession — combined edits, progress, commit / cancel', () => {
  it('a move plus a resize becomes a drag then a resize right, chained', () => {
    const s = new KeyboardEditSession(task, row, timing());
    s.apply({ mode: 'move', delta: 2 });
    s.apply({ mode: 'resizeEnd', delta: 3 });
    const events = s.commit();
    expect(events).toHaveLength(2);
    const [drag, resize] = events;
    expect(drag).toEqual({
      kind: 'drag',
      event: {
        taskId: 'a',
        oldStart: day(2, 10),
        oldEnd: day(2, 14),
        newStart: day(2, 12),
        newEnd: day(2, 16),
        daysMoved: 2,
      },
    });
    expect(resize).toEqual({
      kind: 'resize',
      event: {
        taskId: 'a',
        handle: 'right',
        oldStart: day(2, 12),
        oldEnd: day(2, 16),
        newStart: day(2, 12),
        newEnd: day(2, 19),
        daysDelta: 3,
      },
    });
  });

  it('moving back to the start emits nothing', () => {
    const s = new KeyboardEditSession(task, row, timing());
    s.apply({ mode: 'move', delta: 2 });
    s.apply({ mode: 'move', delta: -2 });
    expect(s.state.changed).toBe(false);
    expect(s.commit()).toEqual([]);
  });

  it('progress changes by 5 (configurable), clamped to 0–100', () => {
    const s = new KeyboardEditSession({ ...task, progress: 97 }, row, timing());
    expect(s.apply({ mode: 'progress', delta: 1 })).toBe(true);
    expect(s.state.progress).toBe(100);
    expect(s.apply({ mode: 'progress', delta: 1 })).toBe(false);
    s.apply({ mode: 'progress', delta: -2 });
    expect(s.commit()).toEqual([{ kind: 'progress', event: { taskId: 'a', oldProgress: 97, newProgress: 90 } }]);

    const ten = new KeyboardEditSession({ id: 'p', start: day(2, 1), end: day(2, 2) }, row, timing(), {
      progressStep: 10,
    });
    ten.apply({ mode: 'progress', delta: 1 });
    expect(ten.state.progress).toBe(10);
  });

  it('honours movable / resizable / progressEditable', () => {
    const s = new KeyboardEditSession(task, row, timing(), {
      movable: false,
      resizable: false,
      progressEditable: false,
    });
    expect(s.apply({ mode: 'move', delta: 1 })).toBe(false);
    expect(s.apply({ mode: 'resizeEnd', delta: 1 })).toBe(false);
    expect(s.apply({ mode: 'resizeStart', delta: -1 })).toBe(false);
    expect(s.apply({ mode: 'progress', delta: 1 })).toBe(false);
    expect(s.commit()).toEqual([]);
  });

  it('resizable implies movable: no drag event for a task that must not be dragged', () => {
    const s = new KeyboardEditSession(task, row, timing(), { movable: false, resizable: true });
    expect(s.apply({ mode: 'resizeStart', delta: -1 })).toBe(false);
    expect(s.apply({ mode: 'resizeEnd', delta: 2 })).toBe(false);
    expect(s.commit()).toEqual([]);
  });

  it('a milestone with the pointer-parity options cannot be resized or get progress', () => {
    const milestone = { id: 'm', start: day(2, 10), end: day(2, 10) };
    const kind = 'milestone' as 'task' | 'milestone' | 'group';
    const movable = true;
    const s = new KeyboardEditSession(milestone, row, timing(), {
      movable,
      resizable: movable && kind === 'task',
      progressEditable: kind !== 'milestone',
    });
    expect(s.apply({ mode: 'resizeEnd', delta: 1 })).toBe(false);
    expect(s.apply({ mode: 'resizeStart', delta: -1 })).toBe(false);
    expect(s.apply({ mode: 'progress', delta: 1 })).toBe(false);
    expect(s.apply({ mode: 'move', delta: 1 })).toBe(true);
    expect(s.commit().map(e => e.kind)).toEqual(['drag']);
  });

  it('handleKey runs steps, commit and cancel; the session ends after either', () => {
    const s = new KeyboardEditSession(task, row, timing());
    expect(s.handleKey({ key: 'ArrowRight' })).toMatchObject({ type: 'step', changed: true, preview: { delta: 1 } });
    expect(s.handleKey({ key: 'ArrowUp' })).toMatchObject({
      type: 'step',
      changed: true,
      preview: { delta: 1, progress: 45, changed: true },
    });
    expect(s.handleKey({ key: 'x' })).toBeNull();
    const done = s.handleKey({ key: 'Enter' });
    expect(done?.type === 'commit' && done.events.map(e => e.kind)).toEqual(['drag', 'progress']);
    expect(s.finished).toBe(true);
    expect(s.handleKey({ key: 'ArrowRight' })).toBeNull();
    expect(s.commit()).toEqual([]);

    const c = new KeyboardEditSession(task, row, timing());
    c.handleKey({ key: 'ArrowRight', shiftKey: true });
    expect(c.handleKey({ key: 'Escape' })).toEqual({ type: 'cancel' });
    expect(c.state).toMatchObject({ start: task.start, end: task.end, progress: 40, changed: false });
    expect(c.apply({ mode: 'move', delta: 1 })).toBe(false);
  });

  it('preview follows the edited dates', () => {
    const s = new KeyboardEditSession(task, row, timing());
    const before = s.preview();
    s.apply({ mode: 'resizeEnd', delta: 2 });
    const after = s.preview();
    expect(after.x).toBe(before.x);
    expect(after.width).toBe(before.width + 40);
    expect(after).toMatchObject({ taskId: 'a', y: 40, height: 32, delta: 2, unit: 'day', daysDelta: 2 });
    expect(before).toMatchObject({ progress: 40, changed: false });
    s.apply({ mode: 'progress', delta: 1 });
    expect(s.preview()).toMatchObject({ delta: 2, progress: 45, changed: true });
  });

  it('a rejected step leaves preview() unchanged', () => {
    const s = new KeyboardEditSession({ ...task, progress: 100 }, row, timing());
    s.apply({ mode: 'resizeEnd', delta: 3 });
    const before = s.preview();
    expect(before.delta).toBe(3);
    expect(s.apply({ mode: 'progress', delta: 1 })).toBe(false); // already 100 %
    expect(s.preview()).toEqual(before);

    // start moved to one day before the end: a further shrink of the end is rejected
    const short = new KeyboardEditSession(task, row, timing());
    expect(short.apply({ mode: 'resizeStart', delta: 3 })).toBe(true);
    const shortBefore = short.preview();
    expect(short.apply({ mode: 'resizeEnd', delta: -1 })).toBe(false);
    expect(short.preview()).toEqual(shortBefore);
    expect(shortBefore.delta).toBe(3);

    const fixed = new KeyboardEditSession(task, row, timing(), { movable: false });
    expect(fixed.apply({ mode: 'move', delta: 1 })).toBe(false);
    expect(fixed.preview().delta).toBe(0);
  });

  it('preview() after cancel equals the initial preview', () => {
    const s = new KeyboardEditSession(task, row, timing());
    const initial = s.preview();
    s.apply({ mode: 'resizeEnd', delta: 3 });
    s.apply({ mode: 'progress', delta: -1 });
    s.cancel();
    expect(s.preview()).toEqual(initial);
  });

  it('exposes the snap unit so announcements never mix days and hours', () => {
    const t = { id: 'h', start: day(2, 10, 9), end: day(2, 10, 12) };
    const s = new KeyboardEditSession(t, row, timing('hour'));
    expect(s.unit).toBe('hour');
    s.apply({ mode: 'move', delta: 7 });
    s.apply({ mode: 'resizeEnd', delta: 17 });
    const events = s.commit();
    expect(announceKeyboardEdit(events, 'X', undefined, s.unit)).toBe(
      'X start moved 7 hours later. X end moved 24 hours later',
    );
    // without the unit the sentence still uses one unit
    expect(announceKeyboardEdit(events, 'X')).toBe('X start moved 7 hours later. X end moved 24 hours later');

    const whole = new KeyboardEditSession(t, row, timing('hour'));
    whole.apply({ mode: 'move', delta: 24 });
    expect(announceKeyboardEdit(whole.commit(), 'X', undefined, whole.unit)).toBe('X moved 24 hours later');
  });
});

describe('KeyboardEditSession — preview dates (DragPreview.start / end)', () => {
  it('the preview carries the edited task dates, like state', () => {
    const s = new KeyboardEditSession(task, row, timing());
    expect(s.preview()).toMatchObject({ start: task.start, end: task.end });
    s.apply({ mode: 'move', delta: 2 });
    s.apply({ mode: 'resizeEnd', delta: 1 });
    expect(s.preview()).toMatchObject({ start: day(2, 12), end: day(2, 17) });
    expect(s.preview().start).toEqual(s.state.start);
    expect(s.preview().end).toEqual(s.state.end);
  });

  it('the dates match the events commit() emits (drag then resize)', () => {
    const s = new KeyboardEditSession(task, row, timing());
    s.apply({ mode: 'resizeStart', delta: -2 });
    s.apply({ mode: 'resizeEnd', delta: 3 });
    const { start, end } = s.preview();
    const events = s.commit();
    expect(start).toEqual(events[0]?.kind === 'drag' && events[0].event.newStart);
    const lastEvent = events.at(-1);
    expect(end).toEqual(lastEvent?.kind === 'resize' && lastEvent.event.newEnd);
  });

  it('a move gives the same dates as the pointer preview', () => {
    const s = new KeyboardEditSession(task, row, timing('day', 'inclusive'));
    s.apply({ mode: 'move', delta: -4 });
    const pointer = new DragSession('a', 'bar', task.start, task.end ?? task.start, 0, row, timing('day', 'inclusive'));
    const p = pointer.preview(-4 * 20);
    expect(s.preview().start).toEqual(p.start);
    expect(s.preview().end).toEqual(p.end);
  });

  it('hour scales: the dates shift by hours; cancel restores the original dates', () => {
    const t = { id: 'h', start: day(2, 10, 9), end: day(2, 10, 12) };
    const s = new KeyboardEditSession(t, row, timing('hour'));
    s.apply({ mode: 'move', delta: 5 });
    expect(s.preview()).toMatchObject({ start: day(2, 10, 14), end: day(2, 10, 17) });
    s.cancel();
    expect(s.preview()).toMatchObject({ start: t.start, end: t.end });
  });

  it('a milestone (no end) previews start = end', () => {
    const s = new KeyboardEditSession({ id: 'm', start: day(2, 16) }, row, timing());
    s.apply({ mode: 'move', delta: 1 });
    expect(s.preview()).toMatchObject({ start: day(2, 17), end: day(2, 17) });
  });
});
