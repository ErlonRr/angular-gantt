/**
 * @file zoom.ts
 * Zoom gestures on the timeline viewport (D16), anchored at the pointer:
 *
 * - Ctrl/⌘ + wheel (a trackpad pinch arrives as a wheel with `ctrlKey`): a non-passive `wheel`
 *   listener that acts only with Ctrl/⌘ held — the plain wheel keeps scrolling — and takes the
 *   browser's page zoom. Core `wheelZoom` turns the deltas into whole levels (one per
 *   `WHEEL_ZOOM_DELTA` px, line and page modes normalised).
 * - A two-finger touch pinch: one level per ×`PINCH_ZOOM_RATIO` of finger spread (core
 *   `pinchZoomSteps`), anchored at the fingers' midpoint. Its `touchmove` is prevented, so the
 *   browser neither pans nor zooms the page meanwhile.
 * - Safari's `gesturestart` / `gesturechange` (its trackpad pinch, and iOS without a touch pinch):
 *   the same steps from the gesture's `scale`.
 *
 * A zoom writes `zoomAnchor` (the pointer's x in viewport px) with the new level; the
 * scroll-commands region keeps the date under that x in place once the new timeline is painted
 * (`layers/scroll-commands.ts`, core `anchoredScrollLeft`). The level-change effect emits
 * `view-mode-change`, saves the state and announces the level, as for any zoom. No zoom while a
 * bar is moved, by the pointer or in keyboard move mode (its maths is in the timeline it started
 * on).
 */

import { initialWheelZoomState, pinchZoomSteps, wheelZoom, zoomStep, type WheelZoomState } from '@gantryjs/core';
import { batch } from '../reactive';
import type { LayerContext } from '../layers/context';

/** Safari's `GestureEvent` (not in the DOM typings). */
interface GestureEventLike extends UIEvent {
  readonly scale: number;
  readonly clientX: number;
}

/** A pinch in progress: steps taken so far and how to read its anchor. */
interface Pinch {
  /** Finger distance when it started (touch), or 1 (Safari's gesture `scale`) */
  readonly d0: number;
  applied: number;
}

/** Binds the zoom gestures to the timeline viewport until `signal` aborts. */
export function bindZoomGestures(ctx: LayerContext, signal: AbortSignal): void {
  const { inputs: I, graph: G, dom, drag } = ctx;
  const viewport = dom.viewport;
  let wheel: WheelZoomState = initialWheelZoomState();
  /** Level the wheel accumulator belongs to: a zoom from elsewhere starts it over */
  let wheelLevel: string | null = null;
  let touchPinch: Pinch | null = null;
  let gesturePinch: Pinch | null = null;
  /** Viewport box for the anchors of one gesture (measured when it starts) */
  let left = 0;

  const measure = (): void => {
    left = viewport.getBoundingClientRect().left + viewport.clientLeft;
  };
  /** The pointer's x in viewport px (what `zoomAnchor` holds) */
  const anchorAt = (clientX: number): number => Math.min(viewport.clientWidth, Math.max(0, clientX - left));
  const level = (): string | null => {
    try {
      return G.viewMode.peek();
    } catch {
      return null; // invalid options: the render reports them
    }
  };
  /** A bar is moved — by the pointer or in keyboard move mode (both show the drag preview) */
  const dragging = (): boolean => drag.state.peek().kind !== 'idle' || I.dragPreview.peek() !== null;

  /** `steps` levels finer (> 0) or coarser (< 0), keeping the date at viewport x `anchor`. */
  const zoomBy = (steps: number, anchor: number): void => {
    const from = level();
    if (from === null || steps === 0) return;
    const levels = G.config.peek().zoomLevels;
    let to = from;
    for (let i = 0; i < Math.abs(steps); i++) to = zoomStep(levels, to, steps > 0 ? -1 : 1);
    // At the finest / coarsest level: nothing changes, no anchor is left behind
    if (to === from) return;
    batch(() => {
      I.zoomAnchor.set(anchor);
      I.viewModeOverride.set(to);
    });
  };

  // ── Ctrl/⌘ + wheel, trackpad pinch ─────────────────────────
  viewport.addEventListener(
    'wheel',
    e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // The browser would zoom the page
      e.preventDefault();
      // A Safari gesture already zooms (should a pinch also arrive as wheels)
      if (dragging() || gesturePinch) return;
      const current = level();
      if (current !== wheelLevel) wheel = initialWheelZoomState();
      const r = wheelZoom(wheel, e.deltaY, e.deltaMode);
      wheel = r.state;
      if (r.steps !== 0) {
        measure();
        zoomBy(r.steps, anchorAt(e.clientX));
      }
      wheelLevel = level();
    },
    { passive: false, signal },
  );

  // ── Two-finger touch pinch ─────────────────────────────────
  const spread = (t: TouchList): number => Math.hypot(t[1]!.clientX - t[0]!.clientX, t[1]!.clientY - t[0]!.clientY);
  const startTouchPinch = (t: TouchList): void => {
    const d0 = spread(t);
    touchPinch = d0 > 0 ? { d0, applied: 0 } : null;
    if (touchPinch) measure();
  };
  viewport.addEventListener(
    'touchstart',
    e => {
      if (e.touches.length === 2 && !dragging()) startTouchPinch(e.touches);
      else touchPinch = null;
    },
    { passive: true, signal },
  );
  viewport.addEventListener(
    'touchmove',
    e => {
      if (e.touches.length !== 2) return;
      // Already panning (the browser took the touch first): no pinch until the fingers lift
      if (!e.cancelable) {
        touchPinch = null;
        return;
      }
      if (dragging()) return;
      e.preventDefault();
      if (!touchPinch) startTouchPinch(e.touches);
      const pinch = touchPinch;
      if (!pinch) return;
      const steps = pinchZoomSteps(pinch.d0, spread(e.touches), pinch.applied);
      // Counted even at the finest / coarsest level, so the gesture stays consistent
      pinch.applied += steps;
      if (steps !== 0) zoomBy(steps, anchorAt((e.touches[0]!.clientX + e.touches[1]!.clientX) / 2));
    },
    { passive: false, signal },
  );
  const endTouches = (e: TouchEvent): void => {
    if (e.touches.length < 2) touchPinch = null;
  };
  viewport.addEventListener('touchend', endTouches, { passive: true, signal });
  viewport.addEventListener('touchcancel', endTouches, { passive: true, signal });

  // ── Safari gesture events ──────────────────────────────────
  const onGesture = (type: 'start' | 'change' | 'end') => (event: Event) => {
    const e = event as GestureEventLike;
    // Safari would zoom the page
    e.preventDefault();
    if (type === 'end') {
      gesturePinch = null;
      return;
    }
    // A touch pinch already zooms (iOS sends both)
    if (touchPinch || dragging()) return;
    if (type === 'start' || !gesturePinch) {
      gesturePinch = { d0: 1, applied: 0 };
      measure();
    }
    const pinch = gesturePinch;
    const steps = pinchZoomSteps(pinch.d0, e.scale, pinch.applied);
    pinch.applied += steps;
    if (steps !== 0) zoomBy(steps, anchorAt(e.clientX));
  };
  viewport.addEventListener('gesturestart', onGesture('start'), { passive: false, signal });
  viewport.addEventListener('gesturechange', onGesture('change'), { passive: false, signal });
  viewport.addEventListener('gestureend', onGesture('end'), { passive: false, signal });
}
