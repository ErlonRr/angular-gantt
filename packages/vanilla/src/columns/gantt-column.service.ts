/**
 * @file gantt-column.service.ts
 * Vanilla JS column definition and width management service.
 */

import { ColumnDef, buildDefaultColumns } from '@gantry/core';
import { GanttI18nService } from '../services/gantt-i18n.service';
import { createState } from '../core/state';

export class GanttColumnService {
  private i18nService: GanttI18nService;
  private hasCustom = false;
  private readonly _columns = createState<ColumnDef[]>([]);

  constructor(i18nService: GanttI18nService) {
    this.i18nService = i18nService;
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

  setColumns(defs: ColumnDef[]): void {
    this.hasCustom = true;
    const base = this.defaults();
    const merged = defs.map(def => {
      const b = base.find(d => d.key === def.key) ?? {};
      return { ...b, ...def, visible: def.visible ?? true };
    });
    this._columns.set(merged);
  }

  resetColumns(): void {
    this.hasCustom = false;
    this._columns.set(this.defaults());
  }

  setColumnWidth(key: string, width: number): void {
    this._columns.update(cols =>
      cols.map(c => {
        if (c.key !== key) return c;
        const clamped = Math.max(
          c.minWidth ?? 40,
          Math.min(c.maxWidth ?? 600, width)
        );
        return { ...c, width: clamped };
      })
    );
  }

  setVisible(key: string, visible: boolean): void {
    this._columns.update(cols =>
      cols.map(c => c.key === key ? { ...c, visible } : c)
    );
  }
}
