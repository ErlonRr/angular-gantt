/**
 * Case `custom-editors`: cells edited with your own rules. Owner is a built-in `select` over a
 * list, Estimate a `number` editor with your own `validate` (and no estimate on milestones), and
 * Colour your own editor: the shared column below reads and writes `style.color`
 * (`exportValue` / `parse`), and each framework adds its colour picker as the column's `editor`
 * (in Angular an `<ng-template ganttCellEditor>`). The page's buttons call `editCell()` and
 * `focusTask()`.
 */

import { TaskType, type ColumnDef, type GanttFlatRow, type GanttOptions, type GanttTask } from '@gantryjs/core';
import { TEAM_COLORS, planTasks, seedOf, type Team } from '../data';
import type { GalleryCaseData } from '../types';

export const OWNERS = ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Katherine Johnson', 'Linus Torvalds'] as const;

const ownerName = (row: GanttFlatRow): string => {
  const owner = row.task.data?.['owner'];
  return typeof owner === 'string' ? owner : '';
};

/** The estimate in hours (`data.estimate`), if any */
const estimateOf = (row: GanttFlatRow): number | undefined => {
  const hours = row.task.data?.['estimate'];
  return typeof hours === 'number' ? hours : undefined;
};

const colourOf = (row: GanttFlatRow): string => row.task.style?.color ?? '';

/**
 * The Colour column without its editor: the cell shows the hex colour, the editor starts from it
 * (`exportValue`) and its value becomes the bar's `style.color` (`parse`). Each framework spreads
 * it with its own `editor`.
 */
export const COLOUR_COLUMN: ColumnDef = {
  key: 'colour',
  label: 'Colour',
  width: 100,
  editable: true,
  render: colourOf,
  exportValue: colourOf,
  parse: (value, row) => {
    const color = value.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(color)) throw new Error('Enter a colour such as #2563eb');
    return { style: { ...row.task.style, color } };
  },
};

export const CUSTOM_EDITOR_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Task', width: 170 },
  {
    key: 'owner',
    label: 'Owner',
    width: 160,
    editable: true,
    render: ownerName,
    editor: 'select',
    editorOptions: { options: OWNERS.map(name => ({ value: name, label: name })) },
  },
  {
    key: 'estimate',
    label: 'Estimate',
    width: 110,
    align: 'end',
    // Milestones take no time
    editable: row => row.barType !== TaskType.Milestone,
    render: row => {
      const hours = estimateOf(row);
      return hours === undefined ? '' : `${hours} h`;
    },
    // The editor starts from the number alone, not the "12 h" of the cell
    exportValue: row => String(estimateOf(row) ?? ''),
    editor: 'number',
    editorOptions: { step: 1 },
    validate: patch => {
      const hours = patch.data?.['estimate'];
      return typeof hours === 'number' && hours >= 1 && hours <= 80 ? null : 'Between 1 and 80 hours';
    },
  },
  COLOUR_COLUMN,
];

export const CUSTOM_EDITORS_OPTIONS: GanttOptions = {
  viewMode: 'Week',
  // Cells only: the bars keep their drag and resize, without progress grips or link connectors
  editing: { progress: false, dependencies: false },
  // The four columns (540 px) plus the cell padding and the scrollbar
  panel: { width: 580 },
  labels: { ariaChart: 'Launch plan with owners and estimates' },
};

/** The task whose estimate the "Edit first estimate" button opens (`editCell`) */
export const CUSTOM_EDITORS_FIRST_TASK = 'interviews';
/** The milestone the "Focus the launch" button focuses (`focusTask`) */
export const CUSTOM_EDITORS_MILESTONE = 'launch';

export const CUSTOM_EDITORS_HINT =
  'Press F2 or double-click a cell: Owner opens a list, Estimate takes 1 to 80 hours (milestones have none), Colour opens a colour picker.';

/**
 * The launch plan without its phases (a flat list): every task with an owner (`data.owner`), an
 * estimate in hours (`data.estimate`, none on milestones) and its team's colour (`style.color`).
 */
export function customEditorsTasks(now?: Date): GanttTask[] {
  return planTasks(now)
    .filter(t => t.type !== TaskType.Group)
    .map(({ parentId: _parent, ...t }, i) => {
      const milestone = t.type === TaskType.Milestone;
      const team = t.data?.['team'] as Team | undefined;
      return {
        ...t,
        style: { color: TEAM_COLORS[team ?? 'platform'] },
        data: {
          ...t.data,
          owner: OWNERS[i % OWNERS.length],
          ...(milestone ? {} : { estimate: 8 + 4 * (seedOf(t.id) % 14) }),
        },
      };
    });
}

export const customEditorsCase: GalleryCaseData = {
  charts: now => [
    { tasks: customEditorsTasks(now), options: { ...CUSTOM_EDITORS_OPTIONS, columns: CUSTOM_EDITOR_COLUMNS } },
  ],
};
