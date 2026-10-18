// ─────────────────────────────────────────────────────────────
//  gantry · interaction/keyboard-edit.ts
//  Keyboard counterpart of `DragSession`: move / resize a bar and
//  change its progress with keys, with the same snapping (whole
//  days, or hours on hour scales), the same minimum length and the
//  same `TaskDragEvent` / `TaskResizeEvent` shapes on commit.
//
//    ArrowLeft / ArrowRight          move one unit earlier / later
//    Shift + ArrowLeft / ArrowRight  resize the end
//    Alt + ArrowLeft / ArrowRight    resize the start
//    ArrowUp / ArrowDown             progress ± progressStep (default 5)
//    Enter / F2                      commit · Escape cancel
//
//  In RTL time runs right to left, so ArrowLeft is "later".
// ─────────────────────────────────────────────────────────────

import { addDays } from '../gantt-math';
import type { DragPreview, DragResult, DragTiming } from '../render/drag';
import type { TaskDragEvent, TaskResizeEvent } from '../types';
import { logicalArrow, type KeyLike } from './keymap';

export type KeyboardEditMode = 'move' | 'resizeStart' | 'resizeEnd' | 'progress';

/** One step: `delta` snap units for dates, or `delta` progress steps for `progress`. */
export interface KeyboardEditStep {
  mode: KeyboardEditMode;
  delta: number;
}

export type KeyboardEditAction = KeyboardEditStep | 'commit' | 'cancel';

/** Progress changed with the keyboard (no such event exists for pointer drags yet). */
export interface TaskProgressEvent {
  taskId: string;
  oldProgress: number;
  newProgress: number;
}

/** What a commit emits: the drag / resize result shapes of `DragSession`, plus progress. */
export type KeyboardEditEvent = Exclude<DragResult, null> | { kind: 'progress'; event: TaskProgressEvent };

export interface KeyboardEditTask {
  id: string;
  start: Date;
  end?: Date | undefined;
  progress?: number | undefined;
}

/**
 * What the keyboard may change. Bindings pass the same rules as the pointer handles
 * (core `computeBarVisual`), using the bar kind rather than `visual.handles` (the width
 * threshold for handles is a pointer concern):
 *
 *   movable:          cfg.enableDrag && task.draggable !== false
 *   resizable:        movable && cfg.enableResize && visual.kind === 'task'
 *   progressEditable: visual.kind !== 'milestone'
 */
export interface KeyboardEditOptions {
  /** Progress change per ArrowUp / ArrowDown. Default 5. */
  progressStep?: number | undefined;
  /** Dates can be moved. Default `true` (pass `false` for `draggable: false` rows or when drag is off). */
  movable?: boolean | undefined;
  /**
   * Start / end can be resized. Default `true`; always `false` when `movable` is `false`
   * (resizing never emits a drag for a task that must not be dragged).
   */
  resizable?: boolean | undefined;
  /** Progress can be changed. Default `true`. */
  progressEditable?: boolean | undefined;
}

export interface KeyboardEditState {
  start: Date;
  end: Date;
  progress: number;
  /** Start / end offset from the original dates, in snap units */
  startUnits: number;
  endUnits: number;
  /** Something differs from the original task */
  changed: boolean;
}

/** A drag preview plus the edited progress, so a painter re-renders from one value. */
export interface KeyboardEditPreview extends DragPreview {
  /** Progress being edited (0–100) */
  progress: number;
  /** Something differs from the original task */
  changed: boolean;
}

export type KeyboardEditKeyResult =
  | { type: 'step'; changed: boolean; preview: KeyboardEditPreview }
  | { type: 'commit'; events: KeyboardEditEvent[] }
  | { type: 'cancel' };

export const DEFAULT_PROGRESS_STEP = 5;

const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);

/** The edit step for a key while a bar is in keyboard-edit mode, or `null` (key not used). */
export function keyboardEditAction(
  event: KeyLike,
  options: { rtl?: boolean | undefined } = {},
): KeyboardEditAction | null {
  const mod = !!(event.ctrlKey || event.metaKey);
  const shift = !!event.shiftKey;
  const alt = !!event.altKey;
  if (event.key === 'Escape') return 'cancel';
  if (mod) return null;
  if ((event.key === 'Enter' || event.key === 'F2') && !shift && !alt) return 'commit';

  const dir = logicalArrow(event.key, options.rtl ?? false);
  if (dir) {
    const delta = dir === 'right' ? 1 : -1;
    if (shift && alt) return null;
    return { mode: shift ? 'resizeEnd' : alt ? 'resizeStart' : 'move', delta };
  }
  if (shift || alt) return null;
  if (event.key === 'ArrowUp') return { mode: 'progress', delta: 1 };
  if (event.key === 'ArrowDown') return { mode: 'progress', delta: -1 };
  return null;
}

export class KeyboardEditSession {
  readonly taskId: string;
  private readonly origStart: Date;
  private readonly origEnd: Date;
  private readonly origProgress: number;
  private readonly row: { y: number; height: number };
  private readonly timing: DragTiming;
  private readonly progressStep: number;
  private readonly movable: boolean;
  private readonly resizable: boolean;
  private readonly progressEditable: boolean;

  private startUnits = 0;
  private endUnits = 0;
  private progress: number;
  /** Last successful date step: decides which edge `preview().delta` reports */
  private lastMode: Exclude<KeyboardEditMode, 'progress'> = 'move';
  private done = false;

  constructor(
    task: KeyboardEditTask,
    row: { y: number; height: number },
    timing: DragTiming,
    options: KeyboardEditOptions = {},
  ) {
    this.taskId = task.id;
    this.origStart = task.start;
    this.origEnd = task.end ?? task.start;
    this.origProgress = task.progress ?? 0;
    this.progress = this.origProgress;
    this.row = row;
    this.timing = timing;
    this.progressStep = options.progressStep ?? DEFAULT_PROGRESS_STEP;
    this.movable = options.movable ?? true;
    this.resizable = (options.resizable ?? true) && this.movable;
    this.progressEditable = options.progressEditable ?? true;
  }

  /** Snap unit of every date step: days, or hours on hour scales (pass it to `announceKeyboardEdit`). */
  get unit(): 'day' | 'hour' {
    return this.timing.snap;
  }

  /** The session was committed or cancelled; further steps are ignored. */
  get finished(): boolean {
    return this.done;
  }

  private get pxPerUnit(): number {
    return this.timing.snap === 'hour' ? this.timing.pxPerDay / 24 : this.timing.pxPerDay;
  }

  private shift(d: Date, units: number): Date {
    return this.timing.snap === 'hour' ? addHours(d, units) : addDays(d, units);
  }

  private toDays(units: number): number {
    return this.timing.snap === 'hour' ? units / 24 : units;
  }

  /** Same rule as `DragSession`: the drawn bar keeps at least one snap unit. */
  private longEnough(start: Date, end: Date): boolean {
    const span = this.timing.span(start, end);
    return this.timing.toX(span.end) - this.timing.toX(span.start) >= this.pxPerUnit - 0.5;
  }

  get state(): KeyboardEditState {
    const start = this.shift(this.origStart, this.startUnits);
    const end = this.shift(this.origEnd, this.endUnits);
    return {
      start,
      end,
      progress: this.progress,
      startUnits: this.startUnits,
      endUnits: this.endUnits,
      changed: this.startUnits !== 0 || this.endUnits !== 0 || this.progress !== this.origProgress,
    };
  }

  /**
   * Apply one step; returns whether anything changed (a resize that would make the bar too short
   * does not). A rejected step leaves the session, including `preview()`, untouched.
   */
  apply(step: KeyboardEditStep): boolean {
    if (this.done || !Number.isFinite(step.delta)) return false;
    const n = Math.trunc(step.delta);
    if (n === 0) return false;
    switch (step.mode) {
      case 'move':
        if (!this.movable) return false;
        this.startUnits += n;
        this.endUnits += n;
        this.lastMode = 'move';
        return true;
      case 'resizeEnd': {
        if (!this.resizable) return false;
        const start = this.shift(this.origStart, this.startUnits);
        let u = this.endUnits + n;
        while (u < this.endUnits && !this.longEnough(start, this.shift(this.origEnd, u))) u++;
        if (u === this.endUnits) return false;
        this.endUnits = u;
        this.lastMode = 'resizeEnd';
        return true;
      }
      case 'resizeStart': {
        if (!this.resizable) return false;
        const end = this.shift(this.origEnd, this.endUnits);
        let u = this.startUnits + n;
        while (u > this.startUnits && !this.longEnough(this.shift(this.origStart, u), end)) u--;
        if (u === this.startUnits) return false;
        this.startUnits = u;
        this.lastMode = 'resizeStart';
        return true;
      }
      case 'progress': {
        if (!this.progressEditable) return false;
        const next = Math.min(100, Math.max(0, this.progress + n * this.progressStep));
        if (next === this.progress) return false;
        // the date delta of the preview is unaffected: `lastMode` stays
        this.progress = next;
        return true;
      }
    }
  }

  /** Map a key with `keyboardEditAction` and run it. `null`: the key is not an edit key. */
  handleKey(event: KeyLike, options: { rtl?: boolean | undefined } = {}): KeyboardEditKeyResult | null {
    if (this.done) return null;
    const action = keyboardEditAction(event, options);
    if (action === null) return null;
    if (action === 'commit') return { type: 'commit', events: this.commit() };
    if (action === 'cancel') {
      this.cancel();
      return { type: 'cancel' };
    }
    const changed = this.apply(action);
    return { type: 'step', changed, preview: this.preview() };
  }

  /**
   * Geometry of the edited bar, in the shape painters already use for drag previews, plus the
   * edited progress. `delta` is the offset of the edge last changed (the end after a resize of
   * the end, else the start), in `unit`s.
   */
  preview(): KeyboardEditPreview {
    const { start, end, progress, changed } = this.state;
    const span = this.timing.span(start, end);
    const x = this.timing.toX(span.start);
    const delta = this.lastMode === 'resizeEnd' ? this.endUnits : this.startUnits;
    return {
      taskId: this.taskId,
      x,
      width: Math.max(this.timing.toX(span.end) - x, 4),
      y: this.row.y,
      height: this.row.height,
      delta,
      unit: this.timing.snap,
      daysDelta: delta,
      progress,
      changed,
    };
  }

  /**
   * End the session and return the events to emit (empty when nothing changed):
   * equal start / end shifts → one `drag`; only the end → `resize` right; only the start →
   * `resize` left; both by different amounts → a `drag` by the start shift, then a `resize`
   * right for the rest (each event's old dates are the previous event's new dates; a resizable
   * session is always movable, so the `drag` is allowed). A progress change comes last.
   */
  commit(): KeyboardEditEvent[] {
    if (this.done) return [];
    this.done = true;
    const a = this.startUnits;
    const b = this.endUnits;
    const s0 = this.origStart;
    const e0 = this.origEnd;
    const events: KeyboardEditEvent[] = [];
    const drag = (units: number): TaskDragEvent => ({
      taskId: this.taskId,
      oldStart: s0,
      oldEnd: e0,
      newStart: this.shift(s0, units),
      newEnd: this.shift(e0, units),
      daysMoved: this.toDays(units),
    });
    const resize = (
      handle: 'left' | 'right',
      oldStart: Date,
      oldEnd: Date,
      newStart: Date,
      newEnd: Date,
      units: number,
    ): TaskResizeEvent => ({
      taskId: this.taskId,
      handle,
      oldStart,
      oldEnd,
      newStart,
      newEnd,
      daysDelta: this.toDays(units),
    });

    if (a !== 0 && a === b) events.push({ kind: 'drag', event: drag(a) });
    else if (a === 0 && b !== 0)
      events.push({ kind: 'resize', event: resize('right', s0, e0, s0, this.shift(e0, b), b) });
    else if (b === 0 && a !== 0)
      events.push({ kind: 'resize', event: resize('left', s0, e0, this.shift(s0, a), e0, a) });
    else if (a !== 0 && b !== 0) {
      const moved = drag(a);
      events.push({ kind: 'drag', event: moved });
      events.push({
        kind: 'resize',
        event: resize('right', moved.newStart, moved.newEnd, moved.newStart, this.shift(e0, b), b - a),
      });
    }
    if (this.progress !== this.origProgress) {
      events.push({
        kind: 'progress',
        event: { taskId: this.taskId, oldProgress: this.origProgress, newProgress: this.progress },
      });
    }
    return events;
  }

  /** End the session without emitting; the task keeps its original dates and progress. */
  cancel(): void {
    this.done = true;
    this.startUnits = 0;
    this.endUnits = 0;
    this.progress = this.origProgress;
    this.lastMode = 'move';
  }
}
