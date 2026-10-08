/**
 * @file gantt-drag.service.ts
 * Vanilla JS drag & resize: wires Pointer Events to the framework-free
 * `DragSession` from @gantry/core (snapping, minimum length, preview, result).
 */

import {
  RowGeometry, TaskDragEvent, TaskResizeEvent, DragSession,
  type DragTiming, type DragPreview,
} from '@gantry/core';
import { createState } from '../core/state';

export type { DragPreview };

export type DragState =
  | { kind: 'idle' }
  | { kind: 'dragging' | 'resizing-left' | 'resizing-right'; taskId: string };

export class GanttDragService {
  readonly state = createState<DragState>({ kind: 'idle' });
  readonly preview = createState<DragPreview | null>(null);

  private timing: DragTiming = { pxPerDay: 8, toX: () => 0, span: (start, end) => ({ start, end }), snap: 'day' };
  private session: DragSession | null = null;

  onTaskDragged?: (e: TaskDragEvent) => void;
  onTaskResized?: (e: TaskResizeEvent) => void;

  /** Whether the last finished drag actually moved the bar (used to suppress the trailing click). */
  lastDragMoved = false;

  configure(timing: DragTiming): void {
    this.timing = timing;
  }

  startDrag(
    event: PointerEvent,
    geo: RowGeometry,
    handle: 'bar' | 'left' | 'right',
    captureEl: SVGElement | HTMLElement
  ): void {
    if (this.session) return;
    event.preventDefault();
    event.stopPropagation();

    const task = geo.row.task;
    const session = new DragSession(task.id, handle, task.start, task.end ?? task.start, event.clientX, geo, this.timing);
    this.session = session;
    try { captureEl.setPointerCapture(event.pointerId); } catch { /* synthetic event */ }

    this.state.set({
      kind: handle === 'left' ? 'resizing-left' : handle === 'right' ? 'resizing-right' : 'dragging',
      taskId: task.id,
    });
    this.setPreview(session.preview(event.clientX));

    const onMove = (e: PointerEvent) => {
      if (this.session === session) this.setPreview(session.preview(e.clientX));
    };
    const cleanup = () => {
      captureEl.removeEventListener('pointermove', onMove as EventListener);
      captureEl.removeEventListener('pointerup', onUp as EventListener);
      captureEl.removeEventListener('pointercancel', onCancel);
    };
    const onUp = (e: PointerEvent) => {
      cleanup();
      if (this.session !== session) return;
      const result = session.finish(e.clientX);
      this.lastDragMoved = !!result;
      this.reset();
      if (result?.kind === 'drag') this.onTaskDragged?.(result.event);
      else if (result?.kind === 'resize') this.onTaskResized?.(result.event);
    };
    const onCancel = () => {
      cleanup();
      this.cancel();
    };

    captureEl.addEventListener('pointermove', onMove as EventListener, { passive: true });
    captureEl.addEventListener('pointerup', onUp as EventListener);
    captureEl.addEventListener('pointercancel', onCancel);
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

  /** Abort the active drag without emitting (e.g. pointercancel, Escape). */
  cancel(): void {
    this.lastDragMoved = false;
    this.reset();
  }
}
