/**
 * @file gantt-drag.service.ts
 * Vanilla JS Drag and Drop & Resize Service using DOM Pointer Events.
 */

import { RowGeometry, TaskDragEvent, TaskResizeEvent } from '@gantry/core';
import { createState } from '../core/state';
import { addDays, diffDays } from '@gantry/core';

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

    captureEl.setPointerCapture(event.pointerId);

    this.state.set({
      kind,
      taskId: task.id,
      startX: event.clientX,
      origStart: task.start,
      origEnd: task.end,
    });

    this.updatePreview(event.clientX, geo);

    const onMove = (e: PointerEvent) => this.updatePreview(e.clientX, geo);
    const onUp = (e: PointerEvent) => {
      captureEl.removeEventListener('pointermove', onMove as EventListener);
      captureEl.removeEventListener('pointerup', onUp as EventListener);
      this.finishDrag(e.clientX);
    };

    captureEl.addEventListener('pointermove', onMove as EventListener, { passive: true });
    captureEl.addEventListener('pointerup', onUp as EventListener);
  }

  private updatePreview(currentX: number, geo: RowGeometry): void {
    const s = this.state();
    if (s.kind === 'idle') return;

    const deltaPx = currentX - s.startX;
    const snappedDays = Math.round(deltaPx / this._pxPerDay);

    const newStart = addDays(s.origStart, snappedDays);
    const newEnd = addDays(s.origEnd, snappedDays);

    const diffStart = (newStart.getTime() - this._origin.getTime()) / 86_400_000;
    const diffEnd = (newEnd.getTime() - this._origin.getTime()) / 86_400_000;

    const x = Math.round(diffStart * this._pxPerDay);
    const width = Math.max(Math.round((diffEnd - diffStart) * this._pxPerDay), 4);

    this.preview.set({
      taskId: s.taskId,
      x,
      width,
      y: geo.y,
      height: geo.height,
      daysDelta: snappedDays,
    });
  }

  private finishDrag(currentX: number): void {
    const s = this.state();
    if (s.kind === 'idle') return;

    const deltaPx = currentX - s.startX;
    const daysDelta = Math.round(deltaPx / this._pxPerDay);

    if (daysDelta !== 0) {
      if (s.kind === 'dragging') {
        this.onTaskDragged?.({
          taskId: s.taskId,
          oldStart: s.origStart,
          oldEnd: s.origEnd,
          newStart: addDays(s.origStart, daysDelta),
          newEnd: addDays(s.origEnd, daysDelta),
          daysMoved: daysDelta,
        });
      } else {
        this.onTaskResized?.({
          taskId: s.taskId,
          handle: s.kind === 'resizing-left' ? 'left' : 'right',
          oldStart: s.origStart,
          oldEnd: s.origEnd,
          newStart: s.kind === 'resizing-left' ? addDays(s.origStart, daysDelta) : s.origStart,
          newEnd: s.kind === 'resizing-right' ? addDays(s.origEnd, daysDelta) : s.origEnd,
          daysDelta,
        });
      }
    }

    this.state.set({ kind: 'idle' });
    this.preview.set(null);
  }
}
