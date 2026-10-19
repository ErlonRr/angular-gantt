/**
 * Case `responsive`: a slider sets the width of the chart's container. Below `responsive.breakpoint`
 * (640 px) the chart switches to `responsive.view` (the timeline alone); a view picked while narrow
 * wins until the width crosses back. The toolbar moves its zoom levels, then its views, into a
 * More menu when they don't fit (`toolbar.overflow: 'menu'`, or `'wrap'` onto more lines), and
 * `toolbar.panelToggle` adds a button that shows or hides the task list.
 */

import type { GanttOptions, GanttTask, GanttView } from '@gantryjs/core';
import { planTasks } from '../data';
import type { GalleryCaseData, GalleryChoice } from '../types';

/** The width slider, in px (the container never grows past the page) */
export const RESPONSIVE_WIDTH = { min: 320, max: 1200, step: 10, initial: 560 } as const;

export const RESPONSIVE_BREAKPOINT = 640;

export type ToolbarOverflow = 'menu' | 'wrap';

export const RESPONSIVE_OVERFLOWS: readonly GalleryChoice<ToolbarOverflow>[] = [
  { value: 'menu', label: 'More menu' },
  { value: 'wrap', label: 'Wrap' },
];

/** The view below the breakpoint */
export const RESPONSIVE_VIEWS: readonly GalleryChoice<GanttView>[] = [
  { value: 'chart', label: 'Timeline' },
  { value: 'table', label: 'Table' },
  { value: 'split', label: 'Both (no switch)' },
];

/** The initial control values (the width starts at `RESPONSIVE_WIDTH.initial`) */
export const RESPONSIVE_INITIAL: { readonly overflow: ToolbarOverflow; readonly narrowView: GanttView } = {
  overflow: 'menu',
  narrowView: 'chart',
};

export function responsiveOptions(
  overflow: ToolbarOverflow = RESPONSIVE_INITIAL.overflow,
  narrowView: GanttView = RESPONSIVE_INITIAL.narrowView,
): GanttOptions {
  return {
    viewMode: 'Week',
    responsive: { breakpoint: RESPONSIVE_BREAKPOINT, view: narrowView },
    toolbar: { overflow, panelToggle: true },
    labels: { ariaChart: 'Launch plan' },
  };
}

export const RESPONSIVE_OPTIONS = responsiveOptions();

export function responsiveTasks(now?: Date): GanttTask[] {
  return planTasks(now);
}

export const responsiveCase: GalleryCaseData = {
  charts: now => [{ tasks: responsiveTasks(now), options: RESPONSIVE_OPTIONS }],
};
