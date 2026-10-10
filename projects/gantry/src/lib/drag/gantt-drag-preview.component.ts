// ─────────────────────────────────────────────────────────────
//  gantry · drag/gantt-drag-preview.component.ts
//
//  Ghost overlay shown while a task is being dragged or resized.
//  Rendered as an SVG <g> on top of the canvas layer.
//
//  The preview rect is semi-transparent and shows a delta label
//  (e.g. "+3d") so the user knows exactly how far they've moved.
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { type DragPreview } from './gantt-drag.service';
import { type GanttTheme } from '../types';

@Component({
  selector: 'g[ganttDragPreview]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'pointer-events: none;' },
  template: `
    @if (preview()) {
      <!-- Ghost bar -->
      <svg:rect
        [attr.x]="preview()!.x"
        [attr.y]="preview()!.y + (preview()!.height - ghostHeight()) / 2"
        [attr.width]="preview()!.width"
        [attr.height]="ghostHeight()"
        [attr.rx]="radius()"
        [attr.fill]="theme().barColor"
        opacity="0.35"
        stroke-dasharray="4 2"
        [attr.stroke]="theme().barColor"
        stroke-width="1.5"
      />

      <!-- Delta label above the ghost bar -->
      <svg:text
        [attr.x]="preview()!.x + preview()!.width / 2"
        [attr.y]="preview()!.y"
        [attr.fill]="theme().textPrimary"
        [attr.font-size]="'11px'"
        [attr.font-family]="theme().fontFamily"
        font-weight="600"
        text-anchor="middle"
        dominant-baseline="auto"
        style="user-select:none;"
      >
        {{ deltaLabel() }}
      </svg:text>
    }
  `,
})
export class GanttDragPreviewComponent {
  readonly preview = input<DragPreview | null>(null);
  readonly theme = input.required<GanttTheme>();
  /** Bar height in px (from the bar's render visual) */
  readonly barHeight = input<number | null>(null);
  readonly radius = input<number>(4);
  /** Snap unit, for the delta label */
  readonly unit = input<'day' | 'hour'>('day');

  protected readonly ghostHeight = computed(() => {
    const p = this.preview();
    return this.barHeight() ?? (p ? p.height * 0.6 : 0);
  });

  protected readonly deltaLabel = computed(() => {
    const p = this.preview();
    if (!p || p.delta === 0) return '';
    const sign = p.delta > 0 ? '+' : '';
    return `${sign}${p.delta}${p.unit === 'hour' ? 'h' : 'd'}`;
  });
}
