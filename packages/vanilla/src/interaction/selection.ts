/**
 * @file selection.ts
 * Selection on the engine's `selection` signal. The click / range / select-all rules and the emit
 * rule come from the core reducer (`@gantry/core` state/selection), so the Web Component selects
 * and fires `selection-change` exactly like Angular.
 */

import {
  emptySelection,
  selectAllRows,
  selectionClick,
  selectionModifiers,
  selectionOf,
  shouldEmitSelection,
  type SelectionAction,
  type SelectionChangeEvent,
  type SelectionModifierSource,
  type SelectionPolicy,
  type SelectionState,
} from '@gantry/core';
import type { WritableSignal } from '../reactive';

export interface Selection {
  /** Row click: plain / Ctrl·Cmd toggle / Shift range over `orderedIds` (the visible rows in display order). */
  handleClick(id: string, event: SelectionModifierSource, orderedIds: readonly string[], policy: SelectionPolicy): void;
  /** Replace the selection (programmatic API). */
  setSelected(ids: readonly string[]): void;
  clear(): void;
  /** Select every row of `orderedIds`; does nothing when the policy forbids it (disabled / single-select). */
  selectAll(orderedIds: readonly string[], policy: SelectionPolicy): void;
}

/**
 * `onChange` fires per `shouldEmitSelection`: every action that changes the state, except
 * clearing an empty selection.
 */
export function createSelection(
  state: WritableSignal<SelectionState>,
  onChange: (e: SelectionChangeEvent) => void,
): Selection {
  const apply = (next: SelectionState, action: SelectionAction): void => {
    const prev = state.peek();
    if (next === prev) return;
    state.set(next);
    if (shouldEmitSelection(prev, next, action)) onChange({ selectedIds: [...next.selected] });
  };
  return {
    handleClick(id, event, orderedIds, policy) {
      apply(selectionClick(state.peek(), id, selectionModifiers(event), orderedIds, policy), 'click');
    },
    setSelected(ids) {
      apply(selectionOf(ids), 'set');
    },
    clear() {
      apply(emptySelection(), 'clear');
    },
    selectAll(orderedIds, policy) {
      const next = selectAllRows(orderedIds, policy);
      if (next) apply(next, 'selectAll');
    },
  };
}
