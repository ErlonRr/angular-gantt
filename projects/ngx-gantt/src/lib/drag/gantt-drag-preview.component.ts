// ─────────────────────────────────────────────────────────────
//  ngx-gantt · drag/gantt-drag-preview.component.ts
//
//  Ghost overlay shown while a task is being dragged or resized.
//  Rendered as an SVG <g> on top of the canvas layer.
//
//  The preview rect is semi-transparent and shows a delta label
//  (e.g. "+3d") so the user knows exactly how far they've moved.
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  NO_ERRORS_SCHEMA,
} from '@angular/core';

import { DragPreview }  from './gantt-drag.service';
import { GanttTheme }   from '../types';

@Component({
  selector:   'g[ganttDragPreview]',
  standalone:  true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [NO_ERRORS_SCHEMA],
  host: { 'style': 'pointer-events: none;' },
  template: `
    @if (preview()) {
      <!-- Ghost bar -->
      <rect
        [attr.x]="preview()!.x"
        [attr.y]="preview()!.y + 4"
        [attr.width]="preview()!.width"
        [attr.height]="preview()!.height - 8"
        rx="4"
        [attr.fill]="theme().barColor"
        opacity="0.35"
        stroke-dasharray="4 2"
        [attr.stroke]="theme().barColor"
        stroke-width="1.5"
      />

      <!-- Delta label above the ghost bar -->
      <text
        [attr.x]="preview()!.x + preview()!.width / 2"
        [attr.y]="preview()!.y"
        [attr.fill]="theme().textPrimary"
        [attr.font-size]="'11px'"
        [attr.font-family]="theme().fontFamily"
        font-weight="600"
        text-anchor="middle"
        dominant-baseline="auto"
        style="user-select:none;"
      >{{ deltaLabel() }}</text>
    }
  `,
})
export class GanttDragPreviewComponent {
  readonly preview = input<DragPreview | null>(null);
  readonly theme   = input.required<GanttTheme>();

  protected readonly deltaLabel = computed(() => {
    const p = this.preview();
    if (!p || p.daysDelta === 0) return '';
    const sign = p.daysDelta > 0 ? '+' : '';
    return `${sign}${p.daysDelta}d`;
  });
}
