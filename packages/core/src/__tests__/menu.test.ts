// ─────────────────────────────────────────────────────────────
//  Tests — the toolbar's More menu (Phase 10, step 2.5): `reduceMenu`
//  (open on the checked or first item, ArrowUp on the last, wrapping
//  moves, Home / End, select and Escape back to More, Tab and an outside
//  press close) and the `toolbarMenuKey` key table.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { DEFAULT_LABELS } from '../types';
import { resolveConfig } from '../render/config';
import { buildToolbar, layoutToolbar, toolbarMenuChecked, toolbarMenuItems } from '../state/toolbar';
import {
  TOOLBAR_MENU_CLOSED,
  reduceMenu,
  toolbarMenuKey,
  type ToolbarMenuEvent,
  type ToolbarMenuState,
} from '../state/menu';

const open = (active: number): ToolbarMenuState => ({ open: true, active });

/** Run `events` from the closed state over a menu of `count` items; the last result. */
function run(events: ToolbarMenuEvent[], count: number) {
  let state: ToolbarMenuState = TOOLBAR_MENU_CLOSED;
  let focus: ReturnType<typeof reduceMenu>['focus'] = null;
  for (const e of events) ({ state, focus } = reduceMenu(state, e, count));
  return { state, focus };
}

describe('reduceMenu — opening', () => {
  it('starts closed with no active item', () => {
    expect(TOOLBAR_MENU_CLOSED).toEqual({ open: false, active: -1 });
    expect(Object.isFrozen(TOOLBAR_MENU_CLOSED)).toBe(true);
  });

  it.each(['click', 'key'] as const)('%s opens on the checked item, else the first, and focuses it', via => {
    expect(reduceMenu(TOOLBAR_MENU_CLOSED, { type: 'open', via, checked: 3 }, 6)).toEqual({
      state: open(3),
      focus: 'item',
    });
    expect(reduceMenu(TOOLBAR_MENU_CLOSED, { type: 'open', via }, 6)).toEqual({ state: open(0), focus: 'item' });
    // No checked item (-1) or one out of range: the first
    expect(reduceMenu(TOOLBAR_MENU_CLOSED, { type: 'open', via, checked: -1 }, 6).state).toEqual(open(0));
    expect(reduceMenu(TOOLBAR_MENU_CLOSED, { type: 'open', via, checked: 6 }, 6).state).toEqual(open(0));
  });

  it('ArrowUp (keyUp) opens on the last item, whatever is checked', () => {
    expect(reduceMenu(TOOLBAR_MENU_CLOSED, { type: 'open', via: 'keyUp', checked: 2 }, 6)).toEqual({
      state: open(5),
      focus: 'item',
    });
  });

  it('a click on More while open closes the menu back to the button (toggle)', () => {
    expect(reduceMenu(open(2), { type: 'open', via: 'click' }, 6)).toEqual({
      state: TOOLBAR_MENU_CLOSED,
      focus: 'button',
    });
    // A key on the button while open (focus came back some other way) opens again on the item
    expect(reduceMenu(open(2), { type: 'open', via: 'key', checked: 1 }, 6)).toEqual({ state: open(1), focus: 'item' });
  });

  it('a menu with no item never opens', () => {
    expect(reduceMenu(TOOLBAR_MENU_CLOSED, { type: 'open', via: 'click' }, 0)).toEqual({
      state: TOOLBAR_MENU_CLOSED,
      focus: null,
    });
    // An open menu whose items went away closes back to the button
    expect(reduceMenu(open(1), { type: 'move', to: 'next' }, 0)).toEqual({
      state: TOOLBAR_MENU_CLOSED,
      focus: 'button',
    });
  });
});

describe('reduceMenu — moving', () => {
  it('ArrowDown / ArrowUp step and wrap around', () => {
    expect(reduceMenu(open(0), { type: 'move', to: 'next' }, 3)).toEqual({ state: open(1), focus: 'item' });
    expect(reduceMenu(open(2), { type: 'move', to: 'next' }, 3).state).toEqual(open(0));
    expect(reduceMenu(open(0), { type: 'move', to: 'prev' }, 3).state).toEqual(open(2));
    expect(reduceMenu(open(2), { type: 'move', to: 'prev' }, 3).state).toEqual(open(1));
  });

  it('Home / End go to the first / last item', () => {
    expect(reduceMenu(open(1), { type: 'move', to: 'first' }, 4)).toEqual({ state: open(0), focus: 'item' });
    expect(reduceMenu(open(1), { type: 'move', to: 'last' }, 4)).toEqual({ state: open(3), focus: 'item' });
  });

  it('stays on a lone item', () => {
    expect(reduceMenu(open(0), { type: 'move', to: 'next' }, 1).state).toEqual(open(0));
    expect(reduceMenu(open(0), { type: 'move', to: 'prev' }, 1).state).toEqual(open(0));
  });

  it('moves from a clamped index when the menu shrank', () => {
    expect(reduceMenu(open(7), { type: 'move', to: 'prev' }, 4).state).toEqual(open(2));
    expect(reduceMenu(open(-1), { type: 'move', to: 'next' }, 4).state).toEqual(open(1));
  });

  it('does nothing while closed', () => {
    expect(reduceMenu(TOOLBAR_MENU_CLOSED, { type: 'move', to: 'next' }, 4)).toEqual({
      state: TOOLBAR_MENU_CLOSED,
      focus: null,
    });
  });

  it('follows an item focused by the pointer without moving focus', () => {
    expect(reduceMenu(open(0), { type: 'focus', index: 2 }, 4)).toEqual({ state: open(2), focus: null });
    const same = open(2);
    expect(reduceMenu(same, { type: 'focus', index: 2 }, 4).state).toBe(same);
    expect(reduceMenu(same, { type: 'focus', index: 9 }, 4).state).toBe(same);
    expect(reduceMenu(TOOLBAR_MENU_CLOSED, { type: 'focus', index: 1 }, 4).state).toBe(TOOLBAR_MENU_CLOSED);
  });
});

describe('reduceMenu — closing', () => {
  it('activating an item closes back to More', () => {
    expect(reduceMenu(open(2), { type: 'select' }, 4)).toEqual({ state: TOOLBAR_MENU_CLOSED, focus: 'button' });
  });

  it('Escape closes back to More', () => {
    expect(reduceMenu(open(1), { type: 'close', reason: 'escape' }, 4)).toEqual({
      state: TOOLBAR_MENU_CLOSED,
      focus: 'button',
    });
  });

  it.each(['tab', 'outside'] as const)('%s closes and leaves focus where it goes', reason => {
    expect(reduceMenu(open(1), { type: 'close', reason }, 4)).toEqual({ state: TOOLBAR_MENU_CLOSED, focus: null });
  });

  it('closing or selecting a closed menu moves nothing', () => {
    for (const e of [
      { type: 'select' },
      { type: 'close', reason: 'escape' },
      { type: 'close', reason: 'tab' },
      { type: 'close', reason: 'outside' },
    ] satisfies ToolbarMenuEvent[]) {
      expect(reduceMenu(TOOLBAR_MENU_CLOSED, e, 4)).toEqual({ state: TOOLBAR_MENU_CLOSED, focus: null });
    }
  });

  it('runs a whole keyboard round trip', () => {
    expect(
      run(
        [
          { type: 'open', via: 'key', checked: 1 },
          { type: 'move', to: 'next' },
          { type: 'move', to: 'next' },
          { type: 'move', to: 'next' },
        ],
        3,
      ),
    ).toEqual({ state: open(1), focus: 'item' });
    expect(run([{ type: 'open', via: 'keyUp' }, { type: 'select' }], 3)).toEqual({
      state: TOOLBAR_MENU_CLOSED,
      focus: 'button',
    });
  });
});

describe('toolbarMenuKey', () => {
  it('on the More button: ArrowDown opens on the checked or first item, ArrowUp on the last', () => {
    expect(toolbarMenuKey({ key: 'ArrowDown' }, 'button')).toEqual({ type: 'open', via: 'key' });
    expect(toolbarMenuKey({ key: 'ArrowUp' }, 'button')).toEqual({ type: 'open', via: 'keyUp' });
  });

  it('on the More button: Enter and Space are left to the native click; other keys mean nothing', () => {
    for (const key of ['Enter', ' ', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape', 'Tab']) {
      expect(toolbarMenuKey({ key }, 'button')).toBeNull();
    }
  });

  it('in the menu: arrows, Home / End, Escape and Tab', () => {
    expect(toolbarMenuKey({ key: 'ArrowDown' }, 'menu')).toEqual({ type: 'move', to: 'next' });
    expect(toolbarMenuKey({ key: 'ArrowUp' }, 'menu')).toEqual({ type: 'move', to: 'prev' });
    expect(toolbarMenuKey({ key: 'Home' }, 'menu')).toEqual({ type: 'move', to: 'first' });
    expect(toolbarMenuKey({ key: 'End' }, 'menu')).toEqual({ type: 'move', to: 'last' });
    expect(toolbarMenuKey({ key: 'Escape' }, 'menu')).toEqual({ type: 'close', reason: 'escape' });
    expect(toolbarMenuKey({ key: 'Tab' }, 'menu')).toEqual({ type: 'close', reason: 'tab' });
    expect(toolbarMenuKey({ key: 'Tab', shiftKey: true }, 'menu')).toEqual({ type: 'close', reason: 'tab' });
  });

  it('in the menu: Enter and Space are left to the native click; left / right mean nothing', () => {
    for (const key of ['Enter', ' ', 'ArrowLeft', 'ArrowRight', 'a']) {
      expect(toolbarMenuKey({ key }, 'menu')).toBeNull();
    }
  });

  it('ignores keys with Ctrl, Cmd or Alt, and Shift with anything but Tab', () => {
    for (const mod of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(toolbarMenuKey({ key: 'ArrowDown', ...mod }, 'button')).toBeNull();
      expect(toolbarMenuKey({ key: 'ArrowDown', ...mod }, 'menu')).toBeNull();
      expect(toolbarMenuKey({ key: 'Tab', ...mod }, 'menu')).toBeNull();
    }
    expect(toolbarMenuKey({ key: 'ArrowDown', shiftKey: true }, 'button')).toBeNull();
    expect(toolbarMenuKey({ key: 'End', shiftKey: true }, 'menu')).toBeNull();
  });
});

describe('the menu driven by the toolbar layout', () => {
  const cfg = resolveConfig({});
  const groups = buildToolbar({
    toolbar: cfg.toolbar,
    zoomLevels: cfg.zoomLevels,
    labels: DEFAULT_LABELS,
    viewMode: 'Month',
    view: 'chart',
  });
  const items = toolbarMenuItems(
    layoutToolbar({ groups, width: 380, controlSize: cfg.controlSize, overflow: 'menu', labels: DEFAULT_LABELS }).menu,
  );

  it('opens on the current zoom level, steps over to the views and wraps to the first level', () => {
    const at = (s: ToolbarMenuState): string | undefined => items[s.active]?.focusKey;
    let { state } = reduceMenu(
      TOOLBAR_MENU_CLOSED,
      { type: 'open', via: 'key', checked: toolbarMenuChecked(items) },
      items.length,
    );
    expect(at(state)).toBe('menu:zoom:Month');
    ({ state } = reduceMenu(state, { type: 'move', to: 'last' }, items.length));
    expect(at(state)).toBe('menu:view:chart');
    ({ state } = reduceMenu(state, { type: 'move', to: 'next' }, items.length));
    expect(at(state)).toBe(items[0].focusKey);
    ({ state } = reduceMenu(state, { type: 'move', to: 'prev' }, items.length));
    expect(at(state)).toBe('menu:view:chart');
  });
});
