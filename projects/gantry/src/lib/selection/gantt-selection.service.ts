// ─────────────────────────────────────────────────────────────
//  gantry · selection/gantt-selection.service.ts
//
//  Signal-based selection manager around the @gantry/core
//  selection reducer (shared with the Web Component).
//
//  Interaction model (see core `state/selection.ts`):
//    Click            → select single row (clear others)
//    Ctrl/Cmd + Click → toggle individual row
//    Shift + Click    → range select from the anchor to the clicked row
//    Escape           → clear all
//    Ctrl/Cmd + A     → select all visible
//
//  `selectionChange` fires per core `shouldEmitSelection()`, so both
//  bindings emit on exactly the same actions.
// ─────────────────────────────────────────────────────────────

import { Injectable, signal, computed } from '@angular/core';

import {
  emptySelection,
  selectionOf,
  selectAllRows,
  selectionClick,
  selectionModifiers,
  shouldEmitSelection,
  type SelectionAction,
  type SelectionModifierSource,
  type SelectionPolicy,
  type SelectionState,
} from '@gantry/core';
import { type GanttFlatRow, type SelectionChangeEvent } from '../types';

/** Policy of the programmatic API when the caller passes none: selection on, multi-select on */
const OPEN_POLICY: SelectionPolicy = { enabled: true, multi: true };

@Injectable()
export class GanttSelectionService {
  // ── State ────────────────────────────────────────────────
  private readonly _state = signal<SelectionState>(emptySelection());

  // ── Public signals ────────────────────────────────────────
  /** Selection and range anchor (core `SelectionState`) */
  readonly state = this._state.asReadonly();
  readonly selectedIds = computed<ReadonlySet<string>>(() => this._state().selected);
  readonly selectedCount = computed(() => this._state().selected.size);
  readonly hasSelection = computed(() => this._state().selected.size > 0);

  /** Callback wired by GantryComponent to emit output event */
  onChange?: (e: SelectionChangeEvent) => void;

  // ── Derived ───────────────────────────────────────────────

  isSelected(id: string): boolean {
    return this._state().selected.has(id);
  }

  /** Returns a computed that tracks whether a specific id is selected.
   *  Use this in templates for fine-grained reactivity. */
  isSelectedSignal(id: string) {
    return computed(() => this._state().selected.has(id));
  }

  // ── Interaction handlers ──────────────────────────────────

  /**
   * Main entry — called by the canvas or task-list on row click.
   * `policy` is the resolved `selection` config (disabled → no change, single → modifiers ignored).
   */
  handleClick(
    id: string,
    event: SelectionModifierSource,
    allVisibleRows: readonly GanttFlatRow[],
    policy: SelectionPolicy = OPEN_POLICY,
  ): void {
    const ids = allVisibleRows.map(r => r.task.id);
    this.apply(selectionClick(this._state(), id, selectionModifiers(event), ids, policy), 'click');
  }

  /**
   * Programmatic single select (replaces current selection).
   */
  select(id: string): void {
    this.apply(selectionOf([id]), 'set');
  }

  /**
   * Programmatic multi-select (replaces current selection with given ids).
   */
  setSelected(ids: readonly string[]): void {
    this.apply(selectionOf(ids), 'set');
  }

  toggle(id: string): void {
    this.apply(selectionClick(this._state(), id, { ctrl: true, shift: false }, [], OPEN_POLICY), 'click');
  }

  clear(): void {
    this.apply(emptySelection(), 'clear');
  }

  /** Select every row; ignored when `policy` forbids it (selection off or single-select). */
  selectAll(rows: readonly GanttFlatRow[], policy: SelectionPolicy = OPEN_POLICY): void {
    const next = selectAllRows(
      rows.map(r => r.task.id),
      policy,
    );
    if (next) this.apply(next, 'selectAll');
  }

  getSelectedIds(): string[] {
    return [...this._state().selected];
  }

  getSelectedRows(rows: GanttFlatRow[]): GanttFlatRow[] {
    const ids = this._state().selected;
    return rows.filter(r => ids.has(r.task.id));
  }

  /** Store a reducer result and emit per `shouldEmitSelection` (the same rule as the Web Component). */
  apply(next: SelectionState, action: SelectionAction): void {
    const prev = this._state();
    if (next === prev) return;
    this._state.set(next);
    if (shouldEmitSelection(prev, next, action)) this.onChange?.({ selectedIds: [...next.selected] });
  }
}
