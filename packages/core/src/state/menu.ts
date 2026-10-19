// ─────────────────────────────────────────────────────────────
//  gantry · state/menu.ts
//  The toolbar's "More" menu (WAI-ARIA menu button): open from the
//  button, move between the items (wrapping, Home / End), activate,
//  close back to the button. Both painters drive it with the same
//  reducer and key table, so focus moves the same way:
//
//    More button   click / Enter / Space (a native click) → open on the checked
//                  item, else the first; a click while open closes
//                  ArrowDown → open on the checked item, else the first
//                  ArrowUp → open on the last item
//    Menu item     ArrowDown / ArrowUp → next / previous, wrapping
//                  Home / End → first / last
//                  Enter / Space / click (a native click) → run the item's
//                  action, then `select`: close, focus back on More
//                  Escape → close, focus back on More
//                  Tab / Shift+Tab → close, focus moves on (no preventDefault)
//    Outside       a pointer press outside the menu and its button → close
//                  (focus stays where the press puts it)
//
//  Core owns no DOM: `reduceMenu` says where focus goes ('item': the
//  active item, 'button': the More button, null: leave it).
// ─────────────────────────────────────────────────────────────

import type { KeyLike } from '../interaction/keymap';

/** Open state and the index of the active item (`-1`: none). */
export interface ToolbarMenuState {
  open: boolean;
  active: number;
}

export const TOOLBAR_MENU_CLOSED: Readonly<ToolbarMenuState> = Object.freeze({ open: false, active: -1 });

export type ToolbarMenuEvent =
  /**
   * From the More button: a `click` (pointer, or Enter / Space through the button's native
   * activation) toggles; `key` (ArrowDown) opens; `keyUp` (ArrowUp) opens on the last item.
   * `checked` is the index of the checked item (`toolbarMenuChecked`), where `click` and `key` open.
   */
  | { type: 'open'; via: 'click' | 'key' | 'keyUp'; checked?: number | undefined }
  | { type: 'move'; to: 'next' | 'prev' | 'first' | 'last' }
  /** An item got focus some other way (pointer): it becomes the active item */
  | { type: 'focus'; index: number }
  /** An item was activated (Enter / Space / click; the binding runs its action) */
  | { type: 'select' }
  | { type: 'close'; reason: 'escape' | 'tab' | 'outside' };

/** Where focus goes after an event: the active item, the menu button, or nowhere (leave it). */
export type ToolbarMenuFocus = 'item' | 'button' | null;

const clampIndex = (i: number, count: number): number => Math.min(Math.max(i, 0), count - 1);

/**
 * The next menu state for `event` in a menu of `count` items (`toolbarMenuItems(menu).length`), and
 * where focus goes. A menu with no item is closed (focus back on the button if it was open).
 */
export function reduceMenu(
  state: ToolbarMenuState,
  event: ToolbarMenuEvent,
  count: number,
): { state: ToolbarMenuState; focus: ToolbarMenuFocus } {
  if (count <= 0) return { state: TOOLBAR_MENU_CLOSED, focus: state.open ? 'button' : null };
  switch (event.type) {
    case 'open': {
      if (event.via === 'click' && state.open) return { state: TOOLBAR_MENU_CLOSED, focus: 'button' };
      const checked = event.checked;
      const active =
        event.via === 'keyUp' ? count - 1 : checked !== undefined && checked >= 0 && checked < count ? checked : 0;
      return { state: { open: true, active }, focus: 'item' };
    }
    case 'move': {
      if (!state.open) return { state, focus: null };
      const cur = clampIndex(state.active, count);
      const active =
        event.to === 'first'
          ? 0
          : event.to === 'last'
            ? count - 1
            : (cur + (event.to === 'next' ? 1 : -1) + count) % count;
      return { state: { open: true, active }, focus: 'item' };
    }
    case 'focus':
      if (!state.open || event.index < 0 || event.index >= count || event.index === state.active)
        return { state, focus: null };
      return { state: { open: true, active: event.index }, focus: null };
    case 'select':
      return { state: TOOLBAR_MENU_CLOSED, focus: state.open ? 'button' : null };
    case 'close':
      if (!state.open) return { state, focus: null };
      return { state: TOOLBAR_MENU_CLOSED, focus: event.reason === 'escape' ? 'button' : null };
  }
}

/**
 * What a key means on the More button (`'button'`) or on a menu item (`'menu'`), or `null` (leave
 * the key alone: Enter / Space activate the button natively, which is a `click`). The binding
 * calls `preventDefault()` for every event but `close: 'tab'`, and stops an Escape it handles from
 * reaching the chart's own Escape (`clearSelection`). Keys with Ctrl, Cmd or Alt mean nothing.
 */
export function toolbarMenuKey(event: KeyLike, where: 'button' | 'menu'): ToolbarMenuEvent | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const { key } = event;
  if (where === 'button') {
    if (event.shiftKey) return null;
    if (key === 'ArrowDown') return { type: 'open', via: 'key' };
    if (key === 'ArrowUp') return { type: 'open', via: 'keyUp' };
    return null;
  }
  if (key === 'Tab') return { type: 'close', reason: 'tab' };
  if (event.shiftKey) return null;
  switch (key) {
    case 'ArrowDown':
      return { type: 'move', to: 'next' };
    case 'ArrowUp':
      return { type: 'move', to: 'prev' };
    case 'Home':
      return { type: 'move', to: 'first' };
    case 'End':
      return { type: 'move', to: 'last' };
    case 'Escape':
      return { type: 'close', reason: 'escape' };
  }
  return null;
}
