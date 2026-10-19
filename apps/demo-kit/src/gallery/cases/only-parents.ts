/**
 * Case `only-parents`: every parent starts collapsed (`groupBar.collapsed`) and rolls up the
 * progress and the dates of its children (`rollup`). The parents of this plan only know their
 * start, so with the rollup switched off they show a one-week bar at 0 %.
 */

import { addDays, type GanttOptions, type GanttTask } from '@gantryjs/core';
import { treeTasks } from '../data';
import type { GalleryCaseData } from '../types';

/** The switch "Roll up children" starts on */
export const ONLY_PARENTS_INITIAL_ROLLUP = true;

export const ONLY_PARENTS_OPTIONS: GanttOptions = {
  viewMode: 'Week',
  rollup: ONLY_PARENTS_INITIAL_ROLLUP,
  groupBar: { collapsed: true },
  panel: { width: 300, columns: ['name', 'progress'] },
  labels: { ariaChart: 'Programmes, parents only' },
};

/** The switch: the same options without the rollup */
export function onlyParentsOptions(rollup: boolean): GanttOptions {
  return { ...ONLY_PARENTS_OPTIONS, rollup };
}

/** The tree with parents that know only their start: one week long, no progress. */
export function onlyParentsTasks(now?: Date): GanttTask[] {
  const tasks = treeTasks(now);
  const parents = new Set(tasks.map(t => t.parentId).filter(Boolean));
  return tasks.map(t => (parents.has(t.id) ? { ...t, end: addDays(t.start, 7), progress: 0 } : t));
}

export const onlyParentsCase: GalleryCaseData = {
  charts: now => [{ tasks: onlyParentsTasks(now), options: ONLY_PARENTS_OPTIONS }],
};
