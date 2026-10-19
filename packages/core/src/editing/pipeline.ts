// ─────────────────────────────────────────────────────────────
//  gantry · editing/pipeline.ts
//  The change pipeline both bindings run for every edit (plan §3c):
//  validate → cancellable `before-change` → apply + history → events.
//  `prepareChange` does everything that is not the binding's: the
//  built-in and custom validation, the proposed tasks, the events in
//  D5 order and the announcement. The binding emits `before-change`
//  (`createBeforeChangeDetail`), applies, records history, emits the
//  events, then `tasks-change` and `history-change`.
// ─────────────────────────────────────────────────────────────

import type { ResolvedGanttConfig } from '../render/config';
import { bottomScale } from '../render/scales';
import type {
  AnnounceUnit,
  DependencyChangeEvent,
  GanttBeforeChangeEvent,
  GanttChange,
  GanttChangeOp,
  GanttLabels,
  GanttTask,
  TaskDragEvent,
  TaskProgressEvent,
  TaskResizeEvent,
  TaskUpdatedEvent,
} from '../types';
import { applicableChange, applyChange, changeTaskIds, deriveOps, invertChange, isEmptyChange } from './changes';
import { describeChange } from './describe';
import { validateChange, type ChangeErrorCode } from './validate';

/** The events a change fires after it is applied, by name (the Web Component's event names). */
export interface EditEventMap {
  'task-dragged': TaskDragEvent;
  'task-resized': TaskResizeEvent;
  'task-progress-changed': TaskProgressEvent;
  'dependency-created': DependencyChangeEvent;
  'dependency-deleted': DependencyChangeEvent;
  'task-updated': TaskUpdatedEvent;
}

/** One event to emit: its name and detail. */
export type EditEventEntry = { [K in keyof EditEventMap]: { type: K; detail: EditEventMap[K] } }[keyof EditEventMap];

/** What `prepareChange` reads besides the change. */
export interface PrepareChangeContext {
  /** The chart's tasks before the change, as it reads them (normalised): what validation reads */
  tasks: readonly GanttTask[];
  /**
   * The app's own tasks before the change (the binding's raw input: the tasks as set, Angular's
   * `series`, a data source's items), default `tasks`. The events carry them, never the normalised
   * copies (a child whose parent is not loaded keeps its `parentId`, a task without `end` gets
   * none): `task-updated`'s `task` / `previous` and `PreparedChange.rawProposed`.
   */
  raw?: readonly GanttTask[] | undefined;
  /** `editing` (validation) and `scales` (the unit of date amounts in the announcement) */
  config: ResolvedGanttConfig;
  labels: GanttLabels;
  /** The display name of a task id in announcements (default: the task's `name`, else the id) */
  names?: ((taskId: string) => string) | undefined;
  /** The header of a column key in a cell edit's announcement (default `fieldLabel`) */
  columnLabel?: ((key: string) => string) | undefined;
}

/** A change that passed validation, ready for `before-change`. */
export interface PreparedChange {
  ok: true;
  /**
   * The change to apply and record: `change` itself, with its ops derived when it had updates and
   * no ops, and for undo / redo without the updates and ops of tasks that are gone (D8)
   */
  change: GanttChange;
  /** `tasks` with the change applied (`applyChange`): what validation read (`GanttValidateContext.proposed`) */
  proposed: GanttTask[];
  /**
   * `raw` (default `tasks`) with the change applied: the app's own objects, the untouched ones
   * identical. What `before-change` carries, and `tasks-change` when the change is not applied
   * (controlled mode, or the app set the tasks during `before-change`): an app that sets them
   * keeps its own data (D7).
   */
  rawProposed: GanttTask[];
  /**
   * The events after the apply, in D5 order: one per op (`task-dragged` | `task-resized` |
   * `task-progress-changed` | `dependency-created` | `dependency-deleted`), then `task-updated` per
   * update (with the app's own tasks: `raw`, `rawProposed`). Without `before-change`,
   * `tasks-change` and `history-change` (the binding's).
   */
  events: EditEventEntry[];
  /**
   * What to announce once the change is applied, in every mode: `describeChange`, wrapped in
   * `announceUndo` (describing the undone change, not its inverse) for source `'undo'` and in
   * `announceRedo` for `'redo'`. `''` for a change with nothing to say.
   */
  announcement: string;
}

/** A change that failed validation: announce `labels.announceChangeRejected(message)` (cells show `message`). */
export interface RejectedChange {
  ok: false;
  code: ChangeErrorCode;
  message: string;
}

/** The event an op fires (D5). */
function opEvent(op: GanttChangeOp): EditEventEntry {
  switch (op.op) {
    case 'move':
      return { type: 'task-dragged', detail: op.event };
    case 'resize':
      return { type: 'task-resized', detail: op.event };
    case 'progress':
      return { type: 'task-progress-changed', detail: op.event };
    case 'link':
      return { type: 'dependency-created', detail: op.event };
    case 'unlink':
      return { type: 'dependency-deleted', detail: op.event };
  }
}

/** The snap unit of the scale: hours on hour scales (as `editTiming`), else days. */
const scaleUnit = (config: Pick<ResolvedGanttConfig, 'scales'>): AnnounceUnit =>
  bottomScale(config.scales).unit === 'hour' ? 'hour' : 'day';

/**
 * Validates `change` against `ctx.tasks` (`validateChange`: the built-in rules, then
 * `config.editing.validate`) and prepares everything the binding needs to run it: the proposed
 * tasks, the events in order and the announcement.
 *
 * - Undo / redo (source `'undo'` / `'redo'`) skip the tasks that are gone (`applicableChange`, D8);
 *   nothing left rejects with `missing-task` (bindings check `applicableChange` first and drop the
 *   history entry). Any other change that refers to a missing task is rejected by validation.
 * - A change with updates and no ops gets its ops derived (`deriveOps`); a change with ops keeps
 *   them (an inverse keeps its reversed order).
 * - An empty change (`isEmptyChange`) passes with no events and an empty announcement: callers
 *   skip it before `before-change`.
 *
 * - Validation reads the normalised `tasks` (and `proposed`); the events carry the app's own
 *   tasks (`raw`, `rawProposed`).
 *
 * Pure: it emits, applies and records nothing.
 *
 * @example
 * ```ts
 * const r = prepareChange(dragChange(event, rawTask, 'drag'), { tasks: normalised, raw, config, labels });
 * if (!r.ok) return announce(labels.announceChangeRejected(r.message));
 * const detail = createBeforeChangeDetail(r.change, r.rawProposed);
 * emit('before-change', detail);
 * if (detail.defaultPrevented) return announce(labels.announceChangeRejected(labels.errorRejected));
 * raw = applyChange(raw, r.change);
 * for (const e of r.events) emit(e.type, e.detail);
 * emit('tasks-change', { tasks: raw, change: r.change, applied: true });
 * announce(r.announcement);
 * ```
 */
export function prepareChange(change: GanttChange, ctx: PrepareChangeContext): PreparedChange | RejectedChange {
  const { tasks, config, labels } = ctx;
  let c = change;
  if (c.source === 'undo' || c.source === 'redo') {
    const kept = applicableChange(c, tasks);
    if (kept !== c && isEmptyChange(kept)) {
      const ids = new Set(tasks.map(t => t.id));
      const missing = changeTaskIds(c).find(id => !ids.has(id)) ?? c.updates[0]?.taskId ?? '';
      return { ok: false, code: 'missing-task', message: labels.errorUnknownTask(missing) };
    }
    c = kept;
  }
  if (c.ops.length === 0 && c.updates.length > 0) {
    const ops = deriveOps(c.updates, tasks);
    if (ops.length > 0) c = { ...c, ops };
  }

  const proposed = applyChange(tasks, c);
  const error = validateChange(c, { tasks, proposed, config, labels });
  if (error) return { ok: false, code: error.code, message: error.message };
  const raw = ctx.raw ?? tasks;
  const rawProposed = raw === tasks ? proposed : applyChange(raw, c);

  const before = byId(tasks);
  const after = byId(proposed);
  // The events carry the app's own objects (a task only the normalised list has: that one)
  const rawBefore = raw === tasks ? before : byId(raw);
  const rawAfter = raw === tasks ? after : byId(rawProposed);

  const events: EditEventEntry[] = c.ops.map(opEvent);
  for (const u of c.updates) {
    const previous = rawBefore.get(u.taskId) ?? before.get(u.taskId);
    const task = rawAfter.get(u.taskId) ?? after.get(u.taskId);
    if (!previous || !task) continue;
    events.push({
      type: 'task-updated',
      detail: { taskId: u.taskId, task, previous, fields: Object.keys(u.after), source: c.source },
    });
  }

  const nameOf = ctx.names ?? ((id: string) => after.get(id)?.name ?? before.get(id)?.name ?? id);
  const describe = (x: GanttChange) => describeChange(x, nameOf, labels, scaleUnit(config), ctx.columnLabel);
  let announcement: string;
  if (isEmptyChange(c)) announcement = '';
  else if (c.source === 'undo') announcement = labels.announceUndo(describe(invertChange(c, 'redo')));
  else if (c.source === 'redo') announcement = labels.announceRedo(describe(c));
  else announcement = describe(c);

  return { ok: true, change: c, proposed, rawProposed, events, announcement };
}

/** The tasks by id (the first task of a repeated id wins). */
function byId(tasks: readonly GanttTask[]): Map<string, GanttTask> {
  const map = new Map<string, GanttTask>();
  for (const t of tasks) if (!map.has(t.id)) map.set(t.id, t);
  return map;
}

/**
 * The `before-change` detail: `change`, the proposed `tasks` (`PreparedChange.rawProposed`: the
 * app's own objects), and `preventDefault()` /
 * `defaultPrevented` (a veto that works through the wrappers' callbacks and Angular's output,
 * which pass the detail object on). `defaultPrevented` is a live getter: read it after the event
 * was dispatched. The Web Component also dispatches the event `cancelable`; a veto by either
 * route counts.
 */
export function createBeforeChangeDetail(change: GanttChange, proposed: readonly GanttTask[]): GanttBeforeChangeEvent {
  let prevented = false;
  return {
    change,
    tasks: proposed,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
  };
}
