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
 *                                                    │                   └──▶ markers ──▶ layout
 *                                                    └──▶ states         ├──▶ visuals ──▶ arrows
 *                                                                        ├──▶ horizontal
 *                                                                        └──▶ tasklist
 *   graph ──▶ region effects (engine/render.ts) ──▶ layers/* ──▶ DOM
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
  bottomScale,
  taskSpan,
  seedCollapsed,
  CLOCK_INTERVAL,
  type DragTiming,
  type GanttTask,
  type ResolvedGanttConfig,
  type TimelineModel,
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
import { buildSkeleton, type Skeleton } from '../layers/skeleton';
import { createFocusTracker } from '../layers/focus-restore';
import type { Emit, HostApi, LayerContext } from '../layers/context';
import { createInputs, type GanttLoadMoreState, type Inputs, type SortState } from './inputs';
import { nodeFactory, type Runs } from './graph/node';
import { chromeGraph, themeEffects, type ChromeGraph } from './graph/chrome';
import { configGraph, type ConfigGraph } from './graph/config';
import { rowsGraph, type RowsGraph } from './graph/rows';
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

/**
 * The nodes every layer-specific graph module (`visuals`, `arrows`, `horizontal`, `tasklist`)
 * is built from, plus read-only views of the UI state painters read.
 */
export interface CoreGraph
  extends ChromeGraph, ConfigGraph, RowsGraph, TimelineGraph, WindowsGraph, MarkersGraph, LayoutGraph {
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
  /** Sets the tasks; `task.collapsed` seeds the collapsed state of ids not seen before. */
  setTasks(tasks: GanttTask[]): void;
  /**
   * Sets (or clears) the data source. While connected the engine mirrors it (items, footer state,
   * failures reported once through `load-error` and the alert region) and starts it per
   * `initialPage`; a disconnected element unsubscribes and catches up when it reconnects.
   */
  setDataSource(ds: GanttDataSource | null): void;
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
  const timeline = timelineGraph(inputs, chrome, config, rows, node);
  const windows = windowsGraph(inputs, config, rows, timeline, node);
  const markers = markersGraph(inputs, { ...chrome, ...config, ...timeline }, node);
  const base = { ...chrome, ...config, ...rows, ...timeline, ...windows, ...markers };
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
  const updateTask = (id: string, patch: Partial<GanttTask>): void => {
    inputs.tasksIn.set(graph.tasks.peek().map(t => (t.id === id ? { ...t, ...patch } : t)));
  };
  const drag = createDrag({
    preview: inputs.dragPreview,
    timing: () => dragTiming(graph.timeline.peek(), graph.config.peek()),
    onDragged: e => {
      updateTask(e.taskId, { start: e.newStart, end: e.newEnd });
      hooks.emit('task-dragged', e);
    },
    onResized: e => {
      updateTask(e.taskId, { start: e.newStart, end: e.newEnd });
      hooks.emit('task-resized', e);
    },
  });
  const selection = createSelection(inputs.selection, e => hooks.emit('selection-change', e));
  const announce = createLiveAnnouncer(dom.srLive);
  const ctx: LayerContext = {
    host,
    shadow,
    inputs,
    graph,
    columns,
    dom,
    drag,
    selection,
    focus: createFocusTracker(shadow),
    emit: hooks.emit,
    saveState: hooks.saveState,
    announce,
    setBusy: hooks.setBusy,
    rowClick(row, event) {
      const ids = graph.visibleRows.peek().map(r => r.task.id);
      selection.handleClick(row.task.id, event, ids, graph.config.peek().selection);
      hooks.emit('row-click', row);
    },
  };
  const layers = createLayers(ctx);

  /** Task ids seen so far: `task.collapsed` seeds the collapsed state of new ids only (core `seedCollapsed`) */
  let seenIds: ReadonlySet<string> | undefined;
  const setTasks = (tasks: GanttTask[]): void => {
    const seed = seedCollapsed(tasks, seenIds);
    seenIds = seed.seen;
    if (seed.collapse.length) inputs.collapsedIds.update(ids => new Set([...ids, ...seed.collapse]));
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

  /** Writes the panes' sizes into the engine (connect and ResizeObserver only, D9). */
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
  };

  /** What one connection owns besides the region effects (call inside its owner). */
  const connected = (signal: AbortSignal): void => {
    // Interaction: every listener goes when `signal` aborts
    bindScroll(dom.panel, dom.viewport, inputs, signal);
    const hasRendered = () => layers['scroll-commands'].hasRendered();
    bindSplitter(ctx, { hasRendered, signal });
    bindCanvasPointer(ctx, { tooltip: layers.tooltip, hasRendered, signal });
    bindTooltipTriggers(ctx, { tooltip: layers.tooltip, hasRendered, signal });
    bindKeyboard(ctx, signal);
    bindFocusTracking(ctx, signal);

    // Layout is read here and in the ResizeObserver, never during a render (D9). The first render
    // needs the host width (panel width), then the timeline viewport beside that panel.
    inputs.mainW.set(dom.main.clientWidth);
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

    // Screen-reader announcements (selection count, zoom level) from the state found now on; the
    // load state is announced by the data-source subscription below (`syncDataSource`)
    announceEffects(inputs, graph, announce);
    onCleanup(() => announce.cancel());

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

  return {
    inputs,
    graph,
    columns,
    dom,
    drag,
    selection,
    ctx,
    layers,
    runs,
    regionRuns,
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
        themeEffects(inputs, chrome, themeSheet);
        registerRegions(layers, scheduler, regionRuns);
        connected(connection.signal);
      });
    },
    disconnect() {
      stop();
      disconnectLayers(layers);
      drag.cancel();
    },
    adopt,
    flushSync() {
      frame?.flushSync();
    },
    setTasks,
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
}

/** Scale of the current timeline for a drag that starts now. */
function dragTiming(tl: TimelineModel, cfg: ResolvedGanttConfig): DragTiming {
  return {
    pxPerDay: tl.pxPerDay,
    toX: tl.toX,
    span: (start, end) => taskSpan({ start, end }, cfg),
    snap: bottomScale(cfg.scales).unit === 'hour' ? 'hour' : 'day',
  };
}
