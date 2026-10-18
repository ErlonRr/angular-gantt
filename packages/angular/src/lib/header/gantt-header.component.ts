// ─────────────────────────────────────────────────────────────
//  gantry · header/gantt-header.component.ts
//
//  Timeline header: N tiers from the @gantryjs/core render model, drawn
//  as HTML so labels stick to the left edge while scrolling and
//  ellipsize natively. Period delimiters, the current period and
//  non-working time match the chart body. Under the tiers, the marker
//  lane (D12, core `computeMarkerLane`, `layout.markerLane`) holds the
//  today marker and the annotation markers with their labels, so labels
//  never cover bars. Same markup as the Web Component
//  (packages/vanilla/src/layers/header.ts). Cell borders come from core
//  (`headerCellBorder`); colours are paints.
//
//  Horizontally windowed like the Web Component: each tier mounts only
//  the cells (and the finest tier the non-working bands) inside the
//  layout's horizontal window (the viewport ± half its width, snapped to
//  256 px), tracked by object identity, so a scroll inside one chunk
//  re-renders nothing and a scroll across a chunk only adds and removes
//  cells at the window's ends. `.g-header` keeps the full width and the
//  header height (`layout.headerHeight`: the tiers plus the lane).
//
//    div.g-header
//      div.g-tier  (one per tier)
//        div.g-band … · div.g-cell > span.g-cell-label …
//      div.g-marker-lane             while the lane shows (top = lane.y, 18 px)
//        div.g-marker.g-marker--today|--annotation      keyed by `marker.key`, in x order; `--x`, colour = marker paint
//          span.g-marker-label                          while the marker has a label: `--lx`, `--w`, colour = label paint, `title` when truncated
//      div.g-today-pointer           while the today line shows
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { headerCellBorder } from '@gantryjs/core';
import { GanttLayoutService } from '../layout/gantt-layout.service';

@Component({
  selector: 'gantt-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    @let tl = layout.timeline();
    @let cfg = layout.cfg();
    <div class="g-header" [style.width.px]="tl.totalWidth" [style.height.px]="layout.headerHeight()">
      @for (tier of layout.tierWindows(); track $index; let i = $index; let last = $last) {
        <div
          class="g-tier g-tier--{{ tier.unit }}"
          [class.g-tier--start]="tier.align === 'start'"
          [style.top.px]="tier.y"
          [style.height.px]="tier.height"
        >
          @if (last && showBands()) {
            <!-- Keyed like the Web Component (a rebuilt timeline keeps the nodes): bands by kind and x, cells by x -->
            @for (band of layout.bandWindow(); track band.kind + ':' + band.x) {
              <div
                class="g-band g-band--{{ band.kind }}"
                [style.left.px]="band.x"
                [style.width.px]="band.width"
                [style.background-color]="band.paint"
              ></div>
            }
          }
          @for (cell of tier.cells; track cell.x) {
            <div
              class="g-cell {{ cell.className ?? '' }}"
              [class.g-cell--current]="last && cell.isCurrent"
              [style.left.px]="cell.x"
              [style.width.px]="cell.width"
              [style.border-left]="headerCellBorder(cfg, tl, i, cell) ?? 'none'"
            >
              <span class="g-cell-label" [title]="cell.label">{{ cell.label }}</span>
            </div>
          }
        </div>
      }
      <!-- Marker lane under the tiers, before the today pointer (attached only while shown) -->
      @let lane = layout.markerLane();
      @if (lane.height > 0) {
        <div
          class="g-marker-lane"
          [style.top.px]="lane.y"
          [style.height.px]="lane.height"
          [style.font-size.px]="lane.labelFontPx"
        >
          @for (m of lane.markers; track m.key) {
            <div class="g-marker g-marker--{{ m.kind }}" [style.--x]="m.x + 'px'" [style.color]="m.paint">
              @if (m.label; as label) {
                <!-- The full text as a title when core truncated it to fit before the next marker -->
                <span
                  class="g-marker-label"
                  [style.--lx]="label.x + 'px'"
                  [style.--w]="label.width + 'px'"
                  [style.color]="label.paint"
                  [attr.title]="label.title !== label.text ? label.title : null"
                  [textContent]="label.text"
                ></span>
              }
            </div>
          }
        </div>
      }
      <!-- "Today" pointer at the bottom of the header (a line would cover the labels) -->
      @let todayX = layout.todayX();
      @if (todayX !== null) {
        <div class="g-today-pointer" [style.left.px]="todayX"></div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .g-header {
        position: relative;
      }
      .g-tier {
        position: absolute;
        left: 0;
        right: 0;
        border-bottom: 1px solid var(--gantt-border);
        box-sizing: border-box;
      }
      .g-cell {
        position: absolute;
        top: 0;
        bottom: 0;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: clip;
        white-space: nowrap;
        font-size: calc(var(--gantt-font-size, 13px) - 1px);
        color: var(--gantt-text-sec);
      }
      .g-tier:first-child .g-cell {
        color: var(--gantt-text);
        font-weight: 600;
        font-size: var(--gantt-font-size, 13px);
      }
      .g-tier--start .g-cell {
        justify-content: flex-start;
      }
      .g-cell-label {
        position: sticky;
        left: 0;
        padding: 0 6px;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
        box-sizing: border-box;
      }
      .g-cell--current {
        background: color-mix(in srgb, var(--gantt-today) 14%, transparent);
      }
      /* --gantt-today-label: core todayLabelColor, readable on the 14 % today tint (≥ 4.5:1) */
      .g-cell--current .g-cell-label {
        color: var(--gantt-today-label);
        font-weight: 600;
      }
      .g-band {
        position: absolute;
        top: 0;
        bottom: 0;
        pointer-events: none;
      }

      /* Marker lane (today and annotation labels, under the tiers): the Web Component's header.css.ts */
      .g-marker-lane {
        position: absolute;
        left: 0;
        right: 0;
        box-sizing: border-box;
        overflow: hidden;
        border-bottom: 1px solid var(--gantt-border);
        pointer-events: none;
      }
      .g-marker {
        position: absolute;
        top: 0;
        bottom: 0;
        left: var(--x);
        width: 0;
      }
      .g-marker::before {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        left: -1px;
        width: 2px;
        background: currentColor;
      }
      .g-marker--annotation::before {
        opacity: 0.8;
      }
      /* A label is placed against its marker: its own timeline x (--lx) minus the marker's (--x) */
      .g-marker-label {
        position: absolute;
        top: 2px;
        bottom: 2px;
        left: calc(var(--lx) - var(--x));
        width: var(--w);
        box-sizing: border-box;
        padding: 0 4px;
        display: flex;
        align-items: center;
        font-weight: 600;
        line-height: 1;
        white-space: nowrap;
        overflow: hidden;
        border-radius: 3px;
      }
      .g-marker--today .g-marker-label {
        background: color-mix(in srgb, var(--gantt-today) 14%, transparent);
      }

      .g-today-pointer {
        position: absolute;
        bottom: 0;
        width: 0;
        height: 0;
        margin-left: -5px;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 6px solid var(--gantt-today);
      }

      /* Forced colours (D25): the current cell Highlight / HighlightText, non-working time GrayText
         at 0.15 (intensive hours Highlight; inline paints: !important), today Highlight, annotation
         markers GrayText. What has a Highlight background opts out of forcing (the Canvas text
         backplate would hide HighlightText); so does the pointer (forced transparent sides draw a box). */
      @media (forced-colors: active) {
        .g-cell--current {
          forced-color-adjust: none;
          background-color: Highlight;
          border-color: CanvasText !important;
        }
        .g-cell--current,
        .g-cell--current .g-cell-label {
          color: HighlightText !important;
        }
        .g-band {
          background-color: GrayText !important;
          opacity: 0.15;
        }
        .g-band--intensive {
          background-color: Highlight !important;
        }
        .g-marker--today::before {
          background-color: Highlight;
        }
        .g-marker--annotation::before {
          background-color: GrayText;
        }
        .g-marker--today .g-marker-label {
          forced-color-adjust: none;
          background-color: Highlight;
          color: HighlightText !important;
        }
        .g-today-pointer {
          forced-color-adjust: none;
          color: Highlight;
          border-color: transparent;
          border-top-color: Highlight;
        }
      }
    `,
  ],
})
export class GanttHeaderComponent {
  /** The chart's layout graph: timeline, horizontal window, today, marker lane, header height */
  protected readonly layout = inject(GanttLayoutService);

  protected readonly showBands = computed(() => !!this.layout.cfg().nonWorking?.showInHeader);
  /** Left border of a cell: upper tiers are delimiters, bottom cells only at major boundaries */
  protected readonly headerCellBorder = headerCellBorder;
}
