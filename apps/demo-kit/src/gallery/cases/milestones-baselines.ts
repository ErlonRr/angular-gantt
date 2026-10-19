/**
 * Case `milestones-baselines`: milestones in three shapes (`milestone.shape`) and baseline bars
 * (`baseline`) that show the planned dates under the actual ones; the Variance column of the
 * task list reads the difference.
 */

import { addDays, type GanttOptions, type GanttTask } from '@gantryjs/core';
import { planTasks } from '../data';
import type { GalleryCaseData, GalleryChoice } from '../types';

export type MilestoneShape = 'diamond' | 'circle' | 'square';

export const MILESTONE_SHAPES: readonly GalleryChoice<MilestoneShape>[] = [
  { value: 'diamond', label: 'Diamond' },
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
];

export function milestonesBaselinesOptions(shape: MilestoneShape, baseline: boolean): GanttOptions {
  return {
    viewMode: 'Week',
    baseline,
    milestone: { shape },
    panel: { columns: baseline ? ['name', 'end', 'variance'] : ['name', 'start', 'end'] },
    labels: { ariaChart: 'Launch plan with baselines' },
  };
}

/** The controls' first values: the milestone shape and the baselines switch */
export const MILESTONES_BASELINES_INITIAL: { readonly shape: MilestoneShape; readonly baseline: boolean } = {
  shape: 'diamond',
  baseline: true,
};

export const MILESTONES_BASELINES_OPTIONS = milestonesBaselinesOptions(
  MILESTONES_BASELINES_INITIAL.shape,
  MILESTONES_BASELINES_INITIAL.baseline,
);

/** How many days each task slipped against its plan (negative: early). */
const SLIP: Readonly<Record<string, number>> = {
  interviews: 0,
  survey: 2,
  wireframes: 3,
  visual: 4,
  'design-review': 4,
  api: -2,
  web: 6,
  docs: 6,
  tests: 5,
  beta: 3,
  launch: 5,
};

/** The plan with a baseline (the planned dates) on every task that slipped or ran early. */
export function milestonesBaselinesTasks(now?: Date): GanttTask[] {
  return planTasks(now).map(t => {
    const slip = SLIP[t.id];
    return slip === undefined ? t : { ...t, baseline: { start: addDays(t.start, -slip), end: addDays(t.end, -slip) } };
  });
}

export const milestonesBaselinesCase: GalleryCaseData = {
  charts: now => [{ tasks: milestonesBaselinesTasks(now), options: MILESTONES_BASELINES_OPTIONS }],
};
