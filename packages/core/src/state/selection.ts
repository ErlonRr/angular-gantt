// ─────────────────────────────────────────────────────────────
//  gantry · state/selection.ts
//  Framework-free row selection reducer shared by every binding.
//
//  Interaction model:
//    Click            → select the row alone (anchor = row)
//    Ctrl/Cmd + Click → toggle the row (adding it moves the anchor;
//                       removing the anchor clears it)
//    Shift + Click    → add the rows between the anchor and the clicked
//                       row (in visible order) to the selection; the
//                       anchor moves to the clicked row
//    multi = false    → modifiers are ignored (always a single select)
//    enabled = false  → clicks change nothing
//
//  Every function is pure: it returns a new state and never mutates
//  its input, so bindings can store the result in a signal / state cell.
//  Bindings decide whether to fire `selectionChange` with
//  `shouldEmitSelection()`, so every binding emits on the same actions.
// ─────────────────────────────────────────────────────────────

export interface SelectionState {
  /** Selected task ids, in the order they were selected */
  readonly selected: ReadonlySet<string>;
  /** Range anchor: the last row selected by a click, `null` when there is none */
  readonly anchor: string | null;
}

/** Modifier keys of a selection click (`ctrl` covers Cmd on macOS). */
export interface SelectionModifiers {
  ctrl: boolean;
  shift: boolean;
}

/** Resolved `selection` config: `enableSelection` / `multiSelect`. */
export interface SelectionPolicy {
  enabled: boolean;
  multi: boolean;
}

/** Structural subset of a DOM `MouseEvent` / `KeyboardEvent` (core stays DOM-free). */
export interface SelectionModifierSource {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/** Modifiers of a pointer or keyboard event: Ctrl or Cmd toggles, Shift extends. */
export function selectionModifiers(event: SelectionModifierSource): SelectionModifiers {
  return { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey };
}

/** What produced a selection state, for `shouldEmitSelection()`. */
export type SelectionAction = 'click' | 'set' | 'selectAll' | 'clear';

/** Empty selection without an anchor (initial state, Escape, `clearSelection()`). */
export function emptySelection(): SelectionState {
  return { selected: new Set(), anchor: null };
}

/** Replace the selection (programmatic API, `setSelectedTasks()`); the anchor becomes the last id. */
export function selectionOf(ids: readonly string[]): SelectionState {
  return { selected: new Set(ids), anchor: ids.at(-1) ?? null };
}

/**
 * Select every row of `orderedIds` (Ctrl/Cmd + A, `selectAll()`); the anchor becomes the last one.
 * Returns `null` when the policy forbids it (selection disabled or single-select): leave the state as is.
 */
export function selectAllRows(orderedIds: readonly string[], policy: SelectionPolicy): SelectionState | null {
  if (!policy.enabled || !policy.multi) return null;
  return selectionOf(orderedIds);
}

/**
 * Apply a row click to the selection.
 *
 * @param orderedIds Ids of the visible rows in display order — the range of a Shift + click.
 * @returns The next state; `state` itself when selection is disabled.
 */
export function selectionClick(
  state: SelectionState,
  id: string,
  modifiers: SelectionModifiers,
  orderedIds: readonly string[],
  policy: SelectionPolicy,
): SelectionState {
  if (!policy.enabled) return state;
  const ctrl = policy.multi && modifiers.ctrl;
  const shift = policy.multi && modifiers.shift;
  // Truthiness (not `!== null`) on purpose: the services this replaces treat an empty-string anchor as none
  if (shift && state.anchor) return rangeSelect(state, state.anchor, id, orderedIds);
  if (ctrl) return toggle(state, id);
  return selectSingle(id);
}

/**
 * Whether a binding fires `selectionChange` for `prev` → `next`: on every action that produced a new
 * state — even a repeated click or a range that adds nothing — except a `'clear'` of an empty selection.
 * A disabled click returns `prev` itself, so it never emits.
 */
export function shouldEmitSelection(prev: SelectionState, next: SelectionState, action: SelectionAction): boolean {
  if (next === prev) return false;
  return action !== 'clear' || prev.selected.size > 0;
}

/** Whether two selections hold different ids (order and anchor are ignored); not the emit rule — see `shouldEmitSelection`. */
export function selectionChanged(a: SelectionState, b: SelectionState): boolean {
  if (a.selected === b.selected) return false;
  if (a.selected.size !== b.selected.size) return true;
  for (const id of a.selected) if (!b.selected.has(id)) return true;
  return false;
}

function selectSingle(id: string): SelectionState {
  return { selected: new Set([id]), anchor: id };
}

function toggle(state: SelectionState, id: string): SelectionState {
  const selected = new Set(state.selected);
  if (selected.has(id)) {
    selected.delete(id);
    return { selected, anchor: state.anchor === id ? null : state.anchor };
  }
  selected.add(id);
  return { selected, anchor: id };
}

function rangeSelect(
  state: SelectionState,
  fromId: string,
  toId: string,
  orderedIds: readonly string[],
): SelectionState {
  const fromIdx = orderedIds.indexOf(fromId);
  const toIdx = orderedIds.indexOf(toId);
  if (fromIdx < 0 || toIdx < 0) return selectSingle(toId);
  const lo = Math.min(fromIdx, toIdx);
  const hi = Math.max(fromIdx, toIdx);
  const selected = new Set(state.selected);
  for (const rowId of orderedIds.slice(lo, hi + 1)) selected.add(rowId);
  return { selected, anchor: toId };
}
