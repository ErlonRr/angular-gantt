/**
 * Case `custom-columns`: task-list cells from templates (in Angular an `<ng-template>` inside an
 * `<ng-container ganttColumn>`, elsewhere a `cellTemplate` returning a DOM node): the owner's
 * initials in an avatar, a priority badge and a progress meter. The column definitions below carry
 * plain-text `render` functions and sort rules; a template replaces only the cell.
 */

import type { ColumnDef, GanttFlatRow, GanttOptions, GanttTask } from '@gantryjs/core';
import { planTasks } from '../data';
import type { GalleryCaseData } from '../types';

export type Priority = 'low' | 'normal' | 'high';

export const PRIORITY_LABELS: Readonly<Record<Priority, string>> = { low: 'Low', normal: 'Normal', high: 'High' };

const OWNERS = ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Katherine Johnson', 'Linus Torvalds'] as const;

/** `'Ada Lovelace'` → `'AL'` */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0].toUpperCase())
    .slice(0, 2)
    .join('');
}

export const ownerOf = (row: GanttFlatRow): string => {
  const owner = row.task.data?.['owner'];
  return typeof owner === 'string' ? owner : '';
};
export const priorityOf = (row: GanttFlatRow): Priority => {
  const p = row.task.data?.['priority'];
  return p === 'low' || p === 'high' ? p : 'normal';
};

/** The columns (keys `owner`, `priority` and `meter` get a template in each framework). */
export const CUSTOM_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Task', width: 190 },
  { key: 'owner', label: 'Owner', width: 150, render: ownerOf, sortable: true, sortValue: ownerOf },
  {
    key: 'priority',
    label: 'Priority',
    width: 96,
    render: row => PRIORITY_LABELS[priorityOf(row)],
    sortable: true,
    sortValue: row => ['low', 'normal', 'high'].indexOf(priorityOf(row)),
  },
  { key: 'meter', label: 'Progress', width: 130, render: row => `${row.task.progress ?? 0} %` },
];

export const CUSTOM_COLUMNS_OPTIONS: GanttOptions = {
  viewMode: 'Week',
  // The four columns (566 px) plus the cell padding and the scrollbar
  panel: { width: 600 },
  labels: { ariaChart: 'Launch plan with owners' },
};

/** The plan with an owner and a priority on every task (`data.owner`, `data.priority`). */
export function customColumnsTasks(now?: Date): GanttTask[] {
  const priorities: Priority[] = ['high', 'normal', 'low', 'normal'];
  return planTasks(now).map((t, i) => ({
    ...t,
    data: { ...t.data, owner: OWNERS[i % OWNERS.length], priority: priorities[i % priorities.length] },
  }));
}

export const customColumnsCase: GalleryCaseData = {
  charts: now => [{ tasks: customColumnsTasks(now), options: { ...CUSTOM_COLUMNS_OPTIONS, columns: CUSTOM_COLUMNS } }],
};
