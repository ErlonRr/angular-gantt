/**
 * Case `editing`: move and resize bars (pointer, or Enter then arrow keys in move mode), drag the
 * progress grip or press ↑ / ↓ in move mode, then undo and redo (Ctrl/⌘+Z, the toolbar, or the
 * page's buttons calling `undo()` / `redo()`). The page lists the last changes from `tasks-change`
 * (`describeTasksChange` and `pushLog` of demo-kit/gallery) and enables its buttons from
 * `history-change`. Cells and links stay read-only here: the other editing cases show them.
 */

import type { GanttOptions, GanttTask } from '@gantryjs/core';
import { planTasks } from '../data';
import type { GalleryCaseData } from '../types';

export const EDITING_OPTIONS: GanttOptions = {
  viewMode: 'Week',
  editing: { cells: false, dependencies: false, progress: { step: 5 } },
  panel: { columns: ['name', 'start', 'end', 'progress'] },
  labels: { ariaChart: 'Release plan, editable' },
};

export function editingTasks(now?: Date): GanttTask[] {
  return planTasks(now);
}

export const editingCase: GalleryCaseData = {
  charts: now => [{ tasks: editingTasks(now), options: EDITING_OPTIONS }],
};
