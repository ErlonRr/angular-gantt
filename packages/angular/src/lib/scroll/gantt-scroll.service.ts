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
//  Browser only: GantryComponent registers the panes after the first
//  render (`afterNextRender`), so nothing here runs on the server. The
//  window comes from `DOCUMENT` (no globals); listeners, the pending
//  frame and the settle timeout are released with the chart.
//
//  Timeline header is inside the same scroll element as the chart (see GantryComponent).
// ─────────────────────────────────────────────────────────────

import { Injectable, signal, DestroyRef, inject, DOCUMENT } from '@angular/core';

@Injectable()
export class GanttScrollService {
  // ── Public signals ────────────────────────────────────────
  /** Current horizontal scroll offset of the canvas (px) */
  readonly scrollLeft = signal<number>(0);

  /** Current vertical scroll offset shared by both panels (px) */
  readonly scrollTop = signal<number>(0);

  // ── Private refs ──────────────────────────────────────────
  private _panel: HTMLElement | null = null;
  private _canvas: HTMLElement | null = null;

  /** Pending frame (one per scroll burst) */
  private _rafId: number | undefined;

  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.destroyRef.onDestroy(() => {
      this._cancelFrame();
      clearTimeout(this._scrollTimeout);
    });
  }

  // ── Registration ──────────────────────────────────────────

  /**
   * Register the left panel element (vertical scroll only).
   * Called once by GantryComponent after the first render (browser only).
   */
  registerPanel(el: HTMLElement): void {
    this._panel = el;
    this._listen(el, () => this._onPanelScroll());
  }

  /**
   * Register the right canvas wrapper element (vertical + horizontal scroll).
   * Called once by GantryComponent after the first render (browser only).
   */
  registerCanvas(el: HTMLElement): void {
    this._canvas = el;
    this._listen(el, () => this._onCanvasScroll());
  }

  // ── Listener setup ────────────────────────────────────────

  /** A passive `scroll` listener, removed when the chart is destroyed */
  private _listen(el: HTMLElement, handler: () => void): void {
    el.addEventListener('scroll', handler, { passive: true });
    this.destroyRef.onDestroy(() => el.removeEventListener('scroll', handler));
  }

  /** Runs `write` on the next frame, replacing a frame still pending (no rAF: right away) */
  private _frame(write: () => void): void {
    this._cancelFrame();
    const win = this.doc.defaultView;
    if (typeof win?.requestAnimationFrame !== 'function') {
      write();
      return;
    }
    this._rafId = win.requestAnimationFrame(() => {
      this._rafId = undefined;
      write();
    });
  }

  private _cancelFrame(): void {
    if (this._rafId !== undefined) this.doc.defaultView?.cancelAnimationFrame(this._rafId);
    this._rafId = undefined;
  }

  // ── Scroll handlers ───────────────────────────────────────

  private _scrollSource: 'panel' | 'canvas' | null = null;
  private _scrollTimeout?: ReturnType<typeof setTimeout>;

  private _onPanelScroll(): void {
    if (this._scrollSource === 'canvas') return;
    this._scrollSource = 'panel';

    const top = this._panel!.scrollTop;

    this._frame(() => {
      if (this._canvas && this._canvas.scrollTop !== top) {
        this._canvas.scrollTop = top;
      }
      this.scrollTop.set(top);
      this._settle();
    });
  }

  private _onCanvasScroll(): void {
    if (this._scrollSource === 'panel') return;
    this._scrollSource = 'canvas';

    const el = this._canvas!;
    const top = el.scrollTop;
    const left = el.scrollLeft;

    this._frame(() => {
      if (this._panel && this._panel.scrollTop !== top) {
        this._panel.scrollTop = top;
      }
      this.scrollTop.set(top);
      this.scrollLeft.set(left);
      this._settle();
    });
  }

  /** The mirrored write's own scroll event is ignored until the source settles */
  private _settle(): void {
    clearTimeout(this._scrollTimeout);
    this._scrollTimeout = setTimeout(() => {
      this._scrollSource = null;
    }, 60);
  }

  // ── Programmatic scroll ───────────────────────────────────

  /** Scroll the timeline horizontally to `x` (clamped at 0). */
  scrollToX(x: number, behavior: ScrollBehavior = 'smooth'): void {
    if (!this._canvas) return;
    const b = this._motionSafe(behavior);
    this._canvas.scrollTo({ left: Math.max(0, x), behavior: b });
    // An instant scroll is applied synchronously: keep the offset current for anchoring
    if (b !== 'smooth') this.scrollLeft.set(this._canvas.scrollLeft);
  }

  /** Current viewport width of the timeline. */
  get viewportWidth(): number {
    return this._canvas?.clientWidth ?? 0;
  }

  /**
   * Scroll to a specific row by its visible index.
   * @param rowIndex      visibleIndex of the target row
   * @param rowHeight     row height in px
   * @param behavior      scroll behavior
   */
  scrollToRow(rowIndex: number, rowHeight: number, behavior: ScrollBehavior = 'smooth'): void {
    const y = rowIndex * rowHeight;
    const b = this._motionSafe(behavior);
    this._panel?.scrollTo({ top: y, behavior: b });
    this._canvas?.scrollTo({ top: y, behavior: b });
  }

  /** `smooth` becomes `instant` when the user prefers reduced motion. */
  private _motionSafe(behavior: ScrollBehavior): ScrollBehavior {
    const win = this.doc.defaultView;
    return behavior === 'smooth' &&
      typeof win?.matchMedia === 'function' &&
      win.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'instant'
      : behavior;
  }
}
