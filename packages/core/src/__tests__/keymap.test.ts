// ─────────────────────────────────────────────────────────────
//  Tests — interaction/keymap.ts (key → command per focus area)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { isGridEdgeJump, logicalArrow, resolveKey, type KeyLike } from '../interaction/keymap';

const k = (key: string, mods: Omit<KeyLike, 'key'> = {}): KeyLike => ({ key, ...mods });

describe('resolveKey — today’s global shortcuts', () => {
  it('Escape clears the selection, or cancels an active operation', () => {
    expect(resolveKey(k('Escape'), 'any')).toBe('clearSelection');
    expect(resolveKey(k('Escape'), 'timeline', { active: true })).toBe('cancel');
  });

  it('Ctrl/Cmd+A selects all, with or without Shift', () => {
    expect(resolveKey(k('a', { ctrlKey: true }), 'any')).toBe('selectAll');
    expect(resolveKey(k('A', { metaKey: true }), 'grid')).toBe('selectAll');
    expect(resolveKey(k('A', { ctrlKey: true, shiftKey: true }), 'any')).toBe('selectAll');
    expect(resolveKey(k('a'), 'any')).toBeNull();
  });

  it('+ / = zoom in, - zooms out, T goes to today', () => {
    expect(resolveKey(k('+', { shiftKey: true }), 'any')).toBe('zoomIn');
    expect(resolveKey(k('='), 'any')).toBe('zoomIn');
    expect(resolveKey(k('-'), 'any')).toBe('zoomOut');
    expect(resolveKey(k('t'), 'any')).toBe('today');
    expect(resolveKey(k('T', { shiftKey: true }), 'any')).toBe('today');
  });

  it('leaves Ctrl/Cmd and Alt combinations of character keys to the browser', () => {
    expect(resolveKey(k('+', { ctrlKey: true }), 'any')).toBeNull();
    expect(resolveKey(k('-', { metaKey: true }), 'any')).toBeNull();
    expect(resolveKey(k('t', { ctrlKey: true }), 'any')).toBeNull();
    expect(resolveKey(k('t', { altKey: true }), 'any')).toBeNull();
    expect(resolveKey(k('+', { altKey: true }), 'any')).toBeNull();
  });

  it('ignores AltGr (reported as Ctrl+Alt) so typed characters are not swallowed', () => {
    const altGr = { ctrlKey: true, altKey: true };
    expect(resolveKey(k('+', altGr), 'any')).toBeNull();
    expect(resolveKey(k('z', altGr), 'grid')).toBeNull();
    expect(resolveKey(k('a', altGr), 'timeline')).toBeNull();
    expect(resolveKey(k('Escape', altGr), 'any')).toBe('clearSelection');
  });
});

describe('resolveKey — new commands', () => {
  it('F fits, L links (only where a task can be focused)', () => {
    expect(resolveKey(k('f'), 'any')).toBe('fit');
    expect(resolveKey(k('l'), 'timeline')).toBe('link');
    expect(resolveKey(k('L', { shiftKey: true }), 'grid')).toBe('link');
    expect(resolveKey(k('l'), 'any')).toBeNull();
    expect(resolveKey(k('l'), 'toolbar')).toBeNull();
  });

  it('undo / redo', () => {
    expect(resolveKey(k('z', { ctrlKey: true }), 'any')).toBe('undo');
    expect(resolveKey(k('Z', { metaKey: true, shiftKey: true }), 'any')).toBe('redo');
    expect(resolveKey(k('y', { ctrlKey: true }), 'grid')).toBe('redo');
  });

  it('character shortcuts can be turned off (WCAG 2.1.4)', () => {
    const off = { characterShortcuts: false };
    for (const key of ['+', '=', '-', 't', 'f']) expect(resolveKey(k(key), 'any', off)).toBeNull();
    expect(resolveKey(k('l'), 'timeline', off)).toBeNull();
    // modifier shortcuts and navigation stay
    expect(resolveKey(k('a', { ctrlKey: true }), 'any', off)).toBe('selectAll');
    expect(resolveKey(k('ArrowDown'), 'grid', off)).toBe('move.down');
  });
});

describe('resolveKey — grid and timeline', () => {
  it.each([
    ['ArrowUp', 'move.up'],
    ['ArrowDown', 'move.down'],
    ['ArrowLeft', 'move.left'],
    ['ArrowRight', 'move.right'],
    ['PageUp', 'move.pageUp'],
    ['PageDown', 'move.pageDown'],
    ['Home', 'move.home'],
    ['End', 'move.end'],
    [' ', 'toggle.select'],
    ['Enter', 'activate'],
    ['F2', 'edit'],
    ['Delete', 'delete'],
    ['Backspace', 'delete'],
  ])('%s → %s', (key, command) => {
    expect(resolveKey(k(key), 'grid')).toBe(command);
    expect(resolveKey(k(key), 'timeline')).toBe(command);
  });

  it('Ctrl/Cmd+Home/End still move (edge jump), Shift+Space extends', () => {
    expect(resolveKey(k('Home', { ctrlKey: true }), 'grid')).toBe('move.home');
    expect(resolveKey(k('End', { metaKey: true }), 'grid')).toBe('move.end');
    expect(isGridEdgeJump(k('Home', { ctrlKey: true }))).toBe(true);
    expect(isGridEdgeJump(k('Home'))).toBe(false);
    expect(resolveKey(k(' ', { shiftKey: true }), 'grid')).toBe('toggle.extend');
    expect(resolveKey(k(' ', { ctrlKey: true }), 'grid')).toBe('toggle.select');
  });

  it('modified arrows are not navigation (keyboard edit and the browser use them)', () => {
    expect(resolveKey(k('ArrowLeft', { shiftKey: true }), 'timeline')).toBeNull();
    expect(resolveKey(k('ArrowLeft', { altKey: true }), 'timeline')).toBeNull();
    expect(resolveKey(k('ArrowDown', { ctrlKey: true }), 'grid')).toBeNull();
  });

  it('mirrors left / right in RTL', () => {
    expect(resolveKey(k('ArrowLeft'), 'grid', { rtl: true })).toBe('move.right');
    expect(resolveKey(k('ArrowRight'), 'timeline', { rtl: true })).toBe('move.left');
    expect(logicalArrow('ArrowLeft')).toBe('left');
    expect(logicalArrow('ArrowLeft', true)).toBe('right');
    expect(logicalArrow('ArrowUp')).toBeNull();
  });

  it('ignores unrelated keys', () => {
    expect(resolveKey(k('x'), 'grid')).toBeNull();
    expect(resolveKey(k('Tab'), 'timeline')).toBeNull();
  });
});

describe('resolveKey — toolbar and the global area', () => {
  it('toolbar: roving focus with Left/Right/Home/End, buttons keep Enter and Space', () => {
    expect(resolveKey(k('ArrowRight'), 'toolbar')).toBe('move.right');
    expect(resolveKey(k('ArrowRight'), 'toolbar', { rtl: true })).toBe('move.left');
    expect(resolveKey(k('Home'), 'toolbar')).toBe('move.home');
    expect(resolveKey(k('End'), 'toolbar')).toBe('move.end');
    expect(resolveKey(k('ArrowDown'), 'toolbar')).toBeNull();
    expect(resolveKey(k('Enter'), 'toolbar')).toBeNull();
    expect(resolveKey(k(' '), 'toolbar')).toBeNull();
    expect(resolveKey(k('t'), 'toolbar')).toBe('today');
  });

  it('any: global shortcuts only', () => {
    expect(resolveKey(k('ArrowDown'), 'any')).toBeNull();
    expect(resolveKey(k('Enter'), 'any')).toBeNull();
    expect(resolveKey(k('Delete'), 'any')).toBeNull();
  });
});
