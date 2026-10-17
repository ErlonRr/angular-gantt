// ─────────────────────────────────────────────────────────────
//  gantry · render/window.ts
//  Horizontal windowing over a TimelineModel: the header cells,
//  non-working bands and grid lines that intersect a pixel range,
//  so painters only mount what the viewport (plus overscan) shows.
//  Binary search — O(log n + k) per query (after a one-off O(n) check
//  of each array, cached per array).
// ─────────────────────────────────────────────────────────────

import type { ScaleCell, ScaleTier } from './scales';
import type { TimeBand, TimelineModel } from './timeline';

/** A header tier restricted to the cells intersecting a range. */
export interface TierWindow extends ScaleTier {
  /** The intersecting cells — the timeline's own cell objects, in order */
  cells: ScaleCell[];
  /** Index (in the full tier) of `cells[0]`; `0` when no cell intersects */
  firstCell: number;
}

/** Grid-line x positions inside a range. */
export interface LinesWindow {
  major: number[];
  minor: number[];
}

/**
 * Scroll distance (px) both painters snap the horizontal window to (`quantum` of
 * {@link computeHorizontalWindow}): a scroll inside one 256 px chunk mounts the same header
 * cells, bands and grid lines, and the same ones in every binding.
 */
export const HORIZONTAL_WINDOW_QUANTUM = 256;

/** A horizontal pixel range `[x0, x1]` of the timeline. */
export interface HorizontalWindow {
  x0: number;
  x1: number;
}

export interface HorizontalWindowInput {
  /** Horizontal scroll offset of the timeline viewport (px) */
  scrollLeft: number;
  /** Visible width of the timeline viewport (px) */
  viewportWidth: number;
  /** `TimelineModel.totalWidth` */
  totalWidth: number;
  /** Extra pixels mounted on each side (default: half the viewport width) */
  overscan?: number | undefined;
  /**
   * Snap the range outwards to multiples of this many pixels so it (and anything
   * memoized on it) only changes when the scroll crosses a chunk (default: no snapping).
   */
  quantum?: number | undefined;
}

/**
 * The pixel range a painter mounts for a horizontal scroll position: the viewport
 * plus `overscan` on each side, clamped to `[0, totalWidth]` and never reversed.
 *
 * While the viewport has no measurable width (`viewportWidth` not a finite number
 * > 0 — before the first layout, while hidden, in SSR or in DOM-less tests) the
 * whole timeline `[0, totalWidth]` is returned, so nothing goes blank. A non-finite
 * `scrollLeft` counts as `0`, a non-finite `overscan` falls back to the default and
 * a non-finite or non-positive `quantum` disables snapping.
 *
 * The result is a new object on every call: memoize on {@link sameHorizontalWindow}
 * (Angular: `computed(() => computeHorizontalWindow(…), { equal: sameHorizontalWindow })`;
 * Web Component: re-render the header and grid only when it returns `false`).
 */
export function computeHorizontalWindow(input: HorizontalWindowInput): HorizontalWindow {
  const width = Number.isFinite(input.totalWidth) ? Math.max(0, input.totalWidth) : 0;
  const viewportWidth = input.viewportWidth;
  if (!(Number.isFinite(viewportWidth) && viewportWidth > 0)) return { x0: 0, x1: width };
  const left = Number.isFinite(input.scrollLeft) ? input.scrollLeft : 0;
  const overscan = Math.max(
    0,
    input.overscan !== undefined && Number.isFinite(input.overscan) ? input.overscan : viewportWidth / 2,
  );
  let x0 = left - overscan;
  let x1 = left + viewportWidth + overscan;
  const q = input.quantum;
  if (q !== undefined && Number.isFinite(q) && q > 0) {
    x0 = Math.floor(x0 / q) * q;
    x1 = Math.ceil(x1 / q) * q;
  }
  x0 = Math.min(width, Math.max(0, x0));
  x1 = Math.min(width, Math.max(x0, x1));
  return { x0, x1 };
}

/** Whether two horizontal windows cover the same range (an equality function for memoization). */
export function sameHorizontalWindow(a: HorizontalWindow, b: HorizontalWindow): boolean {
  return a.x0 === b.x0 && a.x1 === b.x1;
}

// ─── Queries ──────────────────────────────────────────────────
//
// Range semantics (all three queries): spans (cells, bands) are kept when they
// overlap `[x0, x1]` by a positive width — `x < x1 && x + width > x0` — so a cell
// that only touches an edge is skipped. Lines are kept when `x0 ≤ x ≤ x1`.
// A range with `x1 ≤ x0` (or a NaN bound) is empty for every query, lines included.
//
// The timeline model must be treated as immutable: each array's sortedness check and
// the band index are cached per array object (rebuilt only when its length changes),
// so editing `tiers[i].cells`, `bands` or the line arrays in place can return stale
// results. Build a new array (or a new timeline) instead.

const isEmptyRange = (x0: number, x1: number) => !(x1 > x0);

/**
 * Each header tier with only the cells intersecting `[x0, x1]`. Tier order, tier
 * fields and the cell objects themselves are kept, so painters can key on them.
 * Expects an immutable timeline (see the range semantics above).
 */
export function tiersInRange(timeline: Pick<TimelineModel, 'tiers'>, x0: number, x1: number): TierWindow[] {
  const empty = isEmptyRange(x0, x1);
  return timeline.tiers.map(tier => {
    const cells = tier.cells;
    if (empty) return { ...tier, cells: [], firstCell: 0 };
    if (!cellsAreMonotone(cells)) {
      // Defensive: out-of-order cells (should not happen) fall back to a linear scan
      const hits = cells.filter(c => c.x < x1 && c.x + c.width > x0);
      return { ...tier, cells: hits, firstCell: hits[0] ? cells.indexOf(hits[0]) : 0 };
    }
    // Cells are sorted and contiguous: both x and x + width increase
    const lo = lowerBound(cells.length, i => cellEnd(cells, i) > x0);
    const hi = lowerBound(cells.length, i => xAt(cells, i) >= x1);
    return lo < hi ? { ...tier, cells: cells.slice(lo, hi), firstCell: lo } : { ...tier, cells: [], firstCell: 0 };
  });
}

/**
 * Non-working bands intersecting `[x0, x1]`, in the timeline's order (that is the
 * painting order, which matters where translucent bands overlap). Expects an
 * immutable `bands` array (see the range semantics above).
 */
export function bandsInRange(timeline: Pick<TimelineModel, 'bands'>, x0: number, x1: number): TimeBand[] {
  const bands = timeline.bands;
  if (isEmptyRange(x0, x1) || bands.length === 0) return [];
  const index = bandIndex(bands);
  const { order, xs, ends, maxEnd } = index;
  // maxEnd is a running maximum (non-decreasing): skip every prefix that ends before x0
  const lo = lowerBound(order.length, i => (maxEnd[i] ?? 0) > x0);
  const hi = lowerBound(order.length, i => (xs[i] ?? 0) >= x1);
  const hits: number[] = [];
  for (let i = lo; i < hi; i++) {
    if ((ends[i] ?? 0) > x0) hits.push(order[i] ?? 0);
  }
  if (!index.sorted) hits.sort((a, b) => a - b);
  const out: TimeBand[] = [];
  for (const h of hits) {
    const band = bands[h];
    if (band) out.push(band);
  }
  return out;
}

/**
 * Major (period delimiter) and minor grid-line x positions with `x0 ≤ x ≤ x1`;
 * empty when `x1 ≤ x0`, like the other queries. Expects immutable line arrays.
 */
export function linesInRange(
  timeline: Pick<TimelineModel, 'majorLines' | 'minorLines'>,
  x0: number,
  x1: number,
): LinesWindow {
  if (isEmptyRange(x0, x1)) return { major: [], minor: [] };
  return { major: sliceSorted(timeline.majorLines, x0, x1), minor: sliceSorted(timeline.minorLines, x0, x1) };
}

// ─── Helpers ──────────────────────────────────────────────────

/** First index in `[0, n)` where the monotone predicate turns true (`n` when never). */
function lowerBound(n: number, pred: (i: number) => boolean): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (pred(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

const xAt = (cells: readonly ScaleCell[], i: number) => cells[i]?.x ?? 0;
const cellEnd = (cells: readonly ScaleCell[], i: number) => {
  const c = cells[i];
  return c ? c.x + c.width : 0;
};

/** Values of an ascending array with `x0 ≤ v ≤ x1`. */
function sliceSorted(values: readonly number[], x0: number, x1: number): number[] {
  if (!numbersAreSorted(values)) return values.filter(v => v >= x0 && v <= x1);
  const lo = lowerBound(values.length, i => (values[i] ?? 0) >= x0);
  const hi = lowerBound(values.length, i => (values[i] ?? 0) > x1);
  return values.slice(lo, hi);
}

// The search preconditions are checked once per array (the timeline model is immutable),
// so a malformed model degrades to a linear scan instead of silently dropping items.
// The cached length is a cheap guard against arrays grown or shrunk in place.
const monotone = new WeakMap<readonly unknown[], { length: number; ok: boolean }>();

function cellsAreMonotone(cells: readonly ScaleCell[]): boolean {
  const cached = monotone.get(cells);
  if (cached?.length === cells.length) return cached.ok;
  let ok = true;
  for (let i = 1; i < cells.length && ok; i++) {
    const prev = cells[i - 1];
    const cur = cells[i];
    if (prev && cur && (cur.x < prev.x || cur.x + cur.width < prev.x + prev.width)) ok = false;
  }
  monotone.set(cells, { length: cells.length, ok });
  return ok;
}

function numbersAreSorted(values: readonly number[]): boolean {
  const cached = monotone.get(values);
  if (cached?.length === values.length) return cached.ok;
  let ok = true;
  for (let i = 1; i < values.length && ok; i++) if ((values[i] ?? 0) < (values[i - 1] ?? 0)) ok = false;
  monotone.set(values, { length: values.length, ok });
  return ok;
}

interface BandIndex {
  /** Original band indexes sorted by x (stable) */
  order: Int32Array;
  /** x of `order[i]` */
  xs: Float64Array;
  /** x + width of `order[i]` */
  ends: Float64Array;
  /** Running maximum of `ends` */
  maxEnd: Float64Array;
  /** The bands were already sorted by x (`order` is the identity) */
  sorted: boolean;
}

/**
 * Bands are mostly sorted by x, but intensive hours and hour-level `highlightTime`
 * bands are appended after the day they belong to, and bands may overlap. The index
 * is built once per bands array (the timeline model is immutable) and rebuilt when
 * the array's length changes.
 */
const bandIndexes = new WeakMap<readonly TimeBand[], BandIndex>();

function bandIndex(bands: readonly TimeBand[]): BandIndex {
  const cached = bandIndexes.get(bands);
  if (cached?.order.length === bands.length) return cached;
  const n = bands.length;
  const order = new Int32Array(n);
  let sorted = true;
  for (let i = 0; i < n; i++) {
    order[i] = i;
    if (i > 0 && (bands[i]?.x ?? 0) < (bands[i - 1]?.x ?? 0)) sorted = false;
  }
  if (!sorted) {
    // Array.prototype.sort is stable: equal x keep their painting order
    const sortedOrder = Array.from(order).sort((a, b) => (bands[a]?.x ?? 0) - (bands[b]?.x ?? 0));
    order.set(sortedOrder);
  }
  const xs = new Float64Array(n);
  const ends = new Float64Array(n);
  const maxEnd = new Float64Array(n);
  let running = -Infinity;
  for (let i = 0; i < n; i++) {
    const band = bands[order[i] ?? 0];
    const x = band?.x ?? 0;
    const end = x + (band?.width ?? 0);
    xs[i] = x;
    ends[i] = end;
    running = Math.max(running, end);
    maxEnd[i] = running;
  }
  const index: BandIndex = { order, xs, ends, maxEnd, sorted };
  bandIndexes.set(bands, index);
  return index;
}
