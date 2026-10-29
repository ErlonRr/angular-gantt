// ─────────────────────────────────────────────────────────────
//  gantry · resources/visual.ts
//  What a resource row draws (Phase 14, D9): the daily load as a
//  stepped histogram, the part above the capacity and the capacity
//  line — three SVG paths in canvas coordinates per row, the same for
//  both painters and the exports. Plus the pointer's hit test. Pure.
// ─────────────────────────────────────────────────────────────

import { fromCalendarDays } from '../gantt-math';
import { themeVar, type Paint } from '../render/paint';
import type { ResolvedGanttConfig } from '../render/config';
import type { TimelineModel } from '../render/timeline';
import type { RowGeometry } from '../types';
import { OVER_EPSILON } from './model';
import type { ResourceUtilization } from './utilization';

/** Space above and below the plot inside a row (px). */
export const LOAD_PLOT_PAD = 4;
/** Days merge into buckets (the highest load wins) while a day is narrower than this (px). */
export const LOAD_MIN_BAR_PX = 3;
/** A load above 0 draws at least this tall (px). */
export const LOAD_MIN_HEIGHT = 2;

/**
 * How the painters and the exports draw a row's paths besides their `d` and fills, so no binding invents a
 * look: the over-capacity fill is `overOpacity` thick, the hatch lines over it `hatchOpacity` (the pattern
 * is `HATCH_PATTERN`'s geometry), the capacity line is `capWidth` px of `capPaint`, dashed `capDash`.
 */
export const LOAD_STYLE: Readonly<{
  overOpacity: number;
  hatchOpacity: number;
  capWidth: number;
  capDash: string;
  capPaint: Paint;
}> = Object.freeze({
  overOpacity: 0.35,
  hatchOpacity: 0.9,
  capWidth: 1,
  capDash: '4 3',
  capPaint: themeVar('textSecondary'),
});

/** The most buckets one row draws (a stray window cannot make a huge path). */
const MAX_BUCKETS = 10_000;

/** What one resource row paints. The paths are absolute canvas coordinates (`y`, `height`: the row). */
export interface LoadVisual {
  /** The row's key (`res:<id>` | `team:<group>` | `unassigned`): the synthetic task's id */
  rowKey: string;
  y: number;
  height: number;
  /** The load up to the capacity (all of it without a capacity or with `overallocation` off); `''` when idle */
  bars: string;
  /** The load above the capacity, from the capacity line up; `''` when there is none */
  over: string;
  /** The capacity line across the window; `null` without a capacity (the unassigned row) */
  cap: string | null;
  /** Fill of `bars`: the resource's colour, else `var(--gantt-bar)` */
  barsPaint: Paint;
  /** Fill / stroke of the over-capacity part: `var(--gantt-overallocated)` */
  overPaint: Paint;
  /** Draw `over` with the hatch pattern as well (a colour is never the only cue) */
  hatch: boolean;
}

export interface LoadVisualsInput {
  /** The rows to draw (the visible window), as `computeRowGeometries` made them for the synthetic tasks */
  geos: readonly RowGeometry[];
  utilization: ResourceUtilization;
  timeline: Pick<TimelineModel, 'toX' | 'pxPerDay'>;
  /** The horizontal window in canvas x: only days inside it are built */
  window: { x0: number; x1: number };
  cfg: Pick<ResolvedGanttConfig, 'resourceView' | 'rowHeight'>;
  /** The fractional epoch day (`calendarDays`) at a canvas x: the inverse of `timeline.toX` */
  dayOfX: (x: number) => number;
}

const num = (n: number): string => String(Math.round(n * 100) / 100 || 0);

interface Step {
  xl: number;
  xr: number;
  y: number;
}

/** How many days one bar covers at `pxPerDay`: 1, or the buckets of `ceil(3 / pxPerDay)` days of a coarse zoom. */
export function loadBucketDays(pxPerDay: number): number {
  return pxPerDay >= LOAD_MIN_BAR_PX ? 1 : Math.ceil(LOAD_MIN_BAR_PX / Math.max(pxPerDay, 1e-6));
}

/** A stepped outline over `base` for runs of adjacent steps: `M xl base V y H xr … V base Z` per run. */
function stepPath(steps: readonly Step[], base: number): string {
  let d = '';
  let right = NaN;
  let y = NaN;
  for (const s of steps) {
    if (s.xl !== right) {
      if (d !== '') d += `V${num(base)}Z`;
      d += `M${num(s.xl)} ${num(base)}`;
      y = NaN;
    }
    // Neighbours at the same height are one step: close the previous `H` only when the height changes
    if (s.xl === right && s.y === y) d = d.slice(0, d.lastIndexOf('H'));
    else if (s.y !== y) d += `V${num(s.y)}`;
    d += `H${num(s.xr)}`;
    right = s.xr;
    y = s.y;
  }
  return d === '' ? d : `${d}V${num(base)}Z`;
}

/**
 * The paths of every row in `geos` that is a resource row (a row key in `utilization.rows`).
 *
 * - One global vertical scale: the plot (row height − 2 × {@link LOAD_PLOT_PAD}) stands for
 *   `utilization.scaleMax` percent, so the 100 % level is at the same height in every row.
 * - A day is a bar as wide as the day; a load above 0 is at least {@link LOAD_MIN_HEIGHT} tall. Below
 *   {@link LOAD_MIN_BAR_PX} px per day, days merge into buckets of `ceil(3 / pxPerDay)` days aligned to the
 *   epoch, each as tall as its highest day (a spike is never averaged away).
 * - With `resourceView.overallocation` the part above the capacity is `over`; without it all the load is `bars`.
 * - Only buckets inside `window` are built.
 */
export function computeLoadVisuals(input: LoadVisualsInput): LoadVisual[] {
  const { geos, utilization, timeline, window, cfg, dayOfX } = input;
  const bucket = loadBucketDays(timeline.pxPerDay);
  const d0 = Math.floor(dayOfX(window.x0));
  const d1 = Math.floor(dayOfX(window.x1));
  const buckets: { s: number; xl: number; xr: number }[] = [];
  if (Number.isFinite(d0) && Number.isFinite(d1)) {
    for (let s = Math.floor(d0 / bucket) * bucket; s <= d1 && buckets.length < MAX_BUCKETS; s += bucket) {
      const xl = timeline.toX(fromCalendarDays(s));
      const xr = timeline.toX(fromCalendarDays(s + bucket));
      if (xr > xl) buckets.push({ s, xl, xr });
    }
  }

  const out: LoadVisual[] = [];
  for (const geo of geos) {
    const load = utilization.rows.get(geo.row.task.id);
    if (!load) continue;
    const plotH = Math.max(1, geo.height - 2 * LOAD_PLOT_PAD);
    const base = geo.y + geo.height - LOAD_PLOT_PAD;
    const hOf = (v: number): number =>
      v <= 0 ? 0 : Math.max(LOAD_MIN_HEIGHT, Math.round((v / utilization.scaleMax) * plotH));
    const split = cfg.resourceView.overallocation ? load.capacity : null;
    const capH = split !== null ? hOf(split) : 0;
    const bars: Step[] = [];
    const over: Step[] = [];
    for (const b of buckets) {
      let v = 0;
      for (let day = b.s; day < b.s + bucket; day++) {
        const x = load.loads[day - load.firstDay] ?? 0;
        if (x > v) v = x;
      }
      if (v <= 0) continue;
      if (split !== null && v > split + OVER_EPSILON) {
        bars.push({ xl: b.xl, xr: b.xr, y: base - capH });
        const top = Math.min(Math.max(hOf(v), capH + LOAD_MIN_HEIGHT), plotH);
        if (top > capH) over.push({ xl: b.xl, xr: b.xr, y: base - top });
      } else {
        bars.push({ xl: b.xl, xr: b.xr, y: base - hOf(v) });
      }
    }
    const capY = base - hOf(load.capacity ?? 0);
    const resourceColor = load.resource?.color?.trim();
    out.push({
      rowKey: load.key,
      y: geo.y,
      height: geo.height,
      bars: stepPath(bars, base),
      over: stepPath(over, base - capH),
      cap: load.capacity === null ? null : `M${num(window.x0)} ${num(capY)}H${num(window.x1)}`,
      barsPaint: resourceColor ? resourceColor : themeVar('barColor'),
      overPaint: themeVar('overallocatedColor'),
      hatch: over.length > 0,
    });
  }
  return out;
}

export interface LoadHit {
  rowKey: string;
  /** The epoch-day index under the pointer */
  day: number;
  /** The row's load on that day (percent) */
  load: number;
  /** The row's capacity; `null` for the unassigned row */
  capacity: number | null;
}

/**
 * The resource row and day under a canvas point, or `null` outside the rows. `geos` are the rows around the
 * pointer (the visible window); `dayOfX` as in {@link computeLoadVisuals}.
 */
export function hitTestLoad(input: {
  x: number;
  y: number;
  geos: readonly RowGeometry[];
  utilization: ResourceUtilization;
  /** The timeline's px per day: at a coarse zoom the hit is the highest day of the bar under the pointer */
  pxPerDay?: number | undefined;
  dayOfX: (x: number) => number;
}): LoadHit | null {
  const { x, y, geos, utilization, dayOfX } = input;
  const geo = geos.find(g => y >= g.y && y < g.y + g.height);
  const load = geo ? utilization.rows.get(geo.row.task.id) : undefined;
  if (!load) return null;
  let day = Math.floor(dayOfX(x));
  if (!Number.isFinite(day)) return null;
  const bucket = input.pxPerDay === undefined ? 1 : loadBucketDays(input.pxPerDay);
  if (bucket > 1) {
    // The bar under the pointer shows the highest load of its days (as computeLoadVisuals draws it)
    const start = Math.floor(day / bucket) * bucket;
    let best = start;
    for (let d = start + 1; d < start + bucket; d++) {
      if ((load.loads[d - load.firstDay] ?? 0) > (load.loads[best - load.firstDay] ?? 0)) best = d;
    }
    day = best;
  }
  return { rowKey: load.key, day, load: load.loads[day - load.firstDay] ?? 0, capacity: load.capacity };
}
