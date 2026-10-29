// ─────────────────────────────────────────────────────────────
//  gantry · layout/gantt-layout.service.ts
//
//  Layout state + the shared @gantryjs/core render model.
//
//  Data flow (signals only, no effect, no imperative push):
//
//   dataSource.items() ?? series ──► tasks (linkedSignal; edits are written to the source, not here)
//                                └─► collapsedIds (linkedSignal: `task.collapsed` / `groupBar.collapsed`
//                                    seed never-seen ids)
//   [(viewMode)] + options.viewMode ──► level (linkedSignal: whichever changed last, or the user's zoom)
//   options.view / panel width / initialScroll ──► view, panelWidthPx, initialScrollPending (linkedSignal)
//   options + level + i18n + theme metrics ──► config  (resolveConfig, bound by GantryComponent)
//   now (the minute clock)            ──► nowDay (quantizeNow: once per local day, or hour on hour scales)
//   tasks + config + nowDay (+ viewport width for fitToWidth, + the sync group's shared range)
//                                     ──► timeline (buildTimeline) ──► naturalRange (own range + extent)
//   timeline + now                    ──► todayX (the exact tick; null when hidden)
//   tasks + config + nowDay           ──► critical (CPM), rollups (computeRollups, `options.rollup`)
//   tasks + collapsed + rollups + sort ──► allRows (applyRollups before sortTree) ──► visibleRows
//   config + critical + rollups + nowDay ──► rowStyle (createStyleResolver), barSegments (rollupSegments)
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
//  painted), `hoveredBarId` and `focusVisibleBarId` (the bar overlay),
//  `hoveredRowId` (the row hover), `mainWidth` (the measured main area:
//  the toolbar layout) and `shared` (a sync group's range and extent).
//
//  Editing (Gantry 2 phase 11, plan §3f; the Web Component's inputs of
//  the same names): `cellEdit` (the cell being edited), `link` (a link
//  being drawn), `selectedLinkKey` (the arrow selected for Delete; it
//  follows `arrowIndex`, the links drawn: a link that is gone — the app
//  changed the tasks, a collapsed row hides an end — is deselected),
//  `progressPreview` (a progress drag's preview: the bar visual draws it)
//  and `historyState` (the undo / redo state, bound to the chart's
//  editor). `editRules` is core `editRules` per row (D9): what the user
//  may move, resize, edit or link there, with `enableDrag` /
//  `enableResize` (`bindChart`). The tasks themselves are never written
//  here: every change goes through the chart's editor
//  (`editing/gantt-editor.service.ts`), which applies it to the raw input
//  (`[(series)]` or the data source), and `tasks` follows.
//  Nothing in this service touches the DOM.
// ─────────────────────────────────────────────────────────────

import { Injectable, PLATFORM_ID, signal, computed, linkedSignal, inject, untracked } from '@angular/core';
import { isPlatformServer } from '@angular/common';

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
  computeCriticalPath,
  computeRollups,
  dateReadingOf,
  sameDateReading,
  applyRollups,
  rollupSegments,
  createStyleResolver,
  taskOwnStyle,
  editRules,
  selectedArrowVisual,
  buildArrowIndex,
  type ArrowIndex,
  type ArrowVisual,
  type BarSegment,
  type CellEditState,
  type EditRules,
  type GanttHistoryState,
  type LinkMode,
  type LinkPreview,
  type LinkSide,
  type CPMResult,
  type DateReading,
  type GanttRollupInfo,
  type NaturalTimelineRange,
  type ResolvedRollupOptions,
  type ResolvedStyleOptions,
  type SharedTimelineRange,
  type StyleResolver,
  type TimelineRange,
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
  /** `options.enableDrag ?? enableDrag` (the edit rules) */
  readonly enableDrag: () => boolean;
  /** `options.enableResize ?? enableResize` (the edit rules) */
  readonly enableResize: () => boolean;
}

/** A link being drawn (`editing/link.ts`): its source bar and side, how it started, its preview */
export interface GanttLinkState {
  readonly sourceId: string;
  readonly side: LinkSide;
  readonly mode: LinkMode;
  /** Core `LinkSession.hover`'s preview, `null` before the pointer or the keys reach a target */
  readonly preview: LinkPreview | null;
  /**
   * The last pointer position (canvas px; `null` / unset from the keys): where a preview without a
   * target ends when the bars move under it (the canvas draws it from the bars as they are now)
   */
  readonly pointer?: { readonly x: number; readonly y: number } | null | undefined;
}

/** A progress drag's preview (`editing/progress.ts`): the progress its bar draws instead of the task's */
export interface GanttProgressPreview {
  readonly taskId: string;
  readonly progress: number;
}

/** The undo / redo state while the chart keeps no history (editing off, `history: false`, controlled) */
export const EMPTY_HISTORY_STATE: GanttHistoryState = {
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,
  undoCount: 0,
  redoCount: 0,
};

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

/**
 * Viewport width the server renders the horizontal window with (core `computeHorizontalWindow`'s
 * `fallbackWidth`): SSR mounts the header cells, bands and lines around the scroll position instead
 * of the whole timeline. The browser measures the real width after the first render.
 */
const SERVER_VIEWPORT_WIDTH = 1024;

const NO_CRITICAL: ReadonlySet<string> = new Set();
const NO_ROLLUPS: ReadonlyMap<string, GanttRollupInfo> = new Map();
/** Without `rollup.segments`: no bar has child segments */
const NO_SEGMENTS = (): BarSegment[] | null => null;

/** Same dates (by time value), either may be null */
const sameRange = (a: TimelineRange | null | undefined, b: TimelineRange | null | undefined): boolean =>
  a === b || (!!a && !!b && a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime());

/** Same natural range and extent (by date value): a rebuilt timeline with the same own range reports nothing */
const sameNaturalRange = (a: NaturalTimelineRange, b: NaturalTimelineRange): boolean =>
  sameRange(a.range, b.range) && sameRange(a.extent, b.extent);

/** Same shared range and extent (by date value): an equal patch from the sync group rebuilds nothing */
const sameShared = (a: SharedTimelineRange | null, b: SharedTimelineRange | null): boolean =>
  a === b || (!!a && !!b && sameRange(a.range, b.range) && sameRange(a.extent, b.extent));

/** How task dates are read before any options are bound */
const NO_READING: DateReading = { endDateMode: 'exclusive', normalizeDateOnly: true, calendar: null };

/** The config fields the rollups depend on: the rollup options and the date reading (end rule, date-only, calendar) */
interface RollupInput extends DateReading {
  readonly rollup: ResolvedRollupOptions | false;
}

/** Same rollup options, field by field (a callback colour by reference) */
const sameRollup = (a: ResolvedRollupOptions | false, b: ResolvedRollupOptions | false): boolean =>
  a === b ||
  (!!a && !!b && a.progress === b.progress && a.dates === b.dates && a.color === b.color && a.segments === b.segments);

/** The config fields the style resolver depends on */
interface StyleInput {
  readonly styles: ResolvedStyleOptions;
  readonly endDateMode: ResolvedGanttConfig['endDateMode'];
  readonly normalizeDateOnly: boolean;
}

/** Same style layers (each layer by reference): a zoom or a new labels bundle keeps the resolver */
const sameStyles = (a: ResolvedStyleOptions, b: ResolvedStyleOptions): boolean =>
  a === b ||
  (a.task === b.task &&
    a.group === b.group &&
    a.milestone === b.milestone &&
    a.parent === b.parent &&
    a.rule === b.rule &&
    a.levels.length === b.levels.length &&
    a.levels.every((level, i) => level === b.levels[i]));

@Injectable()
export class GanttLayoutService {
  /** Scroll offsets of the timeline viewport (written by the scroll listeners) */
  private readonly scroll = inject(GanttScrollService);
  /** The task being dragged or resized: its row stays mounted */
  private readonly drag = inject(GanttDragService);
  /** Rendering on the server: the horizontal window assumes `SERVER_VIEWPORT_WIDTH` */
  private readonly server = isPlatformServer(inject(PLATFORM_ID));

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

  /** Annotations, font size, loading / error / load state, legend switch, toolbar presence, drag flags */
  bindChart(sources: ChartSources): void {
    this.chartSources.set(sources);
  }

  /** The chart editor's undo / redo state (`GanttEditorService.state`) */
  private readonly historySource = signal<(() => GanttHistoryState) | null>(null);

  /** The undo / redo state `historyState` reads (GantryComponent binds its editor's, once). */
  bindHistory(state: () => GanttHistoryState): void {
    this.historySource.set(state);
  }

  // ══════════════════════════════════════════════════════════
  //  UI state: consumer-seeded, changed by the user
  // ══════════════════════════════════════════════════════════

  /** The consumer's tasks, repaired (`normalizeTasks`) */
  private readonly sourceTasks = computed(() => normalizeTasks(this.tasksSource()?.() ?? []));

  /**
   * Tasks shown: the consumer's, repaired. The chart writes its edits (and `updateTask()` /
   * `appendTasks()`) to the raw input (`[(series)]` or the data source), never here.
   */
  readonly tasks = linkedSignal<GanttTask[]>(() => this.sourceTasks());

  /**
   * Every task id the sources have shown and the ids new in the latest one that start collapsed
   * (core `seedCollapsed`): `task.collapsed`, and with `groupBar.collapsed` every new parent. The
   * option is read when the tasks change, as the Web Component's `setTasks`: turning it on later
   * collapses no parent already seen.
   */
  private readonly collapseSeed = linkedSignal<GanttTask[], CollapseSeed>({
    source: this.sourceTasks,
    computation: (tasks, prev) =>
      seedCollapsed(
        tasks,
        prev?.value.seen,
        untracked(() => this.boundConfig()?.groupBar.collapsed ?? false),
      ),
  });

  /**
   * Collapsed task ids — toggled by the task list, the API and a restored state. A source collapses
   * its `task.collapsed` ids (with `groupBar.collapsed`, its parents too) the chart has never seen;
   * an id seen before keeps the user's expand state, across a new series, a data-source reset or an
   * empty series in between (the Web Component's rule).
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

  /**
   * Width of the chart's main area (px, `.gantry-main`), measured by GantryComponent: the panel's
   * percentage width, the splitter's range, the responsive breakpoint and the toolbar layout.
   * 0 = not measured.
   */
  readonly mainWidth = signal<number>(0);

  /** Task id of the bar under a fine pointer (`null` = none): its grips show in the bar overlay */
  readonly hoveredBarId = signal<string | null>(null);

  /**
   * Task id of the row under a mouse or pen, in either pane (`null` = none): the row hover tint
   * (`rect.gantt-row-hover`, `.gantt-tl-row--hover`). Cleared on leave, scroll and drag start.
   */
  readonly hoveredRowId = signal<string | null>(null);

  /**
   * Range and extent shared by the charts of a sync group (`null` outside a group): the timeline
   * covers the union (`buildTimeline({ shared })`), "fit to screen" fits the shared extent. Written
   * by the chart's sync member; an equal value (by date) changes nothing.
   */
  readonly shared = signal<SharedTimelineRange | null>(null, { equal: sameShared });

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

  // ── Editing (plan §3f): written by the editing services, painted by the canvas, task list, toolbar

  /** The cell being edited (core `reduceCellEdit`), `null` = none (`editing/cell-edit.ts`) */
  readonly cellEdit = signal<CellEditState>(null);

  /** The link being drawn, `null` = none (`editing/link.ts`; the host's `.gantry-linking` class) */
  readonly link = signal<GanttLinkState | null>(null);

  /**
   * Key of the selected dependency arrow (`ArrowLink.key`: Delete removes it), `null` = none. The
   * links drawn changing (`arrowIndex`) deselect it when it is no longer among them: the app changed
   * the tasks, its row was collapsed (as the Web Component's), so a link made again later is not
   * selected.
   */
  readonly selectedLinkKey = linkedSignal<ArrowIndex | null, string | null>({
    source: () => (this.boundConfig() ? this.arrowIndex() : null),
    computation: (index, prev) => {
      const key = prev?.value ?? null;
      return key !== null && index?.links.some(l => l.key === key) ? key : null;
    },
  });

  /** A progress drag's preview, `null` = none (`editing/progress.ts`): the bar visual draws that progress */
  readonly progressPreview = signal<GanttProgressPreview | null>(null);

  /**
   * The undo / redo state (`history-change`'s detail): the toolbar's Undo / Redo and the chart's
   * `canUndo` / `canRedo`. `EMPTY_HISTORY_STATE` while the chart keeps no history.
   */
  readonly historyState = computed<GanttHistoryState>(() => this.historySource()?.() ?? EMPTY_HISTORY_STATE);

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

  /** The resolved options, `null` before any is bound or set (`cfg` throws instead) */
  private readonly boundConfig = (): ResolvedGanttConfig | null => this.configSource()?.() ?? this.config();

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

  /**
   * How task dates are read and measured (core `dateReadingOf`): the column context, rollups and critical
   * path follow it, so a zoom, a theme or a labels change keeps them (the WC's `dateReading` node).
   */
  private readonly dateReading = computed<DateReading | null>(
    () => {
      const c = this.boundConfig();
      return c ? dateReadingOf(c) : null;
    },
    { equal: (a, b) => a === b || (!!a && !!b && sameDateReading(a, b)) },
  );

  /** Values time- and data-dependent cells read (status, predecessors, durations, sort order) */
  readonly columnContext = computed<ColumnContext>(() =>
    buildColumnContext({
      tasks: this.tasks(),
      config: this.dateReading(),
      now: new Date(this.now()),
      locale: (this.i18nSource()?.() ?? this.i18n())?.locale,
    }),
  );

  /** The config fields the rollups depend on (a zoom or a theme change keeps them) */
  private readonly rollupInput = computed<RollupInput>(
    () => {
      const c = this.boundConfig();
      return { rollup: c?.rollup ?? false, ...(c ? dateReadingOf(c) : NO_READING) };
    },
    { equal: (a, b) => sameRollup(a.rollup, b.rollup) && sameDateReading(a, b) },
  );

  /**
   * Rolled-up values of every parent by id (core `computeRollups`: progress, dates, status and
   * colour from the children), empty without `options.rollup`. Statuses are read at `nowDay`, so
   * the rollups are rebuilt once a day, not on every clock tick.
   */
  readonly rollups = computed<ReadonlyMap<string, GanttRollupInfo>>(() => {
    const input = this.rollupInput();
    if (!input.rollup) return NO_ROLLUPS;
    return computeRollups(this.tasks(), input.rollup, { now: this.nowDay(), dates: dateReadingOf(input) });
  });

  /**
   * All rows (DFS flat, including hidden): each rolled-up parent row carries a copy of its task with
   * the rolled-up values (core `applyRollups`, before the sort, so columns sort by them); a sort
   * reorders siblings at every level. Events and `getSelectedTasks()` stay raw (`rollupSource`).
   */
  readonly allRows = computed<GanttFlatRow[]>(() => {
    const rows = applyRollups(
      flattenTree(this.tasks(), this.collapsedIds()),
      this.rollups(),
      this.rollupInput().rollup,
    );
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
      // A sync group's union (null outside a group): same start and px per day, same x for a date
      shared: this.shared(),
    });
  });

  /**
   * The chart's own range and task extent (`TimelineModel.range` / `.extent`, core `timelineRange`):
   * what a sync group member reports, never the shared timeline it draws (no feedback loop).
   * Compared by date, so a timeline rebuilt with the same own range changes nothing.
   */
  readonly naturalRange = computed<NaturalTimelineRange>(
    () => {
      const { range, extent } = this.timeline();
      return { range, extent };
    },
    { equal: sameNaturalRange },
  );

  /** Only these config fields affect the critical path (the config itself changes with the zoom, labels, metrics…) */
  private readonly cpmConfig = computed(
    () => {
      const cfg = this.cfg();
      return { criticalPath: cfg.criticalPath, ...dateReadingOf(cfg) };
    },
    { equal: (a, b) => a.criticalPath === b.criticalPath && sameDateReading(a, b) },
  );

  /** CPM result (critical ids, float), `null` while `options.criticalPath` is off */
  readonly critical = computed<CPMResult | null>(() => {
    const cfg = this.cpmConfig();
    return cfg.criticalPath ? computeCriticalPath(this.tasks(), cfg) : null;
  });

  /** Ids of the tasks on the critical path (empty while it is off) */
  readonly criticalIds = computed<ReadonlySet<string>>(() => this.critical()?.criticalIds ?? NO_CRITICAL);

  /** The config fields the style resolver depends on: `styles` (each layer by reference) and the date reading */
  private readonly styleInput = computed<StyleInput>(
    () => {
      const { styles, endDateMode, normalizeDateOnly } = this.cfg();
      return { styles, endDateMode, normalizeDateOnly };
    },
    {
      equal: (a, b) =>
        sameStyles(a.styles, b.styles) &&
        a.endDateMode === b.endDateMode &&
        a.normalizeDateOnly === b.normalizeDateOnly,
    },
  );

  /**
   * A row's resolved style (core `createStyleResolver`, memoised per row object): `options.styles`
   * by kind, parent and level, the rolled-up colour, `styles.rule`, the task's flat fields and
   * `task.style`. Rebuilt when the styles, the critical path, the rollups or the day change (never
   * on a clock tick, a zoom or a scroll); without any layer a row's style is its task's own. Bars
   * (`computeBarVisual`), custom bars (`ctx.style`), rows, the task list and the tooltip read it.
   */
  readonly rowStyle = computed<StyleResolver>(() => {
    const { styles, endDateMode, normalizeDateOnly } = this.styleInput();
    return createStyleResolver({
      config: { styles, endDateMode, normalizeDateOnly },
      critical: this.criticalIds(),
      rollups: this.rollups(),
      now: this.nowDay(),
    });
  });

  /** Every row by task id, hidden ones included (the children of a collapsed parent: its segments' styles) */
  private readonly allRowsById = computed(() => new Map(this.allRows().map(r => [r.task.id, r])));

  /**
   * Child segments of a bar (core `rollupSegments`, passed to `computeBarVisual`): with
   * `rollup.segments`, a collapsed rolled-up parent's direct children in their own colours, clipped
   * to its bar; `null` for every other row, and always without `rollup.segments`.
   */
  readonly barSegments = computed<(geo: RowGeometry) => BarSegment[] | null>(() => {
    const cfg = this.cfg();
    if (!cfg.rollup || !cfg.rollup.segments) return NO_SEGMENTS;
    const rollups = this.rollups();
    const { toX } = this.timeline();
    const styleOf = this.rowStyle();
    const rowById = this.allRowsById();
    const childStyle = (child: GanttTask) => {
      const row = rowById.get(child.id);
      return row ? styleOf(row) : taskOwnStyle(child);
    };
    return geo => {
      const { row } = geo;
      const info = row.hasChildren && row.isCollapsed ? rollups.get(row.task.id) : undefined;
      if (!info) return null;
      return rollupSegments(info, { toX, cfg, styleOf: childStyle, bar: { x: geo.barX, width: geo.barWidth } });
    };
  });

  /**
   * What the user may change on a row (core `editRules`, D9): move and resize (`enableDrag` /
   * `enableResize`, `draggable`, the bar kind, `rollup.dates`), the progress, links and cells
   * (`editing`), never on an `editable: false` task. Memoised per row object; a new memo starts with
   * the config or the drag flags. The bar visuals, move mode and the edit gestures read it.
   */
  readonly editRules = computed<(row: GanttFlatRow) => EditRules>(() => {
    const config = this.cfg();
    const src = this.chartSources();
    const enableDrag = src?.enableDrag() ?? true;
    const enableResize = src?.enableResize() ?? true;
    const memo = new WeakMap<GanttFlatRow, EditRules>();
    return row => {
      let rules = memo.get(row);
      if (!rules) {
        rules = editRules(row, { config, enableDrag, enableResize });
        memo.set(row, rules);
      }
      return rules;
    };
  });

  /**
   * An arrow as painted: the selected link's (`selectedLinkKey`) with the focus-ring paint and one
   * more px of width (core `selectedArrowVisual`, memoised per visual), any other link's unchanged.
   */
  readonly arrowSelection = computed<(linkKey: string, visual: ArrowVisual) => ArrowVisual>(() => {
    const selected = this.selectedLinkKey();
    if (selected === null) return (_key, visual) => visual;
    const memo = new WeakMap<ArrowVisual, ArrowVisual>();
    return (key, visual) => {
      if (key !== selected) return visual;
      let shown = memo.get(visual);
      if (!shown) {
        shown = selectedArrowVisual(visual);
        memo.set(visual, shown);
      }
      return shown;
    };
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

  /**
   * The dependency links between the rows, indexed by their vertical span (core `buildArrowIndex`):
   * built once per (tasks, geometries); the canvas queries the window's links, the link service
   * hit-tests them, `selectedLinkKey` follows them.
   */
  readonly arrowIndex = computed<ArrowIndex>(() => buildArrowIndex(this.tasks(), this.geometryById()));

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
   * The whole timeline while the viewport is not measured in the browser; on the server, the window
   * of a `SERVER_VIEWPORT_WIDTH` viewport (SSR mounts fewer header cells, bands and lines).
   */
  readonly hWindow = computed<HorizontalWindow>(
    () =>
      computeHorizontalWindow({
        scrollLeft: this.scroll.scrollLeft(),
        viewportWidth: this.viewportWidth(),
        totalWidth: this.timeline().totalWidth,
        quantum: HORIZONTAL_WINDOW_QUANTUM,
        fallbackWidth: this.server ? SERVER_VIEWPORT_WIDTH : undefined,
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
   * (`scrollRequest`, core `fitScrollLeft`). Inside a sync group the tasks of every member fit
   * (`sharedExtent`). Returns the level, or `null` when there is nothing to fit (no task, viewport
   * not measured).
   */
  fitToScreen(): string | null {
    const tl = this.timeline();
    const level = fitZoomLevel({
      levels: this.cfg().zoomLevels,
      extent: tl.sharedExtent ?? tl.extent,
      viewportWidth: this.viewportWidth(),
    });
    if (level === null) return null;
    this.zoomAnchorX.set(null);
    this.level.set(level);
    this.scrollRequest.set('fit');
    return level;
  }
}
