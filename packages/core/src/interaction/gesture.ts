// ─────────────────────────────────────────────────────────────
//  gantry · interaction/gesture.ts
//  Pointer gestures: mouse drag after a threshold, touch / pen
//  long-press to drag, pan otherwise (step 2.2).
// ─────────────────────────────────────────────────────────────
//
// A pure state machine both bindings drive from their pointer handlers:
//
//   pointerdown   → startGesture       phase 'pending'
//   pointermove   → moveGesture        mouse: 'dragging' after DRAG_THRESHOLD_PX
//                                      touch: 'panning' once it leaves TOUCH_SLOP_PX
//   timer         → longPressGesture   touch: 'dragging' after LONG_PRESS_MS in the slop
//   pointerup     → endGesture         'click' | 'tap' | 'drop' | 'none'
//
// While a touch gesture is 'pending' or 'panning' the browser scrolls the viewport; the bindings
// prevent a (non-passive) `touchmove` only while the phase is 'dragging'.

/** Mouse movement (px) before a press becomes a drag; below it, the press is a click. */
export const DRAG_THRESHOLD_PX = 3;
/** Touch / pen press (ms) that starts a drag. */
export const LONG_PRESS_MS = 350;
/** Touch / pen movement (px) still counted as holding still; beyond it the browser pans. */
export const TOUCH_SLOP_PX = 8;

/** How a pointer drags: `'mouse'` after a short move, `'touch'` (touch and pen) after a long press. */
export type GestureKind = 'mouse' | 'touch';

/**
 * - `pending`: pressed, not decided yet
 * - `dragging`: the binding drags the bar (and prevents the browser's pan)
 * - `panning`: a touch moved before the long press: the browser pans, the gesture is over for us
 * - `done`: released
 */
export type GesturePhase = 'pending' | 'dragging' | 'panning' | 'done';

/** What a released gesture was. `'none'`: it panned, or it had already ended. */
export type GestureEnd = 'click' | 'tap' | 'drop' | 'none';

export interface GestureState {
  readonly kind: GestureKind;
  readonly phase: GesturePhase;
  /** Where the press started (client px) */
  readonly startX: number;
  readonly startY: number;
  /** The last position seen (client px) */
  readonly x: number;
  readonly y: number;
  /** When the press started (ms, e.g. `event.timeStamp`) */
  readonly startTime: number;
}

export interface GestureStart {
  /** `PointerEvent.pointerType`; `''` and unknown types count as mouse */
  pointerType: string;
  x: number;
  y: number;
  /** Press time in ms (e.g. `event.timeStamp`); default 0 */
  time?: number | undefined;
}

/** Drag behaviour of a `PointerEvent.pointerType`: touch and pen long-press, anything else is a mouse. */
export function gestureKind(pointerType: string): GestureKind {
  return pointerType === 'touch' || pointerType === 'pen' ? 'touch' : 'mouse';
}

/** A new gesture at pointerdown. */
export function startGesture(start: GestureStart): GestureState {
  const { x, y } = start;
  return {
    kind: gestureKind(start.pointerType),
    phase: 'pending',
    startX: x,
    startY: y,
    x,
    y,
    startTime: start.time ?? 0,
  };
}

/**
 * The pointer moved to `(x, y)`. A pending mouse press becomes a drag once it has moved
 * `DRAG_THRESHOLD_PX`; a pending touch press that leaves `TOUCH_SLOP_PX` pans instead.
 * Other phases only track the position (a finished gesture is returned unchanged).
 */
export function moveGesture(state: GestureState, x: number, y: number): GestureState {
  if (state.phase === 'done' || state.phase === 'panning') return state;
  let phase: GesturePhase = state.phase;
  if (phase === 'pending') {
    const dist = Math.hypot(x - state.startX, y - state.startY);
    if (state.kind === 'mouse') {
      if (dist >= DRAG_THRESHOLD_PX) phase = 'dragging';
    } else if (dist > TOUCH_SLOP_PX) {
      phase = 'panning';
    }
  }
  return { ...state, phase, x, y };
}

/**
 * The long-press timer fired: a touch press still inside the slop becomes a drag. With `time`,
 * the press must also have lasted `LONG_PRESS_MS` (a timer that fired early changes nothing).
 * Mouse gestures and decided gestures are returned unchanged.
 */
export function longPressGesture(state: GestureState, time?: number): GestureState {
  if (state.kind !== 'touch' || state.phase !== 'pending') return state;
  if (time !== undefined && time - state.startTime < LONG_PRESS_MS) return state;
  return { ...state, phase: 'dragging' };
}

/**
 * The gesture was abandoned (`pointercancel`, Escape, a disconnect): phase `'done'`, so later
 * moves, timers and the release change nothing and `endGesture` returns `'none'`.
 */
export function cancelGesture(state: GestureState): GestureState {
  return state.phase === 'done' ? state : { ...state, phase: 'done' };
}

/**
 * The pointer was released: a press that never moved is a `'click'` (mouse) or a `'tap'`
 * (touch / pen), a drag is a `'drop'`, a pan or an already ended gesture is `'none'`.
 */
export function endGesture(state: GestureState): GestureEnd {
  switch (state.phase) {
    case 'pending':
      return state.kind === 'mouse' ? 'click' : 'tap';
    case 'dragging':
      return 'drop';
    default:
      return 'none';
  }
}
