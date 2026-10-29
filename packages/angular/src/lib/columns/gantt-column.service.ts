// ─────────────────────────────────────────────────────────────
//  gantry · columns/gantt-column.service.ts
//
//  Reactive column catalogue, widths and visibility (signals only).
//
//  Which columns a view shows (lean split-view panel vs data-rich
//  table view) is resolved by `@gantryjs/core` (`resolveViewColumns`),
//  exactly like the Web Component.
//
//  Sources (bound once by GantryComponent, `bind()`):
//    - `options.columns`, else the `columns` input (consumer columns)
//    - the `<ng-template ganttColumn>` definitions of its content
//  Runtime edits (addColumn, removeColumn, reorderByKeys, moveColumn),
//  widths and visibility are kept as overrides, so they survive a
//  locale change; new consumer columns keep them too, removing the
//  consumer columns resets the edits.
// ─────────────────────────────────────────────────────────────

import { Injectable, signal, computed, linkedSignal, inject } from '@angular/core';
import {
  buildBuiltinColumns,
  clampColumnWidth,
  mergeColumnDefs,
  resolveViewColumns,
  type GanttView,
  type ResolvedGanttConfig,
} from '@gantryjs/core';
import { type ColumnDef } from '../types';
import { GanttI18nService } from '../services/gantt-i18n.service';

type ViewKey = 'split' | 'table';
/** The config a view's columns follow; the resolved `rows` picks the resource view's default columns */
type ColumnConfig = Pick<ResolvedGanttConfig, 'panel' | 'table' | 'baseline'> & {
  readonly rows?: ResolvedGanttConfig['rows'] | undefined;
};

/** Runtime edits (`addColumn`, `removeColumn`, `reorderByKeys`, `moveColumn`) */
interface ColumnEdits {
  readonly added: readonly ColumnDef[];
  readonly removed: readonly string[];
  readonly order: readonly string[] | null;
}

interface ColumnVisibility {
  readonly all: ReadonlyMap<string, boolean>;
  readonly split: ReadonlyMap<string, boolean>;
  readonly table: ReadonlyMap<string, boolean>;
}

/** What GantryComponent binds once: the consumer columns and the `ganttColumn` definitions. */
interface ColumnSources {
  readonly columns: () => readonly ColumnDef[];
  readonly directives: () => readonly ColumnDef[];
  /** Whether the chart has resources or shows the resource view (core `showsResourceColumns`) */
  readonly resourceColumns: () => boolean;
}

const NONE: readonly ColumnDef[] = [];
const NO_EDITS: ColumnEdits = { added: [], removed: [], order: null };

@Injectable()
export class GanttColumnService {
  private readonly i18n = inject(GanttI18nService);
  private readonly sources = signal<ColumnSources | null>(null);

  /** Consumer columns (`options.columns`, else the `columns` input), compared by reference */
  private readonly consumer = computed(() => this.sources()?.columns() ?? NONE);
  /** `<ng-template ganttColumn>` definitions: override a column with the same key, else add one */
  private readonly directives = computed(() => this.sources()?.directives() ?? NONE);

  /** Consumer definitions (`null` = built-in columns); `setColumns()` replaces them until the consumer columns change */
  private readonly custom = linkedSignal<readonly ColumnDef[] | null>(() => {
    const cols = this.consumer();
    return cols.length ? cols : null;
  });
  /** Runtime edits: kept when the consumer columns change, dropped when they are removed */
  private readonly edits = linkedSignal<readonly ColumnDef[], ColumnEdits>({
    source: this.consumer,
    computation: (cols, prev) => (cols.length && prev ? prev.value : NO_EDITS),
  });

  /**
   * Widths the user dragged (or restored from saved state) and visibility
   * toggles — kept as overrides so they survive re-assigning `columns`
   * or a locale change.
   */
  private readonly widthOverrides = signal<ReadonlyMap<string, number>>(new Map());
  private readonly visibility = signal<ColumnVisibility>({ all: new Map(), split: new Map(), table: new Map() });

  /** Localised built-in columns for the current i18n config. */
  private readonly builtinDefs = computed(
    () =>
      buildBuiltinColumns(
        this.i18n.labels(),
        this.i18n.locale(),
        this.i18n.formats().dateFormat,
        undefined,
        this.sources()?.resourceColumns() ?? false,
      ) as ColumnDef[],
  );

  /** Width overrides (clamped) and the all-views visibility, applied to a definition */
  private readonly applyOverrides = computed(() => {
    const widths = this.widthOverrides();
    const shown = this.visibility().all;
    return (c: ColumnDef): ColumnDef => ({
      ...c,
      width: clampColumnWidth(widths.get(c.key) ?? c.width, c),
      visible: shown.get(c.key) ?? c.visible ?? true,
    });
  });

  // ── Public signals ────────────────────────────────────────
  /** Every built-in column (localised), addressable by key in `panel.columns` / `table.columns` */
  readonly builtins = computed<ColumnDef[]>(() => this.builtinDefs().map(this.applyOverrides()));

  /** The catalogue: consumer columns merged over the built-ins, or the built-ins */
  readonly columns = computed<ColumnDef[]>(() => {
    const builtins = this.builtinDefs();
    const custom = this.custom();
    const directives = this.directives();
    const { added, removed, order } = this.edits();
    let base: ColumnDef[] = custom ? mergeColumnDefs(custom, builtins) : builtins;
    if (directives.length) {
      const byKey = new Map(directives.map(d => [d.key, d]));
      const own = new Set(custom?.map(c => c.key));
      base = base.map(c => {
        const d = byKey.get(c.key);
        // Over your own column a definition overrides what it sets; over a built-in, the built-in rules
        return d ? (own.has(c.key) ? overlayColumn(c, d) : mergeColumnDefs([d], [c])[0]) : c;
      });
    }
    const extra = extraColumns(base, [...directives, ...added]);
    if (extra.length || removed.length || order) {
      base = [...base, ...extra].filter(c => !removed.includes(c.key));
      if (order) {
        const rank = (k: string) => {
          const i = order.indexOf(k);
          return i < 0 ? order.length : i;
        };
        base = base
          .map((c, i) => ({ c, i }))
          .sort((a, b) => rank(a.c.key) - rank(b.c.key) || a.i - b.i)
          .map(x => x.c);
      }
    }
    return base.map(this.applyOverrides());
  });

  /** Current width of every column, by key (for state persistence) */
  readonly widths = computed<Record<string, number>>(() =>
    Object.fromEntries([...this.builtins(), ...this.columns()].map(c => [c.key, c.width])),
  );

  /** Bind the consumer columns and the `ganttColumn` definitions (once, from GantryComponent's constructor). */
  bind(
    columns: () => readonly ColumnDef[],
    directives: () => readonly ColumnDef[] = () => NONE,
    resourceColumns: () => boolean = () => false,
  ): void {
    this.sources.set({ columns, directives, resourceColumns });
  }

  /** Columns shown by `view` (split panel, table view; none for the chart-only view) */
  columnsFor(view: GanttView, config: ColumnConfig): ColumnDef[] {
    const columns = this.columns();
    const builtins = this.builtins();
    const { removed, order } = this.edits();
    // Without consumer columns, runtime edits change the default lists (4 panel columns + yours)
    const builtinKeys = new Set(builtins.map(c => c.key));
    return resolveViewColumns({
      columns,
      builtins,
      custom: this.custom() !== null,
      view,
      config,
      visibility: this.visibility(),
      edits: {
        added: columns.filter(c => !builtinKeys.has(c.key)),
        removed,
        order,
      },
    });
  }

  // ── Consumer config ───────────────────────────────────────
  /**
   * Replace columns with consumer-provided config (until the consumer columns change).
   * A key of a built-in column inherits its label, sizes and (without its own
   * renderer / template) its cells and sort rule.
   */
  setColumns(defs: ColumnDef[]): void {
    this.custom.set(defs);
  }

  /** Reset to the built-in columns (also drops runtime edits; `ganttColumn` definitions stay) */
  resetColumns(): void {
    this.custom.set(null);
    this.edits.set(NO_EDITS);
  }

  // ── Runtime mutation ──────────────────────────────────────
  addColumn(def: ColumnDef): void {
    if (this.columns().some(c => c.key === def.key)) return; // dedupe
    this.edits.update(e => ({
      ...e,
      added: [...e.added, { visible: true, ...def }],
      removed: e.removed.filter(k => k !== def.key),
    }));
  }

  removeColumn(key: string): void {
    this.edits.update(e => ({
      ...e,
      added: e.added.filter(c => c.key !== key),
      removed: e.removed.includes(key) ? e.removed : [...e.removed, key],
    }));
  }

  /** Show / hide a column in both views, or only in `view` */
  setVisible(key: string, visible: boolean, view?: ViewKey): void {
    this.visibility.update(v => {
      const which = view ?? 'all';
      return { ...v, [which]: new Map(v[which]).set(key, visible) };
    });
  }

  /** Flip a column's visibility. With `config`, "shown" means shown by that view right now. */
  toggleVisible(key: string, view?: ViewKey, config?: ColumnConfig): void {
    const v = this.visibility();
    const current = config
      ? (view ? [view] : (['split', 'table'] as const)).some(vk => this.columnsFor(vk, config).some(c => c.key === key))
      : ((view && v[view].get(key)) ?? v.all.get(key) ?? this.columns().find(c => c.key === key)?.visible !== false);
    this.setVisible(key, !current, view);
  }

  /**
   * Update a column's width (called after column drag-resize). The catalogue clamps it to the
   * column's [minWidth, maxWidth] (`clampColumnWidth`).
   */
  setColumnWidth(key: string, width: number): void {
    this.widthOverrides.update(w => new Map(w).set(key, width));
  }

  /** Apply saved widths (e.g. from `stateKey`). */
  setColumnWidths(widths: Record<string, number>): void {
    this.widthOverrides.update(w => {
      const next = new Map(w);
      for (const [key, width] of Object.entries(widths)) next.set(key, width);
      return next;
    });
  }

  /**
   * Reorder columns by providing an ordered array of keys.
   * Keys not present in the array keep their order after them.
   */
  reorderByKeys(keys: string[]): void {
    this.edits.update(e => ({ ...e, order: [...keys] }));
  }

  /** Move column left or right by one position */
  moveColumn(key: string, direction: 'left' | 'right'): void {
    const keys = this.columns().map(c => c.key);
    const idx = keys.indexOf(key);
    const target = direction === 'left' ? idx - 1 : idx + 1;
    if (idx < 0 || target < 0 || target >= keys.length) return;
    [keys[idx], keys[target]] = [keys[target], keys[idx]];
    this.reorderByKeys(keys);
  }
}

/**
 * A `ganttColumn` over a column of your own `columns`: what it sets wins, and its own cell (`render`
 * or a template) replaces only the cell, so the column keeps its sort rule (`sortable`, `sortValue`).
 */
function overlayColumn(base: ColumnDef, d: ColumnDef): ColumnDef {
  const set = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) as Partial<ColumnDef>;
  const { render, cellTemplate, ...rest } = base;
  const cell =
    set.render !== undefined || set.cellTemplate !== undefined
      ? {}
      : { ...(render ? { render } : {}), ...(cellTemplate ? { cellTemplate } : {}) };
  return { ...rest, ...cell, ...set };
}

/** Columns added at runtime or by `ganttColumn` whose key isn't in the catalogue yet */
function extraColumns(base: readonly ColumnDef[], candidates: readonly ColumnDef[]): ColumnDef[] {
  const extra: ColumnDef[] = [];
  for (const c of candidates) {
    // A new key gets a label and a width when the definition leaves them out
    if (!base.some(b => b.key === c.key) && !extra.some(e => e.key === c.key))
      extra.push({ ...c, label: c.label ?? c.key, width: c.width ?? 120 });
  }
  return extra;
}
