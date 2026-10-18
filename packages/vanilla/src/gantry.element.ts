/**
 * @file gantry.element.ts
 * Root Web Component (<gantry-element>): properties, attributes and interaction write the
 * engine's input signals (`engine/`); one region effect per layer (`engine/render.ts`,
 * `layers/*`) paints the model the graph derives, once per frame, in a fixed order.
 *
 * Layout:
 * ┌──────────────────────────────────────────────────────────────┐
 * │  toolbar                                (options.toolbar)    │
 * ├────────────────┬─┬───────────────────────────────────────────┤
 * │  task list     │s│  timeline viewport: scroll X+Y            │
 * │  (scrolls X;   │p│    ├ header tiers (sticky top)            │
 * │   Y mirrored)  │l│    └ canvas (virtualised SVG rows)        │
 * └────────────────┴─┴───────────────────────────────────────────┘
 * Views: 'split' (both), 'table' (task list only), 'chart' (timeline only).
 *
 * Properties (`engine/props.ts`): one table names every settable property, its default, its
 * attribute and how the attribute parses; each accessor below is one line calling `#set`.
 * Assigning `undefined` restores the default, and properties set on the element before it was
 * defined (an un-upgraded element) are re-applied through the setters when it upgrades.
 *
 * Lifecycle: everything that lives while the element is connected (effects, listeners, the
 * ResizeObserver, the clock, the data-source subscription) belongs to one owner per connection
 * (`engine.connect()`), disposed when it disconnects. A move inside the document
 * (`moveBefore()`, `connectedMoveCallback`) keeps it all: scroll, selection and focus survive.
 * A move to another document re-adopts the stylesheets built for that document.
 *
 * Measurements (D9): sizes are read only in the ResizeObserver callback (and once when
 * connected), scroll offsets only in the scroll handlers; they reach the graph as input signals.
 *
 * Strict CSP and Trusted Types (D16): the shadow tree is built with `h()` / `s()`, its CSS is a
 * shared constructable sheet plus a per-instance theme sheet (`styles/base.ts`,
 * `styles/theme-sheet.ts`), every style is a CSSOM write, and the host gets no `style` attribute.
 *
 * Accessibility (D15): the host is a `region` named by `labels.ariaChart` and exposes the custom
 * states `dark`, `dragging` and `loading` (`gantry-element:state(dark)`), all through
 * `ElementInternals`, so it carries no attribute of ours; an engine without ARIA on
 * `ElementInternals` gets `role` / `aria-label` host attributes when the element connects. The
 * host is not a tab stop: the shadow root delegates focus to the internal ones (toolbar, task
 * list, splitter, timeline viewport; see `layers/skeleton.ts`), and `.gantt-sr-live` announces
 * selection and load-state changes (`engine/announce.ts`).
 */

import {
  type GanttTask,
  type GanttOptions,
  type GanttAnnotation,
  type GanttThemeOverrides,
  type GanttState,
  type GanttView,
  type ViewMode,
  zoomStep,
  flattenTree,
  type BarVisual,
  readStoredState,
  writeStoredState,
  normalizeState,
  viewFromOptions,
  viewFromState,
  initialScrollChanged,
  STATE_SAVE_DELAY,
} from '@gantryjs/core';
import { createRoot, effect, runWithOwner, untracked, type WritableSignal } from './reactive';
import { setAttr } from './dom/patch';
import { createEngine, type Engine } from './engine/engine';
import type { Inputs } from './engine/inputs';
import { registerEngine } from './engine/registry';
import {
  OBSERVED_ATTRIBUTES,
  PROPERTY_TABLE,
  VIEW_MODE_ATTR,
  orDefault,
  propertyOfAttribute,
  type PropertyName,
} from './engine/props';
import { scrollToRow, scrollToX } from './interaction/scroll';
import { GanttDataSource } from './datasource/gantt-datasource';
import type {
  GanttBarRenderer,
  VanillaColumnDef,
  GanttDataSourceConfig,
  GantryEventDetailMap,
  GantryEventMap,
  GantryProperties,
} from './types';

/** Persisted UI state lives in localStorage; unavailable (SSR, blocked storage) → not persisted. */
const storage = () => (typeof window === 'undefined' ? null : window.localStorage);

// Typed event listener overloads (`el.addEventListener('task-dragged', e => e.detail.taskId)`):
// interface + class merging is the standard way to type a custom element's events
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface GantryElement {
  addEventListener<K extends keyof GantryEventMap>(
    type: K,
    listener: (this: GantryElement, ev: GantryEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: GantryElement, ev: HTMLElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof GantryEventMap>(
    type: K,
    listener: (this: GantryElement, ev: GantryEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: GantryElement, ev: HTMLElementEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

// Allow importing (not defining) the element during SSR, where HTMLElement doesn't exist
const BaseElement: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;

/** Public getters without a setter (`setViewMode()` / `setView()` change them; `criticalIds` is derived). */
const READ_ONLY_PROPERTIES = ['viewMode', 'view', 'criticalIds'] as const;

/** The element's `ElementInternals`, or `null` where the engine has none (or they are taken). */
function attachInternalsOf(el: HTMLElement): ElementInternals | null {
  if (typeof el.attachInternals !== 'function') return null;
  try {
    return el.attachInternals();
  } catch {
    return null;
  }
}

/**
 * Sets custom states (`:state(name)`) on `states`; a no-op without `CustomStateSet`. Chromium
 * 90–124 only takes the legacy `--name` form (`:--name`).
 */
function stateSetter(states: CustomStateSet | null): (name: string, on: boolean) => void {
  return (name, on) => {
    if (!states) return;
    if (!on) {
      states.delete(name);
      states.delete(`--${name}`);
      return;
    }
    try {
      states.add(name);
    } catch {
      try {
        states.add(`--${name}`);
      } catch {
        // custom states unsupported
      }
    }
  };
}

// The JSDoc below is the source of the Custom Elements Manifest (`custom-elements.json`, written by
// `pnpm cem`, checked by `pnpm cem:check`): `__tests__/manifest.test.ts` compares its attributes,
// events, parts, states and CSS properties with `engine/props.ts`, `GANTRY_EVENTS` and
// `themeToCss()`. Accessors with an attribute also carry `@attr` (links attribute ↔ property).
/**
 * `<gantry-element>`: an interactive Gantt chart (task list, timeline, dependencies, critical
 * path, drag and resize, lazy paging, theming, i18n). Set `tasks` and `options` as properties;
 * every `GanttOptions` field behaves as in the other Gantry bindings.
 *
 * @tagname gantry-element
 *
 * @attr {boolean | 'auto'} dark-mode - Sets `darkMode`: present or `"true"`, `"false"`, or `"auto"` (follows `prefers-color-scheme`). Removing it restores the default (`false`).
 * @attr {boolean} show-toolbar - Sets `showToolbar`: present = `true`, `"false"` = `false`. Removing it restores the default (`true`).
 * @attr {boolean} enable-drag - Sets `enableDrag`: present = `true`, `"false"` = `false`. Removing it restores the default (`true`).
 * @attr {boolean} enable-resize - Sets `enableResize`: present = `true`, `"false"` = `false`. Removing it restores the default (`true`).
 * @attr {boolean} tooltip-enabled - Sets `tooltipEnabled`: present = `true`, `"false"` = `false`. Removing it restores the default (`true`).
 * @attr {boolean} show-legend - Sets `showLegend`: present = `true`, `"false"` = `false`. Removing it restores the default (`false`).
 * @attr {string} view-mode - The zoom level, through `setViewMode()`: a `ViewMode` or a `zoomLevels` name. Removing it changes nothing.
 *
 * @fires {CustomEvent<TaskDragEvent>} task-dragged - A bar was moved: `{ taskId, oldStart, oldEnd, newStart, newEnd, daysMoved }`.
 * @fires {CustomEvent<TaskResizeEvent>} task-resized - A bar was resized: `{ taskId, handle, oldStart, oldEnd, newStart, newEnd, daysDelta }`.
 * @fires {CustomEvent<SelectionChangeEvent>} selection-change - The selection changed: `{ selectedIds }`.
 * @fires {CustomEvent<GanttFlatRow>} row-click - A task-list row was clicked.
 * @fires {CustomEvent<GanttFlatRow>} row-dblclick - A task-list row was double-clicked.
 * @fires {CustomEvent<{ viewMode: string }>} view-mode-change - The active zoom level changed.
 * @fires {CustomEvent<GanttState>} state-change - The UI state changed (panel width or view, zoom, column widths, collapsed rows, sort); debounced, persisted under `options.stateKey`.
 * @fires {CustomEvent<{ error: unknown; page: number }>} load-error - A data-source page failed after its automatic retries (`dataSource.retry()` tries again).
 *
 * @csspart wrapper - The root box (toolbar and panes).
 * @csspart toolbar - The toolbar.
 * @csspart panel - The task-list panel.
 * @csspart splitter - The splitter box between the panes (its handle is the `role="separator"` child).
 * @csspart timeline - The timeline viewport (header and chart; scrolls on both axes).
 *
 * @cssstate dark - The dark theme is active (`darkMode` is `true`, or `'auto'` with a dark colour scheme).
 * @cssstate dragging - A bar is being dragged or resized.
 * @cssstate loading - A data-source page is loading.
 *
 * @cssprop [--gantt-bg=#FFFFFF] - Chart background (theme `backgroundColor`). Defaults are the light theme's.
 * @cssprop [--gantt-header-bg=#F8FAFC] - Header background (`headerBackground`).
 * @cssprop [--gantt-row-bg=#FFFFFF] - Row background (`rowBg`).
 * @cssprop [--gantt-row-bg-alt=#F8FAFC] - Alternate row background (`rowBgAlt`).
 * @cssprop [--gantt-bar=#2563EB] - Bar fill (`barColor`); set `--gantt-bar-text-on-bar` with it.
 * @cssprop [--gantt-bar-text=#FFFFFF] - Preferred bar label colour (`barTextColor`).
 * @cssprop [--gantt-bar-radius=4px] - Bar corner radius (`barRadius`; change it through the theme API, it shapes the layout).
 * @cssprop [--gantt-milestone=#8B5CF6] - Milestone fill (`milestoneColor`); set `--gantt-bar-text-on-milestone` with it.
 * @cssprop [--gantt-baseline=#64748B] - Baseline bars (`baselineColor`).
 * @cssprop [--gantt-critical=#DC2626] - Critical-path bars and arrows (`criticalColor`); set `--gantt-bar-text-on-critical` with it.
 * @cssprop [--gantt-panel-bg=#FFFFFF] - Task-list background (`panelBg`).
 * @cssprop [--gantt-panel-border=#E2E8F0] - Task-list borders (`panelBorder`).
 * @cssprop [--gantt-border=#E2E8F0] - Borders between regions (`borderColor`).
 * @cssprop [--gantt-grid-line=#EEF2F6] - Grid lines (`gridLine`).
 * @cssprop [--gantt-grid-line-major=#CBD5E1] - Delimiters between periods (`gridLineMajor`).
 * @cssprop [--gantt-today=#B45309] - Today marker and current-period highlight (`todayColor`); set `--gantt-today-label` with it.
 * @cssprop [--gantt-text=#1E293B] - Primary text (`textPrimary`).
 * @cssprop [--gantt-text-sec=#475569] - Secondary text (`textSecondary`).
 * @cssprop [--gantt-text-muted=#64748B] - Muted text (`textMuted`).
 * @cssprop [--gantt-font=system-ui, -apple-system, sans-serif] - Font family (`fontFamily`).
 * @cssprop [--gantt-font-size=13px] - Base font size (`fontSize`; change it through the theme API, it shapes the layout).
 * @cssprop [--gantt-arrow=#2563EB] - Dependency arrows (`arrowColor`).
 * @cssprop [--gantt-tooltip-bg=#FFFFFF] - Tooltip background (`tooltipBg`).
 * @cssprop [--gantt-tooltip-bdr=#E2E8F0] - Tooltip border (`tooltipBorder`).
 * @cssprop [--gantt-tooltip-txt=#1E293B] - Tooltip text (`tooltipText`).
 * @cssprop [--gantt-sel-bg=#EFF6FF] - Selected row background (`selectionBg`).
 * @cssprop [--gantt-sel-border=#2563EB] - Selection outline and focus rings (`selectionBorder`).
 * @cssprop [--gantt-scrollbar-track=#F1F5F9] - Scrollbar track (`scrollbarTrack`).
 * @cssprop [--gantt-scrollbar-thumb=#CBD5E1] - Scrollbar thumb (`scrollbarThumb`).
 * @cssprop [--gantt-weekend-bg=rgba(100, 116, 139, 0.08)] - Weekend bands (`weekendBg`).
 * @cssprop [--gantt-holiday-bg=rgba(239, 68, 68, 0.08)] - Holiday bands (`holidayBg`).
 * @cssprop [--gantt-off-hours-bg=rgba(100, 116, 139, 0.07)] - Off-hours bands on hour scales (`offHoursBg`).
 * @cssprop [--gantt-intensive-bg=rgba(245, 158, 11, 0.16)] - Intensive-hours bands (`intensiveBg`).
 * @cssprop [--gantt-status-not-started=#64748B] - Status dot: not started (`statusNotStarted`).
 * @cssprop [--gantt-status-in-progress=#2563EB] - Status dot: in progress (`statusInProgress`).
 * @cssprop [--gantt-status-overdue=#DC2626] - Status dot: overdue (`statusOverdue`).
 * @cssprop [--gantt-status-done=#15803D] - Status dot: done (`statusDone`).
 * @cssprop [--gantt-progress-overlay=#000000] - Progress fill inside theme-coloured bars, drawn at `bar.progress.opacity` (`progressOverlay`).
 * @cssprop [--gantt-bar-text-on-bar=#FFFFFF] - Label colour on `--gantt-bar` (derived: `readableOn(barColor, barTextColor)`).
 * @cssprop [--gantt-bar-text-on-milestone=#FFFFFF] - Label colour on `--gantt-milestone` (derived: `readableOn(milestoneColor, barTextColor)`).
 * @cssprop [--gantt-bar-text-on-critical=#FFFFFF] - Label colour on `--gantt-critical` (derived: `readableOn(criticalColor, barTextColor)`).
 * @cssprop [--gantt-today-label=#964B13] - Current-period header label, readable on its 14 % today tint (derived: `todayLabelColor(theme)`).
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class GantryElement extends BaseElement {
  static readonly observedAttributes = OBSERVED_ATTRIBUTES;

  /** Inputs, graph, layers and connected effects (private; tests reach it through `engine/registry`) */
  readonly #engine: Engine;

  /** ARIA through `ElementInternals` (`null`: the engine lacks it, host attributes instead) */
  readonly #aria: ElementInternals | null;
  /** The `aria-label` this element wrote on the host (attribute fallback; a page-set label wins) */
  #hostLabel: string | undefined;

  /** The `options` last assigned (the engine keeps an earlier, structurally equal object) */
  #options: GanttOptions = {};
  #restoredStateKey: string | undefined;
  #stateTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open', delegatesFocus: true });
    const engine = (this.#engine = createEngine(this, shadow, {
      emit: (type, detail) => this.#emit(type, detail),
      saveState: () => this.#saveState(),
    }));
    registerEngine(this, engine);
    const { graph: G, inputs: I, dom } = engine;

    // Role, name and custom states without host attributes (none may be added in the constructor)
    const internals = attachInternalsOf(this);
    const aria = (this.#aria = internals && 'role' in internals ? internals : null);
    if (aria) aria.role = 'region';
    const setState = stateSetter(internals && 'states' in internals ? internals.states : null);

    // Element-lifetime effects, synchronous like the events they fire. Owned by a root: the element
    // may be created inside an effect (an event handler), which must not dispose them when it re-runs
    runWithOwner(createRoot(), () => {
      effect(() => {
        const dragging = engine.drag.state().kind !== 'idle';
        dom.canvasContainer.classList.toggle('gantry-dragging', dragging);
        setState('dragging', dragging);
      });
      effect(() => setState('dark', G.isDark()));
      effect(() => setState('loading', I.loadState()?.isLoading === true));
      // The chart's name: the host region and the timeline viewport, kept in sync with the labels
      effect(() => {
        const label = G.i18n().labels.ariaChart;
        setAttr(dom.viewport, 'aria-label', label);
        if (aria) aria.ariaLabel = label;
        else if (this.#hostLabel !== undefined) this.#hostAria(label);
      });
      const zoomLevel = () => {
        try {
          return G.viewMode();
        } catch {
          return null; // invalid options: the render reports the error
        }
      };
      let shownViewMode = untracked(zoomLevel);
      effect(() => {
        const vm = zoomLevel();
        if (vm === null || vm === shownViewMode) return;
        shownViewMode = vm;
        this.#emit('view-mode-change', { viewMode: vm });
        this.#saveState();
      });
    });

    // Properties set before the element was defined shadow the accessors: re-apply them through the setters
    for (const { name } of PROPERTY_TABLE) {
      if (!Object.hasOwn(this, name)) continue;
      const value: unknown = Reflect.get(this, name);
      Reflect.deleteProperty(this, name);
      Reflect.set(this, name, value);
    }
    // A read-only property assigned before definition would hide its getter for good: drop the value
    for (const name of READ_ONLY_PROPERTIES) if (Object.hasOwn(this, name)) Reflect.deleteProperty(this, name);
  }

  // ── Lifecycle ─────────────────────────────────────────────

  connectedCallback(): void {
    // Attributes may only be added once connected (not in the constructor)
    if (!this.#aria) this.#hostAria(this.#engine.graph.i18n.peek().labels.ariaChart);
    this.#engine.connect();
  }

  /** Without ARIA on `ElementInternals`: the region's role and name as host attributes (the page's own win). */
  #hostAria(label: string): void {
    if (!this.hasAttribute('role')) this.setAttribute('role', 'region');
    const current = this.getAttribute('aria-label');
    if (current !== null && current !== this.#hostLabel) return;
    this.#hostLabel = label;
    if (current !== label) this.setAttribute('aria-label', label);
  }

  disconnectedCallback(): void {
    this.#engine.disconnect();
    // Write a pending state save now
    if (this.#stateTimer !== undefined) {
      clearTimeout(this.#stateTimer);
      this.#stateTimer = undefined;
      this.#writeState();
    }
  }

  /** Moved inside the document (`moveBefore()`): nothing is torn down, scroll, selection and focus stay. */
  connectedMoveCallback(): void {
    // Defined so the browser keeps the element connected: no disconnectedCallback / connectedCallback
  }

  /** Moved to another document: its stylesheets are re-adopted from that document. */
  adoptedCallback(): void {
    this.#engine.adopt();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === VIEW_MODE_ATTR) {
      if (value) this.setViewMode(value);
      return;
    }
    const spec = propertyOfAttribute(name);
    // A removed attribute parses to `undefined`: the property's default
    if (spec?.parse) this.#set(spec.name, spec.parse(value) as never);
  }

  // ── Properties (one per `PROPERTY_TABLE` entry; `undefined` restores the default) ──

  /** Tasks to display (a tree through `parentId`). Ignored while a `dataSource` is set. */
  get tasks(): GanttTask[] {
    return this.#engine.graph.tasks.peek();
  }
  set tasks(v: GanttTask[] | undefined) {
    this.#set('tasks', v);
  }

  /** Task-list columns (`options.columns`, when set, wins); the built-in columns by default. */
  get columns(): VanillaColumnDef[] {
    return this.#engine.columns.catalogue.peek().columns;
  }
  set columns(v: VanillaColumnDef[] | null | undefined) {
    this.#set('columns', v);
  }

  /** Every `GanttOptions` field. Re-assigning equal options changes nothing; the same object counts as changed. */
  get options(): GanttOptions {
    return this.#options;
  }
  set options(v: GanttOptions | null | undefined) {
    this.#set('options', v);
  }

  /** Highlighted date ranges and markers. */
  get annotations(): GanttAnnotation[] {
    return this.#engine.inputs.annotationsIn.peek();
  }
  set annotations(v: GanttAnnotation[] | undefined) {
    this.#set('annotations', v);
  }

  /**
   * `true` / `false` / `'auto'` (follows `prefers-color-scheme`).
   * @attr dark-mode
   */
  get darkMode(): boolean | 'auto' {
    return this.#engine.inputs.darkModeIn.peek();
  }
  set darkMode(v: boolean | 'auto' | undefined) {
    this.#set('darkMode', v);
  }

  /**
   * Toolbar with zoom, view-mode pills, view toggle and the Today button.
   * @attr show-toolbar
   */
  get showToolbar(): boolean {
    return this.#engine.inputs.showToolbar.peek();
  }
  set showToolbar(v: boolean | undefined) {
    this.#set('showToolbar', v);
  }

  /**
   * Bars can be dragged to new dates (per task: `task.draggable = false`).
   * @attr enable-drag
   */
  get enableDrag(): boolean {
    return this.#engine.inputs.enableDrag.peek();
  }
  set enableDrag(v: boolean | undefined) {
    this.#set('enableDrag', v);
  }

  /**
   * Bars can be resized from either end.
   * @attr enable-resize
   */
  get enableResize(): boolean {
    return this.#engine.inputs.enableResize.peek();
  }
  set enableResize(v: boolean | undefined) {
    this.#set('enableResize', v);
  }

  /**
   * Hover tooltip on bars.
   * @attr tooltip-enabled
   */
  get tooltipEnabled(): boolean {
    return this.#engine.inputs.tooltipEnabled.peek();
  }
  set tooltipEnabled(v: boolean | undefined) {
    this.#set('tooltipEnabled', v);
  }

  /**
   * Floating legend explaining the vertical markers (today + annotations).
   * @attr show-legend
   */
  get showLegend(): boolean {
    return this.#engine.inputs.showLegend.peek();
  }
  set showLegend(v: boolean | undefined) {
    this.#set('showLegend', v);
  }

  /**
   * Lazy, paged loading. Pass `{ fetcher, pageSize }` or a `GanttDataSource`.
   * While set, it owns the task list (the `tasks` property is ignored).
   */
  get dataSource(): GanttDataSource | null {
    return this.#engine.inputs.dataSource.peek();
  }
  set dataSource(v: GanttDataSource | GanttDataSourceConfig | null | undefined) {
    this.#set('dataSource', v);
  }

  /** Replace or decorate the built-in bar SVG (see `GanttBarRenderer`). */
  get renderBar(): GanttBarRenderer | undefined {
    return this.#engine.inputs.renderBar.peek();
  }
  set renderBar(v: GanttBarRenderer | undefined) {
    this.#set('renderBar', v);
  }

  /** Writes a property into the engine (`undefined` = the default). */
  #set<K extends PropertyName>(name: K, value: GantryProperties[K] | null): void {
    const v = orDefault(name, value);
    const engine = this.#engine;
    const I = engine.inputs;
    switch (name) {
      case 'tasks':
        if (!I.dataSource.peek()) engine.setTasks((v as GanttTask[] | null) ?? []);
        return;
      case 'columns':
        // options.columns, when set, keeps priority
        I.columnsIn.set((v as VanillaColumnDef[] | null)?.length ? (v as VanillaColumnDef[]) : null);
        return;
      case 'options':
        this.#setOptions((v as GanttOptions | null) ?? {});
        return;
      case 'dataSource': {
        const ds = v as GanttDataSource | GanttDataSourceConfig | null;
        engine.setDataSource(ds === null ? null : ds instanceof GanttDataSource ? ds : new GanttDataSource(ds));
        return;
      }
      case 'annotations':
        I.annotationsIn.set((v as GanttAnnotation[] | null) ?? []);
        return;
      case 'tooltipEnabled':
        if (!v) engine.layers.tooltip.hide();
        break;
    }
    // The other properties write the input of the same name (`darkMode` → `darkModeIn`); the
    // lifecycle tests round-trip every table entry
    (I[(name === 'darkMode' ? 'darkModeIn' : name) as keyof Inputs] as WritableSignal<unknown>).set(v);
  }

  #setOptions(opts: GanttOptions): void {
    const { inputs: I, layers } = this.#engine;
    const prev = I.optionsIn.peek();
    this.#options = opts;
    // Locale, columns, theme and config follow in the graph; equal options change nothing
    I.optionsIn.set(opts);
    if (opts.darkMode != null) this.darkMode = opts.darkMode;
    if (opts.enableDrag != null) I.enableDrag.set(opts.enableDrag);
    if (opts.enableResize != null) I.enableResize.set(opts.enableResize);
    // Only re-apply UI state the consumer actually changed — don't undo user interaction
    if (opts.viewMode && opts.viewMode !== prev.viewMode) I.viewModeOverride.set(opts.viewMode);
    const view = viewFromOptions(opts);
    if (view && view !== viewFromOptions(prev)) I.viewOverride.set(view);
    if (opts.panel?.width !== prev.panel?.width || opts.panelWidth !== prev.panelWidth) I.panelW.set(null);
    if (initialScrollChanged(opts.initialScroll, prev.initialScroll)) layers['scroll-commands'].resetInitialScroll();
    if (opts.stateKey && opts.stateKey !== this.#restoredStateKey) {
      this.#restoredStateKey = opts.stateKey;
      const saved = readStoredState(storage, opts.stateKey);
      if (saved) this.setState(saved, false);
    }
  }

  // ── Public API ────────────────────────────────────────────

  /** One zoom level closer (along `options.zoomLevels`). */
  zoomIn(): void {
    this.#zoom(-1);
  }
  /** One zoom level further out. */
  zoomOut(): void {
    this.#zoom(1);
  }
  #zoom(dir: 1 | -1): void {
    const { inputs: I, graph: G } = this.#engine;
    I.viewModeOverride.set(zoomStep(G.config.peek().zoomLevels, G.viewMode.peek(), dir));
  }

  /** Active zoom level (a `ViewMode` or a custom `zoomLevels` name). */
  get viewMode(): string {
    return this.#engine.graph.viewMode.peek();
  }
  /** Switch the zoom level: a `ViewMode` or a custom `zoomLevels` name (also the `view-mode` attribute). */
  setViewMode(mode: ViewMode | (string & {})): void {
    this.#engine.inputs.viewModeOverride.set(mode);
  }

  /** Current view: `'split'`, `'table'` (task list only) or `'chart'` (timeline only). */
  get view(): GanttView {
    return this.#engine.inputs.viewOverride.peek();
  }
  /** Switch the view: task list and timeline, the task list only, or the timeline only. */
  setView(view: GanttView): void {
    const { inputs: I } = this.#engine;
    if (view === I.viewOverride.peek()) return;
    I.viewOverride.set(view);
    this.#saveState();
  }

  /** Collapse / expand the task list; expanding restores its last width. */
  togglePanel(): void {
    this.setView(this.view === 'split' ? 'chart' : 'split');
  }

  /** Centre today in the timeline viewport. */
  scrollToToday(behavior: ScrollBehavior = 'smooth'): void {
    this.scrollToDate(new Date(), behavior);
  }

  /** Centre `date` in the timeline viewport. */
  scrollToDate(date: Date, behavior: ScrollBehavior = 'smooth'): void {
    this.#engine.layers['scroll-commands'].request(() => this.#scrollToDateNow(date, behavior));
  }

  /** Scroll the given task into view (vertically and horizontally). */
  scrollToTask(id: string, behavior: ScrollBehavior = 'smooth'): void {
    this.#engine.layers['scroll-commands'].request(() => this.#scrollToTaskNow(id, behavior));
  }

  /** Centring reads the viewport width of the painted model (see `layers/scroll-commands.ts`). */
  #scrollToDateNow(date: Date, behavior: ScrollBehavior): void {
    const { graph: G, inputs: I, dom } = this.#engine;
    const tl = G.timeline.peek();
    scrollToX(dom.viewport, tl.toX(date) - dom.viewport.clientWidth / 2, behavior, {
      inputs: I,
      maxLeft: tl.totalWidth - I.canvasW.peek(),
    });
  }

  #scrollToTaskNow(id: string, behavior: ScrollBehavior): void {
    const { graph: G, dom } = this.#engine;
    const geo = G.geoById.peek().get(id);
    if (!geo) return;
    scrollToRow(dom.viewport, geo.row.visibleIndex, G.config.peek().rowHeight, behavior);
    this.#scrollToDateNow(geo.row.task.start, behavior);
  }

  /** The selected tasks, in task order. */
  getSelectedTasks(): GanttTask[] {
    const { inputs: I, graph: G } = this.#engine;
    const ids = I.selection.peek().selected;
    return G.tasks.peek().filter(t => ids.has(t.id));
  }
  /** Select exactly these task ids (fires `selection-change` when the selection changes). */
  setSelectedTasks(ids: string[]): void {
    this.#engine.selection.setSelected(ids);
  }
  /** Deselect every task. */
  clearSelection(): void {
    this.#engine.selection.clear();
  }
  /** Select every visible task (multiple selection only). */
  selectAll(): void {
    const { graph: G, layers, selection } = this.#engine;
    if (!layers['scroll-commands'].hasRendered()) return;
    selection.selectAll(
      G.visibleRows.peek().map(r => r.task.id),
      G.config.peek().selection,
    );
  }

  /** Merge `patch` into the task with this id. */
  updateTask(id: string, patch: Partial<GanttTask>): void {
    const { inputs: I, graph: G } = this.#engine;
    I.tasksIn.set(G.tasks.peek().map(t => (t.id === id ? { ...t, ...patch } : t)));
  }
  /** Add tasks after the current ones. */
  appendTasks(tasks: GanttTask[]): void {
    const { inputs: I, graph: G } = this.#engine;
    // `graph.tasks` repairs the appended tasks like set ones
    if (tasks.length) I.tasksIn.set([...G.tasks.peek(), ...tasks]);
  }

  /** Collapse every group (task with children). */
  collapseAll(): void {
    const { inputs: I, graph: G } = this.#engine;
    const parentIds = flattenTree(G.tasks.peek(), new Set())
      .filter(r => r.hasChildren)
      .map(r => r.task.id);
    I.collapsedIds.set(new Set(parentIds));
    this.#saveState();
  }
  /** Expand every group. */
  expandAll(): void {
    this.#engine.inputs.collapsedIds.set(new Set());
    this.#saveState();
  }

  /** Show / hide a column in both views, or only in the split panel / the table view. */
  setColumnVisible(key: string, visible: boolean, view?: 'split' | 'table'): void {
    this.#engine.columns.setVisible(key, visible, view);
  }
  /** Show a column if the view (both views by default) hides it, else hide it. */
  toggleColumnVisible(key: string, view?: 'split' | 'table'): void {
    const { columns, graph: G, layers } = this.#engine;
    columns.toggleVisible(key, view, layers['scroll-commands'].hasRendered() ? G.config.peek() : undefined);
  }

  /** Replace the custom theme overrides (on top of the light/dark base and `options.theme`). */
  setTheme(override: GanttThemeOverrides): void {
    this.#engine.inputs.apiTheme.set({ ...override });
  }
  /** Merge `patch` into the custom theme overrides. */
  patchTheme(patch: GanttThemeOverrides): void {
    this.#engine.inputs.apiTheme.update(cur => ({ ...cur, ...patch }));
  }
  /** Drop the `setTheme` / `patchTheme` overrides: back to the light/dark base plus `options.theme`. */
  resetTheme(): void {
    const { apiTheme } = this.#engine.inputs;
    if (Object.keys(apiTheme.peek()).length) apiTheme.set({});
  }

  /** Geometry of a task's bar (position in timeline px, size, label) — e.g. to anchor a popover. */
  getBarVisual(id: string): BarVisual | undefined {
    const { graph: G } = this.#engine;
    const geo = G.geoById.peek().get(id);
    return geo && G.barVisual.peek()(geo);
  }

  /** IDs of the tasks on the critical path (empty unless `options.criticalPath`). */
  get criticalIds(): ReadonlySet<string> {
    return this.#engine.graph.critical.peek()?.criticalIds ?? new Set();
  }

  /** Snapshot of the UI state (panel, view, zoom, column widths, collapsed rows, sort). */
  getState(): GanttState {
    const { inputs: I, graph: G, columns, layers } = this.#engine;
    const view = I.viewOverride.peek();
    const panelPx = layers['scroll-commands'].hasRendered() ? G.panelPx.peek() : 0;
    return {
      panelWidth: I.panelW.peek() ?? (panelPx || undefined),
      panelCollapsed: view === 'chart',
      view,
      viewMode: G.viewMode.peek(),
      columnWidths: columns.widths(),
      collapsedIds: [...I.collapsedIds.peek()],
      sort: I.sort.peek(),
    };
  }

  /**
   * Restore a state snapshot (e.g. from your backend).
   * @param emit - `false`: neither fire `state-change` nor persist under `options.stateKey`.
   */
  setState(state: GanttState, emit = true): void {
    const { inputs: I, columns } = this.#engine;
    state = normalizeState(state);
    if (state.panelWidth != null) I.panelW.set(state.panelWidth);
    const view = viewFromState(state);
    if (view) I.viewOverride.set(view);
    if (state.viewMode) I.viewModeOverride.set(state.viewMode);
    if (state.columnWidths) columns.setColumnWidths(state.columnWidths);
    if (state.collapsedIds) I.collapsedIds.set(new Set(state.collapsedIds));
    if (state.sort !== undefined) I.sort.set(state.sort);
    if (emit) this.#saveState();
  }

  // ── State persistence ─────────────────────────────────────

  /** Debounced: emit `state-change` and persist under `options.stateKey` (flushed on disconnect). */
  #saveState(): void {
    clearTimeout(this.#stateTimer);
    this.#stateTimer = setTimeout(() => {
      this.#stateTimer = undefined;
      this.#writeState();
    }, STATE_SAVE_DELAY);
  }

  #writeState(): void {
    const state = this.getState();
    this.#emit('state-change', state);
    const key = this.#engine.inputs.optionsIn.peek().stateKey;
    if (key) writeStoredState(storage, key, state);
  }

  // ── Events ────────────────────────────────────────────────

  #emit<K extends keyof GantryEventDetailMap>(type: K, detail: GantryEventDetailMap[K]): void {
    /** @ignore The events are listed with `@fires` on the class (Custom Elements Manifest). */
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gantry-element': GantryElement;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('gantry-element')) {
  customElements.define('gantry-element', GantryElement);
}
