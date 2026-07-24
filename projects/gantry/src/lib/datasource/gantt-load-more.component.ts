// ─────────────────────────────────────────────────────────────
//  gantry · datasource/gantt-load-more.component.ts
//
//  Renders a "Load more" trigger at the bottom of the task list.
//  Uses IntersectionObserver to auto-trigger when visible
//  (infinite scroll mode), or shows a button (manual mode).
//
//  Placed inside the [tlFooter] slot of GanttTaskListComponent.
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  computed,
  ElementRef,
  OnInit,
  OnDestroy,
  inject,
} from '@angular/core';

import { GanttTheme } from '../types';

@Component({
  selector:   'gantt-load-more',
  standalone:  true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.display]':         '"block"',
    '[style.padding]':         '"8px 12px"',
    '[style.border-top]':      '"1px solid " + theme().borderColor',
    '[style.background-color]': 'theme().panelBg',
  },
  template: `
    @if (isLoading()) {
      <!-- Loading spinner -->
      <div [style.display]="'flex'" [style.align-items]="'center'" [style.gap]="'8px'"
           [style.color]="theme().textMuted" [style.font-size]="theme().fontSize"
           [style.font-family]="theme().fontFamily">
        <div class="gantt-spinner"></div>
        <span>Loading…</span>
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
          [style.border]="'1px solid ' + theme().borderColor"
          [style.border-radius]="'4px'"
          [style.background]="'transparent'"
          [style.color]="theme().textSecondary"
          [style.font-size]="theme().fontSize"
          [style.font-family]="theme().fontFamily"
          [style.cursor]="'pointer'"
          (click)="loadMore.emit()"
        >
          ↓ Load more ({{ loadedCount() }} / {{ totalCount() > 0 ? totalCount() : '?' }})
        </button>
      }
    } @else {
      <!-- All loaded -->
      <div [style.text-align]="'center'" [style.color]="theme().textMuted"
           [style.font-size]="'11px'" [style.padding]="'4px 0'"
           [style.font-family]="theme().fontFamily">
        ✓ All {{ loadedCount() }} tasks loaded
      </div>
    }
  `,
  styles: [`
    @keyframes gantt-spin {
      to { transform: rotate(360deg); }
    }
    .gantt-spinner {
      width: 14px; height: 14px;
      border: 2px solid var(--gantt-border, #E2E8F0);
      border-top-color: var(--gantt-bar, #3B82F6);
      border-radius: 50%;
      animation: gantt-spin 0.7s linear infinite;
      flex-shrink: 0;
    }
    .gantt-load-more-btn:hover {
      background: var(--gantt-row-bg-alt, #F8FAFC) !important;
    }
  `],
})
export class GanttLoadMoreComponent implements OnInit, OnDestroy {

  readonly theme       = input.required<GanttTheme>();
  readonly isLoading   = input<boolean>(false);
  readonly hasMore     = input<boolean>(false);
  readonly loadedCount = input<number>(0);
  readonly totalCount  = input<number>(0);
  /** Auto-trigger load when sentinel scrolls into view */
  readonly autoLoad    = input<boolean>(true);

  readonly loadMore = output<void>();

  private readonly el = inject(ElementRef<HTMLElement>);
  private _observer?: IntersectionObserver;

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
          if (entry.isIntersecting && this.hasMore() && !this.isLoading()) {
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
