// ─────────────────────────────────────────────────────────────
//  gantry · selection/gantt-selection.service.ts
//
//  Signal-based selection manager.
//
//  Interaction model:
//    Click            → select single row (clear others)
//    Ctrl/Cmd + Click → toggle individual row
//    Shift + Click    → range select from lastSelected to clicked
//    Escape           → clear all
//    Ctrl/Cmd + A     → select all visible
//
//  All state is in signals — no Subjects, no BehaviorSubject.
//  The component subscribes via computed() and re-renders only
//  when the selection actually changes.
// ─────────────────────────────────────────────────────────────

import { Injectable, signal, computed } from '@angular/core';

import { GanttFlatRow, SelectionChangeEvent } from '../types';

@Injectable()
export class GanttSelectionService {
  // ── State ────────────────────────────────────────────────
  private readonly _selectedIds = signal<Set<string>>(new Set());
  private readonly _lastSelected = signal<string | null>(null);

  // ── Public signals ────────────────────────────────────────
  readonly selectedIds = this._selectedIds.asReadonly();
  readonly selectedCount = computed(() => this._selectedIds().size);
  readonly hasSelection = computed(() => this._selectedIds().size > 0);

  /** Callback wired by GantryComponent to emit output event */
  onChange?: (e: SelectionChangeEvent) => void;

  // ── Derived ───────────────────────────────────────────────

  isSelected(id: string): boolean {
    return this._selectedIds().has(id);
  }

  /** Returns a computed that tracks whether a specific id is selected.
   *  Use this in templates for fine-grained reactivity. */
  isSelectedSignal(id: string) {
    return computed(() => this._selectedIds().has(id));
  }

  // ── Interaction handlers ──────────────────────────────────

  /**
   * Main entry — called by the canvas or task-list on row click.
   * Dispatches to the correct sub-handler based on modifier keys.
   */
  handleClick(id: string, event: MouseEvent | KeyboardEvent, allVisibleRows: GanttFlatRow[]): void {
    const ctrl = event.ctrlKey || event.metaKey;
    const shift = event.shiftKey;

    if (shift && this._lastSelected()) {
      this._rangeSelect(id, allVisibleRows);
    } else if (ctrl) {
      this._toggle(id);
    } else {
      this._selectSingle(id);
    }
  }

  /**
   * Programmatic single select (replaces current selection).
   */
  select(id: string): void {
    this._selectSingle(id);
  }

  /**
   * Programmatic multi-select (replaces current selection with given ids).
   */
  setSelected(ids: string[]): void {
    this._selectedIds.set(new Set(ids));
    this._lastSelected.set(ids.at(-1) ?? null);
    this._emit(ids);
  }

  toggle(id: string): void {
    this._toggle(id);
  }

  clear(): void {
    if (!this._selectedIds().size) return;
    this._selectedIds.set(new Set());
    this._lastSelected.set(null);
    this._emit([]);
  }

  selectAll(rows: GanttFlatRow[]): void {
    const ids = rows.map(r => r.task.id);
    this._selectedIds.set(new Set(ids));
    this._lastSelected.set(ids.at(-1) ?? null);
    this._emit(ids);
  }

  getSelectedIds(): string[] {
    return [...this._selectedIds()];
  }

  getSelectedRows(rows: GanttFlatRow[]): GanttFlatRow[] {
    const ids = this._selectedIds();
    return rows.filter(r => ids.has(r.task.id));
  }

  // ── Private helpers ───────────────────────────────────────

  private _selectSingle(id: string): void {
    this._selectedIds.set(new Set([id]));
    this._lastSelected.set(id);
    this._emit([id]);
  }

  private _toggle(id: string): void {
    this._selectedIds.update(ids => {
      const next = new Set(ids);
      if (next.has(id)) {
        next.delete(id);
        // If we removed the last-selected, clear the anchor
        if (this._lastSelected() === id) this._lastSelected.set(null);
      } else {
        next.add(id);
        this._lastSelected.set(id);
      }
      return next;
    });
    this._emit([...this._selectedIds()]);
  }

  private _rangeSelect(toId: string, allRows: GanttFlatRow[]): void {
    const fromId = this._lastSelected();
    if (!fromId) {
      this._selectSingle(toId);
      return;
    }

    const fromIdx = allRows.findIndex(r => r.task.id === fromId);
    const toIdx = allRows.findIndex(r => r.task.id === toId);

    if (fromIdx < 0 || toIdx < 0) {
      this._selectSingle(toId);
      return;
    }

    const [lo, hi] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];

    const rangeIds = allRows.slice(lo, hi + 1).map(r => r.task.id);

    this._selectedIds.update(ids => {
      const next = new Set(ids);
      for (const id of rangeIds) next.add(id);
      return next;
    });

    this._lastSelected.set(toId);
    this._emit([...this._selectedIds()]);
  }

  private _emit(ids: string[]): void {
    this.onChange?.({ selectedIds: ids });
  }
}
