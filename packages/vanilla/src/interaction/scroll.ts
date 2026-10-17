/**
 * @file scroll.ts
 * Scroll synchronisation between the task-list panel and the timeline, writing the engine's
 * `scrollTop` / `scrollLeft` signals.
 *
 * The timeline viewport scrolls in both axes (its header is sticky); the panel scrolls
 * horizontally only, its vertical offset mirrors the timeline's in both directions so wheel and
 * touch scrolling work over either pane. The listeners live while the element is connected.
 */

import type { Inputs } from '../engine/inputs';

/**
 * Binds the scroll mirroring (and the panel's vertical wheel forwarding) until `signal` aborts:
 * the element binds it when it connects and aborts it when it disconnects.
 */
export function bindScroll(panel: HTMLElement, canvas: HTMLElement, inputs: Inputs, signal: AbortSignal): void {
  const sync = (from: HTMLElement, to: HTMLElement) => () => {
    // The mirrored pane fires its own scroll event; equal offsets end the loop
    if (to.scrollTop !== from.scrollTop) to.scrollTop = from.scrollTop;
    inputs.scrollTop.set(canvas.scrollTop);
    inputs.scrollLeft.set(canvas.scrollLeft);
  };
  canvas.addEventListener('scroll', sync(canvas, panel), { passive: true, signal });
  panel.addEventListener('scroll', sync(panel, canvas), { passive: true, signal });
  // The panel only scrolls horizontally: a vertical wheel over it scrolls the timeline
  panel.addEventListener(
    'wheel',
    e => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
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

// `scrollTo` is missing on some non-browser DOMs (jsdom); fall back to assignment.
function scrollTo(el: HTMLElement, opts: ScrollToOptions): void {
  if (typeof el.scrollTo === 'function') el.scrollTo(opts);
  else {
    if (opts.left != null) el.scrollLeft = opts.left;
    if (opts.top != null) el.scrollTop = opts.top;
  }
}
