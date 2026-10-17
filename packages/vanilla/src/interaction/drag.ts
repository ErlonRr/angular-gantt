/**
 * @file drag.ts
 * Drag & resize: wires Pointer Events to the framework-free `DragSession` from @gantry/core
 * (snapping, minimum length, preview, result). The preview goes to the engine's `dragPreview`
 * signal; the timing is read from the current timeline when a drag starts.
 */

import {
  DragSession,
  type DragPreview,
  type DragTiming,
  type RowGeometry,
  type TaskDragEvent,
  type TaskResizeEvent,
} from '@gantry/core';
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
  /** Whether the last finished drag actually moved the bar (suppresses the trailing click) */
  lastDragMoved: boolean;
  start(event: PointerEvent, geo: RowGeometry, handle: 'bar' | 'left' | 'right', captureEl: Element): void;
  /** Abort the active drag without emitting (pointercancel, Escape, the element disconnected). */
  cancel(): void;
}

const IDLE: DragState = { kind: 'idle' };

export function createDrag(opts: DragOptions): Drag {
  const state = signal<DragState>(IDLE);
  const preview = opts.preview;
  let session: DragSession | null = null;
  /** Removes the active drag's pointer listeners */
  let gesture: AbortController | null = null;

  const setPreview = (p: DragPreview): void => {
    const prev = preview.peek();
    if (!prev || prev.x !== p.x || prev.width !== p.width) preview.set(p);
  };
  const reset = (): void => {
    gesture?.abort();
    gesture = null;
    session = null;
    state.set(IDLE);
    preview.set(null);
  };

  const drag: Drag = {
    state,
    lastDragMoved: false,
    start(event, geo, handle, captureEl) {
      if (session) return;
      event.preventDefault();
      event.stopPropagation();

      const task = geo.row.task;
      const current = new DragSession(
        task.id,
        handle,
        task.start,
        task.end ?? task.start,
        event.clientX,
        geo,
        opts.timing(),
      );
      session = current;
      try {
        captureEl.setPointerCapture(event.pointerId);
      } catch {
        /* synthetic event */
      }

      state.set({
        kind: handle === 'left' ? 'resizing-left' : handle === 'right' ? 'resizing-right' : 'dragging',
        taskId: task.id,
      });
      setPreview(current.preview(event.clientX));

      const onMove = (e: Event) => {
        if (session === current) setPreview(current.preview((e as PointerEvent).clientX));
      };
      const onUp = (e: Event) => {
        if (session !== current) return;
        const result = current.finish((e as PointerEvent).clientX);
        drag.lastDragMoved = !!result;
        reset();
        if (result?.kind === 'drag') opts.onDragged(result.event);
        else if (result?.kind === 'resize') opts.onResized(result.event);
      };

      // The gesture's listeners live until it ends (`reset()`): released, cancelled or aborted
      const { signal } = (gesture = new AbortController());
      captureEl.addEventListener('pointermove', onMove, { passive: true, signal });
      captureEl.addEventListener('pointerup', onUp, { signal });
      captureEl.addEventListener('pointercancel', () => drag.cancel(), { signal });
    },
    cancel() {
      drag.lastDragMoved = false;
      reset();
    },
  };
  return drag;
}
