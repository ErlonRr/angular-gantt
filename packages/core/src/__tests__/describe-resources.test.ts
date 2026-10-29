// ─────────────────────────────────────────────────────────────
//  Tests — Phase 14 (D12, D24): the accessible name of a row of the resource
//  view (`describeResource`), the Resources field in the words of an edit, and
//  the task rows' names staying as they were.
//  (runs under test:tz: dates are built with new Date(y, m, d))
// ─────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { resourceAccessibleName, taskAccessibleName } from '../a11y/describe';
import { taskChange } from '../editing/changes';
import { describeChange, fieldLabel } from '../editing/describe';
import { flattenTree } from '../gantt-data';
import { dateReadingOf, resolveConfig } from '../render/config';
import { indexResources } from '../resources/model';
import { projectResourceRows } from '../resources/rows';
import { computeResourceUtilization } from '../resources/utilization';
import { DEFAULT_LABELS, type GanttFlatRow, type GanttLabels, type GanttResource, type GanttTask } from '../types';

const L = DEFAULT_LABELS;
const d = (day: number) => new Date(2026, 9, day);

const RESOURCES: GanttResource[] = [
  { id: 'ana', name: 'Ana', capacity: 100 },
  { id: 'bo', name: 'Bo', capacity: 50 },
  { id: 'cy', name: 'Cy', group: 'Eng' },
  { id: 'di', name: 'Di', group: 'Eng' },
];
const TASKS: GanttTask[] = [
  { id: 't1', name: 'Design', start: d(12), end: d(16), resources: ['ana'] },
  { id: 't2', name: 'Build', start: d(14), end: d(22), resources: ['ana', { resourceId: 'bo', units: 50 }] },
  { id: 't3', name: 'Test', start: d(19), end: d(23), resources: [{ resourceId: 'bo', units: 100 }] },
  { id: 't4', name: 'Review', start: d(26), end: d(28) },
  { id: 't5', name: 'Docs', start: d(13), end: d(15), resources: ['cy'] },
];

function rows(): GanttFlatRow[] {
  const config = resolveConfig({ rows: 'resources' });
  const dates = dateReadingOf(config);
  const index = indexResources(RESOURCES);
  const utilization = computeResourceUtilization(TASKS, index, dates, { unassigned: true });
  const tasks = projectResourceRows({ tasks: TASKS, index, utilization, view: config.resourceView, labels: L, dates });
  return flattenTree(tasks, undefined, { order: 'input' });
}
const rowOf = (id: string) => rows().find(r => r.task.id === id)!;

describe('the accessible name of a resource row', () => {
  it('names the resource, its capacity, its peak load and the days over capacity', () => {
    expect(taskAccessibleName(rowOf('res:ana'))).toBe('Ana, capacity 100%, peak load 200%, 2 days over capacity');
    expect(taskAccessibleName(rowOf('res:bo'))).toBe('Bo, capacity 50%, peak load 150%, 4 days over capacity');
  });

  it('says never over capacity, and 1 day over capacity', () => {
    expect(taskAccessibleName(rowOf('res:di'))).toBe('Di, capacity 100%, peak load 0%, never over capacity');
    const one = { name: 'Ed', capacity: 100, peak: 130, overDays: 1 };
    expect(resourceAccessibleName(one)).toBe('Ed, capacity 100%, peak load 130%, 1 day over capacity');
  });

  it('a team reads its members’ capacity together', () => {
    expect(taskAccessibleName(rowOf('team:Eng'))).toBe('Eng, capacity 200%, peak load 100%, never over capacity');
  });

  it('the Unassigned row has no capacity: its name and the load it holds', () => {
    expect(taskAccessibleName(rowOf('unassigned'))).toBe('Unassigned, Load 100%');
    const labels: Partial<GanttLabels> = { ttResLoad: 'Carico', ariaListSeparator: '; ' };
    expect(resourceAccessibleName({ name: 'Non assegnate', capacity: null, peak: 100, overDays: 0 }, labels)).toBe(
      'Non assegnate; Carico 100%',
    );
  });

  it('rounds the numbers to one decimal', () => {
    expect(resourceAccessibleName({ name: 'Ana', capacity: 33.333, peak: 66.666, overDays: 0 })).toBe(
      'Ana, capacity 33.3%, peak load 66.7%, never over capacity',
    );
  });

  it('is translated through describeResource', () => {
    const labels: Partial<GanttLabels> = {
      describeResource: (name, capacity, peak, overDays) =>
        `${name}: capacità ${capacity}%, picco ${peak}%, ${overDays} giorni oltre`,
    };
    expect(taskAccessibleName(rowOf('res:bo'), { labels })).toBe('Bo: capacità 50%, picco 150%, 4 giorni oltre');
    expect(resourceAccessibleName({ name: 'Bo', capacity: 50, peak: 150, overDays: 4 }, labels)).toBe(
      'Bo: capacità 50%, picco 150%, 4 giorni oltre',
    );
  });

  it('keeps no date, no progress and no status in the name', () => {
    const name = taskAccessibleName(rowOf('res:ana'), { now: d(14), progress: true });
    expect(name).not.toMatch(/Oct|complete|task|Group/i);
  });
});

describe('the name of a task row is what it was', () => {
  const task = flattenTree(TASKS).find(r => r.task.id === 't2')!;

  it('has its type, dates and progress', () => {
    expect(taskAccessibleName(task)).toBe('Build, Task, 14 Oct – 22 Oct 2026, 0% complete');
  });

  it('is not taken for a resource row by a data key called resource', () => {
    const odd: GanttTask = {
      id: 'odd',
      name: 'Odd',
      start: d(12),
      end: d(14),
      data: { resource: { kind: 'resource', name: 'Zed', capacity: 100, peak: 10, overDays: 0 } },
    };
    const twin: GanttTask = { id: 'odd', name: 'Odd', start: d(12), end: d(14) };
    const row = flattenTree([odd])[0];
    expect(taskAccessibleName(row)).toBe(taskAccessibleName(flattenTree([twin])[0]));
    expect(taskAccessibleName(row)).toBe('Odd, Task, 12 Oct – 14 Oct 2026, 0% complete');
  });
});

describe('the Resources field in the words of an edit', () => {
  it('fieldLabel reads colResources', () => {
    expect(fieldLabel('resources', L)).toBe('Resources');
    expect(fieldLabel('resources', { ...L, colResources: 'Risorse' })).toBe('Risorse');
  });

  it('a cell edit reads describeEdit with the column', () => {
    const change = taskChange(TASKS[3], { resources: ['ana'] }, 'cell', { column: 'resources' });
    const name = (id: string) => TASKS.find(t => t.id === id)?.name ?? id;
    expect(describeChange(change, name, L)).toBe(L.describeEdit('Review', 'Resources'));
  });

  it('an API update of the field reads the same way', () => {
    const change = taskChange(TASKS[3], { resources: ['ana'] }, 'api');
    expect(describeChange(change, () => 'Review', L)).toBe(L.describeEdit('Review', 'Resources'));
  });

  it('other fields keep their words', () => {
    expect(fieldLabel('predecessors', L)).toBe(L.colPredecessors);
    expect(fieldLabel('dependency', L)).toBe(L.colPredecessors);
    expect(fieldLabel('owner', L)).toBe('owner');
  });
});
