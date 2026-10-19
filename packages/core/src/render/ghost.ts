// ─────────────────────────────────────────────────────────────
//  gantry · render/ghost.ts
//  The drag / resize ghost: a translucent, dashed copy of the bar at
//  its snapped position. The movement ("+3d", "-2h") is in the drag
//  readout chip (`formatDragReadout`), not on the ghost.
//  Painters draw it on top of the bars, without pointer events.
// ─────────────────────────────────────────────────────────────

import type { GanttI18n, ResolvedTaskStyle, RowGeometry } from '../types';
import type { ResolvedGanttConfig } from './config';
import type { DragPreview } from './drag';
import { computeBarVisual } from './bars';
import { PAINTS, type Paint } from './paint';

const GHOST_OPACITY = 0.35;
/** Opacity of the bar being dragged while its ghost shows where it will land (both renderers). */
export const DRAG_SOURCE_OPACITY = GHOST_OPACITY;
const GHOST_DASH = '4 2';
const GHOST_STROKE_WIDTH = 1.5;

/**
 * A movement label above a ghost. `computeDragGhostVisual` no longer makes one (since 2.0
 * `GhostVisual.label` is always `null`: the drag readout chip shows the movement); the shape stays
 * for `DragReadoutAnchor.label`.
 */
export interface GhostLabel {
  /** Snapped movement with its unit, e.g. `'+3d'`, `'-2h'` */
  text: string;
  /** Centre of the ghost (`text-anchor: middle`) */
  x: number;
  /** Top of the row: the text's alphabetic baseline */
  y: number;
  paint: Paint;
  /** Font size in px (weight 600, the chart's font family) */
  fontPx: number;
}

export interface GhostVisual {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  /** Fill and stroke */
  paint: Paint;
  /** Opacity of the whole shape (fill and stroke) */
  opacity: number;
  /** SVG dash array of the stroke */
  dash: string;
  strokeWidth: number;
  /**
   * Always `null` since 2.0: the drag readout chip (`formatDragReadout`, `placeDragReadout`) shows
   * the movement, so the ghost no longer draws its own "+3d". Painters can drop the label node.
   */
  label: GhostLabel | null;
}

/**
 * The ghost of the bar being dragged or resized: the snapped preview span (`DragSession.preview`)
 * drawn at the bar's height and corner radius, centred in its row. It has no movement label
 * (`label: null`): the drag readout chip carries the delta.
 *
 * `geo` is the dragged task's row geometry; `toX`, `fontPx` and `style` are the ones its bar
 * visual is computed with: pass the row's resolved style (`createStyleResolver`), so the ghost
 * takes the height and radius of `styles.levels`, `styles.parent`, a rule or `task.style` like its
 * bar (default: the task's own style, `taskOwnStyle`). `_i18n` is no longer read (the label it
 * translated is gone); the parameter stays so callers don't change.
 */
export function computeDragGhostVisual(
  preview: DragPreview,
  geo: RowGeometry,
  cfg: ResolvedGanttConfig,
  toX: (d: Date) => number,
  _i18n: GanttI18n,
  fontPx: number,
  style?: ResolvedTaskStyle,
): GhostVisual {
  const { height, rx } = computeBarVisual({ geo, cfg, toX, fontPx, style });
  return {
    x: preview.x,
    y: preview.y + (preview.height - height) / 2,
    width: preview.width,
    height,
    rx,
    paint: PAINTS.ghost,
    opacity: GHOST_OPACITY,
    dash: GHOST_DASH,
    strokeWidth: GHOST_STROKE_WIDTH,
    label: null,
  };
}
