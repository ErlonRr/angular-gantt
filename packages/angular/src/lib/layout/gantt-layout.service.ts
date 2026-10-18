// ─────────────────────────────────────────────────────────────
//  gantry · layout/gantt-layout.service.ts
//
//  Layout state + the shared @gantryjs/core render model.
//
//  Data flow (signals only, no effect, no imperative push):
//
//   dataSource.items() ?? series ──► tasks (linkedSignal: local edits until the source changes)
//                                └─► collapsedIds (linkedSignal: `task.collapsed` seeds never-seen ids)
//   [(viewMode)] + options.viewMode ──► level (linkedSignal: whichever changed last, or the user's zoom)
//   options.view / panel width / initialScroll ──► view, panelWidthPx, initialScrollPending (linkedSignal)
//   options + level + i18n + theme metrics ──► config  (resolveConfig, bound by GantryComponent)
//   now (the minute clock)            ──► nowDay (quantizeNow: once per local day, or hour on hour scales)
//   tasks + config + nowDay (+ viewport width for fitToWidth) ──► timeline (buildTimeline)
//   timeline + now                    ──► todayX (the exact tick; null when hidden)
//   tasks + collapsed + sort          ──► visibleRows
//   visibleRows + timeline            ──► rowGeometries, geometryById (computeRowGeometries)
//   scrollTop + viewport height + focused / dragged row ──► vWindow ──► mountedGeometries, windowSpan
//   scrollLeft + viewport width + timeline ──► hWindow ──► tierWindows, bandWindow, lineWindow
//   annotations + timeline + todayX   ──► markerLane (computeMarkerLane) ──► headerHeight (tiers + lane)
//   loading / errorMessage / data-source load state + rows ──► chartState (resolveChartState)
//   annotations + todayX + config     ──► legendItems (buildLegend) ──► legendPlacement
//
//  Angular's counterpart of the Web Component's engine graph
//  (`packages/vanilla/src/engine/graph/*.ts`): the same core calls and the
//  same equality cut-offs (`sameVirtualWindow`, `sameHorizontalWindow`, the
//  quantised day), so both bindings mount the same rows, header cells,
//  bands and grid lines for the same scroll and size, and a scroll inside
//  the overscan or inside one 256 px chunk changes no downstream signal.
//
//  GantryComponent binds its inputs once (`bindTasks`, `bindState`,
//  `bindConfig`, `bindColumns`, `bindChart`) and writes the measured
//  viewport and the clock; the scroll service writes the scroll offsets;
//  user actions write the linkedSignals. Interaction state written by the
//  chart's handlers: `zoomAnchorX` (a zoom gesture's anchor, consumed by
//  the chart's scroll sync through core `anchoredScrollLeft`),
//  `scrollRequest` (`fitToScreen`'s scroll, applied once the new timeline
//  painted), `hoveredBarId` and `focusVisibleBarId` (the bar overlay).
//  Nothing in this service touches the DOM.
// ─────────────────────────────────────────────────────────────

import { Injectable, signal, computed, linkedSignal, inject } from '@angular/core';

import {
  type GanttTask,
  type GanttOptions,
  type GanttPanelOptions,
  type GanttFlatRow,
  type RowGeometry,
  type GanttView,
  type GanttI18n,
  type GanttLabels,
  type GanttAnnotation,
  type ColumnDef,
  DEFAULT_LABELS,
} from '../types';

import {
  flattenTree,
  filterVisible,
  reindexVisible,
  sortTree,
  columnComparator,
  type SortDirection,
  normalizeTasks,
  buildTimeline,
  computeRowGeometries,
  zoomStep,
  buildColumnContext,
  findColumn,
  initialScrollChanged,
  viewFromOptions,
  bottomScale,
  quantizeNow,
  todayX,
  computeVirtualWindow,
  sameVirtualWindow,
  seedCollapsed,
  virtualIndexes,
  computeHorizontalWindow,
  sameHorizontalWindow,
  tiersInRange,
  bandsInRange,
  linesInRange,
  HORIZONTAL_WINDOW_QUANTUM,
  VIEWPORT_FALLBACK_HEIGHT,
  VIRTUAL_OVERSCAN_ROWS,
  computeMarkerLane,
  zoomLevelLabel,
  resolveChartState,
  buildLegend,
  legendPlacement,
  fitZoomLevel,
  themeMetrics,
  LightTheme,
  type ChartState,
  type LegendItem,
  type LegendPlacement,
  type LoadStateSnapshot,
  type MarkerLane,
  type CollapseSeed,
  type ColumnContext,
  type ResolvedGanttConfig,
  type TimelineModel,
  type VirtualWindow,
  type HorizontalWindow,
  type TierWindow,
  type TimeBand,
  type LinesWindow,
} from '@gantryjs/core';

import { GanttScrollService } from '../scroll/gantt-scroll.service';
import { GanttDragService } from '../drag/gantt-drag.service';

/** Active column sort (null = original task order) */
export interface GanttSortState {
  key: string;
  dir: SortDirection;
}

/** The UI-state sources GantryComponent binds once (`bindState`) */
interface StateSources {
  readonly options: () => GanttOptions;
  readonly viewMode: () => string | undefined;
}

/** The `viewMode` model and `options.viewMode` (a linkedSignal recomputes on every change of its source) */
type LevelSources = readonly [model: string | undefined, option: string | undefined];

/** The chart inputs beyond tasks and options that the graph reads (`bindChart`) */
export interface ChartSources {
  /** The `annotations` input: the marker lane, the canvas annotations and the legend */
  readonly annotations: () => readonly GanttAnnotation[];
  /** The theme's label font size (`themeMetrics(theme).fontPx`) */
  readonly fontPx: () => number;
  /** The `loading` input */
  readonly loading: () => boolean;
  /** The `errorMessage` input */
  readonly errorMessage: () => string | null | undefined;
  /** The data source's load state (`null` without a data source) */
  readonly loadState: () => LoadStateSnapshot | null;
  /** The `showLegend` input */
  readonly showLegend: () => boolean;
  /** The toolbar is on screen (`showToolbar` and `options.toolbar !== false`) */
  readonly toolbarShown: () => boolean;
}

/** A horizontal scroll the chart applies once the timeline it targets has painted */
export type GanttScrollRequest = 'fit';

/** Vertical pixel range of the virtual window (`first` to `last` row, pinned rows excluded) */
export interface WindowSpan {
  readonly top: number;
  readonly bottom: number;
}

/** The width options a user-resized panel width yields to */
interface PanelWidthOptions {
  readonly width: GanttPanelOptions['width'];
  readonly legacy: GanttOptions['panelWidth'];
}

const NO_OPTIONS: GanttOptions = {};
const NO_ANNOTATIONS: readonly GanttAnnotation[] = [];
/** Label font size of a graph without `bindChart` (the default theme's) */
const DEFAULT_FONT_PX = themeMetrics(LightTheme).fontPx;

/** Same chart state, field by field: a new row count or load page keeps it */
const sameChartState = (a: ChartState, b: ChartState): boolean =>
  a.kind === b.kind &&
  a.busy === b.busy &&
  a.title === b.title &&
  a.message === b.message &&
  a.retry === b.retry &&
  a.footer === b.footer;
/** Zoom level without `[viewMode]` and `options.viewMode` */
const DEFAULT_LEVEL = 'Month';

@Injectable()
export class GanttLayoutService {
  /** Scroll offsets of the timeline viewport (written by the scroll listeners) */
  private readonly scroll = inject(GanttScrollService);
  /** The task being dragged or resized: its row stays mounted */
  private readonly drag = inject(GanttDragService);

  // ══════════════════════════════════════════════════════════
  //  Sources (bound once by GantryComponent)
  // ══════════════════════════════════════════════════════════

  private readonly tasksSource = signal<(() => GanttTask[]) | null>(null);
  private readonly stateSources = signal<StateSources | null>(null);
  private readonly options = computed<GanttOptions>(() => this.stateSources()?.options() ?? NO_OPTIONS);

  /** The consumer's tasks: `dataSource.items()`, else `series` */
  bindTasks(source: () => GanttTask[]): void {
    this.tasksSource.set(source);
  }

  /** The chart's `options` and its `viewMode` model: the sources of the UI state below */
  bindState(options: () => GanttOptions, viewMode: () => string | undefined): void {
    this.stateSources.set({ options, viewMode });
  }

  private readonly chartSources = signal<ChartSources | null>(null);

  /** Annotations, font size, loading / error / load state, legend switch and toolbar presence */
  bindChart(sources: ChartSources): void {
    this.chartSources.set(sources);
  }

  // ══════════════════════════════════════════════════════════
  //  UI state: consumer-seeded, changed by the user
  // ══════════════════════════════════════════════════════════

  /** The consumer's tasks, repaired (`normalizeTasks`) */
  private readonly sourceTasks = computed(() => normalizeTasks(this.tasksSource()?.() ?? []));

  /** Tasks shown: the consumer's, with local edits (drag, `updateTask`, `appendTasks`) until a new source */
  readonly tasks = linkedSignal<GanttTask[]>(() => this.sourceTasks());

  /** Every task id the sources have shown and the `task.collapsed` ids new in the latest one (core `seedCollapsed`) */
  private readonly collapseSeed = linkedSignal<GanttTask[], CollapseSeed>({
    source: this.sourceTasks,
    computation: (tasks, prev) => seedCollapsed(tasks, prev?.value.seen),
  });

  /**
   * Collapsed task ids — toggled by the task list, the API and a restored state. A source collapses
   * its `task.collapsed` ids the chart has never seen; an id seen before keeps the user's expand
   * state, across a new series, a data-source reset or an empty series in between (the Web
   * Component's rule).
   */
  readonly collapsedIds = linkedSignal<CollapseSeed, Set<string>>({
    source: this.collapseSeed,
    computation: (seed, prev) => {
      if (!prev) return new Set(seed.collapse);
      return seed.collapse.length ? new Set([...prev.value, ...seed.collapse]) : prev.value;
    },
  });

  /**
   * Zoom level shown (a `ViewMode` or a custom `zoomLevels` name): the `viewMode` model or
   * `options.viewMode`, whichever changed last, else the user's zoom (toolbar, keyboard, API,
   * restored state), which writes this signal. GantryComponent keeps the model in sync.
   */
  readonly level = linkedSignal<LevelSources, string>({
    source: computed<LevelSources>(() => [this.stateSources()?.viewMode(), this.options().viewMode], {
      equal: (a, b) => a[0] === b[0] && a[1] === b[1],
    }),
    computation: ([model, option], prev) => {
      if (!prev) return model ?? option ?? DEFAULT_LEVEL;
      if (model !== undefined && model !== prev.source[0]) return model;
      if (option !== undefined && option !== prev.source[1]) return option;
      return prev.value;
    },
  });

  /** split = task list + timeline, table = task list only, chart = timeline only (a changed `options.view` resets it) */
  readonly view = linkedSignal<GanttView | undefined, GanttView>({
    source: computed(() => viewFromOptions(this.options())),
    computation: (fromOptions, prev) => fromOptions ?? prev?.value ?? 'split',
  });

  /** Panel width in px once the user resized it (null = from `panel.width`; a changed width option resets it) */
  readonly panelWidthPx = linkedSignal<PanelWidthOptions, number | null>({
    source: computed(
      () => {
        const o = this.options();
        return { width: o.panel?.width, legacy: o.panelWidth };
      },
      { equal: (a, b) => a.width === b.width && a.legacy === b.legacy },
    ),
    computation: () => null,
  });

  /** `initialScroll` still has to be applied (on the first render with rows, again when the option changes) */
  readonly initialScrollPending = linkedSignal<GanttOptions['initialScroll'], boolean>({
    source: computed(() => this.options().initialScroll, { equal: (a, b) => !initialScrollChanged(a, b) }),
    computation: () => true,
  });

  /** Active column sort — root groups are reordered, children stay under their parent */
  readonly sort = signal<GanttSortState | null>(null);

  /**
   * Visible width of the timeline viewport (px), measured by GantryComponent: the horizontal window
   * and `fitToWidth`. 0 = not measured (server, before the first layout, DOM-less tests): the
   * whole timeline is mounted.
   */
  readonly viewportWidth = signal<number>(0);

  /**
   * Visible height of the timeline viewport, header included (px), measured by GantryComponent.
   * 0 = not measured: `VIEWPORT_FALLBACK_HEIGHT`.
   */
  readonly viewportHeight = signal<number>(0);

  /** Row that holds the keyboard focus (task-list row or bar): it stays mounted while scrolled away (`null` = none) */
  readonly focusedRowId = signal<string | null>(null);

  /** Task id of the bar under a fine pointer (`null` = none): its grips show in the bar overlay */
  readonly hoveredBarId = signal<string | null>(null);

  /** Task id of the bar focused from the keyboard (`null` = none, or focused by a pointer): its focus ring shows */
  readonly focusVisibleBarId = signal<string | null>(null);

  /**
   * x (px from the viewport's left edge) whose date the next zoom keeps in place: a Ctrl+wheel or
   * pinch anchor (`zoomBy`). `null`: the viewport's centre. The chart's scroll sync consumes it
   * (core `anchoredScrollLeft`) and clears it.
   */
  readonly zoomAnchorX = signal<number | null>(null);

  /** A scroll to apply once the timeline it targets has painted (`fitToScreen`), cleared by the chart */
  readonly scrollRequest = signal<GanttScrollRequest | null>(null);

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

  /** The clock (an instant, ms), bumped every minute so "today" and the current period stay fresh */
  readonly now = signal<number>(Date.now());

  // ══════════════════════════════════════════════════════════
  //  Derived: tree processing
  // ══════════════════════════════════════════════════════════

  /** Values time- and data-dependent cells read (status, predecessors, sort order) */
  readonly columnContext = computed<ColumnContext>(() =>
    buildColumnContext({
      tasks: this.tasks(),
      config: this.configSource()?.() ?? this.config(),
      now: new Date(this.now()),
      locale: (this.i18nSource()?.() ?? this.i18n())?.locale,
    }),
  );

  /** All rows (DFS flat, including hidden); a sort reorders siblings at every level */
  readonly allRows = computed<GanttFlatRow[]>(() => {
    const rows = flattenTree(this.tasks(), this.collapsedIds());
    const sort = this.sort();
    if (!sort) return rows;
    const column = findColumn(this.columnsSource()?.() ?? [], this.builtinsSource()?.() ?? [], sort.key);
    return sortTree(rows, columnComparator(sort.key, sort.dir, { column, ctx: this.columnContext() }));
  });

  /** Visible rows only (hidden === false) */
  readonly visibleRows = computed<GanttFlatRow[]>(() => reindexVisible(filterVisible(this.allRows())));

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

  /** Unit of the finest header tier: the timeline is rebuilt once per local day, or hour on hour scales */
  private readonly scaleUnit = computed(() => bottomScale(this.cfg().scales).unit);

  /** `now` quantised to the local day / hour (`quantizeNow`): changes once per day or hour, not every minute */
  readonly nowDay = computed<Date>(() => quantizeNow(new Date(this.now()), this.scaleUnit()), {
    equal: (a, b) => a.getTime() === b.getTime(),
  });

  readonly timeline = computed<TimelineModel>(() => {
    const config = this.cfg();
    return buildTimeline({
      tasks: this.tasks(),
      config,
      // Read only for `fitToWidth`: other timelines don't depend on the viewport
      viewportWidth: config.fitToWidth ? this.viewportWidth() : undefined,
      i18n: this.i18nSource()?.() ?? this.i18n(),
      now: this.nowDay(),
    });
  });

  /** x of the today line for the exact clock tick, `null` when hidden (`showToday: false`) or out of range */
  readonly todayX = computed<number | null>(() =>
    this.cfg().showToday ? todayX(this.timeline(), new Date(this.now())) : null,
  );

  readonly rowGeometries = computed<RowGeometry[]>(() =>
    computeRowGeometries(this.visibleRows(), this.timeline(), this.cfg()),
  );

  readonly geometryById = computed<Map<string, RowGeometry>>(
    () => new Map(this.rowGeometries().map(g => [g.row.task.id, g])),
  );

  // ── Convenience accessors (stable public API) ─────────────

  readonly rowHeight = computed(() => this.cfg().rowHeight);
  readonly startDate = computed(() => this.timeline().start);
  readonly endDate = computed(() => this.timeline().end);
  readonly pxPerDay = computed(() => this.timeline().pxPerDay);
  readonly totalWidth = computed(() => this.timeline().totalWidth);
  readonly totalHeight = computed(() => this.rowCount() * this.rowHeight());
  readonly showBaseline = computed(() => this.cfg().baseline);
  readonly showCriticalPath = computed(() => this.cfg().criticalPath);
  readonly showToday = computed(() => this.cfg().showToday);
  readonly panelVisible = computed(() => this.view() === 'split');

  // ══════════════════════════════════════════════════════════
  //  Derived: chart inputs, marker lane, header height, state, legend
  // ══════════════════════════════════════════════════════════

  /** Effective labels (the bound i18n bundle, else the defaults) */
  private readonly labels = computed<GanttLabels>(
    () => (this.i18nSource()?.() ?? this.i18n())?.labels ?? DEFAULT_LABELS,
  );

  /** The `annotations` input */
  readonly annotations = computed<readonly GanttAnnotation[]>(
    () => this.chartSources()?.annotations() ?? NO_ANNOTATIONS,
  );

  /** The theme's label font size (`themeMetrics(theme).fontPx`) */
  readonly fontPx = computed(() => this.chartSources()?.fontPx() ?? DEFAULT_FONT_PX);

  /**
   * The marker lane under the header tiers (core `computeMarkerLane`): 18 px with the today and
   * annotation markers while `markers.lane` shows it (`'auto'`: an annotation has a label), else 0.
   */
  readonly markerLane = computed<MarkerLane>(() =>
    computeMarkerLane({
      config: this.cfg(),
      timeline: this.timeline(),
      annotations: this.annotations(),
      todayX: this.todayX(),
      labels: this.labels(),
      fontPx: this.fontPx(),
      view: this.view(),
    }),
  );

  /**
   * Height of the timeline header, marker lane included (px): the task-list header, the sticky
   * header box, `scroll-padding-top`, the splitter toggle and the vertical window use it.
   */
  readonly headerHeight = computed(() => this.timeline().headerHeight + this.markerLane().height);

  /** The data source's load state (`null` without one) */
  private readonly loadState = computed(() => this.chartSources()?.loadState() ?? null);

  /**
   * What the chart body shows (core `resolveChartState`): ready, loading, empty or error, the
   * host's `aria-busy`, Retry's target and whether the task-list footer is rendered.
   */
  readonly chartState = computed<ChartState>(
    () => {
      const src = this.chartSources();
      return resolveChartState({
        loading: src?.loading() ?? false,
        errorMessage: src?.errorMessage() ?? null,
        rowCount: this.rowCount(),
        source: this.loadState(),
        labels: this.labels(),
      });
    },
    { equal: sameChartState },
  );

  /** The today line is drawn (the legend only cares whether, not where) */
  private readonly todayShown = computed(() => this.todayX() !== null);

  /** Legend entries (core `buildLegend`): today, annotations, critical path, baseline */
  readonly legendItems = computed<LegendItem[]>(() => {
    const cfg = this.cfg();
    return buildLegend({
      showToday: cfg.showToday,
      todayVisible: this.todayShown(),
      annotations: this.annotations(),
      labels: this.labels(),
      criticalPath: cfg.criticalPath,
      baseline: cfg.baseline,
    });
  });

  /** Where the legend is attached (core `legendPlacement`): under the chart, in the toolbar, or nowhere */
  readonly legendPlacement = computed<LegendPlacement>(() => {
    const src = this.chartSources();
    return legendPlacement({
      showLegend: src?.showLegend() ?? false,
      position: this.cfg().legend.position,
      view: this.view(),
      items: this.legendItems(),
      toolbarShown: src?.toolbarShown() ?? false,
    });
  });

  /**
   * Toolbar label of the shown zoom level (the resolved `config.level`): its `label`, else
   * `labels.viewModes[name]`, else the name — the Web Component's `zoomLevelLabel`.
   */
  readonly levelLabel = computed(() => zoomLevelLabel(this.cfg().level, this.labels()));

  // ══════════════════════════════════════════════════════════
  //  Derived: what is mounted (vertical and horizontal windows)
  // ══════════════════════════════════════════════════════════

  /**
   * Rows mounted in both panes: the viewport ± 4 rows, plus the focused and the dragged row
   * (pinned). Compared by value, so a scroll inside the overscan changes nothing downstream.
   */
  readonly vWindow = computed<VirtualWindow>(
    () => {
      const rh = this.rowHeight();
      const count = this.rowCount();
      const pinned: number[] = [];
      for (const id of [this.focusedRowId(), this.drag.activeTaskId()]) {
        const geo = id === null ? undefined : this.geometryById().get(id);
        if (geo) pinned.push(geo.row.visibleIndex);
      }
      const viewportH = Math.max(rh, (this.viewportHeight() || VIEWPORT_FALLBACK_HEIGHT) - this.headerHeight());
      return computeVirtualWindow(
        Math.max(0, this.scroll.scrollTop()),
        rh,
        viewportH,
        count,
        VIRTUAL_OVERSCAN_ROWS,
        pinned,
      );
    },
    { equal: sameVirtualWindow },
  );

  /** Geometries mounted in the canvas: the pinned rows before the window, the window, the pinned rows after it */
  readonly mountedGeometries = computed<RowGeometry[]>(() => {
    const geos = this.rowGeometries();
    const out: RowGeometry[] = [];
    for (const i of virtualIndexes(this.vWindow(), geos.length)) {
      const geo = geos[i];
      if (geo) out.push(geo);
    }
    return out;
  });

  /** Vertical range of the window (`first` to `last` row): annotations, the today line, the arrows queried */
  readonly windowSpan = computed<WindowSpan>(
    () => {
      const { first, last } = this.vWindow();
      const rh = this.rowHeight();
      return { top: first * rh, bottom: (last + 1) * rh };
    },
    { equal: (a, b) => a.top === b.top && a.bottom === b.bottom },
  );

  /**
   * Mounted pixel range `[x0, x1]` of the timeline: the viewport ± half its width, snapped outwards
   * to `HORIZONTAL_WINDOW_QUANTUM` (256 px), so a scroll inside one chunk changes nothing downstream.
   * The whole timeline while the viewport is not measured.
   */
  readonly hWindow = computed<HorizontalWindow>(
    () =>
      computeHorizontalWindow({
        scrollLeft: this.scroll.scrollLeft(),
        viewportWidth: this.viewportWidth(),
        totalWidth: this.timeline().totalWidth,
        quantum: HORIZONTAL_WINDOW_QUANTUM,
      }),
    { equal: sameHorizontalWindow },
  );

  /** Header tiers restricted to the cells inside `hWindow` (the timeline's own cell objects) */
  readonly tierWindows = computed<TierWindow[]>(() => {
    const { x0, x1 } = this.hWindow();
    return tiersInRange(this.timeline(), x0, x1);
  });

  /** Non-working bands inside `hWindow`, in painting order (the timeline's own band objects) */
  readonly bandWindow = computed<TimeBand[]>(() => {
    const { x0, x1 } = this.hWindow();
    return bandsInRange(this.timeline(), x0, x1);
  });

  /** Minor and major grid-line x positions inside `hWindow` */
  readonly lineWindow = computed<LinesWindow>(() => {
    const { x0, x1 } = this.hWindow();
    return linesInRange(this.timeline(), x0, x1);
  });

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
    this.zoomBy(1);
  }

  zoomOut(): void {
    this.zoomBy(-1);
  }

  /**
   * Zoom by `steps` levels (> 0 in, < 0 out), keeping the date under `anchorX` (px from the
   * viewport's left edge; `null`: its centre) in place. Nothing changes at the first / last level.
   */
  zoomBy(steps: number, anchorX: number | null = null): void {
    const levels = this.cfg().zoomLevels;
    const from = this.level();
    let to = from;
    for (let i = Math.abs(Math.trunc(steps)); i > 0; i--) to = zoomStep(levels, to, steps > 0 ? -1 : 1);
    if (to === from) return;
    this.zoomAnchorX.set(anchorX);
    this.level.set(to);
  }

  /**
   * "Fit to screen": the finest zoom level at which every task fits the viewport (core
   * `fitZoomLevel`), then — once that timeline has painted — a scroll to the first task
   * (`scrollRequest`, core `fitScrollLeft`). Returns the level, or `null` when there is nothing to
   * fit (no task, viewport not measured).
   */
  fitToScreen(): string | null {
    const level = fitZoomLevel({
      levels: this.cfg().zoomLevels,
      extent: this.timeline().extent,
      viewportWidth: this.viewportWidth(),
    });
    if (level === null) return null;
    this.zoomAnchorX.set(null);
    this.level.set(level);
    this.scrollRequest.set('fit');
    return level;
  }

  /** Update a single task in-place (no full re-render of unrelated rows) */
  updateTask(taskId: string, patch: Partial<GanttTask>): void {
    this.tasks.update(tasks => tasks.map(t => (t.id === taskId ? { ...t, ...patch } : t)));
  }

  /** Append tasks (lazy load) */
  appendTasks(newTasks: GanttTask[]): void {
    this.tasks.update(existing => normalizeTasks([...existing, ...newTasks]));
  }
}
