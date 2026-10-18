// ─────────────────────────────────────────────────────────────
//  gantry · interaction/keymap.ts
//  Framework-free key → command table. Bindings read a keyboard
//  event, ask `resolveKey` what it means in the focused area and
//  run the command; no binding hard-codes key names.
//
//  Global (every area):
//    Escape                 → cancel (an operation is active) · clearSelection
//    Ctrl/Cmd+A (+Shift)    → selectAll
//    Ctrl/Cmd+Z             → undo
//    Ctrl/Cmd+Shift+Z, +Y   → redo
//    + / =                  → zoomIn        ┐
//    -                      → zoomOut       │ single-character shortcuts:
//    T                      → today         │ off with `characterShortcuts: false`
//    F                      → fit           │ (WCAG 2.1.4)
//    L                      → link (grid / timeline only)
//  Grid / timeline:
//    Arrows, PageUp/PageDown, Home/End (also with Ctrl/Cmd) → move.*
//    Space → toggle.select · Shift+Space → toggle.extend · Ctrl/Cmd+Space → toggle.select
//    Enter → activate · F2 → edit · Delete / Backspace → delete
//  Toolbar (roving focus between buttons):
//    ArrowLeft/Right → move.left/right · Home/End → move.home/end
//
//  Alt (and AltGr, which browsers report as Ctrl+Alt) disables every
//  shortcut except Escape, so OS menus and typed characters win.
//
//  Bindings dispatch zoomIn / zoomOut / today / fit (`fitToScreen()`),
//  selectAll and clearSelection / cancel from any area. undo / redo,
//  link and delete resolve but have no action until Phase 11: leave
//  the key's default action alone for them.
//
//  Left/right are logical: `move.left` is towards the inline start
//  ("previous"), so in RTL ArrowLeft resolves to `move.right`.
// ─────────────────────────────────────────────────────────────

/** Everything a key can mean to the chart. */
export type Command =
  | 'clearSelection'
  | 'selectAll'
  | 'zoomIn'
  | 'zoomOut'
  | 'today'
  | 'fit'
  | 'undo'
  | 'redo'
  | 'move.up'
  | 'move.down'
  | 'move.pageUp'
  | 'move.pageDown'
  | 'move.home'
  | 'move.end'
  | 'move.left'
  | 'move.right'
  | 'toggle.select'
  | 'toggle.extend'
  | 'activate'
  | 'edit'
  | 'link'
  | 'delete'
  | 'cancel';

/** The navigation subset of `Command`. */
export type MoveCommand = Extract<Command, `move.${string}`>;

/** Where the focus is: the toolbar, the task grid, the timeline, or anywhere (global shortcuts only). */
export type KeyArea = 'toolbar' | 'grid' | 'timeline' | 'any';

/** The parts of a `KeyboardEvent` the keymap reads (any object with these fields works). */
export interface KeyLike {
  key: string;
  ctrlKey?: boolean | undefined;
  metaKey?: boolean | undefined;
  shiftKey?: boolean | undefined;
  altKey?: boolean | undefined;
}

export interface ResolveKeyOptions {
  /** Right-to-left layout: ArrowLeft/ArrowRight swap meaning. Default `false`. */
  rtl?: boolean | undefined;
  /**
   * Single-character shortcuts (`+` `=` `-` `t` `f` `l`). Turn off when they clash with
   * assistive technology or typing (WCAG 2.1.4 Character Key Shortcuts). Default `true`.
   * Bindings pass `resolveConfig().keyboard.characterShortcuts` (the resolved `keyboard` object
   * itself is a valid `ResolveKeyOptions`).
   */
  characterShortcuts?: boolean | undefined;
  /**
   * A drag, keyboard edit or link is in progress: Escape resolves to `cancel` instead of
   * `clearSelection`. Default `false`.
   */
  active?: boolean | undefined;
}

/** True for the keys a command may be bound to with Ctrl (Windows/Linux) or Cmd (macOS). */
const primary = (e: KeyLike): boolean => !!(e.ctrlKey || e.metaKey);

/**
 * Logical direction of a horizontal arrow key: `'left'` = towards the inline start.
 * Returns `null` for any other key.
 */
export function logicalArrow(key: string, rtl = false): 'left' | 'right' | null {
  if (key === 'ArrowLeft') return rtl ? 'right' : 'left';
  if (key === 'ArrowRight') return rtl ? 'left' : 'right';
  return null;
}

/** What a key means in `area`, or `null` when the chart does not use it (leave the default action alone). */
export function resolveKey(event: KeyLike, area: KeyArea, options: ResolveKeyOptions = {}): Command | null {
  const { rtl = false, characterShortcuts = true, active = false } = options;
  const mod = primary(event);
  const shift = !!event.shiftKey;
  const alt = !!event.altKey;
  const key = event.key;
  const lower = key.length === 1 ? key.toLowerCase() : key;

  // ── Global ──
  if (key === 'Escape') return active ? 'cancel' : 'clearSelection';
  if (mod && !alt) {
    if (lower === 'a') return 'selectAll';
    if (lower === 'z') return shift ? 'redo' : 'undo';
    if (lower === 'y' && !shift) return 'redo';
  }

  if (characterShortcuts && !mod && !alt && key.length === 1) {
    switch (lower) {
      case '+':
      case '=':
        return 'zoomIn';
      case '-':
        return 'zoomOut';
      case 't':
        return 'today';
      case 'f':
        return 'fit';
      case 'l':
        if (area === 'grid' || area === 'timeline') return 'link';
        break;
    }
  }

  if (area === 'any') return null;

  // ── Toolbar: roving focus, buttons keep Enter/Space ──
  if (area === 'toolbar') {
    if (mod || alt || shift) return null;
    const dir = logicalArrow(key, rtl);
    if (dir) return dir === 'left' ? 'move.left' : 'move.right';
    if (key === 'Home') return 'move.home';
    if (key === 'End') return 'move.end';
    return null;
  }

  // ── Grid / timeline ──
  if (alt) return null;
  switch (key) {
    case 'Home':
      return shift ? null : 'move.home';
    case 'End':
      return shift ? null : 'move.end';
    case ' ':
    case 'Spacebar':
      if (shift && !mod) return 'toggle.extend';
      return shift ? null : 'toggle.select';
  }
  if (mod || shift) return null;
  const dir = logicalArrow(key, rtl);
  if (dir) return dir === 'left' ? 'move.left' : 'move.right';
  switch (key) {
    case 'ArrowUp':
      return 'move.up';
    case 'ArrowDown':
      return 'move.down';
    case 'PageUp':
      return 'move.pageUp';
    case 'PageDown':
      return 'move.pageDown';
    case 'Enter':
      return 'activate';
    case 'F2':
      return 'edit';
    case 'Delete':
    case 'Backspace':
      return 'delete';
  }
  return null;
}

/** `move.home` / `move.end` with Ctrl/Cmd jump to the first / last row instead of the row's first / last cell. */
export function isGridEdgeJump(event: KeyLike): boolean {
  return primary(event) && (event.key === 'Home' || event.key === 'End');
}
