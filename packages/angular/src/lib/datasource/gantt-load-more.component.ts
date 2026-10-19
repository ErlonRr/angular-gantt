// ─────────────────────────────────────────────────────────────
//  gantry · datasource/gantt-load-more.component.ts
//
//  Renders a "Load more" button at the bottom of the task list, as the
//  Web Component does; with `autoLoad` an IntersectionObserver also loads
//  the next page when the footer scrolls into view (infinite scroll).
//  The observer is browser only: created after the first render
//  (never on the server) and disconnected with the component.
//
//  Placed by GantryComponent in the panel, below the task list (before the
//  consumer's [tlFooter] content). The same DOM and look as the Web
//  Component's footer (packages/vanilla/src/layers/tasklist.ts,
//  styles/tasklist.css.ts):
//
//    gantt-load-more.gantt-tl-load-more      a top border, 8 / 12 px padding, the panel background
//      button.gantt-load-more-btn            "Load more", "Loading…" (aria-disabled): full width,
//                                            the toolbar's control size tall (`--gantry-control-size`)
//      | div.gantt-load-error > span + button.gantt-load-more-btn   a failed page: message and Retry
//      | div.gantt-load-done                 everything loaded
//
//  While a page loads the button stays (it reads "Loading…" and does
//  nothing), so keyboard focus stays on it.
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
    @if (isLoading() || (!error() && hasMore())) {
      <!-- Load more: always a button (keyboard and switch users), and with autoLoad the footer
           also loads the next page when it scrolls into view (the IntersectionObserver). While the
           page loads it stays, reads "Loading…" and does nothing (focus stays on it). -->
      <button
        type="button"
        class="gantt-load-more-btn"
        [attr.aria-disabled]="isLoading() || null"
        (click)="onLoadMore()"
      >
        {{ isLoading() ? labels().loading : labels().loadMore }}
      </button>
    } @else if (error()) {
      <!-- Failed page: message + retry (announced by the chart's .gantt-sr-alert) -->
      <div class="gantt-load-error">
        <span>{{ labels().loadError }}</span>
        <button type="button" class="gantt-load-more-btn" (click)="retry.emit()">
          {{ labels().retry }}
        </button>
      </div>
    } @else {
      <!-- All loaded -->
      <div class="gantt-load-done">{{ labels().allLoaded(loadedCount()) }}</div>
    }
  `,
  styles: [
    `
      /* The Web Component's footer (styles/tasklist.css.ts): the same box, button, error row and done text */
      :host {
        display: block;
        padding: 8px 12px;
        border-top: 1px solid var(--gantt-border);
        background-color: var(--gantt-panel-bg);
        font-family: var(--gantt-font);
        font-size: var(--gantt-font-size);
        color: var(--gantt-text-sec);
      }
      .gantt-load-error {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      .gantt-load-done {
        padding: 4px 0;
        text-align: center;
        font-size: 11px;
        color: var(--gantt-text-muted);
      }
      .gantt-load-more-btn {
        box-sizing: border-box;
        min-height: var(--gantry-control-size, 32px);
        margin: 0;
        padding: 0 12px;
        border: 1px solid var(--gantt-border);
        border-radius: 4px;
        background-color: transparent;
        color: var(--gantt-text-sec);
        font-family: var(--gantt-font);
        font-size: var(--gantt-font-size);
        cursor: pointer;
      }
      :host > .gantt-load-more-btn {
        display: block;
        width: 100%;
      }
      .gantt-load-more-btn:hover {
        background-color: var(--gantt-row-bg-alt);
      }
      .gantt-load-more-btn[aria-disabled='true'] {
        cursor: default;
        background-color: transparent;
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
      /* Forced colours (D25): the loading button GrayText, as the Web Component's */
      @media (forced-colors: active) {
        .gantt-load-more-btn[aria-disabled='true'] {
          color: GrayText;
          border-color: GrayText;
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
  /** Also load the next page when the footer scrolls into view (the button stays) */
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

  /** Load more (nothing while the page loads: the button reads "Loading…") */
  protected onLoadMore(): void {
    if (!this.isLoading()) this.loadMore.emit();
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
