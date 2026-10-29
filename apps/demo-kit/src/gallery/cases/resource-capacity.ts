/**
 * Case `resource-capacity`: capacity and working time. Ana works part-time (pick her capacity), the
 * Engineering team is two people, and one task runs across a weekend and a holiday. With the
 * working calendar on, days off carry no load; changing Ana's capacity moves the line, and with it
 * the days she is over-allocated.
 */

import {
  addDays,
  computeResourceUtilization,
  dateReadingOf,
  indexResources,
  resolveConfig,
  resourceRowId,
  type GanttHoliday,
  type GanttOptions,
  type GanttResource,
  type GanttTask,
} from '@gantryjs/core';
import { workWeekStart } from '../data';
import type { GalleryCaseData, GalleryChoice } from '../types';

export const CAPACITIES: readonly GalleryChoice<number>[] = [
  { value: 50, label: '50 %' },
  { value: 100, label: '100 %' },
  { value: 150, label: '150 %' },
];

export interface CapacityState {
  /** Ana's capacity, percent of a full-time person per working day (`resources[].capacity`) */
  anaCapacity: number;
  /** Working time drives the load: the weekend and the holiday carry none (`calendar`) */
  calendar: boolean;
}

/** The controls' first values */
export const CAPACITY_INITIAL: CapacityState = { anaCapacity: 50, calendar: true };

/** Ana at the capacity picked, then Cy and Di, a team of two (a team capacity of 200 %) */
export function capacityResources(state: CapacityState): GanttResource[] {
  return [
    { id: 'ana', name: 'Ana', capacity: state.anaCapacity },
    { id: 'cy', name: 'Cy', group: 'Engineering', capacity: 100 },
    { id: 'di', name: 'Di', group: 'Engineering', capacity: 100 },
  ];
}

/** The holiday: the Wednesday of the second week */
export function capacityHolidays(now: Date = new Date()): GanttHoliday[] {
  return [{ start: addDays(workWeekStart(now), 9), label: 'Public holiday' }];
}

/**
 * Five date-only tasks from the Monday of `now`'s week. Ana works full-time in sequence: the brief
 * (Monday to Wednesday), then a proposal that runs across the weekend and the holiday. Cy takes
 * the build and, from Tuesday, half of a review on top of it: 150 % for Cy, while the team of two
 * stays under its 200 %. Di tests over the weekend too.
 */
export function capacityTasks(now: Date = new Date()): GanttTask[] {
  const monday = workWeekStart(now);
  const d = (offset: number) => addDays(monday, offset);
  return [
    { id: 'brief', name: 'Client brief', start: d(0), end: d(3), progress: 100, resources: ['ana'] },
    { id: 'proposal', name: 'Proposal', start: d(3), end: d(10), progress: 30, resources: ['ana'] },
    { id: 'build', name: 'Build', start: d(0), end: d(5), progress: 60, resources: ['cy'] },
    {
      id: 'review',
      name: 'Review',
      start: d(1),
      end: d(4),
      progress: 20,
      resources: [{ resourceId: 'cy', units: 50 }],
    },
    { id: 'qa', name: 'QA', start: d(4), end: d(9), progress: 0, resources: ['di'] },
  ];
}

export function capacityOptions(state: CapacityState, now: Date = new Date()): GanttOptions {
  return {
    rows: 'resources',
    calendar: state.calendar ? true : undefined,
    nonWorkingTime: { holidays: capacityHolidays(now) },
    resourceView: {},
    panel: { columns: ['name', 'capacity', 'load'], width: 380 },
    viewMode: 'Day',
    initialScroll: 'start',
    labels: { ariaChart: 'Capacity plan' },
  };
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/**
 * "Ana: peak 100 % of 50 % capacity, 7 days over": Ana's busiest day, her capacity and how many
 * days go above it, on the days `options` read (with the calendar on, the days off carry nothing).
 */
export function capacitySummary(
  tasks: readonly GanttTask[],
  resources: readonly GanttResource[],
  options: GanttOptions,
): string {
  const index = indexResources(resources);
  const dates = dateReadingOf(resolveConfig(options));
  const { rows } = computeResourceUtilization(tasks, index, dates, { unassigned: false });
  const ana = rows.get(resourceRowId('ana'));
  if (!ana) return 'Ana has no load';
  return `Ana: peak ${Math.round(ana.peak)} % of ${ana.capacity} % capacity, ${plural(ana.overDays, 'day')} over`;
}

export const CAPACITY_HINT =
  'Part-time and team capacity move the line; with the working calendar on, weekends and the holiday carry no load.';

export const resourceCapacityCase: GalleryCaseData = {
  charts: now => [
    {
      tasks: capacityTasks(now),
      options: capacityOptions(CAPACITY_INITIAL, now),
      resources: capacityResources(CAPACITY_INITIAL),
    },
  ],
};
