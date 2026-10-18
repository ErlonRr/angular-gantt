// ─────────────────────────────────────────────────────────────
//  gantry · drag/gantt-drag.service.ts
//
//  Task bar drag (move) and resize (left/right handle).
//
//    idle  ──pointerdown──►  dragging | resizing-left | resizing-right
//          ──pointermove──►  preview (ghost bar)
//          ──pointerup────►  emit event → idle
//          ──pointercancel─► discard    → idle
//
//  Snapping, minimum length and the resulting dates come from the
//  framework-free `DragSession` in @gantryjs/core (shared with the Web
//  Component). setPointerCapture() keeps pointermove flowing outside
//  the SVG. The real task is never mutated until pointerup.
// ─────────────────────────────────────────────────────────────

import { Injectable, signal, computed } from '@angular/core';
import { type RowGeometry, type TaskDragEvent, type TaskResizeEvent } from '../types';
import { DragSession, type DragTiming, type DragPreview } from '@gantryjs/core';

export type { DragPreview };

export type DragState = { kind: 'idle' } | { kind: 'dragging' | 'resizing-left' | 'resizing-right'; taskId: string };

@Injectable()
export class GanttDragService {
  // ── FSM state ──────────────────────────────────────────────
  readonly state = signal<DragState>({ kind: 'idle' });

  /** Preview geometry while dragging/resizing (null when idle) */
  readonly preview = signal<DragPreview | null>(null);

  readonly isDragging = computed(() => this.state().kind === 'dragging');
  readonly isResizing = computed(() => this.state().kind === 'resizing-left' || this.state().kind === 'resizing-right');
  readonly isActive = computed(() => this.state().kind !== 'idle');
  readonly activeTaskId = computed(() => {
    const s = this.state();
    return s.kind !== 'idle' ? s.taskId : null;
  });

  private timing: DragTiming = { pxPerDay: 8, toX: () => 0, span: (start, end) => ({ start, end }), snap: 'day' };
  private session: DragSession | null = null;

  onTaskDragged?: (e: TaskDragEvent) => void;
  onTaskResized?: (e: TaskResizeEvent) => void;

  /** Whether the last finished drag moved the bar (to swallow the trailing click). */
  lastDragMoved = false;

  configure(timing: DragTiming): void {
    this.timing = timing;
  }

  startDrag(
    event: PointerEvent,
    geo: RowGeometry,
    handle: 'bar' | 'left' | 'right',
    captureEl: SVGElement | HTMLElement,
  ): void {
    if (this.session) return;
    event.preventDefault();
    event.stopPropagation();

    const task = geo.row.task;
    const session = new DragSession(
      task.id,
      handle,
      task.start,
      task.end ?? task.start,
      event.clientX,
      geo,
      this.timing,
    );
    this.session = session;
    try {
      captureEl.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic event */
    }

    this.state.set({
      kind: handle === 'left' ? 'resizing-left' : handle === 'right' ? 'resizing-right' : 'dragging',
      taskId: task.id,
    });
    this.preview.set(session.preview(event.clientX));

    const onMove = (e: Event) => {
      if (this.session !== session) return;
      const p = session.preview((e as PointerEvent).clientX);
      const prev = this.preview();
      if (!prev || prev.x !== p.x || prev.width !== p.width) this.preview.set(p);
    };
    const cleanup = () => {
      captureEl.removeEventListener('pointermove', onMove);
      captureEl.removeEventListener('pointerup', onUp);
      captureEl.removeEventListener('pointercancel', onCancel);
    };
    const onUp = (e: Event) => {
      cleanup();
      if (this.session !== session) return;
      const result = session.finish((e as PointerEvent).clientX);
      this.lastDragMoved = !!result;
      this.reset();
      if (result?.kind === 'drag') this.onTaskDragged?.(result.event);
      else if (result?.kind === 'resize') this.onTaskResized?.(result.event);
    };
    const onCancel = () => {
      cleanup();
      this.cancel();
    };

    captureEl.addEventListener('pointermove', onMove, { passive: true });
    captureEl.addEventListener('pointerup', onUp);
    captureEl.addEventListener('pointercancel', onCancel);
  }

  /** Abort the active drag without emitting (pointercancel, Escape). */
  cancel(): void {
    this.lastDragMoved = false;
    this.reset();
  }

  private reset(): void {
    this.session = null;
    this.state.set({ kind: 'idle' });
    this.preview.set(null);
  }
}
