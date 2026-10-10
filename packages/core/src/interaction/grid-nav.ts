// ─────────────────────────────────────────────────────────────
//  gantry · interaction/grid-nav.ts
//  Pure treegrid focus reducer (WAI-ARIA treegrid, cell focus):
//  given the focused cell and a move command, returns the next
//  cell or an expand / collapse intent. Bindings move DOM focus
//  (roving tabindex) and toggle rows; nothing here touches the DOM.
//
//    Up / Down            previous / next row, same column
//    PageUp / PageDown    ± pageSize rows
//    Home / End           first / last cell of the row
//    Ctrl/Cmd+Home / End  first cell of the first row / last cell of the last row
//    Right at treeCol     collapsed parent → expand, else next column
//    Left at treeCol      expanded parent → collapse, else the parent
//                         row (same column), else previous column
//    Left / Right         previous / next column
//
//  `treeCol` is the column with the expand / collapse toggle (the
//  'name' column, default 0).
//
//  Moves never wrap. Left/right are logical (see keymap.ts): in RTL
//  `resolveKey` already swapped them, so this file is direction-free.
// ─────────────────────────────────────────────────────────────

import { isGridEdgeJump, resolveKey, type KeyLike, type MoveCommand } from './keymap';

export interface GridPosition {
  /** Focused row, 0-based among the visible rows */
  row: number;
  /** Focused column, 0-based */
  col: number;
}

export interface GridNavState extends GridPosition {
  rowCount: number;
  colCount: number;
}

/** What the focused row is, for the tree moves at the toggle column. */
export interface GridNavContext {
  /** Rows moved by PageUp / PageDown. Default 10. */
  pageSize?: number | undefined;
  /** Ctrl/Cmd held: Home / End jump to the first / last row. Default `false`. */
  toEdge?: boolean | undefined;
  /** The focused row has child rows. Default `false`. */
  hasChildren?: boolean | undefined;
  /** The focused row's children are shown. Default `false`. */
  expanded?: boolean | undefined;
  /** Visible index of the focused row's parent (Left at `treeCol` on a leaf / collapsed row goes there). */
  parentRow?: number | undefined;
  /**
   * Column holding the expand / collapse toggle, where Left / Right act on the tree. Default 0.
   * Bindings pass `columns.findIndex(c => c.key === 'name')`.
   */
  treeCol?: number | undefined;
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

const clampIndex = (v: number, count: number): number => Math.min(Math.max(v, 0), Math.max(count - 1, 0));

/** Next focus for a move command. */
export function navigateGrid(state: GridNavState, command: MoveCommand, ctx: GridNavContext = {}): GridNavResult {
  const rowCount = Math.max(0, Math.floor(state.rowCount));
  const colCount = Math.max(0, Math.floor(state.colCount));
  const row = clampIndex(state.row, rowCount);
  const col = clampIndex(state.col, colCount);
  if (rowCount === 0 || colCount === 0) return { row, col, action: 'none' };

  const pageSize = Math.max(1, Math.floor(ctx.pageSize ?? DEFAULT_GRID_PAGE_SIZE));
  const lastRow = rowCount - 1;
  const lastCol = colCount - 1;
  const treeCol = Math.floor(ctx.treeCol ?? 0);
  const to = (r: number, c: number): GridNavResult => {
    const nr = clampIndex(r, rowCount);
    const nc = clampIndex(c, colCount);
    return { row: nr, col: nc, action: nr === state.row && nc === state.col ? 'none' : 'move' };
  };

  switch (command) {
    case 'move.up':
      return to(row - 1, col);
    case 'move.down':
      return to(row + 1, col);
    case 'move.pageUp':
      return to(row - pageSize, col);
    case 'move.pageDown':
      return to(row + pageSize, col);
    case 'move.home':
      return ctx.toEdge ? to(0, 0) : to(row, 0);
    case 'move.end':
      return ctx.toEdge ? to(lastRow, lastCol) : to(row, lastCol);
    case 'move.right':
      if (col === treeCol && ctx.hasChildren && !ctx.expanded) return { row, col, action: 'expand' };
      return to(row, col + 1);
    case 'move.left':
      if (col === treeCol) {
        if (ctx.hasChildren && ctx.expanded) return { row, col, action: 'collapse' };
        if (ctx.parentRow !== undefined && ctx.parentRow >= 0 && ctx.parentRow < row) return to(ctx.parentRow, col);
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
