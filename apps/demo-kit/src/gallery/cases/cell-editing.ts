/**
 * Case `cell-editing`: the built-in cell editors of the task list, beside the chart or as a table
 * (`view`). F2, Enter, a double-click or typing starts an editor; Enter saves, Tab saves and edits
 * the next cell, Escape cancels. Start keeps the duration, End and Duration resize, % takes 0 to
 * 100, and Predecessors reads task ids or names with a type and a lag ("research FS+2d"). An
 * invalid value keeps the editor open with `aria-invalid` and its message.
 */

import type { GanttOptions, GanttTask } from '@gantryjs/core';
import { planTasks } from '../data';
import type { GalleryCaseData, GalleryChoice } from '../types';

export type CellEditingView = 'split' | 'table';

export const CELL_EDITING_VIEWS: readonly GalleryChoice<CellEditingView>[] = [
  { value: 'split', label: 'Table and chart' },
  { value: 'table', label: 'Table only' },
];

/** The editable columns, in both views */
const COLUMNS = ['name', 'start', 'end', 'duration', 'progress', 'predecessors'];

export function cellEditingOptions(view: CellEditingView): GanttOptions {
  return {
    viewMode: 'Week',
    view,
    // Every editing surface on: the Predecessors cell adds and removes links (replacing a
    // predecessor removes the old link, so it needs `dependencies.delete` as well as `create`)
    editing: true,
    panel: { width: 680, columns: COLUMNS },
    table: { columns: COLUMNS },
    labels: { ariaChart: 'Launch plan with editable cells' },
  };
}

/** The control's first value: the view */
export const CELL_EDITING_INITIAL: { readonly view: CellEditingView } = { view: 'split' };

export const CELL_EDITING_OPTIONS = cellEditingOptions(CELL_EDITING_INITIAL.view);

/** The key map under the chart: the keys and what they do in a cell */
export const CELL_EDITING_KEYS: readonly { keys: readonly string[]; action: string }[] = [
  { keys: ['F2', 'Enter'], action: 'Edit the focused cell (or double-click it)' },
  { keys: ['A–Z', '0–9'], action: 'Start editing with the typed character' },
  { keys: ['Enter'], action: 'Save and go back to the cell' },
  { keys: ['Tab', 'Shift+Tab'], action: 'Save and edit the next or previous cell' },
  { keys: ['Escape'], action: 'Cancel the edit' },
];

export const CELL_EDITING_HINT = 'Try 150 in %, an end before the start, or “research FS+2d” in Predecessors.';

export function cellEditingTasks(now?: Date): GanttTask[] {
  return planTasks(now);
}

export const cellEditingCase: GalleryCaseData = {
  charts: now => [{ tasks: cellEditingTasks(now), options: CELL_EDITING_OPTIONS }],
};
