// ─────────────────────────────────────────────────────────────
//  gantry · editing/history.ts
//  Undo / redo stacks of `GanttChange`s (D8). Pure and clock-free: the
//  binding passes the time of each `record`. Consecutive changes with
//  the same `coalesceKey` within `coalesceMs` merge into one step
//  (`mergeChanges`); pointer drags carry no key and never merge. The
//  stacks keep at most `limit` steps; recording clears redo. The
//  binding applies the inverse of `peekUndo()` and then calls
//  `commitUndo()` (and the same for redo); `drop()` discards an undo
//  step that has nothing left to undo. Apps can use it for their own
//  undo in controlled mode.
// ─────────────────────────────────────────────────────────────

import { DEFAULT_COALESCE_MS, DEFAULT_HISTORY_LIMIT } from '../render/config';
import type { GanttChange, GanttHistoryState } from '../types';
import { isEmptyChange, mergeChanges } from './changes';

/** `GanttHistory` settings (`ResolvedEditing.history`). */
export interface GanttHistoryOptions {
  /**
   * Steps kept on each stack (default `DEFAULT_HISTORY_LIMIT`, 100). Whole steps, at least 1: other
   * values (`0`, `NaN`, `Infinity`) fall back to the default, or keep the current limit in `configure`.
   */
  limit?: number | undefined;
  /**
   * Merge window of changes with the same coalesce key, in ms (default `DEFAULT_COALESCE_MS`, 800):
   * a change merges into the undo top when it comes less than `coalesceMs` after the top's last
   * record, so `0` never merges. Negative or non-finite values fall back like `limit`.
   */
  coalesceMs?: number | undefined;
}

/** One undo / redo step. */
interface HistoryStep {
  /** The applied change, as recorded (merged with the later changes of its coalesce key) */
  change: GanttChange;
  /** Time (ms) of the last record merged into this step: the start of its coalescing window */
  at: number;
}

/** A whole limit ≥ 1, else `fallback`. */
const limitOf = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;

/** A merge window ≥ 0 ms, else `fallback`. */
const windowOf = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;

/** Drops the bottom steps (the furthest from the current state) past `limit`. */
const trim = (stack: HistoryStep[], limit: number): void => {
  if (stack.length > limit) stack.splice(0, stack.length - limit);
};

const sameState = (a: GanttHistoryState, b: GanttHistoryState): boolean =>
  a.canUndo === b.canUndo &&
  a.canRedo === b.canRedo &&
  a.undoLabel === b.undoLabel &&
  a.redoLabel === b.redoLabel &&
  a.undoCount === b.undoCount &&
  a.redoCount === b.redoCount;

/**
 * Undo / redo history of applied `GanttChange`s: one step per change, consecutive changes with the
 * same `coalesceKey` (move-mode commits `kbd:<id>`, the progress grip `progress:<id>`, a cell
 * `cell:<id>:<col>`) merged into one step while they come within `coalesceMs` of each other.
 *
 * Pure and clock-free: the caller passes the time of each `record` and applies the changes itself.
 * Undo and redo are two calls each, so a step that is vetoed or rejected stays where it is: Undo
 * applies `invertChange(peekUndo(), 'undo')`, then calls `commitUndo()`; Redo applies `peekRedo()`
 * again (as source `'redo'`), then calls `commitRedo()`. The charts keep one per instance (none in
 * controlled mode); apps use it to build their own undo over `tasks-change`.
 *
 * @example
 * ```ts
 * const history = new GanttHistory({ limit: 50 }, change => describeChange(change, nameOf, DEFAULT_LABELS));
 * chart.addEventListener('tasks-change', e => {           // editing: { controlled: true }
 *   tasks = applyChange(tasks, e.detail.change);
 *   history.record(e.detail.change, performance.now());
 * });
 * function undo() {
 *   const step = history.peekUndo();
 *   if (!step) return;
 *   tasks = applyChange(tasks, invertChange(step, 'undo'));
 *   history.commitUndo();
 * }
 * ```
 */
export class GanttHistory {
  private limit: number;
  private coalesceMs: number;
  /** The words for a step (`describeChange`): `GanttHistoryState.undoLabel` / `redoLabel` */
  private readonly describe: (change: GanttChange) => string;
  /** Undo steps, the top (the next to undo) last */
  private readonly undoStack: HistoryStep[] = [];
  /** Redo steps, the top (the next to redo) last */
  private readonly redoStack: HistoryStep[] = [];
  /** Whether the undo top may absorb the next record of its key: only right after it was recorded */
  private open = false;
  /** The stacks changed since `_state` was built */
  private stale = false;
  private _state: GanttHistoryState = {
    canUndo: false,
    canRedo: false,
    undoLabel: null,
    redoLabel: null,
    undoCount: 0,
    redoCount: 0,
  };

  /**
   * @param options `limit` and `coalesceMs`; omitted or invalid values use the defaults (100 steps, 800 ms).
   * @param describe The words for a step, shown as `GanttHistoryState.undoLabel` / `redoLabel`
   * (the charts pass `describeChange` with the current task names). Called lazily, for the stack
   * tops only, when `state` is read after a change. Default: `''`.
   */
  constructor(options: GanttHistoryOptions = {}, describe: (change: GanttChange) => string = () => '') {
    this.limit = limitOf(options.limit, DEFAULT_HISTORY_LIMIT);
    this.coalesceMs = windowOf(options.coalesceMs, DEFAULT_COALESCE_MS);
    this.describe = describe;
  }

  /**
   * Records an applied change at time `at` (ms, from any monotonic clock). Recording clears redo.
   * The change merges into the undo top (`mergeChanges`: per task and field the first `before` and
   * the last `after`) when both carry the same `coalesceKey`, the top was the last step recorded
   * (not one reached by undo, redo or `drop`) and `at` is less than `coalesceMs` after the top's last
   * record (a clock going backwards never merges); a merge that ends where the step started removes
   * the step. Otherwise the change is pushed and the oldest step dropped past `limit`. A change
   * without updates or ops (`isEmptyChange`) is ignored and leaves redo as it is.
   */
  record(change: GanttChange, at: number): void {
    if (isEmptyChange(change)) return;
    this.redoStack.length = 0;
    const top = this.undoStack.at(-1);
    const key = change.coalesceKey;
    const elapsed = top ? at - top.at : -1;
    if (
      top &&
      this.open &&
      typeof key === 'string' &&
      top.change.coalesceKey === key &&
      elapsed >= 0 &&
      elapsed < this.coalesceMs
    ) {
      const merged = mergeChanges(top.change, change);
      if (isEmptyChange(merged)) {
        this.undoStack.pop();
        this.open = false;
      } else {
        top.change = merged;
        top.at = at;
      }
    } else {
      this.undoStack.push({ change, at });
      trim(this.undoStack, this.limit);
      this.open = true;
    }
    this.stale = true;
  }

  /** The change Undo would undo, as recorded (apply `invertChange(change, 'undo')`), or `null`. */
  peekUndo(): GanttChange | null {
    return this.undoStack.at(-1)?.change ?? null;
  }

  /** The change Redo would redo, as recorded (apply it again), or `null`. */
  peekRedo(): GanttChange | null {
    return this.redoStack.at(-1)?.change ?? null;
  }

  /** The undo top was undone: it moves onto the redo stack. No-op when there is nothing to undo. */
  commitUndo(): void {
    const step = this.undoStack.pop();
    if (!step) return;
    this.redoStack.push(step);
    trim(this.redoStack, this.limit);
    this.open = false;
    this.stale = true;
  }

  /** The redo top was redone: it moves back onto the undo stack. No-op when there is nothing to redo. */
  commitRedo(): void {
    const step = this.redoStack.pop();
    if (!step) return;
    this.undoStack.push(step);
    trim(this.undoStack, this.limit);
    this.open = false;
    this.stale = true;
  }

  /**
   * Discards the undo top: nothing of it could be undone any more (its tasks are gone). Redo is
   * kept. No-op when there is nothing to undo.
   */
  drop(): void {
    if (!this.undoStack.pop()) return;
    this.open = false;
    this.stale = true;
  }

  /** Empties both stacks (the app's `clearHistory()`; external task changes never call it). */
  clear(): void {
    if (this.undoStack.length === 0 && this.redoStack.length === 0) return;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.open = false;
    this.stale = true;
  }

  /**
   * New settings: omitted or invalid fields keep their current value. Both stacks are trimmed to
   * the new `limit`, dropping the steps furthest from the current state first (the oldest undo
   * steps, the last redo steps).
   */
  configure(options: GanttHistoryOptions): void {
    this.limit = limitOf(options.limit, this.limit);
    this.coalesceMs = windowOf(options.coalesceMs, this.coalesceMs);
    const before = this.undoStack.length + this.redoStack.length;
    trim(this.undoStack, this.limit);
    trim(this.redoStack, this.limit);
    if (this.undoStack.length + this.redoStack.length !== before) this.stale = true;
  }

  /**
   * The undo / redo state (the `history-change` detail). The same object until a value changes, so
   * `state !== previous` tells whether to emit `history-change`; treat it as read-only. The labels
   * are `describe` of the stack tops, `null` on an empty stack.
   */
  get state(): GanttHistoryState {
    if (this.stale) {
      this.stale = false;
      const undo = this.undoStack.at(-1);
      const redo = this.redoStack.at(-1);
      const next: GanttHistoryState = {
        canUndo: undo !== undefined,
        canRedo: redo !== undefined,
        undoLabel: undo ? this.describe(undo.change) : null,
        redoLabel: redo ? this.describe(redo.change) : null,
        undoCount: this.undoStack.length,
        redoCount: this.redoStack.length,
      };
      if (!sameState(next, this._state)) this._state = next;
    }
    return this._state;
  }
}
