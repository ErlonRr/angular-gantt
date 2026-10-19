/**
 * Case `states`: the chart's loading, empty and error states. A segmented control picks what the
 * chart shows; the empty state carries your own content (an "Add tasks" button), and Retry on the
 * error state (the `retry` event) brings the tasks back. The case starts on `'empty'`.
 */

import type { GanttOptions, GanttTask } from '@gantryjs/core';
import { planTasks } from '../data';
import type { GalleryCaseData, GalleryChoice } from '../types';

export type StatesMode = 'tasks' | 'empty' | 'loading' | 'error';

/** The segmented control: what the chart shows */
export const STATES_MODES: readonly GalleryChoice<StatesMode>[] = [
  { value: 'tasks', label: 'Tasks' },
  { value: 'empty', label: 'Empty' },
  { value: 'loading', label: 'Loading' },
  { value: 'error', label: 'Error' },
];

export const STATES_INITIAL_MODE: StatesMode = 'empty';

export const STATES_OPTIONS: GanttOptions = {
  viewMode: 'Week',
  labels: { ariaChart: 'Launch plan' },
};

/** Shown under the error title (`errorMessage`) */
export const STATES_ERROR_MESSAGE = 'The server did not answer (HTTP 503). Nothing was lost: try again.';

/** The custom empty content: this text and an "Add tasks" button that switches to `'tasks'` */
export const STATES_EMPTY_TEXT = 'This plan has no tasks yet.';
export const STATES_EMPTY_ACTION = 'Add tasks';

export function statesTasks(now?: Date): GanttTask[] {
  return planTasks(now);
}

/** No tasks: one shared empty list, so a mode change never hands the chart a new empty array */
const NO_TASKS: GanttTask[] = [];

/**
 * The chart props of a mode: `tasks` (built once per page with `statesTasks(now)`) only in
 * `'tasks'`; `loading` and `errorMessage` for their states.
 */
export function statesProps(
  mode: StatesMode,
  tasks: GanttTask[],
): { tasks: GanttTask[]; loading: boolean; errorMessage: string | null } {
  return {
    tasks: mode === 'tasks' ? tasks : NO_TASKS,
    loading: mode === 'loading',
    errorMessage: mode === 'error' ? STATES_ERROR_MESSAGE : null,
  };
}

export const statesCase: GalleryCaseData = {
  charts: now => [{ ...statesProps(STATES_INITIAL_MODE, statesTasks(now)), options: STATES_OPTIONS }],
};
