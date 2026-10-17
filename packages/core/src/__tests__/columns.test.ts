// ─────────────────────────────────────────────────────────────
//  Tests — split panel vs table-view columns, task status, sorting
//  (runs under test:tz: dates are built with new Date(y, m, d, h))
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import {
  buildBuiltinColumns,
  buildColumnContext,
  computeCellVisual,
  mergeColumnDefs,
  resolveViewColumns,
  taskStatus,
  taskDependencies,
  taskDurationLabel,
  findColumn,
  DEFAULT_PANEL_COLUMNS,
} from '../render/columns';
import { resolveConfig } from '../render/config';
import { LightTheme, DarkTheme } from '../render/theme';
import { contrastRatio } from '../render/contrast';
import { flattenTree, sortTree, columnComparator, buildDefaultColumns, DEFAULT_COLUMNS } from '../gantt-data';
import { DEFAULT_LABELS, DependencyType, TaskType, type ColumnDef, type GanttOptions, type GanttTask } from '../types';

const day = (m: number, d: number, h = 0) => new Date(2026, m, d, h);
const task = (id: string, extra: Partial<GanttTask> = {}): GanttTask => ({
  id,
  name: id,
  start: day(9, 5),
  end: day(9, 10),
  ...extra,
});
const builtins = buildBuiltinColumns(DEFAULT_LABELS);
const keys = (cols: ColumnDef[]) => cols.map(c => c.key);
const resolve = (
  view: 'split' | 'table' | 'chart',
  options: GanttOptions = {},
  columns: ColumnDef[] = builtins,
  custom = false,
  visibility?: Parameters<typeof resolveViewColumns>[0]['visibility'],
) => resolveViewColumns({ columns, builtins, custom, view, config: resolveConfig(options), visibility });

// ─── taskStatus ──────────────────────────────────────────────

describe('taskStatus', () => {
  const dateOnlyEnd = task('t', { start: day(9, 5), end: new Date('2026-10-10') });

  it('a date-only exclusive end is overdue from that day', () => {
    expect(taskStatus(dateOnlyEnd, day(9, 9, 23))).toBe('inProgress');
    expect(taskStatus(dateOnlyEnd, day(9, 10, 12))).toBe('overdue');
  });

  it('an inclusive end counts its last day', () => {
    const dates = { endDateMode: 'inclusive' as const, normalizeDateOnly: true };
    expect(taskStatus(dateOnlyEnd, day(9, 10, 12), dates)).toBe('inProgress');
    expect(taskStatus(dateOnlyEnd, day(9, 11, 0), dates)).toBe('overdue');
  });

  it('a timed end turns overdue at that instant', () => {
    // Quarter past the hour: never UTC midnight, which `normalizeDateOnly` reads as a date-only value
    const at = (h: number) => new Date(2026, 9, 10, h, 15);
    const t = task('t', { start: at(9), end: at(17) });
    expect(taskStatus(t, at(8))).toBe('notStarted');
    expect(taskStatus(t, at(12))).toBe('inProgress');
    expect(taskStatus(t, at(17))).toBe('overdue');
  });

  it('a milestone is due at the end of its day', () => {
    const m = task('m', { type: TaskType.Milestone, start: day(9, 10), end: day(9, 10) });
    expect(taskStatus(m, day(9, 9))).toBe('notStarted');
    expect(taskStatus(m, day(9, 10, 15))).toBe('inProgress');
    expect(taskStatus(m, day(9, 11))).toBe('overdue');
  });

  it('progress and an explicit status win', () => {
    expect(taskStatus(task('t', { progress: 100 }), day(0, 1))).toBe('done');
    expect(taskStatus(task('t', { progress: 10 }), day(0, 1))).toBe('inProgress');
    expect(taskStatus(task('t', { status: 'blocked' }), day(9, 7))).toBe('blocked');
    expect(taskStatus(task('t', { status: 'done', progress: 0 }), day(9, 20))).toBe('done');
  });
});

// ─── Which columns each view shows ───────────────────────────

describe('resolveViewColumns', () => {
  it('defaults: a lean panel, a data-rich table, nothing in chart view', () => {
    expect(keys(resolve('split'))).toEqual([...DEFAULT_PANEL_COLUMNS]);
    expect(keys(resolve('table'))).toEqual([
      'name',
      'type',
      'status',
      'start',
      'end',
      'duration',
      'progress',
      'predecessors',
    ]);
    expect(keys(resolve('table', { baseline: true }))).toHaveLength(11);
    expect(resolve('chart')).toEqual([]);
  });

  it('consumer columns keep the legacy rules (tableOnly, visible: false)', () => {
    const cols: ColumnDef[] = [
      { key: 'name', label: 'N', width: 100 },
      { key: 'owner', label: 'O', width: 80, tableOnly: true },
      { key: 'secret', label: 'S', width: 80, visible: false },
    ];
    const merged = mergeColumnDefs(cols, builtins);
    expect(keys(resolve('split', {}, merged, true))).toEqual(['name']);
    expect(keys(resolve('table', {}, merged, true))).toEqual(['name', 'owner']);
  });

  it('explicit key lists pick built-ins too, in order, and skip unknown keys once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cols = mergeColumnDefs([{ key: 'owner', label: 'Owner', width: 80, visible: false }], builtins);
    const opts: GanttOptions = {
      panel: { columns: ['status', 'name', 'owner', 'nope', 'name'] },
      table: { columns: ['id', 'nope'] },
    };
    expect(keys(resolve('split', opts, cols, true))).toEqual(['status', 'name', 'owner']);
    expect(keys(resolve('table', opts, cols, true))).toEqual(['id']);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('runtime visibility: global hides everywhere, per view wins and can add a column', () => {
    const visibility = {
      all: new Map([['start', false]]),
      split: new Map([
        ['status', true],
        ['start', true],
      ]),
    };
    expect(keys(resolve('split', {}, builtins, false, visibility))).toEqual([
      'name',
      'start',
      'end',
      'progress',
      'status',
    ]);
    expect(keys(resolve('table', {}, builtins, false, visibility))).not.toContain('start');
  });
});

// ─── Merging ─────────────────────────────────────────────────

describe('mergeColumnDefs', () => {
  it('a custom column with its own cell keeps it and never inherits tableOnly / visible', () => {
    const [status] = mergeColumnDefs<ColumnDef>(
      [{ key: 'status', label: 'State', width: 90, cellTemplate: 'tpl' }],
      builtins,
    );
    expect(status.render).toBeUndefined();
    expect(status.sortValue).toBeUndefined();
    expect(status.tableOnly).toBeUndefined();
    expect(status.label).toBe('State');
  });

  it('a bare override of a built-in inherits its renderer and sort rule', () => {
    const [start] = mergeColumnDefs([{ key: 'start', label: 'Begins' } as ColumnDef], builtins);
    expect(start.label).toBe('Begins');
    expect(start.width).toBe(112);
    expect(typeof start.render).toBe('function');
    expect(typeof start.sortValue).toBe('function');
  });
});

// ─── Cells ───────────────────────────────────────────────────

describe('built-in cells', () => {
  const tasks = [
    task('a', { name: 'Design', start: day(9, 1), end: day(9, 5), progress: 100 }),
    task('b', { name: 'Build', dependency: [{ taskId: 'a' }, { taskId: 'x', type: DependencyType.SS, lag: 2 }] }),
    task('c', { name: 'Ship', start: day(9, 5), end: day(9, 12), baseline: { start: day(9, 5), end: day(9, 9) } }),
  ];
  const ctx = buildColumnContext({ tasks, now: day(9, 8), config: null });
  const rows = flattenTree(tasks);
  const cell = (key: string, id: string) =>
    computeCellVisual(
      builtins.find(c => c.key === key)!,
      rows.find(r => r.task.id === id)!,
      ctx,
    );

  it('status text, dot paint and data', () => {
    expect(cell('status', 'a')).toMatchObject({
      text: 'Done',
      status: 'done',
      dotPaint: 'var(--gantt-status-done, var(--gantt-text-muted))',
    });
    expect(cell('status', 'b')).toMatchObject({ text: 'In progress', status: 'inProgress' });
  });

  it('predecessors use names, types and lags, with a title', () => {
    expect(cell('predecessors', 'b')).toEqual({ text: 'Design, x (SS+2d)', title: 'Design, x (SS+2d)' });
  });

  it('variance against the baseline end, duration of the drawn span', () => {
    expect(cell('variance', 'c').text).toBe('+3d');
    expect(cell('variance', 'a').text).toBe('');
    const inclusive = buildColumnContext({
      tasks,
      now: day(9, 8),
      config: { endDateMode: 'inclusive', normalizeDateOnly: true },
    });
    const one = flattenTree([task('d', { start: day(0, 5), end: day(0, 5) })])[0];
    expect(
      computeCellVisual(
        builtins.find(c => c.key === 'duration')!,
        one,
        inclusive,
      ).text,
    ).toBe('1 day');
  });

  it('type labels', () => {
    expect(cell('type', 'a').text).toBe('Task');
    const g = flattenTree([task('g'), task('k', { parentId: 'g' })])[0];
    expect(
      computeCellVisual(
        builtins.find(c => c.key === 'type')!,
        g,
        ctx,
      ).text,
    ).toBe('Group');
  });

  it('dependency shapes', () => {
    expect(taskDependencies(task('t'))).toEqual([]);
    expect(taskDependencies(task('t', { dependency: 'a' }))).toEqual([{ taskId: 'a' }]);
    expect(taskDependencies(task('t', { dependency: { taskId: 'a', lag: 1 } }))).toEqual([{ taskId: 'a', lag: 1 }]);
  });

  it('labels are translatable', () => {
    const it = buildBuiltinColumns({ ...DEFAULT_LABELS, colStatus: 'Stato', statusDone: 'Completata' });
    expect(it.find(c => c.key === 'status')!.label).toBe('Stato');
    const r = flattenTree([tasks[0]])[0];
    expect(
      computeCellVisual(
        it.find(c => c.key === 'status')!,
        r,
        ctx,
      ).text,
    ).toBe('Completata');
  });

  it('the legacy column builders are unchanged', () => {
    expect(DEFAULT_COLUMNS).toHaveLength(5);
    expect(buildDefaultColumns(DEFAULT_LABELS)).toHaveLength(5);
  });

  it('status colours reach 3:1 on both row backgrounds', () => {
    for (const theme of [LightTheme, DarkTheme]) {
      for (const k of ['statusNotStarted', 'statusInProgress', 'statusOverdue', 'statusDone'] as const) {
        expect(contrastRatio(theme[k], theme.rowBg)!, k).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(theme[k], theme.rowBgAlt)!, k).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

// ─── Sorting ─────────────────────────────────────────────────

describe('sorting by column', () => {
  const ctx = (tasks: GanttTask[]) => buildColumnContext({ tasks, now: day(9, 8), config: null });
  const col = (key: string) => builtins.find(c => c.key === key);

  it('status sorts by lifecycle rank, custom statuses last', () => {
    const tasks = [
      task('done', { progress: 100 }),
      task('late', { end: day(9, 6) }),
      task('soon', { start: day(9, 20), end: day(9, 25) }),
      task('custom', { status: 'blocked' }),
      task('now'),
    ];
    const rows = flattenTree(tasks);
    const asc = sortTree(rows, columnComparator('status', 'asc', { column: col('status'), ctx: ctx(tasks) }));
    expect(asc.map(r => r.task.id)).toEqual(['soon', 'now', 'late', 'done', 'custom']);
    const desc = sortTree(rows, columnComparator('status', 'desc', { column: col('status'), ctx: ctx(tasks) }));
    expect(desc.map(r => r.task.id)[0]).toBe('custom');
  });

  it('names sort numerically, at every level of the tree', () => {
    const tasks = [
      task('p'),
      task('Task 10', { parentId: 'p' }),
      task('Task 2', { parentId: 'p' }),
      task('Task 1', { parentId: 'Task 10' }),
      task('Task 0', { parentId: 'Task 10' }),
    ];
    const sorted = sortTree(
      flattenTree(tasks),
      columnComparator('name', 'asc', { column: col('name'), ctx: ctx(tasks) }),
    );
    expect(sorted.map(r => r.task.id)).toEqual(['p', 'Task 2', 'Task 10', 'Task 0', 'Task 1']);
  });

  it('empty baseline values sort last both ways', () => {
    const tasks = [task('none'), task('b1', { baseline: { start: day(9, 3), end: day(9, 9) } })];
    const rows = flattenTree(tasks);
    for (const dir of ['asc', 'desc'] as const) {
      expect(
        sortTree(rows, columnComparator('baselineStart', dir, { column: col('baselineStart'), ctx: ctx(tasks) })).map(
          r => r.task.id,
        ),
      ).toEqual(['b1', 'none']);
    }
  });

  it('an invalid locale falls back to the default collator', () => {
    expect(() => buildColumnContext({ tasks: [], now: day(0, 1), locale: 'not a locale!!' })).not.toThrow();
  });
});

// ─── Review regressions ──────────────────────────────────────

describe('column model edge cases', () => {
  it('a timed milestone is due at the end of its local day', () => {
    const m = task('m', {
      type: TaskType.Milestone,
      start: new Date(2026, 9, 10, 15, 15),
      end: new Date(2026, 9, 10, 15, 15),
    });
    expect(taskStatus(m, new Date(2026, 9, 10, 23, 59))).toBe('inProgress');
    expect(taskStatus(m, new Date(2026, 9, 11, 0, 0))).toBe('overdue');
  });

  it('explicitly undefined consumer keys keep the built-in renderer', () => {
    const [start] = mergeColumnDefs<ColumnDef>(
      [{ key: 'start', label: 'Begins', width: 90, render: undefined, cellTemplate: undefined }],
      builtins,
    );
    expect(typeof start.render).toBe('function');
    expect(start.builtin).toBe(true);
  });

  it('empty values compare as equal, whatever their kind', () => {
    const cmp = columnComparator('progress');
    const rows = flattenTree([task('a', { progress: undefined }), task('b', { progress: '' as unknown as number })]);
    expect(cmp(rows[0], rows[1])).toBe(0);
    expect(cmp(rows[1], rows[0])).toBe(0);
  });

  it('a global "show" adds a hidden-by-default column unless the view says no', () => {
    const vis = { all: new Map([['status', true]]), table: new Map([['status', false]]) };
    expect(keys(resolve('split', {}, builtins, false, vis))).toContain('status');
    expect(keys(resolve('table', {}, builtins, false, vis))).not.toContain('status');
  });

  it('runtime edits change the default lists instead of exposing every built-in', () => {
    const owner: ColumnDef = { key: 'owner', label: 'Owner', width: 100 };
    const cols = resolveViewColumns({
      columns: [...builtins, owner],
      builtins,
      custom: false,
      view: 'split',
      config: resolveConfig({}),
      edits: { added: [owner], removed: ['end'], order: ['owner'] },
    });
    expect(keys(cols)).toEqual(['owner', 'name', 'start', 'progress']);
  });

  it('a built-in column outside the consumer catalogue still sorts by its rule', () => {
    const tasks = [
      task('long', { start: day(9, 1), end: day(9, 20) }),
      task('short', { start: day(9, 1), end: day(9, 2) }),
    ];
    const ctx = buildColumnContext({ tasks, now: day(9, 8), config: null });
    const column = findColumn([{ key: 'name', label: 'N', width: 100 }], builtins, 'duration');
    const sorted = sortTree(flattenTree(tasks), columnComparator('duration', 'asc', { column, ctx }));
    expect(sorted.map(r => r.task.id)).toEqual(['short', 'long']);
  });

  it('the tooltip and the Duration column agree in inclusive mode', () => {
    const t = task('d', { start: day(0, 5), end: day(0, 5) });
    expect(taskDurationLabel(t, { endDateMode: 'inclusive', normalizeDateOnly: true }, DEFAULT_LABELS)).toBe('1 day');
  });
});
