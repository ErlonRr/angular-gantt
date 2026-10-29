/**
 * @file cell-edit.ts
 * Editing task-list cells (Gantry 2 phase 11, D14–D16), through core `resolveCellEditor`,
 * `commitCellValue`, `reduceCellEdit` and `cellEditKey` (Angular: `editing/cell-edit.ts`).
 *
 * - `start()` opens the editor of a cell the task list shows when core `resolveCellEditor` allows
 *   it (`editing.cells`, the row's `editRules`, the column's `editable`): `inputs.cellEdit` =
 *   `reduceCellEdit(null, { type: 'start', … })`, seeded with a typed character when `seed` is
 *   given. The row is pinned in the virtual window (`focusedRowId`), its collapsed ancestors are
 *   left as they are (a hidden row can't be edited), and the editor is focused after the next
 *   flush (`focus.request` of its `editor:<id>:<column>` key). The task-list region mounts it
 *   (`layers/tasklist.ts`, §3d). An editor already open elsewhere is finished first, as a blur.
 * - `commit()` parses and validates the text (`commitCellValue`), then commits
 *   `taskChange(edit.rawTask(id), patch, 'cell', { column, coalesceKey: 'cell:<id>:<column>', dates })`
 *   through `edit.commit(change, 'record', { announceRejection: false })`. The unchanged text
 *   (or values) closes the editor with no change. An error, or the pipeline's rejection
 *   (`edit.rejection`: a loop, a vetoed change…), keeps it open: `aria-invalid`, the message
 *   under the cell and in the alert region. `'next'` / `'prev'` then edit the next / previous
 *   editable cell of the row; at the row's end the cell keeps focus.
 * - `cancel()` closes the editor without a change (Escape, a custom editor's `cancel()`, a
 *   disconnect). Focus returns to `cell:<id>:<column>` when the editor held it.
 * - `blur()` (focus left the editor): commit when valid, else cancel (a rejection is announced).
 *
 * The open editor is resolved against the row the list shows now: when the row's task changes
 * while it is open (a live update, a rollup), it is resolved again and the text is kept.
 */

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
  type GanttFlatRow,
  type GanttLabels,
  type ResolvedCellEditor,
} from '@gantryjs/core';
import type { LayerContext } from '../layers/context';
import { findFocusKey } from '../layers/focus-restore';
import type { VanillaColumnDef } from '../types';

/** `data-focus-key` of a cell editor's field (what is focused when it opens). */
export const editorFocusKey = (taskId: string, columnKey: string): string => `editor:${taskId}:${columnKey}`;

/** The open editor, resolved against the row the list shows now. */
export interface CellEditSession {
  readonly taskId: string;
  readonly columnKey: string;
  readonly column: VanillaColumnDef;
  readonly row: GanttFlatRow;
  readonly editor: ResolvedCellEditor;
  /** What a custom editor (`column.editor` function) is built with: live getters, actions of this edit only */
  readonly context: CellEditorContext;
  /** Opened by a typed character: its text is not selected when it gets focus */
  readonly seeded: boolean;
}

/** The cell editor (`ctx.cells`). */
export interface CellEditApi {
  /** Opens the editor of a cell (`seed`: a typed character that replaces the text); `false` when it can't be edited. */
  start(taskId: string, columnKey: string, seed?: string): boolean;
  /** The cell being edited, `null` = none */
  active(): { taskId: string; columnKey: string } | null;
  /** Commits the editor's text (`'next'` / `'prev'`: then edits the next / previous editable cell); `false` while it is invalid. */
  commit(move?: 'next' | 'prev'): boolean;
  /** Closes the editor without a change. */
  cancel(): void;
  // ── Web Component internals (the task-list region and the keys) ──
  /** The open editor (`null`: none) */
  session(): CellEditSession | null;
  /** The editor kind of a cell, `null` when it can't be edited (decides what F2, Enter and typing do) */
  kindOf(taskId: string, columnKey: string): CellEditorKind | 'custom' | null;
  /** The editor's text changed (a built-in editor's `input` event, a custom editor's `setValue`) */
  input(value: string): void;
  /** Focus left the editor: commit when valid, else cancel */
  blur(): void;
}

/** What a cell edits with: its row, column and resolved editor. */
interface Resolved {
  readonly row: GanttFlatRow;
  readonly column: VanillaColumnDef;
  readonly editor: ResolvedCellEditor;
}

interface Open extends Resolved {
  readonly taskId: string;
  readonly columnKey: string;
  readonly context: CellEditorContext;
  readonly seeded: boolean;
}

export function createCellEdit(ctx: LayerContext): CellEditApi {
  const { inputs: I, graph: G, dom, shadow } = ctx;
  let open: Open | null = null;
  /** The message this editor put in the alert region (cleared when it closes, unless replaced) */
  let alerted: string | null = null;

  const labelsOf = (): GanttLabels | null => {
    try {
      return G.i18n.peek().labels;
    } catch {
      return null; // invalid options: nothing renders
    }
  };

  /** The editor of a cell the task list shows, `null` when it can't be edited. */
  const resolve = (taskId: string, columnKey: string): Resolved | null => {
    try {
      const config = G.config.peek();
      if (!config.editing.cells || I.viewOverride.peek() === 'chart') return null;
      const row = G.geoById.peek().get(taskId)?.row;
      const column = G.tlColumns.peek().find(c => c.key === columnKey);
      if (!row || !column) return null;
      const { labels } = G.i18n.peek();
      const rules = G.editRules.peek()(row);
      const editor = resolveCellEditor(column, row, { config, ctx: G.columnCtx.peek(), labels, rules });
      return editor && { row, column, editor };
    } catch {
      return null; // invalid options: nothing renders, nothing is edited
    }
  };

  const sameCell = (state: CellEditState, taskId: string, columnKey: string): boolean =>
    state !== null && state.taskId === taskId && state.columnKey === columnKey;

  /**
   * The open editor, resolved again when its row changed (the text in the state is kept); `null`
   * while its row is not shown (removed, under a collapsed parent).
   */
  const current = (): Open | null => {
    const state = I.cellEdit.peek();
    if (!state || !open || !sameCell(state, open.taskId, open.columnKey)) return null;
    const row = G.geoById.peek().get(state.taskId)?.row;
    if (!row) return null;
    if (row !== open.row) {
      const again = resolve(state.taskId, state.columnKey);
      if (again) open = { ...open, ...again };
    }
    return open;
  };

  /** Focus is in the cell being edited (on the cell itself or in its editor). */
  const focusIn = (state: NonNullable<CellEditState>): boolean => {
    const cell = shadow.activeElement?.closest('.gantt-tl-cell');
    return cell?.getAttribute('data-focus-key') === `cell:${state.taskId}:${state.columnKey}`;
  };

  const say = (message: string): void => {
    // The same message again is read again: the region's text changes
    if (dom.srAlert.textContent === message) dom.srAlert.textContent = '';
    dom.srAlert.textContent = message;
    alerted = message;
  };

  /**
   * Closes the editor. Focus goes back to its cell when `focus` is set, or when the editor was
   * never mounted (its pending focus request would find nothing).
   */
  const close = (focus: boolean): void => {
    const state = I.cellEdit.peek();
    if (!state) return;
    const unmounted = !findFocusKey(dom.tasklistContainer, editorFocusKey(state.taskId, state.columnKey));
    I.cellEdit.set(reduceCellEdit(state, { type: 'done' }));
    open = null;
    if (alerted !== null && dom.srAlert.textContent === alerted) dom.srAlert.textContent = '';
    alerted = null;
    if (focus || unmounted) {
      I.focusedRowId.set(state.taskId);
      ctx.focus.request(`cell:${state.taskId}:${state.columnKey}`);
    }
  };

  /** Keeps the editor open with `message` (`aria-invalid`, under the cell, the alert region). */
  const invalid = (message: string): false => {
    I.cellEdit.set(reduceCellEdit(I.cellEdit.peek(), { type: 'invalid', error: message }));
    say(message);
    return false;
  };

  /**
   * Commits the open editor. `blur`: an invalid text cancels instead (the reason is announced
   * politely). Returns whether the editor closed with its text applied (or unchanged).
   */
  const finish = (move: 'next' | 'prev' | undefined, blur: boolean): boolean => {
    const state = I.cellEdit.peek();
    const s = current();
    if (!state || !s) {
      if (state) close(false);
      return false;
    }
    const hadFocus = focusIn(state);
    const reject = (message: string): false => {
      if (!blur) return invalid(message);
      close(false);
      const labels = labelsOf();
      if (labels) ctx.announce.say(labels.announceChangeRejected(message));
      return false;
    };
    // Untouched text: nothing to commit (whatever the task became meanwhile)
    if (state.value !== state.initial) {
      const result = commitCellValue(s.editor, state.value, s.row, G.columnCtx.peek());
      if ('error' in result) return reject(result.error);
      if (Object.keys(result.patch).length > 0) {
        // Built from the app's own task, so undo restores its values
        const raw = ctx.edit.rawTask(state.taskId) ?? rollupSource(s.row.task);
        const change = taskChange(raw, result.patch, 'cell', {
          column: state.columnKey,
          coalesceKey: `cell:${state.taskId}:${state.columnKey}`,
          dates: G.config.peek(),
        });
        if (!isEmptyChange(change) && !ctx.edit.commit(change, 'record', { announceRejection: false })) {
          const why = ctx.edit.rejection;
          if (why) return reject(why.message);
        }
      }
    }
    close(hadFocus && !blur);
    if (move && !blur) next(state.taskId, state.columnKey, move);
    return true;
  };

  /** Edits the next / previous editable cell of the row after `columnKey` (none: its cell keeps focus). */
  const next = (taskId: string, columnKey: string, move: 'next' | 'prev'): void => {
    const cols = G.tlColumns.peek();
    const from = cols.findIndex(c => c.key === columnKey);
    if (from < 0) return;
    const step = move === 'next' ? 1 : -1;
    for (let i = from + step; i >= 0 && i < cols.length; i += step) {
      if (api.start(taskId, cols[i]!.key)) return;
    }
  };

  /**
   * The live context a custom editor is built with; its actions only act on this edit (one per
   * `start`: a later edit of the same cell has its own context, as Angular's).
   */
  const contextFor = (resolved: Resolved): CellEditorContext => {
    const mine = (): boolean => open?.context === context;
    let row = resolved.row;
    const context: CellEditorContext = {
      get row() {
        if (mine()) row = current()?.row ?? row;
        return row;
      },
      column: resolved.column,
      get value() {
        const state = I.cellEdit.peek();
        return mine() && state ? state.value : '';
      },
      get labels() {
        return G.i18n.peek().labels;
      },
      get invalid() {
        const state = I.cellEdit.peek();
        return mine() && state ? state.error : null;
      },
      setValue: value => {
        if (mine()) api.input(value);
      },
      commit: move => {
        if (mine()) api.commit(move);
      },
      cancel: () => {
        if (mine()) api.cancel();
      },
    };
    return context;
  };

  const api: CellEditApi = {
    start(taskId, columnKey, seed) {
      const state = I.cellEdit.peek();
      if (sameCell(state, taskId, columnKey) && current()) return true;
      // Another editor open: finished as if it lost focus
      if (state) finish(undefined, true);
      try {
        if (G.chartState.peek().kind !== 'ready') return false;
      } catch {
        return false;
      }
      const r = resolve(taskId, columnKey);
      if (!r) return false;
      open = {
        ...r,
        taskId,
        columnKey,
        context: contextFor(r),
        seeded: seed !== undefined,
      };
      I.cellEdit.set(reduceCellEdit(null, { type: 'start', taskId, columnKey, value: r.editor.value, seed }));
      // Pinned in the virtual window: mounted wherever it is, focused (and scrolled to) after the flush
      I.focusedRowId.set(taskId);
      ctx.focus.request(editorFocusKey(taskId, columnKey));
      return true;
    },
    active() {
      const state = I.cellEdit.peek();
      return state && { taskId: state.taskId, columnKey: state.columnKey };
    },
    commit: move => finish(move, false),
    cancel() {
      const state = I.cellEdit.peek();
      if (state) close(focusIn(state));
    },
    session: current,
    kindOf: (taskId, columnKey) => resolve(taskId, columnKey)?.editor.kind ?? null,
    input(value) {
      const state = I.cellEdit.peek();
      const nextState = reduceCellEdit(state, { type: 'input', value });
      if (nextState === state) return;
      I.cellEdit.set(nextState);
      // The error is gone with the text that caused it
      if (state?.error && alerted !== null && dom.srAlert.textContent === alerted) dom.srAlert.textContent = '';
    },
    blur() {
      if (I.cellEdit.peek()) finish(undefined, true);
    },
  };
  return api;
}
