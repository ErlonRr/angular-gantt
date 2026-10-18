// ─────────────────────────────────────────────────────────────
//  gantry · datasource/gantt-load-more.component.ts
//
//  Renders a "Load more" trigger at the bottom of the task list.
//  Uses IntersectionObserver to auto-trigger when visible
//  (infinite scroll mode), or shows a button (manual mode).
//  The observer is browser only: created after the first render
//  (never on the server) and disconnected with the component.
//
//  Placed by GantryComponent in the panel, below the task list (before the
//  consumer's [tlFooter] content).
//  Colours and fonts are stylesheet rules on the chart's `--gantt-*` tokens.
//  It holds no live region: the chart announces the load state in its
//  `.gantt-sr-live` and a failed page in its `.gantt-sr-alert`.
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  ElementRef,
  DestroyRef,
  DOCUMENT,
  inject,
  afterNextRender,
  afterRenderEffect,
} from '@angular/core';

import { GanttI18nService } from '../services/gantt-i18n.service';

@Component({
  selector: 'gantt-load-more',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'gantt-tl-load-more',
    // Focus target when the focused Retry / Load more button is replaced (see constructor)
    tabindex: '-1',
    '(focusin)': 'hasFocus = true',
    '(focusout)': 'onFocusOut($event)',
    '[attr.aria-busy]': 'isLoading() || null',
  },
  template: `
    @if (isLoading()) {
      <!-- Loading spinner -->
      <div class="gantt-load-status">
        <div class="gantt-spinner"></div>
        <span>{{ labels().loading }}</span>
      </div>
    } @else if (error()) {
      <!-- Failed page: message + retry (announced by the chart's .gantt-sr-alert) -->
      <div class="gantt-load-error">
        <span>{{ labels().loadError }}</span>
        <button type="button" class="gantt-load-more-btn" (click)="retry.emit()">
          {{ labels().retry }}
        </button>
      </div>
    } @else if (hasMore()) {
      @if (autoLoad()) {
        <!-- Invisible sentinel — IntersectionObserver triggers load -->
        <div #sentinel class="gantt-load-sentinel"></div>
      } @else {
        <!-- Manual load button -->
        <button class="gantt-load-more-btn" (click)="loadMore.emit()">
          ↓ {{ labels().loadMore }} ({{ loadedCount() }} / {{ totalCount() > 0 ? totalCount() : '?' }})
        </button>
      }
    } @else {
      <!-- All loaded -->
      <div class="gantt-load-done">✓ {{ labels().allLoaded(loadedCount()) }}</div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        padding: 8px 12px;
        border-top: 1px solid var(--gantt-border);
        background-color: var(--gantt-panel-bg);
      }
      .gantt-load-status,
      .gantt-load-error {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .gantt-load-error {
        justify-content: center;
      }
      .gantt-load-done {
        text-align: center;
        font-size: 11px;
        padding: 4px 0;
      }
      .gantt-load-sentinel {
        height: 1px;
        visibility: hidden;
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
      /* Manual "Load more" (full width) and the error row's Retry */
      :host > .gantt-load-more-btn {
        width: 100%;
        padding: 6px 12px;
      }
      .gantt-load-error > .gantt-load-more-btn {
        padding: 3px 10px;
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
      /* Keyboard focus only: an inset ring on the footer (the panel clips), an outer one on its buttons */
      :host(:focus-visible) {
        outline: 2px solid var(--gantt-focus-ring);
        outline-offset: -2px;
      }
      .gantt-load-more-btn:focus-visible {
        outline: 2px solid var(--gantt-focus-ring);
        outline-offset: 1px;
      }
      /* Forced colours (D25): the spinner's track GrayText, its arc Highlight */
      @media (forced-colors: active) {
        .gantt-spinner {
          border-color: GrayText;
          border-top-color: Highlight;
        }
      }
    `,
  ],
})
export class GanttLoadMoreComponent {
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
  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  /** Focus is inside the footer (kept while its focused button is swapped out) */
  protected hasFocus = false;

  constructor() {
    // Retry / Load more turn into "Loading…" and back: keep keyboard focus in the footer
    afterRenderEffect(() => {
      this.isLoading();
      this.error();
      this.hasMore();
      const host = this.el.nativeElement;
      if (!this.hasFocus || host.contains(this.doc.activeElement)) return;
      (host.querySelector('button') ?? host).focus({ preventScroll: true });
    });
    // Infinite scroll: observe the footer once it is in the page (browser only)
    afterNextRender(() => {
      if (this.autoLoad()) this.observe();
    });
  }

  protected onFocusOut(event: FocusEvent): void {
    // relatedTarget is null when the focused button was removed: keep tracking then
    const next = event.relatedTarget as Node | null;
    if (next && !this.el.nativeElement.contains(next)) this.hasFocus = false;
  }

  private observe(): void {
    const win = this.doc.defaultView;
    if (typeof win?.IntersectionObserver !== 'function') return;
    const observer = new win.IntersectionObserver(
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
    observer.observe(this.el.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}
