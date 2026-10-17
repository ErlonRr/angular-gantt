// ─────────────────────────────────────────────────────────────
//  gantry · header/gantt-header.component.ts
//
//  Timeline header: N tiers from the @gantry/core render model, drawn
//  as HTML so labels stick to the left edge while scrolling and
//  ellipsize natively. Period delimiters, the current period and
//  non-working time match the chart body. Same markup as the Web Component.
//  Cell borders come from core (`headerCellBorder`); colours are paints.
//
//  Horizontally windowed like the Web Component: each tier mounts only
//  the cells (and the finest tier the non-working bands) inside the
//  layout's horizontal window (the viewport ± half its width, snapped to
//  256 px), tracked by object identity, so a scroll inside one chunk
//  re-renders nothing and a scroll across a chunk only adds and removes
//  cells at the window's ends. `.g-header` keeps the full width.
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { headerCellBorder } from '@gantry/core';
import { GanttLayoutService } from '../layout/gantt-layout.service';

@Component({
  selector: 'gantt-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    @let tl = layout.timeline();
    @let cfg = layout.cfg();
    <div class="g-header" [style.width.px]="tl.totalWidth" [style.height.px]="tl.headerHeight">
      @for (tier of layout.tierWindows(); track $index; let i = $index; let last = $last) {
        <div
          class="g-tier g-tier--{{ tier.unit }}"
          [class.g-tier--start]="tier.align === 'start'"
          [style.top.px]="tier.y"
          [style.height.px]="tier.height"
        >
          @if (last && showBands()) {
            @for (band of layout.bandWindow(); track band) {
              <div
                class="g-band g-band--{{ band.kind }}"
                [style.left.px]="band.x"
                [style.width.px]="band.width"
                [style.background-color]="band.paint"
              ></div>
            }
          }
          @for (cell of tier.cells; track cell) {
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
    `,
  ],
})
export class GanttHeaderComponent {
  /** The chart's layout graph: timeline, horizontal window, today */
  protected readonly layout = inject(GanttLayoutService);

  protected readonly showBands = computed(() => !!this.layout.cfg().nonWorking?.showInHeader);
  /** Left border of a cell: upper tiers are delimiters, bottom cells only at major boundaries */
  protected readonly headerCellBorder = headerCellBorder;
}
