/**
 * Case `resource-panel`: the plan on top with an editable Resources column and, synchronised below
 * it, the workload of the same tasks (`rows: 'resources'`). Type `Ana, Bo 50%` in a task's
 * Resources cell and the load rows below follow. Both charts share one sync group, as in
 * `multi-pipeline`, so they scroll and zoom together.
 */

import type { GanttOptions, GanttResource, GanttTask } from '@gantryjs/core';
import type { GalleryCaseData } from '../types';
import { loadResources, loadTasks } from './resource-load';

export interface PanelState {
  /** The workload chart's "Unassigned" row (`resourceView.unassigned`) */
  unassigned: boolean;
}

/** The controls' first values */
export const PANEL_INITIAL: PanelState = { unassigned: true };

/** The same five resources as `resource-load` (a fresh array) */
export function panelResources(): GanttResource[] {
  return loadResources();
}

/**
 * The plan of `resource-load` (a fresh array): both charts and the status line read the array the
 * case keeps, which each edit of the top chart replaces.
 */
export function panelTasks(now: Date = new Date()): GanttTask[] {
  return loadTasks(now);
}

/** The plan: assignments editable in the Resources cell, nothing else */
export function panelTopOptions(_now?: Date): GanttOptions {
  return {
    editing: { cells: true, progress: false, dependencies: false },
    panel: { columns: ['name', 'start', 'duration', 'resources'], width: 440 },
    viewMode: 'Day',
    initialScroll: 'start',
    labels: { ariaChart: 'Plan' },
  };
}

/** The workload: one load row per person and team, read-only */
export function panelBottomOptions(state: PanelState, _now?: Date): GanttOptions {
  return {
    rows: 'resources',
    resourceView: { unassigned: state.unassigned },
    panel: { columns: ['name', 'load'], width: 440 },
    viewMode: 'Day',
    initialScroll: 'start',
    labels: { ariaChart: 'Workload' },
  };
}

export const PANEL_HINT =
  'Edit a task’s Resources cell (try Ana, Bo 50%): the workload chart below is synchronised and follows.';

export const resourcePanelCase: GalleryCaseData = {
  charts: now => [
    {
      caption: 'Plan',
      tasks: panelTasks(now),
      options: panelTopOptions(now),
      resources: panelResources(),
    },
    {
      caption: 'Workload',
      tasks: panelTasks(now),
      options: panelBottomOptions(PANEL_INITIAL, now),
      resources: panelResources(),
      showToolbar: false,
    },
  ],
  sync: true,
};
