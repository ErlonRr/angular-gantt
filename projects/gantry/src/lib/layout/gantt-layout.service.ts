// ─────────────────────────────────────────────────────────────
//  gantry · layout/gantt-layout.service.ts
//
//  Layout state + the shared @gantry/core render model.
//
//  Data flow (all computed(), no imperative push):
//
//   options + viewMode + theme + i18n ──► config  (resolveConfig)
//   tasks + config + viewport width   ──► timeline (buildTimeline)
//   tasks + collapsed + sort          ──► visibleRows
//   visibleRows + timeline            ──► rowGeometries (computeRowGeometries)
//
//  The Web Component reads the exact same model, so both bindings
//  draw identical geometry. Nothing in this service touches the DOM.
// ─────────────────────────────────────────────────────────────

import { Injectable, signal, computed } from '@angular/core';

import {
  GanttTask,
  GanttFlatRow,
  RowGeometry,
  GanttView,
  GanttI18n,
  ColumnDef,
} from '../types';

import {
  flattenTree,
  filterVisible,
  reindexVisible,
  sortTree,
  columnComparator,
  SortDirection,
  normalizeTasks,
} from '../gantt-data';

import {
  buildTimeline,
  computeRowGeometries,
  zoomStep,
  buildColumnContext,
  findColumn,
  type ColumnContext,
  type ResolvedGanttConfig,
  type TimelineModel,
  type GridLine,
} from '@gantry/core';

/** Active column sort (null = original task order) */
export interface GanttSortState {
  key: string;
  dir: SortDirection;
}

@Injectable()
export class GanttLayoutService {

  // ══════════════════════════════════════════════════════════
  //  Primary writable signals  (set by GantryComponent)
  // ══════════════════════════════════════════════════════════

  /** Raw task array provided by the consumer */
  readonly tasks = signal<GanttTask[]>([]);

  /** Set of collapsed task IDs — toggled by the task list panel */
  readonly collapsedIds = signal<Set<string>>(new Set());

  /** Active zoom level (a `ViewMode` or a custom `zoomLevels` name) */
  readonly viewMode = signal<string>('Month');

  /** Active column sort — root groups are reordered, children stay under their parent */
  readonly sort = signal<GanttSortState | null>(null);

  /** Visible width of the timeline viewport (for `fitToWidth`) */
  readonly viewportWidth = signal<number>(0);

  /** Resolved options (set directly, or derived from `bindConfig`) */
  readonly config = signal<ResolvedGanttConfig | null>(null);
  readonly i18n = signal<GanttI18n | undefined>(undefined);

  /** Live sources bound by GantryComponent (options + theme + i18n → config) */
  private readonly configSource = signal<(() => ResolvedGanttConfig) | null>(null);
  private readonly i18nSource = signal<(() => GanttI18n) | null>(null);

  bindConfig(config: () => ResolvedGanttConfig, i18n: () => GanttI18n): void {
    this.configSource.set(config);
    this.i18nSource.set(i18n);
  }

  /** Column catalogue and built-ins (bound to the column service) — used to sort by a column */
  private readonly columnsSource = signal<(() => readonly ColumnDef[]) | null>(null);
  private readonly builtinsSource = signal<(() => readonly ColumnDef[]) | null>(null);

  bindColumns(columns: () => readonly ColumnDef[], builtins?: () => readonly ColumnDef[]): void {
    this.columnsSource.set(columns);
    this.builtinsSource.set(builtins ?? null);
  }

  /** Panel width in px once the user resized it (null = from `panel.width`) */
  readonly panelWidthPx = signal<number | null>(null);

  /** split = task list + timeline, table = task list only, chart = timeline only */
  readonly view = signal<GanttView>('split');

  /** Bumped every minute so "today" and the current period stay fresh */
  readonly now = signal<number>(Date.now());

  // ══════════════════════════════════════════════════════════
  //  Derived: tree processing
  // ══════════════════════════════════════════════════════════

  /** Values time- and data-dependent cells read (status, predecessors, sort order) */
  readonly columnContext = computed<ColumnContext>(() => buildColumnContext({
    tasks: this.tasks(),
    config: this.configSource()?.() ?? this.config(),
    now: new Date(this.now()),
    locale: (this.i18nSource()?.() ?? this.i18n())?.locale,
  }));

  /** All rows (DFS flat, including hidden); a sort reorders siblings at every level */
  readonly allRows = computed<GanttFlatRow[]>(() => {
    const rows = flattenTree(this.tasks(), this.collapsedIds());
    const sort = this.sort();
    if (!sort) return rows;
    const column = findColumn(this.columnsSource()?.() ?? [], this.builtinsSource()?.() ?? [], sort.key);
    return sortTree(rows, columnComparator(sort.key, sort.dir, { column, ctx: this.columnContext() }));
  });

  /** Visible rows only (hidden === false) */
  readonly visibleRows = computed<GanttFlatRow[]>(() =>
    reindexVisible(filterVisible(this.allRows()))
  );

  readonly rowCount = computed(() => this.visibleRows().length);

  // ══════════════════════════════════════════════════════════
  //  Derived: render model
  // ══════════════════════════════════════════════════════════

  readonly cfg = computed<ResolvedGanttConfig>(() => {
    const src = this.configSource();
    const c = src ? src() : this.config();
    if (!c) throw new Error('[gantry] layout used before configuration');
    return c;
  });

  readonly timeline = computed<TimelineModel>(() => buildTimeline({
    tasks: this.tasks(),
    config: this.cfg(),
    viewportWidth: this.viewportWidth(),
    i18n: this.i18nSource()?.() ?? this.i18n(),
    now: new Date(this.now()),
  }));

  readonly rowGeometries = computed<RowGeometry[]>(() =>
    computeRowGeometries(this.visibleRows(), this.timeline(), this.cfg())
  );

  readonly geometryById = computed<Map<string, RowGeometry>>(() =>
    new Map(this.rowGeometries().map(g => [g.row.task.id, g]))
  );

  // ── Convenience accessors (stable public API) ─────────────

  readonly rowHeight        = computed(() => this.cfg().rowHeight);
  readonly startDate        = computed(() => this.timeline().start);
  readonly endDate          = computed(() => this.timeline().end);
  readonly pxPerDay         = computed(() => this.timeline().pxPerDay);
  readonly totalWidth       = computed(() => this.timeline().totalWidth);
  readonly totalHeight      = computed(() => this.rowCount() * this.rowHeight());
  readonly totalHeaderHeight = computed(() => this.timeline().headerHeight);
  readonly todayX           = computed(() => this.timeline().todayX);
  readonly showBaseline     = computed(() => this.cfg().baseline);
  readonly showCriticalPath = computed(() => this.cfg().criticalPath);
  readonly showToday        = computed(() => this.cfg().showToday);
  readonly panelVisible     = computed(() => this.view() === 'split');

  /** Vertical grid lines (major = period delimiters) */
  readonly gridLines = computed<GridLine[]>(() => {
    const tl = this.timeline();
    return [
      ...tl.minorLines.map(x => ({ x, isMajor: false })),
      ...tl.majorLines.map(x => ({ x, isMajor: true })),
    ].sort((a, b) => a.x - b.x);
  });

  readonly layoutParams = computed(() => ({
    origin:    this.startDate(),
    pxPerDay:  this.pxPerDay(),
    rowHeight: this.rowHeight(),
  }));

  // ══════════════════════════════════════════════════════════
  //  Mutations
  // ══════════════════════════════════════════════════════════

  toggleCollapse(taskId: string): void {
    this.collapsedIds.update(ids => {
      const next = new Set(ids);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  /** Cycle a column's sort: ascending → descending → original order. */
  toggleSort(key: string): void {
    this.sort.update(cur => {
      if (cur?.key !== key) return { key, dir: 'asc' };
      return cur.dir === 'asc' ? { key, dir: 'desc' } : null;
    });
  }

  collapseAll(): void {
    const parentIds = flattenTree(this.tasks(), new Set())
      .filter(r => r.hasChildren)
      .map(r => r.task.id);
    this.collapsedIds.set(new Set(parentIds));
  }

  expandAll(): void {
    this.collapsedIds.set(new Set());
  }

  zoomIn(): void {
    this.viewMode.update(v => zoomStep(this.cfg().zoomLevels, v, -1));
  }

  zoomOut(): void {
    this.viewMode.update(v => zoomStep(this.cfg().zoomLevels, v, 1));
  }

  /** Update a single task in-place (no full re-render of unrelated rows) */
  updateTask(taskId: string, patch: Partial<GanttTask>): void {
    this.tasks.update(tasks =>
      tasks.map(t => t.id === taskId ? { ...t, ...patch } : t)
    );
  }

  private readonly seenIds = new Set<string>();

  /** Replace the entire task array (seeds collapsed state from `task.collapsed`) */
  setTasks(input: GanttTask[]): void {
    const tasks = normalizeTasks(input);
    const initiallyCollapsed = tasks.filter(t => t.collapsed && !this.seenIds.has(t.id)).map(t => t.id);
    for (const t of tasks) this.seenIds.add(t.id);
    if (initiallyCollapsed.length) {
      this.collapsedIds.update(ids => new Set([...ids, ...initiallyCollapsed]));
    }
    this.tasks.set(tasks);
  }

  /** Append tasks (lazy load) */
  appendTasks(newTasks: GanttTask[]): void {
    this.tasks.update(existing => normalizeTasks([...existing, ...newTasks]));
  }
}
