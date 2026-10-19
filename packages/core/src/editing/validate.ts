// ─────────────────────────────────────────────────────────────
//  gantry · editing/validate.ts
//  The built-in checks every change passes (always on, D10): a link to
//  itself, a missing task, a duplicate link, a link between a task and
//  its own ancestor or descendant (unless `editing.dependencies.parentChild`),
//  a cycle, an end before its start, progress outside 0–100, a read-only
//  task or field; then `editing.validate`. Messages are labels.
//
//  Links are read from the dependency field, whatever its shape (`taskDependencies`):
//  a link is "new" when the successor had no dependency on that predecessor
//  before the change, so editing an existing link (its type or lag) is never
//  rejected for what the data already held. The graph walks are iterative
//  (no recursion) and O(V + E).
// ─────────────────────────────────────────────────────────────

import { toLocalDay } from '../gantt-math';
import { taskDependencies } from '../render/columns';
import type { ResolvedGanttConfig } from '../render/config';
import { DEFAULT_LABELS, type DependencyType, type GanttChange, type GanttLabels, type GanttTask } from '../types';

/** Why a change was rejected (`custom`: `editing.validate`). */
export type ChangeErrorCode =
  | 'self-link'
  | 'duplicate-link'
  | 'cycle'
  | 'parent-child'
  | 'missing-task'
  | 'end-before-start'
  | 'progress-range'
  | 'read-only'
  | 'custom';

/** A rejected change: the code and the message to show / announce (a label, or `editing.validate`'s text). */
export interface ChangeError {
  code: ChangeErrorCode;
  message: string;
}

/** What `validateChange` reads besides the change. */
export interface ValidateChangeContext {
  /** The tasks before the change */
  tasks: readonly GanttTask[];
  /** The tasks with the change applied */
  proposed: readonly GanttTask[];
  /** `editing.dependencies.parentChild`, `editing.validate`, `rollup` and the date reading come from here */
  config: ResolvedGanttConfig;
  /** The error messages (default `DEFAULT_LABELS`) */
  labels?: GanttLabels | undefined;
}

/** What `linkError` checks besides the two ends. */
export interface LinkErrorOptions {
  /** Links between a task and its own ancestors / descendants are allowed */
  parentChild: boolean;
  /** The link's type, for the duplicate check (default: any type counts as a duplicate) */
  type?: DependencyType | undefined;
  /** The error messages (default `DEFAULT_LABELS`) */
  labels?: GanttLabels | undefined;
}

type TaskIndex = ReadonlyMap<string, GanttTask>;

const error = (code: ChangeErrorCode, message: string): ChangeError => ({ code, message });

/** The tasks by id; the first task of a repeated id wins (as `flattenTree` reads them). */
function indexTasks(tasks: readonly GanttTask[]): Map<string, GanttTask> {
  const byId = new Map<string, GanttTask>();
  for (const t of tasks) if (!byId.has(t.id)) byId.set(t.id, t);
  return byId;
}

/**
 * `id` depends on `targetId`, directly or through other tasks: an iterative depth-first search over
 * the predecessors (each task's own `dependency` field, so no successor index is needed), each task
 * visited once. Unknown ids end a path.
 */
function dependsOn(byId: TaskIndex, id: string, targetId: string): boolean {
  const seen = new Set<string>([id]);
  const stack = [id];
  for (let cur = stack.pop(); cur !== undefined; cur = stack.pop()) {
    const task = byId.get(cur);
    if (!task) continue;
    for (const dep of taskDependencies(task)) {
      const pred = dep.taskId;
      if (pred === targetId) return true;
      if (!seen.has(pred)) {
        seen.add(pred);
        stack.push(pred);
      }
    }
  }
  return false;
}

/** `ancestorId` is a parent, grand-parent… of `id` (`parentId` chains; a looping chain stops). */
function isAncestor(byId: TaskIndex, ancestorId: string, id: string): boolean {
  const seen = new Set<string>([id]);
  for (let cur = byId.get(id)?.parentId; cur && !seen.has(cur); cur = byId.get(cur)?.parentId) {
    if (cur === ancestorId) return true;
    seen.add(cur);
  }
  return false;
}

/** One task is the other's ancestor. */
const related = (byId: TaskIndex, a: string, b: string): boolean => isAncestor(byId, a, b) || isAncestor(byId, b, a);

/** How many of `task`'s dependencies name each predecessor (of `type` only, when given). */
function predecessorCounts(task: GanttTask | undefined, type?: DependencyType): Map<string, number> {
  const counts = new Map<string, number>();
  if (!task) return counts;
  for (const dep of taskDependencies(task)) {
    if (type !== undefined && (dep.type ?? 'FS') !== type) continue;
    counts.set(dep.taskId, (counts.get(dep.taskId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Whether adding the link `fromId` → `toId` (`toId` depends on `fromId`) closes a loop through the
 * existing dependencies: `fromId` already depends on `toId`, directly or through other tasks (a
 * link to itself is a loop too). An iterative depth-first search from `fromId` over the
 * predecessors, O(V + E); unknown ids give `false`.
 */
export function wouldCreateCycle(tasks: readonly GanttTask[], fromId: string, toId: string): boolean {
  return fromId === toId || dependsOn(indexTasks(tasks), fromId, toId);
}

/**
 * Why the link `fromId` → `toId` can't be created in `tasks`, or `null`. The checks, in order:
 * a link to itself (`self-link`), an unknown end (`missing-task`), `toId` already depending on
 * `fromId` (`duplicate-link`; of `type` only when given), one end the other's ancestor
 * (`parent-child`, unless `parentChild`), a loop (`cycle`, `wouldCreateCycle`), an end with
 * `editable: false` (`read-only`). Link sessions use it for the preview (`LinkPreview.valid`);
 * without `type` it agrees with `validateChange`.
 */
export function linkError(
  tasks: readonly GanttTask[],
  fromId: string,
  toId: string,
  options: LinkErrorOptions,
): ChangeError | null {
  const labels = options.labels ?? DEFAULT_LABELS;
  if (fromId === toId) return error('self-link', labels.errorSelfLink);
  const byId = indexTasks(tasks);
  const from = byId.get(fromId);
  const to = byId.get(toId);
  if (!from) return error('missing-task', labels.errorUnknownTask(fromId));
  if (!to) return error('missing-task', labels.errorUnknownTask(toId));
  if (predecessorCounts(to, options.type).has(fromId)) return error('duplicate-link', labels.errorDuplicateLink);
  if (!options.parentChild && related(byId, fromId, toId)) return error('parent-child', labels.errorParentChild);
  if (dependsOn(byId, fromId, toId)) return error('cycle', labels.errorCycle);
  if (from.editable === false || to.editable === false) return error('read-only', labels.errorReadOnly);
  return null;
}

/** A field value equal to the task's: dates by time, anything else by `Object.is`. */
function sameValue(a: unknown, b: unknown): boolean {
  return a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : Object.is(a, b);
}

/** A link the change adds: `toId` gains a dependency on `fromId`. */
interface NewLink {
  fromId: string;
  toId: string;
}

/**
 * The first error of `change`, or `null` when it may be applied. The built-in checks (D10), in
 * order, each over the whole change:
 *
 * 1. `read-only` (link rights of a cell edit, source `'cell'`): a new link while
 *    `editing.dependencies.create` is off (`errorLinkCreate`), or fewer links to a predecessor
 *    than before while `editing.dependencies.delete` is off (`errorLinkDelete`). The predecessors
 *    cell is editable with either right (`cellEditable`); changing the type or lag of a link
 *    needs neither.
 * 2. `self-link`: a new link from a task to itself.
 * 3. `missing-task`: an update of an unknown task, a link or unlink whose successor is unknown, a
 *    new link from an unknown task (removing a link to a task that no longer exists is fine).
 * 4. `duplicate-link`: a successor that now depends on the same predecessor more than once, of any
 *    type, where it did not before.
 * 5. `parent-child`: a new link between a task and its own ancestor or descendant, unless
 *    `editing.dependencies.parentChild`.
 * 6. `cycle`: a new link that closes a loop in the proposed tasks.
 * 7. `end-before-start`: an update of `start` / `end` whose task ends before it starts (dates read
 *    like the bars: date-only values as local days).
 * 8. `progress-range`: a `progress` outside 0–100 (or not a number).
 * 9. `read-only`: a change to a task with `editable: false` (a link or unlink touching it at either
 *    end included), to the dates of a `draggable: false` task, to the rolled-up dates or progress
 *    of a parent (`rollup`), or to a task's `id`.
 *
 * A link is new when the successor had no dependency on that predecessor before; links come from
 * the dependency field of the updates and from the `link` ops. The checks hold whatever the source
 * (`'api'`, `'undo'` and `'redo'` included). Then `config.editing.validate(change, { tasks,
 * proposed })`: `false` rejects with `labels.errorRejected`, a string rejects with that string
 * (empty: `errorRejected`), anything else accepts; an exception it throws propagates.
 */
export function validateChange(change: GanttChange, ctx: ValidateChangeContext): ChangeError | null {
  const { tasks, proposed, config } = ctx;
  const labels = ctx.labels ?? DEFAULT_LABELS;
  const before = indexTasks(tasks);
  const after = indexTasks(proposed);

  // The links the change adds: per successor, the predecessors it did not depend on before
  const counted = new Map<string, Map<string, number>>();
  const countsBefore = (id: string) => {
    let c = counted.get(id);
    if (!c) counted.set(id, (c = predecessorCounts(before.get(id))));
    return c;
  };
  const newLinks: NewLink[] = [];
  const seenLinks = new Set<string>();
  const addLink = (fromId: string, toId: string) => {
    const key = `${fromId}\u0000${toId}`;
    if (seenLinks.has(key)) return;
    seenLinks.add(key);
    if (!countsBefore(toId).has(fromId)) newLinks.push({ fromId, toId });
  };
  /** Successors whose dependency field the change rewrites */
  const successors = new Set<string>();
  for (const u of change.updates) {
    if (!('dependency' in u.after)) continue;
    successors.add(u.taskId);
    const task = after.get(u.taskId);
    if (task) for (const dep of taskDependencies(task)) addLink(dep.taskId, u.taskId);
  }
  for (const op of change.ops) {
    if (op.op !== 'link' && op.op !== 'unlink') continue;
    successors.add(op.event.toId);
    if (op.op === 'link') addLink(op.event.fromId, op.event.toId);
  }

  // 1. The link rights of a cell edit (its cell is editable with either one)
  if (change.source === 'cell') {
    const rights = config.editing.dependencies;
    if (!rights.create && newLinks.length > 0) return error('read-only', labels.errorLinkCreate);
    if (!rights.delete) {
      for (const id of successors) {
        const now = predecessorCounts(after.get(id));
        for (const [pred, n] of countsBefore(id))
          if ((now.get(pred) ?? 0) < n) return error('read-only', labels.errorLinkDelete);
      }
    }
  }

  // 2. A link to itself
  if (newLinks.some(l => l.fromId === l.toId)) return error('self-link', labels.errorSelfLink);

  // 3. Missing tasks
  const unknown = (id: string) => error('missing-task', labels.errorUnknownTask(id));
  for (const u of change.updates) if (!before.has(u.taskId)) return unknown(u.taskId);
  for (const id of successors) if (!before.has(id)) return unknown(id);
  for (const l of newLinks) if (!after.has(l.fromId)) return unknown(l.fromId);

  // 4. Duplicates: a predecessor named more often than before, and more than once
  for (const id of successors) {
    const was = countsBefore(id);
    for (const [pred, n] of predecessorCounts(after.get(id)))
      if (n > 1 && n > (was.get(pred) ?? 0)) return error('duplicate-link', labels.errorDuplicateLink);
  }

  // 5. Parent ↔ descendant
  if (!config.editing.dependencies.parentChild && newLinks.some(l => related(after, l.fromId, l.toId)))
    return error('parent-child', labels.errorParentChild);

  // 6. Cycles, in the proposed tasks
  if (newLinks.some(l => dependsOn(after, l.fromId, l.toId))) return error('cycle', labels.errorCycle);

  // 7. End before start, as the dates are drawn
  const day = (d: Date) => (config.normalizeDateOnly ? toLocalDay(d) : d);
  for (const u of change.updates) {
    if (!('start' in u.after) && !('end' in u.after)) continue;
    const task = after.get(u.taskId);
    const start = task?.start;
    const end = task?.end ?? start;
    if (start instanceof Date && end instanceof Date && day(end).getTime() < day(start).getTime())
      return error('end-before-start', labels.errorEndBeforeStart);
  }

  // 8. Progress 0–100
  for (const u of change.updates) {
    if (!('progress' in u.after)) continue;
    const p: unknown = u.after.progress;
    if (p !== undefined && !(typeof p === 'number' && p >= 0 && p <= 100))
      return error('progress-range', labels.errorRange(0, 100));
  }

  // 9. Read-only tasks and fields
  const readOnly = error('read-only', labels.errorReadOnly);
  const rollup = config.rollup;
  let parents: Set<string> | undefined;
  const isParent = (id: string) => {
    if (!parents) {
      parents = new Set();
      for (const t of tasks) if (t.parentId && t.parentId !== t.id) parents.add(t.parentId);
    }
    return parents.has(id);
  };
  for (const u of change.updates) {
    const task = before.get(u.taskId);
    if (!task) continue;
    const changed = (key: keyof GanttTask) => key in u.after && !sameValue(u.after[key], task[key]);
    const dates = changed('start') || changed('end');
    if (
      (task.editable === false && (Object.keys(u.after) as (keyof GanttTask)[]).some(changed)) ||
      changed('id') ||
      (dates && task.draggable === false) ||
      (rollup && dates && rollup.dates && isParent(task.id)) ||
      (rollup && changed('progress') && rollup.progress !== false && isParent(task.id))
    )
      return readOnly;
  }
  const locked = (id: string) => before.get(id)?.editable === false;
  for (const op of change.ops)
    if ((op.op === 'link' || op.op === 'unlink') && (locked(op.event.fromId) || locked(op.event.toId))) return readOnly;
  for (const l of newLinks) if (locked(l.fromId) || locked(l.toId)) return readOnly;

  // Then the app's own check
  const verdict = config.editing.validate?.(change, { tasks, proposed });
  if (verdict === false) return error('custom', labels.errorRejected);
  if (typeof verdict === 'string') return error('custom', verdict || labels.errorRejected);
  return null;
}
