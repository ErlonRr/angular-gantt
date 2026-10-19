// ─────────────────────────────────────────────────────────────
//  gantry · editing/changes.ts
//  Building, applying and inverting `GanttChange`s: the one shape every
//  edit takes (drag, resize, keyboard, progress, cell, link, API, undo).
//  A change carries field-level `before` / `after` patches (an exact
//  inverse that restores the user's data shape) and the ops derived from
//  them (`deriveOps`, D4), so a date typed in a cell fires the same
//  `task-dragged` as a drag.
// ─────────────────────────────────────────────────────────────

import { addDays, calendarDays } from '../gantt-math';
import {
  DependencyType,
  type DependencyChangeEvent,
  type GanttChange,
  type GanttChangeOp,
  type GanttChangeSource,
  type GanttDependency,
  type GanttTask,
  type GanttTaskUpdate,
  type TaskDragEvent,
  type TaskProgressEvent,
  type TaskResizeEvent,
} from '../types';

/** Extra fields of a change built by `taskChange`. */
export interface TaskChangeOptions {
  /** The column key of a cell edit (`GanttChange.column`) */
  column?: string | undefined;
  /**
   * Merge with the previous undo step of the same key (`GanttChange.coalesceKey`). Default: none,
   * except a cell edit (source `'cell'` with a `column`), which gets `cell:<taskId>:<column>`.
   */
  coalesceKey?: string | undefined;
}

/** A link to add or remove (`linkChange`): `fromId` is the predecessor, `toId` the successor. */
export interface LinkChangeSpec {
  fromId: string;
  toId: string;
  /** Default `'FS'` */
  type?: DependencyType | undefined;
  /** Lag in days. Default 0 */
  lag?: number | undefined;
}

// ─── Internals ────────────────────────────────────────────────

type Fields = Record<string, unknown>;

const HOUR_MS = 3_600_000;
const EPS = 1e-9;
/** Plain objects and arrays deeper than this compare by identity (and cycles end) */
const MAX_DEPTH = 8;

const hasOwn = (o: object, key: string): boolean => Object.prototype.hasOwnProperty.call(o, key);
const fields = (o: object): Fields => o as Fields;
const asDate = (v: unknown): Date | null => (v instanceof Date && !Number.isNaN(v.getTime()) ? v : null);
const asProgress = (v: unknown): number => (typeof v === 'number' ? v : 0);

function isPlainObject(v: object): boolean {
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Structural equality of field values: dates by time, plain objects and arrays by content. */
function sameValue(a: unknown, b: unknown, depth = 0): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);
  if (a instanceof Date && b instanceof Date) return Object.is(a.getTime(), b.getTime());
  if (depth >= MAX_DEPTH || typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => sameValue(v, b[i], depth + 1));
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const fa = fields(a);
  const fb = fields(b);
  const keys = new Set([...Object.keys(fa), ...Object.keys(fb)]);
  for (const k of keys) if (!sameValue(fa[k], fb[k], depth + 1)) return false;
  return true;
}

/** `task.dependency` in any shape (a string id, one object, a list) as a list of objects. */
function dependencyList(raw: unknown): GanttDependency[] {
  if (raw === undefined || raw === null || raw === '') return [];
  const list: unknown[] = Array.isArray(raw) ? raw : [raw];
  const out: GanttDependency[] = [];
  for (const d of list) {
    if (typeof d === 'string') out.push({ taskId: d });
    else if (d && typeof d === 'object' && typeof (d as GanttDependency).taskId === 'string') {
      out.push(d as GanttDependency);
    }
  }
  return out;
}

/** The identity of a dependency entry: predecessor, type (default FS) and lag (default 0). */
const dependencyKey = (d: GanttDependency): string =>
  `${d.taskId}\u0000${d.type ?? DependencyType.FS}\u0000${d.lag ?? 0}`;

const linkEvent = (d: GanttDependency, toId: string): DependencyChangeEvent => ({
  fromId: d.taskId,
  toId,
  type: d.type ?? DependencyType.FS,
  lag: d.lag ?? 0,
});

/** The entries only in `before` (removed) and only in `after` (added), as multisets, in list order. */
function dependencyDiff(before: unknown, after: unknown): { removed: GanttDependency[]; added: GanttDependency[] } {
  const oldList = dependencyList(before);
  const newList = dependencyList(after);
  const pool = newList.map(dependencyKey);
  const matched = new Set<number>();
  const removed: GanttDependency[] = [];
  for (const d of oldList) {
    const key = dependencyKey(d);
    const i = pool.findIndex((k, j) => k === key && !matched.has(j));
    if (i < 0) removed.push(d);
    else matched.add(i);
  }
  const added = newList.filter((_, j) => !matched.has(j));
  return { removed, added };
}

/** Two values of one task field are the same: dependencies by their links (any shape), else structurally. */
function sameField(key: string, a: unknown, b: unknown): boolean {
  if (key === 'dependency') {
    if (a === b) return true;
    const { removed, added } = dependencyDiff(a, b);
    return removed.length === 0 && added.length === 0;
  }
  return sameValue(a, b);
}

/**
 * The shift from `from` to `to` in days: whole local calendar days when the time of day is kept
 * (date-only values, day snapping, across DST), else the elapsed hours / 24 (hour snapping).
 */
function shiftDays(from: Date, to: Date): number {
  const days = calendarDays(to) - calendarDays(from);
  const whole = Math.round(days);
  if (Math.abs(days - whole) < EPS) return whole + 0;
  return (to.getTime() - from.getTime()) / HOUR_MS / 24;
}

/** `date` shifted the way `from` → `to` is (`addDays` for whole calendar days, else by the elapsed time). */
function shiftLike(date: Date, from: Date, to: Date): Date {
  const days = calendarDays(to) - calendarDays(from);
  const whole = Math.round(days);
  if (Math.abs(days - whole) < EPS) return addDays(date, whole);
  return new Date(date.getTime() + (to.getTime() - from.getTime()));
}

const negate = (n: number): number => -n || 0;

/** The tasks an op is about: its task, or both ends of a link. */
function opTaskIds(op: GanttChangeOp): string[] {
  return op.op === 'link' || op.op === 'unlink' ? [op.event.fromId, op.event.toId] : [op.event.taskId];
}

function makeChange(
  source: GanttChangeSource,
  updates: readonly GanttTaskUpdate[],
  ops: readonly GanttChangeOp[],
  column: string | undefined,
  coalesceKey: string | undefined,
): GanttChange {
  const change: GanttChange = { source, updates, ops };
  if (column !== undefined) change.column = column;
  if (coalesceKey !== undefined) change.coalesceKey = coalesceKey;
  return change;
}

/** The date ops of one task: move, resize, or move + resize of the end (D4). */
function dateOps(taskId: string, oldStart: Date, oldEnd: Date, newStart: Date, newEnd: Date): GanttChangeOp[] {
  const startMoved = oldStart.getTime() !== newStart.getTime();
  const endMoved = oldEnd.getTime() !== newEnd.getTime();
  if (!startMoved && !endMoved) return [];
  const base = { taskId, oldStart, oldEnd, newStart, newEnd };
  if (!startMoved) {
    return [{ op: 'resize', event: { ...base, edge: 'end', handle: 'right', daysDelta: shiftDays(oldEnd, newEnd) } }];
  }
  if (!endMoved) {
    return [
      { op: 'resize', event: { ...base, edge: 'start', handle: 'left', daysDelta: shiftDays(oldStart, newStart) } },
    ];
  }
  const startShift = shiftDays(oldStart, newStart);
  const endShift = shiftDays(oldEnd, newEnd);
  const startMs = newStart.getTime() - oldStart.getTime();
  const endMs = newEnd.getTime() - oldEnd.getTime();
  if (Math.abs(startShift - endShift) < EPS) return [{ op: 'move', event: { ...base, daysMoved: startShift } }];
  // Equal elapsed time read as different calendar days (an hour drag across a DST change): a move
  if (startMs === endMs) return [{ op: 'move', event: { ...base, daysMoved: startMs / HOUR_MS / 24 } }];
  // Both edges by different amounts: a move by the start's shift, then a resize of the end
  const midEnd = shiftLike(oldEnd, oldStart, newStart);
  const move: TaskDragEvent = { taskId, oldStart, oldEnd, newStart, newEnd: midEnd, daysMoved: startShift };
  if (midEnd.getTime() === newEnd.getTime()) return [{ op: 'move', event: move }];
  const resize: TaskResizeEvent = {
    taskId,
    edge: 'end',
    handle: 'right',
    oldStart: newStart,
    oldEnd: midEnd,
    newStart,
    newEnd,
    daysDelta: shiftDays(midEnd, newEnd),
  };
  return [
    { op: 'move', event: move },
    { op: 'resize', event: resize },
  ];
}

// ─── Building changes ─────────────────────────────────────────

/**
 * The change that sets `after`'s fields on `task`: fields equal to the task's current values are
 * dropped (dates compared by time, plain objects and arrays by content, `dependency` by its links
 * whatever its shape), `before` holds the old values of exactly the remaining fields (`undefined`
 * where the field was not set) and the ops are derived (`deriveOps`). `id` can't change and is
 * ignored. Nothing left: an empty change (`isEmptyChange`).
 *
 * Pass the task as the app gave it (not a copy with repaired fields), so undo restores the app's
 * own values.
 *
 * @example
 * ```ts
 * taskChange(design, { progress: 60 }, 'api');
 * // { source: 'api', updates: [{ taskId: 'design', before: { progress: 40 }, after: { progress: 60 } }],
 * //   ops: [{ op: 'progress', event: { taskId: 'design', oldProgress: 40, newProgress: 60 } }] }
 * ```
 */
export function taskChange(
  task: GanttTask,
  after: Partial<GanttTask>,
  source: GanttChangeSource,
  options: TaskChangeOptions = {},
): GanttChange {
  const current = fields(task);
  const patch = fields(after);
  const before: Fields = {};
  const next: Fields = {};
  for (const key of Object.keys(patch)) {
    if (key === 'id') continue;
    const value = patch[key];
    if (sameField(key, current[key], value)) continue;
    before[key] = current[key];
    next[key] = value;
  }
  const updates: GanttTaskUpdate[] =
    Object.keys(next).length > 0 ? [{ taskId: task.id, before: before, after: next }] : [];
  const column = options.column;
  const coalesceKey =
    options.coalesceKey ?? (source === 'cell' && column !== undefined ? `cell:${task.id}:${column}` : undefined);
  return makeChange(source, updates, deriveOps(updates, [task]), column, coalesceKey);
}

/**
 * Adds (`'link'`) or removes (`'unlink'`) a dependency by patching the successor's (`toId`)
 * `dependency` field. Adding writes an array of `GanttDependency` objects (the existing entries
 * kept, a string id turned into `{ taskId }`, the new one `{ taskId: fromId, type, lag }` last);
 * removing filters the matching entries (any type when `type` is omitted; `lag` is not compared),
 * keeps the others as they were, and an empty list becomes `undefined`. The ops are `link` /
 * `unlink` with a `DependencyChangeEvent` (one per removed entry). Removing a link that does not
 * exist gives an empty change. A missing successor gives a change with the op and no update, which
 * validation rejects (`missing-task`). Adding an existing link is not refused here: validation
 * rejects it (`duplicate-link`).
 */
export function linkChange(
  tasks: readonly GanttTask[],
  link: LinkChangeSpec,
  op: 'link' | 'unlink',
  source: GanttChangeSource,
): GanttChange {
  const { fromId, toId } = link;
  const type = link.type ?? DependencyType.FS;
  const lag = link.lag ?? 0;
  const successor = tasks.find(t => t.id === toId);
  if (!successor) return makeChange(source, [], [{ op, event: { fromId, toId, type, lag } }], undefined, undefined);
  const current = dependencyList(successor.dependency);
  let next: GanttDependency[] | undefined;
  if (op === 'link') {
    next = [...current, { taskId: fromId, type, lag }];
  } else {
    const matches = (d: GanttDependency) =>
      d.taskId === fromId && (link.type === undefined || (d.type ?? DependencyType.FS) === link.type);
    if (!current.some(matches)) return makeChange(source, [], [], undefined, undefined);
    const kept = current.filter(d => !matches(d));
    next = kept.length > 0 ? kept : undefined;
  }
  const updates: GanttTaskUpdate[] = [
    { taskId: toId, before: { dependency: successor.dependency }, after: { dependency: next } },
  ];
  return makeChange(source, updates, deriveOps(updates, [successor]), undefined, undefined);
}

/**
 * The change of a pointer or keyboard drop (`DragSession.finish`): the new `start` / `end` of
 * `task`. When the derived op is the event's kind (a move, or a resize of the same edge), it keeps
 * the event's `daysMoved` / `daysDelta`, which count in the session's snap unit.
 */
export function dragChange(
  event: TaskDragEvent | TaskResizeEvent,
  task: GanttTask,
  source: GanttChangeSource,
): GanttChange {
  const change = taskChange(task, { start: event.newStart, end: event.newEnd }, source);
  const [only, ...rest] = change.ops;
  if (!only || rest.length > 0) return change;
  if (only.op === 'move' && 'daysMoved' in event) {
    return { ...change, ops: [{ op: 'move', event: { ...only.event, daysMoved: event.daysMoved } }] };
  }
  if (only.op === 'resize' && 'daysDelta' in event && only.event.edge === event.edge) {
    return { ...change, ops: [{ op: 'resize', event: { ...only.event, daysDelta: event.daysDelta } }] };
  }
  return change;
}

/**
 * The change of a progress edit (`ProgressSession.finish`, ↑ / ↓ in move mode): the new `progress`
 * of `task`. A progress-grip edit (source `'progress'`) gets the coalesce key `progress:<taskId>`.
 */
export function progressChange(event: TaskProgressEvent, task: GanttTask, source: GanttChangeSource): GanttChange {
  return taskChange(
    task,
    { progress: event.newProgress },
    source,
    source === 'progress' ? { coalesceKey: `progress:${task.id}` } : {},
  );
}

/**
 * The ops of `updates`, in update order, from the field diff (not the gesture): equal start and
 * end shifts → `move`; one edge → `resize` (`edge` set); both edges by different amounts → `move`
 * by the start shift, then `resize` of the end; `progress` → `progress`; dependencies added /
 * removed → `unlink` for each removed link, then `link` for each added one. Per update the order
 * is dates, progress, links. `tasksBefore` gives the tasks' old values where an update does not
 * carry them (the end of a task whose start alone changed).
 *
 * Amounts: whole local calendar days when the time of day is kept (date-only values, across DST),
 * else elapsed hours / 24. A task without an `end` is read as ending at its start.
 */
export function deriveOps(updates: readonly GanttTaskUpdate[], tasksBefore: readonly GanttTask[]): GanttChangeOp[] {
  const byId = new Map<string, Fields>();
  for (const t of tasksBefore) if (!byId.has(t.id)) byId.set(t.id, fields(t));
  const ops: GanttChangeOp[] = [];
  for (const u of updates) {
    const task = byId.get(u.taskId);
    const before = fields(u.before);
    const after = fields(u.after);
    const old = (key: string): unknown => (hasOwn(before, key) ? before[key] : task?.[key]);
    const now = (key: string): unknown => (hasOwn(after, key) ? after[key] : old(key));

    if (hasOwn(after, 'start') || hasOwn(after, 'end')) {
      const oldStart = asDate(old('start'));
      const newStart = asDate(now('start'));
      if (oldStart && newStart) {
        const oldEnd = asDate(old('end')) ?? oldStart;
        const newEnd = asDate(now('end')) ?? newStart;
        ops.push(...dateOps(u.taskId, oldStart, oldEnd, newStart, newEnd));
      }
    }
    if (hasOwn(after, 'progress')) {
      const oldProgress = asProgress(old('progress'));
      const newProgress = asProgress(now('progress'));
      if (!Object.is(oldProgress, newProgress)) {
        ops.push({ op: 'progress', event: { taskId: u.taskId, oldProgress, newProgress } });
      }
    }
    if (hasOwn(after, 'dependency')) {
      const { removed, added } = dependencyDiff(old('dependency'), now('dependency'));
      for (const d of removed) ops.push({ op: 'unlink', event: linkEvent(d, u.taskId) });
      for (const d of added) ops.push({ op: 'link', event: linkEvent(d, u.taskId) });
    }
  }
  return ops;
}

// ─── Applying, inverting, merging ─────────────────────────────

/**
 * A new array: `tasks` with the change's `after` patches applied (in order): a changed task is a
 * new object (`{ ...task, ...after }`, `undefined` values deleting the field), untouched tasks keep
 * their identity, updates of missing ids are skipped. Works on the app's own task type (extra
 * fields are kept).
 */
export function applyChange<T extends GanttTask>(tasks: readonly T[], change: GanttChange): T[] {
  if (change.updates.length === 0) return tasks.slice();
  const patches = new Map<string, Fields>();
  for (const u of change.updates) {
    const patch = patches.get(u.taskId) ?? {};
    Object.assign(patch, u.after);
    patches.set(u.taskId, patch);
  }
  return tasks.map(task => {
    const patch = patches.get(task.id);
    if (!patch) return task;
    const next: Fields = { ...fields(task) };
    for (const key of Object.keys(patch)) {
      if (key === 'id') continue;
      const value = patch[key];
      if (value === undefined) delete next[key];
      else next[key] = value;
    }
    return next as T;
  });
}

/** One op undone: old ↔ new, amounts negated, link ↔ unlink. */
function invertOp(op: GanttChangeOp): GanttChangeOp {
  switch (op.op) {
    case 'move': {
      const e = op.event;
      return {
        op: 'move',
        event: {
          taskId: e.taskId,
          oldStart: e.newStart,
          oldEnd: e.newEnd,
          newStart: e.oldStart,
          newEnd: e.oldEnd,
          daysMoved: negate(e.daysMoved),
        },
      };
    }
    case 'resize': {
      const e = op.event;
      return {
        op: 'resize',
        event: {
          taskId: e.taskId,
          edge: e.edge,
          handle: e.handle,
          oldStart: e.newStart,
          oldEnd: e.newEnd,
          newStart: e.oldStart,
          newEnd: e.oldEnd,
          daysDelta: negate(e.daysDelta),
        },
      };
    }
    case 'progress':
      return {
        op: 'progress',
        event: { taskId: op.event.taskId, oldProgress: op.event.newProgress, newProgress: op.event.oldProgress },
      };
    case 'link':
      return { op: 'unlink', event: { ...op.event } };
    case 'unlink':
      return { op: 'link', event: { ...op.event } };
  }
}

/**
 * The change that undoes `change`: `before` and `after` swapped, the updates and ops in reverse
 * order and each op inverted (a move negated, link ↔ unlink, old ↔ new dates and progress), with
 * `source`. The `dependency` field keeps its shape (a string stays a string: `after` is the old
 * value as it was). `column` and `coalesceKey` are kept, so `invert ∘ invert` gives the original
 * change (apart from `source`).
 */
export function invertChange(change: GanttChange, source: 'undo' | 'redo'): GanttChange {
  const updates = change.updates
    .map((u): GanttTaskUpdate => ({ taskId: u.taskId, before: u.after, after: u.before }))
    .reverse();
  const ops = change.ops.map(invertOp).reverse();
  return makeChange(source, updates, ops, change.column, change.coalesceKey);
}

/**
 * `a` then `b` as one change (history coalescing): per task and field the first `before` and the
 * last `after`, in the order the tasks and fields first appear; fields that end where they started
 * are dropped (an update with nothing left goes too). The ops are derived again from the merged
 * updates (`deriveOps`), so consecutive moves of one task fold into one, a move then a resize of
 * the end read as their net change, a link added then removed disappears, and no-ops are dropped.
 * Ops without an update (a link to a missing task) are not kept. Keeps `a`'s source, `b`'s
 * coalesce key, and `b`'s column (else `a`'s).
 */
export function mergeChanges(a: GanttChange, b: GanttChange): GanttChange {
  const merged = new Map<string, { before: Fields; after: Fields }>();
  for (const u of [...a.updates, ...b.updates]) {
    let m = merged.get(u.taskId);
    if (!m) {
      m = { before: {}, after: {} };
      merged.set(u.taskId, m);
    }
    const before = fields(u.before);
    const after = fields(u.after);
    for (const key of Object.keys(after)) {
      if (!hasOwn(m.before, key)) m.before[key] = before[key];
      m.after[key] = after[key];
    }
  }
  const updates: GanttTaskUpdate[] = [];
  for (const [taskId, m] of merged) {
    const before: Fields = {};
    const after: Fields = {};
    for (const key of Object.keys(m.after)) {
      if (sameField(key, m.before[key], m.after[key])) continue;
      before[key] = m.before[key];
      after[key] = m.after[key];
    }
    if (Object.keys(after).length > 0) {
      updates.push({ taskId, before: before, after: after });
    }
  }
  // The dates before the first change of each task: the first date op's old dates
  const datesBefore = new Map<string, GanttTask>();
  for (const op of [...a.ops, ...b.ops]) {
    if ((op.op === 'move' || op.op === 'resize') && !datesBefore.has(op.event.taskId)) {
      const e = op.event;
      datesBefore.set(e.taskId, { id: e.taskId, name: '', start: e.oldStart, end: e.oldEnd });
    }
  }
  return makeChange(
    a.source,
    updates,
    deriveOps(updates, [...datesBefore.values()]),
    b.column ?? a.column,
    b.coalesceKey,
  );
}

/** The change has no update and no op (nothing to apply, nothing to record). */
export function isEmptyChange(change: GanttChange): boolean {
  return change.updates.length === 0 && change.ops.length === 0;
}

/**
 * `u` without the links it would add from tasks that are gone (entries of `after.dependency` naming
 * a missing task that `before.dependency` did not name); `null` when nothing is left of it.
 */
function withoutMissingLinks(u: GanttTaskUpdate, ids: ReadonlySet<string>): GanttTaskUpdate | null {
  if (!hasOwn(u.after, 'dependency')) return u;
  const named = new Set(dependencyList(u.before.dependency).map(dep => dep.taskId));
  const list = dependencyList(u.after.dependency);
  const keep = list.filter(dep => ids.has(dep.taskId) || named.has(dep.taskId));
  if (keep.length === list.length) return u;
  const dependency = keep.length > 0 ? keep : undefined;
  const nextAfter: Partial<GanttTask> = { ...u.after, dependency };
  const nextBefore: Partial<GanttTask> = { ...u.before };
  if (sameField('dependency', u.before.dependency, dependency)) {
    delete nextAfter.dependency;
    delete nextBefore.dependency;
  }
  if (Object.keys(nextAfter).length === 0) return null;
  return { taskId: u.taskId, before: nextBefore, after: nextAfter };
}

/**
 * The part of `change` that `tasks` can still take: the updates of tasks that exist (without the
 * links they would add from tasks that are gone), the date and progress ops of tasks that exist,
 * the `link` ops whose two ends exist and the `unlink` ops whose successor exists (removing a link
 * from a deleted task is fine). `change` itself when nothing is missing. Undo and redo use it to
 * skip tasks that are gone (D8; an entry with nothing left, `isEmptyChange`, is dropped).
 */
export function applicableChange(change: GanttChange, tasks: readonly GanttTask[]): GanttChange {
  const ids = new Set(tasks.map(t => t.id));
  let dropped = false;
  const updates: GanttTaskUpdate[] = [];
  for (const u of change.updates) {
    const kept = ids.has(u.taskId) ? withoutMissingLinks(u, ids) : null;
    if (kept !== u) dropped = true;
    if (kept) updates.push(kept);
  }
  const ops = change.ops.filter(op =>
    op.op === 'unlink' ? ids.has(op.event.toId) : opTaskIds(op).every(id => ids.has(id)),
  );
  if (!dropped && ops.length === change.ops.length) return change;
  return { ...change, updates, ops };
}

/** Every task id `change` refers to (its updates, then its ops' tasks and link ends), once each, in order. */
export function changeTaskIds(change: GanttChange): string[] {
  const ids = new Set<string>();
  for (const u of change.updates) ids.add(u.taskId);
  for (const op of change.ops) for (const id of opTaskIds(op)) ids.add(id);
  return [...ids];
}
