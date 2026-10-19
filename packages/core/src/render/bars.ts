// ─────────────────────────────────────────────────────────────
//  gantry · render/bars.ts
//  Visual geometry of task bars, summary (group) bars and milestones.
// ─────────────────────────────────────────────────────────────

import type { RowGeometry, GanttTask, GanttLength, ResolvedTaskStyle } from '../types';
import type { ResolvedGanttConfig } from './config';
import { resolveLength } from './config';
import { taskSpan } from './timeline';
import { readableOn } from './contrast';
import { CONTRAST_CSS_VARS } from './theme';
import { PAINTS, themeVar, type Paint } from './paint';
import { taskOwnStyle } from './task-style';

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
/**
 * Side (px) of a link connector's pointer target (WCAG 2.5.8): a square just outside the bar's
 * other targets (its hit box and resize handles), holding the dot.
 */
export const CONNECTOR_HIT = 24;
/** Diameter (px) of a link connector's visible dot. */
export const CONNECTOR_DOT = 10;
/**
 * Gap (px) between a link connector's dot and the inner edge of its pointer target: the bar's
 * edge, or the outer edge of its resize handle (or of a milestone's padded hit box) when that
 * reaches further out.
 */
export const CONNECTOR_GAP = 2;
/**
 * Width (px) of the progress grip's pointer target (WCAG 2.5.8): centred on the progress edge,
 * kept between the resize handles.
 */
export const PROGRESS_GRIP_HIT = 24;
/** The visible progress grip: a pill this wide (px) on the bar's bottom edge. */
const PROGRESS_GRIP_WIDTH = 10;
/** Height (px) of the visible progress grip. */
const PROGRESS_GRIP_HEIGHT = 6;
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

/** Which theme fill a bar uses (an explicit `style.color` keeps the tone of its kind). */
export type BarTone = 'default' | 'milestone' | 'critical';

/** Paints of a bar: theme tokens (`var(--gantt-*)`) or explicit style / option colours. */
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

/**
 * What a pointer position hits on a bar (`hitTestBar`), in hit order: a resize handle (`'left'`,
 * `'right'`), the progress grip (`'progress'`), a link connector (`'link-start'`, `'link-end'`),
 * else the body (`'bar'`).
 */
export type BarHit = 'left' | 'right' | 'progress' | 'link-start' | 'link-end' | 'bar';

/** A link connector at one end of a bar (`editing.dependencies.create`): drag or click it to link. */
export interface BarConnector {
  /** The task edge it links from / to */
  side: 'start' | 'end';
  /** Centre of the dot (a link preview starts or ends here) */
  cx: number;
  cy: number;
  /**
   * Pointer target: a `CONNECTOR_HIT` square holding the dot, just outside the bar's hit box and
   * resize handle on its side (disjoint from both and from the other connector), on the bar's
   * centre line, kept inside the row (a row lower than `CONNECTOR_HIT` clips it)
   */
  hit: Rect;
  /**
   * The visible dot (the bar overlay paints it): a `CONNECTOR_DOT` circle drawn as a rect with
   * `rx`, `CONNECTOR_GAP` outside the hit's inner edge, centred on `cx`, `cy`
   */
  dot: Rect & { rx: number };
}

/** The progress grip of a bar (`editing.progress`): drag it to change the progress. */
export interface BarProgressGrip {
  /** x of the progress edge (the hit and the grip may sit beside it, between the resize handles) */
  x: number;
  /**
   * Pointer target: `PROGRESS_GRIP_HIT` wide, centred on the progress edge but kept between the
   * resize handles (or inside the bar without them); at least `PROGRESS_GRIP_HIT` tall, taller
   * when the bar and the grip's lower half need it, never past the row; centred on the row
   */
  hit: Rect;
  /** The visible grip (the bar overlay paints it): a pill on the bar's bottom edge at the progress edge, inside `hit` */
  grip: Rect & { rx: number };
}

/**
 * One child segment drawn inside a collapsed parent's bar (`rollup.segments`): `x` and `width` in
 * timeline coordinates; it spans the bar's `y` and `height` with the bar's `rx`.
 */
export interface BarSegment {
  x: number;
  width: number;
  paint: Paint;
}

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
  /** Colours: theme tokens or explicit style / option colours (`resolvePaint` turns them into hex) */
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
   * The progress grip: task and group bars that draw their progress (`bar.progress.show`; groups
   * also `groupBar.showProgress`), whose progress can be edited (`progressEditable`) and that
   * leave room for it: between the resize handles (the bar, without them) at least twice
   * `PROGRESS_GRIP_HIT` — the grip and as much again of body to move the bar by. `null` otherwise
   * (milestones always).
   */
  progressGrip: BarProgressGrip | null;
  /**
   * Link connectors at both ends (`linkable`; every kind), `null` otherwise. Their targets lie
   * outside the hit box and the resize handles, so every pointer target of a bar — handles,
   * progress grip, connectors — is at least 24 px both ways (in a row at least that tall),
   * disjoint from the others and inside the row.
   */
  connectors: { start: BarConnector; end: BarConnector } | null;
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
  /**
   * Extra classes of the bar element: the resolved style's `className` (every layer's classes,
   * `task.className` included, each once), or `null`
   */
  className: string | null;
  /**
   * Child segments of a collapsed rolled-up parent (`rollup.segments`), clipped to the bar, in
   * input order; `null` without segments and for milestones
   */
  segments: BarSegment[] | null;
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
   * Preferred label colour on explicit `style.color` fills (`themeMetrics(theme).barTextColor`;
   * default `'#FFFFFF'`). Theme fills use the `--gantt-bar-text-on-*` contrast tokens instead.
   */
  barTextColor?: string | undefined;
  /**
   * The row's resolved style (`createStyleResolver`): fill, progress and label colours, height,
   * corner radius, label position and classes. Default: the task's own style (`taskOwnStyle`:
   * its deprecated flat fields under `task.style`), without `options.styles`.
   */
  style?: ResolvedTaskStyle | undefined;
  /** Child segments to draw inside the bar (`rollupSegments`); clipped to the bar, ignored for milestones */
  segments?: readonly BarSegment[] | null | undefined;
  /** The progress can be edited here (`editRules(…).progress`): adds the `progressGrip` (when it has room) */
  progressEditable?: boolean | undefined;
  /** Links can start or end here (`editRules(…).linkFrom` / `linkTo`): adds the `connectors` */
  linkable?: boolean | undefined;
  /** Progress to draw instead of the task's, 0–100 (a progress drag's preview) */
  progress?: number | undefined;
}

const LABEL_POSITIONS: ReadonlySet<string> = new Set(['inside', 'left', 'right', 'auto', 'none']);

/**
 * Height in px of a task or group bar in a row `rowHeight` tall: `len` (px or % of the row; 60 %
 * when unreadable), at least 4 px and at most the row height − 2.
 */
export function resolveBarHeight(len: GanttLength | undefined, rowHeight: number): number {
  return Math.max(4, Math.min(rowHeight - 2, resolveLength(len, rowHeight, rowHeight * 0.6)));
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

/**
 * Geometry and paints of a row's bar. The resolved `style` gives the fill (the critical path
 * still paints the critical colour), the progress and label colours, the height (milestones: the
 * size), the corner radius (in place of `bar.radius`), the label position and the classes.
 */
export function computeBarVisual(input: BarVisualInput): BarVisual {
  const { geo, cfg, toX, isCritical = false } = input;
  const task = geo.row.task;
  const style = input.style ?? taskOwnStyle(task);
  const kind = barKind(geo.row.barType);
  const fontPx = input.fontPx ?? 12;
  const rh = geo.height;
  const cy = geo.y + rh / 2;
  const radius = typeof style.radius === 'number' && style.radius >= 0 ? style.radius : cfg.bar.radius;

  const tone: BarTone = isCritical ? 'critical' : kind === 'milestone' ? 'milestone' : 'default';
  const bodyPaint: Paint = isCritical
    ? themeVar('criticalColor')
    : (style.color ?? (kind === 'milestone' ? themeVar('milestoneColor') : themeVar('barColor')));
  const barTextColor = input.barTextColor ?? DEFAULT_BAR_TEXT;

  let x: number, y: number, width: number, height: number, rx: number, path: string;
  let caps: string | null = null;
  /** Depth of the summary caps below the bar (0 without caps) */
  let capDepth = 0;

  if (kind === 'milestone') {
    const size =
      style.height != null ? resolveBarHeight(style.height, rh) : (cfg.milestone.size ?? Math.round(rh * 0.45));
    x = geo.barX - size / 2;
    y = cy - size / 2;
    width = height = size;
    rx = Math.min(radius, size / 4);
    path = milestonePath(cfg.milestone.shape, geo.barX, cy, size, rx);
  } else {
    const isSummary = kind === 'group' && cfg.groupBar.style === 'summary';
    const lenSpec = style.height ?? (kind === 'group' ? cfg.groupBar.height : cfg.bar.height);
    height = resolveBarHeight(lenSpec, rh);
    width = Math.max(geo.barWidth, cfg.bar.minWidth);
    x = geo.barX;
    y = cy - height / 2;
    rx = isSummary ? Math.min(radius, 2) : radius;
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
  const pct = Math.min(Math.max(input.progress ?? task.progress ?? 0, 0), 100);
  // Theme bars darken with the progress-overlay token (at `bar.progress.opacity`)
  const progressPaint: Paint = style.progressColor ?? cfg.bar.progress.color ?? PAINTS.progressOverlay;
  if (showProgress && pct > 0) {
    const pw = (width * pct) / 100;
    progress = {
      path: roundedRectPath(x, y, pw, height, rx, pw >= width - rx ? rx : 0),
      opacity: style.progressColor || cfg.bar.progress.color ? 1 : cfg.bar.progress.opacity,
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

  const box = { x, y, width, height, cy };
  const progressGrip: BarVisual['progressGrip'] =
    input.progressEditable && showProgress ? barProgressGrip(box, pct, handles, geo) : null;
  const connectors: BarVisual['connectors'] = input.linkable ? barConnectors(box, handles, hitBox, geo) : null;

  const opt = cfg.bar.label;
  const position = style.label && LABEL_POSITIONS.has(style.label) ? style.label : opt.position;
  const label = computeLabel(task, kind, { x, y, width, height, cy }, cfg, fontPx, position);
  // Explicit colours win; theme fills use the contrast tokens, explicit fills a concrete readable colour
  const insidePaint: Paint =
    style.textColor ??
    opt.color ??
    (tone === 'critical'
      ? `var(${CONTRAST_CSS_VARS.critical})`
      : style.color != null
        ? readableOn(style.color, barTextColor)
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
    progressGrip,
    connectors,
    focusRect,
    hitBox,
    className: style.className || null,
    segments: kind === 'milestone' ? null : clipSegments(input.segments, x, width),
  };
}

/** Segments clipped to the bar `[x, x + width]`; the empty ones dropped; `null` when none is left. */
function clipSegments(
  segments: readonly BarSegment[] | null | undefined,
  x: number,
  width: number,
): BarSegment[] | null {
  if (!segments?.length) return null;
  const out: BarSegment[] = [];
  for (const seg of segments) {
    const left = Math.max(seg.x, x);
    const right = Math.min(seg.x + seg.width, x + width);
    if (right > left) out.push({ x: left, width: right - left, paint: seg.paint });
  }
  return out.length ? out : null;
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

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * The progress grip of a bar whose progress is `pct` (0–100), or `null` without room: the space
 * between the resize handles (the bar, without them) must hold twice `PROGRESS_GRIP_HIT`. The
 * target is centred on the progress edge, then moved inside that space (at 0 % and 100 % it sits
 * next to the handle); the visible pill is centred on the edge and on the bar's bottom edge,
 * then moved inside the target (only a bar nearly as tall as its row moves it up).
 */
function barProgressGrip(
  bar: { x: number; y: number; width: number; height: number },
  pct: number,
  handles: BarVisual['handles'],
  geo: RowGeometry,
): BarProgressGrip | null {
  const lo = handles ? handles.left.hit.x + handles.left.hit.width : bar.x;
  const hi = handles ? handles.right.hit.x : bar.x + bar.width;
  const size = PROGRESS_GRIP_HIT;
  if (hi - lo < size * 2) return null;
  const edge = bar.x + (bar.width * pct) / 100;
  const hitX = clamp(edge - size / 2, lo, hi - size);
  // Tall enough for the pill on the bar's bottom edge (half of it below the bar)
  const hitHeight = Math.min(geo.height, Math.max(size, bar.height + PROGRESS_GRIP_HEIGHT));
  const hitY = geo.y + (geo.height - hitHeight) / 2;
  const w = PROGRESS_GRIP_WIDTH;
  const h = Math.min(PROGRESS_GRIP_HEIGHT, hitHeight);
  return {
    x: edge,
    hit: { x: hitX, y: hitY, width: size, height: hitHeight },
    grip: {
      x: clamp(edge - w / 2, hitX, hitX + size - w),
      y: clamp(bar.y + bar.height - h / 2, hitY, hitY + hitHeight - h),
      width: w,
      height: h,
      rx: h / 2,
    },
  };
}

/**
 * The link connectors of a bar: on each side a `CONNECTOR_HIT` square just outside everything
 * else the bar is hit by (its hit box and its resize handle), on the bar's centre line and inside
 * the row; the dot `CONNECTOR_GAP` beyond the square's inner edge.
 */
function barConnectors(
  bar: { x: number; width: number; cy: number },
  handles: BarVisual['handles'],
  hitBox: Rect,
  geo: RowGeometry,
): { start: BarConnector; end: BarConnector } {
  let inStart = Math.min(bar.x, hitBox.x);
  let inEnd = Math.max(bar.x + bar.width, hitBox.x + hitBox.width);
  if (handles) {
    inStart = Math.min(inStart, handles.left.hit.x);
    inEnd = Math.max(inEnd, handles.right.hit.x + handles.right.hit.width);
  }
  const size = CONNECTOR_HIT;
  const hitHeight = Math.min(size, geo.height);
  const hitY = clamp(bar.cy - size / 2, geo.y, geo.y + geo.height - hitHeight);
  const r = CONNECTOR_DOT / 2;
  const connector = (side: 'start' | 'end', inner: number, dir: -1 | 1): BarConnector => {
    const cx = inner + dir * (CONNECTOR_GAP + r);
    return {
      side,
      cx,
      cy: bar.cy,
      hit: { x: dir < 0 ? inner - size : inner, y: hitY, width: size, height: hitHeight },
      dot: { x: cx - r, y: bar.cy - r, width: CONNECTOR_DOT, height: CONNECTOR_DOT, rx: r },
    };
  };
  return { start: connector('start', inStart, -1), end: connector('end', inEnd, 1) };
}

/** Whether `(x, y)` lies in `r` (edges included); an empty rect contains nothing. */
function rectContains(r: Rect, x: number, y: number): boolean {
  return r.width > 0 && r.height > 0 && x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

/** What `hitTestBar` reads: the handles and the hit box, and the editing targets when there are any. */
export type BarHitTarget = Pick<BarVisual, 'handles' | 'hitBox'> &
  Partial<Pick<BarVisual, 'progressGrip' | 'connectors'>>;

/**
 * What a pointer at `(x, y)` (timeline coordinates, the same space as the visual) hits on a bar,
 * in this order: a resize handle (`'left'`, `'right'`), the progress grip (`'progress'`), a link
 * connector (`'link-start'`, `'link-end'`), then the bar body (`hitBox`, `'bar'`), else `null`.
 * Bindings find the row from `y` and pass that row's visual, so built-in and custom bars hit the
 * same way. `editTargets: false` skips the progress grip and the connectors (a bar whose overlay
 * doesn't show them: a press there is on the body, or on nothing).
 */
export function hitTestBar(v: BarHitTarget, x: number, y: number, editTargets = true): BarHit | null {
  const h = v.handles;
  if (h) {
    if (rectContains(h.left.hit, x, y)) return 'left';
    if (rectContains(h.right.hit, x, y)) return 'right';
  }
  if (editTargets) {
    if (v.progressGrip && rectContains(v.progressGrip.hit, x, y)) return 'progress';
    const c = v.connectors;
    if (c) {
      if (rectContains(c.start.hit, x, y)) return 'link-start';
      if (rectContains(c.end.hit, x, y)) return 'link-end';
    }
  }
  return rectContains(v.hitBox, x, y) ? 'bar' : null;
}

function computeLabel(
  task: GanttTask,
  kind: BarKind,
  box: { x: number; y: number; width: number; height: number; cy: number },
  cfg: ResolvedGanttConfig,
  fontPx: number,
  position: ResolvedGanttConfig['bar']['label']['position'],
): BarLabel | null {
  const opt = cfg.bar.label;
  if (position === 'none') return null;
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
  if (kind === 'milestone' || !canHold) position = position === 'left' ? 'left' : 'right';

  if (position === 'left' || position === 'right') return outside(position);

  const room = box.width - LABEL_PAD * 2;
  if (position === 'auto' && estimateTextWidth(text, fontPx) > room) return outside('right');

  const fitted = fitText(text, room, fontPx);
  return fitted ? { text: fitted, x: box.x + box.width / 2, y: box.cy, anchor: 'middle', inside: true } : null;
}
