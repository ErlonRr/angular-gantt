// ─────────────────────────────────────────────────────────────
//  gantry · render/arrows.ts
//  Dependency arrows (FS / SS / FF / SF + lag). `arrows.routing`:
//  'orthogonal' (default) = right angles with rounded bends and a U-turn
//  when the successor starts before the predecessor's exit point;
//  'straight' = one line from the exit to the entry, head along it.
// ─────────────────────────────────────────────────────────────

import { DependencyType } from '../types';
import type { ResolvedGanttConfig } from './config';
import type { BarVisual } from './bars';
import { themeVar, type Paint } from './paint';

export interface ArrowVisual {
  /** Path of the line (ends at the base of the arrow head) */
  d: string;
  /** Arrow head polygon points */
  head: string;
  /** `var(--gantt-critical)` on the critical path, else `arrows.color`, else `var(--gantt-arrow)` */
  paint: Paint;
  width: number;
  /** The link has a lag or lead (drawn dashed) */
  dashed: boolean;
  /** `stroke-dasharray` of the line: `ARROW_DASH` when `dashed`, else `null` */
  dash: typeof ARROW_DASH | null;
  critical: boolean;
  /**
   * "+2d" / "-1d": next to the vertical segment (orthogonal), or next to the middle of the line
   * (straight), on the side the line leaves free; `fontPx` is the chart font size − 2. The
   * painters draw it with `dominant-baseline: central` and the default `text-anchor` (start).
   */
  lagLabel: { text: string; x: number; y: number; fontPx: number } | null;
  /**
   * The route as points, exit first and the head's tip last (orthogonal: the corners before
   * rounding; straight: the two ends): what a click on the arrow is tested against
   * (`hitTestArrow`). Painters don't draw it.
   */
  points: readonly (readonly [number, number])[];
  /**
   * The selected link (`editing.dependencies.delete`, `selectedArrowVisual`): `paint` is the
   * focus ring, `width` 1 px more, with a `halo`. Painters add `gantt-arrow--selected` to the
   * arrow's group.
   */
  selected: boolean;
  /**
   * The selected link's halo (`null` otherwise): a wide, translucent stroke of `paint` along `d`,
   * painted behind the line (`path.gantt-arrow-halo`, the group's first child, only while
   * selected), so the selection shows even where the arrow colour is the focus ring's.
   */
  halo: ArrowHalo | null;
}

/** The halo behind a selected link (`ArrowVisual.halo`). */
export interface ArrowHalo {
  /** `var(--gantt-focus-ring)` */
  paint: Paint;
  /** `stroke-width`: the link's width plus `SELECTED_ARROW_HALO` */
  width: number;
  /** `stroke-opacity` (`SELECTED_ARROW_HALO_OPACITY`) */
  opacity: number;
}

/** Dash pattern of a link with a lag or lead. */
export const ARROW_DASH = '5 3';

/** How much wider (px) than the link the halo of a selected link is: 3 px on each side. */
export const SELECTED_ARROW_HALO = 6;

/** The `stroke-opacity` of a selected link's halo. */
export const SELECTED_ARROW_HALO_OPACITY = 0.3;

/** How far (px) from an arrow's route a click still hits it: a 10 px band. */
export const ARROW_HIT_TOLERANCE = 5;

type Pt = [number, number];

/** Polyline → path with rounded corners of radius `r`. */
export function roundedPolyline(points: Pt[], r: number): string {
  const [first] = points;
  if (!first || points.length < 2) return '';
  let d = `M${first[0]},${first[1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1]!;
    const [cx, cy] = points[i]!;
    const [nx, ny] = points[i + 1]!;
    const inLen = Math.hypot(cx - px, cy - py);
    const outLen = Math.hypot(nx - cx, ny - cy);
    const rr = Math.min(r, inLen / 2, outLen / 2);
    if (rr <= 0.5) {
      d += `L${cx},${cy}`;
      continue;
    }
    const ax = cx - ((cx - px) / inLen) * rr,
      ay = cy - ((cy - py) / inLen) * rr;
    const bx = cx + ((nx - cx) / outLen) * rr,
      by = cy + ((ny - cy) / outLen) * rr;
    d += `L${ax},${ay}Q${cx},${cy} ${bx},${by}`;
  }
  const [lx, ly] = points.at(-1)!;
  return d + `L${lx},${ly}`;
}

const leftEdge = (b: BarVisual) => b.x;
const rightEdge = (b: BarVisual) => b.x + b.width;

/**
 * The link `from` → `to` of a dependency: exit and entry edges by type (FS: right → left, SS:
 * left → left, FF: right → right, SF: left → right) at the bars' centre lines, routed by
 * `cfg.arrows.routing` — `'orthogonal'` (default; a U-turn through `rowBoundary` when the
 * successor starts before the exit) or `'straight'` (one line, the head rotated along it).
 */
export function computeArrowVisual(
  from: BarVisual,
  to: BarVisual,
  dep: { type?: DependencyType | undefined; lag?: number | undefined },
  cfg: ResolvedGanttConfig,
  rowBoundary: { fromTop: number; fromBottom: number },
  isCritical = false,
  /** Chart font size (`themeMetrics(theme).fontPx`; default 12): the lag label is 2 px smaller */
  fontPx = 12,
): ArrowVisual {
  const type = dep.type ?? DependencyType.FS;
  const lag = dep.lag ?? 0;
  const { offset, headSize: hs, radius, width } = cfg.arrows;
  const fromRight = type === DependencyType.FS || type === DependencyType.FF;
  const intoRight = type === DependencyType.FF || type === DependencyType.SF;

  const ex = fromRight ? rightEdge(from) : leftEdge(from);
  const ey = from.cy;
  const tipX = intoRight ? rightEdge(to) : leftEdge(to);
  const ty = to.cy;
  // The line stops at the base of the head; the head ends on the bar edge
  const baseX = intoRight ? tipX + hs : tipX - hs;

  const paint: Paint = isCritical ? themeVar('criticalColor') : (cfg.arrows.color ?? themeVar('arrowColor'));
  const lagText = lag ? (lag > 0 ? `+${lag}d` : `${lag}d`) : null;
  const common: Pick<ArrowVisual, 'paint' | 'width' | 'dashed' | 'dash' | 'critical' | 'selected' | 'halo'> = {
    paint,
    width: isCritical ? width + 0.5 : width,
    dashed: lag !== 0,
    dash: lag !== 0 ? ARROW_DASH : null,
    critical: isCritical,
    selected: false,
    halo: null,
  };

  if (cfg.arrows.routing === 'straight') {
    // Entry direction when the two ends meet: into the bar edge, like the orthogonal head
    const line = straightLink([ex, ey], [tipX, ty], intoRight ? -1 : 1, hs, fontPx - 2);
    return {
      d: line.d,
      head: line.head,
      ...common,
      lagLabel: lagText ? { text: lagText, x: line.labelAt.x, y: line.labelAt.y, fontPx: fontPx - 2 } : null,
      points: [
        [r2(ex), r2(ey)],
        [r2(tipX), r2(ty)],
      ],
    };
  }

  let points: Pt[];
  if (type === DependencyType.SS) {
    const vx = Math.min(ex, baseX) - offset;
    points = [
      [ex, ey],
      [vx, ey],
      [vx, ty],
      [baseX, ty],
    ];
  } else if (type === DependencyType.FF) {
    const vx = Math.max(ex, baseX) + offset;
    points = [
      [ex, ey],
      [vx, ey],
      [vx, ty],
      [baseX, ty],
    ];
  } else {
    // FS: exit right, enter left — SF: exit left, enter right
    const dir = fromRight ? 1 : -1;
    const vx = ex + dir * offset;
    const fits = fromRight ? vx <= baseX - 2 : vx >= baseX + 2;
    if (fits) {
      points = [
        [ex, ey],
        [vx, ey],
        [vx, ty],
        [baseX, ty],
      ];
    } else {
      // U-turn through the gap between the two rows
      const midY = ty > ey ? rowBoundary.fromBottom : rowBoundary.fromTop;
      const approachX = baseX - dir * offset;
      points = [
        [ex, ey],
        [vx, ey],
        [vx, midY],
        [approachX, midY],
        [approachX, ty],
        [baseX, ty],
      ];
    }
  }

  const head = intoRight
    ? `${tipX},${ty} ${tipX + hs},${ty - hs * 0.8} ${tipX + hs},${ty + hs * 0.8}`
    : `${tipX},${ty} ${tipX - hs},${ty - hs * 0.8} ${tipX - hs},${ty + hs * 0.8}`;

  const vertical = points[2];
  return {
    d: roundedPolyline(points, radius),
    head,
    ...common,
    lagLabel: lagText && vertical ? { text: lagText, x: vertical[0] + 4, y: (ey + ty) / 2, fontPx: fontPx - 2 } : null,
    points: [...points, [tipX, ty]],
  };
}

/**
 * The selected look of an arrow (`editing.dependencies.delete`: a clicked link): the focus-ring
 * paint (`var(--gantt-focus-ring)`, over the critical colour too), 1 px wider, `selected: true`,
 * and a halo behind it (`SELECTED_ARROW_HALO` px wider than the link, the focus ring at
 * `SELECTED_ARROW_HALO_OPACITY`): the selection stands out even where the arrows are painted in
 * the focus ring's colour (the default themes). The same visual when it is already selected.
 */
export function selectedArrowVisual(v: ArrowVisual): ArrowVisual {
  if (v.selected) return v;
  const paint = themeVar('focusRing');
  return {
    ...v,
    paint,
    width: v.width + 1,
    selected: true,
    halo: { paint, width: v.width + SELECTED_ARROW_HALO, opacity: SELECTED_ARROW_HALO_OPACITY },
  };
}

/** Squared distance from `(x, y)` to the segment `a`–`b`. */
function segmentDistance2(x: number, y: number, a: readonly [number, number], b: readonly [number, number]): number {
  const [ax, ay] = a;
  const dx = b[0] - ax;
  const dy = b[1] - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
  const px = ax + t * dx - x;
  const py = ay + t * dy - y;
  return px * px + py * py;
}

/**
 * Whether a pointer at `(x, y)` (timeline coordinates) hits the arrow: within `tolerance` px of
 * its route (`points`, the head's tip included): a band `2 × tolerance` wide, 10 px by default.
 * Bars win over arrows: hit-test the bar of the row first.
 */
export function hitTestArrow(
  visual: Pick<ArrowVisual, 'points'>,
  x: number,
  y: number,
  tolerance: number = ARROW_HIT_TOLERANCE,
): boolean {
  const pts = visual.points;
  const first = pts[0];
  if (!first) return false;
  const t2 = tolerance * tolerance;
  if (pts.length === 1) return segmentDistance2(x, y, first, first) <= t2;
  for (let i = 1; i < pts.length; i++) {
    if (segmentDistance2(x, y, pts[i - 1]!, pts[i]!) <= t2) return true;
  }
  return false;
}

/**
 * The key of the link a pointer at `(x, y)` hits (`hitTestArrow`), or `null`. `links` are in
 * drawing order (`ArrowIndex.query(y - tolerance, y + tolerance)`): the last one painted, which
 * lies on top, wins. Links without a visual (`null`: an end has no row) are skipped.
 */
export function arrowAt<L extends { readonly key: string }>(
  links: readonly L[],
  visualOf: (link: L) => Pick<ArrowVisual, 'points'> | null,
  x: number,
  y: number,
  tolerance: number = ARROW_HIT_TOLERANCE,
): string | null {
  for (let i = links.length - 1; i >= 0; i--) {
    const link = links[i]!;
    const v = visualOf(link);
    if (v && hitTestArrow(v, x, y, tolerance)) return link.key;
  }
  return null;
}

/** Horizontal gap (px) between the middle of a straight link and its lag label (as orthogonal: 4). */
const STRAIGHT_LABEL_GAP = 4;
/** Vertical clearance (px) between a sloped straight link and its lag label. */
const STRAIGHT_LABEL_CLEARANCE = 2;

/** Rounded to 1/100 px (a rotated head has long fractions), never `-0`. */
const r2 = (v: number): number => Math.round(v * 100) / 100 + 0;

/**
 * A straight link from `exit` to `tip` (`arrows.routing: 'straight'`): the line stops at the base
 * of the head and the head — the orthogonal head's size, `hs` long and `1.6 × hs` wide — points
 * along the line, its tip on the bar edge. `entryDir` (+1 rightwards, −1 leftwards) orients the
 * head when both ends meet; a link shorter than its head is all head (the line has no length).
 *
 * `labelAt` anchors the lag label (`dominant-baseline: central`, text to the right): its left
 * edge `STRAIGHT_LABEL_GAP` right of the midpoint, its centre on the midpoint's y for a vertical
 * line, else moved half the text height plus `STRAIGHT_LABEL_CLEARANCE` above a line that goes
 * down to the right (or is level) and below one that goes up — the side the line leaves free to
 * the right of the midpoint, so the text never crosses it.
 */
function straightLink(
  exit: Pt,
  tip: Pt,
  entryDir: 1 | -1,
  hs: number,
  labelFontPx: number,
): { d: string; head: string; labelAt: { x: number; y: number } } {
  const [ex, ey] = exit;
  const [tx, ty] = tip;
  const dx = tx - ex;
  const dy = ty - ey;
  const len = Math.hypot(dx, dy);
  const [ux, uy] = len > 0 ? [dx / len, dy / len] : [entryDir, 0];
  // Base of the head; the line ends there (or doesn't leave the exit when the link is too short)
  const bx = tx - ux * hs;
  const by = ty - uy * hs;
  const [lx, ly] = len > hs ? [bx, by] : [ex, ey];
  // Half-width of the head, perpendicular to the line (a level link into a left edge gives the
  // orthogonal head, point for point)
  const nx = -uy * hs * 0.8;
  const ny = ux * hs * 0.8;
  const head = `${r2(tx)},${r2(ty)} ${r2(bx - nx)},${r2(by - ny)} ${r2(bx + nx)},${r2(by + ny)}`;

  const shift = labelFontPx / 2 + STRAIGHT_LABEL_CLEARANCE;
  const side = dx === 0 ? 0 : dy / dx >= 0 ? -1 : 1;
  return {
    d: `M${r2(ex)},${r2(ey)}L${r2(lx)},${r2(ly)}`,
    head,
    labelAt: { x: r2((ex + tx) / 2 + STRAIGHT_LABEL_GAP), y: r2((ey + ty) / 2 + side * shift) },
  };
}
