/**
 * Case `critical-float`: a fit-out schedule whose critical path, lags and float are counted in
 * working time (`calendar.durations`). Two chains run to an inspection: Foundations → Framing →
 * Roof, and Permits → Utilities (finish-to-start with a two-day lag). Count calendar days instead,
 * or work on Saturdays, and the longer chain changes. A Float column reads each task's float with
 * the chart's own rules (`computeCriticalPath(tasks, ctx)` and `formatFloat`).
 */

import {
  DependencyType,
  TaskType,
  addDays,
  computeCriticalPath,
  dateReadingOf,
  formatFloat,
  resolveConfig,
  type ColumnContext,
  type ColumnDef,
  type GanttDurationMode,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { workWeekStart } from '../data';
import type { GalleryCaseData, GalleryChoice } from '../types';

export const CRITICAL_DURATIONS: readonly GalleryChoice<GanttDurationMode>[] = [
  { value: 'working', label: 'Working days' },
  { value: 'calendar', label: 'Calendar days' },
];

export interface CriticalFloatState {
  /** What durations, lags and float count (`calendar.durations`) */
  durations: GanttDurationMode;
  /** Saturday is a working day (`nonWorkingTime.weekends` is Sunday only) */
  saturdays: boolean;
}

/** The controls' first values */
export const CRITICAL_FLOAT_INITIAL: CriticalFloatState = { durations: 'working', saturdays: false };

/** The float per task of the last context each row was read in: one CPM run per context, not per cell. */
const floatsOf = new WeakMap<ColumnContext, ReadonlyMap<string, number>>();

/** Each task's float in the chart's own unit; empty for parents (their float is their children's). */
export const FLOAT_COLUMN: ColumnDef = {
  key: 'float',
  label: 'Float',
  width: 72,
  align: 'end',
  sortable: false,
  render: (row, ctx) => {
    if (!ctx || row.hasChildren || row.task.type === TaskType.Group) return '';
    let floats = floatsOf.get(ctx);
    if (!floats) {
      floats = computeCriticalPath([...ctx.taskById.values()], dateReadingOf(ctx)).floatMap;
      floatsOf.set(ctx, floats);
    }
    const float = floats.get(row.task.id);
    return float === undefined ? '' : formatFloat(float, ctx);
  },
};

/**
 * Chain A (Foundations, Framing, Roof) has no weekend inside; chain B (Permits, then Utilities
 * two days later) has one inside each task. So A is the longer chain in working days, B the longer
 * in calendar days, and B again when Saturdays are worked. Both end at the Inspection milestone.
 */
export function criticalFloatTasks(now: Date = new Date()): GanttTask[] {
  const monday = workWeekStart(now);
  const d = (offset: number) => addDays(monday, offset);
  const after = (taskId: string, lag?: number) => ({ taskId, type: DependencyType.FS, ...(lag ? { lag } : {}) });
  return [
    { id: 'foundations', name: 'Foundations', start: d(0), end: d(5), progress: 40 },
    { id: 'framing', name: 'Framing', start: d(7), end: d(11), progress: 0, dependency: after('foundations') },
    { id: 'roof', name: 'Roof', start: d(14), end: d(18), progress: 0, dependency: after('framing') },
    { id: 'permits', name: 'Permits', start: d(2), end: d(8), progress: 60 },
    { id: 'utilities', name: 'Utilities', start: d(10), end: d(18), progress: 0, dependency: after('permits', 2) },
    {
      id: 'inspection',
      name: 'Inspection',
      type: TaskType.Milestone,
      start: d(18),
      end: d(18),
      progress: 0,
      dependency: [after('roof'), after('utilities')],
    },
  ];
}

export function criticalFloatOptions(state: CriticalFloatState, _now?: Date): GanttOptions {
  return {
    viewMode: 'Day',
    criticalPath: true,
    calendar: { durations: state.durations },
    nonWorkingTime: { weekends: state.saturdays ? [0] : [0, 6] },
    columns: [FLOAT_COLUMN],
    panel: { columns: ['name', 'duration', 'float'], width: 360 },
    initialScroll: 'start',
    labels: { ariaChart: 'Fit-out schedule' },
  };
}

/** "Critical path: Foundations → Framing → Roof → Inspection": the critical tasks in task order. */
export function criticalSummary(tasks: readonly GanttTask[], options: GanttOptions): string {
  const { criticalIds } = computeCriticalPath([...tasks], resolveConfig(options));
  const names = tasks.filter(t => criticalIds.has(t.id)).map(t => t.name);
  return names.length > 0 ? `Critical path: ${names.join(' → ')}` : 'No critical path';
}

export const CRITICAL_FLOAT_HINT =
  'Hover or focus a bar to see its float in the tooltip. Durations, lags and float count working days.';

export const criticalFloatCase: GalleryCaseData = {
  charts: now => [{ tasks: criticalFloatTasks(now), options: criticalFloatOptions(CRITICAL_FLOAT_INITIAL, now) }],
};
