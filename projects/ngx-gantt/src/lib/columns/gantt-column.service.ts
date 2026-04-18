// ─────────────────────────────────────────────────────────────
//  ngx-gantt · columns/gantt-column.service.ts
//
//  Reactive column management.
//
//  Consumers interact via:
//    - columnConfig input on NgxGanttComponent (replaces defaults)
//    - service methods at runtime (addColumn, removeColumn, etc.)
//
//  The service owns a signal<ColumnDef[]> — every change
//  triggers only the task-list header and rows to re-render
//  (not the SVG canvas).
// ─────────────────────────────────────────────────────────────

import { Injectable, signal, computed } from '@angular/core';
import { ColumnDef } from '../types';
import { DEFAULT_COLUMNS } from '../gantt-data';

@Injectable()
export class GanttColumnService {
  // ── State ────────────────────────────────────────────────
  private readonly _columns = signal<ColumnDef[]>(
    DEFAULT_COLUMNS.map(c => ({ ...c, visible: true }))
  );

  // ── Public signals ────────────────────────────────────────
  /** All column defs (including hidden) */
  readonly columns = this._columns.asReadonly();

  /** Only visible columns — used by the task list template */
  readonly visibleColumns = computed(() =>
    this._columns().filter(c => c.visible !== false)
  );

  /** CSS grid-template-columns string */
  readonly gridTemplate = computed(() =>
    this.visibleColumns()
      .map(c => `${c.width}px`)
      .join(' ')
  );

  /** Total width of the visible task-list panel */
  readonly totalPanelWidth = computed(() =>
    this.visibleColumns().reduce((sum, c) => sum + c.width, 0)
  );

  // ── Init from consumer config ─────────────────────────────
  /**
   * Replace columns with consumer-provided config.
   * Merges with defaults so consumers only need to specify overrides.
   */
  setColumns(defs: ColumnDef[]): void {
    // Merge consumer defs onto defaults
    const merged = defs.map(def => {
      const base = DEFAULT_COLUMNS.find(d => d.key === def.key) ?? {};
      return { ...base, ...def, visible: def.visible ?? true };
    });
    this._columns.set(merged);
  }

  /** Reset to library defaults */
  resetColumns(): void {
    this._columns.set(DEFAULT_COLUMNS.map(c => ({ ...c, visible: true })));
  }

  // ── Runtime mutation ──────────────────────────────────────
  addColumn(def: ColumnDef): void {
    this._columns.update(cols => {
      if (cols.find(c => c.key === def.key)) return cols; // dedupe
      return [...cols, { visible: true, ...def }];
    });
  }

  removeColumn(key: string): void {
    this._columns.update(cols => cols.filter(c => c.key !== key));
  }

  setVisible(key: string, visible: boolean): void {
    this._columns.update(cols =>
      cols.map(c => c.key === key ? { ...c, visible } : c)
    );
  }

  toggleVisible(key: string): void {
    this._columns.update(cols =>
      cols.map(c => c.key === key ? { ...c, visible: !c.visible } : c)
    );
  }

  /**
   * Update a column's width (called after column drag-resize).
   * Clamps to [minWidth, maxWidth].
   */
  setColumnWidth(key: string, width: number): void {
    this._columns.update(cols =>
      cols.map(c => {
        if (c.key !== key) return c;
        const clamped = Math.max(
          c.minWidth ?? 40,
          Math.min(c.maxWidth ?? 600, width),
        );
        return { ...c, width: clamped };
      })
    );
  }

  /**
   * Reorder columns by providing an ordered array of keys.
   * Keys not present in the array are appended at the end.
   */
  reorderByKeys(keys: string[]): void {
    this._columns.update(cols => {
      const keySet = new Set(keys);
      const ordered = keys
        .map(k => cols.find(c => c.key === k))
        .filter(Boolean) as ColumnDef[];
      const rest = cols.filter(c => !keySet.has(c.key));
      return [...ordered, ...rest];
    });
  }

  /** Move column left or right by one position */
  moveColumn(key: string, direction: 'left' | 'right'): void {
    this._columns.update(cols => {
      const idx = cols.findIndex(c => c.key === key);
      if (idx < 0) return cols;
      const target = direction === 'left' ? idx - 1 : idx + 1;
      if (target < 0 || target >= cols.length) return cols;
      const next = [...cols];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }
}
