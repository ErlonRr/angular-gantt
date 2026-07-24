// ─────────────────────────────────────────────────────────────
//  gantry · drag/gantt-drag.service.ts
//
//  Handles task bar drag (move) and resize (left/right handle).
//
//  FSM via linkedSignal:
//
//    idle  ──pointerdown──►  dragging
//          ──pointerdown──►  resizing-left
//          ──pointerdown──►  resizing-right
//
//    dragging / resizing-* ──pointermove──► (update preview)
//                          ──pointerup────► emit event → idle
//                          ──pointercancel─► discard    → idle
//
//  The preview is a separate GanttTask copy — the real task
//  is never mutated until pointerup. This gives a "ghost"
//  drag effect without touching the layout pipeline.
//
//  setPointerCapture() on pointerdown ensures pointermove
//  fires even if the pointer leaves the SVG element.
//
//  All event listeners live on `document` (via the canvas
//  element's captured pointer) — no global document listeners
//  that need manual cleanup.
// ─────────────────────────────────────────────────────────────

import {
  Injectable,
  signal,
  computed,
  linkedSignal,
  output,
  DestroyRef,
  inject,
  NgZone,
  OutputEmitterRef,
} from '@angular/core';

import {
  GanttTask,
  GanttFlatRow,
  RowGeometry,
  TaskDragEvent,
  TaskResizeEvent,
} from '../types';

import { addDays, diffDays, snapToDay, clamp } from '../gantt-math';

// ─── FSM state ────────────────────────────────────────────────

export type DragState =
  | { kind: 'idle' }
  | { kind: 'dragging';       taskId: string; startX: number; origStart: Date; origEnd: Date }
  | { kind: 'resizing-left';  taskId: string; startX: number; origStart: Date; origEnd: Date }
  | { kind: 'resizing-right'; taskId: string; startX: number; origStart: Date; origEnd: Date };

// ─── Preview overlay geometry ─────────────────────────────────

export interface DragPreview {
  taskId:   string;
  x:        number;
  width:    number;
  y:        number;
  height:   number;
  /** days moved from original position */
  daysDelta: number;
}

// ─── Service ─────────────────────────────────────────────────

@Injectable()
export class GanttDragService {

  private readonly zone       = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  // ── FSM state ──────────────────────────────────────────────
  readonly state = signal<DragState>({ kind: 'idle' });

  /** Preview geometry while dragging/resizing (null when idle) */
  readonly preview = signal<DragPreview | null>(null);

  readonly isDragging  = computed(() => this.state().kind === 'dragging');
  readonly isResizing  = computed(() =>
    this.state().kind === 'resizing-left' ||
    this.state().kind === 'resizing-right'
  );
  readonly isActive    = computed(() => this.state().kind !== 'idle');
  readonly activeTaskId = computed(() => {
    const s = this.state();
    return s.kind !== 'idle' ? s.taskId : null;
  });

  // ── Config (set by GantryComponent) ─────────────────────
  private _pxPerDay  = 8;
  private _origin    = new Date();
  private _rowHeight = 36;
  private _minDur    = 1;   // minimum task duration in days
  private _snapDays  = 1;   // snap granularity (1 = snap to day)

  configure(cfg: {
    pxPerDay:  number;
    origin:    Date;
    rowHeight: number;
    minDur?:   number;
    snapDays?: number;
  }): void {
    this._pxPerDay  = cfg.pxPerDay;
    this._origin    = cfg.origin;
    this._rowHeight = cfg.rowHeight;
    this._minDur    = cfg.minDur  ?? 1;
    this._snapDays  = cfg.snapDays ?? 1;
  }

  // ── Event outputs (wired by GantryComponent) ─────────────
  // These are plain signal-output refs set from the outside.
  // We keep them as optional callbacks to avoid coupling.
  onTaskDragged?:  (e: TaskDragEvent)  => void;
  onTaskResized?:  (e: TaskResizeEvent) => void;

  // ── Entry points (called by GanttCanvasComponent) ─────────

  startDrag(
    event: PointerEvent,
    geo: RowGeometry,
    handle: 'bar' | 'left' | 'right',
    captureEl: SVGElement | HTMLElement,
  ): void {
    if (this.isActive()) return;

    event.preventDefault();
    event.stopPropagation();

    const task = geo.row.task;
    const kind =
      handle === 'left'  ? 'resizing-left'  :
      handle === 'right' ? 'resizing-right' :
      'dragging';

    // Capture pointer so pointermove fires outside the element
    captureEl.setPointerCapture(event.pointerId);

    this.state.set({
      kind,
      taskId:    task.id,
      startX:    event.clientX,
      origStart: task.start,
      origEnd:   task.end,
    });

    this._updatePreview(event.clientX, geo);

    // Attach move/up handlers to the capturing element
    const onMove: EventListener   = (e) => this._onMove(e as PointerEvent, geo);
    const onUp: EventListener     = (e) => this._onUp(e as PointerEvent, geo, captureEl, onMove, onUp, onCancel);
    const onCancel: EventListener = ()  => this._onCancel(captureEl, onMove, onUp, onCancel);

    this.zone.runOutsideAngular(() => {
      captureEl.addEventListener('pointermove', onMove, { passive: true });
      captureEl.addEventListener('pointerup',   onUp);
      captureEl.addEventListener('pointercancel', onCancel);
    });
  }

  // ── Private FSM handlers ───────────────────────────────────

  private _onMove(event: PointerEvent, geo: RowGeometry): void {
    this.zone.run(() => this._updatePreview(event.clientX, geo));
  }

  private _onUp(
    event:     PointerEvent,
    geo:       RowGeometry,
    captureEl: SVGElement | HTMLElement,
    onMove:    EventListener,
    onUp:      EventListener,
    onCancel:  EventListener,
  ): void {
    this._removeListeners(captureEl, onMove, onUp, onCancel);

    const s = this.state();
    if (s.kind === 'idle') return;

    const { newStart, newEnd, daysDelta } =
      this._computeNewDates(event.clientX, s);

    this.zone.run(() => {
      if (s.kind === 'dragging' && daysDelta !== 0) {
        this.onTaskDragged?.({
          taskId:    s.taskId,
          oldStart:  s.origStart,
          oldEnd:    s.origEnd,
          newStart,
          newEnd,
          daysMoved: daysDelta,
        });
      } else if (s.kind === 'resizing-left' || s.kind === 'resizing-right') {
        const daysDelta2 = s.kind === 'resizing-left'
          ? diffDays(newStart, s.origStart) * -1
          : diffDays(s.origEnd, newEnd);

        if (daysDelta2 !== 0) {
          this.onTaskResized?.({
            taskId:    s.taskId,
            handle:    s.kind === 'resizing-left' ? 'left' : 'right',
            oldStart:  s.origStart,
            oldEnd:    s.origEnd,
            newStart,
            newEnd,
            daysDelta: daysDelta2,
          });
        }
      }

      this._reset();
    });
  }

  private _onCancel(
    captureEl: SVGElement | HTMLElement,
    onMove:    EventListener,
    onUp:      EventListener,
    onCancel:  EventListener,
  ): void {
    this._removeListeners(captureEl, onMove, onUp, onCancel);
    this.zone.run(() => this._reset());
  }

  // ── Preview calculation ────────────────────────────────────

  private _updatePreview(currentX: number, geo: RowGeometry): void {
    const s = this.state();
    if (s.kind === 'idle') return;

    const { newStart, newEnd, daysDelta } = this._computeNewDates(currentX, s);
    const pxPerDay = this._pxPerDay;
    const origin   = this._origin;

    const diffStart = (newStart.getTime() - origin.getTime()) / 86_400_000;
    const diffEnd   = (newEnd.getTime()   - origin.getTime()) / 86_400_000;

    const x     = Math.round(diffStart * pxPerDay);
    const width = Math.max(Math.round((diffEnd - diffStart) * pxPerDay), 4);

    this.preview.set({
      taskId:    s.taskId,
      x,
      width,
      y:         geo.y,
      height:    geo.height,
      daysDelta,
    });
  }

  private _computeNewDates(
    currentX: number,
    s: Exclude<DragState, { kind: 'idle' }>,
  ): { newStart: Date; newEnd: Date; daysDelta: number } {
    const deltaPx   = currentX - s.startX;
    const rawDays   = deltaPx / this._pxPerDay;
    const snapped   = Math.round(rawDays / this._snapDays) * this._snapDays;

    const dur = diffDays(s.origStart, s.origEnd);

    let newStart = s.origStart;
    let newEnd   = s.origEnd;
    let daysDelta = snapped;

    switch (s.kind) {
      case 'dragging':
        newStart  = addDays(s.origStart, snapped);
        newEnd    = addDays(s.origEnd,   snapped);
        break;

      case 'resizing-left': {
        newStart = addDays(s.origStart, snapped);
        // Enforce minimum duration
        const maxLeftShift = dur - this._minDur;
        if (snapped > maxLeftShift) newStart = addDays(s.origStart, maxLeftShift);
        newEnd   = s.origEnd;
        daysDelta = diffDays(s.origStart, newStart) * -1;
        break;
      }

      case 'resizing-right': {
        newEnd = addDays(s.origEnd, snapped);
        // Enforce minimum duration
        if (diffDays(newStart, newEnd) < this._minDur) {
          newEnd = addDays(newStart, this._minDur);
        }
        daysDelta = diffDays(s.origEnd, newEnd);
        break;
      }
    }

    return { newStart, newEnd, daysDelta };
  }

  // ── Cleanup ────────────────────────────────────────────────

  private _reset(): void {
    this.state.set({ kind: 'idle' });
    this.preview.set(null);
  }

  private _removeListeners(
    el:       SVGElement | HTMLElement,
    onMove:   EventListener,
    onUp:     EventListener,
    onCancel: EventListener,
  ): void {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup',   onUp);
    el.removeEventListener('pointercancel', onCancel);
    try { (el as HTMLElement).releasePointerCapture(0); } catch {}
  }
}
