// ─────────────────────────────────────────────────────────────
//  gantry · render/drag.ts
//  Framework-free drag / resize session: snapping, minimum length,
//  preview geometry and the resulting event. Bindings only wire
//  pointer events to it.
// ─────────────────────────────────────────────────────────────

import type { TaskDragEvent, TaskResizeEvent } from '../types';
import { addDays } from '../gantt-math';

export type DragHandle = 'bar' | 'left' | 'right';

export interface DragTiming {
  pxPerDay: number;
  toX: (d: Date) => number;
  /** Start/end as drawn (date-only normalisation, inclusive ends) */
  span: (start: Date, end: Date) => { start: Date; end: Date };
  /** Snap to whole days, or whole hours on hour scales */
  snap: 'day' | 'hour';
}

export interface DragPreview {
  taskId: string;
  x: number;
  width: number;
  y: number;
  height: number;
  /** Movement in snap units (days, or hours on hour scales) */
  daysDelta: number;
}

export type DragResult = { kind: 'drag'; event: TaskDragEvent } | { kind: 'resize'; event: TaskResizeEvent } | null;

const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);

export class DragSession {
  constructor(
    readonly taskId: string,
    readonly handle: DragHandle,
    private readonly origStart: Date,
    private readonly origEnd: Date,
    private readonly startX: number,
    private readonly row: { y: number; height: number },
    private readonly timing: DragTiming,
  ) {}

  private get pxPerUnit(): number {
    return this.timing.snap === 'hour' ? this.timing.pxPerDay / 24 : this.timing.pxPerDay;
  }

  private shift(d: Date, units: number): Date {
    return this.timing.snap === 'hour' ? addHours(d, units) : addDays(d, units);
  }

  private longEnough(start: Date, end: Date): boolean {
    const span = this.timing.span(start, end);
    return this.timing.toX(span.end) - this.timing.toX(span.start) >= this.pxPerUnit - 0.5;
  }

  /** New task dates (not drawn dates) and the units actually applied. */
  private rangeAt(clientX: number): [Date, Date, number] {
    const units = Math.round((clientX - this.startX) / this.pxPerUnit);
    switch (this.handle) {
      case 'bar':
        return [this.shift(this.origStart, units), this.shift(this.origEnd, units), units];
      case 'left': {
        // Keep at least one unit: the drawn start can't reach the drawn end
        let u = units;
        while (u > 0 && !this.longEnough(this.shift(this.origStart, u), this.origEnd)) u--;
        return [this.shift(this.origStart, u), this.origEnd, u];
      }
      case 'right': {
        let u = units;
        while (u < 0 && !this.longEnough(this.origStart, this.shift(this.origEnd, u))) u++;
        return [this.origStart, this.shift(this.origEnd, u), u];
      }
    }
  }

  preview(clientX: number): DragPreview {
    const [start, end, units] = this.rangeAt(clientX);
    const span = this.timing.span(start, end);
    const x = this.timing.toX(span.start);
    return {
      taskId: this.taskId,
      x,
      width: Math.max(this.timing.toX(span.end) - x, 4),
      y: this.row.y,
      height: this.row.height,
      daysDelta: units,
    };
  }

  /** The event to emit on release (null when nothing moved). */
  finish(clientX: number): DragResult {
    const [newStart, newEnd, units] = this.rangeAt(clientX);
    if (newStart.getTime() === this.origStart.getTime() && newEnd.getTime() === this.origEnd.getTime()) return null;
    const days = this.timing.snap === 'hour' ? units / 24 : units;
    const base = { taskId: this.taskId, oldStart: this.origStart, oldEnd: this.origEnd, newStart, newEnd };
    return this.handle === 'bar'
      ? { kind: 'drag', event: { ...base, daysMoved: days } }
      : { kind: 'resize', event: { ...base, handle: this.handle, daysDelta: days } };
  }
}
