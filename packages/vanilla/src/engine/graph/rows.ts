/**
 * @file rows.ts
 * Task and row nodes: the normalised tasks, the critical path, the rollups, the cell context and
 * the flat row list (tree order, collapsed groups, rolled-up parents, sort). None of them depends
 * on scrolling or the theme.
 *
 * Rollup (`options.rollup`, core `computeRollups` / `applyRollups`): each parent row carries a
 * copy of its task with the values rolled up from its children (progress, dates, status), so the
 * columns, the bars, the tooltip and the accessible names agree. The copies live in the rows only:
 * `tasks`, the events and `getSelectedTasks()` stay raw (core `rollupSource` maps a copy back).
 * The rollups are evaluated at `nowDay` (statuses), never at the ticking clock.
 *
 * Resource view (Phase 14, `options.rows: 'resources'`): `utilization` (core `computeResourceUtilization`)
 * and `viewTasks` (the synthetic resource / team / Unassigned rows, core `projectResourceRows`) replace the
 * tasks as what `flattenTree` gets, in input order; the critical path and the rollups are off. The nodes
 * depend on the tasks, the resources, the date reading, `resourceView.unassigned` and the `Unassigned` label
 * only (a zoom, a theme or any other label change recomputes none of them); in tasks mode `utilization` is
 * `null` and `viewTasks` is `tasks`. `tasks` stays the real tasks (the timeline's extent, the events).
 */

import {
  applyRollups,
  buildColumnContext,
  columnComparator,
  computeCriticalPath,
  computeResourceUtilization,
  computeRollups,
  dateReadingOf,
  filterVisible,
  findColumn,
  flattenTree,
  indexResources,
  normalizeTasks,
  projectResourceRows,
  reindexVisible,
  sameDateReading,
  sortTree,
  type ColumnContext,
  type CPMResult,
  type DateReading,
  type GanttFlatRow,
  type GanttRollupInfo,
  type GanttTask,
  type ResolvedRollupOptions,
  type ResourceIndex,
  type ResourceUtilization,
} from '@gantryjs/core';
import type { ReadonlySignal } from '../../reactive';
import type { Columns } from '../../interaction/columns';
import { structuralEqual, type Inputs } from '../inputs';
import type { ChromeGraph } from './chrome';
import type { ConfigGraph } from './config';
import type { NodeFactory } from './node';

/** Rolled-up values by parent id (empty without `options.rollup`). */
export type Rollups = ReadonlyMap<string, GanttRollupInfo>;

export interface RowsGraph {
  /** `tasks` repaired by `normalizeTasks` (same array when nothing needed fixing) */
  readonly tasks: ReadonlySignal<GanttTask[]>;
  /** `resources` indexed (core `indexResources`; also in tasks mode: the Resources cell reads it) */
  readonly resourceIndex: ReadonlySignal<ResourceIndex>;
  /** The daily load of every resource (`rows: 'resources'`), `null` in tasks mode */
  readonly utilization: ReadonlySignal<ResourceUtilization | null>;
  /** What the rows are made of: the synthetic resource rows in resource mode, else `tasks` (the same array) */
  readonly viewTasks: ReadonlySignal<GanttTask[]>;
  readonly dateReading: ReadonlySignal<DateReading>;
  /** CPM result, or `null` without `options.criticalPath` */
  readonly critical: ReadonlySignal<CPMResult | null>;
  /** `options.rollup` resolved (`false` = off); compares by value, so a zoom change keeps it */
  readonly rollupConfig: ReadonlySignal<ResolvedRollupOptions | false>;
  /** Rolled-up values of every parent (core `computeRollups` at `nowDay`); empty without rollup */
  readonly rollups: ReadonlySignal<Rollups>;
  /** "Now", date reading and task index for status / predecessor cells and sorting */
  readonly columnCtx: ReadonlySignal<ColumnContext>;
  /** Every row in display order (collapsed children flagged, not removed; rolled-up parents carry their copy) */
  readonly allRows: ReadonlySignal<GanttFlatRow[]>;
  /** Rows actually shown, re-indexed */
  readonly visibleRows: ReadonlySignal<GanttFlatRow[]>;
}

/** The rollups of a chart without `options.rollup` (one object: no change propagates). */
const NO_ROLLUPS: Rollups = new Map();

export function rowsGraph(
  I: Inputs,
  chrome: ChromeGraph,
  cfg: ConfigGraph,
  columns: Columns,
  node: NodeFactory,
): RowsGraph {
  const tasks = node('tasks', () => normalizeTasks(I.tasksIn()));
  // The only part of the config CPM, the rollups and the cell context depend on (end mode, date-only
  // values, working calendar); compared by value, so a zoom, a label or a theme change cuts them off
  const dateReading = node('dateReading', () => dateReadingOf(cfg.config()), { equals: sameDateReading });
  const resourceMode = node('resourceMode', () => cfg.config().rows === 'resources');
  const resourceIndex = node('resourceIndex', () => indexResources(I.resourcesIn()));
  const unassignedOn = node('unassignedOn', () => cfg.config().resourceView.unassigned);
  const unassignedLabel = node('unassignedLabel', () => chrome.i18n().labels.resUnassigned);
  const utilization = node('utilization', (): ResourceUtilization | null =>
    resourceMode()
      ? computeResourceUtilization(tasks(), resourceIndex(), dateReading(), { unassigned: unassignedOn() })
      : null,
  );
  const viewTasks = node('viewTasks', (): GanttTask[] => {
    const load = utilization();
    return load
      ? projectResourceRows({
          tasks: tasks(),
          index: resourceIndex(),
          utilization: load,
          view: { unassigned: unassignedOn() },
          labels: { resUnassigned: unassignedLabel() },
          dates: dateReading(),
        })
      : tasks();
  });
  // No critical path in the resource view (its rows have no links)
  const criticalOn = node('criticalOn', () => cfg.config().criticalPath && !resourceMode());
  const critical = node('critical', () => (criticalOn() ? computeCriticalPath(tasks(), dateReading()) : null));
  // Off in the resource view: a team row would get dates and a progress rolled up from its members
  const rollupConfig = node('rollupConfig', () => (resourceMode() ? false : cfg.config().rollup), {
    equals: structuralEqual,
  });
  const rollups = node('rollups', (): Rollups => {
    const rollup = rollupConfig();
    // Without rollup neither the tasks nor the day are read: nothing to recompute
    if (!rollup) return NO_ROLLUPS;
    // The tasks `flattenTree` gets, so the copies in `children` are the ones on the rows
    return computeRollups(tasks(), rollup, { now: cfg.nowDay(), dates: dateReading() });
  });
  const columnCtx = node('columnCtx', () =>
    buildColumnContext({
      tasks: viewTasks(),
      config: dateReading(),
      now: I.nowTick(),
      locale: chrome.i18n().locale,
      // The Resources cell reads the index in tasks mode too; `rows` tells the cells which mode they are in
      resources: resourceIndex(),
      ...(resourceMode() ? { rows: 'resources' as const } : {}),
    }),
  );
  const allRows = node('allRows', () => {
    // Rolled up before the sort: a parent sorts by its rolled-up values
    const flat = resourceMode()
      ? flattenTree(viewTasks(), I.collapsedIds(), { order: 'input' })
      : flattenTree(viewTasks(), I.collapsedIds());
    const rows = applyRollups(flat, rollups(), rollupConfig());
    const sort = I.sort();
    if (!sort) return rows;
    const { columns: defs, builtins } = columns.catalogue();
    const column = findColumn(defs, builtins, sort.key);
    // Siblings sort at every level, each subtree stays under its parent
    return sortTree(rows, columnComparator(sort.key, sort.dir, { column, ctx: columnCtx() }));
  });
  const visibleRows = node('visibleRows', () => reindexVisible(filterVisible(allRows())));
  return {
    tasks,
    resourceIndex,
    utilization,
    viewTasks,
    dateReading,
    critical,
    rollupConfig,
    rollups,
    columnCtx,
    allRows,
    visibleRows,
  };
}
