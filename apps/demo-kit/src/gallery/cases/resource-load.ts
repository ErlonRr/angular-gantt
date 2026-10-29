/**
 * Case `resource-load`: one chart, two row modes. `rows: 'tasks'` is the plan with a Resources
 * column; `rows: 'resources'` gives each person and team a row that draws the daily load against
 * the capacity line, the part above the line hatched (`overallocatedColor`). The toolbar toggle
 * (`toolbar.rowsToggle`) and the Rows control flip the mode, and "Unassigned" collects the tasks
 * nobody works on.
 */

import {
  DependencyType,
  addDays,
  computeResourceUtilization,
  dateReadingOf,
  formatDate,
  fromCalendarDays,
  indexResources,
  resolveConfig,
  resourceRowId,
  type GanttOptions,
  type GanttResource,
  type GanttRowsMode,
  type GanttTask,
} from '@gantryjs/core';
import { workWeekStart } from '../data';
import type { GalleryCaseData, GalleryChoice } from '../types';

export const RESOURCE_ROWS: readonly GalleryChoice<GanttRowsMode>[] = [
  { value: 'tasks', label: 'Tasks' },
  { value: 'resources', label: 'Resources' },
];

export const LOAD_SCALES: readonly GalleryChoice<'Day' | 'Week'>[] = [
  { value: 'Day', label: 'Days' },
  { value: 'Week', label: 'Weeks' },
];

export interface ResourceLoadState {
  /** What the rows are (`rows`); follows the chart's own toolbar toggle (`state-change`) */
  rows: GanttRowsMode;
  /** The "Unassigned" row (`resourceView.unassigned`) */
  unassigned: boolean;
  /** The load above the capacity is highlighted (`resourceView.overallocation`) */
  overallocation: boolean;
  /** `'Day'` or `'Week'`, or the level picked in the chart's own toolbar */
  viewMode: string;
}

/** The controls' first values */
export const RESOURCE_LOAD_INITIAL: ResourceLoadState = {
  rows: 'resources',
  unassigned: true,
  overallocation: true,
  viewMode: 'Day',
};

/**
 * Five resources: Ana and Bo (half-time) in Design, Cy and Di in Engineering, and Ed, who stands
 * for a pair of contractors (a capacity of 200 %) and belongs to no team.
 */
export function loadResources(): GanttResource[] {
  return [
    { id: 'ana', name: 'Ana', group: 'Design', capacity: 100 },
    { id: 'bo', name: 'Bo', group: 'Design', capacity: 50 },
    { id: 'cy', name: 'Cy', group: 'Engineering', capacity: 100 },
    { id: 'di', name: 'Di', group: 'Engineering', capacity: 100 },
    { id: 'ed', name: 'Ed', capacity: 200 },
  ];
}

/**
 * Nine date-only tasks over three weeks from the Monday of `now`'s week, with assignments: the
 * architecture task takes two people, the prototype half of Ana's time, and launch prep nobody.
 * Bo (capacity 50 %) is over capacity all the first week, and Ana reaches 150 % from Wednesday of
 * the second week, when the prototype overlaps the design system.
 */
export function loadTasks(now: Date = new Date()): GanttTask[] {
  const monday = workWeekStart(now);
  const d = (offset: number) => addDays(monday, offset);
  const after = (taskId: string) => ({ taskId, type: DependencyType.FS });
  return [
    { id: 'discovery', name: 'Discovery', start: d(0), end: d(5), progress: 100, resources: ['ana'] },
    { id: 'wireframes', name: 'Wireframes', start: d(0), end: d(5), progress: 100, resources: ['bo'] },
    { id: 'architecture', name: 'Architecture', start: d(0), end: d(5), progress: 100, resources: ['cy', 'di'] },
    {
      id: 'design-system',
      name: 'Design system',
      start: d(7),
      end: d(12),
      progress: 60,
      dependency: after('discovery'),
      resources: ['ana'],
    },
    {
      id: 'prototype',
      name: 'Prototype',
      start: d(9),
      end: d(12),
      progress: 20,
      resources: [{ resourceId: 'ana', units: 50 }],
    },
    {
      id: 'api',
      name: 'API',
      start: d(7),
      end: d(12),
      progress: 40,
      dependency: after('architecture'),
      resources: ['cy'],
    },
    {
      id: 'build',
      name: 'Build with contractors',
      start: d(14),
      end: d(19),
      progress: 0,
      dependency: after('api'),
      resources: [{ resourceId: 'ed', units: 150 }],
    },
    { id: 'testing', name: 'Testing', start: d(16), end: d(19), progress: 0, resources: ['di'] },
    { id: 'launch-prep', name: 'Launch prep', start: d(14), end: d(19), progress: 0 },
  ];
}

export function loadOptions(state: ResourceLoadState, _now?: Date): GanttOptions {
  return {
    rows: state.rows,
    resourceView: { unassigned: state.unassigned, overallocation: state.overallocation },
    viewMode: state.viewMode,
    toolbar: { rowsToggle: true },
    panel: {
      columns: state.rows === 'resources' ? ['name', 'capacity', 'load'] : ['name', 'start', 'duration', 'resources'],
      width: 400,
    },
    initialScroll: 'start',
    labels: { ariaChart: 'Team workload' },
  };
}

/**
 * "2 resources over capacity: Ana (150 % on Wed 21 Oct), Bo (100 % on Mon 12 Oct)": the people
 * whose load goes above their capacity (not the teams), each with its peak and the first day of
 * it; "No resource is over capacity" otherwise. Counted on the days `options` read (a calendar
 * skips the days off); the Highlight switch only changes the painting, not this text.
 */
export function overloadSummary(
  tasks: readonly GanttTask[],
  resources: readonly GanttResource[],
  options: GanttOptions,
): string {
  const index = indexResources(resources);
  const dates = dateReadingOf(resolveConfig(options));
  const { rows } = computeResourceUtilization(tasks, index, dates, { unassigned: false });
  const over = index.list.flatMap(r => {
    const load = rows.get(resourceRowId(r.id));
    return load && load.overDays > 0 ? [`${r.name} (${Math.round(load.peak)} % on ${formatDay(load.peakDay)})`] : [];
  });
  if (over.length === 0) return 'No resource is over capacity';
  return `${over.length} ${over.length === 1 ? 'resource' : 'resources'} over capacity: ${over.join(', ')}`;
}

/** "Wed 21 Oct" for an epoch-day index */
function formatDay(epochDay: number): string {
  return formatDate(fromCalendarDays(epochDay), 'ddd D MMM');
}

export const RESOURCE_LOAD_HINT =
  'Switch Rows to Resources: each person gets a daily load bar against their capacity line; the hatched part is the work above it. Hover a day to see which tasks add up to it.';

export const resourceLoadCase: GalleryCaseData = {
  charts: now => [
    {
      tasks: loadTasks(now),
      options: loadOptions(RESOURCE_LOAD_INITIAL, now),
      resources: loadResources(),
    },
  ],
};
