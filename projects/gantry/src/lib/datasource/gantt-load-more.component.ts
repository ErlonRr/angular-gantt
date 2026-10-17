// ─────────────────────────────────────────────────────────────
//  gantry · datasource/gantt-load-more.component.ts
//
//  Renders a "Load more" trigger at the bottom of the task list.
//  Uses IntersectionObserver to auto-trigger when visible
//  (infinite scroll mode), or shows a button (manual mode).
//
//  Placed inside the [tlFooter] slot of GanttTaskListComponent.
//  Colours and fonts are stylesheet rules on the chart's `--gantt-*` tokens.
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  ElementRef,
  type OnInit,
  type OnDestroy,
  inject,
  afterRenderEffect,
} from '@angular/core';

import { type GanttTheme } from '../types';
import { GanttI18nService } from '../services/gantt-i18n.service';

@Component({
  selector: 'gantt-load-more',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'gantt-tl-load-more',
    // Focus target when the focused Retry / Load more button is replaced (see constructor)
    tabindex: '-1',
    '(focusin)': 'hasFocus = true',
    '(focusout)': 'onFocusOut($event)',
    '[attr.aria-busy]': 'isLoading() || null',
    '[style.display]': '"block"',
    '[style.padding]': '"8px 12px"',
  },
  template: `
    @if (isLoading()) {
      <!-- Loading spinner -->
      <div class="gantt-load-status" [style.display]="'flex'" [style.align-items]="'center'" [style.gap]="'8px'">
        <div class="gantt-spinner"></div>
        <span>{{ labels().loading }}</span>
      </div>
    } @else if (error()) {
      <!-- Failed page: message + retry -->
      <div
        role="alert"
        class="gantt-load-error"
        [style.display]="'flex'"
        [style.align-items]="'center'"
        [style.justify-content]="'center'"
        [style.gap]="'8px'"
      >
        <span>{{ labels().loadError }}</span>
        <button type="button" class="gantt-load-more-btn" [style.padding]="'3px 10px'" (click)="retry.emit()">
          {{ labels().retry }}
        </button>
      </div>
    } @else if (hasMore()) {
      @if (autoLoad()) {
        <!-- Invisible sentinel — IntersectionObserver triggers load -->
        <div #sentinel style="height:1px;visibility:hidden"></div>
      } @else {
        <!-- Manual load button -->
        <button
          class="gantt-load-more-btn"
          [style.width]="'100%'"
          [style.padding]="'6px 12px'"
          (click)="loadMore.emit()"
        >
          ↓ {{ labels().loadMore }} ({{ loadedCount() }} / {{ totalCount() > 0 ? totalCount() : '?' }})
        </button>
      }
    } @else {
      <!-- All loaded -->
      <div class="gantt-load-done" [style.text-align]="'center'" [style.font-size]="'11px'" [style.padding]="'4px 0'">
        ✓ {{ labels().allLoaded(loadedCount()) }}
      </div>
    }
  `,
  styles: [
    `
      :host {
        border-top: 1px solid var(--gantt-border);
        background-color: var(--gantt-panel-bg);
      }
      .gantt-load-status,
      .gantt-load-done {
        color: var(--gantt-text-muted);
        font-family: var(--gantt-font);
      }
      .gantt-load-status,
      .gantt-load-error {
        font-size: var(--gantt-font-size);
      }
      .gantt-load-error {
        color: var(--gantt-text-sec);
        font-family: var(--gantt-font);
      }
      .gantt-load-more-btn {
        border: 1px solid var(--gantt-border);
        border-radius: 4px;
        background: transparent;
        color: var(--gantt-text-sec);
        font-size: var(--gantt-font-size);
        font-family: var(--gantt-font);
        cursor: pointer;
      }
      @keyframes gantt-spin {
        to {
          transform: rotate(360deg);
        }
      }
      .gantt-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid var(--gantt-border, #e2e8f0);
        border-top-color: var(--gantt-bar, #2563eb);
        border-radius: 50%;
        animation: gantt-spin 0.7s linear infinite;
        flex-shrink: 0;
      }
      .gantt-load-more-btn:hover {
        background: var(--gantt-row-bg-alt, #f8fafc) !important;
      }
    `,
  ],
})
export class GanttLoadMoreComponent implements OnInit, OnDestroy {
  /** @deprecated Ignored: the footer is painted with the chart's `--gantt-*` tokens. */
  readonly theme = input<GanttTheme | undefined>(undefined);
  readonly isLoading = input<boolean>(false);
  readonly hasMore = input<boolean>(false);
  /** The last page failed: show the error and a Retry button (no auto-load) */
  readonly error = input<boolean>(false);
  readonly loadedCount = input<number>(0);
  readonly totalCount = input<number>(0);
  /** Auto-trigger load when sentinel scrolls into view */
  readonly autoLoad = input<boolean>(true);

  readonly loadMore = output<void>();
  readonly retry = output<void>();

  protected readonly labels = inject(GanttI18nService).labels;
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private _observer?: IntersectionObserver;
  /** Focus is inside the footer (kept while its focused button is swapped out) */
  protected hasFocus = false;

  constructor() {
    // Retry / Load more turn into "Loading…" and back: keep keyboard focus in the footer
    afterRenderEffect(() => {
      this.isLoading();
      this.error();
      this.hasMore();
      const host = this.el.nativeElement;
      if (!this.hasFocus || host.contains(document.activeElement)) return;
      (host.querySelector('button') ?? host).focus({ preventScroll: true });
    });
  }

  protected onFocusOut(event: FocusEvent): void {
    // relatedTarget is null when the focused button was removed: keep tracking then
    const next = event.relatedTarget as Node | null;
    if (next && !this.el.nativeElement.contains(next)) this.hasFocus = false;
  }

  ngOnInit(): void {
    if (this.autoLoad()) {
      this._setupObserver();
    }
  }

  ngOnDestroy(): void {
    this._observer?.disconnect();
  }

  private _setupObserver(): void {
    this._observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          // Never before the first page: `initialPage: 0` waits for an explicit loadNext()
          if (entry.isIntersecting && this.hasMore() && !this.isLoading() && !this.error() && this.loadedCount() > 0) {
            this.loadMore.emit();
          }
        }
      },
      { threshold: 0.1 },
    );

    // Observe the host element itself
    this._observer.observe(this.el.nativeElement);
  }
}
