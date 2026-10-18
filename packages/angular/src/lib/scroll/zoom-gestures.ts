// ─────────────────────────────────────────────────────────────
//  gantry · scroll/zoom-gestures.ts
//
//  Zoom gestures on the timeline viewport (D16 of Gantry 2 phase 9),
//  anchored at the pointer — the Web Component's `interaction/zoom.ts`:
//
//  - Ctrl / ⌘ + wheel (a trackpad pinch arrives as a wheel with
//    `ctrlKey`): a non-passive `wheel` listener that acts only with
//    Ctrl / ⌘ held — the plain wheel keeps scrolling — and takes the
//    browser's page zoom. Core `wheelZoom` turns the deltas into whole
//    levels (one per `WHEEL_ZOOM_DELTA` px, line and page modes
//    normalised); the count starts over when the level changed elsewhere.
//  - A two-finger touch pinch: one level per ×`PINCH_ZOOM_RATIO` of finger
//    spread (core `pinchZoomSteps`), anchored at the fingers' midpoint.
//    Its `touchmove` is prevented, so the browser neither pans nor zooms
//    the page meanwhile.
//  - Safari's `gesturestart` / `gesturechange` (its trackpad pinch, and
//    iOS without a touch pinch): the same steps from the gesture's `scale`.
//
//  No zoom while a bar is moved, by the pointer or in keyboard move mode
//  (`host.busy()`: its maths is in the timeline it started on). The
//  anchor is the pointer's x in viewport px, clamped to the viewport
//  (`clientX − its left edge − clientLeft`, the box measured once per
//  gesture); `host.zoom()` changes the level and keeps the date under
//  `anchorX` in place (the layout's `zoomAnchorX`, consumed once by the
//  chart's scroll sync through core `anchoredScrollLeft`). Nothing
//  changes at the first / last level.
//
//  GantryComponent binds them once, in the browser (`afterNextRender`),
//  on `.gantry-canvas-viewport` and unbinds them when the chart is
//  destroyed.
// ─────────────────────────────────────────────────────────────

import { initialWheelZoomState, pinchZoomSteps, wheelZoom, type WheelZoomState } from '@gantryjs/core';

/** What the gestures may do to the chart, and what they read from it. */
export interface ZoomGestureHost {
  /**
   * Zoom by `steps` levels (> 0 zooms in, < 0 out), keeping the date under `anchorX` (px from the
   * viewport's left edge) in place. Nothing happens at the first / last level.
   */
  zoom(steps: number, anchorX: number): void;
  /** The zoom level shown: a Ctrl / ⌘ + wheel count starts over when it changed elsewhere */
  level?(): string;
  /** A bar is being moved (pointer drag, keyboard move mode): the gestures don't zoom meanwhile */
  busy?(): boolean;
}

/** Safari's `GestureEvent` (not in the DOM typings). */
interface GestureEventLike extends UIEvent {
  readonly scale: number;
  readonly clientX: number;
}

/** A pinch in progress: steps taken so far, from its starting spread. */
interface Pinch {
  /** Finger distance when it started (touch), or 1 (Safari's gesture `scale`) */
  readonly d0: number;
  applied: number;
}

/**
 * Binds the zoom gestures to the timeline `viewport`; returns the function that unbinds them.
 * Browser only (call from `afterNextRender` or an event handler).
 */
export function bindZoomGestures(viewport: HTMLElement, host: ZoomGestureHost): () => void {
  const listeners = new AbortController();
  const { signal } = listeners;
  let wheel: WheelZoomState = initialWheelZoomState();
  /** Level the wheel count belongs to: a zoom from elsewhere starts it over */
  let wheelLevel: string | null = null;
  let touchPinch: Pinch | null = null;
  let gesturePinch: Pinch | null = null;
  /** Viewport's left edge for the anchors of one gesture (measured when it starts) */
  let left = 0;

  const measure = (): void => {
    left = viewport.getBoundingClientRect().left + viewport.clientLeft;
  };
  /** The pointer's x in viewport px (what the zoom anchor holds) */
  const anchorAt = (clientX: number): number => Math.min(viewport.clientWidth, Math.max(0, clientX - left));
  const level = (): string | null => host.level?.() ?? null;
  const busy = (): boolean => host.busy?.() ?? false;
  const zoomBy = (steps: number, anchor: number): void => {
    if (steps !== 0) host.zoom(steps, anchor);
  };

  // ── Ctrl/⌘ + wheel, trackpad pinch ─────────────────────────
  viewport.addEventListener(
    'wheel',
    e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // The browser would zoom the page
      e.preventDefault();
      // A Safari gesture already zooms (should a pinch also arrive as wheels)
      if (busy() || gesturePinch) return;
      if (level() !== wheelLevel) wheel = initialWheelZoomState();
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
  const spread = (t: TouchList): number => Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);
  const startTouchPinch = (t: TouchList): void => {
    const d0 = spread(t);
    touchPinch = d0 > 0 ? { d0, applied: 0 } : null;
    if (touchPinch) measure();
  };
  viewport.addEventListener(
    'touchstart',
    e => {
      if (e.touches.length === 2 && !busy()) startTouchPinch(e.touches);
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
      if (busy()) return;
      e.preventDefault();
      if (!touchPinch) startTouchPinch(e.touches);
      const pinch = touchPinch;
      if (!pinch) return;
      const steps = pinchZoomSteps(pinch.d0, spread(e.touches), pinch.applied);
      // Counted even at the finest / coarsest level, so the gesture stays consistent
      pinch.applied += steps;
      zoomBy(steps, anchorAt((e.touches[0].clientX + e.touches[1].clientX) / 2));
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
    if (touchPinch || busy()) return;
    if (type === 'start' || !gesturePinch) {
      gesturePinch = { d0: 1, applied: 0 };
      measure();
    }
    const pinch = gesturePinch;
    const steps = pinchZoomSteps(pinch.d0, e.scale, pinch.applied);
    pinch.applied += steps;
    zoomBy(steps, anchorAt(e.clientX));
  };
  viewport.addEventListener('gesturestart', onGesture('start'), { passive: false, signal });
  viewport.addEventListener('gesturechange', onGesture('change'), { passive: false, signal });
  viewport.addEventListener('gestureend', onGesture('end'), { passive: false, signal });

  return () => listeners.abort();
}
