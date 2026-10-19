// ─────────────────────────────────────────────────────────────
//  Tests — editing/pipeline.ts and editing/describe.ts (Phase 11,
//  D5 / D6 / D8 / D10): the events of each op kind in D5 order, the
//  rejection codes and messages, undo / redo over missing tasks, the
//  `before-change` veto detail, and the announcement texts.
//  (runs under test:tz: dates are built with new Date(y, m, d, h))
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { addDays } from '../gantt-math';
import {
  applyChange,
  dragChange,
  invertChange,
  linkChange,
  mergeChanges,
  progressChange,
  taskChange,
} from '../editing/changes';
import { describeChange, fieldLabel } from '../editing/describe';
import {
  createBeforeChangeDetail,
  prepareChange,
  type PrepareChangeContext,
  type PreparedChange,
  type RejectedChange,
} from '../editing/pipeline';
import { resolveConfig } from '../render/config';
import { DEFAULT_LABELS, type GanttChange, type GanttOptions, type GanttTask } from '../types';

const d = (m: number, day: number, h = 0) => new Date(2026, m, day, h);

const TASKS: readonly GanttTask[] = [
  { id: 'design', name: 'Design', start: d(2, 2), end: d(2, 6), progress: 20 },
  { id: 'build', name: 'Build', start: d(2, 9), end: d(2, 13), dependency: 'design' },
  { id: 'phase', name: 'Phase', start: d(2, 2), end: d(2, 20) },
  { id: 'p1', name: 'P1', start: d(2, 2), end: d(2, 5), parentId: 'phase' },
  { id: 'locked', name: 'Locked', start: d(2, 2), end: d(2, 5), editable: false },
];
const task = (id: string) => TASKS.find(t => t.id === id)!;

const ctx = (options: GanttOptions = {}, tasks: readonly GanttTask[] = TASKS): PrepareChangeContext => ({
  tasks,
  config: resolveConfig(options),
  labels: DEFAULT_LABELS,
});

function ok(r: PreparedChange | RejectedChange): PreparedChange {
  if (!r.ok) throw new Error(`rejected: ${r.code} ${r.message}`);
  return r;
}

const types = (r: PreparedChange) => r.events.map(e => e.type);

const moveDesign = (days: number, source: GanttChange['source'] = 'drag') => {
  const t = task('design');
  return dragChange(
    {
      taskId: 'design',
      oldStart: t.start,
      oldEnd: t.end,
      newStart: addDays(t.start, days),
      newEnd: addDays(t.end, days),
      daysMoved: days,
    },
    t,
    source,
  );
};

describe('prepareChange — events in D5 order', () => {
  it('move → task-dragged, task-updated; the proposed tasks keep untouched identities', () => {
    const change = moveDesign(2);
    const r = ok(prepareChange(change, ctx()));
    expect(r.change).toBe(change);
    expect(types(r)).toEqual(['task-dragged', 'task-updated']);
    expect(r.events[0]?.detail).toBe(change.ops[0]?.event);
    expect(r.proposed).toEqual(applyChange(TASKS, change));
    expect(r.proposed.slice(1).every((t, i) => t === TASKS[i + 1])).toBe(true);
    expect(r.events[1]).toEqual({
      type: 'task-updated',
      detail: { taskId: 'design', task: r.proposed[0], previous: TASKS[0], fields: ['start', 'end'], source: 'drag' },
    });
    expect(r.announcement).toBe('Design moved 2 days later');
  });

  it('resize → task-resized, task-updated', () => {
    const t = task('design');
    const r = ok(prepareChange(taskChange(t, { end: d(2, 8) }, 'resize'), ctx()));
    expect(types(r)).toEqual(['task-resized', 'task-updated']);
    expect(r.events[0]?.detail).toMatchObject({ edge: 'end', handle: 'right', daysDelta: 2 });
    expect(r.announcement).toBe('Design end moved 2 days later');
  });

  it('progress → task-progress-changed, task-updated', () => {
    const r = ok(
      prepareChange(
        progressChange({ taskId: 'design', oldProgress: 20, newProgress: 60 }, task('design'), 'progress'),
        ctx(),
      ),
    );
    expect(types(r)).toEqual(['task-progress-changed', 'task-updated']);
    expect(r.events[0]?.detail).toEqual({ taskId: 'design', oldProgress: 20, newProgress: 60 });
    expect(r.announcement).toBe('Design 60% complete');
  });

  it('link → dependency-created, task-updated (the successor)', () => {
    const r = ok(prepareChange(linkChange(TASKS, { fromId: 'p1', toId: 'build', type: 'SS' }, 'link', 'link'), ctx()));
    expect(types(r)).toEqual(['dependency-created', 'task-updated']);
    expect(r.events[0]?.detail).toEqual({ fromId: 'p1', toId: 'build', type: 'SS', lag: 0 });
    expect(r.events[1]?.detail).toMatchObject({ taskId: 'build', fields: ['dependency'], source: 'link' });
    expect(r.announcement).toBe('Linked P1 to Build');
  });

  it('unlink → dependency-deleted, task-updated', () => {
    const r = ok(prepareChange(linkChange(TASKS, { fromId: 'design', toId: 'build' }, 'unlink', 'delete'), ctx()));
    expect(types(r)).toEqual(['dependency-deleted', 'task-updated']);
    expect(r.proposed[1]?.dependency).toBeUndefined();
    expect(r.announcement).toBe('Removed the link from Design to Build');
  });

  it('move + resize + progress (a move-mode commit) → one event per op, then task-updated', () => {
    const t = task('design');
    const change = taskChange(t, { start: d(2, 3), end: d(2, 10), progress: 40 }, 'keyboard', {
      coalesceKey: 'kbd:design',
    });
    const r = ok(prepareChange(change, ctx()));
    expect(types(r)).toEqual(['task-dragged', 'task-resized', 'task-progress-changed', 'task-updated']);
    expect(r.announcement).toBe('Design start moved 1 day later. Design end moved 4 days later. Design 40% complete');
  });

  it('a predecessors cell edit → unlink and link events, then task-updated; read as the edit', () => {
    const change = taskChange(task('build'), { dependency: [{ taskId: 'p1' }] }, 'cell', { column: 'predecessors' });
    // A cell edit adds and removes links with `editing.dependencies` create and delete on
    const r = ok(prepareChange(change, ctx({ editing: true })));
    expect(types(r)).toEqual(['dependency-deleted', 'dependency-created', 'task-updated']);
    expect(r.announcement).toBe('Edited Predecessors of Build');
  });

  it('a rename has no op: task-updated only', () => {
    const r = ok(prepareChange(taskChange(task('design'), { name: 'Concept' }, 'cell', { column: 'name' }), ctx()));
    expect(types(r)).toEqual(['task-updated']);
    expect(r.events[0]?.detail).toMatchObject({
      fields: ['name'],
      task: { name: 'Concept' },
      previous: { name: 'Design' },
    });
    // the name as it is now
    expect(r.announcement).toBe('Edited Task Name of Concept');
  });

  it('derives the ops of a change built without them', () => {
    const change: GanttChange = {
      source: 'api',
      updates: [{ taskId: 'design', before: { progress: 20 }, after: { progress: 30 } }],
      ops: [],
    };
    const r = ok(prepareChange(change, ctx()));
    expect(r.change.ops).toEqual([{ op: 'progress', event: { taskId: 'design', oldProgress: 20, newProgress: 30 } }]);
    expect(types(r)).toEqual(['task-progress-changed', 'task-updated']);
  });

  it('an empty change passes with nothing to emit or say', () => {
    const r = ok(prepareChange({ source: 'api', updates: [], ops: [] }, ctx()));
    expect(r.events).toEqual([]);
    expect(r.announcement).toBe('');
    expect(r.proposed).toEqual(TASKS);
  });
});

describe('prepareChange — rejections', () => {
  const rejected = (change: GanttChange, options?: GanttOptions) => {
    const r = prepareChange(change, ctx(options));
    expect(r.ok).toBe(false);
    return r as RejectedChange;
  };

  it.each([
    [
      'self-link',
      () => linkChange(TASKS, { fromId: 'design', toId: 'design' }, 'link', 'link'),
      DEFAULT_LABELS.errorSelfLink,
    ],
    [
      'missing-task',
      () => linkChange(TASKS, { fromId: 'design', toId: 'nope' }, 'link', 'api'),
      DEFAULT_LABELS.errorUnknownTask('nope'),
    ],
    [
      'duplicate-link',
      () => linkChange(TASKS, { fromId: 'design', toId: 'build', type: 'SS' }, 'link', 'link'),
      DEFAULT_LABELS.errorDuplicateLink,
    ],
    ['cycle', () => linkChange(TASKS, { fromId: 'build', toId: 'design' }, 'link', 'link'), DEFAULT_LABELS.errorCycle],
    [
      'parent-child',
      () => linkChange(TASKS, { fromId: 'phase', toId: 'p1' }, 'link', 'link'),
      DEFAULT_LABELS.errorParentChild,
    ],
    [
      'end-before-start',
      () => taskChange(task('design'), { end: d(2, 1) }, 'cell', { column: 'end' }),
      DEFAULT_LABELS.errorEndBeforeStart,
    ],
    ['progress-range', () => taskChange(task('design'), { progress: 150 }, 'api'), DEFAULT_LABELS.errorRange(0, 100)],
    [
      'read-only',
      () => taskChange(task('locked'), { start: d(2, 3), end: d(2, 6) }, 'drag'),
      DEFAULT_LABELS.errorReadOnly,
    ],
  ] as const)('%s', (code, build, message) => {
    expect(rejected(build())).toEqual({ ok: false, code, message });
  });

  it('custom: `editing.validate` returning a message or false', () => {
    const change = moveDesign(1);
    expect(rejected(change, { editing: { validate: () => 'Frozen this week' } })).toEqual({
      ok: false,
      code: 'custom',
      message: 'Frozen this week',
    });
    expect(rejected(change, { editing: { validate: c => c.source !== 'drag' } })).toEqual({
      ok: false,
      code: 'custom',
      message: DEFAULT_LABELS.errorRejected,
    });
    ok(prepareChange(change, ctx({ editing: { validate: () => null } })));
  });

  it('`editing.validate` sees the change and the proposed tasks', () => {
    const seen: { change?: GanttChange; proposed?: readonly GanttTask[]; tasks?: readonly GanttTask[] } = {};
    const change = moveDesign(3);
    const validate = (c: GanttChange, v: { tasks: readonly GanttTask[]; proposed: readonly GanttTask[] }) => {
      Object.assign(seen, { change: c, tasks: v.tasks, proposed: v.proposed });
      return true;
    };
    ok(prepareChange(change, ctx({ editing: { validate } })));
    expect(seen.change).toBe(change);
    expect(seen.tasks).toBe(TASKS);
    expect(seen.proposed?.[0]?.start).toEqual(d(2, 5));
  });
});

describe('prepareChange — undo and redo', () => {
  it('undo and redo announce the undone / redone change, not its inverse', () => {
    const change = moveDesign(2);
    const moved = applyChange(TASKS, change);
    const undo = ok(prepareChange(invertChange(change, 'undo'), ctx({}, moved)));
    expect(types(undo)).toEqual(['task-dragged', 'task-updated']);
    expect(undo.events[0]?.detail).toMatchObject({ daysMoved: -2, newStart: d(2, 2) });
    expect(undo.events[1]?.detail).toMatchObject({ source: 'undo' });
    expect(undo.proposed).toEqual(TASKS);
    expect(undo.announcement).toBe('Undone: Design moved 2 days later');

    const redo = ok(prepareChange({ ...change, source: 'redo' }, ctx()));
    expect(redo.announcement).toBe('Redone: Design moved 2 days later');
  });

  it('undo skips tasks that are gone; nothing left → missing-task', () => {
    const both = mergeChanges(
      moveDesign(1, 'api'),
      progressChange({ taskId: 'p1', oldProgress: 0, newProgress: 50 }, task('p1'), 'api'),
    );
    const withoutP1 = TASKS.filter(t => t.id !== 'p1');
    const inverse = invertChange(both, 'undo');
    const undo = ok(prepareChange(inverse, ctx({}, applyChange(withoutP1, both))));
    expect(undo.change.updates.map(u => u.taskId)).toEqual(['design']);
    expect(types(undo)).toEqual(['task-dragged', 'task-updated']);

    const onlyP1 = invertChange(
      progressChange({ taskId: 'p1', oldProgress: 0, newProgress: 50 }, task('p1'), 'api'),
      'undo',
    );
    expect(prepareChange(onlyP1, ctx({}, withoutP1))).toEqual({
      ok: false,
      code: 'missing-task',
      message: DEFAULT_LABELS.errorUnknownTask('p1'),
    });
  });

  it('other sources referring to a missing task are rejected, not skipped', () => {
    const r = prepareChange(
      progressChange({ taskId: 'p1', oldProgress: 0, newProgress: 50 }, task('p1'), 'api'),
      ctx(
        {},
        TASKS.filter(t => t.id !== 'p1'),
      ),
    );
    expect(r).toMatchObject({ ok: false, code: 'missing-task' });
  });
});

describe('describeChange and announcement options', () => {
  const nameOf = (id: string) => TASKS.find(t => t.id === id)?.name ?? id;

  it('reads date amounts in the scale unit (hours on hour scales)', () => {
    const t = task('design');
    const change = taskChange(t, { start: addDays(t.start, 1), end: addDays(t.end, 1) }, 'drag');
    const hourly = ok(prepareChange(change, ctx({ scales: [{ unit: 'day' }, { unit: 'hour', step: 6 }] })));
    expect(hourly.announcement).toBe('Design moved 24 hours later');
    expect(describeChange(change, nameOf, DEFAULT_LABELS, 'day')).toBe('Design moved 1 day later');
  });

  it('guesses one unit when none is given', () => {
    const t = { ...task('design'), start: d(2, 2, 9), end: d(2, 2, 17) };
    const change = taskChange(t, { start: d(2, 2, 14), end: d(2, 2, 22) }, 'drag');
    expect(describeChange(change, nameOf, DEFAULT_LABELS)).toBe('Design moved 5 hours later');
    expect(describeChange(moveDesign(-3), nameOf, DEFAULT_LABELS)).toBe('Design moved 3 days earlier');
  });

  it('a resize of the start, and a move then a resize that ends where the start moved', () => {
    const t = task('design');
    expect(describeChange(taskChange(t, { start: d(1, 27) }, 'resize'), nameOf, DEFAULT_LABELS)).toBe(
      'Design start moved 3 days earlier',
    );
    // start +1 and end +1 net: the end moves too, so both are read
    expect(describeChange(taskChange(t, { start: d(2, 3), end: d(2, 5) }, 'keyboard'), nameOf, DEFAULT_LABELS)).toBe(
      'Design start moved 1 day later. Design end moved 1 day earlier',
    );
  });

  it('cell edits: the built-in column labels, or the given ones', () => {
    const t = task('design');
    expect(describeChange(taskChange(t, { start: d(2, 3) }, 'cell', { column: 'start' }), nameOf, DEFAULT_LABELS)).toBe(
      'Edited Start of Design',
    );
    expect(
      describeChange(taskChange(t, { progress: 50 }, 'cell', { column: 'progress' }), nameOf, DEFAULT_LABELS),
    ).toBe('Edited Progress of Design');
    const custom = taskChange(t, { data: { owner: 'Ann' } }, 'cell', { column: 'owner' });
    expect(describeChange(custom, nameOf, DEFAULT_LABELS)).toBe('Edited owner of Design');
    expect(describeChange(custom, nameOf, DEFAULT_LABELS, undefined, () => 'Owner')).toBe('Edited Owner of Design');
    const r = ok(prepareChange(custom, { ...ctx(), columnLabel: key => key.toUpperCase(), names: id => `#${id}` }));
    expect(r.announcement).toBe('Edited OWNER of #design');
  });

  it('a change without ops or column reads its fields', () => {
    const change = taskChange(task('design'), { name: 'Design', barColor: 'red', type: 'task' }, 'api');
    expect(describeChange(change, nameOf, DEFAULT_LABELS)).toBe('Edited barColor, Type of Design');
  });

  it('fieldLabel maps the built-in keys and passes others through', () => {
    expect(fieldLabel('name', DEFAULT_LABELS)).toBe(DEFAULT_LABELS.colName);
    expect(fieldLabel('dependency', DEFAULT_LABELS)).toBe(DEFAULT_LABELS.colPredecessors);
    expect(fieldLabel('progress', DEFAULT_LABELS)).toBe(DEFAULT_LABELS.ttProgress);
    expect(fieldLabel('owner', DEFAULT_LABELS)).toBe('owner');
  });

  it('uses translated labels', () => {
    const labels = { ...DEFAULT_LABELS, announceLinkCreated: (a: string, b: string) => `${a} → ${b}` };
    expect(describeChange(linkChange(TASKS, { fromId: 'p1', toId: 'build' }, 'link', 'link'), nameOf, labels)).toBe(
      'P1 → Build',
    );
  });
});

describe('createBeforeChangeDetail', () => {
  it('carries the change and proposed tasks; preventDefault vetoes, also through a copy', () => {
    const change = moveDesign(1);
    const proposed = applyChange(TASKS, change);
    const detail = createBeforeChangeDetail(change, proposed);
    expect(detail.change).toBe(change);
    expect(detail.tasks).toBe(proposed);
    expect(detail.defaultPrevented).toBe(false);
    detail.preventDefault();
    expect(detail.defaultPrevented).toBe(true);

    const other = createBeforeChangeDetail(change, proposed);
    const copy = { ...other };
    copy.preventDefault();
    expect(other.defaultPrevented).toBe(true);
  });
});
