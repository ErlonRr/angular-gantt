// ─────────────────────────────────────────────────────────────
//  gantry · states/gantt-chart-state.component.ts
//
//  The box over the chart body while it is not ready (D11 of Gantry 2
//  phase 9): loading, error or empty — core `resolveChartState`
//  (`layout.chartState`), the Web Component's `layers/states.ts`.
//  GantryComponent attaches it as the last child of `.gantry-main` only
//  while `kind !== 'ready'` (D27), from the header height down (both
//  headers stay visible), and projects the consumer's `[ganttEmpty]`
//  content into it (its fallback, `p.gantt-state-message` with
//  `labels.emptyState`, lives in GantryComponent's template:
//  `<ng-content>` fallback content only works where the consumer's
//  content is projected first):
//
//    div.gantt-state.gantt-state--loading|--error|--empty
//      loading → div.gantt-skeleton[aria-hidden]
//                  > div.gantt-skeleton-row > span.gantt-skeleton-name + span.gantt-skeleton-bar
//                + span.gantt-state-message   `labels.loading`, visually hidden (assistive text)
//      error   → div.gantt-state-box[role=alert]
//                  > p.gantt-state-title + p.gantt-state-message + button.gantt-state-retry[data-focus-key=retry]
//      empty   → div.gantt-state-box > [ganttEmpty] content | p.gantt-state-message
//
//  The skeleton's rows and blocks are core `skeletonRows` (no block in
//  the panel in the chart view, none in the timeline in the table view),
//  placed through style bindings; its shimmer stops under
//  `prefers-reduced-motion`. The box is opaque: nothing of the chart
//  shows through.
//
//  Retry emits `retry` with `{ source: 'error' }` for the consumer's
//  `errorMessage`, `{ source: 'dataSource' }` for a data source whose
//  first page failed (GantryComponent then calls `dataSource.retry()`).
//  The error box is the alert (GantryComponent leaves `.gantt-sr-alert`
//  empty in the error state); the host's `aria-busy` is GantryComponent's.
//
//  Styles: not encapsulated (the Web Component's rules as they are), so
//  they reach the empty-state fallback and the `[ganttEmpty]` content,
//  which belong to GantryComponent's view. Every selector is a
//  `gantt-state*` / `gantt-skeleton*` class.
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, computed, inject, input, output, ViewEncapsulation } from '@angular/core';
import { bodyHeight, skeletonRows, type ChartState, type RetryEvent, type SkeletonRow } from '@gantryjs/core';

import { GanttLayoutService } from '../layout/gantt-layout.service';
import { GanttI18nService } from '../services/gantt-i18n.service';

@Component({
  selector: 'div[ganttChartState]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'gantt-state',
    '[class.gantt-state--loading]': "state().kind === 'loading'",
    '[class.gantt-state--error]': "state().kind === 'error'",
    '[class.gantt-state--empty]': "state().kind === 'empty'",
    // From the header height down (the Web Component's --gantry-header-h)
    '[style.top.px]': 'layout.headerHeight()',
  },
  template: `
    @let s = state();
    @switch (s.kind) {
      @case ('loading') {
        <div class="gantt-skeleton" aria-hidden="true">
          @for (row of skeleton(); track row.key) {
            <div class="gantt-skeleton-row" [style.top.px]="row.y" [style.height.px]="row.height">
              @if (row.name; as b) {
                <span
                  class="gantt-skeleton-name"
                  [style.left.px]="b.x"
                  [style.top.px]="b.y"
                  [style.width.px]="b.width"
                  [style.height.px]="b.height"
                ></span>
              }
              @if (row.bar; as b) {
                <span
                  class="gantt-skeleton-bar"
                  [style.left.px]="b.x"
                  [style.top.px]="b.y"
                  [style.width.px]="b.width"
                  [style.height.px]="b.height"
                ></span>
              }
            </div>
          }
        </div>
        <!-- The skeleton is decoration: its text for assistive technologies, visually hidden -->
        <span class="gantt-state-message">{{ s.message }}</span>
      }
      @case ('error') {
        <div class="gantt-state-box" role="alert">
          <p class="gantt-state-title">{{ s.title }}</p>
          <p class="gantt-state-message">{{ s.message }}</p>
          @if (s.retry; as source) {
            <button type="button" class="gantt-state-retry" data-focus-key="retry" (click)="onRetry(source)">
              <ng-container>{{ i18n.labels().retry }}</ng-container>
            </button>
          }
        </div>
      }
      @case ('empty') {
        <div class="gantt-state-box"><ng-content /></div>
      }
    }
  `,
  styles: [
    `
      /* ── Chart states (loading · error · empty) ─────────── */
      .gantt-state {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        /* The header height: bound on the host (layout.headerHeight) */
        top: var(--gantry-header-h, 0px);
        z-index: 13;
        overflow: hidden;
        background: var(--gantt-bg);
        color: var(--gantt-text);
      }
      .gantt-state--error,
      .gantt-state--empty {
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        padding: 24px;
      }
      .gantt-state-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        max-width: 420px;
        text-align: center;
      }
      .gantt-state-title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--gantt-text);
      }
      .gantt-state-message {
        margin: 0;
        font-size: 13px;
        color: var(--gantt-text-sec);
      }
      /* Loading: the skeleton is decoration; its text is for assistive technologies only */
      .gantt-state--loading .gantt-state-message {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .gantt-state-retry {
        box-sizing: border-box;
        min-width: 32px;
        min-height: 32px;
        margin-top: 10px;
        padding: 0 14px;
        font: inherit;
        font-size: 12px;
        cursor: pointer;
        border-radius: 6px;
        border: 1px solid var(--gantt-border);
        background: var(--gantt-panel-bg);
        color: var(--gantt-text);
      }
      .gantt-state-retry:hover {
        border-color: var(--gantt-text-muted);
      }
      .gantt-state-retry:focus-visible {
        outline: 2px solid var(--gantt-focus-ring);
        outline-offset: 2px;
      }

      /* Loading: placeholder rows, placed from the core skeleton model */
      .gantt-skeleton {
        position: absolute;
        inset: 0;
      }
      .gantt-skeleton-row {
        position: absolute;
        left: 0;
        right: 0;
        box-sizing: border-box;
        border-bottom: 1px solid var(--gantt-grid-line);
      }
      .gantt-skeleton-name,
      .gantt-skeleton-bar {
        position: absolute;
        border-radius: 4px;
        background-color: color-mix(in srgb, var(--gantt-text-muted) 18%, transparent);
        background-image: linear-gradient(
          90deg,
          transparent,
          color-mix(in srgb, var(--gantt-bg) 60%, transparent),
          transparent
        );
        background-size: 200% 100%;
        background-repeat: no-repeat;
        animation: gantt-skeleton-shimmer 1.6s ease-in-out infinite;
      }
      @keyframes gantt-skeleton-shimmer {
        from {
          background-position: 150% 0;
        }
        to {
          background-position: -50% 0;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .gantt-skeleton-name,
        .gantt-skeleton-bar {
          animation: none;
          background-image: none;
        }
      }

      /* Forced colours (D25): the box Canvas / CanvasText with a CanvasText border, the skeleton GrayText */
      @media (forced-colors: active) {
        .gantt-state-box {
          padding: 16px 24px;
          border: 1px solid CanvasText;
          border-radius: 6px;
          background-color: Canvas;
          color: CanvasText;
        }
        .gantt-skeleton-row {
          border-bottom-color: GrayText;
        }
        .gantt-skeleton-name,
        .gantt-skeleton-bar {
          background-color: GrayText;
        }
      }
    `,
  ],
})
export class GanttChartStateComponent {
  /** What to show (`layout.chartState`, never `'ready'` while attached) */
  readonly state = input.required<ChartState>();
  /**
   * Width of the task-list panel in px (GantryComponent's `panelPx`, core `resolvePanelWidth`): the
   * skeleton's name blocks sit in it and its bars start after it. 0 = none.
   */
  readonly panelWidth = input(0);
  /** Retry was pressed */
  readonly retry = output<RetryEvent>();

  protected readonly layout = inject(GanttLayoutService);
  protected readonly i18n = inject(GanttI18nService);

  /**
   * The loading skeleton's rows (core `skeletonRows`, as the Web Component's states region): the
   * viewport under the header, no name block in the chart view, no bar in the table view.
   */
  protected readonly skeleton = computed<SkeletonRow[]>(() => {
    if (this.state().kind !== 'loading') return [];
    const view = this.layout.view();
    return skeletonRows({
      viewportHeight: bodyHeight(this.layout.viewportHeight(), this.layout.headerHeight()),
      rowHeight: this.layout.rowHeight(),
      panelWidth: view === 'chart' ? 0 : this.panelWidth(),
      timelineWidth: view === 'table' ? 0 : this.layout.viewportWidth(),
    });
  });

  protected onRetry(source: NonNullable<ChartState['retry']>): void {
    this.retry.emit({ source: source === 'event' ? 'error' : 'dataSource' });
  }
}
