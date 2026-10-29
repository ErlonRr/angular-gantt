// ─────────────────────────────────────────────────────────────
//  Tests — Phase 14 (step 1.2): what a resource row draws. The `d`
//  strings of the load bars, the part over the capacity and the
//  capacity line are pinned for a 4-day fixture (the only geometry
//  the painters use); the global scale, the minimum height, the
//  merge of days into buckets at coarse zoom, the window clip, the
//  paints and the hit test follow. October 2026: Monday the 12th.
//  Dates are built with `new Date(y, m, d)`: every assertion holds in
//  any time zone (`pnpm test:tz`), the daylight-saving weekend of
//  the real-timeline case included.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  LOAD_MIN_HEIGHT,
  LOAD_PLOT_PAD,
  buildTimeline,
  calendarDays,
  computeLoadVisuals,
  hitTestLoad,
  indexResources,
  resolveConfig,
  computeResourceUtilization,
  type DateReading,
  type GanttResource,
  type GanttTask,
  type LoadVisual,
  type ResourceUtilization,
  type RowGeometry,
} from '../index';
import { epochDayOf, midnightOf } from './calendar-oracle';

const PLAIN: DateReading = { endDateMode: 'exclusive', normalizeDateOnly: true };
const oct = (day: number): Date => new Date(2026, 9, day);
const D12 = epochDayOf(oct(12));
const ROW_H = 36;

const ANA: GanttResource = { id: 'ana', name: 'Ana' };
const task = (id: string, from: Date, to: Date, resources: GanttTask['resources']): GanttTask => ({
  id,
  name: id,
  start: from,
  end: to,
  resources,
});
const utilOf = (tasks: GanttTask[], resources: GanttResource[], unassigned = true): ResourceUtilization =>
  computeResourceUtilization(tasks, indexResources(resources), PLAIN, { unassigned });

/** Row geometries for `keys` stacked from y = 0. */
const geosOf = (keys: string[], height = ROW_H): RowGeometry[] =>
  keys.map((id, i) => ({
    row: {
      task: { id, name: id, start: oct(12), end: oct(12) },
      level: 0,
      visibleIndex: i,
      hasChildren: false,
      isCollapsed: false,
      hidden: false,
      barType: 'resource',
    },
    y: i * height,
    height,
    barX: 0,
    barWidth: 0,
    progressWidth: 0,
  }));

/** A flat timeline: `pxPerDay` px a day, x 0 at the 12th. */
const flat = (pxPerDay: number) => ({
  pxPerDay,
  toX: (d: Date) => Math.round((calendarDays(d) - D12) * pxPerDay),
});
const dayOfFlat = (pxPerDay: number) => (x: number) => D12 + x / pxPerDay;

const cfg = (overallocation = true) => ({
  rowHeight: ROW_H,
  resourceView: { unassigned: true, overallocation, rowHeight: ROW_H },
});

/** Ana, 100 %: day 0 at 50, day 1 at 150 (over), day 2 idle, day 3 at 100. */
const fixture = (): { tasks: GanttTask[]; resources: GanttResource[] } => ({
  resources: [ANA],
  tasks: [
    task('a', oct(12), oct(14), [{ resourceId: 'ana', units: 50 }]),
    task('b', oct(13), oct(14), ['ana']),
    task('c', oct(15), oct(16), ['ana']),
  ],
});

const visuals = (
  utilization: ResourceUtilization,
  keys: string[],
  opts: { px?: number; x0?: number; x1?: number; overallocation?: boolean; height?: number } = {},
): LoadVisual[] => {
  const px = opts.px ?? 10;
  return computeLoadVisuals({
    geos: geosOf(keys, opts.height ?? ROW_H),
    utilization,
    timeline: flat(px),
    window: { x0: opts.x0 ?? 0, x1: opts.x1 ?? 40 },
    cfg: cfg(opts.overallocation ?? true),
    dayOfX: dayOfFlat(px),
  });
};

describe('computeLoadVisuals: the paths of a 4-day row', () => {
  // Row 0..36, pad 4 → plot 28 px for 150 %, baseline y 32: 50 % → 9, 100 % → 19, 150 % → 28
  const { tasks, resources } = fixture();
  const u = utilOf(tasks, resources);

  it('draws the load up to the capacity as one stepped outline per run of days', () => {
    const [v] = visuals(u, ['res:ana']);
    expect(v).toBeDefined();
    expect(v?.rowKey).toBe('res:ana');
    expect([v?.y, v?.height]).toEqual([0, ROW_H]);
    // 50 % (y 23), 150 % clipped at the 100 % line (y 13), idle day, 100 % (y 13)
    expect(v?.bars).toBe('M0 32V23H10V13H20V32ZM30 32V13H40V32Z');
  });

  it('draws the part above the capacity from the capacity line up, and the capacity line across the window', () => {
    const [v] = visuals(u, ['res:ana']);
    expect(v?.over).toBe('M10 13V4H20V13Z');
    expect(v?.cap).toBe('M0 13H40');
    expect(v?.hatch).toBe(true);
  });

  it('puts all the load in the bars, and no hatch, with overallocation off — the capacity line stays', () => {
    const [v] = visuals(u, ['res:ana'], { overallocation: false });
    expect(v?.bars).toBe('M0 32V23H10V4H20V32ZM30 32V13H40V32Z');
    expect(v?.over).toBe('');
    expect(v?.hatch).toBe(false);
    expect(v?.cap).toBe('M0 13H40');
  });

  it('paints the bars with the theme bar colour, the over part with the over-allocation colour', () => {
    const [v] = visuals(u, ['res:ana']);
    expect(v?.barsPaint).toBe('var(--gantt-bar)');
    expect(v?.overPaint).toBe('var(--gantt-overallocated)');
    const coloured = utilOf(tasks, [{ ...ANA, color: ' #7c3aed ' }]);
    expect(visuals(coloured, ['res:ana'])[0]?.barsPaint).toBe('#7c3aed');
    const blank = utilOf(tasks, [{ ...ANA, color: '  ' }]);
    expect(visuals(blank, ['res:ana'])[0]?.barsPaint).toBe('var(--gantt-bar)');
  });

  it('offsets the paths by the row, so every row has its own canvas coordinates', () => {
    const two = utilOf(tasks, [ANA, { id: 'bo', name: 'Bo' }]);
    const [first, second] = visuals(two, ['res:ana', 'res:bo']);
    expect(first?.bars).toBe('M0 32V23H10V13H20V32ZM30 32V13H40V32Z');
    expect(second?.y).toBe(ROW_H);
    // Bo is idle: no bars, but a capacity line 36 px lower
    expect(second?.bars).toBe('');
    expect(second?.over).toBe('');
    expect(second?.cap).toBe('M0 49H40');
    expect(second?.hatch).toBe(false);
  });

  it('shrinks the plot with the row height and keeps the 4 px padding', () => {
    expect(LOAD_PLOT_PAD).toBe(4);
    const [v] = visuals(u, ['res:ana'], { height: 54 });
    // plot 46 px for 150 %: 100 % → 31, baseline 50, so the capacity line is at 19
    expect(v?.cap).toBe('M0 19H40');
    expect(v?.bars).toBe('M0 50V35H10V19H20V50ZM30 50V19H40V50Z');
  });
});

describe('computeLoadVisuals: scale and heights', () => {
  it('uses one scale for every row, so the 100 % line is at the same height', () => {
    const heavy = [1, 2, 3].map(i => task(`h${i}`, oct(12), oct(13), [{ resourceId: 'bo', units: 100 }]));
    const u = utilOf([task('a', oct(12), oct(13), ['ana']), ...heavy], [ANA, { id: 'bo', name: 'Bo' }]);
    expect(u.scaleMax).toBe(300);
    const [ana, bo] = visuals(u, ['res:ana', 'res:bo']);
    // 100 % of 300 → 9 px (28 × 100 / 300 = 9.33) in both rows
    expect(ana?.cap).toBe('M0 23H40');
    expect(bo?.cap).toBe(`M0 ${ROW_H + 23}H40`);
    expect(ana?.bars).toBe('M0 32V23H10V32Z');
    // Bo (300 %, over its 100 %) is clipped at the capacity line; the rest of the plot is over
    expect(bo?.bars).toBe(`M0 ${ROW_H + 32}V${ROW_H + 23}H10V${ROW_H + 32}Z`);
    expect(bo?.over).toBe(`M0 ${ROW_H + 23}V${ROW_H + 4}H10V${ROW_H + 23}Z`);
  });

  it('gives a load above 0 at least the minimum height', () => {
    expect(LOAD_MIN_HEIGHT).toBe(2);
    const u = utilOf([task('a', oct(12), oct(13), [{ resourceId: 'ana', units: 1 }])], [ANA]);
    expect(visuals(u, ['res:ana'])[0]?.bars).toBe('M0 32V30H10V32Z');
  });

  it('draws at least the minimum of over-allocation, however small', () => {
    const u = utilOf([task('a', oct(12), oct(13), [{ resourceId: 'ana', units: 100.2 }])], [ANA]);
    const v = visuals(u, ['res:ana'])[0];
    expect(v?.over).toBe('M0 13V11H10V13Z');
    expect(v?.hatch).toBe(true);
  });

  it('has no capacity line and no over part for the unassigned row', () => {
    const u = utilOf([task('a', oct(12), oct(14), undefined), task('b', oct(12), oct(14), undefined)], []);
    const v = visuals(u, ['unassigned'])[0];
    expect(v?.cap).toBeNull();
    expect(v?.over).toBe('');
    // Two tasks at 100 % each: 200 %, the scale grows to 200 and the two days are one step
    expect(u.scaleMax).toBe(200);
    expect(v?.bars).toBe('M0 32V4H20V32Z');
  });

  it('skips rows that are not resource rows', () => {
    const { tasks, resources } = fixture();
    const u = utilOf(tasks, resources);
    expect(visuals(u, ['res:ana', 'some-task']).map(v => v.rowKey)).toEqual(['res:ana']);
    expect(visuals(u, [])).toEqual([]);
  });
});

describe('computeLoadVisuals: the window and coarse zoom', () => {
  const { tasks, resources } = fixture();
  const u = utilOf(tasks, resources);

  it('builds only the days inside the window and draws the capacity line across it', () => {
    const [v] = visuals(u, ['res:ana'], { x0: 10, x1: 20 });
    // Days 1 and 2 (the 13th: over, the 14th: idle) and the first boundary after
    expect(v?.bars).toBe('M10 32V13H20V32Z');
    expect(v?.over).toBe('M10 13V4H20V13Z');
    expect(v?.cap).toBe('M10 13H20');
  });

  it('draws nothing for days outside the load but keeps the capacity line', () => {
    const [v] = visuals(u, ['res:ana'], { x0: 200, x1: 260 });
    expect(v?.bars).toBe('');
    expect(v?.over).toBe('');
    expect(v?.cap).toBe('M200 13H260');
  });

  it('merges days into buckets of ceil(3 / pxPerDay) days aligned to the epoch, each as tall as its highest day', () => {
    // 1 px a day → buckets of 3 days; the 150 % spike stays visible next to quiet days
    const week = utilOf(
      [
        task('base', oct(12), oct(26), [{ resourceId: 'ana', units: 20 }]),
        task('spike', oct(18), oct(19), [{ resourceId: 'ana', units: 130 }]),
      ],
      [ANA],
    );
    const [v] = visuals(week, ['res:ana'], { px: 1, x0: 0, x1: 14 });
    expect(v?.hatch).toBe(true);
    // The bucket holding the 18th is 150 % high (clipped at the capacity line, the rest over it)
    expect(v?.over).not.toBe('');
    const bucketStart = Math.floor((D12 + 6) / 3) * 3;
    const x = (d: number) => d - D12;
    expect(v?.over).toBe(`M${x(bucketStart)} 13V4H${x(bucketStart + 3)}V13Z`);
    // 20 % elsewhere: 4 px (28 × 20 / 150 = 3.73)
    expect(v?.bars.startsWith('M')).toBe(true);
    expect(v?.bars).toContain('V28');
  });

  it('keeps a bar at least LOAD_MIN_BAR_PX wide at any zoom', () => {
    for (const px of [0.2, 0.5, 1, 2, 2.9, 3, 5]) {
      const [v] = visuals(utilOf(fixture().tasks, [ANA]), ['res:ana'], { px, x0: 0, x1: 60 });
      const widths = [...(v?.bars.matchAll(/H(-?[\d.]+)/g) ?? [])].map(m => Number(m[1]));
      expect(widths.length, `px ${px}`).toBeGreaterThan(0);
    }
  });
});

describe('computeLoadVisuals: a real timeline across the daylight-saving weekend', () => {
  it('puts every bar edge on the x of its local midnight', () => {
    // US clocks go back on 1 November 2026 (a 25-hour day); the south's went forward on 4 October: the days stay whole
    const tasks = [
      task('a', new Date(2026, 9, 30), new Date(2026, 10, 4), [{ resourceId: 'ana', units: 50 }]),
      task('b', new Date(2026, 9, 31), new Date(2026, 10, 1), [{ resourceId: 'ana', units: 50 }]),
      task('c', new Date(2026, 10, 2), new Date(2026, 10, 3), [{ resourceId: 'ana', units: 50 }]),
    ];
    const timeline = buildTimeline({ tasks, config: resolveConfig({}), now: oct(12) });
    const u = utilOf(tasks, [ANA]);
    const first = epochDayOf(new Date(2026, 9, 30));
    const xs = [0, 1, 2, 3, 4, 5].map(i => timeline.toX(midnightOf(first + i)));
    expect(new Set(xs.slice(1).map((x, i) => x - xs[i])).size).toBe(1);
    const [v] = computeLoadVisuals({
      geos: geosOf(['res:ana']),
      utilization: u,
      timeline,
      window: { x0: xs[0], x1: xs[5] - 1 },
      cfg: cfg(),
      dayOfX: x => calendarDays(timeline.toDate(x), false),
    });
    // 50, 100, 50, 100, 50 %: y 23 and 13 over the baseline 32
    const [a, b, c, d, e, f] = xs;
    expect(v?.bars).toBe(`M${a} 32V23H${b}V13H${c}V23H${d}V13H${e}V23H${f}V32Z`);
  });
});

describe('hitTestLoad', () => {
  const { tasks, resources } = fixture();
  const u = utilOf(tasks, [...resources, { id: 'bo', name: 'Bo', capacity: 50 }]);
  const geos = geosOf(['res:ana', 'res:bo', 'plain-task']);
  const dayOfX = dayOfFlat(10);
  const hit = (x: number, y: number) => hitTestLoad({ x, y, geos, utilization: u, dayOfX });

  it('finds the row by y and the day by x, with the load and the capacity', () => {
    expect(hit(5, 10)).toEqual({ rowKey: 'res:ana', day: D12, load: 50, capacity: 100 });
    expect(hit(19, 35)).toEqual({ rowKey: 'res:ana', day: D12 + 1, load: 150, capacity: 100 });
    expect(hit(20, 0)).toEqual({ rowKey: 'res:ana', day: D12 + 2, load: 0, capacity: 100 });
    expect(hit(35, ROW_H + 5)).toEqual({ rowKey: 'res:bo', day: D12 + 3, load: 0, capacity: 50 });
  });

  it('reads days outside the load as idle', () => {
    expect(hit(-25, 5)).toEqual({ rowKey: 'res:ana', day: D12 - 3, load: 0, capacity: 100 });
    expect(hit(900, 5)?.load).toBe(0);
  });

  it('finds nothing below the rows, above them or on a row that is not a resource', () => {
    expect(hit(5, -1)).toBeNull();
    expect(hit(5, 3 * ROW_H)).toBeNull();
    expect(hit(5, 2 * ROW_H + 5)).toBeNull();
    expect(hit(NaN, 5)).toBeNull();
  });

  it('at a coarse zoom the hit is the highest day of the bar under the pointer (as the paths draw it)', () => {
    // 1 px a day: buckets of 3 days, aligned to multiples of 3 epoch days
    const coarse = (x: number) => hitTestLoad({ x, y: 5, geos, utilization: u, dayOfX: dayOfFlat(1), pxPerDay: 1 });
    const start = Math.floor(D12 / 3) * 3;
    const peak = coarse(start + 1 - D12)!;
    // Every pixel of the bucket answers with the bucket's peak, not the idle day under the pointer
    for (let day = start; day < start + 3; day++) {
      expect(coarse(day - D12)).toEqual(peak);
    }
    expect(peak.load).toBe(
      Math.max(...[0, 1, 2].map(i => u.rows.get('res:ana')!.loads[start + i - u.rows.get('res:ana')!.firstDay] ?? 0)),
    );
    // Without pxPerDay (or at a fine zoom) it is the day under the pointer, as before
    expect(hit(20, 0)?.load).toBe(0);
  });

  it('agrees with the paths: the day under a bar edge is the bar day', () => {
    const [v] = visuals(u, ['res:ana']);
    expect(v?.bars).toBe('M0 32V23H10V13H20V32ZM30 32V13H40V32Z');
    for (let day = 0; day < 4; day++) {
      const h = hit(day * 10 + 5, 5);
      expect(h?.day).toBe(D12 + day);
    }
  });
});
