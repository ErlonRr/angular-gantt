/**
 * Case `non-working`: weekends and two holidays, drawn shaded, hatched or greyed out
 * (`nonWorkingTime.style`); on the Hour scale the time outside working hours (9:00–17:00) and an
 * intensive window are drawn too.
 */

import type { GanttOptions, GanttTask } from '@gantryjs/core';
import { dayAt, planTasks } from '../data';
import type { GalleryCaseData, GalleryChoice } from '../types';

export type NonWorkingStyle = 'shade' | 'hatch' | 'disabled';

export const NON_WORKING_STYLES: readonly GalleryChoice<NonWorkingStyle>[] = [
  { value: 'shade', label: 'Shade' },
  { value: 'hatch', label: 'Hatch' },
  { value: 'disabled', label: 'Disabled' },
];

/** Zoom levels of the case: days, or hours (working hours show there) */
export type NonWorkingViewMode = 'Day' | 'Hour';

export const NON_WORKING_VIEW_MODES: readonly GalleryChoice<NonWorkingViewMode>[] = [
  { value: 'Day', label: 'Days' },
  { value: 'Hour', label: 'Hours' },
];

/** The controls' first values: the non-working style and the scale */
export const NON_WORKING_INITIAL: { readonly style: NonWorkingStyle; readonly viewMode: NonWorkingViewMode } = {
  style: 'shade',
  viewMode: 'Day',
};

/**
 * The chart's options: `viewMode` is the Scale control's Days or Hours, or the level picked in the
 * chart's own toolbar (the control follows `viewModeChange`, so a later Days or Hours is a change).
 */
export function nonWorkingOptions(
  style: NonWorkingStyle,
  viewMode: string = NON_WORKING_INITIAL.viewMode,
  now?: Date,
): GanttOptions {
  const today = now ?? new Date();
  return {
    viewMode,
    nonWorkingTime: {
      weekends: true,
      holidays: [
        { start: dayAt(today, 3), label: 'Company holiday' },
        { start: dayAt(today, 10), end: dayAt(today, 11), label: 'Bridge days' },
      ],
      workingHours: { start: 9, end: 17 },
      intensiveHours: [{ start: 10, end: 12, label: 'Focus time' }],
      style,
    },
    initialScroll: 'today',
    labels: { ariaChart: 'Launch plan with non-working time' },
  };
}

export function nonWorkingTasks(now?: Date): GanttTask[] {
  return planTasks(now);
}

export const nonWorkingCase: GalleryCaseData = {
  charts: now => [
    {
      tasks: nonWorkingTasks(now),
      options: nonWorkingOptions(NON_WORKING_INITIAL.style, NON_WORKING_INITIAL.viewMode, now),
    },
  ],
};
