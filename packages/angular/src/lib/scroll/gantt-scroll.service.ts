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
//
//  Inside a sync group (`sync/gantt-sync.ts`) the timeline's horizontal
//  scroll events are the member's scroll reports: every horizontal move
//  the viewport makes — the user's, and the chart's own jumps (initial
//  scroll, zoom anchoring, `scrollToDate`, fit) — reaches the group from
//  here, except the echo of a scroll the group caused (`group`: one echo
//  guard per viewport), as the Web Component's `viewportSync`.
// ─────────────────────────────────────────────────────────────

import { Injectable, signal, DestroyRef, inject, DOCUMENT, untracked } from '@angular/core';
import { autoScrollDelta, createEchoGuard, createScrollMirror, type EchoGuard, type ScrollPane } from '@gantryjs/core';

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

/**
 * The timeline viewport's side of the sync group (`GanttScrollService.group`, the Web Component's
 * `ViewportSync`): the sync member (`sync/gantt-sync.ts`) queues the group's scrolls and plugs in
 * the reporter while the chart is in a group, the chart's scroll sync applies the queued scroll
 * after the render (`GantryComponent`), and the scroll handler reports the moves.
 *
 * A move is not reported when it is the echo of a scroll the chart made for the group (`guard`: a
 * group scroll applied, the zoom anchoring after a level the group applied, a start correction at
 * the chart's scroll limit), nor while a group scroll waits for the render — the group's newer
 * position replaces it, so two charts whose own scrolls cross (both apply `initialScroll`, or both
 * correct a new start, in the same frame) end up together instead of swapped: the first report the
 * group hears wins.
 */
export interface ViewportSync {
  /** The viewport's echo guard (core `createEchoGuard`) */
  readonly guard: EchoGuard;
  /** Sends a horizontal offset to the group (set by the sync member while joined; `null` outside a group) */
  report: ((x: number) => void) | null;
  /**
   * The group's scroll waiting for the render, or `null`. A tracked read: the chart's scroll sync
   * runs again when the group sends a scroll.
   */
  waiting(): number | null;
  /** Queues the group's scroll for the next render (`null` drops a waiting one: the chart left) */
  queue(x: number | null): void;
  /** The waiting scroll was applied, or a local scroll replaced it */
  consume(): void;
  /**
   * The group applied a zoom level (`sync/gantt-sync.ts`): the zoom anchoring of the next rendered
   * timeline is the group's correction, not the chart's own move. Read and cleared by the chart's
   * scroll sync on every run.
   */
  groupLevel: boolean;
  /** The viewport moved horizontally to `x` (the scroll handler): reported unless it's an echo */
  moved(x: number): void;
}

function createViewportSync(): ViewportSync {
  /** A fresh object per group scroll: equal offsets sent twice are two scrolls */
  const request = signal<{ x: number } | null>(null);
  /** The request applied last (compared by identity) */
  let applied: { x: number } | null = null;
  const waitingNow = (): boolean => {
    const r = untracked(request);
    return r !== null && r !== applied;
  };
  const link: ViewportSync = {
    guard: createEchoGuard(),
    report: null,
    waiting() {
      const r = request();
      return r !== null && r !== applied ? r.x : null;
    },
    queue(x) {
      request.set(x === null ? null : { x });
    },
    consume() {
      applied = untracked(request);
    },
    groupLevel: false,
    moved(x) {
      // The guard is consumed by every move, so an expectation never outlives the next move
      const echo = link.guard.isEcho(x);
      if (!echo && !waitingNow()) link.report?.(x);
    },
  };
  return link;
}

@Injectable()
export class GanttScrollService {
  // ── Public signals ────────────────────────────────────────
  /** Current horizontal scroll offset of the canvas (px) */
  readonly scrollLeft = signal<number>(0);

  /** Current vertical scroll offset shared by both panels (px) */
  readonly scrollTop = signal<number>(0);

  /** The viewport's side of the sync group: echo guard, queued group scroll, scroll reports */
  readonly group: ViewportSync = createViewportSync();

  // ── Private refs ──────────────────────────────────────────
  private _panel: HTMLElement | null = null;
  private _canvas: HTMLElement | null = null;

  /** Vertical mirroring of the two panes (core: ignores the echo of its own writes) */
  private readonly _mirror = createScrollMirror();
  /**
   * The timeline's horizontal offset at its last scroll event. Not `scrollLeft()`: an instant jump
   * writes that before its scroll event comes, and the jump has to be reported too.
   */
  private _left = 0;

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
    this._left = el.scrollLeft;
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
    // A vertical scroll (or the panel's) leaves the horizontal offset alone: nothing to report
    if (pane === 'timeline' && canvas.scrollLeft !== this._left) {
      this._left = canvas.scrollLeft;
      this.group.moved(this._left);
    }
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
   * An instant jump to `x` whose scroll event is the sync group's echo, not the chart's move: the
   * guard expects the offset read back from the viewport (the browser clamps it to this chart's
   * scroll range, so a chart that cannot scroll as far does not push the others back). Reads
   * `scrollLeft` before and after: once per group scroll or quiet correction, never on a scroll.
   */
  echoJump(x: number): void {
    const canvas = this._canvas;
    if (!canvas) return;
    const from = canvas.scrollLeft;
    this.scrollToX(x, 'instant');
    this.group.guard.expect(canvas.scrollLeft, from);
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
