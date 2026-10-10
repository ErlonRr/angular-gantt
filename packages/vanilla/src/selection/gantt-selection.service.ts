/**
 * @file gantt-selection.service.ts
 * Vanilla JS selection state. The click / range / select-all rules and the
 * emit rule come from the core reducer (`@gantry/core` state/selection), so
 * the Web Component selects and fires `selection-change` exactly like Angular.
 */

import {
  type SelectionAction,
  type SelectionChangeEvent,
  type SelectionModifierSource,
  type SelectionPolicy,
  type SelectionState,
  emptySelection,
  selectAllRows,
  selectionClick,
  selectionModifiers,
  selectionOf,
  shouldEmitSelection,
} from '@gantry/core';
import { createState } from '../core/state';

export class GanttSelectionService {
  /** Current selection (selected ids + range anchor) */
  readonly state = createState<SelectionState>(emptySelection());

  /** Fired per `shouldEmitSelection` (every action that changes the state, except clearing an empty selection) */
  onChange?: ((e: SelectionChangeEvent) => void) | undefined;

  get selectedIds(): ReadonlySet<string> {
    return this.state().selected;
  }

  get selectedCount(): number {
    return this.state().selected.size;
  }

  isSelected(id: string): boolean {
    return this.state().selected.has(id);
  }

  /** Row click: plain / Ctrl·Cmd toggle / Shift range over `orderedIds` (the visible rows in display order). */
  handleClick(
    id: string,
    event: SelectionModifierSource,
    orderedIds: readonly string[],
    policy: SelectionPolicy,
  ): void {
    this.apply(selectionClick(this.state(), id, selectionModifiers(event), orderedIds, policy), 'click');
  }

  /** Replace the selection (programmatic API). */
  setSelected(ids: readonly string[]): void {
    this.apply(selectionOf(ids), 'set');
  }

  clear(): void {
    this.apply(emptySelection(), 'clear');
  }

  /** Select every row of `orderedIds`; does nothing when the policy forbids it (disabled / single-select). */
  selectAll(orderedIds: readonly string[], policy: SelectionPolicy): void {
    const next = selectAllRows(orderedIds, policy);
    if (next) this.apply(next, 'selectAll');
  }

  private apply(next: SelectionState, action: SelectionAction): void {
    const prev = this.state();
    if (next === prev) return;
    this.state.set(next);
    if (shouldEmitSelection(prev, next, action)) this.onChange?.({ selectedIds: [...next.selected] });
  }
}
