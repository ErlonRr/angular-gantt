// ─────────────────────────────────────────────────────────────
//  gantry · resources/utilization.ts
//  The daily load of every resource, team and the unassigned tasks
//  (Phase 14, D7 / D8 / D15): percent of a full-time person per
//  local calendar day, against the capacity. A difference array per
//  row, so the cost is O(tasks + rows × days). Pure: no DOM.
// ─────────────────────────────────────────────────────────────

import { calendarDays, fromCalendarDays } from '../gantt-math';
import { taskSpan } from '../render/timeline';
import type { DateReading } from '../render/config';
import { TaskType, type GanttResource, type GanttTask } from '../types';
import {
  DEFAULT_ASSIGNMENT_UNITS,
  OVER_EPSILON,
  UNASSIGNED_ROW_ID,
  resourceCapacity,
  resourceGroup,
  resourceRowId,
  taskAssignments,
  teamRowId,
  type ResourceIndex,
} from './model';

/** The vertical scale never goes below this percent (so 100 % sits at two thirds of the plot or lower). */
export const LOAD_SCALE_FLOOR = 150;
/** The scale grows in steps of this many percent. */
export const LOAD_SCALE_STEP = 25;
/** The most days a utilization covers (a span past it is cut): bounds the memory of a stray date. */
export const MAX_LOAD_DAYS = 7_305;

/** The load of one row of the resource view. */
export interface ResourceLoad {
  /** `res:<id>` | `team:<group>` | `unassigned` (the id of the row's synthetic task) */
  key: string;
  kind: 'resource' | 'team' | 'unassigned';
  /** The resource of a resource row; `null` for a team and for the unassigned row */
  resource: GanttResource | null;
  /** Epoch-day index (local calendar days since 1970-01-01) of `loads[0]` */
  firstDay: number;
  /** Percent of a full-time person, one entry per day from `firstDay` (do not mutate) */
  loads: Float64Array;
  /** Percent available per working day (a team: the sum of its members'); `null` for the unassigned row */
  capacity: number | null;
  /** The highest load of a day (0 when idle) */
  peak: number;
  /** Epoch-day index of the first day at `peak` (`firstDay` when idle) */
  peakDay: number;
  /** Days with a load above the capacity (always 0 without a capacity) */
  overDays: number;
  /** Distinct tasks assigned to the row (work tasks with a drawn span: no group, milestone or zero-length task) */
  tasks: number;
}

export interface ResourceUtilization {
  /** Epoch-day index of the first day every `loads` array starts at */
  firstDay: number;
  /** Length of every `loads` array */
  days: number;
  rows: ReadonlyMap<string, ResourceLoad>;
  /** The highest load of any row's day (percent) */
  peak: number;
  /** The percent the plot's top stands for: `max(150, ceil(max(peak, highest capacity) / 25) × 25)` */
  scaleMax: number;
}

/** A task that carries load: its drawn span as epoch-day indexes (inclusive) and fractional days. */
export interface LoadTask {
  task: GanttTask;
  /** First and last day it touches (a task counts fully on its first and last day) */
  first: number;
  last: number;
  /** Start and end in fractional epoch days (`calendarDays`) */
  start: number;
  end: number;
}

/**
 * The tasks that carry load, with their days: not a group (`type: 'group'` or the parent of another task) and
 * not a milestone, with a valid drawn span of more than zero length (`taskSpan`: date-only values read in local
 * time, an inclusive midnight end covers its day).
 */
export function loadTasks(tasks: readonly GanttTask[], dates: DateReading): LoadTask[] {
  const parents = new Set<string>();
  for (const t of tasks) if (t.parentId && t.parentId !== t.id) parents.add(t.parentId);
  const out: LoadTask[] = [];
  for (const task of tasks) {
    const kind = task.type ?? task.barType;
    if (kind === TaskType.Group || kind === TaskType.Milestone || parents.has(task.id)) continue;
    const span = taskSpan(task, dates);
    const start = calendarDays(span.start, dates.normalizeDateOnly);
    const end = calendarDays(span.end, dates.normalizeDateOnly);
    if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start)) continue;
    out.push({ task, first: Math.floor(start), last: Math.ceil(end) - 1, start, end });
  }
  return out;
}

const isWorkingDay = (dates: DateReading, day: number): boolean =>
  dates.calendar ? dates.calendar.working.isWorkingDay(fromCalendarDays(day)) : true;

interface Acc {
  key: string;
  kind: ResourceLoad['kind'];
  resource: GanttResource | null;
  capacity: number | null;
  diff: Float64Array | null;
  tasks: number;
}

/**
 * The load of every resource and team (and of the unassigned tasks while `opts.unassigned`), per local calendar
 * day.
 *
 * - A work task adds its `units` (100 when left out) to every day of its drawn span to every resource it names;
 *   a team row adds up its members. With a working calendar only working days carry load (D15), else every day.
 * - A task that names no known resource adds 100 to the unassigned row.
 * - A resource's capacity is `capacity` (100 by default); a team's is the sum of its members'.
 * - Spans are cut to {@link MAX_LOAD_DAYS} days from the earliest start.
 */
export function computeResourceUtilization(
  tasks: readonly GanttTask[],
  index: ResourceIndex,
  dates: DateReading,
  opts: { unassigned: boolean },
): ResourceUtilization {
  const work = loadTasks(tasks, dates);
  let firstDay = 0;
  let days = 0;
  if (work.length > 0) {
    let min = Infinity;
    let max = -Infinity;
    for (const w of work) {
      if (w.first < min) min = w.first;
      if (w.last > max) max = w.last;
    }
    firstDay = min;
    days = Math.min(max - min + 1, MAX_LOAD_DAYS);
  }
  const lastDay = firstDay + days - 1;

  const accs = new Map<string, Acc>();
  for (const r of index.list) {
    accs.set(resourceRowId(r.id), {
      key: resourceRowId(r.id),
      kind: 'resource',
      resource: r,
      capacity: resourceCapacity(r),
      diff: null,
      tasks: 0,
    });
    const group = resourceGroup(r);
    if (group === null) continue;
    const team = accs.get(teamRowId(group));
    if (team) team.capacity = (team.capacity ?? 0) + resourceCapacity(r);
    else
      accs.set(teamRowId(group), {
        key: teamRowId(group),
        kind: 'team',
        resource: null,
        capacity: resourceCapacity(r),
        diff: null,
        tasks: 0,
      });
  }

  const add = (acc: Acc, from: number, to: number, units: number) => {
    const diff = (acc.diff ??= new Float64Array(days + 1));
    diff[from] = (diff[from] ?? 0) + units;
    diff[to] = (diff[to] ?? 0) - units;
  };
  let unassigned: Acc | null = null;
  for (const w of work) {
    const from = w.first - firstDay;
    if (from >= days) continue;
    const to = Math.min(w.last, lastDay) - firstDay + 1;
    const assignments = taskAssignments(w.task, index);
    if (assignments.length === 0) {
      if (!opts.unassigned) continue;
      unassigned ??= {
        key: UNASSIGNED_ROW_ID,
        kind: 'unassigned',
        resource: null,
        capacity: null,
        diff: null,
        tasks: 0,
      };
      unassigned.tasks++;
      add(unassigned, from, to, DEFAULT_ASSIGNMENT_UNITS);
      continue;
    }
    const teams = new Set<string>();
    for (const a of assignments) {
      const acc = accs.get(resourceRowId(a.resourceId)) as Acc;
      acc.tasks++;
      add(acc, from, to, a.units);
      const group = resourceGroup(acc.resource as GanttResource);
      if (group === null) continue;
      const team = accs.get(teamRowId(group)) as Acc;
      add(team, from, to, a.units);
      if (!teams.has(group)) {
        teams.add(group);
        team.tasks++;
      }
    }
  }
  if (unassigned) accs.set(unassigned.key, unassigned);

  // Working-day mask (D15)
  let working: Uint8Array | null = null;
  if (dates.calendar && days > 0) {
    working = new Uint8Array(days);
    for (let d = 0; d < days; d++) working[d] = isWorkingDay(dates, firstDay + d) ? 1 : 0;
  }

  const idle = new Float64Array(days);
  const rows = new Map<string, ResourceLoad>();
  let peak = 0;
  let maxCapacity = 0;
  for (const acc of accs.values()) {
    let loads = idle;
    let rowPeak = 0;
    let peakIndex = 0;
    let overDays = 0;
    const capacity = acc.capacity;
    if (acc.diff) {
      const diff = acc.diff;
      loads = new Float64Array(days);
      let sum = 0;
      for (let d = 0; d < days; d++) {
        sum += diff[d] ?? 0;
        // Float residue of adding and removing fractional units never shows as a load
        const v = working && !working[d] ? 0 : sum > 1e-9 ? sum : 0;
        loads[d] = v;
        if (v > rowPeak) {
          rowPeak = v;
          peakIndex = d;
        }
        if (capacity !== null && v > capacity + OVER_EPSILON) overDays++;
      }
    }
    if (rowPeak > peak) peak = rowPeak;
    if (capacity !== null && capacity > maxCapacity) maxCapacity = capacity;
    rows.set(acc.key, {
      key: acc.key,
      kind: acc.kind,
      resource: acc.resource,
      firstDay,
      loads,
      capacity,
      peak: rowPeak,
      peakDay: firstDay + peakIndex,
      overDays,
      tasks: acc.tasks,
    });
  }
  const scaleMax = Math.max(
    LOAD_SCALE_FLOOR,
    Math.ceil(Math.max(peak, maxCapacity) / LOAD_SCALE_STEP) * LOAD_SCALE_STEP,
  );
  return { firstDay, days, rows, peak, scaleMax };
}

/** The load of `row` on the epoch day `day` (0 outside its days). */
export function loadAt(load: Pick<ResourceLoad, 'firstDay' | 'loads'>, day: number): number {
  return load.loads[day - load.firstDay] ?? 0;
}

/** A task that carries load on a day, and the percent it takes. */
export interface LoadContributor {
  task: GanttTask;
  units: number;
}

/**
 * The tasks that add to the row `key` on the epoch day `day`, with the percent each takes (a team: the sum over
 * its members): the tooltip's rows. Biggest first, then by name. Nothing on a non-working day with a calendar.
 */
export function contributorsAt(
  tasks: readonly GanttTask[],
  index: ResourceIndex,
  dates: DateReading,
  key: string,
  day: number,
): LoadContributor[] {
  if (!isWorkingDay(dates, day)) return [];
  const out: LoadContributor[] = [];
  const resourceId = key.startsWith('res:') ? key.slice(4) : null;
  const group = key.startsWith('team:') ? key.slice(5) : null;
  for (const w of loadTasks(tasks, dates)) {
    if (day < w.first || day > w.last) continue;
    const assignments = taskAssignments(w.task, index);
    let units = 0;
    if (key === UNASSIGNED_ROW_ID) units = assignments.length === 0 ? DEFAULT_ASSIGNMENT_UNITS : 0;
    else if (resourceId !== null) units = assignments.find(a => a.resourceId === resourceId)?.units ?? 0;
    else if (group !== null)
      for (const a of assignments)
        if (resourceGroup(index.byId.get(a.resourceId) as GanttResource) === group) units += a.units;
    if (units > 0) out.push({ task: w.task, units });
  }
  return out.sort(
    (a, b) =>
      b.units - a.units ||
      (a.task.name < b.task.name ? -1 : a.task.name > b.task.name ? 1 : 0) ||
      (a.task.id < b.task.id ? -1 : a.task.id > b.task.id ? 1 : 0),
  );
}
