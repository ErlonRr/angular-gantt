/**
 * Case `large`: 10,000 tasks in workstreams of 25 rows (`largeTasks`), virtualised in both panes.
 * Build the plan once and keep it out of deep reactivity (Svelte `$state.raw`, a stable React
 * value, a Vue `shallowRef`, an Angular signal set once).
 */

import type { GanttOptions, GanttTask } from '@gantryjs/core';
import { largeTasks } from '../data';
import type { GalleryCaseData, GalleryChoice } from '../types';

export const LARGE_COUNTS: readonly GalleryChoice<number>[] = [
  { value: 1_000, label: '1,000' },
  { value: 5_000, label: '5,000' },
  { value: 10_000, label: '10,000' },
];

export const LARGE_COUNT = 10_000;
export const LARGE_SEED = 42;

export const LARGE_OPTIONS: GanttOptions = {
  viewMode: 'Month',
  density: 'compact',
  panel: { columns: ['name', 'start', 'end', 'progress'] },
  labels: { ariaChart: 'Ten thousand tasks' },
};

export function largeCaseTasks(count: number = LARGE_COUNT, now?: Date): GanttTask[] {
  return largeTasks(count, LARGE_SEED, now);
}

export const largeCase: GalleryCaseData = {
  charts: now => [{ tasks: largeCaseTasks(LARGE_COUNT, now), options: LARGE_OPTIONS }],
};
