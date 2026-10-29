// ─────────────────────────────────────────────────────────────
//  gantry · editing/cell-edit.ts
//
//  Editing a task-list cell (D14–D16 of Gantry 2 phase 11), the Web
//  Component's `interaction/cell-edit.ts`, through core
//  `resolveCellEditor`, `commitCellValue`, `reduceCellEdit` (and
//  `cellEditKey`, in `a11y/grid-keys.ts`):
//
//   - `start()` opens the editor of a cell the task list shows when core
//     `resolveCellEditor` allows it (`editing.cells`, the row's
//     `editRules`, the column's `editable`): `layout.cellEdit` =
//     `reduceCellEdit(null, { type: 'start', … })`, seeded with a typed
//     character when `seed` is given. The row is pinned in the virtual
//     window (`focusedRowId`) and the editor is focused after the next
//     render (its `editor:<id>:<column>` key, `takeFocusRequest()`, read
//     by the task list). The task list mounts it (§3d). An editor already
//     open elsewhere is finished first, as a blur.
//   - `commit()` parses and validates the text (`commitCellValue`), then
//     commits `taskChange(editor.rawTask(id), patch, 'cell', { column,
//     coalesceKey: 'cell:<id>:<column>' })` through the chart's editor
//     (`announceRejection: false`). The unchanged text closes the editor
//     with no change. An error, or the pipeline's rejection (a loop, a
//     vetoed change…), keeps it open: `aria-invalid`, the message under
//     the cell and in the alert region (`alert`, the chart's
//     `.gantt-sr-alert`). `'next'` / `'prev'` then edit the next /
//     previous editable cell of the row; at the row's end the cell keeps
//     focus.
//   - `cancel()` closes the editor without a change (Escape, a custom
//     editor's `cancel()`, the chart destroyed). Focus returns to
//     `cell:<id>:<column>` when the editor held it.
//   - `blur()` (focus left the editor): commit when valid, else cancel
//     (the reason is announced politely).
//
//  The open editor is resolved against the row the list shows now: when
//  the row's task changes while it is open (a live update, a rollup), it
//  is resolved again and the text is kept. A custom editor (an
//  `<ng-template ganttCellEditor>` or a function) gets a live
//  `CellEditorContext` whose actions only act on its own edit.
// ─────────────────────────────────────────────────────────────

import { DOCUMENT, DestroyRef, Injectable, computed, inject, signal, untracked, type Signal } from '@angular/core';
import {
  commitCellValue,
  isEmptyChange,
  reduceCellEdit,
  resolveCellEditor,
  rollupSource,
  taskChange,
  type CellEditState,
  type CellEditorContext,
  type CellEditorKind,
  type ColumnDef as CoreColumnDef,
  type GanttFlatRow,
  type ResolvedCellEditor,
} from '@gantryjs/core';

import { type ColumnDef } from '../types';
import { GanttLayoutService } from '../layout/gantt-layout.service';
import { GanttColumnService } from '../columns/gantt-column.service';
import { GanttI18nService } from '../services/gantt-i18n.service';
import { GanttAnnouncer } from '../a11y/announcer';
import { findFocusKey, focusIntoView, isInert } from '../a11y/grid-keys';
import { GanttEditorService } from './gantt-editor.service';

/** `data-focus-key` of a cell editor's field (what is focused when it opens). */
export const editorFocusKey = (taskId: string, columnKey: string): string => `editor:${taskId}:${columnKey}`;

/** The open editor, resolved against the row the list shows now. */
export interface CellEditSession {
  readonly taskId: string;
  readonly columnKey: string;
  readonly column: ColumnDef;
  readonly row: GanttFlatRow;
  readonly editor: ResolvedCellEditor;
  /** What a custom editor is built with: live getters, actions of this edit only (one per `start`) */
  readonly context: CellEditorContext;
  /** Opened by a typed character: its text is not selected when it gets focus */
  readonly seeded: boolean;
}

/** What a cell edits with: its row, column and resolved editor. */
interface Resolved {
  readonly row: GanttFlatRow;
  readonly column: ColumnDef;
  readonly editor: ResolvedCellEditor;
}

const sameCell = (state: CellEditState, taskId: string, columnKey: string): boolean =>
  state !== null && state.taskId === taskId && state.columnKey === columnKey;

@Injectable()
export class GanttCellEditService {
  private readonly layout = inject(GanttLayoutService);
  private readonly colSvc = inject(GanttColumnService);
  private readonly editor = inject(GanttEditorService);
  private readonly i18n = inject(GanttI18nService);
  private readonly announcer = inject(GanttAnnouncer);
  private readonly doc = inject(DOCUMENT);

  /** The open edit (re-resolved when its row changes) */
  private open: CellEditSession | null = null;
  private readonly _opened = signal<CellEditSession | null>(null);
  /**
   * The edit the task list mounts an editor for: a new object per `start()`, `null` once closed
   * (never re-resolved: its identity is the edit's).
   */
  readonly opened: Signal<CellEditSession | null> = this._opened.asReadonly();

  private readonly _alert = signal('');
  /** The editor's message for the chart's alert region (`.gantt-sr-alert`), `''` = none */
  readonly alert: Signal<string> = this._alert.asReadonly();
  /** The text this editor put in the alert region (cleared when it closes, unless replaced) */
  private alerted: string | null = null;

  /** `data-focus-key` to focus after the next render (the task list takes it) */
  private focusRequest: string | null = null;
  /** The task list's element (`connect`), in the browser */
  private list: HTMLElement | null = null;

  /** The task list's columns in the current view (as GantryComponent resolves them) */
  private readonly columns = computed<ColumnDef[]>(() => this.colSvc.columnsFor(this.layout.view(), this.layout.cfg()));

  constructor() {
    // The chart goes: the editor closes without a change
    inject(DestroyRef).onDestroy(() => {
      this.open = null;
      this.focusRequest = null;
      this.list = null;
    });
  }

  // ── The API (plan §3f) ────────────────────────────────────

  /**
   * Opens the editor of `columnKey`'s cell on `taskId`'s row, its text seeded with `seed` (a typed
   * character); `false` when that cell can't be edited (`editing.cells` off, a read-only cell, a
   * hidden row or column, the chart view, a chart that is not ready).
   */
  start(taskId: string, columnKey: string, seed?: string): boolean {
    return untracked(() => {
      const state = this.layout.cellEdit();
      if (sameCell(state, taskId, columnKey) && this.current()) return true;
      // Another editor open: finished as if it lost focus
      if (state) this.finish(undefined, true);
      try {
        if (this.layout.chartState().kind !== 'ready') return false;
      } catch {
        return false;
      }
      const r = this.resolve(taskId, columnKey);
      if (!r) return false;
      const open: CellEditSession = {
        ...r,
        taskId,
        columnKey,
        context: this.contextFor(r),
        seeded: seed !== undefined,
      };
      this.open = open;
      this._opened.set(open);
      this.layout.cellEdit.set(reduceCellEdit(null, { type: 'start', taskId, columnKey, value: r.editor.value, seed }));
      // Pinned in the virtual window: mounted wherever it is, focused (and scrolled to) after the render
      this.layout.focusedRowId.set(taskId);
      this.focusRequest = editorFocusKey(taskId, columnKey);
      return true;
    });
  }

  /** The cell being edited, `null` when none is. */
  active(): { taskId: string; columnKey: string } | null {
    const state = untracked(this.layout.cellEdit);
    return state ? { taskId: state.taskId, columnKey: state.columnKey } : null;
  }

  /**
   * Parses, validates and applies the editor's text; `'next'` / `'prev'` then edits the next /
   * previous editable cell of the row. `false` when nothing is edited or the value is invalid (the
   * editor stays open with the message).
   */
  commit(move?: 'next' | 'prev'): boolean {
    return untracked(() => this.finish(move, false));
  }

  /** Closes the editor without a change (focus back on its cell when the editor held it). */
  cancel(): void {
    untracked(() => {
      const state = this.layout.cellEdit();
      if (state) this.close(this.focusIn(state));
    });
  }

  // ── The task list's side ──────────────────────────────────

  /** The open editor, resolved against the row the list shows now (`null`: none, or its row is hidden). */
  session(): CellEditSession | null {
    return untracked(() => this.current());
  }

  /** The editor kind of a cell, `null` when it can't be edited (decides what F2, Enter and typing do). */
  kindOf(taskId: string, columnKey: string): CellEditorKind | 'custom' | null {
    return untracked(() => this.resolve(taskId, columnKey)?.editor.kind ?? null);
  }

  /** The editor's current text (a built-in editor's value when it mounts). */
  text(): string | null {
    return untracked(this.layout.cellEdit)?.value ?? null;
  }

  /** The editor's text changed (a built-in editor's `input` event, a custom editor's `setValue`). */
  input(value: string): void {
    untracked(() => {
      const state = this.layout.cellEdit();
      const next = reduceCellEdit(state, { type: 'input', value });
      if (next === state) return;
      this.layout.cellEdit.set(next);
      // The error is gone with the text that caused it
      if (state?.error) this.clearAlert();
    });
  }

  /** Focus left the editor: commit when valid, else cancel. */
  blur(): void {
    untracked(() => {
      if (this.layout.cellEdit()) this.finish(undefined, true);
    });
  }

  /** The control (`data-focus-key`) to focus after this render, cleared; `null`: none. */
  takeFocusRequest(): string | null {
    const key = this.focusRequest;
    this.focusRequest = null;
    return key;
  }

  /** The task list's element (after its first render, in the browser); returns the release. */
  connect(list: HTMLElement): () => void {
    this.list = list;
    return () => {
      if (this.list === list) this.list = null;
    };
  }

  // ── Internals ─────────────────────────────────────────────

  /** The editor of a cell the task list shows, `null` when it can't be edited. */
  private resolve(taskId: string, columnKey: string): Resolved | null {
    try {
      const config = this.layout.cfg();
      if (!config.editing.cells || this.layout.view() === 'chart') return null;
      const row = this.layout.geometryById().get(taskId)?.row;
      const column = this.columns().find(c => c.key === columnKey);
      if (!row || !column) return null;
      const labels = this.i18n.labels();
      const rules = this.layout.editRules()(row);
      const editor = resolveCellEditor(column as CoreColumnDef, row, {
        config,
        ctx: this.layout.columnContext(),
        labels,
        rules,
      });
      return editor && { row, column, editor };
    } catch {
      return null; // not configured yet: nothing renders, nothing is edited
    }
  }

  /**
   * The open editor, resolved again when its row changed (the text in the state is kept); `null`
   * while its row is not shown (removed, under a collapsed parent).
   */
  private current(): CellEditSession | null {
    const state = this.layout.cellEdit();
    const open = this.open;
    if (!state || !open || !sameCell(state, open.taskId, open.columnKey)) return null;
    let row: GanttFlatRow | undefined;
    try {
      row = this.layout.geometryById().get(state.taskId)?.row;
    } catch {
      return null;
    }
    if (!row) return null;
    if (row !== open.row) {
      const again = this.resolve(state.taskId, state.columnKey);
      if (again) this.open = { ...open, ...again };
    }
    return this.open;
  }

  /** The focused element where the task list lives (its document or shadow root). */
  private activeElement(): Element | null {
    const root = this.list?.getRootNode() as Partial<DocumentOrShadowRoot> | undefined;
    return root?.activeElement ?? this.doc.activeElement;
  }

  /** Focus is in the cell being edited (on the cell itself or in its editor). */
  private focusIn(state: NonNullable<CellEditState>): boolean {
    const cell = this.activeElement()?.closest('.gantt-tl-cell');
    return cell?.getAttribute('data-focus-key') === `cell:${state.taskId}:${state.columnKey}`;
  }

  /** Puts `message` in the alert region (the same message again is read again: its text changes). */
  private say(message: string): void {
    const text = this._alert() === message ? `${message}\u00a0` : message;
    this._alert.set(text);
    this.alerted = text;
  }

  /** Clears the alert region when it still holds this editor's message. */
  private clearAlert(): void {
    if (this.alerted !== null && this._alert() === this.alerted) this._alert.set('');
    this.alerted = null;
  }

  /** Focuses the control with `key` in the task list now when it is mounted, else after the next render. */
  private focus(key: string): void {
    const el = this.list ? findFocusKey(this.list, key) : null;
    if (el && !isInert(el)) {
      this.focusRequest = null;
      focusIntoView(el);
    } else this.focusRequest = key;
  }

  /**
   * Closes the editor. Focus goes back to its cell when `focus` is set, or when the editor was
   * never mounted (its pending focus request would find nothing).
   */
  private close(focus: boolean): void {
    const state = this.layout.cellEdit();
    if (!state) return;
    const unmounted = !this.list || !findFocusKey(this.list, editorFocusKey(state.taskId, state.columnKey));
    this.layout.cellEdit.set(reduceCellEdit(state, { type: 'done' }));
    this.open = null;
    this._opened.set(null);
    this.clearAlert();
    if (focus || unmounted) {
      this.layout.focusedRowId.set(state.taskId);
      this.focus(`cell:${state.taskId}:${state.columnKey}`);
    }
  }

  /** Keeps the editor open with `message` (`aria-invalid`, under the cell, the alert region). */
  private invalid(message: string): false {
    this.layout.cellEdit.update(state => reduceCellEdit(state, { type: 'invalid', error: message }));
    this.say(message);
    return false;
  }

  /**
   * Commits the open editor. `blur`: an invalid text cancels instead (the reason is announced
   * politely). Returns whether the editor closed with its text applied (or unchanged).
   */
  private finish(move: 'next' | 'prev' | undefined, blur: boolean): boolean {
    const state = this.layout.cellEdit();
    const s = this.current();
    if (!state || !s) {
      if (state) this.close(false);
      return false;
    }
    const hadFocus = this.focusIn(state);
    const reject = (message: string): false => {
      if (!blur) return this.invalid(message);
      this.close(false);
      this.announcer.announce(this.i18n.labels().announceChangeRejected(message));
      return false;
    };
    // Untouched text: nothing to commit (whatever the task became meanwhile)
    if (state.value !== state.initial) {
      const result = commitCellValue(s.editor, state.value, s.row, this.layout.columnContext());
      if ('error' in result) return reject(result.error);
      if (Object.keys(result.patch).length > 0) {
        // Built from the app's own task, so undo restores its values
        const raw = this.editor.rawTask(state.taskId) ?? rollupSource(s.row.task);
        const change = taskChange(raw, result.patch, 'cell', {
          column: state.columnKey,
          coalesceKey: `cell:${state.taskId}:${state.columnKey}`,
          dates: untracked(this.layout.cfg),
        });
        if (!isEmptyChange(change) && !this.editor.commit(change, 'record', { announceRejection: false })) {
          const why = this.editor.rejection;
          if (why) return reject(why.message);
        }
      }
    }
    this.close(hadFocus && !blur);
    if (move && !blur) this.next(state.taskId, state.columnKey, move);
    return true;
  }

  /** Edits the next / previous editable cell of the row after `columnKey` (none: its cell keeps focus). */
  private next(taskId: string, columnKey: string, move: 'next' | 'prev'): void {
    const cols = this.columns();
    const from = cols.findIndex(c => c.key === columnKey);
    if (from < 0) return;
    const step = move === 'next' ? 1 : -1;
    for (let i = from + step; i >= 0 && i < cols.length; i += step) {
      const key = cols[i]?.key;
      if (key !== undefined && this.start(taskId, key)) return;
    }
  }

  /** The live context a custom editor is built with; its actions only act on this edit (one per `start`). */
  private contextFor(resolved: Resolved): CellEditorContext {
    const state = () => untracked(this.layout.cellEdit);
    const current = () => this.session();
    const labels = () => untracked(this.i18n.labels);
    const mine = (): boolean => this.open?.context === context;
    let row = resolved.row;
    const context: CellEditorContext = {
      get row() {
        if (mine()) row = current()?.row ?? row;
        return row;
      },
      column: resolved.column as CoreColumnDef,
      get value() {
        const s = state();
        return mine() && s ? s.value : '';
      },
      get labels() {
        return labels();
      },
      get invalid() {
        const s = state();
        return mine() && s ? s.error : null;
      },
      setValue: value => {
        if (mine()) this.input(value);
      },
      commit: move => {
        if (mine()) this.commit(move);
      },
      cancel: () => {
        if (mine()) this.cancel();
      },
    };
    return context;
  }
}
