// ─────────────────────────────────────────────────────────────
//  gantry · arrows/gantt-arrow.component.ts
//  Paints one dependency link. The path (orthogonal routing with
//  U-turns, milestone-aware endpoints, rounded corners) comes from
//  `computeArrowVisual` in @gantry/core — shared with the Web Component.
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ArrowVisual } from '@gantry/core';

@Component({
  selector: 'g[ganttArrow]',
  standalone: true,
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
      [attr.stroke]="arrow().color"
      [attr.stroke-width]="arrow().width"
      [attr.stroke-dasharray]="arrow().dashed ? '5 3' : null"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
    <svg:polygon [attr.points]="arrow().head" [attr.fill]="arrow().color" />
    @if (arrow().lagLabel; as lag) {
      <svg:text
        [attr.x]="lag.x"
        [attr.y]="lag.y"
        [attr.fill]="arrow().color"
        [attr.font-size]="fontPx() - 2"
        dominant-baseline="central"
        opacity="0.85"
      >
        {{ lag.text }}
      </svg:text>
    }
  `,
})
export class GanttArrowComponent {
  readonly arrow = input.required<ArrowVisual>();
  readonly fontPx = input<number>(12);
}
