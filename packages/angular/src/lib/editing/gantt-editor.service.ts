// ─────────────────────────────────────────────────────────────
//  gantry · editing/gantt-editor.service.ts
//
//  The change pipeline (Gantry 2 phase 11, plan §3c), the Web Component's
//  `engine/edit.ts`. Every task change — a pointer drag or resize, move
//  mode, the progress grip, a cell, a link, the API, undo / redo — is one
//  `GanttChange` (core `dragChange`, `taskChange`, `linkChange`…) that
//  goes through `commit`:
//
//    core `prepareChange` (validation, the proposed tasks, the events,
//    the announcement) → `beforeChange` (vetoed by its `preventDefault()`)
//    → apply to the raw input (`dataSource.patch`, else the `[(series)]`
//    model) and record the history → one event per op (`taskDragged`,
//    `taskResized`, `taskProgressChanged`, `dependencyCreated`,
//    `dependencyDeleted`), `taskUpdated` per task → `tasksChange` →
//    `historyChange` (only when the undo state changed) → the
//    announcement. A rejected or vetoed change emits nothing else and is
//    announced (`announceChangeRejected`; a cell editor shows `rejection`
//    instead). One commit at a time: a change one of its listeners starts
//    is refused.
//
//  Nothing is applied in controlled mode (`editing.controlled`) or when
//  the app wrote the source during `beforeChange` (`series.set()`,
//  `dataSource.setStatic()`…, D6): the events carry the proposed tasks
//  with `applied: false`, and no step is recorded. Changes are built from
//  the raw tasks (`rawTask`), so undo restores the app's own values;
//  validation reads the normalised tasks (`layout.tasks`), the events the
//  raw ones (`beforeChange`'s proposed tasks and an unapplied
//  `tasksChange`'s are the raw tasks with the change: core
//  `PreparedChange.rawProposed`, so an app that sets them keeps its data).
//
//  The history (core `GanttHistory`) follows `editing.history` for the
//  chart's lifetime (`syncHistory`, from GantryComponent's effect; a
//  commit catches up first): created when it turns on, re-configured
//  (trimmed) when its limit or window changes, dropped when it turns off
//  (`historyChange` when that empties a non-empty state). Its state
//  (`state`, bound into `layout.historyState`) feeds `canUndo` /
//  `canRedo` and the toolbar's Undo / Redo. Undo and redo skip the tasks
//  that are gone; a step with nothing left is dropped and announced, and
//  so is a step validation rejects (a vetoed one stays).
// ─────────────────────────────────────────────────────────────

import { Injectable, inject, signal, untracked, type Signal } from '@angular/core';
import {
  GanttHistory,
  applicableChange,
  applyChange,
  bottomScale,
  changeTaskIds,
  createBeforeChangeDetail,
  describeChange,
  fieldLabel,
  invertChange,
  isEmptyChange,
  prepareChange,
  type AnnounceUnit,
  type ChangeErrorCode,
  type EditEventEntry,
  type EditEventMap,
  type GanttBeforeChangeEvent,
  type GanttChange,
  type GanttHistoryState,
  type GanttTask,
  type GanttTasksChangeEvent,
  type ResolvedEditing,
} from '@gantryjs/core';

import { GanttLayoutService, EMPTY_HISTORY_STATE } from '../layout/gantt-layout.service';
import { GanttI18nService } from '../services/gantt-i18n.service';
import { GanttAnnouncer } from '../a11y/announcer';

/** The events of the pipeline, by the Web Component's names (the chart emits each through its output). */
export interface GanttEditorEvents extends EditEventMap {
  'before-change': GanttBeforeChangeEvent;
  'tasks-change': GanttTasksChangeEvent;
  'history-change': GanttHistoryState;
}

/** What the chart gives its editor (`bind`, once, in GantryComponent's constructor). */
export interface GanttEditorHost {
  /** The raw tasks the changes apply to: the data source's items, else the `series` model (read untracked) */
  source(): GanttTask[];
  /** Writes them: `dataSource.patch(update)`, else `series.update(update)` */
  write(update: (items: readonly GanttTask[]) => GanttTask[]): void;
  /** Emits an event through the chart's output */
  readonly emit: <K extends keyof GanttEditorEvents>(type: K, detail: GanttEditorEvents[K]) => void;
  /** The header of a column key (a cell edit's announcement and undo label) */
  columnLabel(key: string): string;
}

/** What a commit does to the history: record a new step (default), or move the undo / redo top. */
export type GanttCommitMode = 'record' | 'undo' | 'redo';

export interface GanttCommitOptions {
  /**
   * Announce a rejection (validation or veto) in the live region. Default `true`; a cell editor
   * passes `false` and shows `rejection.message` under the cell instead.
   */
  announceRejection?: boolean | undefined;
}

/** Why the last `commit()` did not run. */
export interface GanttChangeRejection {
  /** A validation code (core `ChangeErrorCode`), or `'vetoed'` (`beforeChange` was prevented) */
  readonly code: ChangeErrorCode | 'vetoed';
  /** The reason, a label (`errorCycle`, `errorRejected`, …): what a cell editor shows */
  readonly message: string;
}

/** `editing.history` as resolved: the history's settings, or `false` (no history) */
export type GanttHistorySettings = ResolvedEditing['history'];

/** Same history settings (limit and window), or both off */
export const sameHistorySettings = (a: GanttHistorySettings, b: GanttHistorySettings): boolean =>
  a === b || (!!a && !!b && a.limit === b.limit && a.coalesceMs === b.coalesceMs);

/** Same undo / redo state, field by field */
const sameState = (a: GanttHistoryState, b: GanttHistoryState): boolean =>
  a === b ||
  (a.canUndo === b.canUndo &&
    a.canRedo === b.canRedo &&
    a.undoLabel === b.undoLabel &&
    a.redoLabel === b.redoLabel &&
    a.undoCount === b.undoCount &&
    a.redoCount === b.redoCount);

/** The snap unit of the scale: hours on hour scales, else days (the announcements' date amounts) */
const unitOf = (scales: Parameters<typeof bottomScale>[0]): AnnounceUnit =>
  bottomScale(scales).unit === 'hour' ? 'hour' : 'day';

@Injectable()
export class GanttEditorService {
  private readonly layout = inject(GanttLayoutService);
  private readonly i18n = inject(GanttI18nService);
  private readonly announcer = inject(GanttAnnouncer);

  private host: GanttEditorHost | null = null;
  /** A commit is running: a change one of its listeners starts is refused (no nested commit) */
  private committing = false;
  private _rejection: GanttChangeRejection | null = null;

  /** The clock of the history's coalescing window (ms, monotonic); tests replace it. */
  clock: () => number = () => globalThis.performance?.now() ?? Date.now();

  /** Why the last `commit()` returned `false` (`null` after one that ran, or an empty change) */
  get rejection(): GanttChangeRejection | null {
    return this._rejection;
  }

  /** The history while `editing.history` is on (`syncHistory`) */
  private history: GanttHistory | null = null;
  /** The settings it was made or configured with */
  private historySettings: GanttHistorySettings = false;

  private readonly _state = signal<GanttHistoryState>(EMPTY_HISTORY_STATE);
  /**
   * The undo / redo state (`historyChange`'s detail): `EMPTY_HISTORY_STATE` while the chart keeps no
   * history. The same object until a value changes.
   */
  readonly state: Signal<GanttHistoryState> = this._state.asReadonly();

  /** The chart's source, outputs and column headers (GantryComponent, once). */
  bind(host: GanttEditorHost): void {
    this.host = host;
  }

  /**
   * Follows `editing.history` (GantryComponent's effect, and each commit first): creates the
   * history, re-configures it (trimmed to a new limit) or drops it (`false`); `historyChange` when
   * the state changed.
   */
  syncHistory(settings: GanttHistorySettings): void {
    untracked(() => {
      if (settings === false) {
        this.historySettings = false;
        if (!this.history) return;
        this.history = null;
        this.publish();
        return;
      }
      if (this.history && sameHistorySettings(this.historySettings, settings)) return;
      this.historySettings = settings;
      if (this.history) this.history.configure(settings);
      else this.history = new GanttHistory(settings, change => this.describe(change));
      this.publish();
    });
  }

  /** The raw task with `id` (the data source's item or the `series` entry), `undefined` when there is none. */
  rawTask(id: string): GanttTask | undefined {
    return this.host?.source().find(t => t.id === id);
  }

  /** The raw tasks changes apply to (empty before the chart binds its source). */
  rawTasks(): readonly GanttTask[] {
    return this.host?.source() ?? [];
  }

  /**
   * Runs `change` through the pipeline (see the file header). Returns `true` when the change ran
   * (applied, or handed to the app in controlled mode), `false` when it was empty, rejected (the
   * reason is announced and kept in `rejection`) or vetoed, or while another commit runs (a listener
   * of its events). `mode` says what the history does with it: record a step, or move the undo /
   * redo top (`undo()` / `redo()`).
   */
  commit(change: GanttChange, mode: GanttCommitMode = 'record', options: GanttCommitOptions = {}): boolean {
    this._rejection = null;
    const host = this.host;
    if (!host || this.committing || isEmptyChange(change)) return false;
    this.committing = true;
    try {
      return untracked(() => {
        this.syncHistory(this.layout.cfg().editing.history);
        return this.run(host, change, mode, options);
      });
    } finally {
      this.committing = false;
    }
  }

  /** Undoes the last step: `false` when there is nothing to undo, or it was rejected or vetoed. */
  undo(): boolean {
    return untracked(() => {
      if (!this.committing) this.syncHistory(this.layout.cfg().editing.history);
      const history = this.history;
      const step = this.committing ? null : history?.peekUndo();
      if (!history || !step) return false;
      const inverse = invertChange(step, 'undo');
      if (this.gone(inverse)) {
        history.drop();
        this.publish();
        return false;
      }
      if (this.commit(inverse, 'undo')) return true;
      // Rejected by validation (announced): dropped, as a step whose tasks are gone
      if (this.invalidStep() && history === this.history && history.peekUndo() === step) {
        history.drop();
        this.publish();
      }
      return false;
    });
  }

  /** Redoes the last undone step: `false` when there is nothing to redo, or it was rejected or vetoed. */
  redo(): boolean {
    return untracked(() => {
      if (!this.committing) this.syncHistory(this.layout.cfg().editing.history);
      const history = this.history;
      const step = this.committing ? null : history?.peekRedo();
      if (!history || !step) return false;
      const again: GanttChange = { ...step, source: 'redo' };
      /** Discard the redo step: back on the undo stack, then dropped from it */
      const discard = (): void => {
        history.commitRedo();
        history.drop();
        this.publish();
      };
      if (this.gone(again)) {
        discard();
        return false;
      }
      if (this.commit(again, 'redo')) return true;
      // Rejected by validation (announced): dropped, as a step whose tasks are gone
      if (this.invalidStep() && history === this.history && history.peekRedo() === step) discard();
      return false;
    });
  }

  /** Empties the undo and redo stacks (`historyChange` when they had steps). */
  clear(): void {
    this.history?.clear();
    this.publish();
  }

  private run(host: GanttEditorHost, change: GanttChange, mode: GanttCommitMode, options: GanttCommitOptions): boolean {
    const labels = this.i18n.labels();
    const config = this.layout.cfg();
    const source = host.source();
    const r = prepareChange(change, {
      tasks: this.layout.tasks(),
      raw: source,
      config,
      labels,
      columnLabel: key => host.columnLabel(key),
    });
    if (!r.ok) return this.reject({ code: r.code, message: r.message }, options);
    if (isEmptyChange(r.change)) return false;

    const detail = createBeforeChangeDetail(r.change, r.rawProposed);
    // Synchronous veto (D6); a change a listener starts meanwhile is refused (`committing`)
    host.emit('before-change', detail);
    if (detail.defaultPrevented) return this.reject({ code: 'vetoed', message: labels.errorRejected }, options);

    // An app that wrote the source meanwhile handled the change itself (D6)
    const applied = !config.editing.controlled && host.source() === source;
    const history = applied ? this.history : null;
    if (applied) {
      host.write(items => applyChange(items, r.change));
      if (history) {
        if (mode === 'record') history.record(r.change, this.clock());
        else if (mode === 'undo') history.commitUndo();
        else history.commitRedo();
      }
    }
    for (const e of r.events) this.emitEntry(host, e);
    // Applied: the raw array itself, so a binding writing it back changes nothing; else the raw
    // tasks with the change (the app's own objects: setting them keeps its data)
    host.emit('tasks-change', { tasks: applied ? host.source() : r.rawProposed, change: r.change, applied });
    this.publish();
    if (r.announcement) this.announcer.announce(r.announcement);
    return true;
  }

  /** The last commit was rejected by validation (not vetoed): its history step can't run again. */
  private invalidStep(): boolean {
    return this._rejection !== null && this._rejection.code !== 'vetoed';
  }

  /** A rejected or vetoed change: kept for a cell editor, announced unless it shows it itself. */
  private reject(why: GanttChangeRejection, options: GanttCommitOptions): false {
    this._rejection = why;
    if (options.announceRejection !== false) {
      this.announcer.announce(this.i18n.labels().announceChangeRejected(why.message));
    }
    return false;
  }

  /** A history step with nothing left to apply (its tasks are gone): announced, the caller drops it. */
  private gone(change: GanttChange): boolean {
    if (!isEmptyChange(applicableChange(change, this.layout.tasks()))) return false;
    const labels = this.i18n.labels();
    this.announcer.announce(labels.announceChangeRejected(labels.errorUnknownTask(changeTaskIds(change)[0] ?? '')));
    return true;
  }

  /** Writes the history state; `historyChange` when it changed. */
  private publish(): void {
    untracked(() => {
      const next = this.history ? this.history.state : EMPTY_HISTORY_STATE;
      if (sameState(this._state(), next)) return;
      this._state.set(next);
      this.host?.emit('history-change', next === EMPTY_HISTORY_STATE ? { ...EMPTY_HISTORY_STATE } : next);
    });
  }

  /** One op or `taskUpdated` event (the entry's name and detail belong together). */
  private emitEntry(host: GanttEditorHost, entry: EditEventEntry): void {
    const emit: (type: EditEventEntry['type'], detail: EditEventEntry['detail']) => void = host.emit;
    emit(entry.type, entry.detail);
  }

  /** The words for a history step (`undoLabel` / `redoLabel`): read when the state is, with the names then. */
  private describe(change: GanttChange): string {
    return untracked(() => {
      const labels = this.i18n.labels();
      const names = new Map(this.layout.tasks().map(t => [t.id, t.name]));
      const host = this.host;
      return describeChange(
        change,
        id => names.get(id) ?? id,
        labels,
        unitOf(this.layout.cfg().scales),
        key => (host ? host.columnLabel(key) : fieldLabel(key, labels)),
      );
    });
  }
}
