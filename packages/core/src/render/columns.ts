// ─────────────────────────────────────────────────────────────
//  gantry · render/columns.ts
//  Built-in task-list columns, the lean split-view panel vs the
//  data-rich table view, task status and the per-render cell context.
//  Both bindings resolve their columns here, so they always agree.
// ─────────────────────────────────────────────────────────────

import {
  DependencyType, TaskType,
  type ColumnContext, type ColumnDef, type ColumnSortValue, type GanttDependency, type GanttFlatRow,
  type GanttLabels, type GanttTask, type GanttTheme, type GanttView, type TaskStatus,
} from '../types';
import { calendarDays, durationLabel, formatDate, toLocalDay } from '../gantt-math';
import { taskSpan } from './timeline';
import type { ResolvedGanttConfig } from './config';

// ─── Default column sets ──────────────────────────────────────

/** Split view: a lean panel next to the timeline. */
export const DEFAULT_PANEL_COLUMNS: readonly string[] = ['name', 'start', 'end', 'progress'];

const TABLE_COLUMNS = ['name', 'type', 'status', 'start', 'end', 'duration', 'progress', 'predecessors'];
const BASELINE_COLUMNS = ['baselineStart', 'baselineEnd', 'variance'];

/** Table view: every useful field (baseline columns when `baseline` is on). */
export function defaultTableColumns(config: Pick<ResolvedGanttConfig, 'baseline'>): string[] {
  return config.baseline ? [...TABLE_COLUMNS, ...BASELINE_COLUMNS] : [...TABLE_COLUMNS];
}

// ─── Status, type, dependencies ───────────────────────────────

/** Sort order of the built-in statuses (custom strings come after). */
export const STATUS_RANK: Readonly<Record<TaskStatus, number>> = { notStarted: 0, inProgress: 1, overdue: 2, done: 3 };

const isTaskStatus = (s: unknown): s is TaskStatus => typeof s === 'string' && s in STATUS_RANK;

/**
 * Status of a task at `now`: an explicit `task.status` wins; then 100% progress is `done`;
 * past the drawn end is `overdue`; started (or with some progress) is `inProgress`; else
 * `notStarted`. A milestone is due at the end of its day.
 */
export function taskStatus(
  task: GanttTask,
  now: Date,
  dates: Pick<ResolvedGanttConfig, 'endDateMode' | 'normalizeDateOnly'> = { endDateMode: 'exclusive', normalizeDateOnly: true },
): TaskStatus | (string & {}) {
  if (task.status) return task.status;
  const progress = task.progress ?? 0;
  if (progress >= 100) return 'done';
  const span = taskSpan(task, dates);
  // A milestone (no length) is due at the end of its local day, whatever its time
  const day = toLocalDay(span.start);
  const end = span.end > span.start ? span.end : new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  if (now >= end) return 'overdue';
  if (now >= span.start || progress > 0) return 'inProgress';
  return 'notStarted';
}

/** Theme colour of a status dot (custom statuses use the muted text colour). */
export function statusColor(status: string, theme: Partial<GanttTheme> & Pick<GanttTheme, 'textMuted'>): string {
  switch (status) {
    case 'notStarted': return theme.statusNotStarted ?? theme.textMuted;
    case 'inProgress': return theme.statusInProgress ?? theme.textMuted;
    case 'overdue':    return theme.statusOverdue ?? theme.textMuted;
    case 'done':       return theme.statusDone ?? theme.textMuted;
    default:           return theme.textMuted;
  }
}

/** A task's dependencies as a list, whatever shape `task.dependency` has. */
export function taskDependencies(task: GanttTask): GanttDependency[] {
  const raw = task.dependency;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return typeof raw === 'string' ? [{ taskId: raw }] : [raw];
}

/** Effective type of a row: `task.type`, else group when it has children, else its bar type. */
function rowType(row: GanttFlatRow): string {
  return row.task.type ?? (row.hasChildren ? TaskType.Group : row.barType);
}

const TYPE_RANK: Record<string, number> = { [TaskType.Group]: 0, [TaskType.Task]: 1, [TaskType.Milestone]: 2 };

// ─── Cell context ─────────────────────────────────────────────

/** Per-render values for time- and data-dependent cells. Pure: pass the binding's clock as `now`. */
export function buildColumnContext(input: {
  tasks: readonly GanttTask[];
  config?: Pick<ResolvedGanttConfig, 'endDateMode' | 'normalizeDateOnly'> | null;
  now: Date;
  locale?: string;
}): ColumnContext {
  let collator: Intl.Collator;
  try {
    collator = new Intl.Collator(input.locale, { numeric: true });
  } catch {
    collator = new Intl.Collator(undefined, { numeric: true });
  }
  return {
    now: input.now,
    endDateMode: input.config?.endDateMode ?? 'exclusive',
    normalizeDateOnly: input.config?.normalizeDateOnly ?? true,
    locale: input.locale,
    taskById: new Map(input.tasks.map(t => [t.id, t])),
    collator,
  };
}

/** Fallback context for callers that render without one (e.g. legacy one-argument renderers). */
function contextOf(ctx: ColumnContext | undefined, task: GanttTask): ColumnContext {
  return ctx ?? buildColumnContext({ tasks: [task], now: new Date() });
}

// ─── Built-in columns ─────────────────────────────────────────

/**
 * The full catalogue of built-in columns (localised). Which ones show depends on the view:
 * see `resolveViewColumns`. Values are plain text; `computeCellVisual` adds the status dot.
 */
export function buildBuiltinColumns(labels: GanttLabels, locale?: string, dateFormat = 'MMM D, YYYY'): ColumnDef[] {
  const fmt = (d: Date | undefined) => (d ? formatDate(d, dateFormat, locale) : '');
  const span = (t: GanttTask, ctx: ColumnContext) => taskSpan(t, ctx);
  const statusLabel = (s: string) => ({
    notStarted: labels.statusNotStarted, inProgress: labels.statusInProgress,
    overdue: labels.statusOverdue, done: labels.statusDone,
  } as Record<string, string>)[s] ?? s;
  const typeLabel = (t: string) => ({
    [TaskType.Task]: labels.typeTask, [TaskType.Milestone]: labels.typeMilestone, [TaskType.Group]: labels.typeGroup,
  } as Record<string, string>)[t] ?? t;
  const variance = (t: GanttTask, ctx: ColumnContext): number | null => {
    if (!t.baseline) return null;
    const actual = calendarDays(span(t, ctx).end, false);
    const planned = calendarDays(taskSpan(t.baseline as GanttTask, ctx).end, false);
    return Math.round((actual - planned) * 10) / 10;
  };

  const col = (def: ColumnDef): ColumnDef => ({ builtin: true, sortable: true, ...def });
  return [
    col({ key: 'id', label: labels.colId, width: 72, minWidth: 48,
      render: r => r.task.id, sortValue: r => r.task.id }),
    col({ key: 'name', label: labels.colName, width: 240, minWidth: 120, flex: true,
      render: r => r.task.name, sortValue: r => r.task.name }),
    col({ key: 'type', label: labels.colType, width: 104, minWidth: 72,
      render: r => typeLabel(rowType(r)),
      // group, task, milestone, then custom bar types alphabetically
      sortValue: r => { const t = rowType(r); return `${TYPE_RANK[t] ?? 3}:${t}`; } }),
    col({ key: 'status', label: labels.colStatus, width: 120, minWidth: 88,
      render: (r, ctx) => { const c = contextOf(ctx, r.task); return statusLabel(taskStatus(r.task, c.now, c)); },
      // not started, in progress, overdue, done, then custom statuses alphabetically
      sortValue: (r, ctx) => { const s = taskStatus(r.task, ctx.now, ctx); return `${isTaskStatus(s) ? STATUS_RANK[s] : 4}:${s}`; } }),
    col({ key: 'start', label: labels.colStart, width: 112, minWidth: 72,
      render: r => fmt(r.task.start), sortValue: (r, ctx) => span(r.task, ctx).start }),
    col({ key: 'end', label: labels.colEnd, width: 112, minWidth: 72,
      render: r => fmt(r.task.end ?? r.task.start), sortValue: (r, ctx) => span(r.task, ctx).end }),
    col({ key: 'duration', label: labels.colDuration, width: 96, minWidth: 60,
      render: (r, ctx) => taskDurationLabel(r.task, contextOf(ctx, r.task), labels),
      sortValue: (r, ctx) => { const s = span(r.task, ctx); return calendarDays(s.end, false) - calendarDays(s.start, false); } }),
    col({ key: 'progress', label: labels.colProgress, width: 56, minWidth: 44, align: 'end',
      render: r => `${r.task.progress ?? 0}%`, sortValue: r => r.task.progress ?? 0 }),
    col({ key: 'predecessors', label: labels.colPredecessors, width: 160, minWidth: 80, sortable: false,
      render: (r, ctx) => {
        const c = contextOf(ctx, r.task);
        return taskDependencies(r.task)
          .map(d => labels.dependency(c.taskById.get(d.taskId)?.name ?? d.taskId, d.type ?? DependencyType.FS, d.lag ?? 0))
          .join(', ');
      } }),
    col({ key: 'baselineStart', label: labels.colBaselineStart, width: 124, minWidth: 72,
      render: r => fmt(r.task.baseline?.start), sortValue: r => r.task.baseline?.start }),
    col({ key: 'baselineEnd', label: labels.colBaselineEnd, width: 124, minWidth: 72,
      render: r => fmt(r.task.baseline?.end), sortValue: r => r.task.baseline?.end }),
    col({ key: 'variance', label: labels.colVariance, width: 112, minWidth: 64, align: 'end',
      render: (r, ctx) => { const v = variance(r.task, contextOf(ctx, r.task)); return v === null ? '' : labels.varianceDays(v); },
      sortValue: (r, ctx) => variance(r.task, ctx) }),
  ];
}

// ─── Merging consumer columns with the built-ins ──────────────

/**
 * Consumer definitions over the built-ins with the same key. A consumer column inherits the
 * built-in's label and sizes; it inherits its renderer and sort rule only when it brings no
 * `render` / `cellTemplate` of its own, and never its `tableOnly` / `visible`.
 */
export function mergeColumnDefs<T extends ColumnDef>(custom: readonly T[], builtins: readonly ColumnDef[]): T[] {
  const byKey = new Map(builtins.map(b => [b.key, b]));
  return custom.map(raw => {
    const b = byKey.get(raw.key);
    if (!b) return raw;
    // Keys set to `undefined` (e.g. unset directive inputs) don't hide the built-in's values
    const def = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)) as T;
    const ownCell = def.render !== undefined || def.cellTemplate !== undefined;
    const inherited: Partial<ColumnDef> = {
      label: b.label, width: b.width, minWidth: b.minWidth, maxWidth: b.maxWidth, align: b.align, flex: b.flex,
      ...(ownCell ? {} : { render: b.render, sortValue: b.sortValue, sortable: b.sortable, builtin: b.builtin }),
    };
    for (const k of Object.keys(inherited) as (keyof ColumnDef)[]) if (inherited[k] === undefined) delete inherited[k];
    return { ...inherited, ...def } as T;
  });
}

// ─── Which columns a view shows ───────────────────────────────

export interface ColumnVisibility {
  /** Shown / hidden in both views (`setColumnVisible(key, visible)`) */
  all?:   ReadonlyMap<string, boolean>;
  split?: ReadonlyMap<string, boolean>;
  table?: ReadonlyMap<string, boolean>;
}

const warned = new Set<string>();

/**
 * Columns of `view`, in order.
 * - With `panel.columns` / `table.columns`: those keys, looked up in `columns` then in the built-ins.
 * - Else, with consumer `columns`: those (split view skips `tableOnly`), minus `visible: false`.
 * - Else the defaults: `DEFAULT_PANEL_COLUMNS` / `defaultTableColumns(config)`.
 * Then runtime visibility applies: per view, else global; a per-view `true` adds a missing key.
 */
export function resolveViewColumns<T extends ColumnDef>(input: {
  /** Consumer columns merged over the built-ins (`mergeColumnDefs`), or the built-ins */
  columns: readonly T[];
  builtins: readonly T[];
  /** `columns` came from the consumer */
  custom: boolean;
  view: GanttView;
  config: Pick<ResolvedGanttConfig, 'panel' | 'table' | 'baseline'>;
  visibility?: ColumnVisibility;
  /** Runtime edits applied to the default lists when there are no consumer columns / key lists */
  edits?: { added?: readonly ColumnDef[]; removed?: readonly string[]; order?: readonly string[] | null };
}): T[] {
  const { columns, builtins, custom, view, config, visibility, edits } = input;
  if (view === 'chart') return [];
  const table = view === 'table';
  const lookup = (key: string) => findColumn(columns, builtins, key);

  let keys: string[];
  const listed = table ? config.table.columns : config.panel.columns;
  if (listed) {
    keys = listed;
  } else if (custom) {
    keys = columns.filter(c => c.visible !== false && (table || !c.tableOnly)).map(c => c.key);
  } else {
    keys = table ? defaultTableColumns(config) : [...DEFAULT_PANEL_COLUMNS];
  }

  // Runtime additions / removals / order on top of the default lists (Angular `addColumn` …)
  if (!listed && !custom && edits) {
    keys = keys.filter(k => !edits.removed?.includes(k));
    for (const c of edits.added ?? []) {
      if (!keys.includes(c.key) && c.visible !== false && (table || !c.tableOnly)) keys = [...keys, c.key];
    }
    if (edits.order?.length) {
      const order = edits.order;
      const rank = (k: string) => { const i = order.indexOf(k); return i < 0 ? order.length : i; };
      keys = keys.map((k, i) => ({ k, i })).sort((a, b) => rank(a.k) - rank(b.k) || a.i - b.i).map(x => x.k);
    }
  }

  const perView = table ? visibility?.table : visibility?.split;
  for (const [key, shown] of visibility?.all ?? []) {
    if (shown && perView?.get(key) !== false && !keys.includes(key)) keys = [...keys, key];
  }
  for (const [key, shown] of perView ?? []) if (shown && !keys.includes(key)) keys = [...keys, key];

  const out: T[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const shown = perView?.get(key) ?? visibility?.all?.get(key) ?? true;
    if (!shown) continue;
    const def = lookup(key);
    if (def) out.push(def);
    else if (!warned.has(key)) {
      warned.add(key);
      console.warn(`[gantry] unknown column key "${key}" — use a built-in key or one of \`columns\``);
    }
  }
  return out;
}

// ─── Cell values ──────────────────────────────────────────────

/** Duration label of the drawn span — the Duration column and the tooltips use the same rule. */
export function taskDurationLabel(
  task: Pick<GanttTask, 'start' | 'end'>,
  dates: Pick<ResolvedGanttConfig, 'endDateMode' | 'normalizeDateOnly'>,
  labels?: Partial<GanttLabels>,
): string {
  const s = taskSpan(task, dates);
  return durationLabel(s.start, s.end, labels);
}

/** The column for `key` as a view resolves it: the consumer catalogue first, then the built-ins. */
export function findColumn<T extends ColumnDef>(columns: readonly T[], builtins: readonly T[], key: string): T | undefined {
  return columns.find(c => c.key === key) ?? builtins.find(c => c.key === key);
}

export interface CellVisual {
  text: string;
  /** Full text for a tooltip when the cell may be truncated (predecessors) */
  title?: string;
  /** Built-in `status` column: the status and its dot colour */
  status?: string;
  dotColor?: string;
}

/** What a (non-name, non-template) cell shows. */
export function computeCellVisual(col: ColumnDef, row: GanttFlatRow, ctx: ColumnContext, theme: GanttTheme): CellVisual {
  const raw = col.render ? col.render(row, ctx) : (row.task as unknown as Record<string, unknown>)[col.key];
  const text = raw == null ? '' : String(raw);
  if (col.builtin && col.key === 'status') {
    const status = taskStatus(row.task, ctx.now, ctx);
    return { text, status, dotColor: statusColor(status, theme) };
  }
  return col.key === 'predecessors' && text ? { text, title: text } : { text };
}

/** Sort value of a column for a row: `sortValue`, else the raw task field. */
export function columnSortValue(col: ColumnDef | undefined, key: string, row: GanttFlatRow, ctx: ColumnContext): ColumnSortValue {
  if (col?.sortValue) return col.sortValue(row, ctx);
  const v = (row.task as unknown as Record<string, unknown>)[key];
  return v instanceof Date || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : v == null ? v : String(v);
}
