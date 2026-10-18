// ─────────────────────────────────────────────────────────────
//  gantry · render/bars.ts
//  Visual geometry of task bars, summary (group) bars and milestones.
// ─────────────────────────────────────────────────────────────

import type { RowGeometry, GanttTask } from '../types';
import type { ResolvedGanttConfig } from './config';
import { resolveLength } from './config';
import { taskSpan } from './timeline';
import { readableOn } from './contrast';
import { CONTRAST_CSS_VARS } from './theme';
import { PAINTS, themeVar, type Paint } from './paint';

/** Narrowest task bar (px) that still gets resize handles. */
export const HANDLE_MIN_BAR_WIDTH = 12;
/** Gap (px) between a bar's box and its focus ring. */
export const FOCUS_RING_OFFSET = 3;
/**
 * How far (px) a bar's focus ring reaches outside the bar's box: `FOCUS_RING_OFFSET` plus half of
 * the ring's 2 px stroke (both painters draw `.gantt-bar-focus-ring` 2 px wide). The timeline
 * keeps this much room around a bar it scrolls into view (`timelineScrollPadding`).
 */
export const FOCUS_RING_MARGIN = FOCUS_RING_OFFSET + 1;
/** Extra pointer target (px) around a milestone's shape. */
export const MILESTONE_HIT_PAD = 3;
/** Width of a resize grip (px): a pill centred on the bar edge. */
const GRIP_WIDTH = 6;
/** Height of a resize grip: the bar height minus this inset, clamped to `GRIP_MIN`…`GRIP_MAX`. */
const GRIP_INSET = 6;
const GRIP_MIN = 8;
const GRIP_MAX = 16;
/** Largest summary-bar end cap (px below the bar). */
const SUMMARY_CAP = 7;
const LABEL_GAP = 6;
const LABEL_PAD = 6;
/** `LightTheme.barTextColor` / `DarkTheme.barTextColor` (when no `barTextColor` is passed) */
const DEFAULT_BAR_TEXT = '#FFFFFF';

export type BarKind = 'task' | 'group' | 'milestone';

export interface BarLabel {
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  inside: boolean;
}

/** Which theme fill a bar uses (explicit `task.barColor` keeps the tone of its kind). */
export type BarTone = 'default' | 'milestone' | 'critical';

/** Paints of a bar: theme tokens (`var(--gantt-*)`) or explicit task / option colours. */
export interface BarPaint {
  body: Paint;
  progress: Paint;
  /** Paint of `label` (inside or outside); the inside-label paint when there is no label */
  label: Paint;
}

/** Axis-aligned rectangle in timeline (SVG user) coordinates. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Resize handle at one end of a task bar. */
export interface BarHandle {
  /**
   * Pointer target: `bar.handles.hitSize` wide, reaching at most a third of the bar inward (the
   * rest lies outside the edge); at least `hitSize` tall where the row allows, never past the row.
   */
  hit: Rect;
  /** The visible grip (the bar overlay paints it): a pill centred on the edge */
  grip: Rect & { rx: number };
}

/** What a pointer position hits on a bar (`hitTestBar`). */
export type BarHit = 'left' | 'right' | 'bar';

export interface BarVisual {
  kind: BarKind;
  /** Bounding box (milestones: the shape's box) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Vertical centre of the bar */
  cy: number;
  rx: number;
  /** SVG path of the bar body */
  path: string;
  tone: BarTone;
  /** Colours: theme tokens or explicit task / option colours (`resolvePaint` turns them into hex) */
  paint: BarPaint;
  progress: { path: string; opacity: number } | null;
  label: BarLabel | null;
  baseline: { x: number; width: number; y: number } | null;
  /** Summary-bar end caps (path), when `groupBar.style === 'summary'` */
  caps: string | null;
  /**
   * Resize handles: resizable task bars at least `HANDLE_MIN_BAR_WIDTH` wide, `null` otherwise.
   * The two `hit` rects never overlap.
   */
  handles: { left: BarHandle; right: BarHandle } | null;
  /**
   * Focus ring: the bar's box (milestones: the shape's box; summary bars: with their end caps)
   * inflated by `FOCUS_RING_OFFSET`, its corner radius grown to match
   */
  focusRect: Rect & { rx: number };
  /**
   * Pointer target of the bar body (custom bars are hit by it too): the bar's box; milestones
   * `MILESTONE_HIT_PAD` larger on every side; summary bars down to the tips of their caps.
   * Clipped to the row.
   */
  hitBox: Rect;
}

export interface BarVisualInput {
  geo: RowGeometry;
  cfg: ResolvedGanttConfig;
  toX: (d: Date) => number;
  isCritical?: boolean | undefined;
  resizable?: boolean | undefined;
  /** Font size used for label fitting (`themeMetrics(theme).fontPx`; default 12) */
  fontPx?: number | undefined;
  /**
   * Preferred label colour on explicit `task.barColor` fills (`themeMetrics(theme).barTextColor`;
   * default `'#FFFFFF'`). Theme fills use the `--gantt-bar-text-on-*` contrast tokens instead.
   */
  barTextColor?: string | undefined;
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

function milestonePath(
  shape: 'diamond' | 'circle' | 'square',
  cx: number,
  cy: number,
  size: number,
  r: number,
): string {
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
  const task = geo.row.task;
  const kind = barKind(geo.row.barType);
  const fontPx = input.fontPx ?? 12;
  const rh = geo.height;
  const cy = geo.y + rh / 2;

  const tone: BarTone = isCritical ? 'critical' : kind === 'milestone' ? 'milestone' : 'default';
  const bodyPaint: Paint = isCritical
    ? themeVar('criticalColor')
    : (task.barColor ?? (kind === 'milestone' ? themeVar('milestoneColor') : themeVar('barColor')));
  const barTextColor = input.barTextColor ?? DEFAULT_BAR_TEXT;

  let x: number, y: number, width: number, height: number, rx: number, path: string;
  let caps: string | null = null;
  /** Depth of the summary caps below the bar (0 without caps) */
  let capDepth = 0;

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
      const c = Math.min(height, SUMMARY_CAP);
      caps = `M${x},${y + height}l0,${c}l${c},-${c}Z M${x + width},${y + height}l0,${c}l-${c},-${c}Z`;
      capDepth = c;
    }
  }

  // Progress fill (rounded on the left; on the right only when complete)
  let progress: BarVisual['progress'] = null;
  const showProgress =
    kind === 'task'
      ? cfg.bar.progress.show
      : kind === 'group'
        ? cfg.bar.progress.show && cfg.groupBar.showProgress
        : false;
  const pct = Math.min(Math.max(task.progress ?? 0, 0), 100);
  // Theme bars darken with the progress-overlay token (at `bar.progress.opacity`)
  const progressPaint: Paint = task.progressColor ?? cfg.bar.progress.color ?? PAINTS.progressOverlay;
  if (showProgress && pct > 0) {
    const pw = (width * pct) / 100;
    progress = {
      path: roundedRectPath(x, y, pw, height, rx, pw >= width - rx ? rx : 0),
      opacity: task.progressColor || cfg.bar.progress.color ? 1 : cfg.bar.progress.opacity,
    };
  }

  // Baseline rail under the bar
  let baseline: BarVisual['baseline'] = null;
  if (cfg.baseline && task.baseline) {
    const span = taskSpan(task.baseline, cfg);
    const bx = toX(span.start);
    baseline = { x: bx, width: Math.max(toX(span.end) - bx, 2), y: Math.min(geo.y + rh - 2, y + height + 3) };
  }

  const handles: BarVisual['handles'] =
    input.resizable && kind === 'task' && width >= HANDLE_MIN_BAR_WIDTH
      ? barHandles({ x, width, height, cy }, geo, cfg.bar.handles.hitSize)
      : null;

  const off = FOCUS_RING_OFFSET;
  const boxHeight = height + capDepth;
  const focusRect: BarVisual['focusRect'] = {
    x: x - off,
    y: y - off,
    width: width + off * 2,
    height: boxHeight + off * 2,
    rx: (kind === 'milestone' && cfg.milestone.shape === 'circle' ? width / 2 : rx) + off,
  };
  const pad = kind === 'milestone' ? MILESTONE_HIT_PAD : 0;
  const hitBox: Rect = { x: x - pad, y: y - pad, width: width + pad * 2, height: boxHeight + pad * 2 };
  // Clipped to the row (the hit-test looks the row up from `y`)
  if (hitBox.y < geo.y) {
    hitBox.height -= geo.y - hitBox.y;
    hitBox.y = geo.y;
  }
  if (hitBox.y + hitBox.height > geo.y + rh) hitBox.height = Math.max(0, geo.y + rh - hitBox.y);

  const label = computeLabel(task, kind, { x, y, width, height, cy }, cfg, fontPx);
  const opt = cfg.bar.label;
  // Explicit colours win; theme fills use the contrast tokens, explicit fills a concrete readable colour
  const insidePaint: Paint =
    task.textColor ??
    opt.color ??
    (tone === 'critical'
      ? `var(${CONTRAST_CSS_VARS.critical})`
      : task.barColor != null
        ? readableOn(task.barColor, barTextColor)
        : tone === 'milestone'
          ? `var(${CONTRAST_CSS_VARS.milestone})`
          : `var(${CONTRAST_CSS_VARS.bar})`);
  const outsidePaint: Paint = opt.color ?? themeVar('textPrimary');

  return {
    kind,
    x,
    y,
    width,
    height,
    cy,
    rx,
    path,
    tone,
    paint: {
      body: bodyPaint,
      progress: progressPaint,
      label: label ? (label.inside ? insidePaint : outsidePaint) : insidePaint,
    },
    progress,
    label,
    baseline,
    caps,
    handles,
    focusRect,
    hitBox,
  };
}

/**
 * Resize handles of a task bar. Each target is `hitSize` wide: centred on its edge, except that
 * it reaches at most a third of the bar inward (the rest lies outside the edge), so the two never
 * overlap. Its height is the larger of `hitSize` and the bar, capped at the row height, centred
 * on the row. The grips are pills centred on the edges.
 */
function barHandles(
  bar: { x: number; width: number; height: number; cy: number },
  geo: RowGeometry,
  hitSize: number,
): { left: BarHandle; right: BarHandle } {
  const size = Math.max(0, hitSize);
  const inward = Math.min(size / 2, bar.width / 3);
  const outward = size - inward;
  const hitHeight = Math.min(geo.height, Math.max(size, bar.height));
  const hitY = geo.y + (geo.height - hitHeight) / 2;
  const gripHeight = Math.min(geo.height, Math.max(GRIP_MIN, Math.min(GRIP_MAX, bar.height - GRIP_INSET)));
  const gripY = bar.cy - gripHeight / 2;
  const handle = (edge: number, hitX: number): BarHandle => ({
    hit: { x: hitX, y: hitY, width: size, height: hitHeight },
    grip: { x: edge - GRIP_WIDTH / 2, y: gripY, width: GRIP_WIDTH, height: gripHeight, rx: GRIP_WIDTH / 2 },
  });
  const right = bar.x + bar.width;
  return { left: handle(bar.x, bar.x - outward), right: handle(right, right - inward) };
}

/** Whether `(x, y)` lies in `r` (edges included); an empty rect contains nothing. */
function rectContains(r: Rect, x: number, y: number): boolean {
  return r.width > 0 && r.height > 0 && x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

/**
 * What a pointer at `(x, y)` (timeline coordinates, the same space as the visual) hits on a bar:
 * a resize handle first, then the bar body (`hitBox`), else `null`. Bindings find the row from
 * `y` and pass that row's visual, so built-in and custom bars hit the same way.
 */
export function hitTestBar(v: Pick<BarVisual, 'handles' | 'hitBox'>, x: number, y: number): BarHit | null {
  const h = v.handles;
  if (h) {
    if (rectContains(h.left.hit, x, y)) return 'left';
    if (rectContains(h.right.hit, x, y)) return 'right';
  }
  return rectContains(v.hitBox, x, y) ? 'bar' : null;
}

function computeLabel(
  task: GanttTask,
  kind: BarKind,
  box: { x: number; y: number; width: number; height: number; cy: number },
  cfg: ResolvedGanttConfig,
  fontPx: number,
): BarLabel | null {
  const opt = cfg.bar.label;
  if (opt.position === 'none') return null;
  const text = opt.template?.(task) ?? task.name;
  if (!text) return null;

  const outside = (side: 'left' | 'right'): BarLabel => ({
    text,
    x: side === 'right' ? box.x + box.width + LABEL_GAP : box.x - LABEL_GAP,
    y: box.cy,
    anchor: side === 'right' ? 'start' : 'end',
    inside: false,
  });

  // Milestones and thin summary bars can't hold text: label beside them
  const canHold = kind === 'task' || (kind === 'group' && cfg.groupBar.style === 'bar') || box.height >= fontPx + 2;
  let position = opt.position;
  if (kind === 'milestone' || !canHold) position = position === 'left' ? 'left' : 'right';

  if (position === 'left' || position === 'right') return outside(position);

  const room = box.width - LABEL_PAD * 2;
  if (position === 'auto' && estimateTextWidth(text, fontPx) > room) return outside('right');

  const fitted = fitText(text, room, fontPx);
  return fitted ? { text: fitted, x: box.x + box.width / 2, y: box.cy, anchor: 'middle', inside: true } : null;
}
