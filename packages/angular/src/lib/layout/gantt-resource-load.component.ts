// ─────────────────────────────────────────────────────────────
//  gantry · layout/gantt-resource-load.component.ts
//
//  The resource view's histogram (`rows: 'resources'`, Phase 14): the
//  daily load of each mounted resource row against its capacity, from
//  core `computeLoadVisuals` over the chart's layout (`layout.loadVisuals`:
//  the utilization, the mounted rows, the horizontal window, the timeline).
//  The component is the layer group itself (attribute selector, no
//  wrapper), attached by the canvas only in the resource view, right
//  before the bars layer, so the paint keys are the Web Component's
//  (`layers/load.ts`):
//
//    g.gantt-load[aria-hidden][pointer-events=none]
//      defs > pattern#<canvas uid>-over-hatch > line     first child, while a mounted row is over its capacity
//      g.gantt-load-row[data-row-id]                     per mounted row with a load
//        path.gantt-load-bars                            the load up to the capacity (always, `d` may be empty)
//        path.gantt-load-over                            the load above it   (only while over capacity)
//        path.gantt-load-hatch                           the same path filled with the over-capacity hatch
//        path.gantt-load-cap                             the dashed capacity line (not on the unassigned row)
//
//  The geometry is core's strings, the paints core's `Paint`s (the
//  resource's colour or the bar colour, the over-allocation colour) set as
//  CSS properties, and the look of the over part and the capacity line
//  core's `LOAD_STYLE`, the same the exports draw. The hatch pattern has
//  the non-working one's geometry (`HATCH_PATTERN`); its id is unique per
//  chart (SVG ids live in the light DOM: the canvas' `uid`). A colour is
//  never the only cue: the hatch, the capacity line and the Peak load
//  column say the same.
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { HATCH_PATTERN, LOAD_STYLE, themeVar } from '@gantryjs/core';

import { GanttLayoutService } from './gantt-layout.service';

@Component({
  selector: 'g[ganttResourceLoad]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'gantt-load',
    'aria-hidden': 'true',
    'pointer-events': 'none',
  },
  template: `
    <!-- The over-capacity hatch: the non-working one's geometry in the over-allocation colour, heavier -->
    @if (hatched()) {
      <svg:defs>
        <svg:pattern
          [attr.id]="overHatchId()"
          [attr.width]="hatch.size"
          [attr.height]="hatch.size"
          patternUnits="userSpaceOnUse"
          [attr.patternTransform]="'rotate(' + hatch.rotate + ')'"
        >
          <svg:line
            x1="0"
            y1="0"
            x2="0"
            [attr.y2]="hatch.size"
            [attr.stroke-width]="hatch.strokeWidth"
            [attr.stroke-opacity]="style.hatchOpacity"
            [style.stroke]="overPaint"
          />
        </svg:pattern>
      </svg:defs>
    }
    @for (v of visuals(); track v.rowKey) {
      <svg:g class="gantt-load-row" [attr.data-row-id]="v.rowKey">
        <svg:path class="gantt-load-bars" [attr.d]="v.bars" [style.fill]="v.barsPaint" />
        @if (v.over) {
          <svg:path
            class="gantt-load-over"
            [attr.d]="v.over"
            [style.fill]="v.overPaint"
            [attr.fill-opacity]="style.overOpacity"
          />
          @if (v.hatch) {
            <svg:path class="gantt-load-hatch" [attr.d]="v.over" [attr.fill]="'url(#' + overHatchId() + ')'" />
          }
        }
        @if (v.cap) {
          <svg:path
            class="gantt-load-cap"
            [attr.d]="v.cap"
            fill="none"
            [attr.stroke-width]="style.capWidth"
            [attr.stroke-dasharray]="style.capDash"
            [style.stroke]="style.capPaint"
          />
        }
      </svg:g>
    }
  `,
  styles: [
    `
      /* Forced colours (D24): the load CanvasText, the part over the capacity Highlight with its hatch
         CanvasText, the capacity line GrayText (inline SVG paints: !important) */
      @media (forced-colors: active) {
        .gantt-load-bars {
          fill: CanvasText !important;
          fill-opacity: 1;
        }
        .gantt-load-over {
          fill: Highlight !important;
          fill-opacity: 1;
        }
        .gantt-load-cap {
          stroke: GrayText !important;
        }
        pattern > line {
          stroke: CanvasText !important;
        }
      }
    `,
  ],
})
export class GanttResourceLoadComponent {
  /** Id of the over-capacity hatch pattern (`<canvas uid>-over-hatch`) */
  readonly overHatchId = input.required<string>();

  private readonly layout = inject(GanttLayoutService);
  /** The mounted rows' histograms */
  protected readonly visuals = computed(() => this.layout.loadVisuals());
  /** A mounted row has load above its capacity: the pattern is drawn */
  protected readonly hatched = computed(() => this.visuals().some(v => v.hatch));

  protected readonly style = LOAD_STYLE;
  protected readonly hatch = HATCH_PATTERN;
  protected readonly overPaint = themeVar('overallocatedColor');
}
