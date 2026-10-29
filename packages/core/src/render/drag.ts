// ─────────────────────────────────────────────────────────────
//  gantry · render/drag.ts
//  Framework-free drag / resize session: snapping, minimum length,
//  preview geometry and the resulting event. Bindings only wire
//  pointer events to it.
// ─────────────────────────────────────────────────────────────

import type { TaskDragEvent, TaskResizeEvent } from '../types';
import type { DateReading, ResolvedCalendar, ResolvedGanttConfig } from './config';
import { editCalendar, type EditCalendar } from '../calendar/edit';
import { longEnough, pxPerUnit, shiftAmount, shiftBy, stepEdge } from './drag-steps';
import { bottomScale } from './scales';
import { taskSpan, type TimelineModel } from './timeline';

/** What a `DragSession` drags: the whole bar (move) or one of its resize handles. */
export type DragHandle = 'bar' | 'left' | 'right';

export interface DragTiming {
  pxPerDay: number;
  toX: (d: Date) => number;
  /** Start/end as drawn (date-only normalisation, inclusive ends) */
  span: (start: Date, end: Date) => { start: Date; end: Date };
  /** Snap to whole days, or whole hours on hour scales */
  snap: 'day' | 'hour';
  /** How task dates are read and measured (the chart config): set by `editTiming` */
  dates?: DateReading | undefined;
  /** Working-calendar editing (`editCalendar`); `null` / unset: calendar-time editing */
  calendar?: EditCalendar | null | undefined;
}

export interface DragPreview {
  taskId: string;
  x: number;
  width: number;
  y: number;
  height: number;
  /** Movement in snap units (`unit`): days, or hours on hour scales */
  delta: number;
  unit: 'day' | 'hour';
  /** @deprecated Use `delta` (with `unit`) — it counts hours on hour scales. */
  daysDelta: number;
  /**
   * New task start: a task date, not a drawn one (what the drop / commit would emit as
   * `newStart`). Always set by `DragSession` and `KeyboardEditSession`; the drag readout
   * (`formatDragReadout`) reads it.
   */
  start?: Date | undefined;
  /** New task end, like `start` (an inclusive end stays inclusive) */
  end?: Date | undefined;
}

export type DragResult = { kind: 'drag'; event: TaskDragEvent } | { kind: 'resize'; event: TaskResizeEvent } | null;

/**
 * The timing of a drag or keyboard edit that starts now (`DragSession`, `KeyboardEditSession`):
 * the scale of `timeline` (`pxPerDay`, `toX`), the span of task dates as drawn (`taskSpan`:
 * date-only normalisation, inclusive ends) and the snap unit — whole hours on hour scales (the
 * bottom tier's unit), whole days otherwise. With a working calendar (`cfg.calendar`) it also
 * carries how task dates are read (`dates`) and the editing rules (`calendar`, `editCalendar`):
 * edits then skip non-working time and keep the working length. Both bindings build their
 * sessions with it.
 */
export function editTiming(
  timeline: Pick<TimelineModel, 'pxPerDay' | 'toX'>,
  cfg: Pick<ResolvedGanttConfig, 'scales' | 'endDateMode' | 'normalizeDateOnly'> & {
    calendar?: ResolvedCalendar | null | undefined;
  },
): DragTiming {
  const snap = bottomScale(cfg.scales).unit === 'hour' ? 'hour' : 'day';
  const dates: DateReading = {
    endDateMode: cfg.endDateMode,
    normalizeDateOnly: cfg.normalizeDateOnly,
    calendar: cfg.calendar ?? null,
  };
  return {
    pxPerDay: timeline.pxPerDay,
    toX: timeline.toX,
    span: (start, end) => taskSpan({ start, end }, cfg),
    snap,
    dates,
    calendar: editCalendar(dates, snap),
  };
}

/** The task edge a resize handle moves: `'left'` → `'start'`, `'right'` → `'end'` (`TaskResizeEvent.edge`). */
export function resizeEdge(handle: 'left' | 'right'): 'start' | 'end' {
  return handle === 'left' ? 'start' : 'end';
}

export class DragSession {
  readonly taskId: string;
  readonly handle: DragHandle;
  private readonly origStart: Date;
  private readonly origEnd: Date;
  private readonly startX: number;
  private readonly row: { y: number; height: number };
  private readonly timing: DragTiming;

  constructor(
    taskId: string,
    handle: DragHandle,
    origStart: Date,
    origEnd: Date,
    startX: number,
    row: { y: number; height: number },
    timing: DragTiming,
  ) {
    this.taskId = taskId;
    this.handle = handle;
    this.origStart = origStart;
    this.origEnd = origEnd;
    this.startX = startX;
    this.row = row;
    this.timing = timing;
  }

  /** The start moved by `units` snap units: shifted (and snapped past non-working time under a calendar). */
  private startAt(units: number): Date {
    return stepEdge(this.timing, 'start', this.origStart, units, 'pointer');
  }

  private endAt(units: number): Date {
    return stepEdge(this.timing, 'end', this.origEnd, units, 'pointer');
  }

  /** New task dates (not drawn dates) and the units actually applied. */
  private rangeAt(clientX: number): [Date, Date, number] {
    const units = Math.round((clientX - this.startX) / pxPerUnit(this.timing));
    switch (this.handle) {
      case 'bar': {
        const cal = this.timing.calendar;
        if (!cal)
          return [shiftBy(this.timing, this.origStart, units), shiftBy(this.timing, this.origEnd, units), units];
        // The end follows the snapped start; a start that stays put leaves the task as it was
        const start = this.startAt(units);
        const unmoved = start.getTime() === this.origStart.getTime();
        return [start, unmoved ? this.origEnd : cal.follow(this.origStart, this.origEnd, start), units];
      }
      case 'left': {
        // Keep at least one unit: the drawn start can't reach the drawn end
        let u = units;
        while (u > 0 && !longEnough(this.timing, this.startAt(u), this.origEnd)) u--;
        return [this.startAt(u), this.origEnd, u];
      }
      case 'right': {
        let u = units;
        while (u < 0 && !longEnough(this.timing, this.origStart, this.endAt(u))) u++;
        return [this.origStart, this.endAt(u), u];
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
      delta: units,
      unit: this.timing.snap,
      daysDelta: units,
      start,
      end,
    };
  }

  /** The event to emit on release (null when nothing moved). */
  finish(clientX: number): DragResult {
    const [newStart, newEnd, units] = this.rangeAt(clientX);
    if (newStart.getTime() === this.origStart.getTime() && newEnd.getTime() === this.origEnd.getTime()) return null;
    // Without a calendar the amount counts the pointer's snap units; with one it is the edge's
    // real calendar shift (a working move over a weekend is 3 days, not 1)
    const [from, to]: [Date, Date] = this.handle === 'right' ? [this.origEnd, newEnd] : [this.origStart, newStart];
    const days = shiftAmount(this.timing, units, from, to);
    const base = { taskId: this.taskId, oldStart: this.origStart, oldEnd: this.origEnd, newStart, newEnd };
    return this.handle === 'bar'
      ? { kind: 'drag', event: { ...base, daysMoved: days } }
      : { kind: 'resize', event: { ...base, edge: resizeEdge(this.handle), handle: this.handle, daysDelta: days } };
  }
}
