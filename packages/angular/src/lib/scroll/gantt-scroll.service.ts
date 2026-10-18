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
//  Technique: native `addEventListener('scroll', fn, {passive:true})`;
//  each scroll event mirrors the pane's vertical offset into the other
//  pane at once, as the Web Component's `interaction/scroll.ts` does,
//  through core `createScrollMirror`: the event that only echoes the
//  mirror's own write is not mirrored back, so keyboard moves at
//  key-repeat speed (each scrolls the timeline in its keydown) are never
//  undone by the previous move's echo. Scroll events are dispatched once
//  per frame per pane, so this writes at most once per frame.
//
//  Browser only: GantryComponent registers the panes after the first
//  render (`afterNextRender`), so nothing here runs on the server. The
//  window comes from `DOCUMENT` (no globals); the listeners are released
//  with the chart.
//
//  Timeline header is inside the same scroll element as the chart (see GantryComponent).
//
//  Auto-scroll while a bar is dragged near the viewport's left or right
//  edge (D13 of Gantry 2 phase 9, the Web Component's
//  `interaction/autoscroll.ts`): one core `autoScrollDelta` step per
//  animation frame (up to `AUTO_SCROLL_MAX_STEP` px within
//  `AUTO_SCROLL_EDGE` px of an edge, and beyond it). The viewport's box is
//  measured once, when the drag starts; the loop runs only while the
//  pointer is in an edge zone and the viewport can still scroll that way.
// ─────────────────────────────────────────────────────────────

import { Injectable, signal, DestroyRef, inject, DOCUMENT } from '@angular/core';
import { autoScrollDelta, createScrollMirror, type ScrollPane } from '@gantryjs/core';

/** Auto-scroll of one drag (`GanttScrollService.autoScroll`) */
export interface AutoScroll {
  /** The pointer is at `clientX`: starts the loop when it is in an edge zone. */
  update(clientX: number): void;
  /** Stops the loop (the drag ended). */
  stop(): void;
}

export interface AutoScrollOptions {
  /** The largest `scrollLeft` (the model's scroll range: `totalWidth − viewport width`) */
  readonly maxLeft: () => number;
  /** Called after each step: the drag recomputes its preview (content coordinates) */
  readonly onScroll: () => void;
}

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

  /** Vertical mirroring of the two panes (core: ignores the echo of its own writes) */
  private readonly _mirror = createScrollMirror();

  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  // ── Registration ──────────────────────────────────────────

  /**
   * Register the left panel element (vertical scroll only).
   * Called once by GantryComponent after the first render (browser only).
   */
  registerPanel(el: HTMLElement): void {
    this._panel = el;
    this._listen(el, 'panel');
  }

  /**
   * Register the right canvas wrapper element (vertical + horizontal scroll).
   * Called once by GantryComponent after the first render (browser only).
   */
  registerCanvas(el: HTMLElement): void {
    this._canvas = el;
    this._listen(el, 'timeline');
  }

  // ── Scroll mirroring ──────────────────────────────────────

  /** A passive `scroll` listener, removed when the chart is destroyed */
  private _listen(el: HTMLElement, pane: ScrollPane): void {
    const handler = (): void => this._onScroll(pane);
    el.addEventListener('scroll', handler, { passive: true });
    this.destroyRef.onDestroy(() => el.removeEventListener('scroll', handler));
  }

  private _pane(pane: ScrollPane): HTMLElement | null {
    return pane === 'timeline' ? this._canvas : this._panel;
  }

  /** `pane` scrolled: mirror its vertical offset into the other pane, then publish the timeline's offsets */
  private _onScroll(pane: ScrollPane): void {
    this._mirror.scrolled(
      pane,
      p => this._pane(p)?.scrollTop ?? 0,
      (p, top) => {
        const el = this._pane(p);
        if (el) el.scrollTop = top;
      },
    );
    const canvas = this._canvas;
    if (!canvas) return;
    this.scrollTop.set(canvas.scrollTop);
    this.scrollLeft.set(canvas.scrollLeft);
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

  /**
   * Starts auto-scrolling the timeline for a drag (an event handler: measures the viewport's box
   * now); its owner stops it when the drag ends or is cancelled (the canvas cancels a press when
   * the chart is destroyed). Without a registered viewport or animation frames it does nothing.
   */
  autoScroll(opts: AutoScrollOptions): AutoScroll {
    const scroller = this._canvas;
    const win = this.doc.defaultView;
    if (!scroller || typeof win?.requestAnimationFrame !== 'function') {
      return { update: () => undefined, stop: () => undefined };
    }
    const box = scroller.getBoundingClientRect();
    const start = box.left + scroller.clientLeft;
    const end = start + scroller.clientWidth;
    let x = Number.NaN;
    let frame: number | null = null;

    const tick = (): void => {
      frame = null;
      const delta = autoScrollDelta(x, start, end);
      if (delta === 0) return;
      const left = scroller.scrollLeft;
      const max = Math.max(0, opts.maxLeft());
      const next = Math.max(0, Math.min(max, left + delta));
      // At the end of the range: wait for the pointer to move back
      if (next === left) return;
      // An instant jump: the windowed header and grid follow at once (no layout read)
      scroller.scrollTo({ left: next, behavior: 'instant' });
      this.scrollLeft.set(next);
      opts.onScroll();
      frame = win.requestAnimationFrame(tick);
    };
    const stop = (): void => {
      if (frame !== null) win.cancelAnimationFrame(frame);
      frame = null;
    };
    return {
      update(clientX) {
        x = clientX;
        if (frame === null && autoScrollDelta(x, start, end) !== 0) frame = win.requestAnimationFrame(tick);
      },
      stop,
    };
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
