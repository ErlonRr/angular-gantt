// ─────────────────────────────────────────────────────────────
//  gantry · interaction/roving.ts
//  Roving tabindex: the next index for a key command and the tab
//  stop of a list. One item of a set (the toolbar controls, the
//  task-list rows, the mounted bars) has tabindex 0, the others
//  -1; arrow keys move focus inside the set.
//
//    Left / Up            previous item
//    Right / Down         next item
//    Home / End           first / last item
//    (`wrap`)             previous of the first is the last, next of the last the first
// ─────────────────────────────────────────────────────────────

import { resolveKey, type KeyLike, type MoveCommand } from './keymap';

export interface RovingOptions {
  /** Previous / next wrap around the ends (the toolbar). Default `false`. */
  wrap?: boolean | undefined;
}

/**
 * Next focused index of a roving set of `count` items for a move command: left / up = previous,
 * right / down = next, Home / End = first / last; PageUp / PageDown keep the current item.
 * A `current` outside the set (nothing focused) goes to the first item for next / Home and to
 * the last one for previous / End. Returns -1 for an empty set.
 */
export function rovingIndex(current: number, cmd: MoveCommand, count: number, options: RovingOptions = {}): number {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return -1;
  const last = n - 1;
  const wrap = !!options.wrap;
  const inSet = Number.isInteger(current) && current >= 0 && current <= last;
  switch (cmd) {
    case 'move.home':
      return 0;
    case 'move.end':
      return last;
    case 'move.left':
    case 'move.up':
      if (!inSet) return last;
      return current > 0 ? current - 1 : wrap ? last : 0;
    case 'move.right':
    case 'move.down':
      if (!inSet) return 0;
      return current < last ? current + 1 : wrap ? 0 : last;
    case 'move.pageUp':
    case 'move.pageDown':
      return inSet ? current : 0;
  }
}

/**
 * `resolveKey(event, 'toolbar')` + `rovingIndex` in one step, for a horizontal set (the toolbar):
 * ArrowLeft / ArrowRight (mirrored with `rtl`), Home and End. Returns `null` when the key does not
 * move focus (Enter, Space, shortcuts, modified keys: leave them to the control).
 */
export function rovingIndexForKey(
  current: number,
  event: KeyLike,
  count: number,
  options: RovingOptions & { rtl?: boolean | undefined } = {},
): number | null {
  const command = resolveKey(event, 'toolbar', { rtl: options.rtl, characterShortcuts: false });
  if (!command?.startsWith('move.')) return null;
  return rovingIndex(current, command as MoveCommand, count, options);
}

/**
 * Index of the item that holds a roving set's one tab stop: the first id of `preferred` found in
 * `ids` (e.g. the focused item, then the last focused one; `null` entries are skipped), else
 * `fallbackIndex` clamped into the set. Returns -1 for an empty set.
 *
 * Replaces the bindings' `tabStopRow`: `ids` are the mounted rows (or bars) in order, `preferred`
 * is `[focusedId, lastFocusedId]` and `fallbackIndex` is the first mounted, not pinned row at or
 * below the first row in view (`mounted.findIndex(m => m.pinnedTop === null && m.row.visibleIndex
 * >= firstInView)`; -1 falls back to the first item).
 */
export function tabStopIndex(
  ids: readonly string[],
  preferred: readonly (string | null | undefined)[],
  fallbackIndex: number,
): number {
  if (ids.length === 0) return -1;
  for (const id of preferred) {
    if (id === null || id === undefined) continue;
    const i = ids.indexOf(id);
    if (i >= 0) return i;
  }
  const fallback = Number.isFinite(fallbackIndex) ? Math.floor(fallbackIndex) : 0;
  return Math.min(Math.max(fallback, 0), ids.length - 1);
}

// ─── The task list's tab stop ─────────────────────────────────

/**
 * A focusable spot of the task list (the treegrid): a row, one of its cells (by column key) or a
 * header cell. What held focus last inside the list, and where its one tab stop is.
 */
export type GridFocusSpot =
  | { readonly kind: 'row'; readonly id: string }
  | { readonly kind: 'cell'; readonly id: string; readonly key: string }
  | { readonly kind: 'head'; readonly key: string };

/** Whether two spots are the same (a signal's equality cut-off). */
export function sameGridSpot(a: GridFocusSpot | null, b: GridFocusSpot | null): boolean {
  if (a === b) return true;
  if (a === null || b === null || a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'head':
      return a.key === (b as typeof a).key;
    case 'row':
      return a.id === (b as typeof a).id;
    case 'cell':
      return a.id === (b as typeof a).id && a.key === (b as typeof a).key;
  }
}

/**
 * The task list's one tab stop (row-first treegrid, D6), given where focus was last inside the
 * list (`last`), the tab-stop row (`rowId`: core `tabStopIndex` over the mounted rows, `null`
 * while no row is mounted) and the shown columns' keys in order:
 *
 * - the header cell focused last, while its column is shown;
 * - else the cell focused last, while its row is the tab-stop row and its column is shown;
 * - else the tab-stop row;
 * - else (no row: loading, empty, a failed first page) the first header cell, so the scrollable
 *   task list always keeps a keyboard stop (axe `scrollable-region-focusable`).
 *
 * `null` only without rows and columns.
 */
export function gridTabStop(
  last: GridFocusSpot | null,
  rowId: string | null,
  columnKeys: readonly string[],
): GridFocusSpot | null {
  if (last?.kind === 'head' && columnKeys.includes(last.key)) return last;
  if (rowId !== null) {
    if (last?.kind === 'cell' && last.id === rowId && columnKeys.includes(last.key)) return last;
    return last?.kind === 'row' && last.id === rowId ? last : { kind: 'row', id: rowId };
  }
  const first = columnKeys[0];
  return first === undefined ? null : { kind: 'head', key: first };
}
