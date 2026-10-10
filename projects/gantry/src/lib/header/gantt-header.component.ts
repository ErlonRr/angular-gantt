// ─────────────────────────────────────────────────────────────
//  gantry · header/gantt-header.component.ts
//
//  Timeline header: N tiers from the @gantry/core render model, drawn
//  as HTML so labels stick to the left edge while scrolling and
//  ellipsize natively. Period delimiters, the current period and
//  non-working time match the chart body. Same markup as the Web Component.
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { TimelineModel, ResolvedGanttConfig } from '@gantry/core';

@Component({
  selector: 'gantt-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[style.display]': '"block"' },
  template: `
    <div class="g-header" [style.width.px]="timeline().totalWidth" [style.height.px]="timeline().headerHeight">
      @for (tier of timeline().tiers; track $index; let i = $index; let last = $last) {
        <div
          class="g-tier g-tier--{{ tier.unit }}"
          [class.g-tier--start]="tier.align === 'start'"
          [style.top.px]="tier.y"
          [style.height.px]="tier.height"
        >
          @if (last && showBands()) {
            @for (band of timeline().bands; track band.x) {
              <div
                class="g-band g-band--{{ band.kind }}"
                [style.left.px]="band.x"
                [style.width.px]="band.width"
                [style.background]="band.color"
              ></div>
            }
          }
          @for (cell of tier.cells; track cell.x) {
            <div
              class="g-cell {{ cell.className ?? '' }}"
              [class.g-cell--current]="last && cell.isCurrent"
              [style.left.px]="cell.x"
              [style.width.px]="cell.width"
              [style.border-left]="cellBorder(cell.x, last)"
            >
              <span class="g-cell-label" [title]="cell.label">{{ cell.label }}</span>
            </div>
          }
        </div>
      }
      @if (timeline().todayX >= 0) {
        <div class="g-today-pointer" [style.left.px]="timeline().todayX"></div>
      }
    </div>
  `,
  styles: [
    `
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
      .g-cell--current .g-cell-label {
        color: var(--gantt-today);
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
  readonly timeline = input.required<TimelineModel>();
  readonly config = input.required<ResolvedGanttConfig>();

  protected readonly showBands = computed(() => !!this.config().nonWorking?.showInHeader);
  private readonly majorSet = computed(() => new Set(this.timeline().majorLines));

  /** Upper tiers are delimiters by definition; lower cells only at major boundaries. */
  protected cellBorder(x: number, isBottom: boolean): string {
    if (x <= 0) return 'none';
    const major = this.config().gridLines.major;
    const isMajor = !isBottom || this.majorSet().has(x);
    return isMajor && major
      ? `${major.width}px ${major.dash ? 'dashed' : 'solid'} ${major.color}`
      : `1px solid ${this.config().theme.borderColor}`;
  }
}
