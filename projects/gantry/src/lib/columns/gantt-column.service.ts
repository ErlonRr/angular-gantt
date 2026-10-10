// ─────────────────────────────────────────────────────────────
//  gantry · columns/gantt-column.service.ts
//
//  Reactive column catalogue, widths and visibility.
//
//  Which columns a view shows (lean split-view panel vs data-rich
//  table view) is resolved by `@gantry/core` (`resolveViewColumns`),
//  exactly like the Web Component.
//
//  Consumers interact via:
//    - `columns` input / `options.columns` on GantryComponent
//    - `options.panel.columns` / `options.table.columns` (keys)
//    - service methods at runtime (addColumn, removeColumn, …) —
//      kept as overrides, so they survive a locale change
// ─────────────────────────────────────────────────────────────

import { Injectable, signal, computed, effect, inject, untracked } from '@angular/core';
import {
  buildBuiltinColumns, mergeColumnDefs, resolveViewColumns,
  type GanttView, type ResolvedGanttConfig,
} from '@gantry/core';
import { ColumnDef } from '../types';
import { GanttI18nService } from '../services/gantt-i18n.service';

type ViewKey = 'split' | 'table';

@Injectable()
export class GanttColumnService {
  private readonly i18n = inject(GanttI18nService);

  /** Localised built-in columns for the current i18n config. */
  private builtinDefs(): ColumnDef[] {
    return buildBuiltinColumns(
      this.i18n.labels(), this.i18n.locale(), this.i18n.formats().dateFormat,
    ) as ColumnDef[];
  }

  /** Consumer-provided definitions (null = built-in columns). */
  private _custom: ColumnDef[] | null = null;
  /** Runtime edits (`addColumn`, `removeColumn`, `reorderByKeys`, `moveColumn`) */
  private _added: ColumnDef[] = [];
  /** `<ng-template ganttColumn>` definitions: override a column with the same key, else add one */
  private readonly _directives = new Map<string, ColumnDef>();
  private readonly _removed = new Set<string>();
  private _order: string[] | null = null;

  /**
   * Widths the user dragged (or restored from saved state) and visibility
   * toggles — kept as overrides so they survive re-assigning `columns`
   * or a locale change.
   */
  private readonly _widthOverrides = new Map<string, number>();
  private readonly _visibility = {
    all: new Map<string, boolean>(),
    split: new Map<string, boolean>(),
    table: new Map<string, boolean>(),
  };

  // ── State ────────────────────────────────────────────────
  private readonly _columns = signal<ColumnDef[]>([]);
  private readonly _builtins = signal<ColumnDef[]>([]);
  /** Bumped when visibility changes (the maps are not signals) */
  private readonly _visibilityVersion = signal(0);

  constructor() {
    this._publish();
    // Re-resolve labels / date formats when the locale or labels change
    effect(() => {
      const builtins = this.builtinDefs();
      untracked(() => this._publish(builtins));
    });
  }

  private _publish(builtins = this.builtinDefs()): void {
    const apply = (c: ColumnDef): ColumnDef => ({
      ...c,
      width: clampWidth(c, this._widthOverrides.get(c.key) ?? c.width),
      visible: this._visibility.all.get(c.key) ?? c.visible ?? true,
    });
    let base: ColumnDef[] = this._custom ? mergeColumnDefs(this._custom, builtins) : builtins;
    if (this._directives.size) {
      base = base.map(c => { const d = this._directives.get(c.key); return d ? mergeColumnDefs([d], [c])[0] : c; });
    }
    const extra = this._extraColumns(base);
    if (extra.length || this._removed.size || this._order) {
      base = [...base, ...extra].filter(c => !this._removed.has(c.key));
      if (this._order) {
        const order = this._order;
        const rank = (k: string) => { const i = order.indexOf(k); return i < 0 ? order.length : i; };
        base = base.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c.key) - rank(b.c.key) || a.i - b.i).map(x => x.c);
      }
    }
    this._builtins.set(builtins.map(apply));
    this._columns.set(base.map(apply));
  }

  /** Columns added at runtime or by `ganttColumn` whose key isn't in the catalogue yet */
  private _extraColumns(base: readonly ColumnDef[]): ColumnDef[] {
    const extra: ColumnDef[] = [];
    for (const c of [...this._directives.values(), ...this._added]) {
      // A new key gets a label and a width when the definition leaves them out
      if (!base.some(b => b.key === c.key) && !extra.some(e => e.key === c.key)) extra.push({ ...c, label: c.label ?? c.key, width: c.width ?? 120 });
    }
    return extra;
  }

  // ── Public signals ────────────────────────────────────────
  /** The catalogue: consumer columns merged over the built-ins, or the built-ins */
  readonly columns = this._columns.asReadonly();

  /** Every built-in column (localised), addressable by key in `panel.columns` / `table.columns` */
  readonly builtins = this._builtins.asReadonly();

  /** Columns shown by `view` (split panel, table view; none for the chart-only view) */
  columnsFor(view: GanttView, config: Pick<ResolvedGanttConfig, 'panel' | 'table' | 'baseline'>): ColumnDef[] {
    this._visibilityVersion();
    const columns = this._columns();
    // Without consumer columns, runtime edits change the default lists (4 panel columns + yours)
    const builtinKeys = new Set(this._builtins().map(c => c.key));
    return resolveViewColumns({
      columns,
      builtins: this._builtins(),
      custom: this._custom !== null,
      view,
      config,
      visibility: this._visibility,
      edits: {
        added: columns.filter(c => !builtinKeys.has(c.key)),
        removed: [...this._removed],
        order: this._order,
      },
    });
  }

  /** @deprecated Use `columnsFor(view, config)` — visibility now depends on the view. */
  readonly visibleColumns = computed(() =>
    this._columns().filter(c => c.visible !== false)
  );

  /** @deprecated CSS grid-template-columns of `visibleColumns` */
  readonly gridTemplate = computed(() =>
    this.visibleColumns()
      .map(c => `${c.width}px`)
      .join(' ')
  );

  /** Current width of every column, by key (for state persistence) */
  readonly widths = computed<Record<string, number>>(() =>
    Object.fromEntries([...this._builtins(), ...this._columns()].map(c => [c.key, c.width])));

  /** @deprecated Unused; the panel width comes from `panel.width` */
  readonly totalPanelWidth = computed(() =>
    this.visibleColumns().reduce((sum, c) => sum + c.width, 0)
  );

  // ── Init from consumer config ─────────────────────────────
  /**
   * Replace columns with consumer-provided config.
   * A key of a built-in column inherits its label, sizes and (without its own
   * renderer / template) its cells and sort rule.
   */
  setColumns(defs: ColumnDef[]): void {
    this._custom = defs;
    this._publish();
  }

  /** Reset to the built-in columns (also drops runtime edits) */
  resetColumns(): void {
    this._custom = null;
    this._added = [];
    // `ganttColumn` definitions stay: they belong to the template, not to the reset
    this._removed.clear();
    this._order = null;
    this._publish();
  }

  // ── Runtime mutation ──────────────────────────────────────
  addColumn(def: ColumnDef): void {
    if (this._columns().some(c => c.key === def.key)) return; // dedupe
    this._removed.delete(def.key);
    this._added = [...this._added, { visible: true, ...def }];
    this._publish();
  }

  removeColumn(key: string): void {
    this._added = this._added.filter(c => c.key !== key);
    this._removed.add(key);
    this._publish();
  }

  /** Register / update a `<ng-template ganttColumn>` definition (overrides a column with its key). */
  registerColumn(def: ColumnDef): void {
    this._directives.set(def.key, def);
    this._publish();
  }

  /** Drop a `<ng-template ganttColumn>` definition (a built-in column with that key comes back). */
  unregisterColumn(key: string): void {
    if (this._directives.delete(key)) this._publish();
  }

  /** Show / hide a column in both views, or only in `view` */
  setVisible(key: string, visible: boolean, view?: ViewKey): void {
    (view ? this._visibility[view] : this._visibility.all).set(key, visible);
    this._visibilityVersion.update(v => v + 1);
    this._publish();
  }

  /** Flip a column's visibility. With `config`, "shown" means shown by that view right now. */
  toggleVisible(key: string, view?: ViewKey, config?: Pick<ResolvedGanttConfig, 'panel' | 'table' | 'baseline'>): void {
    const current = config
      ? (view ? [view] : (['split', 'table'] as const)).some(v => this.columnsFor(v, config).some(c => c.key === key))
      : (view && this._visibility[view].get(key))
        ?? this._visibility.all.get(key)
        ?? this._columns().find(c => c.key === key)?.visible !== false;
    this.setVisible(key, !current, view);
  }

  /**
   * Update a column's width (called after column drag-resize).
   * Clamps to [minWidth, maxWidth].
   */
  setColumnWidth(key: string, width: number): void {
    this._widthOverrides.set(key, width);
    this._publish();
  }

  /** Apply saved widths (e.g. from `stateKey`). */
  setColumnWidths(widths: Record<string, number>): void {
    for (const [key, w] of Object.entries(widths)) this._widthOverrides.set(key, w);
    this._publish();
  }

  /**
   * Reorder columns by providing an ordered array of keys.
   * Keys not present in the array keep their order after them.
   */
  reorderByKeys(keys: string[]): void {
    this._order = [...keys];
    this._publish();
  }

  /** Move column left or right by one position */
  moveColumn(key: string, direction: 'left' | 'right'): void {
    const keys = this._columns().map(c => c.key);
    const idx = keys.indexOf(key);
    const target = direction === 'left' ? idx - 1 : idx + 1;
    if (idx < 0 || target < 0 || target >= keys.length) return;
    [keys[idx], keys[target]] = [keys[target], keys[idx]];
    this.reorderByKeys(keys);
  }
}

function clampWidth(c: ColumnDef, width: number): number {
  return Math.round(Math.max(c.minWidth ?? 40, Math.min(c.maxWidth ?? 800, width)));
}
