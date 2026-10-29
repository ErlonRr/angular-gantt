// ─────────────────────────────────────────────────────────────
//  Tests — Phase 14 (step 1.2, D22): the resource view stays fast.
//  10 000 tasks over 200 resources and two years, the rows of a
//  60-row window and the projection. Budgets are load-sensitive
//  (parallel agents, CI): each takes the best of several runs and is
//  wide; an O(tasks × days) loop misses them by an order of
//  magnitude, a noisy machine does not.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  computeLoadVisuals,
  computeResourceUtilization,
  indexResources,
  projectResourceRows,
  resolveConfig,
  type GanttResource,
  type GanttTask,
  type RowGeometry,
} from '../index';
import { epochDayOf, seeded } from './calendar-oracle';

const rand = seeded(14);
const RESOURCES: GanttResource[] = Array.from({ length: 200 }, (_, i) => ({
  id: `r${i}`,
  name: `Resource ${i}`,
  capacity: i % 5 === 0 ? 50 : 100,
  ...(i % 10 < 8 ? { group: `team ${Math.floor(i / 10)}` } : {}),
}));
const TASKS: GanttTask[] = Array.from({ length: 10_000 }, (_, i) => {
  const start = new Date(2026, 0, 1 + Math.floor(rand() * 700));
  const assignments = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => ({
    resourceId: `r${Math.floor(rand() * 210)}`,
    units: [25, 50, 100][Math.floor(rand() * 3)],
  }));
  return {
    id: `t${i}`,
    name: `Task ${i}`,
    start,
    end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1 + Math.floor(rand() * 20)),
    resources: assignments,
  };
});
const INDEX = indexResources(RESOURCES);
const PLAIN = { endDateMode: 'exclusive', normalizeDateOnly: true } as const;
const WORKING = resolveConfig({ calendar: true });

const best = (runs: number, fn: () => void): number => {
  let ms = Infinity;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    ms = Math.min(ms, performance.now() - t0);
  }
  return ms;
};

describe('resource view performance (D22)', () => {
  it('computes the load of 10 000 tasks × 200 resources × 2 years well within the budget', () => {
    expect(best(5, () => computeResourceUtilization(TASKS, INDEX, PLAIN, { unassigned: true }))).toBeLessThan(300);
  });

  it('does the same with a working calendar (a day-off mask over the range)', () => {
    expect(best(5, () => computeResourceUtilization(TASKS, INDEX, WORKING, { unassigned: true }))).toBeLessThan(300);
  });

  it('projects the rows and builds the paths of a 60-row window quickly', () => {
    const utilization = computeResourceUtilization(TASKS, INDEX, PLAIN, { unassigned: true });
    expect(
      best(5, () =>
        projectResourceRows({
          tasks: TASKS,
          index: INDEX,
          utilization,
          view: { unassigned: true },
          labels: { resUnassigned: 'Unassigned' },
          dates: PLAIN,
        }),
      ),
    ).toBeLessThan(60);

    const keys = [...utilization.rows.keys()].slice(0, 60);
    const geos: RowGeometry[] = keys.map((id, i) => ({
      row: {
        task: { id, name: id, start: new Date(2026, 0, 1), end: new Date(2026, 0, 1) },
        level: 0,
        visibleIndex: i,
        hasChildren: false,
        isCollapsed: false,
        hidden: false,
        barType: 'resource',
      },
      y: i * 36,
      height: 36,
      barX: 0,
      barWidth: 0,
      progressWidth: 0,
    }));
    const day0 = epochDayOf(new Date(2026, 0, 1));
    const px = 4;
    const timeline = { pxPerDay: px, toX: (d: Date) => Math.round((epochDayOf(d) - day0) * px) };
    const run = () =>
      computeLoadVisuals({
        geos,
        utilization,
        timeline,
        window: { x0: 800, x1: 2400 },
        cfg: { rowHeight: 36, resourceView: { unassigned: true, overallocation: true, rowHeight: 36 } },
        dayOfX: x => day0 + x / px,
      });
    expect(run()).toHaveLength(60);
    expect(best(5, run)).toBeLessThan(25);
  });
});
