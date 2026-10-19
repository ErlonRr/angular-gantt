// ─────────────────────────────────────────────────────────────
//  Tests — editing/changes.ts (Phase 11, D4): building changes from
//  task patches, drags, progress and links; the derived ops matrix
//  (move / resize / move + resize / progress / link / unlink); applying
//  with identity kept; invert ∘ invert = id with the data shape
//  restored; merging for history coalescing.
//  (runs under test:tz: dates are built with new Date(y, m, d, h) or
//  addDays, so assertions hold in any time zone and across DST)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  applicableChange,
  applyChange,
  changeTaskIds,
  deriveOps,
  dragChange,
  invertChange,
  isEmptyChange,
  linkChange,
  mergeChanges,
  progressChange,
  taskChange,
} from '../editing/changes';
import { addDays } from '../gantt-math';
import type { GanttChange, GanttChangeOp, GanttTask } from '../types';

const d = (m: number, day: number, h = 0) => new Date(2026, m, day, h);
const addHours = (date: Date, h: number) => new Date(date.getTime() + h * 3_600_000);

const task = (id: string, extra: Partial<GanttTask> = {}): GanttTask => ({
  id,
  name: id.toUpperCase(),
  start: d(2, 2),
  end: d(2, 6),
  ...extra,
});

const kinds = (ops: readonly GanttChangeOp[]) => ops.map(o => o.op);

describe('taskChange', () => {
  it('keeps only the changed fields, with their old values in `before`', () => {
    const t = task('a', { progress: 40 });
    const c = taskChange(t, { start: new Date(t.start.getTime()), progress: 60, name: 'A' }, 'api');
    expect(c.source).toBe('api');
    // same start time and same name: dropped
    expect(c.updates).toEqual([{ taskId: 'a', before: { progress: 40 }, after: { progress: 60 } }]);
    expect(c.ops).toEqual([{ op: 'progress', event: { taskId: 'a', oldProgress: 40, newProgress: 60 } }]);
    expect('column' in c).toBe(false);
    expect('coalesceKey' in c).toBe(false);
  });

  it('records `undefined` for a field that was not set, and ignores `id`', () => {
    const c = taskChange(task('a'), { id: 'b', barColor: 'red' }, 'api');
    expect(c.updates).toHaveLength(1);
    const u = c.updates[0];
    expect(u.after).toEqual({ barColor: 'red' });
    expect(Object.keys(u.before)).toEqual(['barColor']);
    expect(u.before.barColor).toBeUndefined();
  });

  it('nothing changed → an empty change', () => {
    const t = task('a', { data: { owner: 'x', tags: ['p'] }, dependency: 'z' });
    const c = taskChange(
      t,
      { data: { owner: 'x', tags: ['p'] }, dependency: [{ taskId: 'z', type: 'FS', lag: 0 }] },
      'api',
    );
    expect(isEmptyChange(c)).toBe(true);
    expect(c.updates).toEqual([]);
    expect(c.ops).toEqual([]);
  });

  it('compares plain objects by content', () => {
    const t = task('a', { data: { owner: 'x' } });
    const c = taskChange(t, { data: { owner: 'y' } }, 'api');
    expect(c.updates[0]?.after).toEqual({ data: { owner: 'y' } });
    expect(c.ops).toEqual([]);
  });

  it('a cell edit gets the column and the coalesce key `cell:<id>:<col>`', () => {
    const c = taskChange(task('a'), { name: 'Alpha' }, 'cell', { column: 'name' });
    expect(c.column).toBe('name');
    expect(c.coalesceKey).toBe('cell:a:name');
    const keyed = taskChange(task('a'), { name: 'Alpha' }, 'cell', { column: 'name', coalesceKey: 'mine' });
    expect(keyed.coalesceKey).toBe('mine');
    expect(taskChange(task('a'), { name: 'Alpha' }, 'api', { column: 'name' }).coalesceKey).toBeUndefined();
  });
});

describe('deriveOps', () => {
  const t = task('a');

  it('equal shifts → move', () => {
    const ops = deriveOps(
      [{ taskId: 'a', before: { start: t.start, end: t.end }, after: { start: d(2, 4), end: d(2, 8) } }],
      [t],
    );
    expect(ops).toEqual([
      {
        op: 'move',
        event: { taskId: 'a', oldStart: d(2, 2), oldEnd: d(2, 6), newStart: d(2, 4), newEnd: d(2, 8), daysMoved: 2 },
      },
    ]);
  });

  it('only the start → resize of the start (old end from `tasksBefore`)', () => {
    const ops = deriveOps([{ taskId: 'a', before: { start: t.start }, after: { start: d(1, 27) } }], [t]);
    expect(ops).toEqual([
      {
        op: 'resize',
        event: {
          taskId: 'a',
          edge: 'start',
          handle: 'left',
          oldStart: d(2, 2),
          oldEnd: d(2, 6),
          newStart: d(1, 27),
          newEnd: d(2, 6),
          daysDelta: -3,
        },
      },
    ]);
  });

  it('only the end → resize of the end', () => {
    const ops = deriveOps([{ taskId: 'a', before: { end: t.end }, after: { end: d(2, 9) } }], [t]);
    expect(ops).toHaveLength(1);
    const op = ops[0];
    expect(op.op).toBe('resize');
    if (op.op !== 'resize') return;
    expect(op.event).toMatchObject({ edge: 'end', handle: 'right', newStart: d(2, 2), newEnd: d(2, 9), daysDelta: 3 });
  });

  it('both edges by different amounts → move by the start, then resize of the end', () => {
    const ops = deriveOps(
      [{ taskId: 'a', before: { start: t.start, end: t.end }, after: { start: d(2, 3), end: d(2, 10) } }],
      [t],
    );
    expect(ops).toEqual([
      {
        op: 'move',
        event: { taskId: 'a', oldStart: d(2, 2), oldEnd: d(2, 6), newStart: d(2, 3), newEnd: d(2, 7), daysMoved: 1 },
      },
      {
        op: 'resize',
        event: {
          taskId: 'a',
          edge: 'end',
          handle: 'right',
          oldStart: d(2, 3),
          oldEnd: d(2, 7),
          newStart: d(2, 3),
          newEnd: d(2, 10),
          daysDelta: 3,
        },
      },
    ]);
  });

  it('hour shifts read as hours / 24', () => {
    const s = d(2, 2, 9);
    const e = d(2, 2, 17);
    const ops = deriveOps(
      [{ taskId: 'h', before: { start: s, end: e }, after: { start: addHours(s, 5), end: addHours(e, 5) } }],
      [],
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: 'move', event: { daysMoved: 5 / 24 } });
  });

  it('a day move stays whole days in every month (DST changes included)', () => {
    for (let m = 0; m < 12; m++) {
      for (const h of [0, 9]) {
        const s = new Date(2026, m, 1, h);
        const e = new Date(2026, m, 12, h);
        const ops = deriveOps(
          [{ taskId: 'x', before: { start: s, end: e }, after: { start: addDays(s, 30), end: addDays(e, 30) } }],
          [],
        );
        expect(ops, `month ${m} at ${h}h`).toHaveLength(1);
        expect(ops[0], `month ${m} at ${h}h`).toMatchObject({ op: 'move', event: { daysMoved: 30 } });
      }
    }
  });

  it('an hour move is one move in every month (DST changes included)', () => {
    for (let m = 0; m < 12; m++) {
      const s = new Date(2026, m, 1, 22);
      const e = new Date(2026, m, 20, 22);
      const ops = deriveOps(
        [{ taskId: 'x', before: { start: s, end: e }, after: { start: addHours(s, 30), end: addHours(e, 30) } }],
        [],
      );
      expect(kinds(ops), `month ${m}`).toEqual(['move']);
    }
  });

  it('UTC date-only values move by whole days', () => {
    const s = new Date('2026-03-27');
    const e = new Date('2026-04-03');
    const ops = deriveOps(
      [{ taskId: 'u', before: { start: s, end: e }, after: { start: addDays(s, 4), end: addDays(e, 4) } }],
      [],
    );
    expect(ops[0]).toMatchObject({ op: 'move', event: { daysMoved: 4 } });
  });

  it('a task without an end is read as ending at its start', () => {
    const ops = deriveOps(
      [{ taskId: 'm', before: { start: d(2, 2) }, after: { start: d(2, 5) } }],
      [{ id: 'm', name: 'M', start: d(2, 2) } as GanttTask],
    );
    expect(ops[0]).toMatchObject({ op: 'move', event: { daysMoved: 3 } });
  });

  it('progress → progress (unset reads 0; 0 → unset is no op)', () => {
    expect(deriveOps([{ taskId: 'a', before: { progress: undefined }, after: { progress: 30 } }], [t])).toEqual([
      { op: 'progress', event: { taskId: 'a', oldProgress: 0, newProgress: 30 } },
    ]);
    expect(deriveOps([{ taskId: 'a', before: { progress: 0 }, after: { progress: undefined } }], [t])).toEqual([]);
  });

  it('dependencies → unlink for each removed link, then link for each added one', () => {
    const ops = deriveOps(
      [
        {
          taskId: 'b',
          before: { dependency: ['a', 'c'] as unknown as GanttTask['dependency'] },
          after: { dependency: [{ taskId: 'c' }, { taskId: 'a', type: 'SS', lag: 2 }, { taskId: 'd' }] },
        },
      ],
      [],
    );
    expect(ops).toEqual([
      { op: 'unlink', event: { fromId: 'a', toId: 'b', type: 'FS', lag: 0 } },
      { op: 'link', event: { fromId: 'a', toId: 'b', type: 'SS', lag: 2 } },
      { op: 'link', event: { fromId: 'd', toId: 'b', type: 'FS', lag: 0 } },
    ]);
  });

  it('per update: dates, then progress, then links; updates in order', () => {
    const ops = deriveOps(
      [
        {
          taskId: 'a',
          before: { start: t.start, end: t.end, progress: 0, dependency: undefined },
          after: { start: d(2, 3), end: d(2, 7), progress: 50, dependency: 'z' },
        },
        { taskId: 'b', before: { progress: 10 }, after: { progress: 20 } },
      ],
      [t],
    );
    expect(kinds(ops)).toEqual(['move', 'progress', 'link', 'progress']);
  });
});

describe('linkChange', () => {
  const tasks = [
    task('a'),
    task('b'),
    task('c', { dependency: 'a' }),
    task('d', { dependency: [{ taskId: 'a' }, { taskId: 'b', type: 'SS' }] }),
  ];

  it('adding writes an array of objects (a string id becomes { taskId })', () => {
    const toB = linkChange(tasks, { fromId: 'a', toId: 'b' }, 'link', 'link');
    expect(toB.updates).toEqual([
      { taskId: 'b', before: { dependency: undefined }, after: { dependency: [{ taskId: 'a', type: 'FS', lag: 0 }] } },
    ]);
    expect(toB.ops).toEqual([{ op: 'link', event: { fromId: 'a', toId: 'b', type: 'FS', lag: 0 } }]);

    const toC = linkChange(tasks, { fromId: 'b', toId: 'c', type: 'SS', lag: -1 }, 'link', 'api');
    expect(toC.updates[0]?.before).toEqual({ dependency: 'a' });
    expect(toC.updates[0]?.after).toEqual({ dependency: [{ taskId: 'a' }, { taskId: 'b', type: 'SS', lag: -1 }] });
    expect(toC.ops).toEqual([{ op: 'link', event: { fromId: 'b', toId: 'c', type: 'SS', lag: -1 } }]);
  });

  it('removing filters, keeps the other entries as they were, and empties to undefined', () => {
    const fromC = linkChange(tasks, { fromId: 'a', toId: 'c' }, 'unlink', 'delete');
    expect(fromC.updates).toEqual([{ taskId: 'c', before: { dependency: 'a' }, after: { dependency: undefined } }]);
    expect(fromC.ops).toEqual([{ op: 'unlink', event: { fromId: 'a', toId: 'c', type: 'FS', lag: 0 } }]);

    const fromD = linkChange(tasks, { fromId: 'a', toId: 'd' }, 'unlink', 'api');
    const kept = fromD.updates[0]?.after.dependency as unknown[];
    expect(kept).toEqual([{ taskId: 'b', type: 'SS' }]);
    expect(kept[0]).toBe((tasks[3].dependency as unknown[])[1]);
  });

  it('removing by type only matches that type; no match → empty change', () => {
    expect(isEmptyChange(linkChange(tasks, { fromId: 'b', toId: 'd', type: 'FS' }, 'unlink', 'api'))).toBe(true);
    expect(linkChange(tasks, { fromId: 'b', toId: 'd', type: 'SS' }, 'unlink', 'api').ops).toEqual([
      { op: 'unlink', event: { fromId: 'b', toId: 'd', type: 'SS', lag: 0 } },
    ]);
    expect(isEmptyChange(linkChange(tasks, { fromId: 'c', toId: 'a' }, 'unlink', 'api'))).toBe(true);
  });

  it('removing without a type removes every link between the two tasks', () => {
    const multi = [task('a'), task('b', { dependency: [{ taskId: 'a' }, { taskId: 'a', type: 'SS', lag: 1 }] })];
    const c = linkChange(multi, { fromId: 'a', toId: 'b' }, 'unlink', 'api');
    expect(c.updates[0]?.after).toEqual({ dependency: undefined });
    expect(kinds(c.ops)).toEqual(['unlink', 'unlink']);
  });

  it('a missing successor gives the op and no update', () => {
    const c = linkChange(tasks, { fromId: 'a', toId: 'nope' }, 'link', 'api');
    expect(c.updates).toEqual([]);
    expect(c.ops).toEqual([{ op: 'link', event: { fromId: 'a', toId: 'nope', type: 'FS', lag: 0 } }]);
    expect(isEmptyChange(c)).toBe(false);
  });
});

describe('dragChange and progressChange', () => {
  it('a drop keeps the session amounts of a move or a same-edge resize', () => {
    const t = task('a', { start: d(2, 2, 9), end: d(2, 2, 17) });
    const move = dragChange(
      {
        taskId: 'a',
        oldStart: t.start,
        oldEnd: t.end,
        newStart: addHours(t.start, 3),
        newEnd: addHours(t.end, 3),
        daysMoved: 3 / 24,
      },
      t,
      'drag',
    );
    expect(move.source).toBe('drag');
    expect(move.updates).toEqual([
      {
        taskId: 'a',
        before: { start: t.start, end: t.end },
        after: { start: addHours(t.start, 3), end: addHours(t.end, 3) },
      },
    ]);
    expect(move.ops).toEqual([
      {
        op: 'move',
        event: {
          taskId: 'a',
          oldStart: t.start,
          oldEnd: t.end,
          newStart: addHours(t.start, 3),
          newEnd: addHours(t.end, 3),
          daysMoved: 3 / 24,
        },
      },
    ]);

    const resize = dragChange(
      {
        taskId: 'a',
        edge: 'end',
        handle: 'right',
        oldStart: t.start,
        oldEnd: t.end,
        newStart: t.start,
        newEnd: addDays(t.end, 2),
        daysDelta: 2,
      },
      t,
      'resize',
    );
    expect(resize.updates[0]?.after).toEqual({ end: addDays(t.end, 2) });
    expect(resize.ops).toEqual([
      {
        op: 'resize',
        event: {
          taskId: 'a',
          edge: 'end',
          handle: 'right',
          oldStart: t.start,
          oldEnd: t.end,
          newStart: t.start,
          newEnd: addDays(t.end, 2),
          daysDelta: 2,
        },
      },
    ]);
  });

  it('a drop that changes nothing is empty', () => {
    const t = task('a');
    const c = dragChange(
      { taskId: 'a', oldStart: t.start, oldEnd: t.end, newStart: t.start, newEnd: t.end, daysMoved: 0 },
      t,
      'drag',
    );
    expect(isEmptyChange(c)).toBe(true);
  });

  it('progress: the progress grip coalesces by `progress:<id>`', () => {
    const t = task('a', { progress: 20 });
    const grip = progressChange({ taskId: 'a', oldProgress: 20, newProgress: 45 }, t, 'progress');
    expect(grip.updates).toEqual([{ taskId: 'a', before: { progress: 20 }, after: { progress: 45 } }]);
    expect(grip.ops).toEqual([{ op: 'progress', event: { taskId: 'a', oldProgress: 20, newProgress: 45 } }]);
    expect(grip.coalesceKey).toBe('progress:a');
    expect(
      progressChange({ taskId: 'a', oldProgress: 20, newProgress: 45 }, t, 'keyboard').coalesceKey,
    ).toBeUndefined();
  });
});

describe('applyChange', () => {
  interface MyTask extends GanttTask {
    owner: string;
  }
  const tasks: MyTask[] = [
    { ...task('a', { barColor: 'red' }), owner: 'ann' },
    { ...task('b'), owner: 'bob' },
    { ...task('c'), owner: 'cy' },
  ];

  it('patches changed tasks into new objects, keeps the others, skips missing ids', () => {
    const change: GanttChange = {
      source: 'api',
      updates: [
        { taskId: 'a', before: { barColor: 'red', progress: undefined }, after: { barColor: undefined, progress: 10 } },
        { taskId: 'zz', before: { progress: 0 }, after: { progress: 99 } },
      ],
      ops: [],
    };
    const out = applyChange(tasks, change);
    expect(out).not.toBe(tasks);
    expect(out).toHaveLength(3);
    expect(out[0]).not.toBe(tasks[0]);
    expect(out[0]).toEqual({ id: 'a', name: 'A', start: d(2, 2), end: d(2, 6), progress: 10, owner: 'ann' });
    expect('barColor' in out[0]).toBe(false);
    expect(out[1]).toBe(tasks[1]);
    expect(out[2]).toBe(tasks[2]);
    // the input is untouched
    expect(tasks[0].barColor).toBe('red');
  });

  it('applies several updates of one task in order; an empty change gives a copy', () => {
    const change: GanttChange = {
      source: 'api',
      updates: [
        { taskId: 'b', before: { progress: undefined }, after: { progress: 10 } },
        { taskId: 'b', before: { progress: 10 }, after: { progress: 20 } },
      ],
      ops: [],
    };
    expect(applyChange(tasks, change)[1]?.progress).toBe(20);
    const copy = applyChange(tasks, { source: 'api', updates: [], ops: [] });
    expect(copy).not.toBe(tasks);
    expect(copy.every((t, i) => t === tasks[i])).toBe(true);
  });
});

describe('invertChange', () => {
  const dateOnly = task('u', { start: new Date('2026-03-02'), end: new Date('2026-03-06'), progress: 10 });
  const linked = task('l', { dependency: 'u' });
  const tasks = [dateOnly, linked, task('x')];

  const changes: GanttChange[] = [
    dragChange(
      {
        taskId: 'u',
        oldStart: dateOnly.start,
        oldEnd: dateOnly.end,
        newStart: addDays(dateOnly.start, 2),
        newEnd: addDays(dateOnly.end, 2),
        daysMoved: 2,
      },
      dateOnly,
      'drag',
    ),
    taskChange(
      dateOnly,
      { start: addDays(dateOnly.start, 1), end: addDays(dateOnly.end, 4), progress: 50 },
      'keyboard',
      { coalesceKey: 'kbd:u' },
    ),
    linkChange(tasks, { fromId: 'x', toId: 'l', type: 'SF', lag: 3 }, 'link', 'link'),
    linkChange(tasks, { fromId: 'u', toId: 'l' }, 'unlink', 'delete'),
    taskChange(linked, { name: 'Renamed', barColor: 'blue' }, 'cell', { column: 'name' }),
  ];

  it('swaps before / after, reverses the order and inverts each op', () => {
    const c = changes[1];
    const inv = invertChange(c, 'undo');
    expect(inv.source).toBe('undo');
    expect(inv.updates).toEqual([{ taskId: 'u', before: c.updates[0].after, after: c.updates[0].before }]);
    expect(kinds(c.ops)).toEqual(['move', 'resize', 'progress']);
    expect(kinds(inv.ops)).toEqual(['progress', 'resize', 'move']);
    expect(inv.ops[0]).toEqual({ op: 'progress', event: { taskId: 'u', oldProgress: 50, newProgress: 10 } });
    expect(inv.ops[1]).toMatchObject({ op: 'resize', event: { edge: 'end', daysDelta: -3 } });
    expect(inv.ops[2]).toMatchObject({
      op: 'move',
      event: { daysMoved: -1, newStart: dateOnly.start, newEnd: dateOnly.end },
    });
    expect(inv.coalesceKey).toBe('kbd:u');
  });

  it('link ↔ unlink', () => {
    expect(kinds(invertChange(changes[2], 'undo').ops)).toEqual(['unlink']);
    expect(kinds(invertChange(changes[3], 'undo').ops)).toEqual(['link']);
  });

  it('invert ∘ invert = the original change (source aside)', () => {
    for (const c of changes) {
      const twice = invertChange(invertChange(c, 'undo'), 'redo');
      expect(twice).toEqual({ ...c, source: 'redo' });
    }
  });

  it('apply then the inverse restores the tasks exactly: date-only dates and the dependency string', () => {
    for (const c of changes) {
      const back = applyChange(applyChange(tasks, c), invertChange(c, 'undo'));
      expect(back).toEqual(tasks);
    }
    const back = applyChange(applyChange(tasks, changes[3]), invertChange(changes[3], 'undo'));
    expect(back[1]?.dependency).toBe('u');
    const moved = applyChange(applyChange(tasks, changes[0]), invertChange(changes[0], 'undo'));
    expect(moved[0]?.start).toBe(dateOnly.start);
    expect(moved[0]?.start.toISOString()).toBe('2026-03-02T00:00:00.000Z');
  });

  it('never yields -0', () => {
    const c: GanttChange = {
      source: 'api',
      updates: [],
      ops: [
        {
          op: 'move',
          event: { taskId: 'a', oldStart: d(2, 2), oldEnd: d(2, 3), newStart: d(2, 2), newEnd: d(2, 3), daysMoved: 0 },
        },
      ],
    };
    const op = invertChange(c, 'undo').ops[0];
    expect(op?.op === 'move' && Object.is(op.event.daysMoved, 0)).toBe(true);
  });
});

describe('mergeChanges', () => {
  const t = task('a', { progress: 10 });

  it('two moves fold into one; first before, last after', () => {
    const one = taskChange(t, { start: d(2, 3), end: d(2, 7) }, 'keyboard', { coalesceKey: 'kbd:a' });
    const two = taskChange({ ...t, start: d(2, 3), end: d(2, 7) }, { start: d(2, 5), end: d(2, 9) }, 'keyboard', {
      coalesceKey: 'kbd:a',
    });
    const m = mergeChanges(one, two);
    expect(m.source).toBe('keyboard');
    expect(m.coalesceKey).toBe('kbd:a');
    expect(m.updates).toEqual([
      { taskId: 'a', before: { start: d(2, 2), end: d(2, 6) }, after: { start: d(2, 5), end: d(2, 9) } },
    ]);
    expect(m.ops).toEqual([
      {
        op: 'move',
        event: { taskId: 'a', oldStart: d(2, 2), oldEnd: d(2, 6), newStart: d(2, 5), newEnd: d(2, 9), daysMoved: 3 },
      },
    ]);
  });

  it('a change and its way back → empty', () => {
    const there = taskChange(t, { start: d(2, 3), end: d(2, 7), progress: 30 }, 'keyboard');
    const back = taskChange(
      { ...t, start: d(2, 3), end: d(2, 7), progress: 30 },
      { start: d(2, 2), end: d(2, 6), progress: 10 },
      'keyboard',
    );
    expect(isEmptyChange(mergeChanges(there, back))).toBe(true);
  });

  it('progress 10 → 20 → 30 is one progress op 10 → 30', () => {
    const a = progressChange({ taskId: 'a', oldProgress: 10, newProgress: 20 }, t, 'progress');
    const b = progressChange({ taskId: 'a', oldProgress: 20, newProgress: 30 }, { ...t, progress: 20 }, 'progress');
    expect(mergeChanges(a, b).ops).toEqual([
      { op: 'progress', event: { taskId: 'a', oldProgress: 10, newProgress: 30 } },
    ]);
  });

  it('a start-only resize twice keeps the end from the ops', () => {
    const a = taskChange(t, { start: d(2, 1) }, 'cell', { column: 'start' });
    const b = taskChange({ ...t, start: d(2, 1) }, { start: d(1, 27) }, 'cell', { column: 'start' });
    const m = mergeChanges(a, b);
    expect(m.column).toBe('start');
    expect(m.coalesceKey).toBe('cell:a:start');
    expect(m.ops).toEqual([
      {
        op: 'resize',
        event: {
          taskId: 'a',
          edge: 'start',
          handle: 'left',
          oldStart: d(2, 2),
          oldEnd: d(2, 6),
          newStart: d(1, 27),
          newEnd: d(2, 6),
          daysDelta: -3,
        },
      },
    ]);
  });

  it('a move + resize then a move read as their net change', () => {
    const a = taskChange(t, { start: d(2, 3), end: d(2, 9) }, 'keyboard');
    const b = taskChange({ ...t, start: d(2, 3), end: d(2, 9) }, { start: d(2, 4), end: d(2, 10) }, 'keyboard');
    const m = mergeChanges(a, b);
    expect(kinds(m.ops)).toEqual(['move', 'resize']);
    expect(m.ops[0]).toMatchObject({ event: { daysMoved: 2, newEnd: d(2, 8) } });
    expect(m.ops[1]).toMatchObject({ event: { edge: 'end', daysDelta: 2, newEnd: d(2, 10) } });
  });

  it('a link added then removed disappears', () => {
    const tasks = [task('a'), task('b')];
    const add = linkChange(tasks, { fromId: 'a', toId: 'b' }, 'link', 'cell');
    const remove = linkChange(applyChange(tasks, add), { fromId: 'a', toId: 'b' }, 'unlink', 'cell');
    expect(isEmptyChange(mergeChanges(add, remove))).toBe(true);
  });

  it('keeps tasks in first-appearance order', () => {
    const a = taskChange(task('x'), { progress: 5 }, 'api');
    const b = taskChange(task('y'), { progress: 6 }, 'api');
    const c = taskChange({ ...task('x'), progress: 5 }, { progress: 7 }, 'api');
    expect(mergeChanges(mergeChanges(a, b), c).updates.map(u => [u.taskId, u.after.progress])).toEqual([
      ['x', 7],
      ['y', 6],
    ]);
  });
});

describe('applicableChange, changeTaskIds, isEmptyChange', () => {
  const tasks = [task('a'), task('b', { dependency: 'a' })];
  const change: GanttChange = {
    source: 'undo',
    updates: [
      { taskId: 'a', before: { progress: 0 }, after: { progress: 10 } },
      { taskId: 'gone', before: { progress: 0 }, after: { progress: 10 } },
    ],
    ops: [
      { op: 'progress', event: { taskId: 'a', oldProgress: 0, newProgress: 10 } },
      { op: 'progress', event: { taskId: 'gone', oldProgress: 0, newProgress: 10 } },
      { op: 'link', event: { fromId: 'gone', toId: 'b', type: 'FS', lag: 0 } },
    ],
  };

  it('keeps the updates and ops whose tasks all exist', () => {
    const kept = applicableChange(change, tasks);
    expect(kept.updates.map(u => u.taskId)).toEqual(['a']);
    expect(kept.ops).toEqual([change.ops[0]]);
    expect(kept.source).toBe('undo');
    const whole: GanttChange = { ...change, updates: [change.updates[0]], ops: [change.ops[0]] };
    expect(applicableChange(whole, tasks)).toBe(whole);
  });

  it('keeps an unlink whose predecessor is gone (its successor exists)', () => {
    const c: GanttChange = {
      source: 'undo',
      updates: [{ taskId: 'b', before: { dependency: ['gone', 'a'] as never }, after: { dependency: 'a' } }],
      ops: [{ op: 'unlink', event: { fromId: 'gone', toId: 'b', type: 'FS', lag: 0 } }],
    };
    expect(applicableChange(c, tasks)).toBe(c);
  });

  it('drops the links an update would add from tasks that are gone', () => {
    // Undo of "remove gone → b": the predecessor was deleted since
    const undoUnlink: GanttChange = {
      source: 'undo',
      updates: [
        { taskId: 'b', before: { dependency: 'a' }, after: { dependency: [{ taskId: 'gone' }, { taskId: 'a' }] } },
      ],
      ops: [{ op: 'link', event: { fromId: 'gone', toId: 'b', type: 'FS', lag: 0 } }],
    };
    expect(isEmptyChange(applicableChange(undoUnlink, tasks))).toBe(true);

    const mixed: GanttChange = {
      source: 'undo',
      updates: [
        {
          taskId: 'b',
          before: { dependency: 'a', progress: 0 },
          after: { dependency: [{ taskId: 'gone' }], progress: 5 },
        },
      ],
      ops: [],
    };
    expect(applicableChange(mixed, tasks).updates).toEqual([
      { taskId: 'b', before: { dependency: 'a', progress: 0 }, after: { dependency: undefined, progress: 5 } },
    ]);
  });

  it('lists every referenced task once', () => {
    expect(changeTaskIds(change)).toEqual(['a', 'gone', 'b']);
  });

  it('empty = no update and no op', () => {
    expect(isEmptyChange({ source: 'api', updates: [], ops: [] })).toBe(true);
    expect(isEmptyChange({ source: 'api', updates: [], ops: [change.ops[0]] })).toBe(false);
  });
});
