// ─────────────────────────────────────────────────────────────
//  Tests — Phase 14 (step 1.2): the synthetic rows of the resource
//  view. One read-only task per team, per resource and for the
//  unassigned tasks, in the app's order, teams where their first
//  member is, ids unique and never a real task id, dates from the
//  assigned tasks as the app wrote them, `data.resource` for the
//  columns and the accessible name. October 2026: Monday the 12th.
//  Dates are built with `new Date(y, m, d)`: every assertion holds in
//  any time zone (`pnpm test:tz`).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  RESOURCE_BAR_TYPE,
  computeResourceUtilization,
  flattenTree,
  fromCalendarDays,
  indexResources,
  projectResourceRows,
  resourceInfoOf,
  resourceViewTasks,
  type DateReading,
  type GanttResource,
  type GanttTask,
} from '../index';
import { epochDayOf } from './calendar-oracle';

const PLAIN: DateReading = { endDateMode: 'exclusive', normalizeDateOnly: true };
const oct = (day: number, h = 0): Date => new Date(2026, 9, day, h);
const LABELS = { resUnassigned: 'Unassigned' };

const RESOURCES: GanttResource[] = [
  { id: 'ana', name: 'Ana' },
  { id: 'bo', name: 'Bo', group: 'Eng', capacity: 50 },
  { id: 'cy', name: 'Cy', group: 'Eng' },
  { id: 'di', name: 'Di' },
  { id: 'ed', name: 'Ed', group: 'Ops', capacity: 200 },
];
const t = (id: string, from: Date, to: Date, extra: Partial<GanttTask> = {}): GanttTask => ({
  id,
  name: `Task ${id}`,
  start: from,
  end: to,
  ...extra,
});
const TASKS: GanttTask[] = [
  t('a', oct(14), oct(20), { resources: ['bo'] }),
  t('b', oct(12), oct(16), { resources: [{ resourceId: 'bo', units: 40 }, 'cy'] }),
  t('c', oct(13), oct(15), { resources: ['ana'] }),
  t('u', oct(19), oct(23)),
  t('grp', oct(12), oct(30), { type: 'group' }),
  t('m', oct(21), oct(21), { type: 'milestone', resources: ['di'] }),
];

const project = (
  tasks: GanttTask[] = TASKS,
  resources: GanttResource[] = RESOURCES,
  view = { unassigned: true },
  dates: DateReading = PLAIN,
) => {
  const index = indexResources(resources);
  const utilization = computeResourceUtilization(tasks, index, dates, view);
  return { index, utilization, rows: projectResourceRows({ tasks, index, utilization, view, labels: LABELS, dates }) };
};
const byId = (rows: GanttTask[], id: string): GanttTask => {
  const row = rows.find(r => r.id === id);
  if (!row) throw new Error(`no row ${id}`);
  return row;
};

describe('projectResourceRows: order and shape', () => {
  it('lists the resources as given, a team where its first member is, the unassigned row last', () => {
    const { rows } = project();
    expect(rows.map(r => r.id)).toEqual([
      'res:ana',
      'team:Eng',
      'res:bo',
      'res:cy',
      'res:di',
      'team:Ops',
      'res:ed',
      'unassigned',
    ]);
    expect(rows.map(r => r.parentId)).toEqual([
      undefined,
      undefined,
      'team:Eng',
      'team:Eng',
      undefined,
      undefined,
      'team:Ops',
      undefined,
    ]);
    expect(new Set(rows.map(r => r.id)).size).toBe(rows.length);
    // Never the id of a real task
    expect(rows.some(r => TASKS.some(task => task.id === r.id))).toBe(false);
  });

  it('makes read-only rows with no bar: teams are groups, every row is of the resource bar type', () => {
    const { rows } = project();
    for (const row of rows) {
      expect(row.editable, row.id).toBe(false);
      expect(row.draggable, row.id).toBe(false);
      expect(row.barType, row.id).toBe(RESOURCE_BAR_TYPE);
      expect(row.progress, row.id).toBeUndefined();
      expect(row.resources, row.id).toBeUndefined();
      expect(row.dependency, row.id).toBeUndefined();
    }
    expect(byId(rows, 'team:Eng').type).toBe('group');
    expect(byId(rows, 'res:bo').type).toBeUndefined();
    expect(byId(rows, 'res:bo').name).toBe('Bo');
    expect(byId(rows, 'team:Eng').name).toBe('Eng');
    expect(byId(rows, 'unassigned').name).toBe('Unassigned');
  });

  it('runs through flattenTree in the given order, teams as parents', () => {
    const { rows } = project();
    const flat = flattenTree(rows, new Set(), { order: 'input' });
    expect(flat.map(r => [r.task.id, r.level, r.hasChildren])).toEqual([
      ['res:ana', 0, false],
      ['team:Eng', 0, true],
      ['res:bo', 1, false],
      ['res:cy', 1, false],
      ['res:di', 0, false],
      ['team:Ops', 0, true],
      ['res:ed', 1, false],
      ['unassigned', 0, false],
    ]);
    const collapsed = flattenTree(rows, new Set(['team:Eng']), { order: 'input' }).filter(r => !r.hidden);
    expect(collapsed.map(r => r.task.id)).toEqual([
      'res:ana',
      'team:Eng',
      'res:di',
      'team:Ops',
      'res:ed',
      'unassigned',
    ]);
    // The default sort by start date would scramble them
    const sorted = flattenTree(rows, new Set()).map(r => r.task.id);
    expect(sorted).not.toEqual(flat.map(r => r.task.id));
  });

  it('shows the unassigned row only with tasks and only when asked to', () => {
    expect(project(TASKS, RESOURCES, { unassigned: false }).rows.map(r => r.id)).not.toContain('unassigned');
    const onlyAssigned = TASKS.filter(task => task.id !== 'u');
    expect(project(onlyAssigned).rows.map(r => r.id)).not.toContain('unassigned');
  });

  it('takes the name of the unassigned row from the labels', () => {
    const index = indexResources(RESOURCES);
    const view = { unassigned: true };
    const utilization = computeResourceUtilization(TASKS, index, PLAIN, view);
    const rows = projectResourceRows({
      tasks: TASKS,
      index,
      utilization,
      view,
      labels: { resUnassigned: 'Non assegnati' },
      dates: PLAIN,
    });
    expect(byId(rows, 'unassigned').name).toBe('Non assegnati');
  });

  it('copes with nothing: no resources, no tasks', () => {
    expect(project([], []).rows).toEqual([]);
    expect(project([], RESOURCES).rows.map(r => r.id)).toEqual([
      'res:ana',
      'team:Eng',
      'res:bo',
      'res:cy',
      'res:di',
      'team:Ops',
      'res:ed',
    ]);
    expect(project(TASKS, []).rows.map(r => r.id)).toEqual(['unassigned']);
  });
});

describe('projectResourceRows: dates', () => {
  it('spans the assigned tasks as the app wrote them, a team its members', () => {
    const { rows } = project();
    // Bo: a 14–20, b 12–16 → 12 to 20; Cy: b → 12 to 16; Eng: the union
    expect([byId(rows, 'res:bo').start, byId(rows, 'res:bo').end]).toEqual([oct(12), oct(20)]);
    expect([byId(rows, 'res:cy').start, byId(rows, 'res:cy').end]).toEqual([oct(12), oct(16)]);
    expect([byId(rows, 'team:Eng').start, byId(rows, 'team:Eng').end]).toEqual([oct(12), oct(20)]);
    expect([byId(rows, 'res:ana').start, byId(rows, 'res:ana').end]).toEqual([oct(13), oct(15)]);
    expect([byId(rows, 'unassigned').start, byId(rows, 'unassigned').end]).toEqual([oct(19), oct(23)]);
  });

  it('hands back the very Date objects of the tasks', () => {
    const { rows } = project();
    expect(byId(rows, 'res:ana').start).toBe(TASKS[2]?.start);
    expect(byId(rows, 'res:ana').end).toBe(TASKS[2]?.end);
  });

  it('collapses the extent of an idle resource or team to the first day of the plan', () => {
    const { rows } = project();
    expect(byId(rows, 'res:di').start).toBe(byId(rows, 'res:di').end);
    expect(byId(rows, 'res:di').start).toEqual(oct(12));
    expect(byId(rows, 'team:Ops').start).toEqual(oct(12));
    expect(byId(rows, 'res:ed').end).toEqual(oct(12));
  });

  it('keeps the task-date convention of an inclusive end (the end stays the last day)', () => {
    const inclusive: DateReading = { endDateMode: 'inclusive', normalizeDateOnly: true };
    const tasks = [t('x', oct(12), oct(14), { resources: ['ana'] })];
    const { rows } = project(tasks, RESOURCES, { unassigned: true }, inclusive);
    expect([byId(rows, 'res:ana').start, byId(rows, 'res:ana').end]).toEqual([oct(12), oct(14)]);
  });

  it('falls back to the first load day without any task', () => {
    const { rows, utilization } = project([], RESOURCES);
    expect(byId(rows, 'res:ana').start).toEqual(fromCalendarDays(utilization.firstDay));
  });
});

describe('projectResourceRows: data.resource', () => {
  const { rows } = project();

  it('carries the figures of a resource', () => {
    const info = resourceInfoOf(byId(rows, 'res:bo'));
    expect(info).toMatchObject({
      kind: 'resource',
      id: 'bo',
      name: 'Bo',
      capacity: 50,
      peak: 140,
      overDays: 6,
      tasks: 2,
    });
    // Bo: a 14–19 (100), b 12–15 (40): 12: 40, 13: 40, 14: 140, 15: 140, 16: 100, 17: 100, 18: 100, 19: 100
    expect(info?.peakDay).toEqual(oct(14));
    expect(info?.peakDay).toBeInstanceOf(Date);
  });

  it('carries the sum of the capacities for a team and nothing of a resource', () => {
    expect(resourceInfoOf(byId(rows, 'team:Eng'))).toMatchObject({
      kind: 'team',
      id: null,
      name: 'Eng',
      capacity: 150,
      tasks: 2,
    });
    expect(resourceInfoOf(byId(rows, 'unassigned'))).toMatchObject({
      kind: 'unassigned',
      id: null,
      capacity: null,
      tasks: 1,
    });
  });

  it('has no peak day for an idle row', () => {
    expect(resourceInfoOf(byId(rows, 'res:di'))).toMatchObject({ peak: 0, peakDay: null, overDays: 0, tasks: 0 });
    // Milestones and groups carry nothing
    expect(resourceInfoOf(byId(rows, 'res:di'))?.tasks).toBe(0);
  });

  it('is the day of the first peak, as a local date', () => {
    const day = epochDayOf(oct(14));
    const info = resourceInfoOf(byId(rows, 'res:bo'));
    expect(info?.peakDay?.getTime()).toBe(fromCalendarDays(day).getTime());
  });
});

describe('resourceInfoOf', () => {
  it('is null for an ordinary task or malformed data', () => {
    expect(resourceInfoOf(t('a', oct(12), oct(13)))).toBeNull();
    expect(resourceInfoOf({ data: { resource: 'x' } })).toBeNull();
    expect(resourceInfoOf({ data: { resource: { kind: 'robot' } } })).toBeNull();
    expect(resourceInfoOf({ data: { resource: null } })).toBeNull();
    expect(resourceInfoOf({ data: {} })).toBeNull();
    expect(resourceInfoOf({})).toBeNull();
  });
});

describe('resourceViewTasks', () => {
  const input = { tasks: TASKS, resources: RESOURCES, dates: PLAIN, view: { unassigned: true }, labels: LABELS };

  it('is null while the rows are tasks', () => {
    expect(resourceViewTasks({ ...input, rows: 'tasks' })).toBeNull();
  });

  it('gives the rows with the index and the utilization they were made from', () => {
    const view = resourceViewTasks({ ...input, rows: 'resources' });
    expect(view?.tasks.map(r => r.id)).toEqual(project().rows.map(r => r.id));
    expect(view?.index.list).toEqual(RESOURCES);
    expect(view?.utilization.rows.get('res:bo')?.peak).toBe(140);
    expect(resourceViewTasks({ ...input, rows: 'resources', resources: undefined })?.tasks.map(r => r.id)).toEqual([
      'unassigned',
    ]);
  });
});
