// ─────────────────────────────────────────────────────────────
//  gantry · bars/bar-overlay.component.ts
//
//  One overlay per chart (D4 of Gantry 2 phase 9) over the bars: the
//  keyboard focus ring and the resize grips of the focused / hovered bar,
//  so custom bars get them too and no bar carries extra DOM (the bars draw
//  no outline of their own). The canvas attaches it while
//  `GanttBarFocusService.shown`, after `g.gantt-bars-layer` and before
//  `g.gantt-annotation-labels`, like the Web Component's bars region:
//
//    g.gantt-bar-overlay[aria-hidden][pointer-events=none]
//      rect.gantt-bar-focus-ring   stroke var(--gantt-focus-ring) 2 px, no fill   (BarVisual.focusRect)
//      rect.gantt-bar-grip ×2      fill var(--gantt-bg), stroke var(--gantt-focus-ring)   (handles.*.grip)
//
//  Shapes come from `GanttBarFocusService.overlay` (per mounted row, in
//  row order: ring, left grip, right grip): the ring of the bar focused
//  from the keyboard, the grips of that bar, of the hovered bar (fine
//  pointer) and of the selected bars (coarse pointer).
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { GanttBarFocusService } from './bar-focus.service';

@Component({
  selector: 'g[ganttBarOverlay]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'gantt-bar-overlay',
    'aria-hidden': 'true',
    'pointer-events': 'none',
  },
  template: `
    @for (shape of barFocus.overlay(); track shape.key) {
      <svg:rect
        [attr.class]="shape.className"
        [attr.x]="shape.rect.x"
        [attr.y]="shape.rect.y"
        [attr.width]="shape.rect.width"
        [attr.height]="shape.rect.height"
        [attr.rx]="shape.rect.rx"
      />
    }
  `,
  styles: [
    `
      .gantt-bar-focus-ring {
        fill: none;
        stroke: var(--gantt-focus-ring);
        stroke-width: 2px;
      }
      .gantt-bar-grip {
        fill: var(--gantt-bg);
        stroke: var(--gantt-focus-ring);
        stroke-width: 1.5px;
      }
      /* Forced colours (D25): the ring and the grips' outline Highlight, the grips Canvas */
      @media (forced-colors: active) {
        .gantt-bar-focus-ring,
        .gantt-bar-grip {
          stroke: Highlight;
        }
        .gantt-bar-grip {
          fill: Canvas;
        }
      }
    `,
  ],
})
export class GanttBarOverlayComponent {
  protected readonly barFocus = inject(GanttBarFocusService);
}
