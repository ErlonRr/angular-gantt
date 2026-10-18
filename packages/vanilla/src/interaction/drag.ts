/**
 * @file drag.ts
 * Drag & resize: the framework-free `DragSession` from @gantryjs/core (snapping, minimum length,
 * preview, result) behind the engine's `dragPreview` input. The timing is read from the current
 * timeline when a drag starts.
 *
 * The pointer side lives in `interaction/canvas-pointer.ts` (core's gesture machine decides when
 * a press becomes a drag, see `interaction/gestures.ts`): it calls `start` once the press drags,
 * `move` with every pointer move and auto-scroll step, and `drop` on release. Positions are in
 * content coordinates — the pointer's client x plus how far the timeline scrolled since the
 * press — so a drag keeps its maths while the viewport auto-scrolls under it.
 */

import {
  DragSession,
  type BarHit,
  type DragPreview,
  type DragTiming,
  type RowGeometry,
  type TaskDragEvent,
  type TaskResizeEvent,
} from '@gantryjs/core';
import { signal, type ReadonlySignal, type WritableSignal } from '../reactive';

export type DragState = { kind: 'idle' } | { kind: 'dragging' | 'resizing-left' | 'resizing-right'; taskId: string };

export interface DragOptions {
  preview: WritableSignal<DragPreview | null>;
  /** Scale of the timeline the drag starts on */
  timing: () => DragTiming;
  onDragged: (e: TaskDragEvent) => void;
  onResized: (e: TaskResizeEvent) => void;
}

export interface Drag {
  readonly state: ReadonlySignal<DragState>;
  /**
   * The trailing `click` of the last press belongs to a drag (it moved the bar, or it was
   * cancelled while dragging): the canvas swallows it. The next press resets it.
   */
  lastDragMoved: boolean;
  /**
   * Starts dragging `geo`'s bar by `handle` (`'bar'` moves it, `'left'` / `'right'` resize it)
   * from content x `x` (where the press started). No-op while a drag is active.
   */
  start(geo: RowGeometry, handle: BarHit, x: number): void;
  /** The pointer is at content x `x`: the preview follows. */
  move(x: number): void;
  /** Released at content x `x`: emits `task-dragged` / `task-resized` when the task changed. */
  drop(x: number): void;
  /** Abort the active drag without emitting (pointercancel, Escape, the element disconnected). */
  cancel(): void;
}

const IDLE: DragState = { kind: 'idle' };

export function createDrag(opts: DragOptions): Drag {
  const state = signal<DragState>(IDLE);
  const preview = opts.preview;
  let session: DragSession | null = null;

  const setPreview = (p: DragPreview): void => {
    const prev = preview.peek();
    if (!prev || prev.x !== p.x || prev.width !== p.width) preview.set(p);
  };
  const reset = (): void => {
    session = null;
    state.set(IDLE);
    preview.set(null);
  };

  const drag: Drag = {
    state,
    lastDragMoved: false,
    start(geo, handle, x) {
      if (session) return;
      const task = geo.row.task;
      const current = new DragSession(task.id, handle, task.start, task.end ?? task.start, x, geo, opts.timing());
      session = current;
      state.set({
        kind: handle === 'left' ? 'resizing-left' : handle === 'right' ? 'resizing-right' : 'dragging',
        taskId: task.id,
      });
      setPreview(current.preview(x));
    },
    move(x) {
      if (session) setPreview(session.preview(x));
    },
    drop(x) {
      const current = session;
      if (!current) return;
      const result = current.finish(x);
      drag.lastDragMoved = !!result;
      reset();
      if (result?.kind === 'drag') opts.onDragged(result.event);
      else if (result?.kind === 'resize') opts.onResized(result.event);
    },
    cancel() {
      if (!session) return;
      // The release that follows (a mouse button still down) is not a click on the row
      drag.lastDragMoved = true;
      reset();
    },
  };
  return drag;
}
