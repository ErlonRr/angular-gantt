// ─────────────────────────────────────────────────────────────
//  gantry · legend/gantt-legend.component.ts
//
//  The legend of the timeline markers (today, annotations, critical path,
//  baseline): the items of core `buildLegend` (`layout.legendItems`), the
//  Web Component's markup (`layers/legend.ts`). The component is the
//  `div.gantt-legend` itself (an attribute selector, no wrapper element),
//  so the paint keys are the ones the chart had before the extraction:
//
//    div.gantt-legend.gantt-legend--bottom|--toolbar
//      span.gantt-legend-title
//      span.gantt-legend-item ×n   svg.gantt-legend-swatch > line | rect · span (label)
//
//  Where it goes is the chart's `layout.legendPlacement` (core
//  `legendPlacement`, `legend.position`): GantryComponent attaches the
//  `--bottom` one after `.gantry-main`, an in-flow strip (the header
//  background, a top border: it takes room instead of floating over the
//  bars); the toolbar attaches the `--toolbar` one as its last child.
//  Attached only while placed there: none while off, with nothing to
//  explain, or in the table view (D27).
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LEGEND_SWATCH_SIZE } from '@gantryjs/core';

import { GanttLayoutService } from '../layout/gantt-layout.service';
import { GanttI18nService } from '../services/gantt-i18n.service';

@Component({
  selector: 'div[ganttLegend]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'gantt-legend' },
  template: `
    <span class="gantt-legend-title">{{ i18n.labels().legend }}</span>
    @for (item of layout.legendItems(); track item.key) {
      <span class="gantt-legend-item">
        <svg
          [attr.class]="'gantt-legend-swatch gantt-legend-swatch--' + item.shape"
          [attr.width]="swatchSize.width"
          [attr.height]="swatchSize.height"
          aria-hidden="true"
        >
          @let sw = item.swatch;
          @if (sw.kind === 'line') {
            <svg:line
              [attr.x1]="sw.x"
              [attr.y1]="sw.y1"
              [attr.x2]="sw.x"
              [attr.y2]="sw.y2"
              [style.stroke]="item.paint"
              [attr.stroke-width]="sw.strokeWidth"
              [attr.stroke-dasharray]="sw.dash"
            />
          } @else {
            <svg:rect
              [attr.x]="sw.x"
              [attr.y]="sw.y"
              [attr.width]="sw.width"
              [attr.height]="sw.height"
              [attr.rx]="sw.rx"
              [style.fill]="item.paint"
            />
          }
        </svg>
        <span>{{ item.label }}</span>
      </span>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 4px 14px;
        font-size: 11px;
        line-height: 16px;
        color: var(--gantt-text-sec);
      }
      /* The strip after the panes (legend.position 'bottom'): an in-flow row, never over the chart.
         The toolbar placement ('toolbar') is laid out by the toolbar's stylesheet. */
      :host(.gantt-legend--bottom) {
        flex: none;
        padding: 6px 12px;
        background: var(--gantt-header-bg);
        border-top: 1px solid var(--gantt-border);
      }
      .gantt-legend-title {
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        font-size: 9.5px;
        color: var(--gantt-text-muted);
      }
      .gantt-legend-item {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        white-space: nowrap;
        color: var(--gantt-text);
      }
      .gantt-legend-swatch {
        flex: none;
      }

      /* Forced colours (D25): each swatch as the chart draws its marker (inline SVG paints:
         !important): today Highlight, annotations GrayText, the critical bar dashed, the baseline */
      @media (forced-colors: active) {
        .gantt-legend-swatch--line > line {
          stroke: Highlight !important;
        }
        .gantt-legend-swatch--dashed > line {
          stroke: GrayText !important;
        }
        .gantt-legend-swatch--strip > rect {
          fill: GrayText !important;
        }
        .gantt-legend-swatch--bar > rect {
          fill: ButtonFace !important;
          stroke: ButtonText !important;
          stroke-width: 1.5px;
          stroke-dasharray: 4 2;
        }
      }
    `,
  ],
})
export class GanttLegendComponent {
  protected readonly layout = inject(GanttLayoutService);
  protected readonly i18n = inject(GanttI18nService);
  protected readonly swatchSize = LEGEND_SWATCH_SIZE;
}
