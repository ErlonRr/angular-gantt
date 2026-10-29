// ─────────────────────────────────────────────────────────────
//  Tests — Phase 14 (D13): the resource columns (`resources`, `capacity`,
//  `load`), the default columns of the resource view, the column context
//  and the byte-identity of the task view (D18).
//  (runs under test:tz: dates are built with new Date(y, m, d))
// ─────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PANEL_COLUMNS,
  DEFAULT_RESOURCE_COLUMNS,
  buildBuiltinColumns,
  buildColumnContext,
  buildResourceColumns,
  columnSortValue,
  computeCellVisual,
  defaultColumnKeys,
  defaultTableColumns,
  findColumn,
  mergeColumnDefs,
  resolveViewColumns,
  resourceRowInfo,
  showsResourceColumns,
  taskDependencies,
} from '../render/columns';
import { dateReadingOf, resolveConfig } from '../render/config';
import { flattenTree } from '../gantt-data';
import { indexResources } from '../resources/model';
import { projectResourceRows } from '../resources/rows';
import { computeResourceUtilization } from '../resources/utilization';
import { DEFAULT_LABELS, type ColumnDef, type GanttFlatRow, type GanttResource, type GanttTask } from '../types';

const L = DEFAULT_LABELS;
const d = (day: number) => new Date(2026, 9, day);
const NOW = d(1);

const RESOURCES: GanttResource[] = [
  { id: 'ana', name: 'Ana', capacity: 100 },
  { id: 'bo', name: 'Bo', capacity: 50 },
  { id: 'cy', name: 'Cy', group: 'Eng' },
  { id: 'di', name: 'Di', group: 'Eng' },
];
const TASKS: GanttTask[] = [
  { id: 't1', name: 'Design', start: d(12), end: d(16), resources: ['ana'] },
  { id: 't2', name: 'Build', start: d(14), end: d(22), resources: ['ana', { resourceId: 'bo', units: 50 }] },
  { id: 't3', name: 'Test', start: d(19), end: d(23), resources: [{ resourceId: 'bo', units: 100 }] },
  { id: 't4', name: 'Lonely', start: d(26), end: d(28) },
  { id: 't5', name: 'Mixed', start: d(13), end: d(15), resources: ['ghost', 'cy'] },
];

/** The catalogue of a chart with resources (the three resource columns are part of it) */
const builtins = buildBuiltinColumns(L, undefined, undefined, undefined, true);
/** The catalogue of a chart without resources or a resource view (D18) */
const plainBuiltins = buildBuiltinColumns(L);
const column = (key: string) => findColumn(builtins, builtins, key)!;

function resourceRows(options = {}): GanttFlatRow[] {
  const config = resolveConfig({ rows: 'resources', ...options });
  const dates = dateReadingOf(config);
  const index = indexResources(RESOURCES);
  const utilization = computeResourceUtilization(TASKS, index, dates, { unassigned: true });
  const tasks = projectResourceRows({
    tasks: TASKS,
    index,
    utilization,
    view: config.resourceView,
    labels: L,
    dates,
  });
  return flattenTree(tasks, undefined, { order: 'input' });
}

const taskRows = () => flattenTree(TASKS);
const rowOf = (rows: GanttFlatRow[], id: string) => rows.find(r => r.task.id === id)!;

describe('the resource columns are built-ins', () => {
  it('buildBuiltinColumns lists them after the others, buildResourceColumns builds the three', () => {
    const keys = builtins.map(c => c.key);
    expect(keys.slice(0, 12)).toEqual([
      'id',
      'name',
      'type',
      'status',
      'start',
      'end',
      'duration',
      'progress',
      'predecessors',
      'baselineStart',
      'baselineEnd',
      'variance',
    ]);
    expect(keys.slice(12)).toEqual(['resources', 'capacity', 'load']);
    const own = buildResourceColumns(L);
    expect(own.map(c => c.key)).toEqual(['resources', 'capacity', 'load']);
    expect(own.map(c => c.label)).toEqual([L.colResources, L.colCapacity, L.colLoad]);
    expect(own.every(c => c.builtin === true && c.sortable === true)).toBe(true);
  });

  it('a chart without resources and without the resource view has the 12 columns it had (D18)', () => {
    expect(plainBuiltins.map(c => c.key)).toEqual(builtins.slice(0, 12).map(c => c.key));
    expect(plainBuiltins).toHaveLength(12);
    expect(builtins).toHaveLength(15);
    expect(plainBuiltins.map(c => [c.key, c.width, c.minWidth])).toEqual(
      builtins.slice(0, 12).map(c => [c.key, c.width, c.minWidth]),
    );
  });

  it('showsResourceColumns: resources, or the resource view', () => {
    expect(showsResourceColumns({})).toBe(false);
    expect(showsResourceColumns({ resources: [], rows: 'tasks' })).toBe(false);
    expect(showsResourceColumns({ resources: null })).toBe(false);
    expect(showsResourceColumns({ resources: RESOURCES })).toBe(true);
    expect(showsResourceColumns({ rows: 'resources' })).toBe(true);
    expect(showsResourceColumns({ resources: [], rows: 'resources' })).toBe(true);
  });

  it('an app’s own resources, capacity and load columns stay plain data columns without resources', () => {
    const mine: ColumnDef[] = [
      { key: 'load', label: 'Load', width: 100 },
      { key: 'capacity', label: 'Cap', width: 100 },
      { key: 'resources', label: 'Team', width: 100 },
    ];
    const merged = mergeColumnDefs(mine, plainBuiltins);
    expect(merged).toEqual(mine);
    expect(merged.every(c => c.builtin === undefined && c.render === undefined && c.sortValue === undefined)).toBe(
      true,
    );
    // Over the catalogue of a chart with resources the same keys are the built-ins
    const over = mergeColumnDefs(mine, builtins);
    expect(over.every(c => c.builtin === true && c.render !== undefined)).toBe(true);
  });

  it('keeps today’s columns and widths: the same ones, in the same order, at the same size', () => {
    const before = builtins.slice(0, 12).map(c => [c.key, c.label, c.width, c.minWidth, c.align, c.flex]);
    expect(before).toEqual([
      ['id', 'ID', 72, 48, undefined, undefined],
      ['name', 'Task Name', 240, 120, undefined, true],
      ['type', 'Type', 104, 72, undefined, undefined],
      ['status', 'Status', 120, 88, undefined, undefined],
      ['start', 'Start', 112, 72, undefined, undefined],
      ['end', 'End', 112, 72, undefined, undefined],
      ['duration', 'Duration', 96, 60, undefined, undefined],
      ['progress', '%', 56, 44, 'end', undefined],
      ['predecessors', 'Predecessors', 160, 80, undefined, undefined],
      ['baselineStart', 'Baseline start', 124, 72, undefined, undefined],
      ['baselineEnd', 'Baseline end', 124, 72, undefined, undefined],
      ['variance', 'Variance', 112, 64, 'end', undefined],
    ]);
  });

  it('labels follow the translation', () => {
    const it = buildResourceColumns({ colResources: 'Risorse', colCapacity: 'Capacità', colLoad: 'Carico massimo' });
    expect(it.map(c => c.label)).toEqual(['Risorse', 'Capacità', 'Carico massimo']);
  });
});

describe('the Resources column (task rows)', () => {
  const ctx = buildColumnContext({ tasks: TASKS, now: NOW, resources: indexResources(RESOURCES) });
  const text = (id: string) => computeCellVisual(column('resources'), rowOf(taskRows(), id), ctx).text;

  it('writes the assigned names, the units after a name unless they are 100', () => {
    expect(text('t1')).toBe('Ana');
    expect(text('t2')).toBe('Ana, Bo 50%');
    expect(text('t3')).toBe('Bo');
  });

  it('is blank for an unassigned task and leaves unknown resources out', () => {
    expect(text('t4')).toBe('');
    expect(text('t5')).toBe('Cy');
  });

  it('is blank without a resources index in the context (a legacy caller)', () => {
    const bare = buildColumnContext({ tasks: TASKS, now: NOW });
    expect(computeCellVisual(column('resources'), rowOf(taskRows(), 't2'), bare).text).toBe('');
    expect(column('resources').render?.(rowOf(taskRows(), 't2'))).toBe('');
  });

  it('sorts by the text; a resource row has no assignments', () => {
    const rows = taskRows();
    const sort = (id: string) => columnSortValue(column('resources'), 'resources', rowOf(rows, id), ctx);
    expect(sort('t2')).toBe('Ana, Bo 50%');
    expect(sort('t4')).toBe('');
    const res = resourceRows();
    const resCtx = buildColumnContext({ tasks: [], now: NOW, resources: indexResources(RESOURCES), rows: 'resources' });
    expect(computeCellVisual(column('resources'), rowOf(res, 'res:ana'), resCtx).text).toBe('');
  });
});

describe('the Capacity and Peak load columns (resource rows)', () => {
  const ctx = buildColumnContext({ tasks: [], now: NOW, resources: indexResources(RESOURCES), rows: 'resources' });
  const rows = resourceRows();
  const cell = (key: string, id: string) => computeCellVisual(column(key), rowOf(rows, id), ctx).text;
  const sort = (key: string, id: string) => columnSortValue(column(key), key, rowOf(rows, id), ctx);

  it('shows a resource’s capacity and peak load in percent', () => {
    expect(cell('capacity', 'res:ana')).toBe('100%');
    expect(cell('capacity', 'res:bo')).toBe('50%');
    expect(cell('load', 'res:ana')).toBe('200%');
    expect(cell('load', 'res:bo')).toBe('150%');
    expect(cell('load', 'res:cy')).toBe('100%');
  });

  it('a team row adds its members’ capacity', () => {
    expect(cell('capacity', 'team:Eng')).toBe('200%');
    expect(rowOf(rows, 'team:Eng').hasChildren).toBe(true);
  });

  it('the Unassigned row has a load but no capacity', () => {
    expect(cell('capacity', 'unassigned')).toBe('');
    expect(cell('load', 'unassigned')).toBe('100%');
    expect(sort('capacity', 'unassigned')).toBeNull();
  });

  it('sorts by the numbers, not the text', () => {
    expect(sort('capacity', 'res:bo')).toBe(50);
    expect(sort('capacity', 'res:ana')).toBe(100);
    expect(sort('load', 'res:ana')).toBe(200);
    expect(sort('load', 'res:cy')).toBe(100);
    const order = ['res:ana', 'res:bo', 'res:cy'].sort(
      (a, b) => (sort('load', a) as number) - (sort('load', b) as number),
    );
    expect(order).toEqual(['res:cy', 'res:bo', 'res:ana']);
  });

  it('rounds to one decimal and drops a trailing .0', () => {
    const fractional = columnSortValue(column('load'), 'load', rowOf(rows, 'res:ana'), ctx);
    expect(fractional).toBe(200);
    const row = {
      ...rowOf(rows, 'res:ana'),
      task: {
        ...rowOf(rows, 'res:ana').task,
        data: {
          resource: {
            kind: 'resource',
            id: 'ana',
            name: 'Ana',
            capacity: 33.333,
            peak: 66.666,
            peakDay: null,
            overDays: 0,
            tasks: 1,
          },
        },
      },
    } satisfies GanttFlatRow;
    expect(computeCellVisual(column('capacity'), row, ctx).text).toBe('33.3%');
    expect(computeCellVisual(column('load'), row, ctx).text).toBe('66.7%');
  });

  it('are blank on task rows', () => {
    const task = rowOf(taskRows(), 't1');
    expect(computeCellVisual(column('capacity'), task, ctx).text).toBe('');
    expect(computeCellVisual(column('load'), task, ctx).text).toBe('');
    expect(columnSortValue(column('load'), 'load', task, ctx)).toBeNull();
  });
});

describe('resourceRowInfo', () => {
  it('reads the synthetic rows only', () => {
    const rows = resourceRows();
    expect(resourceRowInfo(rowOf(rows, 'res:ana').task)?.kind).toBe('resource');
    expect(resourceRowInfo(rowOf(rows, 'team:Eng').task)?.kind).toBe('team');
    expect(resourceRowInfo(rowOf(rows, 'unassigned').task)?.kind).toBe('unassigned');
  });

  it('is null for a task, even one whose data names a resource', () => {
    expect(resourceRowInfo(TASKS[0])).toBeNull();
    const lookalike = { barType: 'task', data: { resource: { kind: 'resource', name: 'Ana' } } };
    expect(resourceRowInfo(lookalike)).toBeNull();
  });
});

describe('the default columns by mode', () => {
  const split = (config: Parameters<typeof resolveViewColumns>[0]['config'], view: 'split' | 'table' = 'split') =>
    resolveViewColumns({ columns: builtins, builtins, custom: false, view, config }).map(c => c.key);

  it('tasks: today’s lists, with or without the row mode in the config', () => {
    const config = resolveConfig({});
    expect(config.rows).toBe('tasks');
    expect(split(config)).toEqual([...DEFAULT_PANEL_COLUMNS]);
    expect(split(config, 'table')).toEqual(defaultTableColumns(config));
    expect(split({ panel: config.panel, table: config.table, baseline: config.baseline })).toEqual([
      ...DEFAULT_PANEL_COLUMNS,
    ]);
    expect(split(resolveConfig({ baseline: true }), 'table')).toEqual([
      'name',
      'type',
      'status',
      'start',
      'end',
      'duration',
      'progress',
      'predecessors',
      'baselineStart',
      'baselineEnd',
      'variance',
    ]);
  });

  it('resources: name, capacity and load in both views', () => {
    const config = resolveConfig({ rows: 'resources' });
    expect(split(config)).toEqual(['name', 'capacity', 'load']);
    expect(split(config, 'table')).toEqual(['name', 'capacity', 'load']);
    expect([...DEFAULT_RESOURCE_COLUMNS]).toEqual(['name', 'capacity', 'load']);
    expect(defaultColumnKeys('split', config)).toEqual(['name', 'capacity', 'load']);
    // The baseline columns are for tasks
    expect(split(resolveConfig({ rows: 'resources', baseline: true }), 'table')).toEqual(['name', 'capacity', 'load']);
  });

  it('resources: panel.columns and table.columns are honoured (Start and End show the extent)', () => {
    const config = resolveConfig({
      rows: 'resources',
      panel: { columns: ['name', 'start', 'end'] },
      table: { columns: ['name', 'resources'] },
    });
    expect(split(config)).toEqual(['name', 'start', 'end']);
    expect(split(config, 'table')).toEqual(['name', 'resources']);
  });

  it('resources: consumer columns are the consumer’s', () => {
    const config = resolveConfig({ rows: 'resources' });
    const mine = [{ key: 'name', label: 'N', width: 100 }];
    const keys = resolveViewColumns({ columns: mine, builtins, custom: true, view: 'split', config }).map(c => c.key);
    expect(keys).toEqual(['name']);
  });

  it('tasks: the resource columns appear only when asked for (a key list or a visibility call)', () => {
    const config = resolveConfig({ panel: { columns: ['name', 'resources'] } });
    expect(split(config)).toEqual(['name', 'resources']);
    const shown = resolveViewColumns({
      columns: builtins,
      builtins,
      custom: false,
      view: 'split',
      config: resolveConfig({}),
      visibility: { all: new Map([['capacity', true]]) },
    }).map(c => c.key);
    expect(shown).toEqual([...DEFAULT_PANEL_COLUMNS, 'capacity']);
  });

  it('chart view has no columns, in any mode', () => {
    expect(
      resolveViewColumns({
        columns: builtins,
        builtins,
        custom: false,
        view: 'chart',
        config: resolveConfig({ rows: 'resources' }),
      }),
    ).toEqual([]);
  });
});

describe('the column context', () => {
  it('copies the resource index and the row mode', () => {
    const index = indexResources(RESOURCES);
    const ctx = buildColumnContext({ tasks: TASKS, now: NOW, resources: index, rows: 'resources' });
    expect(ctx.resources).toBe(index);
    expect(ctx.rows).toBe('resources');
  });

  it('is the same shape as before without them (D18)', () => {
    const ctx = buildColumnContext({ tasks: TASKS, now: NOW });
    expect(Object.keys(ctx).sort()).toEqual(
      ['calendar', 'collator', 'endDateMode', 'locale', 'normalizeDateOnly', 'now', 'taskById'].sort(),
    );
    expect('resources' in ctx).toBe(false);
    expect('rows' in ctx).toBe(false);
  });
});

describe('taskDependencies moved to a leaf module', () => {
  it('is still exported by the columns, and reads every shape', () => {
    expect(taskDependencies({ id: 'a', name: 'a', start: d(1), end: d(2), dependency: 'x' })).toEqual([
      { taskId: 'x' },
    ]);
    expect(
      taskDependencies({ id: 'a', name: 'a', start: d(1), end: d(2), dependency: [{ taskId: 'x', lag: 2 }] }),
    ).toEqual([{ taskId: 'x', lag: 2 }]);
    expect(taskDependencies({ id: 'a', name: 'a', start: d(1), end: d(2) })).toEqual([]);
  });
});
