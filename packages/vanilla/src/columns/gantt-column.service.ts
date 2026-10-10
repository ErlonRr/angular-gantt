/**
 * @file gantt-column.service.ts
 * Vanilla JS column catalogue, widths and visibility. Which columns a view shows
 * (lean split-view panel vs data-rich table view) is resolved by `@gantry/core`
 * (`resolveViewColumns`), exactly like Angular. Widths changed by the user (or
 * restored from saved state) and visibility toggles are kept as overrides, so they
 * survive re-assigning `columns` or a locale change.
 */

import {
  buildBuiltinColumns,
  mergeColumnDefs,
  resolveViewColumns,
  type GanttView,
  type ResolvedGanttConfig,
} from '@gantry/core';
import type { VanillaColumnDef as ColumnDef } from '../types';
import { GanttI18nService } from '../services/gantt-i18n.service';
import { createState } from '../core/state';

type ViewKey = 'split' | 'table';

export class GanttColumnService {
  /** Consumer-provided definitions (null = built-in columns) */
  private custom: ColumnDef[] | null = null;
  private readonly widthOverrides = new Map<string, number>();
  private readonly visibility = {
    all: new Map<string, boolean>(),
    split: new Map<string, boolean>(),
    table: new Map<string, boolean>(),
  };
  private readonly _columns = createState<ColumnDef[]>([]);
  private _builtins: ColumnDef[] = [];

  /** Called after any change (width, visibility, definitions). */
  onChange?: () => void;

  constructor(private readonly i18nService: GanttI18nService) {
    this.resetColumns();
  }

  private builtinDefs(): ColumnDef[] {
    return buildBuiltinColumns(
      this.i18nService.labels,
      this.i18nService.locale,
      this.i18nService.formats.dateFormat,
    ) as ColumnDef[];
  }

  /** The catalogue: consumer columns merged over the built-ins, or the built-ins. */
  get columns(): ColumnDef[] {
    return this._columns();
  }

  /** Every built-in column (localised), addressable by key in `panel.columns` / `table.columns`. */
  get builtins(): ColumnDef[] {
    return this._builtins;
  }

  /** Columns shown by `view` (split panel, table view; none for the chart-only view). */
  columnsFor(view: GanttView, config: Pick<ResolvedGanttConfig, 'panel' | 'table' | 'baseline'>): ColumnDef[] {
    return resolveViewColumns({
      columns: this._columns(),
      builtins: this._builtins,
      custom: this.custom !== null,
      view,
      config,
      visibility: this.visibility,
    });
  }

  /** @deprecated Use `columnsFor(view, config)` — visibility now depends on the view. */
  get visibleColumns(): ColumnDef[] {
    return this._columns().filter(c => c.visible !== false);
  }

  /** @deprecated Unused; the panel width comes from `panel.width`. */
  get totalPanelWidth(): number {
    return this.visibleColumns.reduce((sum, c) => sum + c.width, 0);
  }

  /** Current width of every column, by key. */
  get widths(): Record<string, number> {
    return Object.fromEntries([...this._builtins, ...this._columns()].map(c => [c.key, c.width]));
  }

  private publish(): void {
    const builtins = this.builtinDefs();
    const base = this.custom ? mergeColumnDefs(this.custom, builtins) : builtins;
    const apply = (c: ColumnDef): ColumnDef => ({
      ...c,
      width: clampWidth(c, this.widthOverrides.get(c.key) ?? c.width),
      visible: this.visibility.all.get(c.key) ?? c.visible ?? true,
    });
    this._builtins = builtins.map(apply);
    this._columns.set(base.map(apply));
    this.onChange?.();
  }

  setColumns(defs: ColumnDef[]): void {
    this.custom = defs;
    this.publish();
  }

  resetColumns(): void {
    this.custom = null;
    this.publish();
  }

  /** Re-resolve column labels/formatters after a locale or label change. */
  refresh(): void {
    this.publish();
  }

  setColumnWidth(key: string, width: number): void {
    this.widthOverrides.set(key, width);
    this.publish();
  }

  /** Apply saved widths (e.g. from `stateKey`). */
  setColumnWidths(widths: Record<string, number>): void {
    for (const [key, w] of Object.entries(widths)) this.widthOverrides.set(key, w);
    this.publish();
  }

  /** Show / hide a column in both views, or only in `view`. */
  setVisible(key: string, visible: boolean, view?: ViewKey): void {
    (view ? this.visibility[view] : this.visibility.all).set(key, visible);
    this.publish();
  }

  /** Flip a column's visibility. With `config`, "shown" means shown by that view right now. */
  toggleVisible(key: string, view?: ViewKey, config?: Pick<ResolvedGanttConfig, 'panel' | 'table' | 'baseline'>): void {
    const current = config
      ? (view ? [view] : (['split', 'table'] as const)).some(v => this.columnsFor(v, config).some(c => c.key === key))
      : ((view && this.visibility[view].get(key)) ??
        this.visibility.all.get(key) ??
        this._columns().find(c => c.key === key)?.visible !== false);
    this.setVisible(key, !current, view);
  }
}

function clampWidth(c: ColumnDef, width: number): number {
  return Math.round(Math.max(c.minWidth ?? 40, Math.min(c.maxWidth ?? 800, width)));
}
