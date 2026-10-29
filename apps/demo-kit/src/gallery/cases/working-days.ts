/**
 * Case `working-days`: an office-move plan on a working calendar (`calendar`). Durations count
 * working days: a bar dragged across a weekend or a holiday keeps its working days and stretches
 * over the days off, and starts and ends skip non-working time (`skipNonWorking`). Durations can
 * count calendar days instead, skipping can be turned off, and the days off can be shaded, hatched
 * or left unpainted (`nonWorkingTime.style`: they still count).
 */

import {
  DependencyType,
  TaskType,
  addDays,
  calendarDays,
  createWorkingCalendar,
  type GanttDurationMode,
  type GanttHoliday,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { workWeekStart } from '../data';
import type { GalleryCaseData, GalleryChoice } from '../types';

export const WORKING_DURATIONS: readonly GalleryChoice<GanttDurationMode>[] = [
  { value: 'working', label: 'Working days' },
  { value: 'calendar', label: 'Calendar days' },
];

export type WorkingShading = 'shade' | 'hatch' | 'none';

export const WORKING_SHADINGS: readonly GalleryChoice<WorkingShading>[] = [
  { value: 'shade', label: 'Shade' },
  { value: 'hatch', label: 'Hatch' },
  { value: 'none', label: 'None' },
];

export interface WorkingDaysState {
  /** What durations count (`calendar.durations`) */
  durations: GanttDurationMode;
  /** Starts and ends never fall on non-working time (`calendar.skipNonWorking`) */
  skipNonWorking: boolean;
  /** How the days off are painted (`nonWorkingTime.style`) */
  shading: WorkingShading;
}

/** The controls' first values */
export const WORKING_DAYS_INITIAL: WorkingDaysState = { durations: 'working', skipNonWorking: true, shading: 'shade' };

/** Founders’ day (the Wednesday of week 2) and the bridge days (Wednesday and Thursday of week 3). */
export function workingDaysHolidays(now: Date = new Date()): GanttHoliday[] {
  const monday = workWeekStart(now);
  return [
    { start: addDays(monday, 9), label: 'Founders’ day' },
    { start: addDays(monday, 16), end: addDays(monday, 17), label: 'Bridge days' },
  ];
}

/**
 * Eight date-only tasks over four weeks, from the Monday of `now`'s week, chained finish-to-start.
 * Floor plan crosses a weekend, Network crosses Founders’ day and Furniture crosses the bridge
 * days, so each stretches over days off that its working days don't count.
 */
export function workingDaysTasks(now: Date = new Date()): GanttTask[] {
  const monday = workWeekStart(now);
  const d = (offset: number) => addDays(monday, offset);
  const after = (taskId: string) => ({ taskId, type: DependencyType.FS });
  return [
    { id: 'survey', name: 'Survey', start: d(0), end: d(3), progress: 100 },
    { id: 'floor-plan', name: 'Floor plan', start: d(3), end: d(8), progress: 60, dependency: after('survey') },
    { id: 'network', name: 'Network', start: d(8), end: d(12), progress: 20, dependency: after('floor-plan') },
    { id: 'furniture', name: 'Furniture', start: d(14), end: d(19), progress: 0, dependency: after('network') },
    { id: 'packing', name: 'Packing', start: d(21), end: d(22), progress: 0, dependency: after('furniture') },
    {
      id: 'move-day',
      name: 'Move day',
      type: TaskType.Milestone,
      start: d(22),
      end: d(22),
      progress: 0,
      dependency: after('packing'),
    },
    { id: 'unpacking', name: 'Unpacking', start: d(22), end: d(24), progress: 0, dependency: after('move-day') },
    { id: 'snag-list', name: 'Snag list', start: d(24), end: d(25), progress: 0, dependency: after('unpacking') },
  ];
}

export function workingDaysOptions(state: WorkingDaysState, now: Date = new Date()): GanttOptions {
  return {
    viewMode: 'Day',
    calendar: { durations: state.durations, skipNonWorking: state.skipNonWorking },
    nonWorkingTime: { holidays: workingDaysHolidays(now), style: state.shading },
    panel: { columns: ['name', 'start', 'end', 'duration'], width: 420 },
    initialScroll: 'start',
    labels: { ariaChart: 'Office move plan' },
  };
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/**
 * The plan's extent as "16 working days over 25 calendar days": always working days, whatever
 * Durations says, counted on the calendar `options` define (its holidays and weekends).
 */
export function workingSummary(tasks: readonly GanttTask[], options: GanttOptions): string {
  if (tasks.length === 0) return plural(0, 'working day');
  const start = new Date(Math.min(...tasks.map(t => t.start.getTime())));
  const end = new Date(Math.max(...tasks.map(t => t.end.getTime())));
  const calendarSpan = calendarDays(end, false) - calendarDays(start, false);
  const calendar = createWorkingCalendar({ nonWorkingTime: options.nonWorkingTime, calendar: { unit: 'day' } });
  const working = calendar ? Math.round(calendar.workingDuration(start, end) * 100) / 100 : calendarSpan;
  return `${plural(working, 'working day')} over ${plural(calendarSpan, 'calendar day')}`;
}

export const WORKING_DAYS_HINT =
  'Drag a bar across a weekend: it keeps its working days and stretches over the days off. In move mode (Enter on a bar, then ← or →) each step is one working day.';

export const workingDaysCase: GalleryCaseData = {
  charts: now => [{ tasks: workingDaysTasks(now), options: workingDaysOptions(WORKING_DAYS_INITIAL, now) }],
};
