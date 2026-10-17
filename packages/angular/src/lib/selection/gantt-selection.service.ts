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
//  bindings emit on exactly the same actions. A change of the number of
//  selected tasks is read out by the chart's live region (`GanttAnnouncer`).
// ─────────────────────────────────────────────────────────────

import { Injectable, signal, computed, inject } from '@angular/core';

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
import { GanttAnnouncer } from '../a11y/announcer';

/** Policy of the programmatic API when the caller passes none: selection on, multi-select on */
const OPEN_POLICY: SelectionPolicy = { enabled: true, multi: true };

@Injectable()
export class GanttSelectionService {
  /** The chart's live region (absent outside a chart) */
  private readonly announcer = inject(GanttAnnouncer, { optional: true });

  // ── State ────────────────────────────────────────────────
  private readonly _state = signal<SelectionState>(emptySelection());

  // ── Public signals ────────────────────────────────────────
  /** Selection and range anchor (core `SelectionState`) */
  readonly state = this._state.asReadonly();
  readonly selectedIds = computed<ReadonlySet<string>>(() => this._state().selected);

  /** Callback wired by GantryComponent to emit output event */
  onChange?: (e: SelectionChangeEvent) => void;

  // ── Derived ───────────────────────────────────────────────

  isSelected(id: string): boolean {
    return this._state().selected.has(id);
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
   * Programmatic multi-select (replaces current selection with given ids).
   */
  setSelected(ids: readonly string[]): void {
    this.apply(selectionOf(ids), 'set');
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

  /**
   * Store a reducer result and emit per `shouldEmitSelection` (the same rule as the Web Component);
   * a new number of selected tasks is announced ("3 tasks selected", "Selection cleared").
   */
  apply(next: SelectionState, action: SelectionAction): void {
    const prev = this._state();
    if (next === prev) return;
    this._state.set(next);
    if (next.selected.size !== prev.selected.size) this.announcer?.selection(next.selected.size);
    if (shouldEmitSelection(prev, next, action)) this.onChange?.({ selectedIds: [...next.selected] });
  }
}
