// ─────────────────────────────────────────────────────────────
//  gantry · arrows/gantt-arrow.component.ts
//  Paints one dependency link. The path (orthogonal routing with
//  U-turns, milestone-aware endpoints, rounded corners) comes from
//  `computeArrowVisual` in @gantryjs/core — shared with the Web Component,
//  and so do the dash of a link with a lag (`dash`) and the lag label's
//  font size (`lagLabel.fontPx`, the chart font size − 2): the painter
//  adds no geometry of its own. Its colour is a `Paint`, bound as a CSS
//  property.
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ArrowVisual } from '@gantryjs/core';

@Component({
  selector: 'g[ganttArrow]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'gantt-arrow',
    '[class.gantt-arrow--critical]': 'arrow().critical',
    'aria-hidden': 'true',
    'pointer-events': 'none',
  },
  template: `
    <svg:path
      [attr.d]="arrow().d"
      fill="none"
      [style.stroke]="arrow().paint"
      [attr.stroke-width]="arrow().width"
      [attr.stroke-dasharray]="arrow().dash"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
    <svg:polygon [attr.points]="arrow().head" [style.fill]="arrow().paint" />
    @if (arrow().lagLabel; as lag) {
      <svg:text
        [attr.x]="lag.x"
        [attr.y]="lag.y"
        [style.fill]="arrow().paint"
        [attr.font-size]="lag.fontPx"
        dominant-baseline="central"
        opacity="0.85"
        [textContent]="lag.text"
      ></svg:text>
    }
  `,
  styles: [
    `
      /* Forced colours (D25): the link, its head and lag label CanvasText (inline SVG paints: !important) */
      @media (forced-colors: active) {
        path {
          stroke: CanvasText !important;
        }
        polygon,
        text {
          fill: CanvasText !important;
        }
      }
    `,
  ],
})
export class GanttArrowComponent {
  readonly arrow = input.required<ArrowVisual>();
}
