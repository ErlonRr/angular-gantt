// ─────────────────────────────────────────────────────────────
//  gantry · scroll/gantt-scroll.service.ts
//
//  Synchronises scroll between two panels — zero RxJS.
//
//  Architecture:
//    ┌──────────────┐           ┌─────────────────────────────┐
//    │  Task list   │  scroll Y │  SVG canvas wrapper          │
//    │  (left)      │◄─────────►│  (right, scrolls X + Y)     │
//    └──────────────┘           └─────────────────────────────┘
//
//  Technique: native `addEventListener('scroll', fn, {passive:true})`
//  with a `requestAnimationFrame` gate — one write per frame,
//  no debounce timeout, no Subject, no Observable.
//
//  The rAF gate prevents the "ping-pong" scroll feedback loop
//  (panel A sets scrollTop → fires scroll on A → would set B again).
//
//  Timeline header is inside the same scroll element as the chart (see GantryComponent).
// ─────────────────────────────────────────────────────────────

import {
  Injectable,
  signal,
  DestroyRef,
  inject,
  NgZone,
} from '@angular/core';

import { dateToPixel, snapToDay } from '../gantt-math';
import { GanttLayoutService } from '../layout/gantt-layout.service';

@Injectable()
export class GanttScrollService {

  // ── Public signals ────────────────────────────────────────
  /** Current horizontal scroll offset of the canvas (px) */
  readonly scrollLeft = signal<number>(0);

  /** Current vertical scroll offset shared by both panels (px) */
  readonly scrollTop  = signal<number>(0);

  // ── Private refs ──────────────────────────────────────────
  private _panel: HTMLElement | null  = null;
  private _canvas: HTMLElement | null = null;

  /** rAF id */
  private _rafId   = 0;

  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);
  private readonly layout = inject(GanttLayoutService);

  // ── Registration ──────────────────────────────────────────

  /**
   * Register the left panel element (vertical scroll only).
   * Call once from GantryComponent.ngAfterViewInit.
   */
  registerPanel(el: HTMLElement): void {
    this._panel = el;
    this._attachPanelListeners();
  }

  /**
   * Register the right canvas wrapper element (vertical + horizontal scroll).
   * Call once from GantryComponent.ngAfterViewInit.
   */
  registerCanvas(el: HTMLElement): void {
    this._canvas = el;
    this._attachCanvasListeners();
  }

  // ── Listener setup ────────────────────────────────────────

  private _attachPanelListeners(): void {
    const el = this._panel!;
    const handler = () => this._onPanelScroll();

    // Run outside Angular zone — no CD triggered by scroll events
    this.zone.runOutsideAngular(() => {
      el.addEventListener('scroll', handler, { passive: true });
    });

    this.destroyRef.onDestroy(() => {
      el.removeEventListener('scroll', handler);
      cancelAnimationFrame(this._rafId);
    });
  }

  private _attachCanvasListeners(): void {
    const el = this._canvas!;
    const handler = () => this._onCanvasScroll();

    this.zone.runOutsideAngular(() => {
      el.addEventListener('scroll', handler, { passive: true });
    });

    this.destroyRef.onDestroy(() => {
      el.removeEventListener('scroll', handler);
    });
  }

  // ── Scroll handlers ───────────────────────────────────────

  /** Right column scroll includes sticky timeline header above the bar SVG. */
  private _timelineHeaderOffset(): number {
    return this.layout.totalHeaderHeight();
  }

  private _scrollSource: 'panel' | 'canvas' | null = null;
  private _scrollTimeout: any;

  private _onPanelScroll(): void {
    if (this._scrollSource === 'canvas') return;
    this._scrollSource = 'panel';

    const top = this._panel!.scrollTop;

    this._rafId = requestAnimationFrame(() => {
      if (this._canvas && this._canvas.scrollTop !== top) {
        this._canvas.scrollTop = top;
      }
      this.zone.run(() => this.scrollTop.set(top));

      clearTimeout(this._scrollTimeout);
      this._scrollTimeout = setTimeout(() => {
        this._scrollSource = null;
      }, 60);
    });
  }

  private _onCanvasScroll(): void {
    if (this._scrollSource === 'panel') return;
    this._scrollSource = 'canvas';

    const el  = this._canvas!;
    const top  = el.scrollTop;
    const left = el.scrollLeft;

    this._rafId = requestAnimationFrame(() => {
      if (this._panel && this._panel.scrollTop !== top) {
        this._panel.scrollTop = top;
      }
      this.zone.run(() => {
        this.scrollTop.set(top);
        this.scrollLeft.set(left);
      });

      clearTimeout(this._scrollTimeout);
      this._scrollTimeout = setTimeout(() => {
        this._scrollSource = null;
      }, 60);
    });
  }

  // ── Programmatic scroll ───────────────────────────────────

  /** Scroll the timeline horizontally to `x` (clamped at 0). */
  scrollToX(x: number, behavior: ScrollBehavior = 'smooth'): void {
    if (!this._canvas) return;
    const b = motionSafe(behavior);
    this._canvas.scrollTo({ left: Math.max(0, x), behavior: b });
    // An instant scroll is applied synchronously: keep the offset current for anchoring
    if (b !== 'smooth') this.scrollLeft.set(this._canvas.scrollLeft);
  }

  /** Current viewport width of the timeline. */
  get viewportWidth(): number {
    return this._canvas?.clientWidth ?? 0;
  }

  /**
   * Scroll the canvas to put `date` in view.
   * @param date       Target date
   * @param origin     Timeline start date (from GanttLayoutService)
   * @param pxPerDay   Pixels per day (from GanttLayoutService)
   * @param behavior   'smooth' | 'instant' (default: 'smooth')
   */
  scrollToDate(
    date: Date,
    origin: Date,
    pxPerDay: number,
    behavior: ScrollBehavior = 'smooth',
  ): void {
    if (!this._canvas) return;
    const x = dateToPixel(date, origin, pxPerDay);
    const canvasWidth = this._canvas.clientWidth;
    // Centre the date in the viewport
    const target = Math.max(0, x - canvasWidth / 2);
    this._canvas.scrollTo({ left: target, behavior: motionSafe(behavior) });
  }

  /** Scroll to today */
  scrollToToday(
    origin: Date,
    pxPerDay: number,
    behavior: ScrollBehavior = 'smooth',
  ): void {
    this.scrollToDate(snapToDay(new Date()), origin, pxPerDay, behavior);
  }

  /**
   * Scroll to a specific row by its visible index.
   * @param rowIndex      visibleIndex of the target row
   * @param rowHeight     row height in px
   * @param behavior      scroll behavior
   */
  scrollToRow(
    rowIndex: number,
    rowHeight: number,
    behavior: ScrollBehavior = 'smooth',
  ): void {
    const y = rowIndex * rowHeight;
    const b = motionSafe(behavior);
    this._panel?.scrollTo({ top: y, behavior: b });
    this._canvas?.scrollTo({ top: y, behavior: b });
  }

  /** Scroll both panels back to top-left */
  scrollToOrigin(behavior: ScrollBehavior = 'instant'): void {
    this._panel?.scrollTo({ top: 0, behavior });
    this._canvas?.scrollTo({ top: 0, left: 0, behavior });
  }

  // ── Query ─────────────────────────────────────────────────

  /** Returns the currently visible row range [firstIdx, lastIdx] */
  visibleRowRange(rowHeight: number): [number, number] {
    if (!this._canvas) return [0, 0];
    const hh   = this._timelineHeaderOffset();
    const top  = Math.max(0, this._canvas.scrollTop - hh);
    const height = Math.max(rowHeight, this._canvas.clientHeight - hh);
    const first  = Math.floor(top / rowHeight);
    const last   = Math.ceil((top + height) / rowHeight);
    return [first, last];
  }
}

/** `smooth` becomes `instant` when the user prefers reduced motion. */
function motionSafe(behavior: ScrollBehavior): ScrollBehavior {
  return behavior === 'smooth' && typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : behavior;
}
