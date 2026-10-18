/**
 * @file gestures.ts
 * One pointer press on a bar, driven through core's gesture machine (D13): a mouse press becomes
 * a drag once it has moved `DRAG_THRESHOLD_PX`; a touch or pen press becomes one when it is held
 * still (within `TOUCH_SLOP_PX`) for `LONG_PRESS_MS`, and moving earlier lets the browser pan (the
 * canvas has `touch-action: pan-x pan-y`, see `styles/gestures.css.ts`). Releasing without a drag
 * is a click (mouse) or a tap (touch / pen).
 *
 * `trackPress` owns the press's listeners (moves, release, `pointercancel`, Escape, the long-press
 * context menu) and its long-press timer, and reports what happens through callbacks; the caller
 * (`interaction/canvas-pointer.ts`) decides what a drag, a drop and a tap do. Everything ends with
 * the press: released, cancelled (`pointercancel`, Escape, `cancel()`, the connection's signal),
 * or handed to the browser's pan.
 *
 * `bindTouchGuard` is the non-passive `touchmove` listener that keeps the browser from panning
 * while a touch drags a bar: it must exist before the touch starts (browsers decide at
 * `touchstart` whether a touch sequence can be cancelled), so it is bound once per connection and
 * prevents the default only while dragging.
 */

import {
  LONG_PRESS_MS,
  cancelGesture,
  endGesture,
  longPressGesture,
  moveGesture,
  startGesture,
  type GestureEnd,
  type GestureState,
} from '@gantryjs/core';

export interface PressOptions {
  /** Receives the press's moves and release (a mouse press that may drag captures the pointer to it) */
  readonly target: HTMLElement;
  /** Where Escape is heard (the host: keys bubble out of the shadow tree) */
  readonly keyTarget: EventTarget;
  /** The press may become a drag: a mouse press captures the pointer, a touch press arms the long-press timer */
  readonly draggable: boolean;
  /** Aborted when the element disconnects: the press is cancelled */
  readonly signal: AbortSignal;
  /** The press became a drag; `g.startX` / `g.startY` is where it was pressed, `g.x` / `g.y` where the pointer is */
  readonly onDragStart: (g: GestureState) => void;
  /** The pointer moved while dragging */
  readonly onDragMove: (g: GestureState) => void;
  /** Released (or handed to the browser's pan: `'none'`); `g.x` / `g.y` is the release position */
  readonly onEnd: (result: GestureEnd, g: GestureState) => void;
  /** Abandoned: `pointercancel`, Escape, `cancel()` or the signal */
  readonly onCancel: (g: GestureState) => void;
}

export interface Press {
  readonly pointerId: number;
  /** The gesture as it stands */
  readonly gesture: () => GestureState;
  /** Ends the press as cancelled (no-op once it has ended). */
  cancel(): void;
}

/** Starts tracking the press `down` (a `pointerdown` the caller decided to handle). */
export function trackPress(down: PointerEvent, opts: PressOptions): Press {
  const { target, draggable } = opts;
  const pointerId = down.pointerId;
  let g = startGesture({ pointerType: down.pointerType, x: down.clientX, y: down.clientY, time: down.timeStamp });
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new AbortController();
  const { signal } = listeners;

  const capture = (): void => {
    try {
      target.setPointerCapture(pointerId);
    } catch {
      // A synthetic event, or the pointer is gone
    }
  };
  /** The press is over: listeners, timer and capture go */
  const finish = (): void => {
    active = false;
    clearTimeout(timer);
    listeners.abort();
    try {
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    } catch {
      // Not captured
    }
  };
  const cancel = (): void => {
    if (!active) return;
    g = cancelGesture(g);
    finish();
    opts.onCancel(g);
  };
  /** Pending → dragging: the drag starts (only a draggable press reports it) */
  const advanced = (from: GestureState['phase']): void => {
    if (from !== 'pending' || g.phase !== 'dragging' || !draggable) return;
    // Touch: capture once it drags, so the moves keep coming here if the finger leaves the canvas
    if (g.kind === 'touch') capture();
    opts.onDragStart(g);
  };

  // A mouse press that may drag keeps receiving moves and its release outside the canvas
  if (draggable && g.kind === 'mouse') capture();
  if (draggable && g.kind === 'touch') {
    timer = setTimeout(() => {
      if (!active) return;
      const from = g.phase;
      g = longPressGesture(g);
      advanced(from);
    }, LONG_PRESS_MS);
  }

  const mine = (e: PointerEvent): boolean => active && e.pointerId === pointerId;
  target.addEventListener(
    'pointermove',
    e => {
      if (!mine(e)) return;
      const from = g.phase;
      g = moveGesture(g, e.clientX, e.clientY);
      if (g.phase === 'panning') {
        // The browser pans from here on (it sends `pointercancel` next): the press is over for us
        finish();
        opts.onEnd('none', g);
      } else if (from === 'pending') advanced(from);
      else if (g.phase === 'dragging' && draggable) opts.onDragMove(g);
    },
    { passive: true, signal },
  );
  target.addEventListener(
    'pointerup',
    e => {
      if (!mine(e)) return;
      // The release position, without deciding the phase again (a press is decided by its moves)
      g = { ...g, x: e.clientX, y: e.clientY };
      const result = endGesture(g);
      finish();
      opts.onEnd(result, g);
    },
    { signal },
  );
  target.addEventListener('pointercancel', e => mine(e) && cancel(), { signal });
  // Escape abandons the press (a drag is also cancelled by the keyboard shortcuts)
  opts.keyTarget.addEventListener('keydown', e => (e as KeyboardEvent).key === 'Escape' && cancel(), { signal });
  // A held finger opens the context menu (or selects text) on some devices: not on a bar it drags
  if (draggable && g.kind === 'touch') target.addEventListener('contextmenu', e => e.preventDefault(), { signal });
  opts.signal.addEventListener('abort', cancel, { signal });

  return { pointerId, gesture: () => g, cancel };
}

/**
 * Prevents the browser's pan while `dragging()` (a touch dragging a bar), through a non-passive
 * `touchmove` on `el`, until `signal` aborts.
 */
export function bindTouchGuard(el: HTMLElement, dragging: () => boolean, signal: AbortSignal): void {
  el.addEventListener(
    'touchmove',
    e => {
      if (e.cancelable && dragging()) e.preventDefault();
    },
    { passive: false, signal },
  );
}
