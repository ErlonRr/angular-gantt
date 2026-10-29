/**
 * @file columns.ts
 * Column catalogue, widths and visibility as signals. Which columns a view shows (lean split-view
 * panel vs data-rich table view) is resolved by `@gantryjs/core` (`resolveViewColumns`), exactly
 * like Angular. Widths changed by the user (or restored from saved state) and visibility toggles
 * are kept as overrides, so they survive re-assigning `columns` or a locale change.
 */

import {
  buildBuiltinColumns,
  clampColumnWidth,
  mergeColumnDefs,
  resolveViewColumns,
  showsResourceColumns,
  type GanttI18n,
  type GanttOptions,
  type GanttRowsMode,
  type GanttView,
  type ResolvedGanttConfig,
} from '@gantryjs/core';
import { computed, signal, type ReadonlySignal } from '../reactive';
import type { VanillaColumnDef as ColumnDef } from '../types';

type ViewKey = 'split' | 'table';
/** The resolved config (the resource view's default columns read `rows`; a config without it is the task view's) */
type ColumnConfig = Pick<ResolvedGanttConfig, 'panel' | 'table' | 'baseline'> & {
  rows?: ResolvedGanttConfig['rows'] | undefined;
};

interface Visibility {
  all: Map<string, boolean>;
  split: Map<string, boolean>;
  table: Map<string, boolean>;
}

export interface ColumnCatalogue {
  /** Consumer columns merged over the built-ins, or the built-ins */
  readonly columns: ColumnDef[];
  /** Every built-in column (localised), addressable by key in `panel.columns` / `table.columns` */
  readonly builtins: ColumnDef[];
}

export interface Columns {
  /** Consumer definitions: `options.columns` when not empty, else the `columns` property (`null` = built-ins) */
  readonly custom: ReadonlySignal<ColumnDef[] | null>;
  readonly catalogue: ReadonlySignal<ColumnCatalogue>;
  /** Columns shown by `view` (split panel, table view; none for the chart-only view). */
  columnsFor(view: GanttView, config: ColumnConfig): ColumnDef[];
  /** Current width of every column, by key. */
  widths(): Record<string, number>;
  setColumnWidth(key: string, width: number): void;
  /** Apply saved widths (e.g. from `stateKey`). */
  setColumnWidths(widths: Record<string, number>): void;
  /** Show / hide a column in both views, or only in `view`. */
  setVisible(key: string, visible: boolean, view?: ViewKey): void;
  /** Flip a column's visibility. With `config`, "shown" means shown by that view right now. */
  toggleVisible(key: string, view?: ViewKey, config?: ColumnConfig): void;
}

/** What decides whether the catalogue has the resource columns: the `resources` property and the rows mode override */
export interface ResourceColumnInputs {
  readonly resourcesIn: ReadonlySignal<readonly unknown[]>;
  readonly rowsOverride: ReadonlySignal<GanttRowsMode | null>;
}

export function createColumns(
  options: ReadonlySignal<GanttOptions>,
  columnsProp: ReadonlySignal<ColumnDef[] | null>,
  i18n: ReadonlySignal<GanttI18n>,
  resourceInputs?: ResourceColumnInputs,
): Columns {
  // Mutated in place, then re-set to notify
  const widthOverrides = signal(new Map<string, number>(), { equals: false });
  const visibility = signal<Visibility>({ all: new Map(), split: new Map(), table: new Map() }, { equals: false });

  // options.columns wins; without it, the `columns` property, else the built-ins
  const custom = computed(() => {
    const fromOptions = options().columns;
    return fromOptions?.length ? (fromOptions as ColumnDef[]) : columnsProp();
  });

  // The resource columns (Phase 14) join the catalogue once the chart has resources or shows the resource view
  const withResources = computed(() =>
    resourceInputs
      ? showsResourceColumns({
          resources: resourceInputs.resourcesIn(),
          rows: resourceInputs.rowsOverride() ?? options().rows,
        })
      : false,
  );

  const catalogue = computed<ColumnCatalogue>(() => {
    const { labels, locale, formats } = i18n();
    const builtins = buildBuiltinColumns(labels, locale, formats.dateFormat, undefined, withResources()) as ColumnDef[];
    const defs = custom();
    const base = defs ? mergeColumnDefs(defs, builtins) : builtins;
    const widths = widthOverrides();
    const shown = visibility().all;
    const apply = (c: ColumnDef): ColumnDef => ({
      ...c,
      width: clampColumnWidth(widths.get(c.key) ?? c.width, c),
      visible: shown.get(c.key) ?? c.visible ?? true,
    });
    return { columns: base.map(apply), builtins: builtins.map(apply) };
  });

  const columnsFor = (view: GanttView, config: ColumnConfig): ColumnDef[] => {
    const { columns, builtins } = catalogue();
    return resolveViewColumns({
      columns,
      builtins,
      custom: custom() !== null,
      view,
      config,
      visibility: visibility(),
    });
  };

  const setVisible = (key: string, visible: boolean, view?: ViewKey): void => {
    const v = visibility.peek();
    (view ? v[view] : v.all).set(key, visible);
    visibility.set(v);
  };

  return {
    custom,
    catalogue,
    columnsFor,
    widths() {
      const { columns, builtins } = catalogue.peek();
      return Object.fromEntries([...builtins, ...columns].map(c => [c.key, c.width]));
    },
    setColumnWidth(key, width) {
      const w = widthOverrides.peek();
      w.set(key, width);
      widthOverrides.set(w);
    },
    setColumnWidths(widths) {
      const w = widthOverrides.peek();
      for (const [key, width] of Object.entries(widths)) w.set(key, width);
      widthOverrides.set(w);
    },
    setVisible,
    toggleVisible(key, view, config) {
      const v = visibility.peek();
      const current = config
        ? (view ? [view] : (['split', 'table'] as const)).some(vk => columnsFor(vk, config).some(c => c.key === key))
        : ((view && v[view].get(key)) ??
          v.all.get(key) ??
          catalogue.peek().columns.find(c => c.key === key)?.visible !== false);
      setVisible(key, !current, view);
    },
  };
}
