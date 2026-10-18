// ─────────────────────────────────────────────────────────────
//  Tests — interaction/grid-nav.ts (treegrid focus reducer)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { navigateGrid, navigateGridKey, type GridNavState } from '../interaction/grid-nav';

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
