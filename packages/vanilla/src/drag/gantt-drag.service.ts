/**
 * @file gantt-drag.service.ts
 * Vanilla JS Drag and Drop & Resize Service using DOM Pointer Events.
 */

import { RowGeometry, TaskDragEvent, TaskResizeEvent, addDays, diffDays } from '@gantry/core';
import { createState } from '../core/state';

const daysBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 86_400_000;

export type DragState =
  | { kind: 'idle' }
  | { kind: 'dragging'; taskId: string; startX: number; origStart: Date; origEnd: Date }
  | { kind: 'resizing-left'; taskId: string; startX: number; origStart: Date; origEnd: Date }
  | { kind: 'resizing-right'; taskId: string; startX: number; origStart: Date; origEnd: Date };

export interface DragPreview {
  taskId: string;
  x: number;
  width: number;
  y: number;
  height: number;
  daysDelta: number;
}

export class GanttDragService {
  readonly state = createState<DragState>({ kind: 'idle' });
  readonly preview = createState<DragPreview | null>(null);

  private _pxPerDay = 8;
  private _origin = new Date();
  private _rowHeight = 36;

  onTaskDragged?: (e: TaskDragEvent) => void;
  onTaskResized?: (e: TaskResizeEvent) => void;

  /** Whether the last finished drag actually moved the bar (used to suppress the trailing click). */
  lastDragMoved = false;

  configure(cfg: { pxPerDay: number; origin: Date; rowHeight: number }): void {
    this._pxPerDay = cfg.pxPerDay;
    this._origin = cfg.origin;
    this._rowHeight = cfg.rowHeight;
  }

  startDrag(
    event: PointerEvent,
    geo: RowGeometry,
    handle: 'bar' | 'left' | 'right',
    captureEl: SVGElement | HTMLElement
  ): void {
    if (this.state().kind !== 'idle') return;

    event.preventDefault();
    event.stopPropagation();

    const task = geo.row.task;
    const kind = handle === 'left' ? 'resizing-left' : handle === 'right' ? 'resizing-right' : 'dragging';

    try { captureEl.setPointerCapture(event.pointerId); } catch { /* synthetic event */ }

    this.state.set({
      kind,
      taskId: task.id,
      startX: event.clientX,
      origStart: task.start,
      origEnd: task.end,
    });

    this.updatePreview(event.clientX, geo);

    const onMove = (e: PointerEvent) => this.updatePreview(e.clientX, geo);
    const cleanup = () => {
      captureEl.removeEventListener('pointermove', onMove as EventListener);
      captureEl.removeEventListener('pointerup', onUp as EventListener);
      captureEl.removeEventListener('pointercancel', onCancel);
    };
    const onUp = (e: PointerEvent) => {
      cleanup();
      this.finishDrag(e.clientX);
    };
    const onCancel = () => {
      cleanup();
      this.cancel();
    };

    captureEl.addEventListener('pointermove', onMove as EventListener, { passive: true });
    captureEl.addEventListener('pointerup', onUp as EventListener);
    captureEl.addEventListener('pointercancel', onCancel);
  }

  /** New [start, end] for the active drag after `days` of movement. */
  private rangeFor(s: Exclude<DragState, { kind: 'idle' }>, days: number): [Date, Date] {
    switch (s.kind) {
      case 'dragging':
        return [addDays(s.origStart, days), addDays(s.origEnd, days)];
      case 'resizing-left': {
        // keep at least one day: start can't pass end
        const maxDays = diffDays(s.origStart, s.origEnd) - 1;
        return [addDays(s.origStart, Math.min(days, maxDays)), s.origEnd];
      }
      case 'resizing-right': {
        const minDays = 1 - diffDays(s.origStart, s.origEnd);
        return [s.origStart, addDays(s.origEnd, Math.max(days, minDays))];
      }
    }
  }

  private updatePreview(currentX: number, geo: RowGeometry): void {
    const s = this.state();
    if (s.kind === 'idle') return;

    const daysDelta = Math.round((currentX - s.startX) / this._pxPerDay);
    const [newStart, newEnd] = this.rangeFor(s, daysDelta);
    const x = Math.round(daysBetween(this._origin, newStart) * this._pxPerDay);
    const width = Math.max(Math.round(daysBetween(newStart, newEnd) * this._pxPerDay), 4);

    const prev = this.preview();
    if (prev && prev.x === x && prev.width === width) return;
    this.preview.set({ taskId: s.taskId, x, width, y: geo.y, height: geo.height, daysDelta });
  }

  /** Abort the active drag without emitting (e.g. pointercancel, Escape). */
  cancel(): void {
    this.lastDragMoved = false;
    this.state.set({ kind: 'idle' });
    this.preview.set(null);
  }

  private finishDrag(currentX: number): void {
    const s = this.state();
    if (s.kind === 'idle') return;

    const daysDelta = Math.round((currentX - s.startX) / this._pxPerDay);
    const [newStart, newEnd] = this.rangeFor(s, daysDelta);
    this.lastDragMoved = daysDelta !== 0;

    if (daysDelta !== 0) {
      if (s.kind === 'dragging') {
        this.onTaskDragged?.({
          taskId: s.taskId,
          oldStart: s.origStart,
          oldEnd: s.origEnd,
          newStart,
          newEnd,
          daysMoved: daysDelta,
        });
      } else {
        this.onTaskResized?.({
          taskId: s.taskId,
          handle: s.kind === 'resizing-left' ? 'left' : 'right',
          oldStart: s.origStart,
          oldEnd: s.origEnd,
          newStart,
          newEnd,
          daysDelta: diffDays(s.origStart, newStart) || diffDays(s.origEnd, newEnd),
        });
      }
    }

    this.state.set({ kind: 'idle' });
    this.preview.set(null);
  }
}
