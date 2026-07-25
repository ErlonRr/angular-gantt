// ─────────────────────────────────────────────────────────────
//  gantry · columns/gantt-column.service.ts
//
//  Reactive column management.
//
//  Consumers interact via:
//    - columnConfig input on GantryComponent (replaces defaults)
//    - service methods at runtime (addColumn, removeColumn, etc.)
//
//  The service owns a signal<ColumnDef[]> — every change
//  triggers only the task-list header and rows to re-render
//  (not the SVG canvas).
// ─────────────────────────────────────────────────────────────

import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { ColumnDef } from '../types';
import { buildDefaultColumns } from '../gantt-data';
import { GanttI18nService } from '../services/gantt-i18n.service';

@Injectable()
export class GanttColumnService {
  private readonly i18n = inject(GanttI18nService);

  /** Localised default columns for the current i18n config. */
  private defaults(): ColumnDef[] {
    return buildDefaultColumns(
      this.i18n.labels(), this.i18n.locale(), this.i18n.formats().dateFormat,
    ).map(c => ({ ...c, visible: true }));
  }

  /** True once the consumer supplies their own columns (stops auto-localising). */
  private _hasCustom = false;

  // ── State ────────────────────────────────────────────────
  private readonly _columns = signal<ColumnDef[]>(this.defaults());

  constructor() {
    // Re-seed default columns when the locale / labels / date format change,
    // unless the consumer has taken over via setColumns().
    effect(() => {
      const cols = this.defaults();
      if (!this._hasCustom) this._columns.set(cols);
    });
  }

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
    this._hasCustom = true;
    // Merge consumer defs onto the (localised) defaults
    const base = this.defaults();
    const merged = defs.map(def => {
      const b = base.find(d => d.key === def.key) ?? {};
      return { ...b, ...def, visible: def.visible ?? true };
    });
    this._columns.set(merged);
  }

  /** Reset to library defaults */
  resetColumns(): void {
    this._hasCustom = false;
    this._columns.set(this.defaults());
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
