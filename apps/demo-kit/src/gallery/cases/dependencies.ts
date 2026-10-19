/**
 * Case `dependencies`: the four link types (finish-to-start, start-to-start, finish-to-finish,
 * start-to-finish) with lag and lead, the critical path, and a toggle between orthogonal and
 * straight arrows (`arrows.routing`).
 */

import type { GanttOptions, GanttTask } from '@gantryjs/core';
import { planTasks } from '../data';
import type { GalleryCaseData, GalleryChoice } from '../types';

export type ArrowRouting = 'orthogonal' | 'straight';

export const DEPENDENCIES_ROUTINGS: readonly GalleryChoice<ArrowRouting>[] = [
  { value: 'orthogonal', label: 'Orthogonal' },
  { value: 'straight', label: 'Straight' },
];

export function dependenciesOptions(routing: ArrowRouting, criticalPath = true): GanttOptions {
  return {
    viewMode: 'Week',
    criticalPath,
    arrows: { routing },
    panel: { columns: ['name', 'start', 'end'] },
    labels: { ariaChart: 'Launch plan with dependencies' },
  };
}

/** The controls' first values: the arrows' routing and the critical-path switch */
export const DEPENDENCIES_INITIAL: { readonly routing: ArrowRouting; readonly criticalPath: boolean } = {
  routing: 'orthogonal',
  criticalPath: true,
};

export const DEPENDENCIES_OPTIONS = dependenciesOptions(
  DEPENDENCIES_INITIAL.routing,
  DEPENDENCIES_INITIAL.criticalPath,
);

export function dependenciesTasks(now?: Date): GanttTask[] {
  return planTasks(now);
}

/** The link types of the plan, for the legend under the chart. */
export const DEPENDENCY_LEGEND: readonly { type: string; label: string; example: string }[] = [
  { type: 'FS', label: 'Finish → start', example: 'Public API starts 2 days after Wireframes ends' },
  { type: 'SS', label: 'Start → start', example: 'Visual design starts 6 days after Wireframes starts' },
  { type: 'FF', label: 'Finish → finish', example: 'Documentation ends 2 days after Web app ends' },
  { type: 'SF', label: 'Start → finish', example: 'End-to-end tests end 6 days after Web app starts' },
  { type: 'FS −2', label: 'Lead', example: 'Survey analysis starts 2 days before Customer interviews ends' },
];

export const dependenciesCase: GalleryCaseData = {
  charts: now => [{ tasks: dependenciesTasks(now), options: DEPENDENCIES_OPTIONS }],
};
