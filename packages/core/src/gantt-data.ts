// ─────────────────────────────────────────────────────────────
//  gantry · gantt-data.ts
//  Tree → flat array transformation.
//  Pure functions — no Angular, no DOM.
// ─────────────────────────────────────────────────────────────

import { type GanttTask, type GanttFlatRow, TaskType, type ColumnContext } from './types';
import { columnSortValue, valueToText } from './render/columns';

// ─── Normalisation ────────────────────────────────────────────

/**
 * Repair task data that would otherwise drop rows or crash rendering:
 * - a `parentId` that is null/empty, unknown, the task itself, or closes a
 *   cycle makes the task a root;
 * - a missing `end` falls back to `start`.
 * Valid tasks keep their identity; when nothing needs fixing the same array is returned.
 */
export function normalizeTasks(tasks: GanttTask[]): GanttTask[] {
  const ids = new Set<string>();
  for (const t of tasks) ids.add(t.id);

  const parentOf = new Map<string, string | undefined>();
  for (const t of tasks) {
    const p = t.parentId;
    parentOf.set(t.id, p && p !== t.id && ids.has(p) ? p : undefined);
  }

  // Break cycles: walk up each ancestor chain; a chain that re-enters itself
  // is cut at its last node, which becomes a root.
  const VISITING = 1,
    DONE = 2;
  const state = new Map<string, number>();
  for (const t of tasks) {
    const path: string[] = [];
    let cur: string | undefined = t.id;
    while (cur !== undefined && !state.has(cur)) {
      state.set(cur, VISITING);
      path.push(cur);
      cur = parentOf.get(cur);
    }
    const last = path.at(-1);
    if (cur !== undefined && last !== undefined && state.get(cur) === VISITING) parentOf.set(last, undefined);
    for (const id of path) state.set(id, DONE);
  }

  let changed = false;
  const out = tasks.map(t => {
    const parentId = parentOf.get(t.id);
    const fixParent = t.parentId !== parentId;
    const fixEnd = t.end == null;
    if (!fixParent && !fixEnd) return t;
    changed = true;
    const copy: GanttTask = { ...t, end: t.end ?? t.start };
    if (parentId === undefined) delete copy.parentId;
    else copy.parentId = parentId;
    return copy;
  });
  return changed ? out : tasks;
}

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
export function flattenTree(tasks: GanttTask[], collapsedIds: Set<string> = new Set()): GanttFlatRow[] {
  const childMap = buildChildMap(normalizeTasks(tasks));
  const result: GanttFlatRow[] = [];

  // Stack entries: [task, level, parentIsHidden]
  type StackEntry = { task: GanttTask; level: number; parentHidden: boolean };
  const stack: StackEntry[] = [];

  // Seed with root tasks (no parentId), sorted by start date
  const roots = (childMap.get(undefined) ?? []).slice().sort((a, b) => a.start.getTime() - b.start.getTime());

  // Push in reverse order so first task ends up on top
  for (const task of [...roots].reverse()) stack.push({ task, level: 0, parentHidden: false });

  let visibleIndex = 0;

  while (stack.length) {
    const { task, level, parentHidden } = stack.pop()!;

    const children = (childMap.get(task.id) ?? []).slice().sort((a, b) => a.start.getTime() - b.start.getTime());

    const hasChildren = children.length > 0;
    const isCollapsed = collapsedIds.has(task.id);
    const hidden = parentHidden;
    const barType =
      task.barType ??
      (task.type === TaskType.Milestone
        ? TaskType.Milestone
        : task.type === TaskType.Group
          ? TaskType.Group
          : TaskType.Task);

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
      for (const task of [...children].reverse()) stack.push({ task, level: level + 1, parentHidden: childHidden });
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

export const SORT_BY_START: SortComparator = (a, b) => a.task.start.getTime() - b.task.start.getTime();

export const SORT_BY_NAME: SortComparator = (a, b) => a.task.name.localeCompare(b.task.name);

export const SORT_BY_PROGRESS: SortComparator = (a, b) => (a.task.progress ?? 0) - (b.task.progress ?? 0);

/**
 * Sort only the root-level tasks, preserving child order.
 * Children always follow their parent in the flat array. `rows` must be in
 * depth-first order (as produced by `flattenTree`), so every root's subtree
 * is contiguous — O(N log R) for N rows and R roots. The sort is stable.
 */
export function sortRoots(rows: GanttFlatRow[], cmp: SortComparator): GanttFlatRow[] {
  const groups: [GanttFlatRow, ...GanttFlatRow[]][] = [];
  for (const row of rows) {
    const group = groups.at(-1);
    if (row.level === 0 || !group) groups.push([row]);
    else group.push(row);
  }
  return groups.sort((a, b) => cmp(a[0], b[0])).flat();
}

/**
 * Sort siblings at every level of the tree, keeping each subtree under its parent.
 * `rows` must be in depth-first order (as produced by `flattenTree`). Stable, O(N log N).
 */
export function sortTree(rows: GanttFlatRow[], cmp: SortComparator): GanttFlatRow[] {
  interface Node {
    row: GanttFlatRow | null;
    children: Node[];
  }
  const root: Node = { row: null, children: [] };
  const path: Node[] = [root];
  for (const row of rows) {
    const node: Node = { row, children: [] };
    // Parent = the last node one level up (orphans of a filtered list attach to the root)
    path.length = Math.min(path.length, row.level + 1);
    (path.at(-1) ?? root).children.push(node);
    path.push(node);
  }
  const out: GanttFlatRow[] = [];
  const walk = (node: Node) => {
    node.children.sort((a, b) => cmp(a.row!, b.row!));
    for (const child of node.children) {
      out.push(child.row!);
      walk(child);
    }
  };
  walk(root);
  return out;
}

export type SortDirection = 'asc' | 'desc';

/**
 * Comparator for sorting rows by a column key. With `opts.column` / `opts.ctx` it uses the
 * column's `sortValue` (built-in columns: status rank, type rank, drawn span…); otherwise a
 * task field, or the derived `duration`. Dates, numbers and booleans compare by value, strings
 * with a numeric, locale-aware collator ("Task 2" before "Task 10"); empty values always sort last.
 */
export function columnComparator(
  key: string,
  dir: SortDirection = 'asc',
  opts: { column?: ColumnDef | undefined; ctx?: ColumnContext | undefined } = {},
): SortComparator {
  const sign = dir === 'asc' ? 1 : -1;
  const { column, ctx } = opts;
  const value = (row: GanttFlatRow): unknown => {
    if (ctx) return columnSortValue(column, key, row, ctx);
    return key === 'duration'
      ? (row.task.end ?? row.task.start).getTime() - row.task.start.getTime()
      : (row.task as unknown as Record<string, unknown>)[key];
  };
  const compareText = ctx
    ? (a: string, b: string) => ctx.collator.compare(a, b)
    : (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  return (a, b) => {
    const va = value(a);
    const vb = value(b);
    // Empty values (null, undefined, '') are equal to each other and always last
    const ea = va == null || va === '';
    const eb = vb == null || vb === '';
    if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
    if (va instanceof Date && vb instanceof Date) return sign * (va.getTime() - vb.getTime());
    if (typeof va === 'number' && typeof vb === 'number') return sign * (va - vb);
    if (typeof va === 'boolean' && typeof vb === 'boolean') return sign * (Number(va) - Number(vb));
    return sign * compareText(valueToText(va), valueToText(vb));
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

import { type ColumnDef, type GanttLabels } from './types';
import { formatDate, durationLabel } from './gantt-math';

/** @deprecated The legacy five columns. Use `buildBuiltinColumns()` and `resolveViewColumns()`. */
export const DEFAULT_COLUMNS: ColumnDef[] = [
  {
    key: 'name',
    label: 'Task Name',
    width: 240,
    minWidth: 120,
    builtin: true,
    sortable: true,
    render: r => r.task.name,
  },
  {
    key: 'start',
    label: 'Start',
    width: 96,
    minWidth: 72,
    builtin: true,
    sortable: true,
    render: r => formatDate(r.task.start),
  },
  {
    key: 'end',
    label: 'End',
    width: 96,
    minWidth: 72,
    builtin: true,
    sortable: true,
    render: r => formatDate(r.task.end ?? r.task.start),
  },
  {
    key: 'duration',
    label: 'Duration',
    width: 80,
    minWidth: 60,
    builtin: true,
    sortable: true,
    render: r => durationLabel(r.task.start, r.task.end ?? r.task.start),
  },
  {
    key: 'progress',
    label: '%',
    width: 56,
    minWidth: 44,
    builtin: true,
    sortable: true,
    render: r => `${r.task.progress ?? 0}%`,
  },
];

/**
 * Build the default columns with localised headers and date/duration cells.
 * Falls back to English (`DEFAULT_COLUMNS`) equivalents when no i18n is given.
 * @deprecated The legacy five columns. Use `buildBuiltinColumns()` and `resolveViewColumns()`.
 */
export function buildDefaultColumns(labels: GanttLabels, locale?: string, dateFormat = 'MMM D, YYYY'): ColumnDef[] {
  return [
    {
      key: 'name',
      label: labels.colName,
      width: 240,
      minWidth: 120,
      builtin: true,
      sortable: true,
      render: r => r.task.name,
    },
    {
      key: 'start',
      label: labels.colStart,
      width: 96,
      minWidth: 72,
      builtin: true,
      sortable: true,
      render: r => formatDate(r.task.start, dateFormat, locale),
    },
    {
      key: 'end',
      label: labels.colEnd,
      width: 96,
      minWidth: 72,
      builtin: true,
      sortable: true,
      render: r => formatDate(r.task.end ?? r.task.start, dateFormat, locale),
    },
    {
      key: 'duration',
      label: labels.colDuration,
      width: 80,
      minWidth: 60,
      builtin: true,
      sortable: true,
      render: r => durationLabel(r.task.start, r.task.end ?? r.task.start, labels),
    },
    {
      key: 'progress',
      label: labels.colProgress,
      width: 56,
      minWidth: 44,
      builtin: true,
      sortable: true,
      render: r => `${r.task.progress ?? 0}%`,
    },
  ];
}
