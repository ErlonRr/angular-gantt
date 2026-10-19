// ─────────────────────────────────────────────────────────────
//  Tests — GanttHistory (Phase 11, D8): undo / redo stacks, the limit,
//  coalescing by key and time, and the history-change state.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import { GanttHistory } from '../editing/history';
import { DEFAULT_COALESCE_MS, DEFAULT_HISTORY_LIMIT } from '../render/config';
import type { GanttChange, GanttHistoryState } from '../types';

/** A progress change of task `id` (`from` → `to`), optionally keyed for coalescing. */
const progress = (id: string, from: number, to: number, coalesceKey?: string): GanttChange => ({
  source: 'progress',
  updates: [{ taskId: id, before: { progress: from }, after: { progress: to } }],
  ops: [{ op: 'progress', event: { taskId: id, oldProgress: from, newProgress: to } }],
  coalesceKey,
});

/** A move of task `id` by `days`, as a move-mode commit (`kbd:<id>`) when `keyed`. */
const move = (id: string, from: [Date, Date], to: [Date, Date], days: number, keyed = false): GanttChange => ({
  source: 'keyboard',
  updates: [{ taskId: id, before: { start: from[0], end: from[1] }, after: { start: to[0], end: to[1] } }],
  ops: [
    {
      op: 'move',
      event: { taskId: id, oldStart: from[0], oldEnd: from[1], newStart: to[0], newEnd: to[1], daysMoved: days },
    },
  ],
  coalesceKey: keyed ? `kbd:${id}` : undefined,
});

const EMPTY: GanttChange = { source: 'api', updates: [], ops: [] };

/** `describe` that names the first update: "a 10→20". */
const label = (c: GanttChange): string => {
  const u = c.updates[0];
  return u ? `${u.taskId} ${String(u.before.progress)}→${String(u.after.progress)}` : '';
};

const counts = (s: GanttHistoryState) => [s.undoCount, s.redoCount];

describe('GanttHistory', () => {
  it('starts empty; undo, redo, drop and clear are no-ops there', () => {
    const h = new GanttHistory();
    const s = h.state;
    expect(s).toEqual({ canUndo: false, canRedo: false, undoLabel: null, redoLabel: null, undoCount: 0, redoCount: 0 });
    expect(h.peekUndo()).toBeNull();
    expect(h.peekRedo()).toBeNull();
    h.commitUndo();
    h.commitRedo();
    h.drop();
    h.clear();
    expect(h.state).toBe(s);
  });

  it('records a change as one step: peekUndo returns it as recorded', () => {
    const h = new GanttHistory({}, label);
    const c = progress('a', 10, 20);
    h.record(c, 0);
    expect(h.peekUndo()).toBe(c);
    expect(h.peekRedo()).toBeNull();
    expect(h.state).toEqual({
      canUndo: true,
      canRedo: false,
      undoLabel: 'a 10→20',
      redoLabel: null,
      undoCount: 1,
      redoCount: 0,
    });
  });

  it('labels a step with the default describe as an empty string (null only on an empty stack)', () => {
    const h = new GanttHistory();
    h.record(progress('a', 10, 20), 0);
    expect(h.state.undoLabel).toBe('');
    expect(h.state.redoLabel).toBeNull();
  });

  it('ignores an empty change and keeps redo', () => {
    const h = new GanttHistory();
    h.record(progress('a', 10, 20), 0);
    h.commitUndo();
    const s = h.state;
    h.record(EMPTY, 10);
    expect(h.state).toBe(s);
    expect(counts(h.state)).toEqual([0, 1]);
  });

  it('commitUndo moves the top onto redo, commitRedo moves it back', () => {
    const h = new GanttHistory({}, label);
    const a = progress('a', 0, 10);
    const b = progress('b', 0, 20);
    h.record(a, 0);
    h.record(b, 5000);

    h.commitUndo();
    expect(h.peekUndo()).toBe(a);
    expect(h.peekRedo()).toBe(b);
    expect(h.state).toMatchObject({ canUndo: true, canRedo: true, undoLabel: 'a 0→10', redoLabel: 'b 0→20' });

    h.commitUndo();
    expect(h.peekUndo()).toBeNull();
    expect(h.peekRedo()).toBe(a);
    expect(counts(h.state)).toEqual([0, 2]);

    h.commitRedo();
    h.commitRedo();
    expect(h.peekUndo()).toBe(b);
    expect(h.peekRedo()).toBeNull();
    expect(counts(h.state)).toEqual([2, 0]);
  });

  it('recording clears redo', () => {
    const h = new GanttHistory();
    h.record(progress('a', 0, 10), 0);
    h.record(progress('a', 10, 20), 5000);
    h.commitUndo();
    h.commitUndo();
    expect(h.state.canRedo).toBe(true);
    h.record(progress('b', 0, 5), 9000);
    expect(h.peekRedo()).toBeNull();
    expect(counts(h.state)).toEqual([1, 0]);
  });

  it('keeps at most `limit` steps, dropping the oldest', () => {
    const h = new GanttHistory({ limit: 3 });
    const steps = [1, 2, 3, 4, 5].map(i => progress(`t${i}`, 0, i));
    steps.forEach((c, i) => h.record(c, i * 1000));
    expect(counts(h.state)).toEqual([3, 0]);
    const undone: GanttChange[] = [];
    for (let c = h.peekUndo(); c; c = h.peekUndo()) {
      undone.push(c);
      h.commitUndo();
    }
    expect(undone).toEqual([steps[4], steps[3], steps[2]]);
  });

  it('defaults: 100 steps; invalid options fall back to them', () => {
    expect(DEFAULT_HISTORY_LIMIT).toBe(100);
    expect(DEFAULT_COALESCE_MS).toBe(800);
    for (const limit of [undefined, 0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const h = new GanttHistory({ limit });
      for (let i = 0; i < 105; i++) h.record(progress('a', i, i + 1), i * 1000);
      expect(h.state.undoCount).toBe(100);
    }
    const whole = new GanttHistory({ limit: 2.7 });
    for (let i = 0; i < 5; i++) whole.record(progress('a', i, i + 1), i * 1000);
    expect(whole.state.undoCount).toBe(2);
  });

  it('drop() discards the undo top and keeps redo', () => {
    const h = new GanttHistory();
    const a = progress('a', 0, 10);
    h.record(a, 0);
    h.record(progress('b', 0, 10), 5000);
    h.record(progress('c', 0, 10), 9000);
    h.commitUndo();
    h.drop();
    expect(h.peekUndo()).toBe(a);
    expect(counts(h.state)).toEqual([1, 1]);
  });

  it('clear() empties both stacks', () => {
    const h = new GanttHistory();
    h.record(progress('a', 0, 10), 0);
    h.record(progress('b', 0, 10), 5000);
    h.commitUndo();
    h.clear();
    expect(h.state).toEqual({
      canUndo: false,
      canRedo: false,
      undoLabel: null,
      redoLabel: null,
      undoCount: 0,
      redoCount: 0,
    });
  });

  it('configure() trims both stacks to the new limit, furthest from the current state first', () => {
    const h = new GanttHistory({ limit: 10 });
    const steps = [0, 1, 2, 3, 4, 5].map(i => progress(`t${i}`, 0, 1));
    steps.forEach((c, i) => h.record(c, i * 1000));
    h.commitUndo();
    h.commitUndo();
    h.commitUndo(); // undo: t0 t1 t2 · redo (top last): t5 t4 t3
    h.configure({ limit: 2 });
    expect(counts(h.state)).toEqual([2, 2]);
    expect(h.peekUndo()).toBe(steps[2]);
    h.commitUndo();
    expect(h.peekUndo()).toBe(steps[1]);
    h.commitUndo();
    expect(h.peekUndo()).toBeNull();
    // the redo stack stays capped at 2 too: it keeps the two steps next to the present
    expect(counts(h.state)).toEqual([0, 2]);
    expect(h.peekRedo()).toBe(steps[1]);
    h.commitRedo();
    expect(h.peekRedo()).toBe(steps[2]);
    h.commitRedo();
    expect(h.peekRedo()).toBeNull();
  });

  it('configure() keeps omitted or invalid fields', () => {
    const h = new GanttHistory({ limit: 3, coalesceMs: 100 });
    h.configure({ coalesceMs: 50 });
    h.configure({ limit: 0, coalesceMs: -1 });
    for (let i = 0; i < 5; i++) h.record(progress('a', i, i + 1), i * 1000);
    expect(h.state.undoCount).toBe(3);
    const s = h.state;
    h.configure({});
    expect(h.state).toBe(s);
  });

  it('records without a coalesce key never merge, even at the same time', () => {
    const h = new GanttHistory();
    h.record(progress('a', 0, 10), 0);
    h.record(progress('a', 10, 20), 0);
    expect(h.state.undoCount).toBe(2);
  });

  describe('state', () => {
    it('is the same object until a value changes', () => {
      const h = new GanttHistory({}, () => 'step');
      const s0 = h.state;
      expect(h.state).toBe(s0);
      h.record(progress('a', 0, 10, 'progress:a'), 0);
      const s1 = h.state;
      expect(s1).not.toBe(s0);
      expect(h.state).toBe(s1);
      h.record(progress('a', 10, 20, 'progress:a'), 100); // merged: same counts, same label
      expect(h.state).toBe(s1);
      h.commitUndo();
      expect(h.state).not.toBe(s1);
    });

    it('calls describe lazily, for the stack tops only', () => {
      const describeFn = vi.fn(label);
      const h = new GanttHistory({}, describeFn);
      for (let i = 0; i < 5; i++) h.record(progress(`t${i}`, 0, 1), i * 1000);
      expect(describeFn).not.toHaveBeenCalled();
      void h.state;
      expect(describeFn).toHaveBeenCalledTimes(1);
      void h.state;
      expect(describeFn).toHaveBeenCalledTimes(1);
      h.commitUndo();
      expect(h.state.redoLabel).toBe('t4 0→1');
      expect(describeFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('coalescing', () => {
    it('merges changes with the same key within coalesceMs: first before, last after', () => {
      const h = new GanttHistory({}, label);
      h.record(progress('a', 10, 15, 'progress:a'), 0);
      h.record(progress('a', 15, 20, 'progress:a'), 300);
      h.record(progress('a', 20, 30, 'progress:a'), 700);
      expect(h.state.undoCount).toBe(1);
      const step = h.peekUndo()!;
      expect(step.updates).toEqual([{ taskId: 'a', before: { progress: 10 }, after: { progress: 30 } }]);
      expect(step.ops).toEqual([{ op: 'progress', event: { taskId: 'a', oldProgress: 10, newProgress: 30 } }]);
      expect(step.coalesceKey).toBe('progress:a');
      expect(h.state.undoLabel).toBe('a 10→30');
    });

    it('the window slides with each merged record', () => {
      const h = new GanttHistory();
      for (let i = 0; i < 6; i++) h.record(progress('a', i, i + 1, 'progress:a'), i * 700);
      expect(h.state.undoCount).toBe(1);
    });

    it('a change coalesceMs or more after the last record starts a new step', () => {
      const h = new GanttHistory();
      h.record(progress('a', 0, 5, 'progress:a'), 0);
      h.record(progress('a', 5, 10, 'progress:a'), DEFAULT_COALESCE_MS);
      expect(h.state.undoCount).toBe(2);
      h.record(progress('a', 10, 15, 'progress:a'), DEFAULT_COALESCE_MS * 2 - 1);
      expect(h.state.undoCount).toBe(2);
    });

    it('honours a custom coalesceMs; 0 never merges; invalid falls back to 800', () => {
      const custom = new GanttHistory({ coalesceMs: 100 });
      custom.record(progress('a', 0, 5, 'k'), 0);
      custom.record(progress('a', 5, 10, 'k'), 99);
      custom.record(progress('a', 10, 15, 'k'), 199);
      expect(custom.state.undoCount).toBe(2);

      const never = new GanttHistory({ coalesceMs: 0 });
      never.record(progress('a', 0, 5, 'k'), 0);
      never.record(progress('a', 5, 10, 'k'), 0);
      expect(never.state.undoCount).toBe(2);

      const fallback = new GanttHistory({ coalesceMs: -5 });
      fallback.record(progress('a', 0, 5, 'k'), 0);
      fallback.record(progress('a', 5, 10, 'k'), 799);
      expect(fallback.state.undoCount).toBe(1);
    });

    it('different keys, or a keyed change after an unkeyed one, make separate steps', () => {
      const h = new GanttHistory();
      h.record(progress('a', 0, 5, 'progress:a'), 0);
      h.record(progress('b', 0, 5, 'progress:b'), 100);
      h.record(progress('b', 5, 10), 200);
      h.record(progress('b', 10, 15, 'progress:b'), 300);
      expect(h.state.undoCount).toBe(4);
    });

    it('a clock going backwards never merges', () => {
      const h = new GanttHistory();
      h.record(progress('a', 0, 5, 'k'), 1000);
      h.record(progress('a', 5, 10, 'k'), 900);
      expect(h.state.undoCount).toBe(2);
    });

    it('merges move-mode commits of one bar into one step with the first and last dates', () => {
      const d = (day: number) => new Date(2026, 9, day);
      const h = new GanttHistory();
      h.record(move('a', [d(5), d(9)], [d(6), d(10)], 1, true), 0);
      h.record(move('a', [d(6), d(10)], [d(7), d(11)], 1, true), 400);
      expect(h.state.undoCount).toBe(1);
      expect(h.peekUndo()!.updates).toEqual([
        { taskId: 'a', before: { start: d(5), end: d(9) }, after: { start: d(7), end: d(11) } },
      ]);
    });

    it('a merge that ends where the step started removes the step (redo stays cleared)', () => {
      const h = new GanttHistory();
      h.record(progress('z', 0, 1), 0);
      h.commitUndo();
      h.record(progress('a', 10, 20, 'progress:a'), 1000);
      h.record(progress('a', 20, 10, 'progress:a'), 1200);
      expect(h.state).toMatchObject({ canUndo: false, canRedo: false, undoCount: 0, redoCount: 0 });
      // the next change of that key is a step of its own
      h.record(progress('a', 10, 30, 'progress:a'), 1300);
      expect(h.state.undoCount).toBe(1);
      expect(h.peekUndo()!.updates[0].before).toEqual({ progress: 10 });
    });

    it('never merges into a step reached by undo, redo or drop', () => {
      const afterUndo = new GanttHistory();
      afterUndo.record(progress('a', 0, 5, 'k'), 0);
      afterUndo.record(progress('b', 0, 5, 'other'), 100);
      afterUndo.commitUndo();
      afterUndo.record(progress('a', 5, 10, 'k'), 200);
      expect(counts(afterUndo.state)).toEqual([2, 0]);

      const afterRedo = new GanttHistory();
      afterRedo.record(progress('a', 0, 5, 'k'), 0);
      afterRedo.commitUndo();
      afterRedo.commitRedo();
      afterRedo.record(progress('a', 5, 10, 'k'), 100);
      expect(afterRedo.state.undoCount).toBe(2);

      const afterDrop = new GanttHistory();
      afterDrop.record(progress('a', 0, 5, 'k'), 0);
      afterDrop.record(progress('b', 0, 5, 'other'), 100);
      afterDrop.drop();
      afterDrop.record(progress('a', 5, 10, 'k'), 200);
      expect(afterDrop.state.undoCount).toBe(2);
    });
  });
});
