// ─────────────────────────────────────────────────────────────
//  gantry · resources/rows.ts
//  The rows of the resource view (Phase 14, D5 / D6): one synthetic
//  task per team, per resource and for the unassigned tasks, so the
//  chart's row pipeline (tree, windowing, selection, columns, export)
//  runs on them unchanged. Pure: no DOM.
// ─────────────────────────────────────────────────────────────

import { fromCalendarDays } from '../gantt-math';
import type { DateReading, ResolvedGanttConfig } from '../render/config';
import { TaskType, type GanttLabels, type GanttResource, type GanttRowsMode, type GanttTask } from '../types';
import {
  UNASSIGNED_ROW_ID,
  indexResources,
  resourceGroup,
  resourceRowId,
  taskAssignments,
  teamRowId,
  type ResourceIndex,
} from './model';
import { computeResourceUtilization, loadTasks, type ResourceLoad, type ResourceUtilization } from './utilization';

export { UNASSIGNED_ROW_ID, resourceRowId, teamRowId } from './model';

/** The `bar type` of every synthetic row (no bar is drawn for it). */
export const RESOURCE_BAR_TYPE = 'resource';

/** What a synthetic row knows about its resource: `task.data.resource`. */
export interface ResourceRowInfo {
  kind: 'resource' | 'team' | 'unassigned';
  /** The resource id; `null` for a team and the unassigned row */
  id: string | null;
  name: string;
  /** Percent available per working day; `null` for the unassigned row */
  capacity: number | null;
  /** The highest load of a day (percent) */
  peak: number;
  /** The first day at `peak`; `null` while idle */
  peakDay: Date | null;
  /** Days with a load above the capacity */
  overDays: number;
  /** Distinct tasks assigned */
  tasks: number;
}

const KINDS: readonly string[] = ['resource', 'team', 'unassigned'];

/** The resource info of a synthetic row, or `null` for any other task. */
export function resourceInfoOf(task: Pick<GanttTask, 'data'>): ResourceRowInfo | null {
  const info = task.data?.['resource'] as Partial<ResourceRowInfo> | undefined;
  return info && typeof info === 'object' && typeof info.kind === 'string' && KINDS.includes(info.kind)
    ? (info as ResourceRowInfo)
    : null;
}

export interface ProjectResourceRowsInput {
  tasks: readonly GanttTask[];
  index: ResourceIndex;
  utilization: ResourceUtilization;
  view: Pick<ResolvedGanttConfig['resourceView'], 'unassigned'>;
  labels: Pick<GanttLabels, 'resUnassigned'>;
  dates: DateReading;
}

/**
 * The synthetic rows of the resource view, in the app's order: a team row where its first member is (its
 * members under it), the other resources as they are listed, the "Unassigned" row last and only when it has
 * tasks. Each is a read-only task (`editable` and `draggable` false, `barType: 'resource'`) whose `data.resource`
 * is its {@link ResourceRowInfo}; a team is a `group`, a member's `parentId` its team row.
 *
 * Dates: the extent of the row's assigned tasks as the app wrote them (a team: its members'), else the plan's
 * extent collapsed to its first day. Feed them to `flattenTree(…, { order: 'input' })`.
 */
export function projectResourceRows(input: ProjectResourceRowsInput): GanttTask[] {
  const { tasks, index, utilization, view, labels, dates } = input;

  // Extent of each row: the raw dates of its earliest start and latest end
  interface Extent {
    start: Date;
    end: Date;
    s: number;
    e: number;
  }
  const extents = new Map<string, Extent>();
  const widen = (key: string, w: { task: GanttTask; start: number; end: number }) => {
    const x = extents.get(key);
    const end = w.task.end ?? w.task.start;
    if (!x) extents.set(key, { start: w.task.start, end, s: w.start, e: w.end });
    else {
      if (w.start < x.s) {
        x.s = w.start;
        x.start = w.task.start;
      }
      if (w.end > x.e) {
        x.e = w.end;
        x.end = end;
      }
    }
  };
  for (const w of loadTasks(tasks, dates)) {
    widen('plan', w);
    const assignments = taskAssignments(w.task, index);
    if (assignments.length === 0) widen(UNASSIGNED_ROW_ID, w);
    for (const a of assignments) {
      widen(resourceRowId(a.resourceId), w);
      const group = resourceGroup(index.byId.get(a.resourceId) as GanttResource);
      if (group !== null) widen(teamRowId(group), w);
    }
  }
  const plan = extents.get('plan');
  const fallback = plan?.start ?? fromCalendarDays(utilization.firstDay);

  const row = (load: ResourceLoad, name: string, parentId?: string): GanttTask => {
    const x = extents.get(load.key);
    const peakDay = load.peak > 0 ? fromCalendarDays(load.peakDay) : null;
    const info: ResourceRowInfo = {
      kind: load.kind,
      id: load.resource?.id ?? null,
      name,
      capacity: load.capacity,
      peak: load.peak,
      peakDay,
      overDays: load.overDays,
      tasks: load.tasks,
    };
    return {
      id: load.key,
      name,
      start: x ? x.start : fallback,
      end: x ? x.end : fallback,
      ...(load.kind === 'team' ? { type: TaskType.Group } : {}),
      ...(parentId !== undefined ? { parentId } : {}),
      barType: RESOURCE_BAR_TYPE,
      draggable: false,
      editable: false,
      data: { resource: info },
    };
  };

  const out: GanttTask[] = [];
  const teams = new Set<string>();
  for (const r of index.list) {
    const group = resourceGroup(r);
    let parentId: string | undefined;
    if (group !== null) {
      parentId = teamRowId(group);
      if (!teams.has(group)) {
        teams.add(group);
        const team = utilization.rows.get(parentId);
        if (team) out.push(row(team, group));
      }
    }
    const load = utilization.rows.get(resourceRowId(r.id));
    if (load) out.push(row(load, r.name, parentId));
  }
  const unassigned = view.unassigned ? utilization.rows.get(UNASSIGNED_ROW_ID) : undefined;
  if (unassigned && unassigned.tasks > 0) out.push(row(unassigned, labels.resUnassigned));
  return out;
}

export interface ResourceViewInput {
  rows: GanttRowsMode;
  tasks: readonly GanttTask[];
  resources: readonly GanttResource[] | undefined;
  dates: DateReading;
  view: Pick<ResolvedGanttConfig['resourceView'], 'unassigned'>;
  labels: Pick<GanttLabels, 'resUnassigned'>;
}

export interface ResourceView {
  /** The synthetic rows (feed `flattenTree(tasks, collapsed, { order: 'input' })`) */
  tasks: GanttTask[];
  index: ResourceIndex;
  utilization: ResourceUtilization;
}

/**
 * Everything the resource view needs in one call, for headless callers (the export source): the index, the
 * utilization and the projected rows; `null` while `rows` is `'tasks'`. The bindings build the same three
 * with separate cached nodes.
 */
export function resourceViewTasks(input: ResourceViewInput): ResourceView | null {
  if (input.rows !== 'resources') return null;
  const index = indexResources(input.resources);
  const utilization = computeResourceUtilization(input.tasks, index, input.dates, {
    unassigned: input.view.unassigned,
  });
  const tasks = projectResourceRows({
    tasks: input.tasks,
    index,
    utilization,
    view: input.view,
    labels: input.labels,
    dates: input.dates,
  });
  return { tasks, index, utilization };
}
