// ─────────────────────────────────────────────────────────────
//  gantry · drag/gantt-drag.service.ts
//
//  Task bar drag (move) and resize (left / right handle), and the
//  pointer press that starts one — the Web Component's
//  `interaction/{drag,gestures}.ts`.
//
//    idle  ──start(geo, handle, x, timing)──►  dragging | resizing-left | resizing-right
//          ──move(x)────────────────────────►  preview (ghost bar)
//          ──drop(x)────────────────────────►  result (the canvas emits it) → idle
//          ──cancel()───────────────────────►  discard → idle
//
//  Snapping, minimum length and the resulting dates come from the
//  framework-free `DragSession` in @gantryjs/core (shared with the Web
//  Component). Positions are content coordinates: the pointer's client x
//  plus how far the timeline scrolled since the press, so a drag keeps its
//  maths while the viewport auto-scrolls under it. The real task is never
//  mutated until the drop.
//
//  The press (`trackPress`, D13 of Gantry 2 phase 9) is driven through
//  core's gesture machine: a mouse press becomes a drag once it has moved
//  `DRAG_THRESHOLD_PX`; a touch or pen press once it is held still (within
//  `TOUCH_SLOP_PX`) for `LONG_PRESS_MS` — moving earlier lets the browser
//  pan (the canvas has `touch-action: pan-x pan-y`). Releasing without a
//  drag is a click (mouse) or a tap (touch / pen). `bindTouchGuard` is the
//  non-passive `touchmove` that keeps the browser from panning while a
//  touch drags a bar. The canvas (`layout/gantt-canvas.component.ts`)
//  decides what a drag, a drop and a tap do.
//
//  Escape belongs to the press while it lasts (Gantry 2 phase 10, the Web
//  Component's `interaction/gestures.ts`): it is heard in the capture phase
//  on `keyTarget` (the window), cancels the press and is consumed there,
//  before the chart's keyboard (its focus-visible tracking, the tooltip's
//  Escape, the shortcuts) and the page see it. The pressed bar holds
//  keyboard focus (a mouse press focuses it), so the key would otherwise
//  make its focus visible and open its focus tooltip, or clear the
//  selection, instead of cancelling the drag.
//
//  External previews (keyboard move mode, Gantry 2 phase 9): another
//  session (core `KeyboardEditSession`) owns the dates and only borrows
//  the drag's visuals — the ghost, the dimmed source bar, the row pinned
//  in the virtual window, the readout chip and the closed tooltip:
//
//    idle  ──startExternal(id)──────►  external (preview null)
//          ──setExternalPreview(p)──►  preview p (null hides the ghost)
//          ──endExternal() / cancel()─► idle      (nothing is emitted here)
//
//  `isActive` covers both kinds; `isPointerDrag` only the pointer ones.
// ─────────────────────────────────────────────────────────────

import { Injectable, signal, computed } from '@angular/core';
import { type RowGeometry } from '../types';
import {
  DragSession,
  LONG_PRESS_MS,
  cancelGesture,
  endGesture,
  longPressGesture,
  moveGesture,
  startGesture,
  type DragHandle,
  type DragPreview,
  type DragResult,
  type DragTiming,
  type GestureEnd,
  type GestureState,
} from '@gantryjs/core';

export type { DragPreview };

export type DragState =
  | { kind: 'idle' }
  | { kind: 'dragging' | 'resizing-left' | 'resizing-right'; taskId: string }
  /** A preview another session drives (keyboard move mode): `startExternal` … `endExternal` */
  | { kind: 'external'; taskId: string };

@Injectable()
export class GanttDragService {
  // ── FSM state ──────────────────────────────────────────────
  readonly state = signal<DragState>({ kind: 'idle' });

  /** Preview geometry while dragging/resizing (null when idle) */
  readonly preview = signal<DragPreview | null>(null);

  readonly isDragging = computed(() => this.state().kind === 'dragging');
  readonly isResizing = computed(() => this.state().kind === 'resizing-left' || this.state().kind === 'resizing-right');
  readonly isActive = computed(() => this.state().kind !== 'idle');
  /** A pointer drag or resize (not an external preview) is in progress */
  readonly isPointerDrag = computed(() => {
    const kind = this.state().kind;
    return kind !== 'idle' && kind !== 'external';
  });
  readonly activeTaskId = computed(() => {
    const s = this.state();
    return s.kind !== 'idle' ? s.taskId : null;
  });

  private session: DragSession | null = null;

  /**
   * The trailing `click` of the last press belongs to a drag (it moved the bar, or it was
   * cancelled while dragging): the canvas swallows it. The next press resets it.
   */
  lastDragMoved = false;

  /**
   * Starts dragging `geo`'s bar by `handle` (`'bar'` moves it, `'left'` / `'right'` resize it) from
   * content x `x` (where the press started), on the scale `timing` of the current timeline. No-op
   * while a drag or an external preview is in progress.
   */
  start(geo: RowGeometry, handle: DragHandle, x: number, timing: DragTiming): void {
    if (this.session || this.state().kind !== 'idle') return;
    const task = geo.row.task;
    const session = new DragSession(task.id, handle, task.start, task.end ?? task.start, x, geo, timing);
    this.session = session;
    this.state.set({
      kind: handle === 'left' ? 'resizing-left' : handle === 'right' ? 'resizing-right' : 'dragging',
      taskId: task.id,
    });
    this.setPreview(session.preview(x));
  }

  /** The pointer is at content x `x`: the preview follows. */
  move(x: number): void {
    if (this.session) this.setPreview(this.session.preview(x));
  }

  /**
   * Released at content x `x`: ends the drag and returns what changed (`null`: nothing moved, or
   * no drag in progress). The canvas emits `taskDragged` / `taskResized`.
   */
  drop(x: number): DragResult {
    const session = this.session;
    if (!session) return null;
    const result = session.finish(x);
    this.lastDragMoved = !!result;
    this.reset();
    return result;
  }

  // ── External previews (keyboard move mode) ───────────────

  /**
   * Starts an external preview of the task `taskId` (keyboard move mode): the chart pins its row,
   * dims its bar and closes the tooltip until `endExternal()`. Returns `false` (and changes
   * nothing) while a drag or another preview is in progress.
   */
  startExternal(taskId: string): boolean {
    if (this.session || this.state().kind !== 'idle') return false;
    this.lastDragMoved = false;
    this.state.set({ kind: 'external', taskId });
    this.preview.set(null);
    return true;
  }

  /** The external preview's ghost (`null` hides it); ignored unless an external preview is active. */
  setExternalPreview(preview: DragPreview | null): void {
    if (this.state().kind === 'external') this.preview.set(preview);
  }

  /** Ends the external preview (commit or cancel: its owner emits the events). */
  endExternal(): void {
    if (this.state().kind === 'external') this.reset();
  }

  /**
   * Abort the active drag or external preview without emitting (pointercancel, Escape, the chart
   * destroyed). After a pointer drag the release that follows (a mouse button still down) is not a
   * click on the row: its click is swallowed.
   */
  cancel(): void {
    if (this.session) this.lastDragMoved = true;
    if (this.state().kind !== 'idle') this.reset();
  }

  private setPreview(p: DragPreview): void {
    const prev = this.preview();
    if (!prev || prev.x !== p.x || prev.width !== p.width) this.preview.set(p);
  }

  private reset(): void {
    this.session = null;
    this.state.set({ kind: 'idle' });
    this.preview.set(null);
  }
}

// ── Pointer press (D13) ──────────────────────────────────────

export interface PressOptions {
  /** Receives the press's moves and release (a press that may drag captures the pointer to it) */
  readonly target: Element;
  /**
   * Where Escape is heard, in the capture phase: the window (it hears every key first, wherever
   * focus is). The key is consumed while the press lasts.
   */
  readonly keyTarget: EventTarget;
  /** The press may become a drag: a mouse press captures the pointer, a touch press arms the long-press timer */
  readonly draggable: boolean;
  /** The press became a drag; `g.startX` / `g.startY` is where it was pressed, `g.x` / `g.y` where the pointer is */
  readonly onDragStart: (g: GestureState) => void;
  /** The pointer moved while dragging */
  readonly onDragMove: (g: GestureState) => void;
  /** Released (or handed to the browser's pan: `'none'`); `g.x` / `g.y` is the release position */
  readonly onEnd: (result: GestureEnd, g: GestureState) => void;
  /** Abandoned: `pointercancel`, Escape or `cancel()` (the chart destroyed) */
  readonly onCancel: (g: GestureState) => void;
}

export interface Press {
  readonly pointerId: number;
  /** The gesture as it stands */
  readonly gesture: () => GestureState;
  /** Ends the press as cancelled (no-op once it has ended). */
  cancel(): void;
}

/**
 * Starts tracking the press `down` (a `pointerdown` the caller decided to handle) through core's
 * gesture machine. The press owns its listeners (moves, release, `pointercancel`, Escape in the
 * capture phase of `keyTarget`, the long-press context menu) and its long-press timer until it
 * ends: released, cancelled or handed to the browser's pan. Browser only (an event handler).
 */
export function trackPress(down: PointerEvent, opts: PressOptions): Press {
  const { target, draggable } = opts;
  const pointerId = down.pointerId;
  let g = startGesture({ pointerType: down.pointerType, x: down.clientX, y: down.clientY, time: down.timeStamp });
  let active = true;
  // The long-press timer goes through the target's window (no globals)
  const win = target.ownerDocument.defaultView;
  let timer: number | undefined;
  const listeners = new AbortController();
  const { signal } = listeners;
  /** Escape cancels the press and goes no further (see the file comment) */
  const onKey = (e: Event): void => {
    if (!active || (e as KeyboardEvent).key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    cancel();
  };

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
    if (timer !== undefined) win?.clearTimeout(timer);
    listeners.abort();
    // Removed by hand: not every window implementation honours the `signal` option
    opts.keyTarget.removeEventListener('keydown', onKey, { capture: true });
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
    timer = win?.setTimeout(() => {
      if (!active) return;
      const from = g.phase;
      g = longPressGesture(g);
      advanced(from);
    }, LONG_PRESS_MS);
  }

  const mine = (e: Event): e is PointerEvent => active && (e as PointerEvent).pointerId === pointerId;
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
  // Escape abandons the press, before anything else hears it
  opts.keyTarget.addEventListener('keydown', onKey, { capture: true });
  // A held finger opens the context menu (or selects text) on some devices: not on a bar it drags
  if (draggable && g.kind === 'touch') target.addEventListener('contextmenu', e => e.preventDefault(), { signal });

  return { pointerId, gesture: () => g, cancel };
}

/**
 * Prevents the browser's pan while `dragging()` (a touch dragging a bar), through a non-passive
 * `touchmove` on `el`, until `signal` aborts. Bound once, before any touch starts (browsers decide
 * at `touchstart` whether a touch sequence can be cancelled).
 */
export function bindTouchGuard(el: Element, dragging: () => boolean, signal: AbortSignal): void {
  el.addEventListener(
    'touchmove',
    e => {
      if (e.cancelable && dragging()) e.preventDefault();
    },
    { passive: false, signal },
  );
}
