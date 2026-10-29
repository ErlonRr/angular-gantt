/**
 * Case `shift-calendar`: a workshop plan on an hour calendar (`calendar.unit: 'hour'`). The working
 * hours are 8–12 and 13–17 (a lunch break) with a short Friday (8–12); bars skip the hours off, and
 * durations read and parse in hours, a day being the hours per day you choose (`hoursPerDay`).
 * Type "6h" or "1.5d" in a Duration cell to try it.
 */

import {
  DependencyType,
  TaskType,
  addDays,
  type GanttHourRange,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { workWeekStart } from '../data';
import type { GalleryCaseData, GalleryChoice } from '../types';

/** The zoom levels of the case: hours (the hours off show there) or days */
export type ShiftViewMode = 'Hour' | 'Day';

export const SHIFT_VIEW_MODES: readonly GalleryChoice<ShiftViewMode>[] = [
  { value: 'Hour', label: 'Hours' },
  { value: 'Day', label: 'Days' },
];

export const SHIFT_HOURS_PER_DAY: readonly GalleryChoice<number>[] = [
  { value: 6, label: '6 hours' },
  { value: 7.5, label: '7.5 hours' },
  { value: 8, label: '8 hours' },
];

export type ShiftFriday = 'full' | 'half';

export const SHIFT_FRIDAYS: readonly GalleryChoice<ShiftFriday>[] = [
  { value: 'full', label: 'Full day' },
  { value: 'half', label: 'Half day' },
];

export interface ShiftState {
  /** `'Hour'` or `'Day'`, or the level picked in the chart's own toolbar (the control follows `viewModeChange`) */
  viewMode: string;
  /** What `1d` means in a Duration cell (`calendar.hoursPerDay`) */
  hoursPerDay: number;
  friday: ShiftFriday;
}

/** The controls' first values */
export const SHIFT_INITIAL: ShiftState = { viewMode: 'Hour', hoursPerDay: 8, friday: 'half' };

/** Monday to Thursday 8–12 and 13–17; Friday the same, or 8–12 only. No hours at the weekend. */
export function shiftWorkingHours(friday: ShiftFriday): Partial<Record<number, GanttHourRange[]>> {
  const fullDay = () => [
    { start: 8, end: 12 },
    { start: 13, end: 17 },
  ];
  return {
    1: fullDay(),
    2: fullDay(),
    3: fullDay(),
    4: fullDay(),
    5: friday === 'half' ? [{ start: 8, end: 12 }] : fullDay(),
  };
}

/**
 * Seven timed tasks chained finish-to-start, from Monday 08:00 of `now`'s week to a sign-off
 * milestone on the next Monday at 13:00. They sit on the short-Friday hours, so they are on working
 * time with a full Friday too. Prototype crosses the lunch break, Fixes the evening, and Report the
 * short Friday and the weekend.
 */
export function shiftTasks(now: Date = new Date()): GanttTask[] {
  const monday = workWeekStart(now);
  const at = (offset: number, hour: number) => {
    const day = addDays(monday, offset);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour);
  };
  const after = (taskId: string) => ({ taskId, type: DependencyType.FS });
  return [
    { id: 'kick-off', name: 'Kick-off', start: at(0, 8), end: at(0, 10), progress: 100 },
    {
      id: 'prototype',
      name: 'Prototype',
      start: at(0, 10),
      end: at(1, 17),
      progress: 100,
      dependency: after('kick-off'),
    },
    { id: 'review', name: 'Review', start: at(2, 8), end: at(2, 12), progress: 60, dependency: after('prototype') },
    { id: 'fixes', name: 'Fixes', start: at(2, 13), end: at(3, 10), progress: 0, dependency: after('review') },
    { id: 'test-run', name: 'Test run', start: at(3, 10), end: at(3, 17), progress: 0, dependency: after('fixes') },
    { id: 'report', name: 'Report', start: at(4, 8), end: at(7, 12), progress: 0, dependency: after('test-run') },
    {
      id: 'sign-off',
      name: 'Sign-off',
      type: TaskType.Milestone,
      start: at(7, 13),
      end: at(7, 13),
      progress: 0,
      dependency: after('report'),
    },
  ];
}

export function shiftOptions(state: ShiftState, _now?: Date): GanttOptions {
  return {
    viewMode: state.viewMode,
    calendar: { unit: 'hour', hoursPerDay: state.hoursPerDay },
    nonWorkingTime: { workingHours: shiftWorkingHours(state.friday) },
    // The tasks carry times of day: a time that is UTC midnight in the viewer's zone (08:00 in
    // Singapore) must stay a time, not become a date-only day
    normalizeDateOnly: false,
    editing: { progress: false, dependencies: false },
    panel: { columns: ['name', 'start', 'duration'], width: 380 },
    formats: { dateFormat: 'ddd D MMM HH:mm' },
    initialScroll: 'start',
    labels: { ariaChart: 'Workshop shift plan' },
  };
}

export const SHIFT_HINT =
  'Type 6h or 1.5d in a Duration cell: a day is the hours per day you pick, and the bar skips lunch, evenings and the weekend.';

export const shiftCalendarCase: GalleryCaseData = {
  charts: now => [{ tasks: shiftTasks(now), options: shiftOptions(SHIFT_INITIAL, now) }],
};
