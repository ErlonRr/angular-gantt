/**
 * @file engine.ts
 * The `<gantry-element>` engine: input signals, the graph that derives the render model from
 * them, the persistent DOM, the layers that paint it, and everything that lives while the element
 * is connected.
 *
 * One owner per connection: `connect()` creates a reactive owner and an `AbortController`, and
 * everything the connection starts belongs to them — the theme sheet effects and the colour-scheme
 * listener, one region effect per layer on a new frame scheduler, every DOM listener (registered
 * with the controller's `signal`), the ResizeObserver, the clock, the live-region announcements
 * (`announce.ts`) and the data-source subscription. `disconnect()` disposes the owner (which
 * aborts the controller), cancels the layers' pending work (timers, gestures) and drops a pending
 * announcement. Nothing outlives a disconnect but the element's own state, so a reconnect starts
 * from the same inputs.
 *
 *   inputs ──▶ chrome (i18n, theme, metrics) ──▶ config ──▶ rows ──▶ timeline ──▶ windows
 *                                                    │        └──▶ styles └──▶ markers ──▶ layout
 *                                                    └──▶ states         ├──▶ visuals ──▶ arrows
 *                                                                        ├──▶ horizontal
 *                                                                        └──▶ tasklist
 *   graph ──▶ region effects (engine/render.ts) ──▶ layers/* ──▶ DOM
 *
 * Outside the flush: the sync-group link (`layers/sync.ts`) joins `syncGroup` from an effect of the
 * connection's owner; the narrow-width switch (`layers/responsive.ts`) hears every measured width.
 * Both write inputs only. Rolled-up parent rows (`graph/rows.ts`) leave through the events with
 * their raw task (`rowEvent`).
 *
 * Every change to the tasks — a pointer drop included — goes through the change pipeline
 * (`edit.ts`, `ctx.edit.commit`): validation, the cancelable `before-change`, the apply to the raw
 * input (or `dataSource.patch()`), the history and the events. `updateTask()` / `appendTasks()`
 * stay silent data writes. The link, progress-grip and cell-edit interactions
 * (`interaction/{link,progress,cell-edit}.ts`) live as long as the element; a disconnect cancels them.
 * While connected, an effect deselects the selected link once it is no longer drawn (the app
 * changed the tasks, a collapsed row hides an end), so a link made again later is not selected.
 *
 * Exports (Phase 12): `exportChart()` reads the chart at once (`captureExport`: the export draws
 * it as it was when the method was called), loads `export/run.ts` on first use (a lazy chunk; one
 * import shared by every call, so calls run in order and one print locks out the next; a failed
 * load is tried again by the next call) and runs the export on that capture; the toolbar's
 * `ctx.runExport` reports a failure in the alert region instead of rejecting.
 */

import {
  batch,
  createFrameScheduler,
  createRoot,
  effect,
  onCleanup,
  runWithOwner,
  untracked,
  type FrameScheduler,
  type Owner,
  type ReadonlySignal,
} from '../reactive';
import {
  announceLoadState,
  dragChange,
  editTiming,
  rollupSource,
  seedCollapsed,
  CLOCK_INTERVAL,
  type GanttFlatRow,
  type GanttTask,
  type TaskDragEvent,
  type TaskResizeEvent,
} from '@gantryjs/core';
import { createThemeSheet, type ThemeSheet } from '../styles/theme-sheet';
import { BASE_CSS, getBaseSheet } from '../styles/base';
import { applySheet, pruneSheets } from '../dom/sheet';
import type { GanttDataSource } from '../datasource/gantt-datasource';
import { bindScroll } from '../interaction/scroll';
import { bindSplitter } from '../interaction/splitter';
import { bindCanvasPointer } from '../interaction/canvas-pointer';
import { bindFocusTracking, bindKeyboard } from '../interaction/keyboard';
import { bindTooltipTriggers } from '../interaction/tooltip-triggers';
import { createColumns, type Columns } from '../interaction/columns';
import { createDrag, type Drag } from '../interaction/drag';
import { createSelection, type Selection } from '../interaction/selection';
import { createLink, type LinkApi } from '../interaction/link';
import { createProgressDrag, type ProgressDrag } from '../interaction/progress';
import { createCellEdit, type CellEditApi } from '../interaction/cell-edit';
import { buildSkeleton, type Skeleton } from '../layers/skeleton';
import { createFocusTracker } from '../layers/focus-restore';
import type { Emit, HostApi, LayerContext } from '../layers/context';
import { createInputs, type GanttLoadMoreState, type Inputs, type SortState } from './inputs';
import { nodeFactory, type Runs } from './graph/node';
import { chromeGraph, themeEffects, type ChromeGraph } from './graph/chrome';
import { configGraph, type ConfigGraph } from './graph/config';
import { rowsGraph, type RowsGraph } from './graph/rows';
import { stylesGraph, type StylesGraph } from './graph/styles';
import { timelineGraph, type TimelineGraph } from './graph/timeline';
import { windowsGraph, type WindowsGraph } from './graph/windows';
import { markersGraph, type MarkersGraph } from './graph/markers';
import { layoutGraph, type LayoutGraph } from './graph/layout';
import { statesGraph, type StatesGraph } from './graph/states';
import { visualsGraph, type VisualsGraph } from './graph/visuals';
import { arrowsGraph, type ArrowsGraph } from './graph/arrows';
import { horizontalGraph, type HorizontalGraph } from './graph/horizontal';
import { tasklistGraph, type TasklistGraph } from './graph/tasklist';
import { createLayers, disconnectLayers, registerRegions, REGIONS, type Layers, type Region } from './render';
import { announceEffects, createLiveAnnouncer } from './announce';
import { createEditor, type Editor } from './edit';
import type { ExportRequest } from '../export/run';
import type * as ExportCode from '../export/run';
import { captureExport } from './export-capture';

/**
 * The nodes every layer-specific graph module (`visuals`, `arrows`, `horizontal`, `tasklist`)
 * is built from, plus read-only views of the UI state painters read.
 */
export interface CoreGraph
  extends ChromeGraph, ConfigGraph, RowsGraph, StylesGraph, TimelineGraph, WindowsGraph, MarkersGraph, LayoutGraph {
  readonly sort: ReadonlySignal<SortState | null>;
  /** Panel width the user chose (`null` = from `panel.width`) */
  readonly panelW: ReadonlySignal<number | null>;
}

/** Every node of the render model. */
export interface Graph extends CoreGraph, VisualsGraph, ArrowsGraph, HorizontalGraph, TasklistGraph, StatesGraph {}

/** What the engine needs from the element. */
export interface EngineHooks {
  readonly emit: Emit;
  /** Debounced `state-change` + persistence */
  readonly saveState: () => void;
  /** The host region is busy or not (`aria-busy`; the host region paints it from `chartState.busy`) */
  readonly setBusy: (busy: boolean) => void;
}

export interface Engine {
  readonly inputs: Inputs;
  readonly graph: Graph;
  readonly columns: Columns;
  /** Persistent DOM: shadow tree and timeline SVG layers */
  readonly dom: Skeleton;
  readonly drag: Drag;
  readonly selection: Selection;
  /** The change pipeline and the history (`ctx.edit`) */
  readonly edit: Editor;
  /** What the layers (and the interaction handlers) are built with */
  readonly ctx: LayerContext;
  readonly layers: Layers;
  /** Recompute count per graph node name */
  readonly runs: Runs;
  /** Run count per region effect (`REGIONS`) */
  readonly regionRuns: Runs;
  /**
   * Starts what lives while connected, in one owner: the theme sheet (created for the element's
   * document, kept across reconnects) and its effects, one region effect per layer on a new
   * frame scheduler, the interaction listeners, the pane measurements (now and on resize), the
   * clock and the data-source subscription. Everything is disposed by `disconnect()`.
   */
  connect(): void;
  disconnect(): void;
  /**
   * The element moved to another document: stylesheets are constructed for one document, so the
   * shared base sheet of the new document is adopted and the theme sheet is rebuilt (on the next
   * `connect()`). No-op while the document is unchanged.
   */
  adopt(): void;
  /** Runs the queued frame work now (no-op while disconnected). */
  flushSync(): void;
  /**
   * Sets the tasks; `task.collapsed` (and `groupBar.collapsed` for the ids with children) seeds the
   * collapsed state of ids not seen before (core `seedCollapsed`).
   */
  setTasks(tasks: GanttTask[]): void;
  /**
   * The options were assigned: when `groupBar.collapsed` is on now but was off when tasks were
   * seeded, and nothing has been painted yet, the groups of those tasks collapse as if the tasks
   * had been set after the options (the framework wrappers and an upgrading element assign `tasks`
   * before `options`). Once a model is painted only new ids are seeded, by `setTasks`.
   */
  seedCollapsedGroups(): void;
  /**
   * Sets (or clears) the data source. While connected the engine mirrors it (items, footer state,
   * failures reported once through `load-error` and the alert region) and starts it per
   * `initialPage`; a disconnected element unsubscribes and catches up when it reconnects.
   */
  setDataSource(ds: GanttDataSource | null): void;
  /**
   * Runs an export (plan §3c) of the chart as it is now (`captureExport`) with the export code,
   * loaded on first use (`import('../export/run')`, a lazy chunk): the SVG or CSV text, the PNG
   * `Blob`, or whether a download / print ran. Rejects when the export code can't be loaded.
   */
  exportChart(request: ExportRequest): Promise<string | Blob | boolean>;
}

export function createEngine(host: HostApi, shadow: ShadowRoot, hooks: EngineHooks): Engine {
  const runs: Runs = {};
  const regionRuns: Runs = {};
  const node = nodeFactory(runs);
  const inputs = createInputs();
  const chrome = chromeGraph(inputs, node);
  const columns = createColumns(inputs.optionsIn, inputs.columnsIn, chrome.i18n);
  const config = configGraph(inputs, chrome, node);
  const rows = rowsGraph(inputs, chrome, config, columns, node);
  const styles = stylesGraph({ ...config, ...rows }, node);
  const timeline = timelineGraph(inputs, chrome, config, rows, node);
  const windows = windowsGraph(inputs, config, rows, timeline, node);
  const markers = markersGraph(inputs, { ...chrome, ...config, ...timeline }, node);
  const base = { ...chrome, ...config, ...rows, ...styles, ...timeline, ...windows, ...markers };
  const core: CoreGraph = { ...base, ...layoutGraph(inputs, base, node), sort: inputs.sort, panelW: inputs.panelW };
  const visuals = { ...core, ...visualsGraph(inputs, core, node) };
  const graph: Graph = {
    ...visuals,
    ...arrowsGraph(inputs, visuals, node),
    ...horizontalGraph(inputs, core, node),
    ...tasklistGraph(inputs, core, columns, node),
    ...statesGraph(inputs, core, node),
  };

  const dom = buildSkeleton(shadow);
  const announce = createLiveAnnouncer(dom.srLive);
  /**
   * Every event the layers and interactions fire: a row leaves with its raw task, never a
   * rolled-up parent's copy (the events and `getSelectedTasks()` stay raw, core `rollupSource`).
   */
  const emit: Emit = (type, detail) =>
    hooks.emit(
      type,
      (type === 'row-click' || type === 'row-dblclick' ? rowEvent(detail as GanttFlatRow) : detail) as typeof detail,
    );
  const edit = createEditor({
    inputs,
    graph,
    columns,
    emit,
    // Nothing is announced before the first render (the baseline)
    announce: text => {
      if (text && layers['scroll-commands'].hasRendered()) announce.say(text);
    },
  });
  /** A pointer drop: the change of the raw task (undo restores the app's values) through the pipeline */
  const dropped = (e: TaskDragEvent | TaskResizeEvent, source: 'drag' | 'resize'): void => {
    const task = edit.rawTask(e.taskId) ?? graph.tasks.peek().find(t => t.id === e.taskId);
    if (task) edit.commit(dragChange(e, task, source, graph.config.peek()));
  };
  const drag = createDrag({
    preview: inputs.dragPreview,
    timing: () => editTiming(graph.timeline.peek(), graph.config.peek()),
    onDragged: e => dropped(e, 'drag'),
    onResized: e => dropped(e, 'resize'),
  });
  const selection = createSelection(inputs.selection, e => hooks.emit('selection-change', e));
  /** The export code (`export/run.ts`, a lazy chunk): one import for every call, dropped when it fails */
  let exportCode: Promise<typeof ExportCode> | null = null;
  /** An export of the chart as it is now, by the export code loaded on first use */
  const exportChart = (request: ExportRequest) => {
    const snap = captureExport(engine);
    exportCode ??= import('../export/run').catch((error: unknown) => {
      exportCode = null;
      throw error;
    });
    return exportCode.then(m => m.runExport(engine, request, snap));
  };
  // The interactions below are built from the context (filled in right after it)
  const late: { link?: LinkApi; progress?: ProgressDrag; cells?: CellEditApi } = {};
  const ctx: LayerContext = {
    host,
    shadow,
    inputs,
    graph,
    columns,
    dom,
    drag,
    selection,
    edit,
    get link() {
      return late.link!;
    },
    get progress() {
      return late.progress!;
    },
    get cells() {
      return late.cells!;
    },
    focus: createFocusTracker(shadow),
    emit,
    saveState: hooks.saveState,
    announce,
    setBusy: hooks.setBusy,
    renderNow() {
      frame?.flushSync();
    },
    rowClick(row, event) {
      const ids = graph.visibleRows.peek().map(r => r.task.id);
      selection.handleClick(row.task.id, event, ids, graph.config.peek().selection);
      emit('row-click', row);
    },
    // The layer exists once `layers` is built (only called from event handlers)
    sync: { reportPanel: px => layers.sync.reportPanel(px) },
    // The toolbar's Export menu: a failure goes to the alert region (D9), never to the caller
    runExport: (format, trigger) =>
      exportChart(format === 'print' ? { kind: 'print', trigger } : { kind: 'download', format, trigger }).then(
        ran => ran === true,
        (error: unknown) => {
          const { labels } = graph.i18n.peek();
          const what = { svg: labels.exportSvg, png: labels.exportPng, csv: labels.exportCsv };
          dom.srAlert.textContent =
            format === 'print' ? labels.announcePrintFailed : labels.announceExportFailed(what[format]);
          console.error('[gantry] export failed:', error);
          return false;
        },
      ),
  };
  late.link = createLink(ctx);
  late.progress = createProgressDrag(ctx);
  late.cells = createCellEdit(ctx);
  const layers = createLayers(ctx);

  /** `groupBar.collapsed` of the options (`false` while they are invalid: the render reports them) */
  const collapseGroups = (): boolean => {
    try {
      return graph.config.peek().groupBar.collapsed;
    } catch {
      return false;
    }
  };
  /** Collapses the ids of `tasks` that start collapsed (core `seedCollapsed`); returns the ids seen */
  const seed = (tasks: GanttTask[], seen: ReadonlySet<string> | undefined, groups: boolean): ReadonlySet<string> => {
    const { seen: next, collapse } = seedCollapsed(tasks, seen, groups);
    if (collapse.length) inputs.collapsedIds.update(ids => new Set([...ids, ...collapse]));
    return next;
  };
  /** Task ids seen so far: `task.collapsed` / `groupBar.collapsed` seed the collapsed state of new ids only */
  let seenIds: ReadonlySet<string> | undefined;
  /** Some tasks were seeded while `groupBar.collapsed` was off (see `seedCollapsedGroups`) */
  let seededWithoutGroups = false;
  const setTasks = (tasks: GanttTask[]): void => {
    const groups = collapseGroups();
    seenIds = seed(tasks, seenIds, groups);
    if (!groups && tasks.length) seededWithoutGroups = true;
    inputs.tasksIn.set(tasks);
  };

  /** Last data-source failure reported through `load-error` */
  let reportedLoadError: unknown = null;
  /** The chart shows its error state now (the states region's `role=alert` box); `false` while the options are invalid */
  const errorStateShown = (): boolean => {
    try {
      return graph.chartState.peek().kind === 'error';
    } catch {
      return false;
    }
  };
  /**
   * Copy the loaded items and the footer state; announce the load-state change (previous → next
   * snapshot, core `announceLoadState`) unless `quiet` (the catch-up when the element connects or
   * the source is set: the baseline); report each new failure once (event + alert region).
   */
  const syncDataSource = (ds: GanttDataSource, quiet = false): void => {
    setTasks(ds.items);
    const prev = inputs.loadState.peek();
    const next: GanttLoadMoreState = {
      isLoading: ds.isLoading,
      hasMore: ds.hasMore,
      loadedCount: ds.loadedCount,
      error: ds.error !== null,
    };
    inputs.loadState.set(next);
    const said = quiet ? null : announceLoadState(prev, next, graph.i18n.peek().labels);
    if (said !== null) announce.say(said);
    if (ds.error === null) {
      if (reportedLoadError !== null) dom.srAlert.textContent = '';
      reportedLoadError = null;
    } else if (ds.error !== reportedLoadError) {
      reportedLoadError = ds.error;
      // The failure is read at once by the assertive region; a pending "Loading…" is stale now
      announce.cancel();
      // ...unless the chart shows its error state, whose `role=alert` box reads it (as Angular)
      dom.srAlert.textContent = errorStateShown() ? '' : graph.i18n.peek().labels.loadError;
      hooks.emit('load-error', { error: ds.error, page: ds.nextPage });
    }
  };
  /** Catch up with the data source and start it per `initialPage` (on connect and when it is set). */
  const startDataSource = (ds: GanttDataSource): void => {
    syncDataSource(ds, true);
    if (ds.loadedCount === 0 && ds.autoStart) void ds.loadNext();
  };

  /**
   * Writes the panes' sizes into the engine (connect and ResizeObserver only, D9), then hands the
   * chart width to the narrow-width switch (it may force a view: the observer measures again).
   */
  const measure = (): void => {
    const { main, viewport, panel } = dom;
    batch(() => {
      inputs.mainW.set(main.clientWidth);
      inputs.canvasW.set(viewport.clientWidth);
      inputs.canvasH.set(viewport.clientHeight || panel.clientHeight);
      inputs.scrollbarY.set(viewport.offsetWidth - viewport.clientWidth);
      inputs.scrollbarX.set({
        panel: panel.offsetHeight - panel.clientHeight,
        canvas: viewport.offsetHeight - viewport.clientHeight,
      });
    });
    layers.responsive.onWidth(inputs.mainW.peek());
  };

  /** What one connection owns besides the region effects (call inside its owner). */
  const connected = (signal: AbortSignal, scheduler: FrameScheduler<Region>): void => {
    // Interaction: every listener goes when `signal` aborts
    bindScroll(dom.panel, dom.viewport, inputs, signal);
    const hasRendered = () => layers['scroll-commands'].hasRendered();
    bindSplitter(ctx, { hasRendered, signal });
    bindCanvasPointer(ctx, { tooltip: layers.tooltip, hasRendered, signal });
    // The open tooltip's refresh runs once the frame painted its bar (after the scroll commands)
    const afterPaint = (run: () => void) => scheduler.schedule(run, 'focus-restore');
    bindTooltipTriggers(ctx, { tooltip: layers.tooltip, hasRendered, signal, afterPaint });
    bindKeyboard(ctx, signal);
    bindFocusTracking(ctx, signal);

    // Layout is read here and in the ResizeObserver, never during a render (D9). The first render
    // needs the host width (narrow view, panel width), then the timeline viewport beside that panel.
    inputs.mainW.set(dom.main.clientWidth);
    layers.responsive.onWidth(inputs.mainW.peek());
    try {
      layers.host.panes();
    } catch {
      // invalid options: the render reports them
    }
    measure();
    // The observer of the element's own window (it may have moved into another document)
    const observer = new (shadow.ownerDocument.defaultView?.ResizeObserver ?? ResizeObserver)(measure);
    for (const el of [dom.main, dom.viewport, dom.panel]) observer.observe(el);
    onCleanup(() => observer.disconnect());

    // Keep "today" fresh in long-lived sessions
    const clock = setInterval(() => inputs.nowTick.set(new Date()), CLOCK_INTERVAL);
    onCleanup(() => clearInterval(clock));

    // The sync group: joined while connected, again whenever `syncGroup` changes (`null` leaves).
    // Before the announcements: a level the group applies on joining is not announced. Effects the
    // sync layer creates in `connect()` belong to this effect (disposed on a change or disconnect).
    effect(() => {
      const group = inputs.syncGroup();
      untracked(() => layers.sync.connect(group));
    });
    onCleanup(() => layers.sync.disconnect());

    // Screen-reader announcements (selection count, zoom level) from the first render on; the
    // load state is announced by the data-source subscription below (`syncDataSource`)
    announceEffects(inputs, graph, announce, level => layers.sync.takeGroupLevel(level), hasRendered);
    onCleanup(() => announce.cancel());

    // The selected link (Delete removes it) is deselected once it is no longer drawn: the app
    // changed the tasks, its row was collapsed. The arrows are read only while one is selected.
    effect(() => {
      const key = inputs.selectedLinkKey();
      if (key === null) return;
      let links: readonly { readonly key: string }[];
      try {
        links = graph.arrowIndex().links;
      } catch {
        return; // invalid options: the render reports them
      }
      if (!links.some(l => l.key === key)) untracked(() => ctx.link.deselect());
    });

    // Mirror the data source while connected (a new one replaces the old subscription)
    effect(() => {
      const ds = inputs.dataSource();
      if (!ds) return;
      onCleanup(ds.subscribe(() => syncDataSource(ds)));
      untracked(() => startDataSource(ds));
    });
  };

  let sheet: ThemeSheet | undefined;
  /** Document the stylesheets were constructed for */
  let sheetDoc = shadow.ownerDocument;
  let owner: Owner | null = null;
  let frame: FrameScheduler<Region> | null = null;

  const stop = (): void => {
    owner?.dispose();
    frame?.dispose();
    owner = null;
    frame = null;
  };

  const adopt = (): void => {
    const doc = shadow.ownerDocument;
    if (doc === sheetDoc) return;
    const previousBase = getBaseSheet(sheetDoc);
    sheetDoc = doc;
    // Sheets constructed for the previous document can't stay adopted here
    pruneSheets(shadow, ...(previousBase ? [previousBase] : []));
    sheet?.destroy();
    sheet = undefined;
    applySheet(shadow, getBaseSheet(doc), BASE_CSS);
  };

  const engine: Engine = {
    inputs,
    graph,
    columns,
    dom,
    drag,
    selection,
    edit,
    ctx,
    layers,
    runs,
    regionRuns,
    exportChart,
    connect() {
      stop();
      adopt();
      // Created once connected: without constructable stylesheets it falls back to host styles
      const themeSheet = (sheet ??= createThemeSheet(shadow));
      const scheduler = (frame = createFrameScheduler({ priorities: REGIONS }));
      // A root: the connection may start inside an effect (an event handler appending the chart)
      const scope = (owner = createRoot());
      const connection = new AbortController();
      runWithOwner(scope, () => {
        onCleanup(() => connection.abort());
        themeEffects(inputs, chrome, themeSheet, graph.layoutCss);
        registerRegions(layers, scheduler, regionRuns);
        connected(connection.signal, scheduler);
      });
    },
    disconnect() {
      stop();
      disconnectLayers(layers);
      drag.cancel();
      ctx.link.cancel(true);
      ctx.progress.cancel();
      ctx.cells.cancel();
    },
    adopt,
    flushSync() {
      frame?.flushSync();
    },
    setTasks,
    seedCollapsedGroups() {
      if (!seededWithoutGroups || layers['scroll-commands'].hasRendered() || !collapseGroups()) return;
      seededWithoutGroups = false;
      seed(inputs.tasksIn.peek(), undefined, true);
    },
    setDataSource(ds) {
      const same = ds === inputs.dataSource.peek();
      reportedLoadError = null;
      dom.srAlert.textContent = '';
      if (!ds) inputs.loadState.set(null);
      // A new source starts through the connection's effect; the same one assigned again catches up now
      inputs.dataSource.set(ds);
      if (ds && same && owner) startDataSource(ds);
    },
  };
  return engine;
}

/** A row as the events carry it: a rolled-up parent's row with its raw task (core `rollupSource`). */
function rowEvent(row: GanttFlatRow): GanttFlatRow {
  const task = rollupSource(row.task);
  return task === row.task ? row : { ...row, task };
}
