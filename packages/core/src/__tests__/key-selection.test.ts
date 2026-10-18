// ─────────────────────────────────────────────────────────────
//  Tests — interaction/key-selection.ts (Space / Shift+Space /
//  Ctrl+Space / Enter through the selection reducer)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { isKeySelectionCommand, keySelectionModifiers } from '../interaction/key-selection';
import { resolveKey } from '../interaction/keymap';
import {
  emptySelection,
  selectionClick,
  selectionModifiers,
  selectionOf,
  type SelectionPolicy,
  type SelectionState,
} from '../state/selection';

const ids = ['a', 'b', 'c', 'd', 'e'];
const multi: SelectionPolicy = { enabled: true, multi: true };
const single: SelectionPolicy = { enabled: true, multi: false };
const sorted = (s: SelectionState) => [...s.selected].sort();

/** What a key does to `state` on row `id`, the way a binding wires it. */
function press(
  state: SelectionState,
  id: string,
  key: string,
  mods: { shiftKey?: boolean; ctrlKey?: boolean },
  policy: SelectionPolicy,
) {
  const cmd = resolveKey({ key, ...mods }, 'grid');
  if (!isKeySelectionCommand(cmd)) throw new Error(`${key} is not a selection key`);
  return selectionClick(state, id, selectionModifiers(keySelectionModifiers(cmd, policy.multi)), ids, policy);
}

describe('keySelectionModifiers', () => {
  it('maps each command to click modifiers', () => {
    expect(keySelectionModifiers('toggle.select', true)).toEqual({ ctrlKey: true, metaKey: false, shiftKey: false });
    expect(keySelectionModifiers('toggle.extend', true)).toEqual({ ctrlKey: false, metaKey: false, shiftKey: true });
    expect(keySelectionModifiers('activate', true)).toEqual({ ctrlKey: false, metaKey: false, shiftKey: false });
  });

  it('single-select: every command is a plain click', () => {
    for (const cmd of ['toggle.select', 'toggle.extend', 'activate'] as const) {
      expect(keySelectionModifiers(cmd, false)).toEqual({ ctrlKey: false, metaKey: false, shiftKey: false });
    }
  });

  it('isKeySelectionCommand picks Space, Shift+Space, Ctrl+Space and Enter only', () => {
    expect(isKeySelectionCommand('toggle.select')).toBe(true);
    expect(isKeySelectionCommand('toggle.extend')).toBe(true);
    expect(isKeySelectionCommand('activate')).toBe(true);
    expect(isKeySelectionCommand('edit')).toBe(false);
    expect(isKeySelectionCommand('move.down')).toBe(false);
    expect(isKeySelectionCommand(null)).toBe(false);
  });
});

describe('keyboard selection through selectionClick', () => {
  it('multi-select: Space toggles, Ctrl+Space toggles, Shift+Space selects the range, Enter selects only the row', () => {
    let s = press(emptySelection(), 'b', ' ', {}, multi);
    expect(sorted(s)).toEqual(['b']);
    s = press(s, 'd', ' ', {}, multi);
    expect(sorted(s)).toEqual(['b', 'd']);
    s = press(s, 'd', ' ', { ctrlKey: true }, multi);
    expect(sorted(s)).toEqual(['b']);
    s = press(selectionOf(['b']), 'e', ' ', { shiftKey: true }, multi);
    expect(sorted(s)).toEqual(['b', 'c', 'd', 'e']);
    s = press(s, 'c', 'Enter', {}, multi);
    expect(sorted(s)).toEqual(['c']);
  });

  it('single-select: Space and Shift+Space select only the row', () => {
    let s = press(emptySelection(), 'b', ' ', {}, single);
    expect(sorted(s)).toEqual(['b']);
    s = press(s, 'd', ' ', {}, single);
    expect(sorted(s)).toEqual(['d']);
    s = press(s, 'a', ' ', { shiftKey: true }, single);
    expect(sorted(s)).toEqual(['a']);
  });
});
