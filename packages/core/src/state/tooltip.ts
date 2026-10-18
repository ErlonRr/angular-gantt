// ─────────────────────────────────────────────────────────────
//  gantry · state/tooltip.ts
//  Renderer-agnostic content of the task tooltip. Both painters
//  (one popover per chart in both renderers) only turn this model
//  into markup, so they always show the same rows in the same order.
// ─────────────────────────────────────────────────────────────

import { DEFAULT_LABELS, DependencyType, TaskType, type GanttLabels, type GanttTask, type TaskStatus } from '../types';
import { calendarDays, clamp, formatDate } from '../gantt-math';
import { taskSpan } from '../render/timeline';
import { taskDependencies, taskDurationLabel, taskStatus } from '../render/columns';
import type { ResolvedGanttConfig } from '../render/config';
import { themeVar, type Paint } from '../render/paint';

// ─── Timing ───────────────────────────────────────────────────

/** How long the pointer rests on a bar before the tooltip opens (ms), in every binding. */
export const TOOLTIP_SHOW_DELAY = 320;
/** How long the tooltip stays open after the pointer left the bars (ms), in every binding. */
export const TOOLTIP_HIDE_DELAY = 120;

// ─── Labels ───────────────────────────────────────────────────

/** Tooltip-only strings (part of `GanttLabels`). */
export type TooltipExtraLabels = Pick<
  GanttLabels,
  'ttCritical' | 'ttCriticalValue' | 'ttFloat' | 'ttFloatDays' | 'ttSuccessors'
>;

export const DEFAULT_TOOLTIP_LABELS: TooltipExtraLabels = {
  ttCritical: DEFAULT_LABELS.ttCritical,
  ttCriticalValue: DEFAULT_LABELS.ttCriticalValue,
  ttFloat: DEFAULT_LABELS.ttFloat,
  ttFloatDays: DEFAULT_LABELS.ttFloatDays,
  ttSuccessors: DEFAULT_LABELS.ttSuccessors,
};

/** Labels the tooltip reads (the chart labels, tooltip-only strings included). */
export type TooltipLabels = GanttLabels;

// ─── Model ────────────────────────────────────────────────────

export type TooltipRowKind = 'date' | 'duration' | 'progress' | 'status' | 'critical' | 'float' | 'baseline' | 'deps';

export interface TooltipRow {
  label: string;
  value: string;
  /** What the row shows; a painter may style a kind (e.g. draw a bar under `progress`) */
  kind?: TooltipRowKind | undefined;
}

export interface TooltipModel {
  /** Task name */
  title: string;
  kind: 'task' | 'milestone' | 'group';
  /** Label / value rows, in display order */
  rows: TooltipRow[];
  /** Progress 0–100 for the progress bar; `null` for a milestone (no bar) */
  progress: number | null;
  /** Status at `now` (explicit `task.status` wins), as the `status` column derives it */
  status: TaskStatus | (string & {});
  /** On the critical path (`criticalIds` contains the task) */
  critical: boolean;
  /** Finish variance against the baseline (`labels.varianceDays`); `null` without a baseline or with `config.baseline` off */
  baselineVariance: string | null;
  /** Predecessors as `labels.dependency` renders them, e.g. "Design (SS+2d)" */
  predecessors: string[];
  /** Tasks that depend on this one (needs `tasksById`) */
  successors: string[];
  /** Paints (theme tokens or the task's own colour); the chrome uses the `--gantt-tooltip-*` tokens */
  paint: TooltipPaint;
}

export interface TooltipPaint {
  /** Fill of the progress bar: `var(--gantt-critical)` on the critical path, else `task.barColor`, else `var(--gantt-bar)` */
  progress: Paint;
}

export interface TooltipInput {
  task: GanttTask;
  /** How dates are read and whether baseline rows are shown (`baseline`, like the bars) */
  config: Pick<ResolvedGanttConfig, 'endDateMode' | 'normalizeDateOnly' | 'baseline'>;
  labels: TooltipLabels;
  locale?: string | undefined;
  /** Format of the dates (`formats.dateFormat`) */
  dateFormat: string;
  /** Clock for the status (pass the same `now` as the timeline) */
  now: Date;
  /** Critical task ids (`computeCriticalPath(...).criticalIds`) — omit when the critical path is off */
  criticalIds?: ReadonlySet<string> | undefined;
  /** Total float per task id in days (`computeCriticalPath(...).floatMap`); not shown for a group */
  floatDays?: ReadonlyMap<string, number> | undefined;
  /** All tasks by id: resolves predecessor names and finds successors */
  tasksById?: ReadonlyMap<string, GanttTask> | undefined;
  /** The row has children (a group even without `type: 'group'`) */
  hasChildren?: boolean | undefined;
  /** Resolved bar type of the row (`GanttFlatRow.barType`); falls back to `task.barType` */
  barType?: string | undefined;
  /** Add a status row (default false) */
  showStatus?: boolean | undefined;
}

// ─── Builder ──────────────────────────────────────────────────

/** Finish variance in days (actual end − baseline end), rounded to 0.1 — like the `variance` column. */
export function baselineVarianceDays(
  task: Pick<GanttTask, 'start' | 'end' | 'baseline'>,
  dates: Pick<ResolvedGanttConfig, 'endDateMode' | 'normalizeDateOnly'>,
): number | null {
  if (!task.baseline) return null;
  const actual = calendarDays(taskSpan(task, dates).end, false);
  const planned = calendarDays(taskSpan(task.baseline, dates).end, false);
  return round1(actual - planned);
}

/** Everything the task tooltip shows, as plain data. Pure: same input, same model. */
export function buildTooltipModel(input: TooltipInput): TooltipModel {
  const { task, config, labels, locale, dateFormat, now, criticalIds, floatDays, tasksById } = input;
  const extra: TooltipExtraLabels = { ...DEFAULT_TOOLTIP_LABELS, ...definedOnly(labels) };
  const fmt = (d: Date) => formatDate(d, dateFormat, locale);
  // Same type rule as the `type` column and the accessible name
  const type = task.type ?? (input.hasChildren ? TaskType.Group : (input.barType ?? task.barType ?? TaskType.Task));
  const kind: TooltipModel['kind'] =
    type === TaskType.Milestone ? 'milestone' : type === TaskType.Group ? 'group' : 'task';

  const rows: TooltipRow[] = [];
  let progress: number | null = null;
  if (kind === 'milestone') {
    rows.push({ label: labels.ttMilestone, value: fmt(task.start), kind: 'date' });
  } else {
    progress = clamp(task.progress ?? 0, 0, 100);
    rows.push(
      { label: labels.ttStart, value: fmt(task.start), kind: 'date' },
      { label: labels.ttEnd, value: fmt(task.end ?? task.start), kind: 'date' },
      { label: labels.ttDuration, value: taskDurationLabel(task, config, labels), kind: 'duration' },
      { label: labels.ttProgress, value: `${progress}%`, kind: 'progress' },
    );
  }

  const status = taskStatus(task, now, config);
  if (input.showStatus) rows.push({ label: labels.colStatus, value: statusLabel(status, labels), kind: 'status' });

  const critical = criticalIds?.has(task.id) ?? false;
  if (critical) rows.push({ label: extra.ttCritical, value: extra.ttCriticalValue, kind: 'critical' });
  // A summary's float says little about the summary itself, so groups leave it out
  const float = kind === 'group' ? undefined : floatDays?.get(task.id);
  if (float !== undefined) {
    rows.push({ label: extra.ttFloat, value: extra.ttFloatDays(round1(float)), kind: 'float' });
  }

  let baselineVariance: string | null = null;
  if (task.baseline && config.baseline) {
    if (kind === 'milestone') {
      rows.push({ label: labels.colBaselineStart, value: fmt(task.baseline.start), kind: 'baseline' });
    } else {
      rows.push(
        { label: labels.colBaselineStart, value: fmt(task.baseline.start), kind: 'baseline' },
        { label: labels.colBaselineEnd, value: fmt(task.baseline.end), kind: 'baseline' },
      );
    }
    const days = baselineVarianceDays(task, config);
    if (days !== null) {
      baselineVariance = labels.varianceDays(days);
      rows.push({ label: labels.colVariance, value: baselineVariance, kind: 'baseline' });
    }
  }

  const nameOf = (id: string) => tasksById?.get(id)?.name ?? id;
  const predecessors = taskDependencies(task).map(d =>
    labels.dependency(nameOf(d.taskId), d.type ?? DependencyType.FS, d.lag ?? 0),
  );
  const successors: string[] = [];
  if (tasksById) {
    for (const other of tasksById.values()) {
      if (other.id === task.id) continue;
      for (const d of taskDependencies(other)) {
        if (d.taskId === task.id)
          successors.push(labels.dependency(other.name, d.type ?? DependencyType.FS, d.lag ?? 0));
      }
    }
  }
  if (predecessors.length) rows.push({ label: labels.colPredecessors, value: predecessors.join(', '), kind: 'deps' });
  if (successors.length) rows.push({ label: extra.ttSuccessors, value: successors.join(', '), kind: 'deps' });

  return {
    title: task.name,
    kind,
    rows,
    progress,
    status,
    critical,
    baselineVariance,
    predecessors,
    successors,
    paint: { progress: critical ? themeVar('criticalColor') : (task.barColor ?? themeVar('barColor')) },
  };
}

// ─── Helpers ──────────────────────────────────────────────────

/** Rounds to 0.1 and turns `-0` into `0` (so -0.04 never reads "-0d"). */
function round1(value: number): number {
  return Math.round(value * 10) / 10 || 0;
}

/** Same mapping as the `status` column (render/columns.ts) and a11y/describe.ts — to be shared. */

function statusLabel(status: string, labels: GanttLabels): string {
  switch (status) {
    case 'notStarted':
      return labels.statusNotStarted;
    case 'inProgress':
      return labels.statusInProgress;
    case 'overdue':
      return labels.statusOverdue;
    case 'done':
      return labels.statusDone;
    default:
      return status;
  }
}

/** The tooltip-only labels a caller set (an `undefined` key keeps the default). */
function definedOnly(labels: TooltipLabels): Partial<TooltipExtraLabels> {
  const out: Partial<Record<keyof TooltipExtraLabels, unknown>> = {};
  for (const key of Object.keys(DEFAULT_TOOLTIP_LABELS) as (keyof TooltipExtraLabels)[]) {
    if (labels[key] !== undefined) out[key] = labels[key];
  }
  return out as Partial<TooltipExtraLabels>;
}
