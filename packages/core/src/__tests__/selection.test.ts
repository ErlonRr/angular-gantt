// ─────────────────────────────────────────────────────────────
//  Tests — selection reducer (click, Ctrl/Cmd toggle, Shift range, select all)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  emptySelection,
  selectAllRows,
  selectionChanged,
  selectionClick,
  selectionModifiers,
  selectionOf,
  shouldEmitSelection,
  type SelectionModifiers,
  type SelectionPolicy,
  type SelectionState,
} from '../state/selection';

const ROWS = ['a', 'b', 'c', 'd', 'e'];
const MULTI: SelectionPolicy = { enabled: true, multi: true };
const SINGLE: SelectionPolicy = { enabled: true, multi: false };
const OFF: SelectionPolicy = { enabled: false, multi: true };
const PLAIN: SelectionModifiers = { ctrl: false, shift: false };
const CTRL: SelectionModifiers = { ctrl: true, shift: false };
const SHIFT: SelectionModifiers = { ctrl: false, shift: true };

const ids = (s: SelectionState) => [...s.selected];
const click = (s: SelectionState, id: string, mods = PLAIN, policy = MULTI) =>
  selectionClick(s, id, mods, ROWS, policy);

describe('selectionClick', () => {
  it('plain click selects the row alone and anchors it', () => {
    const s = click(selectionOf(['a', 'b']), 'c');
    expect(ids(s)).toEqual(['c']);
    expect(s.anchor).toBe('c');
  });

  it('ctrl click adds a row and moves the anchor', () => {
    const s = click(click(emptySelection(), 'a'), 'c', CTRL);
    expect(ids(s)).toEqual(['a', 'c']);
    expect(s.anchor).toBe('c');
  });

  it('ctrl click on the anchor removes it and clears the anchor', () => {
    const s = click(click(click(emptySelection(), 'a'), 'c', CTRL), 'c', CTRL);
    expect(ids(s)).toEqual(['a']);
    expect(s.anchor).toBeNull();
  });

  it('ctrl click on another selected row removes it and keeps the anchor', () => {
    const s = click(click(click(emptySelection(), 'a'), 'c', CTRL), 'a', CTRL);
    expect(ids(s)).toEqual(['c']);
    expect(s.anchor).toBe('c');
  });

  it('shift click adds the visible range from the anchor (downwards)', () => {
    const s = click(click(emptySelection(), 'b'), 'd', SHIFT);
    expect(ids(s)).toEqual(['b', 'c', 'd']);
    expect(s.anchor).toBe('d');
  });

  it('shift click works upwards and keeps the existing selection', () => {
    let s = click(emptySelection(), 'e');
    s = click(s, 'a', CTRL); // anchor = a, selection = {e, a}
    s = click(s, 'c', CTRL); // anchor = c
    s = click(s, 'a', SHIFT); // range c..a
    expect(new Set(ids(s))).toEqual(new Set(['a', 'b', 'c', 'e']));
    expect(ids(s)).toEqual(['e', 'a', 'c', 'b']);
    expect(s.anchor).toBe('a');
  });

  it('shift click needs an anchor: none → single select or ctrl toggle; one → range', () => {
    expect(ids(click(emptySelection(), 'c', SHIFT))).toEqual(['c']);
    const toggled = click(selectionOf(['a']), 'c', { ctrl: true, shift: true });
    // selectionOf anchors 'a', so this is a range a..c
    expect(ids(toggled)).toEqual(['a', 'b', 'c']);
    const noAnchor: SelectionState = { selected: new Set(['a']), anchor: null };
    expect(ids(click(noAnchor, 'c', { ctrl: true, shift: true }))).toEqual(['a', 'c']);
  });

  it('an empty-string anchor counts as no anchor (truthiness, as in the services it replaces)', () => {
    const s = click({ selected: new Set(['']), anchor: '' }, 'c', SHIFT);
    expect(ids(s)).toEqual(['c']);
    expect(s.anchor).toBe('c');
  });

  it('shift click ranges follow the order of orderedIds, not alphabetical order', () => {
    const start: SelectionState = { selected: new Set(['e']), anchor: 'e' };
    const s = selectionClick(start, 'c', SHIFT, ['e', 'd', 'c', 'b'], MULTI);
    expect(ids(s)).toEqual(['e', 'd', 'c']);
    const reversed = selectionClick(start, 'c', SHIFT, ['a', 'b', 'c', 'e', 'd'], MULTI);
    expect(ids(reversed)).toEqual(['e', 'c']);
  });

  it('shift click with an anchor or target outside the visible rows selects the target alone', () => {
    const hiddenAnchor: SelectionState = { selected: new Set(['x']), anchor: 'x' };
    const s = click(hiddenAnchor, 'c', SHIFT);
    expect(ids(s)).toEqual(['c']);
    expect(s.anchor).toBe('c');
    expect(ids(click(click(emptySelection(), 'a'), 'zz', SHIFT))).toEqual(['zz']);
  });

  it('single-select ignores modifiers', () => {
    const start = click(emptySelection(), 'a', PLAIN, SINGLE);
    expect(ids(click(start, 'c', CTRL, SINGLE))).toEqual(['c']);
    expect(ids(click(start, 'c', SHIFT, SINGLE))).toEqual(['c']);
    expect(ids(click(start, 'c', { ctrl: true, shift: true }, SINGLE))).toEqual(['c']);
  });

  it('disabled selection returns the same state', () => {
    const start = selectionOf(['a']);
    expect(click(start, 'c', PLAIN, OFF)).toBe(start);
    expect(click(start, 'c', SHIFT, OFF)).toBe(start);
  });

  it('never mutates its input', () => {
    const start = selectionOf(['a']);
    click(start, 'c', CTRL);
    click(start, 'c', SHIFT);
    click(start, 'a', CTRL);
    expect(ids(start)).toEqual(['a']);
    expect(start.anchor).toBe('a');
  });
});

describe('selectAllRows / selectionOf / emptySelection', () => {
  it('selectAllRows selects every row and anchors the last', () => {
    const s = selectAllRows(ROWS, MULTI);
    expect(s && ids(s)).toEqual(ROWS);
    expect(s?.anchor).toBe('e');
    expect(selectAllRows([], MULTI)).toEqual({ selected: new Set(), anchor: null });
  });

  it('selectAllRows is refused when disabled or single-select', () => {
    expect(selectAllRows(ROWS, SINGLE)).toBeNull();
    expect(selectAllRows(ROWS, OFF)).toBeNull();
  });

  it('selectionOf replaces the selection and anchors the last id', () => {
    const s = selectionOf(['d', 'b']);
    expect(ids(s)).toEqual(['d', 'b']);
    expect(s.anchor).toBe('b');
    expect(selectionOf([]).anchor).toBeNull();
  });

  it('emptySelection empties and drops the anchor', () => {
    expect(emptySelection()).toEqual({ selected: new Set(), anchor: null });
  });
});

describe('selectionChanged', () => {
  it('compares the selected ids only', () => {
    expect(selectionChanged(selectionOf(['a', 'b']), selectionOf(['b', 'a']))).toBe(false);
    expect(selectionChanged(selectionOf(['a']), selectionOf(['a', 'b']))).toBe(true);
    expect(selectionChanged(selectionOf(['a']), selectionOf(['b']))).toBe(true);
    expect(selectionChanged(emptySelection(), emptySelection())).toBe(false);
  });

  it('a repeated plain click is not a change; clicking a disabled chart is not either', () => {
    const s = click(emptySelection(), 'a');
    expect(selectionChanged(s, click(s, 'a'))).toBe(false);
    expect(selectionChanged(s, click(s, 'b', PLAIN, OFF))).toBe(false);
  });
});

describe('shouldEmitSelection', () => {
  it('emits on every action that produced a new state, even without a change', () => {
    const s = click(emptySelection(), 'a');
    expect(shouldEmitSelection(emptySelection(), s, 'click')).toBe(true);
    expect(shouldEmitSelection(s, click(s, 'a'), 'click')).toBe(true);
    const range = click(selectionOf(['a', 'b', 'c']), 'c', SHIFT);
    expect(shouldEmitSelection(selectionOf(['a', 'b', 'c']), range, 'click')).toBe(true);
    expect(shouldEmitSelection(selectionOf(['a', 'b']), selectionOf(['b', 'a']), 'set')).toBe(true);
    expect(shouldEmitSelection(emptySelection(), selectionOf([]), 'set')).toBe(true);
    expect(shouldEmitSelection(emptySelection(), emptySelection(), 'selectAll')).toBe(true);
  });

  it('skips a disabled click (same state) and a clear of an empty selection', () => {
    const s = selectionOf(['a']);
    expect(shouldEmitSelection(s, click(s, 'b', PLAIN, OFF), 'click')).toBe(false);
    expect(shouldEmitSelection(emptySelection(), emptySelection(), 'clear')).toBe(false);
    expect(shouldEmitSelection(s, emptySelection(), 'clear')).toBe(true);
  });
});

describe('selectionModifiers', () => {
  it('maps Ctrl or Cmd to ctrl and Shift to shift', () => {
    expect(selectionModifiers({ ctrlKey: true, metaKey: false, shiftKey: false })).toEqual(CTRL);
    expect(selectionModifiers({ ctrlKey: false, metaKey: true, shiftKey: false })).toEqual(CTRL);
    expect(selectionModifiers({ ctrlKey: false, metaKey: false, shiftKey: true })).toEqual(SHIFT);
  });
});
