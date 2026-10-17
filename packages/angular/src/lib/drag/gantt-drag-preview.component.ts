// ─────────────────────────────────────────────────────────────
//  gantry · drag/gantt-drag-preview.component.ts
//
//  Ghost overlay shown while a task is being dragged or resized.
//  Rendered as an SVG <g> on top of the canvas layer.
//
//  It paints `computeDragGhostVisual` from @gantry/core (shared with
//  the Web Component): a translucent, dashed copy of the bar at its
//  snapped position, with the movement ("+3d", "-2h") above it.
//  Colours are theme paints (`var(--gantt-*)`) bound as CSS properties.
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  computeDragGhostVisual,
  themeMetrics,
  LightTheme,
  type GhostVisual,
  type ResolvedGanttConfig,
  type TimelineModel,
} from '@gantry/core';

import { type DragPreview } from './gantt-drag.service';
import { GanttI18nService } from '../services/gantt-i18n.service';
import { DEFAULT_FORMATS, DEFAULT_LABELS, type GanttI18n, type RowGeometry } from '../types';

/** i18n of a preview used outside a chart */
const DEFAULT_I18N: GanttI18n = { labels: DEFAULT_LABELS, formats: DEFAULT_FORMATS };

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

      <!-- Movement label above the ghost bar (none while the snapped movement is zero) -->
      @if (g.label; as label) {
        <svg:text
          class="gantt-drag-preview-label"
          [attr.x]="label.x"
          [attr.y]="label.y"
          [style.fill]="label.paint"
          [attr.font-size]="label.fontPx + 'px'"
          font-weight="600"
          text-anchor="middle"
          dominant-baseline="auto"
        >
          {{ label.text }}
        </svg:text>
      }
    }
  `,
  styles: [
    `
      :host {
        pointer-events: none;
      }
      text {
        font-family: var(--gantt-font);
        user-select: none;
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

  private readonly i18n = inject(GanttI18nService, { optional: true });

  /** The ghost model; `null` when idle or when the dragged row or the chart model is missing */
  protected readonly ghost = computed<GhostVisual | null>(() => {
    const preview = this.preview();
    const geo = this.geometry();
    const cfg = this.config();
    const tl = this.timeline();
    if (!preview || !geo || !cfg || !tl) return null;
    return computeDragGhostVisual(preview, geo, cfg, tl.toX, this.i18n?.bundle() ?? DEFAULT_I18N, this.fontPx());
  });
}
