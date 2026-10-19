// ─────────────────────────────────────────────────────────────
//  gantry · drag/gantt-drag-preview.component.ts
//
//  Ghost overlay shown while a task is being dragged or resized.
//  Rendered as an SVG <g> on top of the canvas layer.
//
//  It paints `computeDragGhostVisual` from @gantryjs/core (shared with
//  the Web Component): a translucent, dashed copy of the bar at its
//  snapped position, at the bar's height and radius (the row's resolved
//  style, `[rowStyle]`). The movement ("+3d", "-2h") is in the drag readout
//  chip (`div[ganttDragReadout]`), not on the ghost (core's
//  `GhostVisual.label` is always `null`).
//  Colours are theme paints (`var(--gantt-*)`) bound as CSS properties.
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  computeDragGhostVisual,
  themeMetrics,
  LightTheme,
  type GhostVisual,
  type ResolvedGanttConfig,
  type ResolvedTaskStyle,
  type TimelineModel,
} from '@gantryjs/core';

import { type DragPreview } from './gantt-drag.service';
import { DEFAULT_FORMATS, DEFAULT_LABELS, type GanttI18n, type RowGeometry } from '../types';

/** `computeDragGhostVisual`'s i18n parameter: core no longer reads it (the ghost has no label) */
const GHOST_I18N: GanttI18n = { labels: DEFAULT_LABELS, formats: DEFAULT_FORMATS };

@Component({
  selector: 'g[ganttDragPreview]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ghost(); as g) {
      <!-- Ghost bar -->
      <svg:rect
        class="gantt-drag-preview"
        [attr.x]="g.x"
        [attr.y]="g.y"
        [attr.width]="g.width"
        [attr.height]="g.height"
        [attr.rx]="g.rx"
        [style.fill]="g.paint"
        [attr.opacity]="g.opacity"
        [attr.stroke-dasharray]="g.dash"
        [style.stroke]="g.paint"
        [attr.stroke-width]="g.strokeWidth"
      />
    }
  `,
  styles: [
    `
      :host {
        pointer-events: none;
      }
      /* Forced colours (D25): the ghost Highlight (inline SVG paints: !important) */
      @media (forced-colors: active) {
        .gantt-drag-preview {
          fill: Highlight !important;
          stroke: Highlight !important;
        }
      }
    `,
  ],
})
export class GanttDragPreviewComponent {
  /** Snapped span of the drag or resize (`GanttDragService.preview`); `null` hides the ghost */
  readonly preview = input<DragPreview | null>(null);
  /** Row geometry of the task being dragged: the ghost's row and bar height */
  readonly geometry = input<RowGeometry | null>(null);
  /** The chart's resolved config (bar height and radius) */
  readonly config = input<ResolvedGanttConfig | null>(null);
  /** The chart's timeline (`toX`) */
  readonly timeline = input<TimelineModel | null>(null);
  /** Bar label font size in px (`themeMetrics(theme).fontPx`) */
  readonly fontPx = input<number>(themeMetrics(LightTheme).fontPx);
  /**
   * The dragged row's resolved style (`layout.rowStyle()`, the one its bar is painted with): the
   * ghost takes its height and radius. `null`: the task's own style.
   */
  readonly rowStyle = input<ResolvedTaskStyle | null>(null);

  /** The ghost model; `null` when idle or when the dragged row or the chart model is missing */
  protected readonly ghost = computed<GhostVisual | null>(() => {
    const preview = this.preview();
    const geo = this.geometry();
    const cfg = this.config();
    const tl = this.timeline();
    if (!preview || !geo || !cfg || !tl) return null;
    return computeDragGhostVisual(preview, geo, cfg, tl.toX, GHOST_I18N, this.fontPx(), this.rowStyle() ?? undefined);
  });
}
