// ─────────────────────────────────────────────────────────────
//  gantry · interaction/grid-nav.ts
//  Pure treegrid focus reducer (WAI-ARIA treegrid): given the
//  focused row / cell and a move command, returns the next focus
//  or an expand / collapse intent. Bindings move DOM focus (roving
//  tabindex) and toggle rows; nothing here touches the DOM.
//
//  Cell focus (default, `rowFocus` off):
//    Up / Down            previous / next row, same column
//    PageUp / PageDown    ± pageSize rows
//    Home / End           first / last cell of the row
//    Ctrl/Cmd+Home / End  first cell of the first row / last cell of the last row
//    Right at treeCol     collapsed parent → expand, else next column
//    Left at treeCol      expanded parent → collapse, else the parent
//                         row (same column), else previous column
//    Left / Right         previous / next column
//
//  Row first (`rowFocus`, the task list of Phase 9): column
//  `ROW_FOCUS` (-1) means the row itself has focus.
//    Row:  Up / Down, PageUp / PageDown   previous / next row, ± pageSize
//          Home / End (Ctrl too)          first / last row
//          Right                          collapsed parent → expand, else its first cell
//          Left                           expanded parent → collapse, else the parent row
//    Cell: Left / Right                   previous / next cell; Left on the first cell → the row
//          Up / Down, PageUp / PageDown   same column
//          Home / End                     first / last cell of the row
//          Ctrl/Cmd+Home / End            same column, first / last row
//
//  Header row (`header`): row `HEADER_ROW` (-1) is the column-header
//  row, above row 0. It holds cells only (no row focus, no tree moves):
//  Up from row 0 enters it (a focused row lands on its first cell),
//  Down leaves it in the same column; PageUp and the edge jumps stop
//  at row 0.
//
//  `treeCol` is the column with the expand / collapse toggle (the
//  'name' column, default 0); it only matters with cell focus.
//
//  Moves never wrap. Left/right are logical (see keymap.ts): in RTL
//  `resolveKey` already swapped them, so this file is direction-free.
// ─────────────────────────────────────────────────────────────

import { isGridEdgeJump, resolveKey, type KeyLike, type MoveCommand } from './keymap';

/** Column index meaning "the row itself has focus" (with `GridNavContext.rowFocus`). */
export const ROW_FOCUS = -1;

/** Row index of the column-header row (with `GridNavContext.header`), above row 0. */
export const HEADER_ROW = -1;

export interface GridPosition {
  /** Focused row, 0-based among the visible rows; `HEADER_ROW` (-1) for the header row (with `header`) */
  row: number;
  /** Focused column, 0-based; `ROW_FOCUS` (-1) when the row has focus (with `rowFocus`) */
  col: number;
}

export interface GridNavState extends GridPosition {
  /** Visible data rows (the header row is not counted) */
  rowCount: number;
  colCount: number;
}

/** How the grid navigates, and what the focused row is (for the tree moves). */
export interface GridNavContext {
  /** Rows moved by PageUp / PageDown. Default 10. */
  pageSize?: number | undefined;
  /** Ctrl/Cmd held: Home / End jump to the first / last row. Default `false`. */
  toEdge?: boolean | undefined;
  /** The focused row has child rows. Default `false`. */
  hasChildren?: boolean | undefined;
  /** The focused row's children are shown. Default `false`. */
  expanded?: boolean | undefined;
  /**
   * Visible index of the focused row's parent (`GanttFlatRow.parentIndex`): Left at `treeCol` on a
   * leaf / collapsed row goes there, or Left on a focused leaf / collapsed row with `rowFocus`.
   */
  parentRow?: number | undefined;
  /**
   * Column holding the expand / collapse toggle, where Left / Right act on the tree. Default 0.
   * Bindings pass `columns.findIndex(c => c.key === 'name')`. Ignored with `rowFocus` (the row
   * itself expands and collapses).
   */
  treeCol?: number | undefined;
  /**
   * Row-first treegrid: column `ROW_FOCUS` (-1) is the row itself, the tree moves act on the row
   * and the cells are plain cells (see the file header). Default `false` (cell focus only).
   */
  rowFocus?: boolean | undefined;
  /** Row `HEADER_ROW` (-1) is the column-header row, reached with Up from row 0. Default `false`. */
  header?: boolean | undefined;
}

export type GridNavAction = 'move' | 'expand' | 'collapse' | 'none';

export interface GridNavResult extends GridPosition {
  /**
   * `move`: focus `row`/`col` · `expand` / `collapse`: toggle the focused row (position unchanged) ·
   * `none`: already at the edge — still swallow the key so the page does not scroll.
   */
  action: GridNavAction;
}

export const DEFAULT_GRID_PAGE_SIZE = 10;

const clampTo = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), Math.max(max, min));

/** Next focus for a move command. */
export function navigateGrid(state: GridNavState, command: MoveCommand, ctx: GridNavContext = {}): GridNavResult {
  const rowFocus = !!ctx.rowFocus;
  const header = !!ctx.header;
  const rowCount = Math.max(0, Math.floor(state.rowCount));
  const colCount = Math.max(0, Math.floor(state.colCount));
  const firstRow = header ? HEADER_ROW : 0;
  const firstCol = rowFocus ? ROW_FOCUS : 0;
  const lastRow = rowCount - 1;
  const lastCol = colCount - 1;
  // A header row holds cells only: a focused "row" there is its first cell
  const place = (r: number, c: number): GridPosition => {
    const nr = clampTo(r, firstRow, lastRow);
    const nc = clampTo(c, firstCol, lastCol);
    return { row: nr, col: header && nr === HEADER_ROW ? Math.max(nc, 0) : nc };
  };
  const { row, col } = place(state.row, state.col);
  const none: GridNavResult = { row, col, action: 'none' };
  // Nothing to focus: no rows (and no header row), or no cells where cells are the only stops
  if ((!header && rowCount === 0) || (colCount === 0 && (!rowFocus || row === HEADER_ROW))) return none;

  const pageSize = Math.max(1, Math.floor(ctx.pageSize ?? DEFAULT_GRID_PAGE_SIZE));
  const treeCol = Math.floor(ctx.treeCol ?? 0);
  const inHeader = header && row === HEADER_ROW;
  // The row itself has focus (row-first treegrid)
  const onRow = rowFocus && col === ROW_FOCUS && !inHeader;
  // A data row holds the tree moves at the toggle column (cell focus) or on the row (row focus)
  const treeHere = !inHeader && (rowFocus ? onRow : col === treeCol);
  const parent = ctx.parentRow !== undefined && ctx.parentRow >= 0 && ctx.parentRow < row ? ctx.parentRow : null;
  const to = (r: number, c: number): GridNavResult => {
    const next = place(r, c);
    return { ...next, action: next.row === state.row && next.col === state.col ? 'none' : 'move' };
  };
  // Page and edge jumps stop at row 0: only Up enters the header row
  const top = inHeader ? HEADER_ROW : 0;

  switch (command) {
    case 'move.up':
      return to(row - 1, col);
    case 'move.down':
      return to(row + 1, col);
    case 'move.pageUp':
      return to(Math.max(row - pageSize, top), col);
    case 'move.pageDown':
      return to(row + pageSize, col);
    case 'move.home':
      if (onRow) return to(0, ROW_FOCUS);
      if (ctx.toEdge) return rowFocus ? to(0, col) : to(0, 0);
      return to(row, 0);
    case 'move.end':
      if (onRow) return to(lastRow, ROW_FOCUS);
      if (ctx.toEdge) return rowFocus ? to(lastRow, col) : to(lastRow, lastCol);
      return to(row, lastCol);
    case 'move.right':
      if (treeHere && ctx.hasChildren && !ctx.expanded) return { row, col, action: 'expand' };
      return to(row, col + 1);
    case 'move.left':
      if (treeHere) {
        if (ctx.hasChildren && ctx.expanded) return { row, col, action: 'collapse' };
        if (parent !== null) return to(parent, col);
        // A focused row without a parent stays put (Left never leaves a row for its cells)
        if (onRow) return none;
      }
      return to(row, col - 1);
  }
}

/**
 * `resolveKey(event, 'grid')` + `navigateGrid` in one step. Returns `null` when the key is not a
 * grid move (let the binding handle it as another command or leave the default action).
 */
export function navigateGridKey(
  state: GridNavState,
  event: KeyLike,
  ctx: Omit<GridNavContext, 'toEdge'> & { rtl?: boolean | undefined } = {},
): GridNavResult | null {
  const command = resolveKey(event, 'grid', { rtl: ctx.rtl, characterShortcuts: false });
  if (!command?.startsWith('move.')) return null;
  return navigateGrid(state, command as MoveCommand, { ...ctx, toEdge: isGridEdgeJump(event) });
}
