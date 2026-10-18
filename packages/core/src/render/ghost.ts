// ─────────────────────────────────────────────────────────────
//  gantry · render/ghost.ts
//  The drag / resize ghost: a translucent, dashed copy of the bar at
//  its snapped position, with the movement ("+3d", "-2h") above it.
//  Painters draw it on top of the bars, without pointer events.
// ─────────────────────────────────────────────────────────────

import type { GanttI18n, RowGeometry } from '../types';
import type { ResolvedGanttConfig } from './config';
import type { DragPreview } from './drag';
import { computeBarVisual } from './bars';
import { PAINTS, themeVar, type Paint } from './paint';

const GHOST_OPACITY = 0.35;
/** Opacity of the bar being dragged while its ghost shows where it will land (both renderers). */
export const DRAG_SOURCE_OPACITY = GHOST_OPACITY;
const GHOST_DASH = '4 2';
const GHOST_STROKE_WIDTH = 1.5;
const GHOST_LABEL_FONT_PX = 11;

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
  /** `null` while the snapped movement is zero */
  label: GhostLabel | null;
}

/**
 * The ghost of the bar being dragged or resized: the snapped preview span (`DragSession.preview`)
 * drawn at the bar's height, centred in its row, with the movement in snap units above it.
 *
 * `geo` is the dragged task's row geometry; `toX` and `fontPx` are the ones its bar visual is
 * computed with. The movement label comes from `i18n.labels.dragDelta` ("+3d", "-2h" by default).
 */
export function computeDragGhostVisual(
  preview: DragPreview,
  geo: RowGeometry,
  cfg: ResolvedGanttConfig,
  toX: (d: Date) => number,
  i18n: GanttI18n,
  fontPx: number,
): GhostVisual {
  const height = computeBarVisual({ geo, cfg, toX, fontPx }).height;
  return {
    x: preview.x,
    y: preview.y + (preview.height - height) / 2,
    width: preview.width,
    height,
    rx: cfg.bar.radius,
    paint: PAINTS.ghost,
    opacity: GHOST_OPACITY,
    dash: GHOST_DASH,
    strokeWidth: GHOST_STROKE_WIDTH,
    label:
      preview.delta === 0
        ? null
        : {
            text: i18n.labels.dragDelta(preview.delta, preview.unit),
            x: preview.x + preview.width / 2,
            y: preview.y,
            paint: themeVar('textPrimary'),
            fontPx: GHOST_LABEL_FONT_PX,
          },
  };
}
