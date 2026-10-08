/**
 * @file gantt-column.service.ts
 * Vanilla JS column definitions, widths and visibility. Widths changed by the
 * user (or restored from saved state) and visibility toggles are kept as
 * overrides, so they survive re-assigning `columns` or a locale change.
 */

import { buildDefaultColumns } from '@gantry/core';
import type { VanillaColumnDef as ColumnDef } from '../types';
import { GanttI18nService } from '../services/gantt-i18n.service';
import { createState } from '../core/state';

export class GanttColumnService {
  /** Consumer-provided definitions (null = default columns) */
  private custom: ColumnDef[] | null = null;
  private readonly widthOverrides = new Map<string, number>();
  private readonly visibilityOverrides = new Map<string, boolean>();
  private readonly _columns = createState<ColumnDef[]>([]);

  /** Called after any change (width, visibility, definitions). */
  onChange?: () => void;

  constructor(private readonly i18nService: GanttI18nService) {
    this.resetColumns();
  }

  private defaults(): ColumnDef[] {
    return buildDefaultColumns(
      this.i18nService.labels,
      this.i18nService.locale,
      this.i18nService.formats.dateFormat
    ).map(c => ({ ...c, visible: true }));
  }

  get columns(): ColumnDef[] {
    return this._columns();
  }

  get visibleColumns(): ColumnDef[] {
    return this._columns().filter(c => c.visible !== false);
  }

  get totalPanelWidth(): number {
    return this.visibleColumns.reduce((sum, c) => sum + c.width, 0);
  }

  /** Current width of every column, by key. */
  get widths(): Record<string, number> {
    return Object.fromEntries(this._columns().map(c => [c.key, c.width]));
  }

  private publish(defs: ColumnDef[]): void {
    this._columns.set(defs.map(c => ({
      ...c,
      width: clampWidth(c, this.widthOverrides.get(c.key) ?? c.width),
      visible: this.visibilityOverrides.get(c.key) ?? c.visible ?? true,
    })));
    this.onChange?.();
  }

  setColumns(defs: ColumnDef[]): void {
    this.custom = defs;
    const base = this.defaults();
    this.publish(defs.map(def => ({ ...(base.find(d => d.key === def.key) ?? {}), ...def })));
  }

  resetColumns(): void {
    this.custom = null;
    this.publish(this.defaults());
  }

  /** Re-resolve column labels/formatters after a locale or label change. */
  refresh(): void {
    if (this.custom) this.setColumns(this.custom);
    else this.resetColumns();
  }

  setColumnWidth(key: string, width: number): void {
    this.widthOverrides.set(key, width);
    this.publish(this._columns());
  }

  /** Apply saved widths (e.g. from `stateKey`). */
  setColumnWidths(widths: Record<string, number>): void {
    for (const [key, w] of Object.entries(widths)) this.widthOverrides.set(key, w);
    this.publish(this._columns());
  }

  setVisible(key: string, visible: boolean): void {
    this.visibilityOverrides.set(key, visible);
    this.publish(this._columns());
  }

  toggleVisible(key: string): void {
    const col = this._columns().find(c => c.key === key);
    if (col) this.setVisible(key, col.visible === false);
  }
}

function clampWidth(c: ColumnDef, width: number): number {
  return Math.round(Math.max(c.minWidth ?? 40, Math.min(c.maxWidth ?? 800, width)));
}
