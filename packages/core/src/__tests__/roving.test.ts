// ─────────────────────────────────────────────────────────────
//  Tests — interaction/roving.ts (roving tabindex)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  gridTabStop,
  rovingIndex,
  rovingIndexForKey,
  sameGridSpot,
  tabStopIndex,
  type GridFocusSpot,
} from '../interaction/roving';

describe('rovingIndex', () => {
  it('previous / next without wrapping by default', () => {
    expect(rovingIndex(2, 'move.right', 5)).toBe(3);
    expect(rovingIndex(2, 'move.left', 5)).toBe(1);
    expect(rovingIndex(4, 'move.right', 5)).toBe(4);
    expect(rovingIndex(0, 'move.left', 5)).toBe(0);
    // up / down are previous / next too
    expect(rovingIndex(2, 'move.down', 5)).toBe(3);
    expect(rovingIndex(2, 'move.up', 5)).toBe(1);
  });

  it('wraps around the ends with `wrap` (the toolbar)', () => {
    expect(rovingIndex(4, 'move.right', 5, { wrap: true })).toBe(0);
    expect(rovingIndex(0, 'move.left', 5, { wrap: true })).toBe(4);
    expect(rovingIndex(2, 'move.right', 5, { wrap: true })).toBe(3);
    expect(rovingIndex(0, 'move.left', 1, { wrap: true })).toBe(0);
  });

  it('Home / End go to the first / last item; PageUp / PageDown keep the current one', () => {
    expect(rovingIndex(2, 'move.home', 5)).toBe(0);
    expect(rovingIndex(2, 'move.end', 5)).toBe(4);
    expect(rovingIndex(2, 'move.pageUp', 5)).toBe(2);
    expect(rovingIndex(2, 'move.pageDown', 5)).toBe(2);
  });

  it('nothing focused (or a stale index): next / Home → first, previous / End → last', () => {
    expect(rovingIndex(-1, 'move.right', 5)).toBe(0);
    expect(rovingIndex(-1, 'move.left', 5)).toBe(4);
    expect(rovingIndex(9, 'move.right', 5)).toBe(0);
    expect(rovingIndex(9, 'move.left', 5)).toBe(4);
    expect(rovingIndex(1.5, 'move.right', 5)).toBe(0);
    expect(rovingIndex(-1, 'move.pageDown', 5)).toBe(0);
  });

  it('returns -1 for an empty set', () => {
    expect(rovingIndex(0, 'move.right', 0)).toBe(-1);
    expect(rovingIndex(0, 'move.home', 0, { wrap: true })).toBe(-1);
  });
});

describe('rovingIndexForKey', () => {
  it('ArrowLeft / ArrowRight / Home / End, mirrored in RTL', () => {
    expect(rovingIndexForKey(1, { key: 'ArrowRight' }, 4)).toBe(2);
    expect(rovingIndexForKey(1, { key: 'ArrowLeft' }, 4)).toBe(0);
    expect(rovingIndexForKey(3, { key: 'ArrowRight' }, 4, { wrap: true })).toBe(0);
    expect(rovingIndexForKey(1, { key: 'ArrowRight' }, 4, { rtl: true })).toBe(0);
    expect(rovingIndexForKey(2, { key: 'Home' }, 4)).toBe(0);
    expect(rovingIndexForKey(2, { key: 'End' }, 4)).toBe(3);
  });

  it('returns null for keys that do not move focus (the control keeps them)', () => {
    expect(rovingIndexForKey(1, { key: 'Enter' }, 4)).toBeNull();
    expect(rovingIndexForKey(1, { key: ' ' }, 4)).toBeNull();
    expect(rovingIndexForKey(1, { key: 'ArrowDown' }, 4)).toBeNull();
    expect(rovingIndexForKey(1, { key: 'ArrowRight', shiftKey: true }, 4)).toBeNull();
    expect(rovingIndexForKey(1, { key: 'f' }, 4)).toBeNull();
    expect(rovingIndexForKey(1, { key: 'Tab' }, 4)).toBeNull();
  });
});

describe('tabStopIndex', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('takes the first preferred id that is in the set', () => {
    expect(tabStopIndex(ids, ['c', 'b'], 0)).toBe(2);
    expect(tabStopIndex(ids, ['x', 'b'], 0)).toBe(1);
    expect(tabStopIndex(ids, [null, 'd'], 0)).toBe(3);
    expect(tabStopIndex(ids, [undefined, null], 1)).toBe(1);
  });

  it('falls back to fallbackIndex, clamped into the set', () => {
    expect(tabStopIndex(ids, ['x'], 2)).toBe(2);
    expect(tabStopIndex(ids, [], 9)).toBe(3);
    expect(tabStopIndex(ids, [], -1)).toBe(0);
    expect(tabStopIndex(ids, [], Number.NaN)).toBe(0);
  });

  it('returns -1 for an empty set', () => {
    expect(tabStopIndex([], ['a'], 0)).toBe(-1);
  });

  it('reproduces the bindings’ tabStopRow: focused → last focused → first row in view, not pinned', () => {
    // Mounted rows: a pinned (selected) row at the top, then the window from visible index 10
    const mounted = [
      { id: 'sel', visibleIndex: 2, pinnedTop: 0 as number | null },
      { id: 'r10', visibleIndex: 10, pinnedTop: null },
      { id: 'r11', visibleIndex: 11, pinnedTop: null },
      { id: 'r12', visibleIndex: 12, pinnedTop: null },
    ];
    const stop = (preferred: (string | null)[], firstInView: number) =>
      mounted[
        tabStopIndex(
          mounted.map(m => m.id),
          preferred,
          mounted.findIndex(m => m.pinnedTop === null && m.visibleIndex >= firstInView),
        )
      ]?.id;
    expect(stop(['r12', 'r11'], 11)).toBe('r12');
    expect(stop([null, 'sel'], 11)).toBe('sel');
    expect(stop([null, null], 11)).toBe('r11');
    expect(stop(['gone', null], 0)).toBe('r10');
  });
});

describe('gridTabStop (the task list’s one tab stop)', () => {
  const cols = ['name', 'start', 'end'];

  it('the header cell focused last, while its column is shown', () => {
    expect(gridTabStop({ kind: 'head', key: 'start' }, 'a', cols)).toEqual({ kind: 'head', key: 'start' });
    // Its column hidden: back to the row
    expect(gridTabStop({ kind: 'head', key: 'gone' }, 'a', cols)).toEqual({ kind: 'row', id: 'a' });
  });

  it('the cell focused last while its row is the tab-stop row, else that row', () => {
    expect(gridTabStop({ kind: 'cell', id: 'a', key: 'end' }, 'a', cols)).toEqual({
      kind: 'cell',
      id: 'a',
      key: 'end',
    });
    expect(gridTabStop({ kind: 'cell', id: 'b', key: 'end' }, 'a', cols)).toEqual({ kind: 'row', id: 'a' });
    expect(gridTabStop({ kind: 'cell', id: 'a', key: 'gone' }, 'a', cols)).toEqual({ kind: 'row', id: 'a' });
    expect(gridTabStop({ kind: 'row', id: 'b' }, 'a', cols)).toEqual({ kind: 'row', id: 'a' });
    expect(gridTabStop(null, 'a', cols)).toEqual({ kind: 'row', id: 'a' });
  });

  it('without rows (loading, empty, a failed first page) the first header cell keeps the tab stop', () => {
    expect(gridTabStop(null, null, cols)).toEqual({ kind: 'head', key: 'name' });
    expect(gridTabStop({ kind: 'row', id: 'gone' }, null, cols)).toEqual({ kind: 'head', key: 'name' });
    expect(gridTabStop({ kind: 'cell', id: 'gone', key: 'end' }, null, cols)).toEqual({ kind: 'head', key: 'name' });
    // A header cell focused last still wins
    expect(gridTabStop({ kind: 'head', key: 'end' }, null, cols)).toEqual({ kind: 'head', key: 'end' });
    // Neither rows nor columns: no tab stop
    expect(gridTabStop(null, null, [])).toBeNull();
  });

  it('keeps the spot object it was given (signal equality)', () => {
    const spot: GridFocusSpot = { kind: 'row', id: 'a' };
    expect(gridTabStop(spot, 'a', cols)).toBe(spot);
  });
});

describe('sameGridSpot', () => {
  it('compares kind, row and column', () => {
    expect(sameGridSpot(null, null)).toBe(true);
    expect(sameGridSpot({ kind: 'row', id: 'a' }, null)).toBe(false);
    expect(sameGridSpot({ kind: 'row', id: 'a' }, { kind: 'row', id: 'a' })).toBe(true);
    expect(sameGridSpot({ kind: 'row', id: 'a' }, { kind: 'row', id: 'b' })).toBe(false);
    expect(sameGridSpot({ kind: 'head', key: 'x' }, { kind: 'head', key: 'x' })).toBe(true);
    expect(sameGridSpot({ kind: 'head', key: 'x' }, { kind: 'head', key: 'y' })).toBe(false);
    expect(sameGridSpot({ kind: 'cell', id: 'a', key: 'x' }, { kind: 'cell', id: 'a', key: 'x' })).toBe(true);
    expect(sameGridSpot({ kind: 'cell', id: 'a', key: 'x' }, { kind: 'cell', id: 'a', key: 'y' })).toBe(false);
    expect(sameGridSpot({ kind: 'cell', id: 'a', key: 'x' }, { kind: 'row', id: 'a' })).toBe(false);
  });
});
