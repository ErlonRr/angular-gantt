// ─────────────────────────────────────────────────────────────
//  gantry · a11y/describe.ts
//  Accessible names for task bars and rows, e.g.
//  "Backend, task, 10 Feb – 20 Mar 2026, 65% complete, critical".
//  Dates get a time ("10 Mar 2026 09:00 – 12:00") when either one
//  is not at local midnight, as on hour scales.
//  Level, expanded and selected state are not part of the name:
//  bindings expose them as aria-level / aria-expanded / aria-selected.
//  `barRoleDescription` names the shape a bar is drawn as (its
//  aria-roledescription: "task bar", "milestone", "summary bar").
// ─────────────────────────────────────────────────────────────

import { formatDate, toLocalDay } from '../gantt-math';
import { taskStatus } from '../render/columns';
import type { ResolvedGanttConfig } from '../render/config';
import { DEFAULT_LABELS, TaskType, type GanttLabels, type GanttTask } from '../types';

/** Strings `taskAccessibleName` reads (part of `GanttLabels`). */
export type DescribeLabels = Pick<
  GanttLabels,
  | 'ariaProgress'
  | 'ariaCritical'
  | 'ariaBaseline'
  | 'ariaDateRange'
  | 'ariaDateFormatShort'
  | 'ariaDateFormatLong'
  | 'ariaTimeFormat'
  | 'ariaListSeparator'
>;

export const DEFAULT_DESCRIBE_LABELS: DescribeLabels = {
  ariaProgress: DEFAULT_LABELS.ariaProgress,
  ariaCritical: DEFAULT_LABELS.ariaCritical,
  ariaBaseline: DEFAULT_LABELS.ariaBaseline,
  ariaDateRange: DEFAULT_LABELS.ariaDateRange,
  ariaDateFormatShort: DEFAULT_LABELS.ariaDateFormatShort,
  ariaDateFormatLong: DEFAULT_LABELS.ariaDateFormatLong,
  ariaTimeFormat: DEFAULT_LABELS.ariaTimeFormat,
  ariaListSeparator: DEFAULT_LABELS.ariaListSeparator,
};

/** The row fields the name reads (a `GanttFlatRow` fits). */
export interface DescribeRow {
  task: GanttTask;
  hasChildren?: boolean | undefined;
  /** Resolved bar type (`task.barType ?? 'task'`) */
  barType?: string | undefined;
}

export interface TaskAccessibleNameOptions {
  /** How task dates are read (`resolveConfig()` output fits). Default exclusive ends, date-only normalised. */
  dates?: Pick<ResolvedGanttConfig, 'endDateMode' | 'normalizeDateOnly'> | undefined;
  /** UI labels (type and status names plus `DescribeLabels`); missing keys use the English defaults */
  labels?: Partial<GanttLabels & DescribeLabels> | undefined;
  /** BCP 47 locale for month names */
  locale?: string | undefined;
  /**
   * Format for both dates. Default: a compact range from the labels —
   * `ariaDateFormatShort` – `ariaDateFormatLong` within one year, `ariaDateFormatLong` on both
   * sides otherwise, each followed by `ariaTimeFormat` when either date has a time of day.
   */
  dateFormat?: string | undefined;
  /** On the critical path. Default `false`. */
  critical?: boolean | undefined;
  /** The clock for the status (`taskStatus`); omitted: the status is left out unless `task.status` is set. */
  now?: Date | undefined;
  /** A baseline bar is drawn (`config.baseline && !!task.baseline`). Never read for milestones. Default `false`. */
  baseline?: boolean | undefined;
  /** Include the progress. Default `true` except for milestones. */
  progress?: boolean | undefined;
}

/** Same type rule as the built-in `type` column. */
function rowType(row: DescribeRow): string {
  return row.task.type ?? (row.hasChildren ? TaskType.Group : (row.barType ?? row.task.barType ?? TaskType.Task));
}

/** Not at local midnight (date-only values read as local days). */
const hasTimeOfDay = (d: Date): boolean => {
  const local = toLocalDay(d);
  return local.getHours() !== 0 || local.getMinutes() !== 0;
};

/**
 * Formats the task's start and end for the accessible name: `dateFormat` on both ends when
 * given, else the compact translatable formats of `DescribeLabels` (with a time of day when
 * either date has one; a range within one day names the day once).
 */
export function taskDateRange(
  task: Pick<GanttTask, 'start' | 'end'>,
  options: Pick<TaskAccessibleNameOptions, 'labels' | 'locale' | 'dateFormat'> = {},
): string {
  const { locale, dateFormat, labels } = options;
  const range = labels?.ariaDateRange ?? DEFAULT_DESCRIBE_LABELS.ariaDateRange;
  const start = task.start;
  const end = task.end ?? task.start;
  const fmt = (d: Date, f: string) => formatDate(d, f, locale);
  if (dateFormat) {
    const s = fmt(start, dateFormat);
    const e = fmt(end, dateFormat);
    return s === e ? s : range(s, e);
  }
  const short = labels?.ariaDateFormatShort ?? DEFAULT_DESCRIBE_LABELS.ariaDateFormatShort;
  const long = labels?.ariaDateFormatLong ?? DEFAULT_DESCRIBE_LABELS.ariaDateFormatLong;
  const time =
    hasTimeOfDay(start) || hasTimeOfDay(end) ? (labels?.ariaTimeFormat ?? DEFAULT_DESCRIBE_LABELS.ariaTimeFormat) : '';
  const withTime = (f: string) => (time ? `${f} ${time}` : f);
  const s = fmt(start, withTime(long));
  const e = fmt(end, withTime(long));
  if (s === e) return s;
  if (time && fmt(start, long) === fmt(end, long)) return range(s, fmt(end, time));
  const sameYear = fmt(start, 'YYYY') === fmt(end, 'YYYY');
  return range(sameYear ? fmt(start, withTime(short)) : s, e);
}

/**
 * Accessible name of a task: name, type, dates, progress, status (when `now` is given or the task
 * has an explicit status), "critical" and "planned baseline shown".
 */
export function taskAccessibleName(row: DescribeRow, options: TaskAccessibleNameOptions = {}): string {
  const labels: GanttLabels & DescribeLabels = { ...DEFAULT_LABELS, ...DEFAULT_DESCRIBE_LABELS, ...options.labels };
  const task = row.task;
  const type = rowType(row);
  const parts: string[] = [];

  if (task.name) parts.push(task.name);
  const typeLabels: Record<string, string> = {
    [TaskType.Task]: labels.typeTask,
    [TaskType.Milestone]: labels.typeMilestone,
    [TaskType.Group]: labels.typeGroup,
  };
  parts.push(typeLabels[type] ?? type);
  parts.push(taskDateRange(task, { labels, locale: options.locale, dateFormat: options.dateFormat }));

  if (options.progress ?? type !== TaskType.Milestone) {
    const p = Math.min(100, Math.max(0, Math.round(task.progress ?? 0)));
    parts.push(labels.ariaProgress(p));
  }

  if (task.status || options.now) {
    const dates = options.dates ?? { endDateMode: 'exclusive', normalizeDateOnly: true };
    const status = options.now ? taskStatus(task, options.now, dates) : (task.status ?? '');
    const statusLabels: Record<string, string> = {
      notStarted: labels.statusNotStarted,
      inProgress: labels.statusInProgress,
      overdue: labels.statusOverdue,
      done: labels.statusDone,
    };
    const text = statusLabels[status] ?? status;
    if (text) parts.push(text);
  }

  if (options.critical) parts.push(labels.ariaCritical);
  // Milestones never mention the baseline (as the painters' labels did before)
  const milestone = type === TaskType.Milestone || row.barType === TaskType.Milestone;
  if (options.baseline && !milestone) parts.push(labels.ariaBaseline);
  return parts.join(labels.ariaListSeparator);
}

// ─── Bar role description ─────────────────────────────────────

/** Strings `barRoleDescription` reads (part of `GanttLabels`). */
export type BarRoleLabels = Pick<GanttLabels, 'ariaTask' | 'ariaMilestone' | 'ariaGroup' | 'ariaBarRole'>;

export const DEFAULT_BAR_ROLE_LABELS: BarRoleLabels = {
  ariaTask: DEFAULT_LABELS.ariaTask,
  ariaMilestone: DEFAULT_LABELS.ariaMilestone,
  ariaGroup: DEFAULT_LABELS.ariaGroup,
  ariaBarRole: DEFAULT_LABELS.ariaBarRole,
};

/**
 * The `aria-roledescription` of a bar (`role=option`), from the bar type it is drawn as
 * (`GanttFlatRow.barType`; without one, `task.barType`, then `task.type`): `ariaTask` for task
 * bars, `ariaMilestone` for milestones, `ariaGroup` for group (summary) bars and `ariaBarRole`
 * for custom bar types. A parent row drawn as a task bar is a task bar; its name still says "Group".
 */
export function barRoleDescription(
  row: Pick<DescribeRow, 'task' | 'barType'>,
  labels?: Partial<BarRoleLabels>,
): string {
  // Read key by key: bindings call this per bar with their whole label set
  const type = row.barType ?? row.task.barType ?? row.task.type ?? TaskType.Task;
  switch (type) {
    case TaskType.Task:
      return labels?.ariaTask ?? DEFAULT_BAR_ROLE_LABELS.ariaTask;
    case TaskType.Milestone:
      return labels?.ariaMilestone ?? DEFAULT_BAR_ROLE_LABELS.ariaMilestone;
    case TaskType.Group:
      return labels?.ariaGroup ?? DEFAULT_BAR_ROLE_LABELS.ariaGroup;
    default:
      return labels?.ariaBarRole ?? DEFAULT_BAR_ROLE_LABELS.ariaBarRole;
  }
}
