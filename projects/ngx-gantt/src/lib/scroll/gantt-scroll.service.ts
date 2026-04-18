// ─────────────────────────────────────────────────────────────
//  ngx-gantt · scroll/gantt-scroll.service.ts
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
//  scrollLeft signal is used by GanttHeaderComponent to translate
//  its sticky SVG as the canvas scrolls horizontally.
// ─────────────────────────────────────────────────────────────

import {
  Injectable,
  signal,
  DestroyRef,
  inject,
  NgZone,
} from '@angular/core';

import { dateToPixel, snapToDay } from '../gantt-math';

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

  /** rAF gate — prevents ping-pong sync loop */
  private _syncing = false;
  private _rafId   = 0;

  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);

  // ── Registration ──────────────────────────────────────────

  /**
   * Register the left panel element (vertical scroll only).
   * Call once from NgxGanttComponent.ngAfterViewInit.
   */
  registerPanel(el: HTMLElement): void {
    this._panel = el;
    this._attachPanelListeners();
  }

  /**
   * Register the right canvas wrapper element (vertical + horizontal scroll).
   * Call once from NgxGanttComponent.ngAfterViewInit.
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

  private _onPanelScroll(): void {
    if (this._syncing) return;
    const top = this._panel!.scrollTop;

    this._rafId = requestAnimationFrame(() => {
      this._syncing = true;
      if (this._canvas) this._canvas.scrollTop = top;
      // Update signal inside zone so components re-render
      this.zone.run(() => this.scrollTop.set(top));
      // Release gate on next microtask
      Promise.resolve().then(() => { this._syncing = false; });
    });
  }

  private _onCanvasScroll(): void {
    if (this._syncing) return;
    const el  = this._canvas!;
    const top  = el.scrollTop;
    const left = el.scrollLeft;

    this._rafId = requestAnimationFrame(() => {
      this._syncing = true;
      if (this._panel) this._panel.scrollTop = top;
      this.zone.run(() => {
        this.scrollTop.set(top);
        this.scrollLeft.set(left);
      });
      Promise.resolve().then(() => { this._syncing = false; });
    });
  }

  // ── Programmatic scroll ───────────────────────────────────

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
    this._canvas.scrollTo({ left: target, behavior });
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
    if (!this._canvas) return;
    const y = rowIndex * rowHeight;
    this._canvas.scrollTo({ top: y, behavior });
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
    const top    = this._canvas.scrollTop;
    const height = this._canvas.clientHeight;
    const first  = Math.floor(top / rowHeight);
    const last   = Math.ceil((top + height) / rowHeight);
    return [first, last];
  }
}
