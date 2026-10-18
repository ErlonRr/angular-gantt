/**
 * @file autoscroll.ts
 * Auto-scroll while a bar is dragged near the timeline viewport's left or right edge (D13): one
 * step per animation frame, core `autoScrollDelta` (up to `AUTO_SCROLL_MAX_STEP` px a frame
 * within `AUTO_SCROLL_EDGE` px of an edge, and beyond it). The viewport's box is measured once,
 * when the drag starts; the loop runs only while the pointer is in an edge zone and the viewport
 * can still scroll that way, and `onScroll` lets the drag follow (its maths is in content
 * coordinates: the pointer's x plus the scroll since the press).
 */

import { autoScrollDelta } from '@gantryjs/core';

export interface AutoScroll {
  /** The pointer is at `clientX`: starts the loop when it is in an edge zone. */
  update(clientX: number): void;
  /** Stops the loop (the drag ended). */
  stop(): void;
}

export interface AutoScrollOptions {
  /** The scrolled element (the timeline viewport) */
  readonly scroller: HTMLElement;
  /** The largest `scrollLeft` (the model's scroll range: `totalWidth − canvasW`) */
  readonly maxLeft: () => number;
  /** Applies a new `scrollLeft`, already clamped to `0…maxLeft()` */
  readonly scrollTo: (left: number) => void;
  /** Called after each step: the drag recomputes its preview */
  readonly onScroll: () => void;
}

/** Starts auto-scrolling for a drag; measures the scroller's box now (a handler, not a render). */
export function createAutoScroll(opts: AutoScrollOptions): AutoScroll {
  const { scroller } = opts;
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
    opts.scrollTo(next);
    opts.onScroll();
    frame = requestAnimationFrame(tick);
  };

  return {
    update(clientX) {
      x = clientX;
      if (frame === null && autoScrollDelta(x, start, end) !== 0) frame = requestAnimationFrame(tick);
    },
    stop() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    },
  };
}
