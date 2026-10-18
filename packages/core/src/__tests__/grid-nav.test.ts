// ─────────────────────────────────────────────────────────────
//  Tests — interaction/grid-nav.ts (treegrid focus reducer)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  HEADER_ROW,
  ROW_FOCUS,
  navigateGrid,
  navigateGridKey,
  type GridNavContext,
  type GridNavState,
} from '../interaction/grid-nav';

const at = (row: number, col: number, rowCount = 20, colCount = 4): GridNavState => ({ row, col, rowCount, colCount });

describe('navigateGrid', () => {
  it('moves up / down within bounds and never wraps', () => {
    expect(navigateGrid(at(3, 1), 'move.down')).toEqual({ row: 4, col: 1, action: 'move' });
    expect(navigateGrid(at(3, 1), 'move.up')).toEqual({ row: 2, col: 1, action: 'move' });
    expect(navigateGrid(at(0, 1), 'move.up')).toEqual({ row: 0, col: 1, action: 'none' });
    expect(navigateGrid(at(19, 1), 'move.down')).toEqual({ row: 19, col: 1, action: 'none' });
  });

  it('pages by pageSize (default 10), clamped', () => {
    expect(navigateGrid(at(3, 2), 'move.pageDown')).toEqual({ row: 13, col: 2, action: 'move' });
    expect(navigateGrid(at(15, 2), 'move.pageDown')).toEqual({ row: 19, col: 2, action: 'move' });
    expect(navigateGrid(at(15, 2), 'move.pageUp', { pageSize: 4 })).toEqual({ row: 11, col: 2, action: 'move' });
    expect(navigateGrid(at(2, 2), 'move.pageUp')).toEqual({ row: 0, col: 2, action: 'move' });
  });

  it('Home / End go to the row edges; with toEdge to the grid corners', () => {
    expect(navigateGrid(at(5, 2), 'move.home')).toEqual({ row: 5, col: 0, action: 'move' });
    expect(navigateGrid(at(5, 2), 'move.end')).toEqual({ row: 5, col: 3, action: 'move' });
    expect(navigateGrid(at(5, 2), 'move.home', { toEdge: true })).toEqual({ row: 0, col: 0, action: 'move' });
    expect(navigateGrid(at(5, 2), 'move.end', { toEdge: true })).toEqual({ row: 19, col: 3, action: 'move' });
    expect(navigateGrid(at(5, 0), 'move.home')).toEqual({ row: 5, col: 0, action: 'none' });
  });

  it('Left / Right move between columns away from column 0', () => {
    expect(navigateGrid(at(5, 2), 'move.right')).toEqual({ row: 5, col: 3, action: 'move' });
    expect(navigateGrid(at(5, 3), 'move.right')).toEqual({ row: 5, col: 3, action: 'none' });
    expect(navigateGrid(at(5, 2), 'move.left', { hasChildren: true, expanded: true })).toEqual({
      row: 5,
      col: 1,
      action: 'move',
    });
  });

  it('Right at column 0 expands a collapsed parent, else moves right', () => {
    expect(navigateGrid(at(5, 0), 'move.right', { hasChildren: true, expanded: false })).toEqual({
      row: 5,
      col: 0,
      action: 'expand',
    });
    expect(navigateGrid(at(5, 0), 'move.right', { hasChildren: true, expanded: true })).toEqual({
      row: 5,
      col: 1,
      action: 'move',
    });
    expect(navigateGrid(at(5, 0), 'move.right')).toEqual({ row: 5, col: 1, action: 'move' });
  });

  it('Left at column 0 collapses an expanded parent, else goes to the parent row', () => {
    expect(navigateGrid(at(5, 0), 'move.left', { hasChildren: true, expanded: true })).toEqual({
      row: 5,
      col: 0,
      action: 'collapse',
    });
    expect(navigateGrid(at(5, 0), 'move.left', { hasChildren: true, expanded: false, parentRow: 2 })).toEqual({
      row: 2,
      col: 0,
      action: 'move',
    });
    expect(navigateGrid(at(5, 0), 'move.left', { parentRow: 1 })).toEqual({ row: 1, col: 0, action: 'move' });
    expect(navigateGrid(at(5, 0), 'move.left')).toEqual({ row: 5, col: 0, action: 'none' });
  });

  it('tree moves follow the toggle column (treeCol), other columns just move', () => {
    const tree = { treeCol: 1, hasChildren: true };
    // the toggle is in column 1 ('id' comes first)
    expect(navigateGrid(at(5, 1), 'move.right', { ...tree, expanded: false })).toEqual({
      row: 5,
      col: 1,
      action: 'expand',
    });
    expect(navigateGrid(at(5, 1), 'move.left', { ...tree, expanded: true })).toEqual({
      row: 5,
      col: 1,
      action: 'collapse',
    });
    expect(navigateGrid(at(5, 1), 'move.left', { treeCol: 1, parentRow: 2 })).toEqual({
      row: 2,
      col: 1,
      action: 'move',
    });
    expect(navigateGrid(at(5, 1), 'move.left', { treeCol: 1 })).toEqual({ row: 5, col: 0, action: 'move' });
    // column 0 is a plain cell now
    expect(navigateGrid(at(5, 0), 'move.right', { ...tree, expanded: false })).toEqual({
      row: 5,
      col: 1,
      action: 'move',
    });
    expect(navigateGrid(at(5, 0), 'move.left', { ...tree, expanded: true, parentRow: 2 })).toEqual({
      row: 5,
      col: 0,
      action: 'none',
    });
    // Home still goes to column 0
    expect(navigateGrid(at(5, 3), 'move.home', tree)).toEqual({ row: 5, col: 0, action: 'move' });
  });

  it('handles empty grids and a stale focus position', () => {
    expect(navigateGrid(at(0, 0, 0, 4), 'move.down')).toEqual({ row: 0, col: 0, action: 'none' });
    // rows were removed: focus snaps back inside the grid
    expect(navigateGrid(at(30, 1), 'move.down')).toEqual({ row: 19, col: 1, action: 'move' });
    expect(navigateGrid(at(30, 1), 'move.up')).toEqual({ row: 18, col: 1, action: 'move' });
  });
});

describe('navigateGridKey', () => {
  it('maps keys, Ctrl+Home and RTL', () => {
    expect(navigateGridKey(at(5, 2), { key: 'ArrowDown' })).toEqual({ row: 6, col: 2, action: 'move' });
    expect(navigateGridKey(at(5, 2), { key: 'Home', ctrlKey: true })).toEqual({ row: 0, col: 0, action: 'move' });
    expect(navigateGridKey(at(5, 2), { key: 'End', metaKey: true })).toEqual({ row: 19, col: 3, action: 'move' });
    // RTL: ArrowLeft is "next column", ArrowRight at column 0 collapses
    expect(navigateGridKey(at(5, 1), { key: 'ArrowLeft' }, { rtl: true })).toEqual({ row: 5, col: 2, action: 'move' });
    expect(navigateGridKey(at(5, 0), { key: 'ArrowRight' }, { rtl: true, hasChildren: true, expanded: true })).toEqual({
      row: 5,
      col: 0,
      action: 'collapse',
    });
  });

  it('returns null for keys that are not grid moves (even with character shortcuts on elsewhere)', () => {
    expect(navigateGridKey(at(5, 2), { key: 'Enter' })).toBeNull();
    expect(navigateGridKey(at(5, 2), { key: 't' })).toBeNull();
    expect(navigateGridKey(at(5, 2), { key: 'ArrowDown', shiftKey: true })).toBeNull();
  });
});

describe('navigateGrid — row first (rowFocus)', () => {
  const rf: GridNavContext = { rowFocus: true };
  const row = (r: number) => at(r, ROW_FOCUS);

  it('ROW_FOCUS and HEADER_ROW are -1', () => {
    expect(ROW_FOCUS).toBe(-1);
    expect(HEADER_ROW).toBe(-1);
  });

  it('a focused row moves to the previous / next row and pages, staying on rows', () => {
    expect(navigateGrid(row(5), 'move.down', rf)).toEqual({ row: 6, col: -1, action: 'move' });
    expect(navigateGrid(row(5), 'move.up', rf)).toEqual({ row: 4, col: -1, action: 'move' });
    expect(navigateGrid(row(0), 'move.up', rf)).toEqual({ row: 0, col: -1, action: 'none' });
    expect(navigateGrid(row(19), 'move.down', rf)).toEqual({ row: 19, col: -1, action: 'none' });
    expect(navigateGrid(row(5), 'move.pageDown', rf)).toEqual({ row: 15, col: -1, action: 'move' });
    expect(navigateGrid(row(5), 'move.pageUp', { ...rf, pageSize: 3 })).toEqual({ row: 2, col: -1, action: 'move' });
    expect(navigateGrid(row(5), 'move.pageUp', rf)).toEqual({ row: 0, col: -1, action: 'move' });
  });

  it('Home / End on a focused row go to the first / last row (Ctrl too)', () => {
    expect(navigateGrid(row(5), 'move.home', rf)).toEqual({ row: 0, col: -1, action: 'move' });
    expect(navigateGrid(row(5), 'move.end', rf)).toEqual({ row: 19, col: -1, action: 'move' });
    expect(navigateGrid(row(5), 'move.home', { ...rf, toEdge: true })).toEqual({ row: 0, col: -1, action: 'move' });
    expect(navigateGrid(row(5), 'move.end', { ...rf, toEdge: true })).toEqual({ row: 19, col: -1, action: 'move' });
    expect(navigateGrid(row(0), 'move.home', rf)).toEqual({ row: 0, col: -1, action: 'none' });
  });

  it('Right on a focused row: collapsed parent expands, otherwise enters the first cell', () => {
    const parent = { ...rf, hasChildren: true };
    expect(navigateGrid(row(5), 'move.right', { ...parent, expanded: false })).toEqual({
      row: 5,
      col: -1,
      action: 'expand',
    });
    expect(navigateGrid(row(5), 'move.right', { ...parent, expanded: true })).toEqual({
      row: 5,
      col: 0,
      action: 'move',
    });
    expect(navigateGrid(row(5), 'move.right', rf)).toEqual({ row: 5, col: 0, action: 'move' });
  });

  it('Left on a focused row: expanded parent collapses, otherwise goes to the parent row', () => {
    expect(navigateGrid(row(5), 'move.left', { ...rf, hasChildren: true, expanded: true })).toEqual({
      row: 5,
      col: -1,
      action: 'collapse',
    });
    expect(navigateGrid(row(5), 'move.left', { ...rf, hasChildren: true, parentRow: 2 })).toEqual({
      row: 2,
      col: -1,
      action: 'move',
    });
    expect(navigateGrid(row(5), 'move.left', { ...rf, parentRow: 4 })).toEqual({ row: 4, col: -1, action: 'move' });
    // A root row stays (Left never enters a cell); a bogus parent index is ignored
    expect(navigateGrid(row(5), 'move.left', rf)).toEqual({ row: 5, col: -1, action: 'none' });
    expect(navigateGrid(row(5), 'move.left', { ...rf, parentRow: 7 })).toEqual({ row: 5, col: -1, action: 'none' });
  });

  it('cells: Left / Right between cells, Left on the first cell returns to the row', () => {
    expect(navigateGrid(at(5, 1), 'move.right', rf)).toEqual({ row: 5, col: 2, action: 'move' });
    expect(navigateGrid(at(5, 3), 'move.right', rf)).toEqual({ row: 5, col: 3, action: 'none' });
    expect(navigateGrid(at(5, 2), 'move.left', rf)).toEqual({ row: 5, col: 1, action: 'move' });
    expect(navigateGrid(at(5, 0), 'move.left', rf)).toEqual({ row: 5, col: -1, action: 'move' });
  });

  it('cells are plain cells: the toggle column does not expand, collapse or go to the parent', () => {
    const tree = { ...rf, hasChildren: true, treeCol: 0, parentRow: 2 };
    expect(navigateGrid(at(5, 0), 'move.right', { ...tree, expanded: false })).toEqual({
      row: 5,
      col: 1,
      action: 'move',
    });
    expect(navigateGrid(at(5, 0), 'move.left', { ...tree, expanded: true })).toEqual({
      row: 5,
      col: -1,
      action: 'move',
    });
  });

  it('cells: Up / Down and pages keep the column; Home / End the row edges; Ctrl+Home / End the column ends', () => {
    expect(navigateGrid(at(5, 2), 'move.down', rf)).toEqual({ row: 6, col: 2, action: 'move' });
    expect(navigateGrid(at(5, 2), 'move.up', rf)).toEqual({ row: 4, col: 2, action: 'move' });
    expect(navigateGrid(at(5, 2), 'move.pageDown', rf)).toEqual({ row: 15, col: 2, action: 'move' });
    expect(navigateGrid(at(5, 2), 'move.home', rf)).toEqual({ row: 5, col: 0, action: 'move' });
    expect(navigateGrid(at(5, 2), 'move.end', rf)).toEqual({ row: 5, col: 3, action: 'move' });
    expect(navigateGrid(at(5, 2), 'move.home', { ...rf, toEdge: true })).toEqual({ row: 0, col: 2, action: 'move' });
    expect(navigateGrid(at(5, 2), 'move.end', { ...rf, toEdge: true })).toEqual({ row: 19, col: 2, action: 'move' });
  });

  it('works without cells (rows only) and snaps a stale position back', () => {
    expect(navigateGrid(at(5, ROW_FOCUS, 20, 0), 'move.down', rf)).toEqual({ row: 6, col: -1, action: 'move' });
    expect(navigateGrid(at(5, ROW_FOCUS, 20, 0), 'move.right', rf)).toEqual({ row: 5, col: -1, action: 'none' });
    expect(navigateGrid(at(5, 9), 'move.left', rf)).toEqual({ row: 5, col: 2, action: 'move' });
    expect(navigateGrid(at(0, ROW_FOCUS, 0, 4), 'move.down', rf)).toEqual({ row: 0, col: -1, action: 'none' });
  });
});

describe('navigateGrid — header row', () => {
  const head: GridNavContext = { rowFocus: true, header: true };

  it('Up from the first row enters the header row (a focused row lands on its first cell)', () => {
    expect(navigateGrid(at(0, ROW_FOCUS), 'move.up', head)).toEqual({ row: -1, col: 0, action: 'move' });
    expect(navigateGrid(at(0, 2), 'move.up', head)).toEqual({ row: -1, col: 2, action: 'move' });
    expect(navigateGrid(at(0, 2), 'move.up', { header: true })).toEqual({ row: -1, col: 2, action: 'move' });
  });

  it('header cells: Left / Right / Home / End move, Left on the first cell stays, Up stays', () => {
    expect(navigateGrid(at(HEADER_ROW, 1), 'move.right', head)).toEqual({ row: -1, col: 2, action: 'move' });
    expect(navigateGrid(at(HEADER_ROW, 1), 'move.left', head)).toEqual({ row: -1, col: 0, action: 'move' });
    expect(navigateGrid(at(HEADER_ROW, 0), 'move.left', head)).toEqual({ row: -1, col: 0, action: 'none' });
    expect(navigateGrid(at(HEADER_ROW, 1), 'move.end', head)).toEqual({ row: -1, col: 3, action: 'move' });
    expect(navigateGrid(at(HEADER_ROW, 2), 'move.home', head)).toEqual({ row: -1, col: 0, action: 'move' });
    expect(navigateGrid(at(HEADER_ROW, 2), 'move.up', head)).toEqual({ row: -1, col: 2, action: 'none' });
  });

  it('Down leaves the header row in the same column; PageDown pages from it', () => {
    expect(navigateGrid(at(HEADER_ROW, 2), 'move.down', head)).toEqual({ row: 0, col: 2, action: 'move' });
    expect(navigateGrid(at(HEADER_ROW, 2), 'move.pageDown', head)).toEqual({ row: 9, col: 2, action: 'move' });
    expect(navigateGrid(at(HEADER_ROW, 2), 'move.pageUp', head)).toEqual({ row: -1, col: 2, action: 'none' });
  });

  it('pages and edge jumps stop at row 0: only Up enters the header row', () => {
    expect(navigateGrid(at(3, 2), 'move.pageUp', head)).toEqual({ row: 0, col: 2, action: 'move' });
    expect(navigateGrid(at(0, 2), 'move.pageUp', head)).toEqual({ row: 0, col: 2, action: 'none' });
    expect(navigateGrid(at(5, ROW_FOCUS), 'move.home', head)).toEqual({ row: 0, col: -1, action: 'move' });
    expect(navigateGrid(at(5, 2), 'move.home', { ...head, toEdge: true })).toEqual({ row: 0, col: 2, action: 'move' });
    expect(navigateGrid(at(5, 2), 'move.home', { header: true, toEdge: true })).toEqual({
      row: 0,
      col: 0,
      action: 'move',
    });
  });

  it('the header row never expands, collapses or takes row focus', () => {
    const tree = { ...head, hasChildren: true, expanded: false };
    expect(navigateGrid(at(HEADER_ROW, 0), 'move.right', tree)).toEqual({ row: -1, col: 1, action: 'move' });
    expect(navigateGrid(at(HEADER_ROW, 0), 'move.right', { header: true, hasChildren: true })).toEqual({
      row: -1,
      col: 1,
      action: 'move',
    });
    expect(navigateGrid(at(HEADER_ROW, 0), 'move.left', { header: true, hasChildren: true, expanded: true })).toEqual({
      row: -1,
      col: 0,
      action: 'none',
    });
  });

  it('a grid with no rows keeps its header cells', () => {
    expect(navigateGrid(at(HEADER_ROW, 0, 0, 4), 'move.right', head)).toEqual({ row: -1, col: 1, action: 'move' });
    expect(navigateGrid(at(HEADER_ROW, 0, 0, 4), 'move.down', head)).toEqual({ row: -1, col: 0, action: 'none' });
    expect(navigateGrid(at(HEADER_ROW, 0, 0, 0), 'move.right', head)).toEqual({ row: -1, col: 0, action: 'none' });
  });

  it('without `header`, row -1 is a stale position snapped to row 0', () => {
    expect(navigateGrid(at(HEADER_ROW, 1), 'move.down')).toEqual({ row: 1, col: 1, action: 'move' });
  });
});

describe('navigateGridKey — row first', () => {
  it('passes rowFocus / header through and reads Ctrl+Home as an edge jump', () => {
    const ctx = { rowFocus: true, header: true };
    expect(navigateGridKey(at(0, ROW_FOCUS), { key: 'ArrowUp' }, ctx)).toEqual({ row: -1, col: 0, action: 'move' });
    expect(navigateGridKey(at(5, 2), { key: 'End', ctrlKey: true }, ctx)).toEqual({ row: 19, col: 2, action: 'move' });
    expect(navigateGridKey(at(5, ROW_FOCUS), { key: 'ArrowRight' }, { ...ctx, hasChildren: true })).toEqual({
      row: 5,
      col: -1,
      action: 'expand',
    });
    // RTL: ArrowRight is "previous", so it collapses / returns to the row
    expect(navigateGridKey(at(5, 0), { key: 'ArrowRight' }, { ...ctx, rtl: true })).toEqual({
      row: 5,
      col: -1,
      action: 'move',
    });
  });
});
