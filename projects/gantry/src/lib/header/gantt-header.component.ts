// ─────────────────────────────────────────────────────────────
//  gantry · header/gantt-header.component.ts
//
//  Renders the two-row timeline header:
//
//  ┌──────────────────────────────────────────────────────┐
//  │  Q1 2026              │   Q2 2026                    │  ← top row
//  ├────────┬──────┬───────┼──────┬────────┬──────────────┤
//  │  Jan   │  Feb │  Mar  │  Apr │  May   │  Jun         │  ← bottom row
//  └────────┴──────┴───────┴──────┴────────┴──────────────┘
//
//  Stickiness: CSS `position: sticky; top: 0` on the host.
//  No JS scroll listeners needed — the browser handles it.
//
//  The component is purely presentational — it receives all
//  geometry as inputs and emits zoom events upward.
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  ElementRef,
  inject,
} from '@angular/core';

import {
  ViewMode,
  GanttTheme,
  HeaderCell,
} from '../types';

import {
  generateHeaderRows,
  generateGridLines,
  GridLine,
  zoomIn,
  zoomOut,
  HEADER_HEIGHTS,
} from '../gantt-math';
import { GanttI18nService } from '../services/gantt-i18n.service';

@Component({
  selector: 'gantt-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'class': 'gantt-header',
    '[style.position]':           '"sticky"',
    '[style.top]':                '"0"',
    '[style.z-index]':            '"10"',
    '[style.display]':            '"block"',
    '[style.background-color]':   'theme().headerBackground',
    '[style.border-bottom]':      '"1px solid " + theme().borderColor',
    '[style.overflow]':           '"hidden"',
  },
  template: `
    <svg
      [attr.width]="totalWidth()"
      [attr.height]="totalHeight()"
      [style.display]="'block'"
      aria-hidden="true"
    >
      <!-- ── Top row ───────────────────────────────────────── -->
      <g class="gantt-header-top">
        @for (cell of topCells(); track cell.dateKey) {
          <g>
            <!-- Cell background -->
            <svg:rect
              [attr.x]="cell.x + 0.5"
              [attr.y]="0.5"
              [attr.width]="cell.width - 1"
              [attr.height]="topHeight() - 1"
              [attr.fill]="theme().headerBackground"
              [attr.stroke]="theme().borderColor"
              stroke-width="0.5"
            />
            <!-- Cell label — centred; hidden when the cell is too narrow -->
            @if (cell.width >= minLabelWidth()) {
              <svg:text
                [attr.x]="cell.x + cell.width / 2"
                [attr.y]="topHeight() / 2"
                [attr.fill]="theme().textPrimary"
                [attr.font-size]="theme().fontSize"
                [attr.font-family]="theme().fontFamily"
                font-weight="600"
                text-anchor="middle"
                dominant-baseline="central"
                style="pointer-events: none; user-select: none;"
              >{{ cell.label }}</svg:text>
            }
          </g>
        }
      </g>

      <!-- ── Bottom row ────────────────────────────────────── -->
      <g class="gantt-header-bottom" [attr.transform]="'translate(0,' + topHeight() + ')'">
        @for (cell of bottomCells(); track cell.dateKey) {
          <g>
            <svg:rect
              [attr.x]="cell.x + 0.5"
              [attr.y]="0.5"
              [attr.width]="cell.width - 1"
              [attr.height]="bottomHeight() - 1"
              [attr.fill]="isCurrentPeriod(cell) ? currentPeriodFill() : theme().headerBackground"
              [attr.stroke]="theme().borderColor"
              stroke-width="0.5"
            />
            <!-- Only show label if cell is wide enough -->
            @if (cell.width >= minLabelWidth()) {
              <svg:text
                [attr.x]="cell.x + cell.width / 2"
                [attr.y]="bottomHeight() / 2"
                [attr.fill]="isCurrentPeriod(cell) ? theme().todayColor : theme().textSecondary"
                [attr.font-size]="subFontSize()"
                [attr.font-family]="theme().fontFamily"
                text-anchor="middle"
                dominant-baseline="central"
                style="pointer-events: none; user-select: none;"
              >{{ cell.label }}</svg:text>
            }
          </g>
        }
      </g>

    </svg>
  `,
  styles: [`
    :host {
      -webkit-overflow-scrolling: touch;
    }
  `],
})
export class GanttHeaderComponent {
  // ── Inputs ────────────────────────────────────────────────
  readonly viewMode   = input.required<ViewMode>();
  readonly startDate  = input.required<Date>();
  readonly endDate    = input.required<Date>();
  readonly pxPerDay   = input.required<number>();
  readonly totalWidth = input.required<number>();
  readonly theme      = input.required<GanttTheme>();

  // ── Outputs ───────────────────────────────────────────────
  readonly zoomInEvent  = output<void>();
  readonly zoomOutEvent = output<void>();

  private readonly i18n = inject(GanttI18nService);

  // ── Computed header rows ──────────────────────────────────
  private readonly headerRows = computed(() =>
    generateHeaderRows(
      this.viewMode(),
      this.startDate(),
      this.endDate(),
      this.pxPerDay(),
      this.i18n.bundle(),
    )
  );

  protected readonly topCells    = computed(() => this.headerRows()[0].cells);
  protected readonly bottomCells = computed(() => this.headerRows()[1].cells);
  protected readonly topHeight   = computed(() => this.headerRows()[0].height);
  protected readonly bottomHeight = computed(() => this.headerRows()[1].height);
  protected readonly totalHeight  = computed(() => this.topHeight() + this.bottomHeight());

  // ── Sub font size (bottom row is smaller) ─────────────────
  protected readonly subFontSize = computed(() => {
    const base = parseInt(this.theme().fontSize, 10) || 13;
    return `${base - 1}px`;
  });

  /** Minimum cell width (px) to show a label — avoids overlap */
  protected readonly minLabelWidth = computed(() => {
    switch (this.viewMode()) {
      case ViewMode.Day:     return 20;
      case ViewMode.Week:    return 24;
      case ViewMode.Month:   return 28;
      case ViewMode.Quarter: return 24;
      case ViewMode.Year:    return 32;
    }
  });

  // ── Today marker ─────────────────────────────────────────
  private readonly today = new Date();

  /**
   * X of the today line, shared with the canvas (single source of truth =
   * GanttLayoutService.todayX) so the header + chart draw ONE continuous line.
   * -1 hides it.
   */
  readonly todayX = input<number>(-1);

  // ── Current period highlight ──────────────────────────────
  protected readonly currentPeriodFill = computed(() => {
    const t = this.theme();
    // 12% opacity overlay of todayColor on headerBackground
    return t.todayColor + '1F'; // hex alpha 1F ≈ 12%
  });

  protected isCurrentPeriod(cell: HeaderCell): boolean {
    const today  = this.today;
    const cellStart = new Date(cell.dateKey);
    const pxPerDay  = this.pxPerDay();
    const cellEnd   = new Date(cellStart.getTime() + (cell.width / pxPerDay) * 86_400_000);
    return today >= cellStart && today < cellEnd;
  }

  // ── Grid lines (exposed for canvas to consume) ────────────
  readonly gridLines = computed<GridLine[]>(() =>
    generateGridLines(
      this.viewMode(),
      this.startDate(),
      this.endDate(),
      this.pxPerDay(),
    )
  );
}
