// ─────────────────────────────────────────────────────────────
//  Tests — Phase 14 (step 1.2): the tooltip of a resource row's
//  load. The date, the load against the capacity, what is over it,
//  the contributing tasks (at most eight, then "+n more") and the
//  shape of the model the painters share. October 2026: Monday the
//  12th. Dates are built with `new Date(y, m, d)`: every assertion
//  holds in any time zone (`pnpm test:tz`).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LABELS,
  RESOURCE_TOOLTIP_TASKS,
  buildResourceTooltip,
  computeResourceUtilization,
  contributorsAt,
  indexResources,
  type DateReading,
  type GanttResource,
  type GanttTask,
} from '../index';
import { epochDayOf } from './calendar-oracle';

const PLAIN: DateReading = { endDateMode: 'exclusive', normalizeDateOnly: true };
const oct = (day: number): Date => new Date(2026, 9, day);
const D12 = epochDayOf(oct(12));

const RESOURCES: GanttResource[] = [
  { id: 'ana', name: 'Ana' },
  { id: 'bo', name: 'Bo', group: 'Eng', capacity: 50 },
  { id: 'cy', name: 'Cy', group: 'Eng' },
];
const task = (id: string, from: number, to: number, resources?: GanttTask['resources']): GanttTask => ({
  id,
  name: `Task ${id}`,
  start: oct(from),
  end: oct(to),
  ...(resources ? { resources } : {}),
});

const tooltip = (tasks: GanttTask[], key: string, day: number, labels = DEFAULT_LABELS) => {
  const index = indexResources(RESOURCES);
  const load = computeResourceUtilization(tasks, index, PLAIN, { unassigned: true }).rows.get(key);
  if (!load) throw new Error(`no row ${key}`);
  return buildResourceTooltip({
    load,
    day,
    contributors: contributorsAt(tasks, index, PLAIN, key, day),
    labels,
    dateFormat: 'YYYY-MM-DD',
  });
};
const rows = (model: ReturnType<typeof tooltip>) => model.rows.map(r => [r.label, r.value]);

describe('buildResourceTooltip', () => {
  const tasks = [
    task('a', 12, 15, [{ resourceId: 'ana', units: 60 }]),
    task('b', 13, 14, [{ resourceId: 'ana', units: 90 }]),
  ];

  it('shows the date, the load, the capacity, what is over it and the tasks that make the load', () => {
    const model = tooltip(tasks, 'res:ana', D12 + 1);
    expect(model.title).toBe('Ana');
    expect(rows(model)).toEqual([
      ['2026-10-13', ''],
      ['Load', '150%'],
      ['Capacity', '100%'],
      ['Over capacity', '50%'],
      ['Task b', '90%'],
      ['Task a', '60%'],
    ]);
    expect(model.rows[0]?.kind).toBe('date');
  });

  it('leaves the over-capacity row out while the load fits', () => {
    expect(rows(tooltip(tasks, 'res:ana', D12))).toEqual([
      ['2026-10-12', ''],
      ['Load', '60%'],
      ['Capacity', '100%'],
      ['Task a', '60%'],
    ]);
    // Exactly at the capacity is not over it
    const exact = tooltip([task('a', 12, 13, [{ resourceId: 'bo', units: 50 }])], 'res:bo', D12);
    expect(exact.rows.map(r => r.label)).toEqual(['2026-10-12', 'Load', 'Capacity', 'Task a']);
  });

  it('shows an idle day with no task rows', () => {
    expect(rows(tooltip(tasks, 'res:ana', D12 + 5))).toEqual([
      ['2026-10-17', ''],
      ['Load', '0%'],
      ['Capacity', '100%'],
    ]);
  });

  it('titles a team by its group, with the summed capacity and load', () => {
    const model = tooltip([task('a', 12, 13, ['bo', 'cy'])], 'team:Eng', D12);
    expect(model.title).toBe('Eng');
    expect(rows(model)).toEqual([
      ['2026-10-12', ''],
      ['Load', '200%'],
      ['Capacity', '150%'],
      ['Over capacity', '50%'],
      ['Task a', '200%'],
    ]);
  });

  it('titles the unassigned row with its label and shows no capacity', () => {
    const model = tooltip([task('a', 12, 14), task('b', 12, 13)], 'unassigned', D12, {
      ...DEFAULT_LABELS,
      resUnassigned: 'Non assegnati',
    });
    expect(model.title).toBe('Non assegnati');
    expect(rows(model)).toEqual([
      ['2026-10-12', ''],
      ['Load', '200%'],
      ['Task a', '100%'],
      ['Task b', '100%'],
    ]);
  });

  it('lists at most eight tasks and counts the rest', () => {
    expect(RESOURCE_TOOLTIP_TASKS).toBe(8);
    const many = Array.from({ length: 11 }, (_, i) =>
      task(`t${String(i).padStart(2, '0')}`, 12, 13, [{ resourceId: 'ana', units: 10 }]),
    );
    const model = tooltip(many, 'res:ana', D12);
    expect(model.rows.filter(r => r.label.startsWith('Task '))).toHaveLength(8);
    expect(model.rows.at(-1)).toEqual({ label: '+3 more', value: '' });
    const exactly = tooltip(many.slice(0, 8), 'res:ana', D12);
    expect(exactly.rows.some(r => r.label.includes('more'))).toBe(false);
  });

  it('rounds to a tenth and reads the labels it is given', () => {
    const odd = tooltip([task('a', 12, 13, [{ resourceId: 'ana', units: 33.333 }])], 'res:ana', D12, {
      ...DEFAULT_LABELS,
      ttResLoad: 'Carico',
      ttResCapacity: 'Capacità',
    });
    expect(rows(odd).slice(1)).toEqual([
      ['Carico', '33.3%'],
      ['Capacità', '100%'],
      ['Task a', '33.3%'],
    ]);
  });

  it('is a model of kind resource with nothing a task would have', () => {
    const model = tooltip(tasks, 'res:ana', D12);
    expect(model).toMatchObject({
      kind: 'resource',
      progress: null,
      critical: false,
      baselineVariance: null,
      predecessors: [],
      successors: [],
    });
    expect(model.paint.progress).toBe('var(--gantt-bar)');
  });
});
