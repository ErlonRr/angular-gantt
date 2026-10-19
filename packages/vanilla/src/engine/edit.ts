/**
 * @file edit.ts
 * The change pipeline (Gantry 2 phase 11, plan §3c): every change to the tasks — a drag or a
 * resize, move mode, the progress grip, a cell, a link, the API, undo and redo — goes through
 * `commit()`, the same algorithm as Angular's `GanttEditorService`:
 *
 *   prepareChange (validate, proposed tasks, events, announcement)
 *     → `before-change` (cancelable: `event.preventDefault()` or `detail.preventDefault()`)
 *     → apply to the raw input (`tasks` as set, or `dataSource.patch()`) + record the history
 *     → one event per op (`task-dragged` | `task-resized` | `task-progress-changed` |
 *       `dependency-created` | `dependency-deleted`) → `task-updated` per task → `tasks-change`
 *     → `history-change` (when the undo / redo state changed) → the announcement
 *
 * Changes are built from the **raw** tasks (`rawTask()`: the app's objects), so undo restores the
 * app's own values; validation reads the normalised tasks (`graph.tasks`), the events carry the raw
 * ones (`before-change`'s proposed tasks and an unapplied `tasks-change`'s are the raw tasks with
 * the change: core `PreparedChange.rawProposed`). A rejection (validation or veto) emits nothing
 * else and is announced. In controlled mode (`editing.controlled`) nothing is applied and no
 * history is kept: the events carry the proposed tasks and `applied: false`. A `tasks` (or
 * `dataSource`) assignment during `before-change` counts as handled the same way. One commit at a
 * time: a commit started meanwhile — by `editing.validate`, a listener — is refused.
 *
 * An undo or redo step that validation rejects (the app's `editing.validate`, a rule the data now
 * breaks) is dropped from the history like a step whose tasks are gone (the rejection is
 * announced); a vetoed one stays.
 *
 * The history (core `GanttHistory`) exists while `editing.history` is on (an element-lifetime
 * effect follows the resolved option: created, reconfigured, dropped); its state is the
 * `historyState` input, which the toolbar and the `canUndo` / `canRedo` getters read. External task
 * changes never clear it (`clear()` is the app's `clearHistory()`).
 */

import {
  applicableChange,
  applyChange,
  bottomScale,
  changeTaskIds,
  createBeforeChangeDetail,
  describeChange,
  fieldLabel,
  findColumn,
  invertChange,
  isEmptyChange,
  prepareChange,
  GanttHistory,
  type AnnounceUnit,
  type ChangeErrorCode,
  type GanttChange,
  type GanttHistoryState,
  type GanttLabels,
  type GanttTask,
  type ResolvedEditing,
  type ResolvedGanttConfig,
} from '@gantryjs/core';
import { createRoot, effect, runWithOwner, untracked, type ReadonlySignal } from '../reactive';
import type { GanttDataSource } from '../datasource/gantt-datasource';
import type { Columns } from '../interaction/columns';
import type { Emit } from '../layers/context';
import type { Graph } from './engine';
import { EMPTY_HISTORY, structuralEqual, type Inputs } from './inputs';

/** How a change is recorded: a new step, or the undo / redo of the history's top step. */
export type CommitMode = 'record' | 'undo' | 'redo';

export interface CommitOptions {
  /**
   * Announce a rejection (validation or veto) in the live region. Default `true`; a cell editor
   * passes `false` and shows `rejection.message` under the cell instead.
   */
  announceRejection?: boolean | undefined;
}

/** Why the last `commit()` did not run. */
export interface ChangeRejection {
  /** A validation code (core `ChangeErrorCode`), or `'vetoed'` (`before-change` was prevented) */
  readonly code: ChangeErrorCode | 'vetoed';
  /** The reason, a label (`errorCycle`, `errorRejected`, …): what a cell editor shows */
  readonly message: string;
}

/** The change pipeline and the history (`ctx.edit`; Angular: `GanttEditorService`). */
export interface Editor {
  /**
   * Runs `change` through the pipeline (see the file comment). `mode`: `'record'` records a new
   * undo step; `'undo'` / `'redo'` move the history's top step once the change is applied. Returns
   * `true` when the change ran (applied, or handed to the app in controlled mode), `false` when it
   * was empty, rejected or vetoed, or while another commit runs (a listener of its events).
   */
  commit(change: GanttChange, mode?: CommitMode, options?: CommitOptions): boolean;
  /** Undoes the last step (`false`: nothing to undo, no history, rejected or vetoed). */
  undo(): boolean;
  /** Redoes the last undone step. */
  redo(): boolean;
  /** Empties the history (`clearHistory()`). */
  clear(): void;
  /** The undo / redo state (`EMPTY_HISTORY` while the chart keeps no history) */
  readonly state: ReadonlySignal<GanttHistoryState>;
  /** Why the last `commit()` returned `false` (`null` after one that ran or an empty change) */
  readonly rejection: ChangeRejection | null;
  /** The raw tasks: the data source's items while one is set, else `tasks` as set */
  rawTasks(): readonly GanttTask[];
  /** The raw task with this id (the app's object; build changes from it), `undefined` when unknown */
  rawTask(id: string): GanttTask | undefined;
}

export interface EditorDeps {
  readonly inputs: Inputs;
  readonly graph: Pick<Graph, 'tasks' | 'config' | 'i18n'>;
  readonly columns: Pick<Columns, 'catalogue'>;
  readonly emit: Emit;
  /** Polite announcement (the engine skips empty text and everything before the first render) */
  readonly announce: (text: string) => void;
  /** Monotonic ms clock of the history's coalescing window (default `performance.now()`) */
  readonly clock?: (() => number) | undefined;
}

/** What the change is applied to: the data source's items, or `tasks` as set. */
interface Source {
  readonly ds: GanttDataSource | null;
  readonly items: readonly GanttTask[];
}

/** Id → first task with it, rebuilt when the array changes. */
function indexer(): (list: readonly GanttTask[]) => ReadonlyMap<string, GanttTask> {
  let last: readonly GanttTask[] | null = null;
  let byId = new Map<string, GanttTask>();
  return list => {
    if (list !== last) {
      last = list;
      byId = new Map();
      for (const t of list) if (!byId.has(t.id)) byId.set(t.id, t);
    }
    return byId;
  };
}

/** The scale's unit for date amounts in sentences: hours on hour scales (as `prepareChange`). */
const unitOf = (config: Pick<ResolvedGanttConfig, 'scales'>): AnnounceUnit =>
  bottomScale(config.scales).unit === 'hour' ? 'hour' : 'day';

const defaultClock = (): number => globalThis.performance?.now() ?? Date.now();

export function createEditor(deps: EditorDeps): Editor {
  const { inputs: I, graph: G, emit, announce } = deps;
  const clock = deps.clock ?? defaultClock;
  const rawIndex = indexer();
  const taskIndex = indexer();

  let history: GanttHistory | null = null;
  let historyOptions: ResolvedEditing['history'] = false;
  let committing = false;
  let rejection: ChangeRejection | null = null;

  const source = (): Source => {
    const ds = I.dataSource.peek();
    return { ds, items: ds ? ds.items : I.tasksIn.peek() };
  };
  const rawTasks = (): readonly GanttTask[] => source().items;

  /** A column's header (the cell edit's announcement and history label), else the field's word. */
  const columnLabel =
    (labels: GanttLabels) =>
    (key: string): string => {
      const { columns, builtins } = deps.columns.catalogue.peek();
      return findColumn(columns, builtins, key)?.label ?? fieldLabel(key, labels);
    };
  const nameOf = (id: string): string => taskIndex(G.tasks.peek()).get(id)?.name ?? id;
  /** The history's undo / redo labels: the change as made, with the current names and language */
  const describe = (change: GanttChange): string => {
    try {
      const labels = G.i18n.peek().labels;
      return describeChange(change, nameOf, labels, unitOf(G.config.peek()), columnLabel(labels));
    } catch {
      return ''; // invalid options: nothing renders
    }
  };

  /** Writes the history state; `history-change` when it changed. */
  const publishHistory = (): void => {
    const next = history ? history.state : EMPTY_HISTORY;
    if (structuralEqual(I.historyState.peek(), next)) return;
    I.historyState.set(next);
    emit('history-change', next === EMPTY_HISTORY ? { ...EMPTY_HISTORY } : next);
  };

  /** Follows `editing.history`: creates, reconfigures (trims) or drops the history. */
  const syncHistory = (options: ResolvedEditing['history']): void => {
    if (options === false) {
      historyOptions = false;
      if (!history) return;
      history = null;
      publishHistory();
      return;
    }
    if (history && historyOptions && structuralEqual(historyOptions, options)) return;
    historyOptions = options;
    if (history) history.configure(options);
    else history = new GanttHistory(options, describe);
    publishHistory();
  };
  // Element lifetime (like the element's own effects): the option is followed while disconnected too
  runWithOwner(createRoot(), () => {
    effect(() => {
      let options: ResolvedEditing['history'];
      try {
        options = G.config().editing.history;
      } catch {
        return; // invalid options: the render reports them
      }
      untracked(() => syncHistory(options));
    });
  });

  const reject = (why: ChangeRejection, labels: GanttLabels, options: CommitOptions): false => {
    rejection = why;
    if (options.announceRejection !== false) announce(labels.announceChangeRejected(why.message));
    return false;
  };

  /** Applies `change` to the raw tasks (the data source keeps its paging state). */
  const apply = (src: Source, change: GanttChange): void => {
    const ds = src.ds;
    if (!ds) {
      I.tasksIn.set(applyChange(src.items, change));
      return;
    }
    ds.patch(items => applyChange(items, change));
    // Connected, the subscription has mirrored it already; disconnected, mirror it now
    if (I.tasksIn.peek() !== ds.items) I.tasksIn.set(ds.items);
  };

  const commit = (change: GanttChange, mode: CommitMode = 'record', options: CommitOptions = {}): boolean => {
    rejection = null;
    if (committing || isEmptyChange(change)) return false;
    let config: ResolvedGanttConfig;
    let labels: GanttLabels;
    try {
      config = G.config.peek();
      labels = G.i18n.peek().labels;
    } catch {
      return false; // invalid options: nothing renders, nothing is edited
    }

    // From validation on (`editing.validate` may call the API): a nested commit is refused
    committing = true;
    try {
      const before = source();
      const r = prepareChange(change, {
        tasks: G.tasks.peek(),
        raw: before.items,
        config,
        labels,
        columnLabel: columnLabel(labels),
      });
      if (!r.ok) return reject({ code: r.code, message: r.message }, labels, options);
      if (isEmptyChange(r.change)) return false;

      const detail = createBeforeChangeDetail(r.change, r.rawProposed);
      // Synchronous veto, either way (D6); a nested commit meanwhile is refused (`committing`)
      const dispatched = emit('before-change', detail);
      if (!dispatched || detail.defaultPrevented) {
        return reject({ code: 'vetoed', message: labels.errorRejected }, labels, options);
      }
      const after = source();
      // Controlled, or the app assigned the tasks during `before-change`: handled by the app
      const applied = !config.editing.controlled && after.ds === before.ds && after.items === before.items;
      if (applied) {
        apply(before, r.change);
        if (history) {
          if (mode === 'record') history.record(r.change, clock());
          else if (mode === 'undo') history.commitUndo();
          else history.commitRedo();
        }
      }
      for (const e of r.events) emit(e.type, e.detail);
      // Applied: the raw array itself, so a framework assigning it back changes nothing; else the
      // raw tasks with the change (the app's own objects: setting them keeps its data)
      const tasks = applied ? (source().items as GanttTask[]) : r.rawProposed;
      emit('tasks-change', { tasks, change: r.change, applied });
      publishHistory();
      announce(r.announcement);
      return true;
    } finally {
      committing = false;
    }
  };

  /** The last commit was rejected by validation (not vetoed): its history step can't run again. */
  const invalidStep = (): boolean => rejection !== null && rejection.code !== 'vetoed';

  /** A history step with nothing left to apply (its tasks are gone): announced, the caller drops it. */
  const gone = (change: GanttChange): boolean => {
    if (!isEmptyChange(applicableChange(change, G.tasks.peek()))) return false;
    try {
      const labels = G.i18n.peek().labels;
      announce(labels.announceChangeRejected(labels.errorUnknownTask(changeTaskIds(change)[0] ?? '')));
    } catch {
      // invalid options: nothing renders
    }
    return true;
  };

  return {
    commit,
    undo() {
      const h = history;
      const step = committing ? null : h?.peekUndo();
      if (!h || !step) return false;
      const inverse = invertChange(step, 'undo');
      if (gone(inverse)) {
        h.drop();
        publishHistory();
        return false;
      }
      if (commit(inverse, 'undo')) return true;
      // Rejected by validation (announced): dropped, as a step whose tasks are gone
      if (invalidStep() && h === history && h.peekUndo() === step) {
        h.drop();
        publishHistory();
      }
      return false;
    },
    redo() {
      const h = history;
      const step = committing ? null : h?.peekRedo();
      if (!h || !step) return false;
      const again: GanttChange = { ...step, source: 'redo' };
      /** Discard the redo step: back on the undo stack, then dropped from it */
      const discard = (): void => {
        h.commitRedo();
        h.drop();
        publishHistory();
      };
      if (gone(again)) {
        discard();
        return false;
      }
      if (commit(again, 'redo')) return true;
      // Rejected by validation (announced): dropped, as a step whose tasks are gone
      if (invalidStep() && h === history && h.peekRedo() === step) discard();
      return false;
    },
    clear() {
      history?.clear();
      publishHistory();
    },
    state: I.historyState,
    get rejection() {
      return rejection;
    },
    rawTasks,
    rawTask: id => rawIndex(rawTasks()).get(id),
  };
}
