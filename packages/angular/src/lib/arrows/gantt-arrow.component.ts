// ─────────────────────────────────────────────────────────────
//  gantry · arrows/gantt-arrow.component.ts
//  Paints one dependency link. The path (orthogonal routing with
//  U-turns, milestone-aware endpoints, rounded corners) comes from
//  `computeArrowVisual` in @gantryjs/core — shared with the Web Component,
//  and so do the dash of a link with a lag (`dash`) and the lag label's
//  font size (`lagLabel.fontPx`, the chart font size − 2): the painter
//  adds no geometry of its own. Its colour is a `Paint`, bound as a CSS
//  property.
//
//  The group's class is `gantt-arrow`, plus `gantt-arrow--critical`
//  (critical path) and `gantt-arrow--selected` (the link selected for
//  deletion, Phase 11: the canvas hands it core `selectedArrowVisual`
//  through `layout.arrowSelection`, which gives its paint, width and
//  halo), as the Web Component's `paint/arrows.ts`. The selected link's
//  halo is `path.gantt-arrow-halo`, the group's first child (behind the
//  line), attached only while the visual has one. Arrows take no pointer
//  events and no focus: they are hit by geometry (`editing/link.ts`, core
//  `arrowAt`), and their keyboard path is the predecessors cell.
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ArrowVisual } from '@gantryjs/core';

@Component({
  selector: 'g[ganttArrow]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'gantt-arrow',
    '[class.gantt-arrow--critical]': 'arrow().critical',
    '[class.gantt-arrow--selected]': 'arrow().selected',
    'aria-hidden': 'true',
    'pointer-events': 'none',
  },
  template: `
    @if (arrow().halo; as halo) {
      <svg:path
        class="gantt-arrow-halo"
        [attr.d]="arrow().d"
        fill="none"
        [style.stroke]="halo.paint"
        [attr.stroke-width]="halo.width"
        [attr.stroke-opacity]="halo.opacity"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    }
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
      /* Forced colours (D25): the link, its head and lag label CanvasText (inline SVG paints: !important);
         the link selected for deletion Highlight, its halo too at its own opacity (phase 11) */
      @media (forced-colors: active) {
        path {
          stroke: CanvasText !important;
        }
        polygon,
        text {
          fill: CanvasText !important;
        }
        :host(.gantt-arrow--selected) path {
          stroke: Highlight !important;
        }
        :host(.gantt-arrow--selected) polygon {
          fill: Highlight !important;
        }
      }
    `,
  ],
})
export class GanttArrowComponent {
  readonly arrow = input.required<ArrowVisual>();
}
