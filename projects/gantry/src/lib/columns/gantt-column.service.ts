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

import { Injectable, signal, computed, effect, inject, untracked } from '@angular/core';
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

  /** Consumer-provided definitions (null = default columns). */
  private _custom: ColumnDef[] | null = null;

  /**
   * Widths the user dragged (or restored from saved state) and visibility
   * toggles — kept as overrides so they survive re-assigning `columns`
   * or a locale change.
   */
  private readonly _widthOverrides = new Map<string, number>();
  private readonly _visibilityOverrides = new Map<string, boolean>();

  // ── State ────────────────────────────────────────────────
  private readonly _columns = signal<ColumnDef[]>(this.defaults());

  constructor() {
    // Re-resolve labels / date formats when the locale or labels change
    effect(() => {
      const base = this.defaults();
      untracked(() => this._publish(this._custom ? this._merge(this._custom, base) : base));
    });
  }

  private _merge(defs: ColumnDef[], base: ColumnDef[]): ColumnDef[] {
    return defs.map(def => ({ ...(base.find(d => d.key === def.key) ?? {}), ...def }));
  }

  private _publish(defs: ColumnDef[]): void {
    this._columns.set(defs.map(c => ({
      ...c,
      width: clampWidth(c, this._widthOverrides.get(c.key) ?? c.width),
      visible: this._visibilityOverrides.get(c.key) ?? c.visible ?? true,
    })));
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

  /** Current width of every column, by key (for state persistence) */
  readonly widths = computed<Record<string, number>>(() =>
    Object.fromEntries(this._columns().map(c => [c.key, c.width])));

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
    this._custom = defs;
    // Merge consumer defs onto the (localised) defaults
    this._publish(this._merge(defs, this.defaults()));
  }

  /** Reset to library defaults */
  resetColumns(): void {
    this._custom = null;
    this._publish(this.defaults());
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
    this._visibilityOverrides.set(key, visible);
    this._publish(this._columns());
  }

  toggleVisible(key: string): void {
    const col = this._columns().find(c => c.key === key);
    if (col) this.setVisible(key, col.visible === false);
  }

  /**
   * Update a column's width (called after column drag-resize).
   * Clamps to [minWidth, maxWidth].
   */
  setColumnWidth(key: string, width: number): void {
    this._widthOverrides.set(key, width);
    this._publish(this._columns());
  }

  /** Apply saved widths (e.g. from `stateKey`). */
  setColumnWidths(widths: Record<string, number>): void {
    for (const [key, w] of Object.entries(widths)) this._widthOverrides.set(key, w);
    this._publish(this._columns());
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

function clampWidth(c: ColumnDef, width: number): number {
  return Math.round(Math.max(c.minWidth ?? 40, Math.min(c.maxWidth ?? 800, width)));
}
