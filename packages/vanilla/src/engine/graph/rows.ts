/**
 * @file rows.ts
 * Task and row nodes: the normalised tasks, the critical path, the cell context and the flat row
 * list (tree order, collapsed groups, sort). None of them depends on scrolling or the theme.
 */

import {
  buildColumnContext,
  columnComparator,
  computeCriticalPath,
  filterVisible,
  findColumn,
  flattenTree,
  normalizeTasks,
  reindexVisible,
  sortTree,
  type ColumnContext,
  type CPMResult,
  type GanttFlatRow,
  type GanttTask,
  type ResolvedGanttConfig,
} from '@gantry/core';
import type { ReadonlySignal } from '../../reactive';
import type { Columns } from '../../interaction/columns';
import type { Inputs } from '../inputs';
import type { ChromeGraph } from './chrome';
import type { ConfigGraph } from './config';
import type { NodeFactory } from './node';

/** How task dates are read: the only part of the config CPM and the cell context depend on. */
export type DateReading = Pick<ResolvedGanttConfig, 'endDateMode' | 'normalizeDateOnly'>;

export interface RowsGraph {
  /** `tasks` repaired by `normalizeTasks` (same array when nothing needed fixing) */
  readonly tasks: ReadonlySignal<GanttTask[]>;
  readonly dateReading: ReadonlySignal<DateReading>;
  /** CPM result, or `null` without `options.criticalPath` */
  readonly critical: ReadonlySignal<CPMResult | null>;
  /** "Now", date reading and task index for status / predecessor cells and sorting */
  readonly columnCtx: ReadonlySignal<ColumnContext>;
  /** Every row in display order (collapsed children flagged, not removed) */
  readonly allRows: ReadonlySignal<GanttFlatRow[]>;
  /** Rows actually shown, re-indexed */
  readonly visibleRows: ReadonlySignal<GanttFlatRow[]>;
}

export function rowsGraph(
  I: Inputs,
  chrome: ChromeGraph,
  cfg: ConfigGraph,
  columns: Columns,
  node: NodeFactory,
): RowsGraph {
  const tasks = node('tasks', () => normalizeTasks(I.tasksIn()));
  const dateReading = node(
    'dateReading',
    (): DateReading => {
      const { endDateMode, normalizeDateOnly } = cfg.config();
      return { endDateMode, normalizeDateOnly };
    },
    { equals: (a, b) => a.endDateMode === b.endDateMode && a.normalizeDateOnly === b.normalizeDateOnly },
  );
  const criticalOn = node('criticalOn', () => cfg.config().criticalPath);
  const critical = node('critical', () => (criticalOn() ? computeCriticalPath(tasks(), dateReading()) : null));
  const columnCtx = node('columnCtx', () =>
    buildColumnContext({ tasks: tasks(), config: dateReading(), now: I.nowTick(), locale: chrome.i18n().locale }),
  );
  const allRows = node('allRows', () => {
    const rows = flattenTree(tasks(), I.collapsedIds());
    const sort = I.sort();
    if (!sort) return rows;
    const { columns: defs, builtins } = columns.catalogue();
    const column = findColumn(defs, builtins, sort.key);
    // Siblings sort at every level, each subtree stays under its parent
    return sortTree(rows, columnComparator(sort.key, sort.dir, { column, ctx: columnCtx() }));
  });
  const visibleRows = node('visibleRows', () => reindexVisible(filterVisible(allRows())));
  return { tasks, dateReading, critical, columnCtx, allRows, visibleRows };
}
