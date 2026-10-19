// ─────────────────────────────────────────────────────────────
//  Tests — interaction/keyboard-edit.ts, Phase 11 step 2.6: a move-mode
//  commit as one `GanttChange` (`keyboardEditChange`: source, coalesce
//  key, field updates, the same ops as `commit()`), the options from
//  `editRules` (`keyboardEditOptionsFor`), ↑ / ↓ progress and the
//  move-mode help text. Runs under test:tz (dates from new Date(y, m, d)).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { addDays, dateToPixel } from '../gantt-math';
import { flattenTree } from '../gantt-data';
import { DEFAULT_LABELS, type GanttTask } from '../types';
import { resolveConfig } from '../render/config';
import { resizeEdge, type DragTiming } from '../render/drag';
import { taskSpan } from '../render/timeline';
import { editRules } from '../editing/permissions';
import {
  DEFAULT_PROGRESS_STEP,
  KeyboardEditSession,
  keyboardEditChange,
  keyboardEditOptionsFor,
  keyboardEditStartText,
} from '../interaction/keyboard-edit';

const day = (m: number, d: number, h = 0) => new Date(2026, m, d, h);
const origin = day(0, 1);
const timing = (snap: 'day' | 'hour' = 'day'): DragTiming => {
  const pxPerDay = snap === 'hour' ? 240 : 20;
  return {
    pxPerDay,
    toX: d => dateToPixel(d, origin, pxPerDay),
    span: (start, end) => taskSpan({ start, end }, { endDateMode: 'exclusive', normalizeDateOnly: true }),
    snap,
  };
};
const row = { y: 40, height: 32 };
const TASK: GanttTask = { id: 'a', name: 'Design', start: day(2, 10), end: day(2, 14), progress: 40 };

/** A session on `task` after `steps`. */
function edited(steps: Parameters<KeyboardEditSession['apply']>[0][], task = TASK, snap: 'day' | 'hour' = 'day') {
  const s = new KeyboardEditSession(task, row, timing(snap));
  for (const step of steps) s.apply(step);
  return s;
}

describe('keyboardEditChange', () => {
  it('a move: start and end, source keyboard, coalesce key kbd:<id>, the drag op of commit()', () => {
    const s = edited([
      { mode: 'move', delta: 1 },
      { mode: 'move', delta: 2 },
    ]);
    const change = keyboardEditChange(s, TASK)!;
    expect(change.source).toBe('keyboard');
    expect(change.coalesceKey).toBe('kbd:a');
    expect(change.column).toBeUndefined();
    expect(change.updates).toEqual([
      {
        taskId: 'a',
        before: { start: day(2, 10), end: day(2, 14) },
        after: { start: day(2, 13), end: day(2, 17) },
      },
    ]);
    const events = s.commit();
    expect(change.ops).toEqual(events.map(e => ({ op: e.kind === 'drag' ? 'move' : e.kind, event: e.event })));
    expect(change.ops).toEqual([
      {
        op: 'move',
        event: {
          taskId: 'a',
          oldStart: day(2, 10),
          oldEnd: day(2, 14),
          newStart: day(2, 13),
          newEnd: day(2, 17),
          daysMoved: 3,
        },
      },
    ]);
  });

  it('a resize of either edge: only that field, one resize op with its edge', () => {
    const end = edited([{ mode: 'resizeEnd', delta: 2 }]);
    const endChange = keyboardEditChange(end, TASK)!;
    expect(endChange.updates).toEqual([{ taskId: 'a', before: { end: day(2, 14) }, after: { end: day(2, 16) } }]);
    expect(endChange.ops).toMatchObject([{ op: 'resize', event: { edge: 'end', handle: 'right', daysDelta: 2 } }]);

    const start = edited([{ mode: 'resizeStart', delta: -3 }]);
    const startChange = keyboardEditChange(start, TASK)!;
    expect(startChange.updates).toEqual([{ taskId: 'a', before: { start: day(2, 10) }, after: { start: day(2, 7) } }]);
    expect(startChange.ops).toMatchObject([{ op: 'resize', event: { edge: 'start', handle: 'left', daysDelta: -3 } }]);
    expect(startChange.ops.map(o => o.event)).toEqual(start.commit().map(e => e.event));
  });

  it('a move and a resize by different amounts: one update, a move then a resize of the end (as commit())', () => {
    const s = edited([
      { mode: 'move', delta: 2 },
      { mode: 'resizeEnd', delta: 1 },
    ]);
    const change = keyboardEditChange(s, TASK)!;
    expect(change.updates).toEqual([
      { taskId: 'a', before: { start: day(2, 10), end: day(2, 14) }, after: { start: day(2, 12), end: day(2, 17) } },
    ]);
    expect(change.ops.map(o => o.op)).toEqual(['move', 'resize']);
    expect(change.ops.map(o => o.event)).toEqual(s.commit().map(e => e.event));
  });

  it('↑ / ↓: the progress, one progress op (alone or after the dates)', () => {
    const up = edited([
      { mode: 'progress', delta: 1 },
      { mode: 'progress', delta: 1 },
    ]);
    expect(keyboardEditChange(up, TASK)).toMatchObject({
      updates: [{ taskId: 'a', before: { progress: 40 }, after: { progress: 50 } }],
      ops: [{ op: 'progress', event: { taskId: 'a', oldProgress: 40, newProgress: 50 } }],
    });

    const both = edited([
      { mode: 'progress', delta: -1 },
      { mode: 'move', delta: 1 },
    ]);
    const change = keyboardEditChange(both, TASK)!;
    expect(change.ops.map(o => o.op)).toEqual(['move', 'progress']);
    expect(change.ops.map(o => o.event)).toEqual(both.commit().map(e => e.event));
  });

  it('a task without progress: 0 is no change, a step up is', () => {
    const { progress: _, ...bare } = TASK;
    expect(keyboardEditChange(edited([{ mode: 'move', delta: 1 }], bare), bare)?.updates[0]?.after).toEqual({
      start: day(2, 11),
      end: day(2, 15),
    });
    const up = keyboardEditChange(edited([{ mode: 'progress', delta: 1 }], bare), bare)!;
    expect(up.updates).toEqual([{ taskId: 'a', before: { progress: undefined }, after: { progress: 5 } }]);
    expect(up.ops).toEqual([{ op: 'progress', event: { taskId: 'a', oldProgress: 0, newProgress: 5 } }]);
  });

  it('null: nothing changed, back where it started, cancelled, or another task', () => {
    expect(keyboardEditChange(edited([]), TASK)).toBeNull();
    expect(
      keyboardEditChange(
        edited([
          { mode: 'move', delta: 2 },
          { mode: 'move', delta: -2 },
        ]),
        TASK,
      ),
    ).toBeNull();
    const cancelled = edited([{ mode: 'move', delta: 2 }]);
    cancelled.cancel();
    expect(keyboardEditChange(cancelled, TASK)).toBeNull();
    expect(keyboardEditChange(edited([{ mode: 'move', delta: 2 }]), { ...TASK, id: 'b' })).toBeNull();
  });

  it('works after commit(), which keeps the edited state', () => {
    const s = edited([{ mode: 'move', delta: 1 }]);
    const before = keyboardEditChange(s, TASK);
    s.commit();
    expect(s.finished).toBe(true);
    expect(keyboardEditChange(s, TASK)).toEqual(before);
  });

  it('hour scales: hour steps, the same ops as commit()', () => {
    const task: GanttTask = { ...TASK, start: day(2, 10, 9), end: day(2, 10, 17) };
    const s = edited([{ mode: 'move', delta: 2 }], task, 'hour');
    const change = keyboardEditChange(s, task)!;
    expect(change.updates[0]?.after).toEqual({ start: day(2, 10, 11), end: day(2, 10, 19) });
    expect(change.ops.map(o => o.event)).toEqual(s.commit().map(e => e.event));
    expect(change.ops[0]?.op === 'move' && change.ops[0].event.daysMoved).toBeCloseTo(2 / 24, 10);
  });

  it('keeps UTC date-only values date-only (addDays)', () => {
    const task: GanttTask = {
      ...TASK,
      start: new Date(Date.UTC(2026, 2, 10)),
      end: new Date(Date.UTC(2026, 2, 14)),
    };
    const change = keyboardEditChange(edited([{ mode: 'move', delta: 3 }], task), task)!;
    expect(change.updates[0]?.after).toEqual({ start: addDays(task.start, 3), end: addDays(task.end, 3) });
    expect((change.updates[0]?.after.start as Date).getUTCHours()).toBe(0);
  });

  it('commit() still reports resizes with their edge', () => {
    const [ev] = edited([{ mode: 'resizeStart', delta: 1 }]).commit();
    expect(ev?.kind === 'resize' && ev.event.edge).toBe(resizeEdge('left'));
  });
});

describe('keyboardEditOptionsFor', () => {
  const ON = { progress: { step: 10 } } as const;

  it('maps the rules and the progress step', () => {
    expect(keyboardEditOptionsFor({ move: true, resize: true, progress: true }, ON)).toEqual({
      movable: true,
      resizable: true,
      progressEditable: true,
      progressStep: 10,
    });
    expect(keyboardEditOptionsFor({ move: true, resize: false, progress: false }, { progress: false })).toEqual({
      movable: true,
      resizable: false,
      progressEditable: false,
      progressStep: DEFAULT_PROGRESS_STEP,
    });
    expect(keyboardEditOptionsFor({ move: false, resize: false, progress: true }, ON)).toMatchObject({
      movable: false,
      progressEditable: true,
    });
  });

  it('null when the bar can change nothing: Enter / F2 does not start move mode', () => {
    expect(keyboardEditOptionsFor({ move: false, resize: false, progress: false }, ON)).toBeNull();
  });

  it('from editRules: editing off keeps today (move + resize, no progress); read-only, locked rows', () => {
    const tasks: GanttTask[] = [
      TASK,
      { id: 'm', name: 'Gate', start: day(2, 20), end: day(2, 20), type: 'milestone' },
      { id: 'ro', name: 'Fixed', start: day(2, 1), end: day(2, 3), editable: false },
      { id: 'pin', name: 'Pinned', start: day(2, 1), end: day(2, 3), draggable: false, progress: 10 },
    ];
    const rows = new Map(flattenTree(tasks).map(r => [r.task.id, r]));
    const options = (id: string, editing: boolean, enableDrag = true) => {
      const config = resolveConfig({ editing });
      return keyboardEditOptionsFor(
        editRules(rows.get(id)!, { config, enableDrag, enableResize: true }),
        config.editing,
      );
    };
    expect(options('a', false)).toEqual({
      movable: true,
      resizable: true,
      progressEditable: false,
      progressStep: DEFAULT_PROGRESS_STEP,
    });
    expect(options('a', true)).toMatchObject({ movable: true, resizable: true, progressEditable: true });
    expect(options('m', true)).toMatchObject({ movable: true, resizable: false, progressEditable: false });
    expect(options('ro', true)).toBeNull();
    expect(options('pin', false)).toBeNull();
    expect(options('pin', true)).toMatchObject({ movable: false, resizable: false, progressEditable: true });
    expect(options('a', false, false)).toBeNull();
  });

  it('a session built with them: ↑ / ↓ change the progress by the step, only when allowed', () => {
    const on = new KeyboardEditSession(
      TASK,
      row,
      timing(),
      keyboardEditOptionsFor({ move: true, resize: true, progress: true }, ON)!,
    );
    expect(on.handleKey({ key: 'ArrowUp' })).toMatchObject({ type: 'step', changed: true, preview: { progress: 50 } });
    const off = new KeyboardEditSession(
      TASK,
      row,
      timing(),
      keyboardEditOptionsFor({ move: true, resize: true, progress: false }, { progress: false })!,
    );
    expect(off.handleKey({ key: 'ArrowUp' })).toMatchObject({
      type: 'step',
      changed: false,
      preview: { progress: 40 },
    });
    expect(keyboardEditChange(off, TASK)).toBeNull();
  });
});

describe('keyboardEditStartText', () => {
  it('adds the progress help when ↑ / ↓ change the progress', () => {
    expect(keyboardEditStartText('Design', false, DEFAULT_LABELS)).toBe(DEFAULT_LABELS.announceEditStart('Design'));
    expect(keyboardEditStartText('Design', true, DEFAULT_LABELS)).toBe(
      `${DEFAULT_LABELS.announceEditStart('Design')} Up and Down change the progress.`,
    );
    expect(
      keyboardEditStartText('X', true, { announceEditStart: n => `Edit ${n}.`, announceEditProgressHelp: 'Arrows!' }),
    ).toBe('Edit X. Arrows!');
  });
});
