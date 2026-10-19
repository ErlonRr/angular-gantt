/**
 * Case `tree`: three levels of parents and children (`treeTasks` from the gallery data). Buttons
 * collapse or expand every row (`collapseAll()` / `expandAll()`), a toggle on each parent row
 * does one; the zoom level is echoed from `viewModeChange`, whose payload differs in Angular.
 */

import type { GanttOptions } from '@gantryjs/core';
import { treeTasks } from '../data';
import type { GalleryCaseData } from '../types';

export const TREE_VIEW_MODE = 'Week';

export const TREE_OPTIONS: GanttOptions = {
  viewMode: TREE_VIEW_MODE,
  panel: { width: 300, columns: ['name', 'progress'] },
  labels: { ariaChart: 'Programmes' },
};

/** The two buttons of the case, in order */
export const TREE_ACTIONS = [
  { method: 'expandAll', label: 'Expand all' },
  { method: 'collapseAll', label: 'Collapse all' },
] as const;

export const treeCase: GalleryCaseData = {
  charts: now => [{ tasks: treeTasks(now), options: TREE_OPTIONS }],
};
