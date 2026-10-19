/**
 * @file scroll.ts
 * Scroll synchronisation between the task-list panel and the timeline, writing the engine's
 * `scrollTop` / `scrollLeft` signals.
 *
 * The timeline viewport scrolls in both axes (its header is sticky); the panel scrolls
 * horizontally only, its vertical offset mirrors the timeline's in both directions so wheel and
 * touch scrolling work over either pane. Core `createScrollMirror` decides what to write: a pane's
 * scroll event that only echoes the mirror's own write is not mirrored back, so keyboard moves at
 * key-repeat speed (each scrolls the timeline in its keydown) are never undone by the previous
 * move's echo. The listeners live while the element is connected.
 *
 * `scrollToX` is also how the zoom anchoring (`layers/scroll-commands.ts`) and the auto-scroll of
 * a drag (`interaction/autoscroll.ts`) move the timeline: an instant jump writes `scrollLeft` at
 * once, so the windowed header and grid follow in the same flush.
 *
 * Inside a sync group (`layers/sync.ts`) the timeline's horizontal scroll events are the member's
 * scroll reports: every horizontal move the viewport makes — the user's, and the chart's own
 * jumps (initial scroll, zoom anchoring, `scrollToDate`, fit) — reaches the group from here, except
 * the echo of a scroll the group caused (`ViewportSync`, one echo guard per viewport).
 */

import { createEchoGuard, createScrollMirror, type EchoGuard, type ScrollPane } from '@gantryjs/core';
import type { Inputs } from '../engine/inputs';
import { signal, type WritableSignal } from '../reactive';

/**
 * The timeline viewport's side of the sync group, one per viewport (`viewportSync`): the sync
 * layer (`layers/sync.ts`) queues the group's scrolls and plugs in the reporter while the chart is
 * in a group, the scroll-commands region applies the queued scroll after the paint
 * (`layers/scroll-commands.ts`), and the scroll handler (`bindScroll`) reports the moves.
 *
 * A move is not reported when it is the echo of a scroll the chart made for the group (`guard`: a
 * group scroll applied, the zoom anchoring after a level the group applied, a start correction at
 * the chart's scroll limit; `layers/scroll-commands.ts`), nor while a group scroll waits for the
 * paint — the group's newer position replaces it, so two charts whose own scrolls cross (both
 * apply `initialScroll`, or both correct a new start, in the same frame) end up together instead
 * of swapped: the first report the group hears wins.
 */
export interface ViewportSync {
  /** The viewport's echo guard (core `createEchoGuard`) */
  readonly guard: EchoGuard;
  /** Sends a horizontal offset to the group (set by the sync layer while joined; `null` outside a group) */
  report: ((x: number) => void) | null;
  /**
   * The group's scroll waiting for the paint, or `null`. A tracked read: the scroll-commands
   * region re-runs when the group sends a scroll.
   */
  waiting(): number | null;
  /** Queues the group's scroll for the next paint (`null` drops a waiting one: the chart left) */
  queue(x: number | null): void;
  /** The waiting scroll was applied, or a local scroll replaced it (a plain write: callable in a paint) */
  consume(): void;
  /**
   * The group applied a zoom level (`layers/sync.ts`): the zoom anchoring of the next painted
   * timeline is the group's correction, not the chart's own move. Read and cleared by the
   * scroll-commands region.
   */
  groupLevel: boolean;
  /** The viewport moved horizontally to `x` (the scroll handler): reported unless it's an echo */
  moved(x: number): void;
}

const viewportSyncs = new WeakMap<HTMLElement, ViewportSync>();

/**
 * The sync link of a timeline viewport (created on first use, kept for the element's lifetime):
 * the sync layer, the scroll-commands region and the scroll handler reach the same one through
 * the viewport they share.
 */
export function viewportSync(viewport: HTMLElement): ViewportSync {
  let link = viewportSyncs.get(viewport);
  if (!link) viewportSyncs.set(viewport, (link = createViewportSync()));
  return link;
}

function createViewportSync(): ViewportSync {
  /** A fresh object per group scroll: equal offsets sent twice are two scrolls */
  const request: WritableSignal<{ x: number } | null> = signal(null);
  /** The request applied last (compared by identity) */
  let applied: { x: number } | null = null;
  const waitingNow = (): boolean => {
    const r = request.peek();
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
      applied = request.peek();
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

/**
 * Binds the scroll mirroring (and the panel's vertical wheel forwarding) until `signal` aborts:
 * the element binds it when it connects and aborts it when it disconnects.
 */
export function bindScroll(panel: HTMLElement, canvas: HTMLElement, inputs: Inputs, signal: AbortSignal): void {
  const mirror = createScrollMirror();
  const link = viewportSync(canvas);
  const paneOf = (pane: ScrollPane) => (pane === 'timeline' ? canvas : panel);
  const read = (pane: ScrollPane) => paneOf(pane).scrollTop;
  const write = (pane: ScrollPane, top: number) => {
    paneOf(pane).scrollTop = top;
  };
  /**
   * The timeline's horizontal offset at its last scroll event. Not `inputs.scrollLeft`: an instant
   * jump writes that before its scroll event comes, and the jump has to be reported too.
   */
  let left = canvas.scrollLeft;
  const sync = (pane: ScrollPane) => () => {
    mirror.scrolled(pane, read, write);
    inputs.scrollTop.set(canvas.scrollTop);
    inputs.scrollLeft.set(canvas.scrollLeft);
    // A vertical scroll (or the panel's) leaves the horizontal offset alone: nothing to report
    if (pane === 'timeline' && canvas.scrollLeft !== left) {
      left = canvas.scrollLeft;
      link.moved(left);
    }
  };
  canvas.addEventListener('scroll', sync('timeline'), { passive: true, signal });
  panel.addEventListener('scroll', sync('panel'), { passive: true, signal });
  // The panel only scrolls horizontally: a vertical wheel over it scrolls the timeline. Ctrl/⌘ +
  // wheel (and a trackpad pinch) is a zoom: over the timeline the chart zooms
  // (`interaction/zoom.ts`), over the panel the browser keeps it
  panel.addEventListener(
    'wheel',
    e => {
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      canvas.scrollTop += e.deltaY;
      e.preventDefault();
    },
    { passive: false, signal },
  );
}

/** Writes `scrollLeft` for an instant jump; `maxLeft` is the scroll range (`totalWidth − canvasW`). */
export interface ScrollSync {
  inputs: Inputs;
  maxLeft: number;
}

/**
 * Scroll the timeline horizontally to `x` (clamped at 0). With `sync`, an instant jump also writes
 * `scrollLeft` (clamped to the scroll range, no layout read): the horizontally windowed header and
 * grid then repaint in the same flush instead of one frame later, when the scroll event arrives.
 */
export function scrollToX(
  canvas: HTMLElement,
  x: number,
  behavior: ScrollBehavior = 'smooth',
  sync?: ScrollSync,
): void {
  const resolved = motionSafe(behavior);
  scrollTo(canvas, { left: Math.max(0, x), behavior: resolved });
  if (sync && resolved !== 'smooth') sync.inputs.scrollLeft.set(Math.min(Math.max(0, x), Math.max(0, sync.maxLeft)));
}

/** Scroll vertically so the row at `rowIndex` is visible. */
export function scrollToRow(
  canvas: HTMLElement,
  rowIndex: number,
  rowHeight: number,
  behavior: ScrollBehavior = 'smooth',
): void {
  scrollTo(canvas, { top: rowIndex * rowHeight, behavior: motionSafe(behavior) });
}

/** `smooth` becomes `instant` when the user prefers reduced motion. */
function motionSafe(behavior: ScrollBehavior): ScrollBehavior {
  return behavior === 'smooth' &&
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'instant'
    : behavior;
}

// `scrollTo` is missing on some non-browser DOMs; fall back to assignment.
function scrollTo(el: HTMLElement, opts: ScrollToOptions): void {
  if (typeof el.scrollTo === 'function') el.scrollTo(opts);
  else {
    if (opts.left != null) el.scrollLeft = opts.left;
    if (opts.top != null) el.scrollTop = opts.top;
  }
}
