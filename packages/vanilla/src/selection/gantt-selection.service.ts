/**
 * @file gantt-selection.service.ts
 * Vanilla JS selection manager supporting single, ctrl toggle, and shift range selection.
 */

import { GanttFlatRow, SelectionChangeEvent } from '@gantry/core';
import { createState } from '../core/state';

export class GanttSelectionService {
  private readonly _selectedIds = createState<Set<string>>(new Set());
  private readonly _lastSelected = createState<string | null>(null);

  onChange?: (e: SelectionChangeEvent) => void;

  get selectedIds(): Set<string> {
    return this._selectedIds();
  }

  get selectedCount(): number {
    return this._selectedIds().size;
  }

  isSelected(id: string): boolean {
    return this._selectedIds().has(id);
  }

  handleClick(id: string, event: MouseEvent | KeyboardEvent, allVisibleRows: GanttFlatRow[]): void {
    const ctrl = event.ctrlKey || event.metaKey;
    const shift = event.shiftKey;

    if (shift && this._lastSelected()) {
      this.rangeSelect(id, allVisibleRows);
    } else if (ctrl) {
      this.toggle(id);
    } else {
      this.selectSingle(id);
    }
  }

  selectSingle(id: string): void {
    this._selectedIds.set(new Set([id]));
    this._lastSelected.set(id);
    this.emit([...this._selectedIds()]);
  }

  toggle(id: string): void {
    this._selectedIds.update(ids => {
      const next = new Set(ids);
      if (next.has(id)) {
        next.delete(id);
        if (this._lastSelected() === id) this._lastSelected.set(null);
      } else {
        next.add(id);
        this._lastSelected.set(id);
      }
      return next;
    });
    this.emit([...this._selectedIds()]);
  }

  rangeSelect(toId: string, allRows: GanttFlatRow[]): void {
    const fromId = this._lastSelected();
    if (!fromId) { this.selectSingle(toId); return; }

    const fromIdx = allRows.findIndex(r => r.task.id === fromId);
    const toIdx = allRows.findIndex(r => r.task.id === toId);

    if (fromIdx < 0 || toIdx < 0) { this.selectSingle(toId); return; }

    const [lo, hi] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
    const rangeIds = allRows.slice(lo, hi + 1).map(r => r.task.id);

    this._selectedIds.update(ids => {
      const next = new Set(ids);
      for (const id of rangeIds) next.add(id);
      return next;
    });

    this._lastSelected.set(toId);
    this.emit([...this._selectedIds()]);
  }

  clear(): void {
    this._selectedIds.set(new Set());
    this._lastSelected.set(null);
    this.emit([]);
  }

  selectAll(rows: GanttFlatRow[]): void {
    const ids = rows.map(r => r.task.id);
    this._selectedIds.set(new Set(ids));
    this._lastSelected.set(ids.at(-1) ?? null);
    this.emit(ids);
  }

  private emit(ids: string[]): void {
    this.onChange?.({ selectedIds: ids });
  }
}
