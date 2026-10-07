// ─────────────────────────────────────────────────────────────
//  gantry · gantt-data.ts
//  Tree → flat array transformation.
//  Pure functions — no Angular, no DOM.
// ─────────────────────────────────────────────────────────────

import { GanttTask, GanttFlatRow, TaskType } from './types';

// ─── Build parent→children map ────────────────────────────────

function buildChildMap(tasks: GanttTask[]): Map<string | undefined, GanttTask[]> {
  const map = new Map<string | undefined, GanttTask[]>();
  for (const t of tasks) {
    const key = t.parentId;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  return map;
}

// ─── flattenTree ─────────────────────────────────────────────

/**
 * Convert a flat task array (with parentId references) into a
 * depth-first ordered flat list of GanttFlatRow.
 *
 * Iterative DFS — no recursion, handles thousands of tasks safely.
 * The `hidden` flag is set based on ancestor collapse state.
 *
 * @param tasks         Raw task array (order is not significant)
 * @param collapsedIds  Set of task IDs whose children should be hidden
 */
export function flattenTree(
  tasks: GanttTask[],
  collapsedIds: Set<string> = new Set(),
): GanttFlatRow[] {
  const childMap = buildChildMap(tasks);
  const result: GanttFlatRow[] = [];

  // Stack entries: [task, level, parentIsHidden]
  type StackEntry = { task: GanttTask; level: number; parentHidden: boolean };
  const stack: StackEntry[] = [];

  // Seed with root tasks (no parentId), sorted by start date
  const roots = (childMap.get(undefined) ?? [])
    .slice()
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // Push in reverse order so first task ends up on top
  for (let i = roots.length - 1; i >= 0; i--) {
    stack.push({ task: roots[i], level: 0, parentHidden: false });
  }

  let visibleIndex = 0;

  while (stack.length) {
    const { task, level, parentHidden } = stack.pop()!;

    const children = (childMap.get(task.id) ?? [])
      .slice()
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    const hasChildren  = children.length > 0;
    const isCollapsed  = collapsedIds.has(task.id);
    const hidden       = parentHidden;
    const barType      = task.barType
      ?? (task.type === TaskType.Milestone ? TaskType.Milestone : task.type === TaskType.Group ? TaskType.Group : TaskType.Task);

    const row: GanttFlatRow = {
      task,
      level,
      visibleIndex: hidden ? -1 : visibleIndex,
      hasChildren,
      isCollapsed,
      hidden,
      barType,
    };

    if (!hidden) visibleIndex++;
    result.push(row);

    // Push children in reverse so they come out in order
    if (hasChildren) {
      const childHidden = hidden || isCollapsed;
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push({ task: children[i], level: level + 1, parentHidden: childHidden });
      }
    }
  }

  return result;
}

// ─── filterVisible ────────────────────────────────────────────

/**
 * Return only visible rows (hidden === false), in order.
 * This is the array the virtual scroll engine operates on.
 */
export function filterVisible(rows: GanttFlatRow[]): GanttFlatRow[] {
  return rows.filter(r => !r.hidden);
}

// ─── Re-index visible rows ────────────────────────────────────

/**
 * After filtering, re-assign visibleIndex sequentially.
 * Needed when collapsedIds change between renders.
 */
export function reindexVisible(rows: GanttFlatRow[]): GanttFlatRow[] {
  let i = 0;
  return rows.map(r => ({ ...r, visibleIndex: i++ }));
}

// ─── Sorting helpers ──────────────────────────────────────────

export type SortComparator = (a: GanttFlatRow, b: GanttFlatRow) => number;

export const SORT_BY_START: SortComparator = (a, b) =>
  a.task.start.getTime() - b.task.start.getTime();

export const SORT_BY_NAME: SortComparator = (a, b) =>
  a.task.name.localeCompare(b.task.name);

export const SORT_BY_PROGRESS: SortComparator = (a, b) =>
  (a.task.progress ?? 0) - (b.task.progress ?? 0);

/**
 * Sort only the root-level tasks, preserving child order.
 * Children always follow their parent in the flat array.
 */
export function sortRoots(rows: GanttFlatRow[], cmp: SortComparator): GanttFlatRow[] {
  // Collect root groups
  const groups = new Map<string, GanttFlatRow[]>();
  const rootOrder: string[] = [];

  for (const row of rows) {
    const rootId = getRootId(row, rows);
    if (!groups.has(rootId)) {
      groups.set(rootId, []);
      rootOrder.push(rootId);
    }
    groups.get(rootId)!.push(row);
  }

  // Sort root groups by comparing their root rows
  const rootRows = rootOrder.map(id => groups.get(id)![0]);
  rootRows.sort(cmp);

  return rootRows.flatMap(r => groups.get(r.task.id) ?? []);
}

function getRootId(row: GanttFlatRow, allRows: GanttFlatRow[]): string {
  if (row.level === 0) return row.task.id;
  const parent = allRows.find(r => r.task.id === row.task.parentId);
  return parent ? getRootId(parent, allRows) : row.task.id;
}

export type SortDirection = 'asc' | 'desc';

/**
 * Comparator for sorting rows by a column key: a task field, or the derived
 * `duration` column. Dates and numbers compare by value, everything else as
 * localised strings; empty values always sort last.
 */
export function columnComparator(key: string, dir: SortDirection = 'asc'): SortComparator {
  const sign = dir === 'asc' ? 1 : -1;
  const value = (row: GanttFlatRow): unknown => key === 'duration'
    ? (row.task.end ?? row.task.start).getTime() - row.task.start.getTime()
    : (row.task as unknown as Record<string, unknown>)[key];
  return (a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va instanceof Date && vb instanceof Date) return sign * (va.getTime() - vb.getTime());
    if (typeof va === 'number' && typeof vb === 'number') return sign * (va - vb);
    return sign * String(va).localeCompare(String(vb));
  };
}

// ─── Task lookup helpers ──────────────────────────────────────

export function findRowById(rows: GanttFlatRow[], id: string): GanttFlatRow | undefined {
  return rows.find(r => r.task.id === id);
}

/**
 * Collect all descendant task IDs (inclusive of root).
 */
export function collectDescendants(id: string, rows: GanttFlatRow[]): string[] {
  const result: string[] = [id];
  const childMap = new Map<string, string[]>();
  for (const r of rows) {
    if (r.task.parentId) {
      if (!childMap.has(r.task.parentId)) childMap.set(r.task.parentId, []);
      childMap.get(r.task.parentId)!.push(r.task.id);
    }
  }
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift()!;
    const children = childMap.get(cur) ?? [];
    result.push(...children);
    queue.push(...children);
  }
  return result;
}

// ─── Default column definitions ───────────────────────────────

import { ColumnDef, GanttLabels } from './types';
import { formatDate, durationLabel } from './gantt-math';

export const DEFAULT_COLUMNS: ColumnDef[] = [
  {
    key:     'name',
    label:   'Task Name',
    width:   240,
    minWidth: 120,
    builtin: true,
    sortable: true,
    render:  r => r.task.name,
  },
  {
    key:     'start',
    label:   'Start',
    width:   96,
    minWidth: 72,
    builtin: true,
    sortable: true,
    render:  r => formatDate(r.task.start),
  },
  {
    key:     'end',
    label:   'End',
    width:   96,
    minWidth: 72,
    builtin: true,
    sortable: true,
    render:  r => formatDate(r.task.end),
  },
  {
    key:     'duration',
    label:   'Duration',
    width:   80,
    minWidth: 60,
    builtin: true,
    sortable: true,
    render:  r => durationLabel(r.task.start, r.task.end),
  },
  {
    key:     'progress',
    label:   '%',
    width:   56,
    minWidth: 44,
    builtin: true,
    sortable: true,
    render:  r => `${r.task.progress ?? 0}%`,
  },
];

/**
 * Build the default columns with localised headers and date/duration cells.
 * Falls back to English (`DEFAULT_COLUMNS`) equivalents when no i18n is given.
 */
export function buildDefaultColumns(
  labels: GanttLabels,
  locale?: string,
  dateFormat = 'MMM D, YYYY',
): ColumnDef[] {
  return [
    { key: 'name',     label: labels.colName,     width: 240, minWidth: 120, builtin: true, sortable: true, render: r => r.task.name },
    { key: 'start',    label: labels.colStart,    width: 96,  minWidth: 72,  builtin: true, sortable: true, render: r => formatDate(r.task.start, dateFormat, locale) },
    { key: 'end',      label: labels.colEnd,      width: 96,  minWidth: 72,  builtin: true, sortable: true, render: r => formatDate(r.task.end, dateFormat, locale) },
    { key: 'duration', label: labels.colDuration, width: 80,  minWidth: 60,  builtin: true, sortable: true, render: r => durationLabel(r.task.start, r.task.end, labels) },
    { key: 'progress', label: labels.colProgress, width: 56,  minWidth: 44,  builtin: true, sortable: true, render: r => `${r.task.progress ?? 0}%` },
  ];
}
