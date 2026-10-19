// ─────────────────────────────────────────────────────────────
//  Tests — Phase 11 contract (step 1.0): the `editing` option and its
//  resolved defaults, `toolbar.undo`, the new labels, the shared
//  `editTiming`, `TaskResizeEvent.edge` from both sessions, and the new
//  render-model fields at their neutral values (editing off keeps the
//  Phase 10 output).
//  (runs under test:tz: dates are built with new Date(y, m, d, h))
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, expectTypeOf } from 'vitest';
import * as core from '../index';
import {
  ARROW_HIT_TOLERANCE,
  CONNECTOR_DOT,
  CONNECTOR_GAP,
  CONNECTOR_HIT,
  DEFAULT_ANNOUNCE_LABELS,
  DEFAULT_COALESCE_MS,
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_LABELS,
  DEFAULT_PROGRESS_STEP,
  DragSession,
  KeyboardEditSession,
  PROGRESS_GRIP_HIT,
  ParseError,
  buildTimeline,
  buildToolbar,
  computeArrowVisual,
  computeBarVisual,
  computeRowGeometries,
  dateToPixel,
  editTiming,
  resizeEdge,
  resolveConfig,
  resolveEditing,
  taskSpan,
  toolbarItems,
  type BarHit,
  type ColumnDef,
  type GanttChange,
  type GanttEditingOptions,
  type GanttLabels,
  type GanttOptions,
  type GanttTask,
  type ResolvedEditing,
  type ResolvedToolbar,
  type TaskProgressEvent,
  type TaskResizeEvent,
} from '../index';
import type { TaskProgressEvent as KeyboardTaskProgressEvent } from '../interaction/keyboard-edit';

const day = (m: number, d: number, h = 0) => new Date(2026, m, d, h);
const task = (id: string, extra: Partial<GanttTask> = {}): GanttTask => ({
  id,
  name: id,
  start: day(0, 12),
  end: day(0, 20),
  ...extra,
});
const editing = (e: GanttOptions['editing']): ResolvedEditing => resolveConfig({ editing: e }).editing;

const OFF: ResolvedEditing = {
  enabled: false,
  cells: false,
  progress: false,
  dependencies: { create: false, delete: false, parentChild: false },
  validate: null,
  history: false,
  controlled: false,
};
const ON: ResolvedEditing = {
  enabled: true,
  cells: true,
  progress: { step: 5 },
  dependencies: { create: true, delete: true, parentChild: false },
  validate: null,
  history: { limit: 100, coalesceMs: 800 },
  controlled: false,
};

describe('resolveConfig: editing', () => {
  it('is off by default, and with false: every feature off', () => {
    expect(resolveConfig().editing).toEqual(OFF);
    expect(editing(undefined)).toEqual(OFF);
    expect(editing(false)).toEqual(OFF);
  });

  it('true and {} turn every feature on, parent–child links excepted', () => {
    expect(editing(true)).toEqual(ON);
    expect(editing({})).toEqual(ON);
    expect(editing({ cells: undefined, progress: undefined, dependencies: undefined, history: undefined })).toEqual(ON);
  });

  it('false on one feature removes only that feature', () => {
    expect(editing({ cells: false })).toEqual({ ...ON, cells: false });
    expect(editing({ progress: false })).toEqual({ ...ON, progress: false });
    expect(editing({ history: false })).toEqual({ ...ON, history: false });
    expect(editing({ dependencies: false }).dependencies).toEqual({ create: false, delete: false, parentChild: false });
    expect(editing({ dependencies: true }).dependencies).toEqual({ create: true, delete: true, parentChild: false });
    expect(editing({ dependencies: { create: false } }).dependencies).toEqual({
      create: false,
      delete: true,
      parentChild: false,
    });
    expect(editing({ dependencies: { delete: false } }).dependencies).toEqual({
      create: true,
      delete: false,
      parentChild: false,
    });
    expect(editing({ dependencies: { parentChild: true } }).dependencies).toEqual({
      create: true,
      delete: true,
      parentChild: true,
    });
  });

  it('the progress step: 5 by default, positive numbers only', () => {
    expect(DEFAULT_PROGRESS_STEP).toBe(5);
    expect(editing({ progress: true }).progress).toEqual({ step: 5 });
    expect(editing({ progress: {} }).progress).toEqual({ step: 5 });
    expect(editing({ progress: { step: 10 } }).progress).toEqual({ step: 10 });
    expect(editing({ progress: { step: 2.5 } }).progress).toEqual({ step: 2.5 });
    for (const step of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(editing({ progress: { step } }).progress).toEqual({ step: 5 });
    }
  });

  it('history: limit 100 and coalesceMs 800 by default; whole steps ≥ 1, a window ≥ 0', () => {
    expect([DEFAULT_HISTORY_LIMIT, DEFAULT_COALESCE_MS]).toEqual([100, 800]);
    expect(editing({ history: true }).history).toEqual({ limit: 100, coalesceMs: 800 });
    expect(editing({ history: { limit: 20 } }).history).toEqual({ limit: 20, coalesceMs: 800 });
    expect(editing({ history: { coalesceMs: 0 } }).history).toEqual({ limit: 100, coalesceMs: 0 });
    expect(editing({ history: { limit: 2.7 } }).history).toEqual({ limit: 2, coalesceMs: 800 });
    expect(editing({ history: { limit: 0, coalesceMs: -1 } }).history).toEqual({ limit: 100, coalesceMs: 800 });
    expect(editing({ history: { limit: Number.NaN } }).history).toEqual({ limit: 100, coalesceMs: 800 });
  });

  it('controlled: the features stay on, the chart keeps no history', () => {
    expect(editing({ controlled: true })).toEqual({ ...ON, controlled: true, history: false });
    expect(editing({ controlled: true, history: { limit: 5 } }).history).toBe(false);
    expect(editing({ controlled: false }).history).toEqual({ limit: 100, coalesceMs: 800 });
  });

  it('passes editing.validate through as is', () => {
    const validate = (change: GanttChange) => (change.source === 'api' ? 'no' : null);
    expect(editing({ validate }).validate).toBe(validate);
    expect(editing({ validate: undefined }).validate).toBeNull();
  });

  it('resolveEditing is what resolveConfig uses', () => {
    const o: GanttEditingOptions = { cells: false, progress: { step: 10 }, history: { limit: 3 } };
    expect(resolveEditing(o)).toEqual(editing(o));
    expect(resolveEditing(undefined)).toEqual(OFF);
  });

  it('editing changes nothing else in the resolved config (no paint change)', () => {
    const { editing: off, ...base } = resolveConfig({ viewMode: 'Day' });
    for (const e of [true, { controlled: true }, { cells: false, dependencies: { parentChild: true } }]) {
      const { editing: on, ...rest } = resolveConfig({ viewMode: 'Day', editing: e });
      expect(rest).toEqual(base);
      expect(on.enabled).toBe(true);
    }
    expect(off.enabled).toBe(false);
  });
});

describe('resolveConfig: toolbar.undo', () => {
  const toolbar = (o: GanttOptions = {}) => resolveConfig(o).toolbar as ResolvedToolbar;

  it('defaults to true; false turns it off; no toolbar, no field', () => {
    expect(toolbar().undo).toBe(true);
    expect(toolbar({ toolbar: {} }).undo).toBe(true);
    expect(toolbar({ toolbar: { undo: false } }).undo).toBe(false);
    expect(toolbar({ toolbar: { undo: undefined } }).undo).toBe(true);
    expect(resolveConfig({ toolbar: false }).toolbar).toBe(false);
  });

  it('the default toolbar has no history group and every control has no aria-disabled', () => {
    const cfg = resolveConfig({ editing: true });
    const groups = buildToolbar({
      toolbar: cfg.toolbar,
      zoomLevels: cfg.zoomLevels,
      labels: DEFAULT_LABELS,
      viewMode: cfg.level.name,
      view: 'split',
    });
    expect(groups.map(g => g.key)).toEqual(['zoom', 'levels', 'today', 'views']);
    for (const item of toolbarItems(groups)) expect(item.disabled).toBeNull();
  });
});

describe('labels: Phase 11', () => {
  const STRINGS: Partial<Record<keyof GanttLabels, string>> = {
    undo: 'Undo',
    redo: 'Redo',
    announceEditProgressHelp: 'Up and Down change the progress.',
    errorRequired: 'Enter a value',
    errorNumber: 'Enter a number',
    errorDate: 'Enter a valid date',
    errorDuration: 'Enter a duration such as 5d, 2w or 4h',
    errorEndBeforeStart: 'The end can’t be before the start',
    errorSelfLink: 'A task can’t depend on itself',
    errorDuplicateLink: 'These tasks are already linked',
    errorCycle: 'This link would make a loop',
    errorParentChild: 'A task can’t be linked to its own parent or child',
    errorReadOnly: 'This task can’t be edited',
    errorRejected: 'the change was not accepted',
  };

  it('adds 14 strings and 10 sentences (24 required labels)', () => {
    expect(DEFAULT_LABELS).toMatchObject(STRINGS);
    const L = DEFAULT_LABELS;
    expect(L.ariaCellEditor('Start', 'Design')).toBe('Start, Design');
    expect(L.announceLinkSelected('A', 'B')).toBe('Link from A to B selected. Press Delete to remove it.');
    expect(L.announceLinkDeleted('A', 'B')).toBe('Removed the link from A to B');
    expect(L.announceUndo('Design moved 2 days later')).toBe('Undone: Design moved 2 days later');
    expect(L.announceRedo('Design moved 2 days later')).toBe('Redone: Design moved 2 days later');
    expect(L.announceChangeRejected(L.errorCycle)).toBe('Not changed: This link would make a loop');
    expect(L.describeEdit('Design', 'Start')).toBe('Edited Start of Design');
    expect(L.errorRange(0, 100)).toBe('Enter a number from 0 to 100');
    expect(L.errorUnknownTask('xyz')).toBe('No task “xyz”');
    expect(L.errorAmbiguousTask('Build')).toBe('More than one task is called “Build”: use its ID');
    expect(Object.keys(STRINGS)).toHaveLength(14);
  });

  it('the live-region labels mirror them', () => {
    for (const key of [
      'announceEditProgressHelp',
      'announceLinkSelected',
      'announceLinkDeleted',
      'announceUndo',
      'announceRedo',
      'announceChangeRejected',
    ] as const) {
      expect(DEFAULT_ANNOUNCE_LABELS[key]).toBe(DEFAULT_LABELS[key]);
    }
  });

  it('the move-mode help stays as it is: the progress help is a separate sentence', () => {
    expect(DEFAULT_LABELS.announceEditStart('Backend')).not.toMatch(/Up|Down|progress/);
  });
});

describe('editTiming: the shared drag / keyboard-edit timing', () => {
  const tasks = [task('a', { start: day(2, 10), end: day(2, 14) })];

  it('day scales snap to days; hour scales to hours', () => {
    for (const [viewMode, snap] of [
      ['Day', 'day'],
      ['Week', 'day'],
      ['Month', 'day'],
      ['Hour', 'hour'],
    ] as const) {
      const cfg = resolveConfig({ viewMode });
      const tl = buildTimeline({ tasks, config: cfg, now: day(2, 1) });
      const t = editTiming(tl, cfg);
      expect(t.snap).toBe(snap);
      expect(t.pxPerDay).toBe(tl.pxPerDay);
      expect(t.toX(day(2, 12))).toBe(tl.toX(day(2, 12)));
    }
  });

  it('custom scales: the bottom tier decides', () => {
    const cfg = resolveConfig({ scales: [{ unit: 'day' }, { unit: 'hour', step: 6 }] });
    expect(editTiming({ pxPerDay: 96, toX: () => 0 }, cfg).snap).toBe('hour');
    const days = resolveConfig({ scales: [{ unit: 'month' }, { unit: 'week' }] });
    expect(editTiming({ pxPerDay: 10, toX: () => 0 }, days).snap).toBe('day');
  });

  it('spans dates as drawn: date-only normalisation and inclusive ends (taskSpan)', () => {
    const cfg = resolveConfig({ endDateMode: 'inclusive' });
    const t = editTiming({ pxPerDay: 20, toX: () => 0 }, cfg);
    expect(t.span(day(2, 10), day(2, 14))).toEqual({ start: day(2, 10), end: day(2, 15) });
    const utc = new Date(Date.UTC(2026, 2, 10));
    expect(t.span(utc, utc)).toEqual(taskSpan({ start: utc, end: utc }, cfg));
    expect(t.span(utc, utc).start).toEqual(day(2, 10));
  });

  it('a DragSession on it moves by whole units of the scale', () => {
    const cfg = resolveConfig({ viewMode: 'Hour' });
    const tl = buildTimeline({ tasks, config: cfg, now: day(2, 1) });
    const s = new DragSession('a', 'bar', day(2, 10), day(2, 14), 0, { y: 0, height: 36 }, editTiming(tl, cfg));
    const r = s.finish((tl.pxPerDay / 24) * 3);
    expect(r?.kind).toBe('drag');
    expect(r?.kind === 'drag' && r.event.newStart).toEqual(day(2, 10, 3));
  });
});

describe('TaskResizeEvent.edge', () => {
  const timing = editTiming(
    { pxPerDay: 20, toX: d => dateToPixel(d, day(0, 1), 20) },
    resolveConfig({ viewMode: 'Day' }),
  );
  const row = { y: 0, height: 36 };

  it('resizeEdge maps the handles', () => {
    expect(resizeEdge('left')).toBe('start');
    expect(resizeEdge('right')).toBe('end');
  });

  it('DragSession: the left handle moves the start, the right one the end (handle kept, deprecated)', () => {
    const left = new DragSession('a', 'left', day(2, 10), day(2, 14), 0, row, timing).finish(-40);
    expect(left).toMatchObject({ kind: 'resize', event: { edge: 'start', handle: 'left', newStart: day(2, 8) } });
    const right = new DragSession('a', 'right', day(2, 10), day(2, 14), 0, row, timing).finish(40);
    expect(right).toMatchObject({ kind: 'resize', event: { edge: 'end', handle: 'right', newEnd: day(2, 16) } });
    const moved = new DragSession('a', 'bar', day(2, 10), day(2, 14), 0, row, timing).finish(40);
    expect(moved?.kind === 'drag' && 'edge' in moved.event).toBe(false);
  });

  it('KeyboardEditSession: the same edges, also for a move plus a resize of the end', () => {
    const t = { id: 'a', start: day(2, 10), end: day(2, 14), progress: 40 };
    const end = new KeyboardEditSession(t, row, timing);
    end.apply({ mode: 'resizeEnd', delta: 1 });
    expect(end.commit()).toMatchObject([{ kind: 'resize', event: { edge: 'end', handle: 'right' } }]);
    const start = new KeyboardEditSession(t, row, timing);
    start.apply({ mode: 'resizeStart', delta: -1 });
    expect(start.commit()).toMatchObject([{ kind: 'resize', event: { edge: 'start', handle: 'left' } }]);
    const both = new KeyboardEditSession(t, row, timing);
    both.apply({ mode: 'move', delta: 1 });
    both.apply({ mode: 'resizeEnd', delta: 2 });
    expect(both.commit()).toMatchObject([{ kind: 'drag' }, { kind: 'resize', event: { edge: 'end' } }]);
  });

  it('is a required field of the event type', () => {
    expectTypeOf<TaskResizeEvent['edge']>().toEqualTypeOf<'start' | 'end'>();
  });
});

describe('render model: the Phase 11 fields at their neutral values', () => {
  const cfg = resolveConfig({ viewMode: 'Day', editing: true });
  const tl = buildTimeline({ tasks: [task('a')], config: cfg, now: day(0, 15) });
  const geo = (t: GanttTask, barType = 'task') =>
    computeRowGeometries(
      [{ task: t, level: 0, visibleIndex: 0, hasChildren: false, isCollapsed: false, hidden: false, barType }],
      tl,
      cfg,
    )[0];

  it('bars: no progress grip, no connectors unless asked for', () => {
    for (const barType of ['task', 'group', 'milestone']) {
      const v = computeBarVisual({ geo: geo(task('a', { progress: 30 }), barType), cfg, toX: tl.toX, resizable: true });
      expect(v.progressGrip).toBeNull();
      expect(v.connectors).toBeNull();
    }
  });

  it('bars: `progress` overrides the task progress (a progress drag preview)', () => {
    const t = task('a', { progress: 20 });
    const own = computeBarVisual({ geo: geo(t), cfg, toX: tl.toX });
    const preview = computeBarVisual({ geo: geo(t), cfg, toX: tl.toX, progress: 60 });
    const at60 = computeBarVisual({ geo: geo(task('a', { progress: 60 })), cfg, toX: tl.toX });
    expect(preview.progress).toEqual(at60.progress);
    expect(preview.progress).not.toEqual(own.progress);
    expect(computeBarVisual({ geo: geo(t), cfg, toX: tl.toX, progress: undefined })).toEqual(own);
  });

  it('arrows: not selected', () => {
    const a = computeBarVisual({ geo: geo(task('a')), cfg, toX: tl.toX });
    const b = computeBarVisual({ geo: geo(task('b', { start: day(0, 25), end: day(0, 28) })), cfg, toX: tl.toX });
    const arrow = computeArrowVisual(a, b, {}, cfg, { fromTop: 0, fromBottom: 36 });
    expect(arrow.selected).toBe(false);
    expect(Array.isArray(arrow.points)).toBe(true);
  });

  it('BarHit names the new parts', () => {
    expectTypeOf<BarHit>().toEqualTypeOf<'left' | 'right' | 'progress' | 'link-start' | 'link-end' | 'bar'>();
  });
});

describe('types and exports', () => {
  it('the constants', () => {
    expect([CONNECTOR_HIT, CONNECTOR_DOT, CONNECTOR_GAP, PROGRESS_GRIP_HIT, ARROW_HIT_TOLERANCE]).toEqual([
      24, 10, 2, 24, 5,
    ]);
  });

  it('the editing modules are exported from the package root', () => {
    for (const fn of [
      core.taskChange,
      core.linkChange,
      core.dragChange,
      core.progressChange,
      core.deriveOps,
      core.applyChange,
      core.invertChange,
      core.mergeChanges,
      core.isEmptyChange,
      core.prepareChange,
      core.createBeforeChangeDetail,
      core.describeChange,
      core.validateChange,
      core.linkError,
      core.wouldCreateCycle,
      core.editRules,
      core.cellEditable,
      core.parsePredecessors,
      core.formatPredecessors,
      core.parseDuration,
      core.formatDurationInput,
      core.formatDateInput,
      core.parseDateInput,
      core.resolveCellEditor,
      core.commitCellValue,
      core.reduceCellEdit,
      core.cellEditKey,
      core.inferLinkType,
      core.linkTargetSide,
      core.computeBarOverlay,
      core.linkPreviewPath,
      core.editTiming,
      core.resolveEditing,
    ]) {
      expect(typeof fn).toBe('function');
    }
    for (const cls of [core.GanttHistory, core.ProgressSession, core.LinkSession, core.ParseError]) {
      expect(typeof cls).toBe('function');
    }
  });

  it('ParseError carries its code and reference', () => {
    const e = new ParseError('unknown', 'xyz');
    expect(e).toBeInstanceOf(Error);
    expect([e.name, e.code, e.ref]).toEqual(['ParseError', 'unknown', 'xyz']);
  });

  it('TaskProgressEvent moved to the shared types (still importable from keyboard-edit)', () => {
    expectTypeOf<KeyboardTaskProgressEvent>().toEqualTypeOf<TaskProgressEvent>();
  });

  it('options, tasks and columns accept the new fields, explicit undefined included', () => {
    const o: GanttOptions = {
      editing: {
        cells: undefined,
        progress: { step: undefined },
        dependencies: { create: undefined, delete: true, parentChild: undefined },
        validate: undefined,
        history: { limit: undefined, coalesceMs: 400 },
        controlled: undefined,
      },
      toolbar: { undo: undefined },
    };
    const t: GanttTask = task('a', { editable: false });
    const col: ColumnDef<never, (ctx: core.CellEditorContext) => unknown> = {
      key: 'owner',
      label: 'Owner',
      width: 120,
      editable: row => row.task.editable !== false,
      editor: 'select',
      editorOptions: { options: [{ value: 'ana', label: 'Ana' }], min: undefined },
      exportValue: row => {
        const owner = row.task.data?.['owner'];
        return typeof owner === 'string' ? owner : '';
      },
      parse: value => ({ data: { owner: value } }),
      validate: patch => (patch.data ? null : 'no owner'),
    };
    const custom: typeof col = { ...col, editor: ctx => ctx.value };
    expect([o.editing !== undefined, t.editable, col.editor, typeof custom.editor]).toEqual([
      true,
      false,
      'select',
      'function',
    ]);
  });
});
