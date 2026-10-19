/**
 * @file grid-keys.ts
 * Keys in the task list (row-first treegrid, D6 of Gantry 2 phase 9), through the core reducers:
 * `navigateGrid` (with `rowFocus` and the header row) for the moves, `keySelectionModifiers` for
 * Space / Shift+Space / Ctrl+Space, and the row activation and header sort of Enter.
 *
 *   Row      ↑/↓ PgUp/PgDn Home/End       previous / next row, ± one viewport page, first / last row
 *            →                            collapsed parent: expand; otherwise its first cell
 *            ←                            expanded parent: collapse; otherwise the parent row
 *   Cell     ←/→                          previous / next cell (← on the first cell: the row)
 *            ↑/↓, Home/End, Ctrl+Home/End same column; first / last cell; first / last row
 *   Header   (above row 1; cells only)    Enter / Space sort the column
 *   Row / cell  Enter                     select only this row + `row-click`
 *               Space, Shift+Space, Ctrl+Space   select (toggles with multiple selection) / range / toggle
 *
 * Focus moves to the control's `data-focus-key` (`row:<id>`, `cell:<id>:<column>`,
 * `head:<column>`): at once when it is mounted (the browser scrolls it into view), else its row is
 * pinned (`focusedRowId`) and the focus-restore region focuses it once the next flush mounted it.
 * Expanding and collapsing from the keyboard is announced in the polite live region.
 *
 * A button or link inside a cell (the collapse toggle, a consumer's template) keeps Enter and
 * Space. The task-list layer paints the roving `tabindex` (one tab stop for the whole grid).
 *
 * Cell editing (Phase 11, D15; `handleCellKey`, bound on the task list so it runs before the
 * keymap): on an editable cell F2 / Enter open its editor and a printable key opens a text (or,
 * for digits, number) editor seeded with that character (core `cellEditKey`, which wins over the
 * single-key shortcuts there); in the editor Enter commits, Tab / Shift+Tab commit and edit the
 * next / previous editable cell, Escape cancels — unless a custom editor prevented the key. Keys
 * typed during an IME composition are left alone, and the grid's navigation ignores the editor.
 * The key that opens an editor (F2, Enter, a typed character; Tab / Shift+Tab to the next one)
 * renders it at once (`ctx.renderNow`): its field has focus before the next key, so fast typing
 * loses nothing.
 */

import {
  HEADER_ROW,
  ROW_FOCUS,
  bodyHeight,
  cellEditKey,
  isGridEdgeJump,
  isKeySelectionCommand,
  keySelectionModifiers,
  navigateGrid,
  pageRowCount,
  type Command,
  type GanttFlatRow,
  type KeySelectionCommand,
  type MoveCommand,
} from '@gantryjs/core';
import { findFocusKey, focusIntoView } from '../layers/focus-restore';
import type { LayerContext } from '../layers/context';

/** Rows of one viewport page (PageUp / PageDown): core `pageRowCount` of the body under the header. */
export function pageRows(ctx: Pick<LayerContext, 'inputs' | 'graph'>): number {
  const { inputs: I, graph: G } = ctx;
  return pageRowCount(bodyHeight(I.canvasH.peek(), I.headerH.peek()), G.config.peek().rowHeight);
}

/**
 * Moves keyboard focus to the control with `key` inside `root` and scrolls it into view: now when
 * it is mounted, else after the next flush, with the row `rowId` pinned in the virtual window so
 * the flush mounts it.
 */
export function moveFocus(ctx: LayerContext, root: ParentNode, key: string, rowId: string | null): void {
  const el = findFocusKey(root, key);
  if (el) {
    focusIntoView(el);
    return;
  }
  if (rowId !== null) ctx.inputs.focusedRowId.set(rowId);
  ctx.focus.request(key);
}

/** Space / Shift+Space / Ctrl+Space / Enter on the row of `id`: the click rules with the key's modifiers. */
export function selectByKey(ctx: LayerContext, id: string, cmd: KeySelectionCommand): void {
  const { graph: G, selection } = ctx;
  const policy = G.config.peek().selection;
  selection.handleClick(
    id,
    keySelectionModifiers(cmd, policy.multi),
    G.visibleRows.peek().map(r => r.task.id),
    policy,
  );
}

/** Expand or collapse a group (state saved); `announce` reads the change out (keyboard). */
export function setCollapsed(ctx: LayerContext, row: GanttFlatRow, collapsed: boolean, announce = false): void {
  const id = row.task.id;
  ctx.inputs.collapsedIds.update(ids => {
    const next = new Set(ids);
    if (collapsed) next.add(id);
    else next.delete(id);
    return next;
  });
  ctx.saveState();
  if (!announce) return;
  const { labels } = ctx.graph.i18n.peek();
  ctx.announce.say(collapsed ? labels.announceCollapsed(row.task.name) : labels.announceExpanded(row.task.name));
}

/** Cycles a column's sort: ascending → descending → original order (state saved). */
export function cycleSort(ctx: LayerContext, key: string): void {
  ctx.inputs.sort.update(cur =>
    cur?.key !== key ? { key, dir: 'asc' } : cur.dir === 'asc' ? { key, dir: 'desc' } : null,
  );
  ctx.saveState();
}

/** 0-based column of a header cell or a cell (`aria-colindex` is 1-based). */
const columnOf = (el: Element): number => Number(el.getAttribute('aria-colindex')) - 1;

/** The visible row a task-list row element shows (`aria-rowindex` 1 is the header row). */
function rowOf(ctx: LayerContext, el: Element): GanttFlatRow | undefined {
  const rows = ctx.graph.visibleRows.peek();
  const id = el.getAttribute('data-task-id');
  const row = rows[Number(el.getAttribute('aria-rowindex')) - 2];
  return row?.task.id === id ? row : rows.find(r => r.task.id === id);
}

/** Focus the grid position `row` / `col` (`HEADER_ROW`, `ROW_FOCUS`), mounting it first if needed. */
function focusPosition(ctx: LayerContext, row: number, col: number): void {
  const { graph: G, dom } = ctx;
  const cols = G.tlColumns.peek();
  if (row === HEADER_ROW) {
    const key = cols[col]?.key;
    if (key !== undefined) moveFocus(ctx, dom.tasklistContainer, `head:${key}`, null);
    return;
  }
  const id = G.visibleRows.peek()[row]?.task.id;
  if (id === undefined) return;
  const key = col === ROW_FOCUS ? `row:${id}` : `cell:${id}:${cols[col]?.key ?? ''}`;
  moveFocus(ctx, dom.tasklistContainer, key, id);
}

/**
 * The cell-editing keys (D15), from the task list's own `keydown` listener (before the keymap):
 * prevents what it used, so the keymap leaves it alone.
 * - In the open editor: Enter → commit, Tab / Shift+Tab → commit and edit the next / previous
 *   editable cell of the row, Escape → cancel (focus back to the cell). A key the custom editor
 *   prevented, and any other key, stays the editor's.
 * - On an editable cell with focus (not a control inside it): F2 / Enter → edit, a printable key
 *   → edit seeded with it (text editors; digits for number editors).
 */
export function handleCellKey(ctx: LayerContext, event: KeyboardEvent): void {
  if (event.isComposing) return;
  const origin = event.composedPath()[0];
  if (!(origin instanceof Element)) return;
  const { cells } = ctx;
  if (cells.active() && origin.closest('.gantt-tl-cell--editing')) {
    if (event.defaultPrevented) return;
    const kind = cells.session()?.editor.kind ?? 'text';
    const action = cellEditKey(event, { editing: true, kind });
    if (action === null) return;
    event.preventDefault();
    if (action === 'cancel') cells.cancel();
    else cells.commit(action === 'commit-next' ? 'next' : action === 'commit-prev' ? 'prev' : undefined);
    // Tab / Shift+Tab opened the next editor: its field has focus before the next key
    if (action !== 'commit' && action !== 'cancel' && cells.active()) ctx.renderNow();
    return;
  }
  if (event.defaultPrevented || !origin.classList.contains('gantt-tl-cell')) return;
  // Text editors take every key another kind takes: anything else (arrows, Space…) is not resolved
  if (cellEditKey(event, { editing: false, kind: 'text' }) === null) return;
  const rowEl = origin.closest('.gantt-tl-row');
  const row = rowEl ? rowOf(ctx, rowEl) : undefined;
  const col = ctx.graph.tlColumns.peek()[columnOf(origin)];
  if (!row || !col) return;
  const kind = cells.kindOf(row.task.id, col.key);
  if (kind === null) return;
  const action = cellEditKey(event, { editing: false, kind });
  if (action !== 'start' && action !== 'seed') return;
  if (!cells.start(row.task.id, col.key, action === 'seed' ? event.key : undefined)) return;
  event.preventDefault();
  // The field is mounted and focused now: the keys typed right after this one reach it
  ctx.renderNow();
}

/**
 * A grid key on `origin` (inside the task list). Returns `true` when the grid used it (the caller
 * prevents its default action), `false` to let the global shortcuts or the browser have it.
 */
export function handleGridKey(ctx: LayerContext, event: KeyboardEvent, origin: Element, cmd: Command): boolean {
  const { graph: G } = ctx;
  // An open cell editor keeps its keys (a custom editor's buttons, arrows…)
  if (origin.closest('.gantt-tl-cell--editing')) return false;
  const head = origin.closest('.gantt-tl-col-header');
  const rowEl = head ? null : origin.closest('.gantt-tl-row');
  // The footer ("Load more", Retry) keeps its own keys
  if (!head && !rowEl) return false;
  const cell = rowEl ? origin.closest('.gantt-tl-cell') : null;
  const row = rowEl ? rowOf(ctx, rowEl) : undefined;
  if (rowEl && !row) return false;
  const control = origin !== head && origin !== rowEl && origin !== cell && origin.closest('button, a[href]');
  if (control && (cmd === 'activate' || isKeySelectionCommand(cmd))) return false;

  if (cmd.startsWith('move.')) {
    const cols = G.tlColumns.peek();
    const next = navigateGrid(
      {
        row: row ? row.visibleIndex : HEADER_ROW,
        col: head ? columnOf(head) : cell ? columnOf(cell) : ROW_FOCUS,
        rowCount: G.visibleRows.peek().length,
        colCount: cols.length,
      },
      cmd as MoveCommand,
      {
        rowFocus: true,
        header: true,
        pageSize: pageRows(ctx),
        toEdge: isGridEdgeJump(event),
        hasChildren: row?.hasChildren,
        expanded: row ? !row.isCollapsed : false,
        parentRow: row?.parentIndex,
      },
    );
    if (next.action === 'move') focusPosition(ctx, next.row, next.col);
    else if (row && (next.action === 'expand' || next.action === 'collapse'))
      setCollapsed(ctx, row, next.action === 'collapse', true);
    return true;
  }

  if (head) {
    const col = G.tlColumns.peek()[columnOf(head)];
    if ((cmd === 'activate' || cmd === 'toggle.select') && col?.sortable) cycleSort(ctx, col.key);
    return cmd === 'activate' || isKeySelectionCommand(cmd);
  }
  if (!row) return false;
  if (cmd === 'activate') {
    ctx.rowClick(row, event);
    return true;
  }
  if (isKeySelectionCommand(cmd)) {
    selectByKey(ctx, row.task.id, cmd);
    return true;
  }
  return false;
}
