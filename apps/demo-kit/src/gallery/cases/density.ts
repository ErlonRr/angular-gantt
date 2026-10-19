/**
 * Case `density`: compact, normal or comfortable rows, header tiers and toolbar controls
 * (`density`). The chart publishes its row and bar heights as read-only CSS variables on its
 * element (`--gantt-row-height`, `--gantt-bar-height`): the side list of the case takes its row
 * pitch from them, so it follows the chart without knowing the density.
 */

import type { GanttDensity, GanttOptions, GanttTask } from '@gantryjs/core';
import { planTasks } from '../data';
import type { GalleryCaseData, GalleryChoice } from '../types';

export const DENSITIES: readonly GalleryChoice<GanttDensity>[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'normal', label: 'Normal' },
  { value: 'comfortable', label: 'Comfortable' },
];

export function densityOptions(density: GanttDensity): GanttOptions {
  return {
    viewMode: 'Week',
    density,
    labels: { ariaChart: 'Launch plan' },
  };
}

export const DENSITY_INITIAL: GanttDensity = 'compact';

export const DENSITY_OPTIONS = densityOptions(DENSITY_INITIAL);

/** The read-only layout variables the chart sets on its element */
export const DENSITY_CSS_VARIABLES = ['--gantt-row-height', '--gantt-bar-height'] as const;

export type DensityCssVariable = (typeof DENSITY_CSS_VARIABLES)[number];

export function densityTasks(now?: Date): GanttTask[] {
  return planTasks(now);
}

export const densityCase: GalleryCaseData = {
  charts: now => [{ tasks: densityTasks(now), options: DENSITY_OPTIONS }],
};
