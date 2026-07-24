// ─────────────────────────────────────────────────────────────
//  gantry · virtual-scroll/gantt-virtual-scroll.directive.ts
//
//  Lightweight virtual scroll — ~120 lines, zero CDK.
//
//  Strategy: IntersectionObserver on two sentinel elements
//  (top and bottom) to detect when the user is near an edge,
//  combined with a scroll listener for precise window math.
//
//  The directive slices `items` to `visibleItems` and emits
//  `paddingTop` / `paddingBottom` spacer heights so the
//  scrollbar reflects the full list height.
//
//  Host element must have:
//    overflow-y: auto | scroll
//    height: (any fixed or flex height)
//
//  Usage:
//    <div
//      [ganttVirtualScroll]="allRows"
//      [vsItemHeight]="rowHeight"
//      [vsOverscan]="4"
//      (vsVisibleItems)="visibleRows = $event"
//      (vsPaddingTop)="paddingTop = $event"
//      (vsPaddingBottom)="paddingBottom = $event"
//    ></div>
// ─────────────────────────────────────────────────────────────

import {
  Directive,
  input,
  output,
  signal,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  runInInjectionContext,
  OnInit,
  OnDestroy,
  NgZone,
} from '@angular/core';

import { computeVirtualWindow } from './virtual-window';

@Directive({
  selector:  '[ganttVirtualScroll]',
  standalone: true,
  exportAs:  'ganttVirtualScroll',
})
export class GanttVirtualScrollDirective<T> implements OnInit, OnDestroy {

  // ── Inputs ────────────────────────────────────────────────
  /** Full item array */
  readonly ganttVirtualScroll = input.required<T[]>();
  /** Fixed height of each item in px */
  readonly vsItemHeight       = input<number>(36);
  /** Extra items to render above and below the visible window */
  readonly vsOverscan         = input<number>(4);
  /** Enable/disable virtualisation (useful for small lists) */
  readonly vsEnabled          = input<boolean>(true);

  // ── Outputs ───────────────────────────────────────────────
  readonly vsVisibleItems   = output<T[]>();
  readonly vsPaddingTop     = output<number>();
  readonly vsPaddingBottom  = output<number>();
  /** Emits [firstIndex, lastIndex] of the visible window */
  readonly vsRangeChange    = output<[number, number]>();

  // ── Internal state ────────────────────────────────────────
  private readonly _scrollTop  = signal<number>(0);
  private readonly _hostHeight = signal<number>(0);

  private readonly el      = inject(ElementRef<HTMLElement>);
  private readonly zone    = inject(NgZone);
  private readonly injector = inject(Injector);

  private _scrollHandler!: () => void;
  private _resizeObserver!: ResizeObserver;
  private _rafId = 0;

  // ── Computed window (shared math with GantryComponent) ──

  private readonly _window = computed(() =>
    computeVirtualWindow(
      this._scrollTop(),
      this.vsItemHeight(),
      this._hostHeight(),
      this.ganttVirtualScroll().length,
      this.vsOverscan(),
    )
  );

  private readonly _firstVisible = computed(() => this._window().first);
  private readonly _lastVisible  = computed(() => this._window().last);

  // ── Lifecycle ─────────────────────────────────────────────

  ngOnInit(): void {
    const host = this.el.nativeElement;

    // Measure initial host height
    this._hostHeight.set(host.clientHeight);

    // Scroll listener — runs outside zone
    this._scrollHandler = () => {
      cancelAnimationFrame(this._rafId);
      this._rafId = requestAnimationFrame(() => {
        this.zone.run(() => this._scrollTop.set(host.scrollTop));
      });
    };

    this.zone.runOutsideAngular(() => {
      host.addEventListener('scroll', this._scrollHandler, { passive: true });
    });

    // ResizeObserver tracks host height changes
    this._resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        this.zone.run(() => this._hostHeight.set(h));
      }
    });
    this._resizeObserver.observe(host);

    // Main effect — emit window changes to the consumer (ngOnInit is not an injection context)
    runInInjectionContext(this.injector, () => {
      effect(() => {
        const items   = this.ganttVirtualScroll();
        const enabled = this.vsEnabled();

        if (!enabled || items.length === 0) {
          this.vsVisibleItems.emit(items);
          this.vsPaddingTop.emit(0);
          this.vsPaddingBottom.emit(0);
          this.vsRangeChange.emit([0, items.length - 1]);
          return;
        }

        const { first, last, paddingTop, paddingBottom } = this._window();

        this.vsVisibleItems.emit(items.slice(first, last + 1));
        this.vsPaddingTop.emit(paddingTop);
        this.vsPaddingBottom.emit(paddingBottom);
        this.vsRangeChange.emit([first, last]);
      });
    });
  }

  ngOnDestroy(): void {
    this.el.nativeElement.removeEventListener('scroll', this._scrollHandler);
    this._resizeObserver?.disconnect();
    cancelAnimationFrame(this._rafId);
  }

  // ── Public API ────────────────────────────────────────────

  /** Scroll to a specific item index */
  scrollToIndex(index: number, behavior: ScrollBehavior = 'smooth'): void {
    const y = index * this.vsItemHeight();
    this.el.nativeElement.scrollTo({ top: y, behavior });
  }

  /** Current visible range snapshot */
  getVisibleRange(): [number, number] {
    return [this._firstVisible(), this._lastVisible()];
  }

  /** Force recalculation (e.g. after external height change) */
  refresh(): void {
    this._hostHeight.set(this.el.nativeElement.clientHeight);
    this._scrollTop.set(this.el.nativeElement.scrollTop);
  }
}
