// ─────────────────────────────────────────────────────────────
//  gantry · render/bars.ts
//  Visual geometry of task bars, summary (group) bars and milestones.
// ─────────────────────────────────────────────────────────────

import type { RowGeometry, GanttTask } from '../types';
import type { ResolvedGanttConfig } from './config';
import { resolveLength } from './config';
import { taskSpan } from './timeline';
import { readableOn } from './contrast';

/** Pointer distance (px) from a bar edge that resizes instead of moving. */
export const RESIZE_HANDLE_PX = 8;
const LABEL_GAP = 6;
const LABEL_PAD = 6;

export type BarKind = 'task' | 'group' | 'milestone';

export interface BarLabel {
  text:   string;
  x:      number;
  y:      number;
  anchor: 'start' | 'middle' | 'end';
  inside: boolean;
  color:  string;
}

export interface BarVisual {
  kind:     BarKind;
  /** Bounding box (milestones: the shape's box) */
  x:        number;
  y:        number;
  width:    number;
  height:   number;
  /** Vertical centre of the bar */
  cy:       number;
  rx:       number;
  /** SVG path of the bar body */
  path:     string;
  fill:     string;
  progress: { path: string; color: string; opacity: number } | null;
  label:    BarLabel | null;
  baseline: { x: number; width: number; y: number } | null;
  /** Summary-bar end caps (path), when `groupBar.style === 'summary'` */
  caps:     string | null;
  /** Resize hit zones in SVG x coordinates (task bars only) */
  handles:  { left: [number, number]; right: [number, number] } | null;
}

export interface BarVisualInput {
  geo:        RowGeometry;
  cfg:        ResolvedGanttConfig;
  toX:        (d: Date) => number;
  isCritical?: boolean;
  resizable?: boolean;
  /** Font size used for label fitting */
  fontPx?:    number;
}

/** Rough text width (no DOM measuring): average glyph ≈ 0.56em. */
export function estimateTextWidth(text: string, fontPx: number): number {
  return text.length * fontPx * 0.56;
}

/** Truncate with an ellipsis to fit `maxWidth` ('' when not even 2 chars fit). */
export function fitText(text: string, maxWidth: number, fontPx: number): string {
  if (estimateTextWidth(text, fontPx) <= maxWidth) return text;
  const chars = Math.floor(maxWidth / (fontPx * 0.56)) - 1;
  return chars >= 2 ? text.slice(0, chars).trimEnd() + '…' : '';
}

/** Rectangle path with independent left / right corner radii. */
export function roundedRectPath(x: number, y: number, w: number, h: number, rl: number, rr = rl): string {
  const r1 = Math.max(0, Math.min(rl, w / 2, h / 2));
  const r2 = Math.max(0, Math.min(rr, w / 2, h / 2));
  return [
    `M${x + r1},${y}`,
    `H${x + w - r2}`,
    r2 ? `A${r2},${r2} 0 0 1 ${x + w},${y + r2}` : '',
    `V${y + h - r2}`,
    r2 ? `A${r2},${r2} 0 0 1 ${x + w - r2},${y + h}` : '',
    `H${x + r1}`,
    r1 ? `A${r1},${r1} 0 0 1 ${x},${y + h - r1}` : '',
    `V${y + r1}`,
    r1 ? `A${r1},${r1} 0 0 1 ${x + r1},${y}` : '',
    'Z',
  ].join('');
}

function milestonePath(shape: 'diamond' | 'circle' | 'square', cx: number, cy: number, size: number, r: number): string {
  const h = size / 2;
  switch (shape) {
    case 'circle':
      return `M${cx - h},${cy}A${h},${h} 0 1 0 ${cx + h},${cy}A${h},${h} 0 1 0 ${cx - h},${cy}Z`;
    case 'square':
      return roundedRectPath(cx - h, cy - h, size, size, r);
    default:
      return `M${cx},${cy - h}L${cx + h},${cy}L${cx},${cy + h}L${cx - h},${cy}Z`;
  }
}

export function barKind(barType: string): BarKind {
  return barType === 'milestone' ? 'milestone' : barType === 'group' ? 'group' : 'task';
}

export function computeBarVisual(input: BarVisualInput): BarVisual {
  const { geo, cfg, toX, isCritical = false } = input;
  const theme = cfg.theme;
  const task = geo.row.task;
  const kind = barKind(geo.row.barType);
  const fontPx = input.fontPx ?? 12;
  const rh = geo.height;
  const cy = geo.y + rh / 2;

  const baseFill = task.barColor ?? (kind === 'milestone' ? theme.milestoneColor : theme.barColor);
  const fill = isCritical ? theme.criticalColor : baseFill;

  let x: number, y: number, width: number, height: number, rx: number, path: string;
  let caps: string | null = null;

  if (kind === 'milestone') {
    const size = cfg.milestone.size ?? Math.round(rh * 0.45);
    x = geo.barX - size / 2;
    y = cy - size / 2;
    width = height = size;
    rx = Math.min(cfg.bar.radius, size / 4);
    path = milestonePath(cfg.milestone.shape, geo.barX, cy, size, rx);
  } else {
    const isSummary = kind === 'group' && cfg.groupBar.style === 'summary';
    const lenSpec = kind === 'group' ? cfg.groupBar.height : cfg.bar.height;
    height = Math.max(4, Math.min(rh - 2, resolveLength(lenSpec, rh, rh * 0.6)));
    width = Math.max(geo.barWidth, cfg.bar.minWidth);
    x = geo.barX;
    y = cy - height / 2;
    rx = isSummary ? Math.min(cfg.bar.radius, 2) : cfg.bar.radius;
    path = roundedRectPath(x, y, width, height, rx);
    if (isSummary) {
      // Downward end caps: the classic "bracket" summary bar
      const c = Math.min(height, 7);
      caps = `M${x},${y + height}l0,${c}l${c},-${c}Z M${x + width},${y + height}l0,${c}l-${c},-${c}Z`;
    }
  }

  // Progress fill (rounded on the left; on the right only when complete)
  let progress: BarVisual['progress'] = null;
  const showProgress = kind === 'task' ? cfg.bar.progress.show
    : kind === 'group' ? cfg.bar.progress.show && cfg.groupBar.showProgress : false;
  const pct = Math.min(Math.max(task.progress ?? 0, 0), 100);
  if (showProgress && pct > 0) {
    const pw = (width * pct) / 100;
    progress = {
      path: roundedRectPath(x, y, pw, height, rx, pw >= width - rx ? rx : 0),
      color: task.progressColor ?? cfg.bar.progress.color ?? '#000000',
      opacity: task.progressColor || cfg.bar.progress.color ? 1 : cfg.bar.progress.opacity,
    };
  }

  // Baseline rail under the bar
  let baseline: BarVisual['baseline'] = null;
  if (cfg.baseline && task.baseline) {
    const span = taskSpan(task.baseline as Pick<GanttTask, 'start' | 'end'>, cfg);
    const bx = toX(span.start);
    baseline = { x: bx, width: Math.max(toX(span.end) - bx, 2), y: Math.min(geo.y + rh - 2, y + height + 3) };
  }

  const handles: BarVisual['handles'] = input.resizable && kind === 'task' && width >= RESIZE_HANDLE_PX * 3
    ? { left: [x - 2, x + RESIZE_HANDLE_PX], right: [x + width - RESIZE_HANDLE_PX, x + width + 2] }
    : null;

  return {
    kind, x, y, width, height, cy, rx, path, fill, progress,
    label: computeLabel(task, kind, { x, y, width, height, cy }, fill, cfg, fontPx),
    baseline, caps, handles,
  };
}

function computeLabel(
  task: GanttTask, kind: BarKind,
  box: { x: number; y: number; width: number; height: number; cy: number },
  fill: string, cfg: ResolvedGanttConfig, fontPx: number,
): BarLabel | null {
  const opt = cfg.bar.label;
  if (opt.position === 'none') return null;
  const text = opt.template?.(task) ?? task.name;
  if (!text) return null;

  const theme = cfg.theme;
  const outsideColor = opt.color ?? theme.textPrimary;
  // Explicit colours win; the theme default switches to white / near-black when unreadable on the fill
  const insideColor = task.textColor ?? opt.color ?? readableOn(fill, theme.barTextColor);
  const outside = (side: 'left' | 'right'): BarLabel => ({
    text,
    x: side === 'right' ? box.x + box.width + LABEL_GAP : box.x - LABEL_GAP,
    y: box.cy,
    anchor: side === 'right' ? 'start' : 'end',
    inside: false,
    color: outsideColor,
  });

  // Milestones and thin summary bars can't hold text: label beside them
  const canHold = kind === 'task' || (kind === 'group' && cfg.groupBar.style === 'bar') || box.height >= fontPx + 2;
  let position = opt.position;
  if (kind === 'milestone' || !canHold) position = position === 'left' ? 'left' : 'right';

  if (position === 'left' || position === 'right') return outside(position);

  const room = box.width - LABEL_PAD * 2;
  if (position === 'auto' && estimateTextWidth(text, fontPx) > room) return outside('right');

  const fitted = fitText(text, room, fontPx);
  return fitted
    ? { text: fitted, x: box.x + box.width / 2, y: box.cy, anchor: 'middle', inside: true, color: insideColor }
    : null;
}
