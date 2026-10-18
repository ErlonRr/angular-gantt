// ─────────────────────────────────────────────────────────────
//  gantry · render/arrows.ts
//  Orthogonal dependency arrows (FS / SS / FF / SF + lag) with a U-turn
//  when the successor starts before the predecessor's exit point.
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
  dashed: boolean;
  critical: boolean;
  lagLabel: { text: string; x: number; y: number } | null;
}

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

export function computeArrowVisual(
  from: BarVisual,
  to: BarVisual,
  dep: { type?: DependencyType | undefined; lag?: number | undefined },
  cfg: ResolvedGanttConfig,
  rowBoundary: { fromTop: number; fromBottom: number },
  isCritical = false,
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
    paint: isCritical ? themeVar('criticalColor') : (cfg.arrows.color ?? themeVar('arrowColor')),
    width: isCritical ? width + 0.5 : width,
    dashed: lag !== 0,
    critical: isCritical,
    lagLabel: lag && vertical ? { text: lag > 0 ? `+${lag}d` : `${lag}d`, x: vertical[0] + 4, y: (ey + ty) / 2 } : null,
  };
}
