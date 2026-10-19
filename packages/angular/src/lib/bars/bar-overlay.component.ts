// ─────────────────────────────────────────────────────────────
//  gantry · bars/bar-overlay.component.ts
//
//  One overlay per chart (D4 of Gantry 2 phase 9) over the bars: the
//  keyboard focus ring, the resize grips and (Gantry 2 phase 11, D11) the
//  progress grip and the link connectors, so custom bars get them too and
//  no bar carries extra DOM (the bars draw no outline of their own). The
//  canvas attaches it while `GanttBarFocusService.shown`, after
//  `g.gantt-bars-layer` and before `g.gantt-annotation-labels`, like the
//  Web Component's bars region:
//
//    g.gantt-bar-overlay[aria-hidden][pointer-events=none]
//      rect.gantt-bar-focus-ring   stroke var(--gantt-focus-ring) 2 px, no fill   (BarVisual.focusRect)
//      rect.gantt-bar-grip ×2      fill var(--gantt-bg), stroke var(--gantt-focus-ring)   (handles.*.grip)
//      rect.gantt-progress-grip    the grips' look                                 (progressGrip.grip)
//      rect.gantt-link-connector ×2  fill var(--gantt-bg), stroke var(--gantt-focus-ring) (connectors.*.dot)
//        --source · --target (filled with the ring colour) · --invalid (stroked var(--gantt-status-overdue))
//
//  Shapes come from `GanttBarFocusService.overlay` (core
//  `computeBarOverlay`, per mounted row in row order: ring, left grip,
//  right grip, progress grip, start connector, end connector), keyed by
//  their key; the class is written on every change (a connector's
//  modifiers change under the same key during a link session).
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
      /* Progress grip and link connectors (Gantry 2 phase 11, D11, D22: no new theme variable) */
      .gantt-progress-grip {
        fill: var(--gantt-bg);
        stroke: var(--gantt-focus-ring);
        stroke-width: 1.5px;
      }
      .gantt-link-connector {
        fill: var(--gantt-bg);
        stroke: var(--gantt-focus-ring);
        stroke-width: 1.5px;
      }
      .gantt-link-connector--target {
        fill: var(--gantt-focus-ring);
      }
      .gantt-link-connector--invalid {
        stroke: var(--gantt-status-overdue);
      }
      /* Forced colours (D25): the ring and the grips' outline Highlight, the grips Canvas; the progress
         grip as the grips, the connectors Canvas outlined Highlight, the target one filled Highlight,
         an invalid target a 2 px dashed CanvasText outline */
      @media (forced-colors: active) {
        .gantt-bar-focus-ring,
        .gantt-bar-grip {
          stroke: Highlight;
        }
        .gantt-bar-grip {
          fill: Canvas;
        }
        .gantt-progress-grip {
          fill: Canvas !important;
          stroke: Highlight !important;
        }
        .gantt-link-connector {
          fill: Canvas !important;
          stroke: Highlight !important;
        }
        .gantt-link-connector--target {
          fill: Highlight !important;
        }
        .gantt-link-connector--invalid {
          stroke: CanvasText !important;
          stroke-width: 2px;
          stroke-dasharray: 4 2;
        }
      }
    `,
  ],
})
export class GanttBarOverlayComponent {
  protected readonly barFocus = inject(GanttBarFocusService);
}
