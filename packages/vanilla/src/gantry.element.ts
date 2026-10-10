/**
 * @file gantry.element.ts
 * Root Web Component (<gantry-element>) orchestrating all Vanilla JS services and subcomponents.
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
 */

import {
  type GanttTask,
  type GanttOptions,
  type GanttAnnotation,
  type GanttTheme,
  type GanttThemeOverrides,
  type GanttFlatRow,
  type GanttState,
  type GanttView,
  type GanttI18n,
  type ViewMode,
  computeCriticalPath,
  resolveConfig,
  resolveLength,
  taskSpan,
  initialScrollLeft,
  initialScrollChanged,
  zoomAnchorScroll,
  bottomScale,
  type ResolvedGanttConfig,
  type BarVisual,
  type TimelineModel,
} from '@gantry/core';
import { GanttThemeService } from './services/gantt-theme.service';
import { GanttI18nService } from './services/gantt-i18n.service';
import { GanttColumnService } from './columns/gantt-column.service';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttScrollService } from './scroll/gantt-scroll.service';
import { GanttSelectionService } from './selection/gantt-selection.service';
import { GanttDragService } from './drag/gantt-drag.service';
import { GanttHeaderComponent } from './header/gantt-header.component';
import { GanttTaskListComponent } from './tasklist/gantt-tasklist.component';
import { GanttCanvasComponent, type GanttBarRenderer } from './layout/gantt-canvas.component';
import { GanttToolbarComponent } from './annotations/gantt-toolbar.component';
import { GanttTooltip } from './tooltip/gantt-tooltip';
import { GanttDataSource } from './datasource/gantt-datasource';
import { computeVirtualWindow } from './virtual-scroll/virtual-window';
import type { VanillaColumnDef, GanttDataSourceConfig, GantryEventDetailMap, GantryEventMap } from './types';

const STATE_PREFIX = 'gantry:';

const template = typeof document === 'undefined' ? null : document.createElement('template');
if (template)
  template.innerHTML = `
  <style>
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      font-family: var(--gantt-font, system-ui, -apple-system, sans-serif);
      font-size: var(--gantt-font-size, 13px);
      color: var(--gantt-text, #1E293B);
      background-color: var(--gantt-bg, #FFFFFF);
      outline: none;
    }
    :host(:focus-visible) { box-shadow: inset 0 0 0 2px var(--gantt-sel-border, #2563EB); }
    :host([hidden]) { display: none; }

    .gantry-wrapper { display: flex; flex-direction: column; width: 100%; height: 100%; background: var(--gantt-bg); overflow: hidden; }
    .gantry-main { display: flex; flex: 1; overflow: hidden; min-height: 0; position: relative; }

    /* ── Task list panel ─────────────────────────────────── */
    .gantry-panel {
      flex: 0 0 auto;
      overflow-x: auto;
      overflow-y: hidden;
      background: var(--gantt-panel-bg);
      transition: width .25s ease;
      scrollbar-width: thin;
      scrollbar-color: var(--gantt-scrollbar-thumb) var(--gantt-scrollbar-track);
    }
    .gantry-main.is-resizing .gantry-panel,
    .gantry-main.is-resizing .gantry-canvas-viewport { transition: none; }

    /* ── Splitter with collapse toggle ──────────────────── */
    .gantry-splitter {
      flex: 0 0 6px;
      position: relative;
      cursor: col-resize;
      background: linear-gradient(to right, transparent 2px, var(--gantt-panel-border) 2px, var(--gantt-panel-border) 3px, transparent 3px);
      z-index: 12;
      outline: none;
    }
    .gantry-splitter:hover, .gantry-splitter:focus-visible, .gantry-main.is-resizing .gantry-splitter {
      background: linear-gradient(to right, transparent 1px, var(--gantt-sel-border) 1px, var(--gantt-sel-border) 4px, transparent 4px);
    }
    .gantry-splitter[data-resizable="false"] { cursor: default; }
    .gantry-splitter-toggle {
      position: absolute;
      top: var(--gantry-toggle-top, 50%);
      left: 50%;
      transform: translate(-50%, -50%);
      width: 18px;
      height: 32px;
      padding: 0;
      border: 1px solid var(--gantt-border);
      border-radius: 9px;
      background: var(--gantt-panel-bg);
      color: var(--gantt-text-sec);
      font-size: 15px;
      font-weight: 600;
      line-height: 1;
      cursor: pointer;
      box-shadow: 0 1px 4px rgba(0,0,0,.12);
      opacity: .85;
    }
    .gantry-splitter-toggle:hover { opacity: 1; color: var(--gantt-text); border-color: var(--gantt-sel-border); }
    .gantry-splitter-toggle[hidden] { display: none; }

    /* ── Timeline ───────────────────────────────────────── */
    .gantry-canvas-viewport {
      flex: 1;
      overflow: auto;
      position: relative;
      min-width: 0;
      transition: opacity .25s ease;
      scrollbar-width: thin;
      scrollbar-color: var(--gantt-scrollbar-thumb) var(--gantt-scrollbar-track);
    }
    .gantry-canvas-header-sticky { position: sticky; top: 0; z-index: 10; background: var(--gantt-header-bg); width: max-content; }

    .gantry-wrapper[data-view="table"] .gantry-canvas-viewport { opacity: 0; pointer-events: none; }
    .gantry-wrapper[data-view="table"] .gantry-splitter { display: none; }
    .gantry-wrapper[data-view="chart"] .gantry-panel { overflow: hidden; }

    .gantry-panel::-webkit-scrollbar, .gantry-canvas-viewport::-webkit-scrollbar { width: 6px; height: 6px; }
    .gantry-panel::-webkit-scrollbar-track, .gantry-canvas-viewport::-webkit-scrollbar-track { background: var(--gantt-scrollbar-track); }
    .gantry-panel::-webkit-scrollbar-thumb, .gantry-canvas-viewport::-webkit-scrollbar-thumb { background: var(--gantt-scrollbar-thumb); border-radius: 3px; }

    /* ── Header tiers ───────────────────────────────────── */
    .gantt-sr-alert {
      position: absolute; width: 1px; height: 1px; overflow: hidden;
      clip-path: inset(50%); white-space: nowrap;
    }
    .g-header { position: relative; }
    .g-tier { position: absolute; left: 0; right: 0; border-bottom: 1px solid var(--gantt-border); box-sizing: border-box; }
    .g-cell {
      position: absolute; top: 0; bottom: 0; box-sizing: border-box;
      display: flex; align-items: center; justify-content: center;
      overflow: clip; white-space: nowrap;
      font-size: calc(var(--gantt-font-size, 13px) - 1px);
      color: var(--gantt-text-sec);
    }
    .g-tier:first-child .g-cell { color: var(--gantt-text); font-weight: 600; font-size: var(--gantt-font-size, 13px); }
    .g-tier--start .g-cell { justify-content: flex-start; }
    .g-cell-label { position: sticky; left: 0; padding: 0 6px; overflow: hidden; text-overflow: ellipsis; max-width: 100%; box-sizing: border-box; }
    .g-cell--current { background: color-mix(in srgb, var(--gantt-today) 14%, transparent); }
    .g-cell--current .g-cell-label { color: var(--gantt-today); font-weight: 600; }
    .g-band { position: absolute; top: 0; bottom: 0; pointer-events: none; }
    .g-today-pointer {
      position: absolute; bottom: 0; width: 0; height: 0; margin-left: -5px;
      border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 6px solid var(--gantt-today);
    }

    /* ── Toolbar ────────────────────────────────────────── */
    .gantt-toolbar {
      display: flex; align-items: center; flex-wrap: wrap; gap: 10px;
      padding: 6px 10px; background: var(--gantt-header-bg); border-bottom: 1px solid var(--gantt-border);
    }
    .gantt-tb-group { display: flex; align-items: center; gap: 3px; }
    .gantt-tb-group + .gantt-tb-group { padding-left: 10px; border-left: 1px solid var(--gantt-border); }
    .gantt-tb-views { margin-left: auto; border-left: none !important; }
    .gantt-tb-btn, .gantt-tb-pill {
      font: inherit; font-size: 12px; cursor: pointer; border-radius: 5px;
      border: 1px solid var(--gantt-border); background: var(--gantt-panel-bg); color: var(--gantt-text-sec);
      padding: 3px 10px;
    }
    .gantt-tb-pill { border-color: transparent; background: transparent; padding: 3px 8px; }
    .gantt-tb-btn:hover, .gantt-tb-pill:hover { color: var(--gantt-text); border-color: var(--gantt-border); }
    .gantt-tb-pill[aria-pressed="true"] { background: var(--gantt-bar); border-color: var(--gantt-bar); color: #fff; }
    .gantt-tb-today { color: var(--gantt-today); border-color: color-mix(in srgb, var(--gantt-today) 45%, transparent); }

    /* ── Task list ──────────────────────────────────────── */
    .gantt-col-resize { position: absolute; top: 0; right: -3px; width: 6px; height: 100%; cursor: col-resize; z-index: 2; }
    .gantt-col-resize:hover { background: var(--gantt-sel-border); opacity: .6; }
    .gantt-tl-row:hover { filter: brightness(0.97); }
    .gantt-tl-row--selected { box-shadow: inset 3px 0 0 var(--gantt-sel-border); }

    /* ── Bars ───────────────────────────────────────────── */
    .gantt-bar-draggable { cursor: grab; }
    .gantry-dragging, .gantry-dragging .gantt-bar-draggable { cursor: grabbing; }
    .gantt-bar-label { font-family: var(--gantt-font); user-select: none; }
    .gantt-bar-label--outside { font-weight: 500; }

    /* ── Legend ─────────────────────────────────────────── */
    .gantt-legend {
      position: absolute; bottom: 12px; right: 12px; z-index: 15;
      display: flex; align-items: center; gap: 14px; padding: 6px 12px; border-radius: 8px; font-size: 11px;
      background: var(--gantt-panel-bg); border: 1px solid var(--gantt-border); color: var(--gantt-text-sec);
      box-shadow: 0 4px 16px rgba(0,0,0,0.12); pointer-events: none;
    }
    .gantt-legend-title { font-weight: 700; text-transform: uppercase; letter-spacing: .4px; font-size: 9.5px; color: var(--gantt-text-muted); }
    .gantt-legend-item { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; color: var(--gantt-text); }

    @media (prefers-reduced-motion: reduce) {
      .gantry-panel, .gantry-canvas-viewport { transition: none; }
    }
  </style>
  <div class="gantry-wrapper" part="wrapper" data-view="split">
    <div class="gantry-toolbar-container" part="toolbar"></div>
    <div class="gantry-main">
      <div class="gantry-panel" part="panel">
        <div class="gantry-tasklist-container"></div>
      </div>
      <div class="gantry-splitter" part="splitter" role="separator" aria-orientation="vertical" tabindex="0">
        <button type="button" class="gantry-splitter-toggle"></button>
      </div>
      <div class="gantry-canvas-viewport" part="timeline">
        <div class="gantry-canvas-header-sticky">
          <div class="gantry-header-container"></div>
        </div>
        <div class="gantry-canvas-container"></div>
      </div>
    </div>
  </div>
  <div class="gantt-legend" hidden></div>
  <div class="gantt-sr-alert" role="alert"></div>
`;

const BOOLEAN_ATTRS = {
  'show-toolbar': 'showToolbar',
  'enable-drag': 'enableDrag',
  'enable-resize': 'enableResize',
  'tooltip-enabled': 'tooltipEnabled',
  'show-legend': 'showLegend',
} as const;

const parseBool = (v: string | null) => v !== null && v !== 'false';

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

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class GantryElement extends BaseElement {
  static readonly observedAttributes = ['dark-mode', 'view-mode', ...Object.keys(BOOLEAN_ATTRS)];

  private readonly shadow: ShadowRoot;

  readonly themeSvc = new GanttThemeService();
  readonly i18nSvc = new GanttI18nService();
  readonly colSvc = new GanttColumnService(this.i18nSvc);
  readonly layout = new GanttLayoutService();
  readonly scrollSvc = new GanttScrollService();
  readonly selSvc = new GanttSelectionService();
  readonly dragSvc = new GanttDragService();
  private readonly tooltip: GanttTooltip;

  private readonly wrapperEl: HTMLElement;
  private readonly mainEl: HTMLElement;
  private readonly toolbarContainerEl: HTMLElement;
  private readonly panelEl: HTMLElement;
  private readonly splitterEl: HTMLElement;
  private readonly toggleEl: HTMLButtonElement;
  private readonly tasklistContainerEl: HTMLElement;
  private readonly canvasViewportEl: HTMLElement;
  private readonly headerContainerEl: HTMLElement;
  private readonly canvasContainerEl: HTMLElement;
  private readonly legendEl: HTMLElement;
  /** Persistent live region: announces a failed data-source page once */
  private readonly srAlertEl: HTMLElement;
  /** Last data-source error reported through `load-error` */
  private reportedLoadError: unknown = null;
  /** Columns assigned through the `columns` property (options.columns overrides them) */
  private columnsProp: VanillaColumnDef[] | null = null;

  private headerComp?: GanttHeaderComponent | undefined;
  private tasklistComp?: GanttTaskListComponent | undefined;
  private canvasComp?: GanttCanvasComponent | undefined;
  private toolbarComp?: GanttToolbarComponent | undefined;

  // ── Property backing fields ───────────────────────────────
  private _options: GanttOptions = {};
  private _annotations: GanttAnnotation[] = [];
  private _darkMode: boolean | 'auto' = false;
  private _showToolbar = true;
  private _enableDrag = true;
  private _enableResize = true;
  private _tooltipEnabled = true;
  private _showLegend = false;
  private _dataSource: GanttDataSource | null = null;
  private _renderBar?: GanttBarRenderer | undefined;

  // ── Render bookkeeping ────────────────────────────────────
  private frame = 0;
  /** true = toolbar/header/config need re-resolving, not just the rows */
  private fullRenderPending = false;
  private resizeObserver?: ResizeObserver | undefined;
  private clock?: ReturnType<typeof setInterval> | undefined;
  /** The first render with data has applied `initialScroll` (or a requested scroll) */
  private initialScrollDone = false;
  /** Timeline the canvas was last painted with — anchors the scroll when it changes */
  private paintedTimeline?: TimelineModel | undefined;
  private critical: { tasks: GanttTask[] | null; key: string; ids: Set<string> } = {
    tasks: null,
    key: '',
    ids: new Set(),
  };
  private lastViewMode: string;
  private restoredStateKey?: string | undefined;
  private stateTimer?: ReturnType<typeof setTimeout> | undefined;
  /** Last panel width actually applied (px) */
  private panelPx = 0;
  private headerTimeline?: object | undefined;
  /** Scroll requested before the pending render — replayed on the new timeline */
  private pendingScroll?: (() => void) | undefined;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
    this.shadow.appendChild(template!.content.cloneNode(true));

    const $ = <T extends HTMLElement = HTMLElement>(sel: string) => this.shadow.querySelector<T>(sel)!;
    this.wrapperEl = $('.gantry-wrapper');
    this.mainEl = $('.gantry-main');
    this.toolbarContainerEl = $('.gantry-toolbar-container');
    this.panelEl = $('.gantry-panel');
    this.splitterEl = $('.gantry-splitter');
    this.toggleEl = $<HTMLButtonElement>('.gantry-splitter-toggle');
    this.tasklistContainerEl = $('.gantry-tasklist-container');
    this.canvasViewportEl = $('.gantry-canvas-viewport');
    this.headerContainerEl = $('.gantry-header-container');
    this.canvasContainerEl = $('.gantry-canvas-container');
    this.legendEl = $('.gantt-legend');
    this.srAlertEl = $('.gantt-sr-alert');

    this.tooltip = new GanttTooltip(this.shadow, this.i18nSvc);
    this.lastViewMode = this.layout.viewMode();

    this.scrollSvc.bindViewports(this.panelEl, this.canvasViewportEl);
    this.scrollSvc.onScroll = () => this.scheduleRender(false);
    // The panel only scrolls horizontally; forward vertical wheel to the timeline
    this.panelEl.addEventListener(
      'wheel',
      e => {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        this.canvasViewportEl.scrollTop += e.deltaY;
        e.preventDefault();
      },
      { passive: false },
    );

    this.dragSvc.onTaskDragged = e => {
      this.layout.updateTask(e.taskId, { start: e.newStart, end: e.newEnd });
      this.emit('task-dragged', e);
      this.scheduleRender();
    };
    this.dragSvc.onTaskResized = e => {
      this.layout.updateTask(e.taskId, { start: e.newStart, end: e.newEnd });
      this.emit('task-resized', e);
      this.scheduleRender();
    };
    this.dragSvc.preview.subscribe(() => this.scheduleRender(false));
    this.dragSvc.state.subscribe(s => this.canvasContainerEl.classList.toggle('gantry-dragging', s.kind !== 'idle'));

    this.selSvc.onChange = e => {
      this.emit('selection-change', e);
      this.scheduleRender(false);
    };
    const mirrorColumns = () => {
      this.layout.columns.set(this.colSvc.columns);
      this.layout.builtins.set(this.colSvc.builtins);
    };
    this.colSvc.onChange = () => {
      mirrorColumns();
      this.scheduleRender(false);
    };
    mirrorColumns();

    this.layout.viewMode.subscribe(vm => {
      if (vm === this.lastViewMode) return;
      this.lastViewMode = vm;
      this.emit('view-mode-change', { viewMode: vm });
      this.saveState();
    });

    this.bindCanvasInteractions();
    this.bindSplitter();
    this.addEventListener('keydown', e => this.onKeyDown(e));
  }

  // ── Lifecycle ─────────────────────────────────────────────

  connectedCallback(): void {
    // Attributes/styles may only be added once connected (not in the constructor)
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this.themeSvc.init(this, this._darkMode);
    this.resizeObserver = new ResizeObserver(() => this.scheduleRender(false));
    this.resizeObserver.observe(this.mainEl);
    // Keep "today" fresh in long-lived sessions
    this.clock = setInterval(() => {
      this.layout.tick();
      this.scheduleRender();
    }, 60_000);
    if (this._dataSource) this.attachDataSource(this._dataSource);
    this.scheduleRender();
  }

  disconnectedCallback(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    clearInterval(this.clock);
    this.themeSvc.destroy();
    this.tooltip.hide();
    this.dragSvc.cancel();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    // Write a pending state save now; stop listening to the data source until reconnected
    if (this.stateTimer) {
      clearTimeout(this.stateTimer);
      this.stateTimer = undefined;
      this.writeState();
    }
    if (this._dataSource) this._dataSource.onChange = undefined;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === 'dark-mode') {
      this.darkMode = value === 'auto' ? 'auto' : parseBool(value);
    } else if (name === 'view-mode') {
      if (value) this.setViewMode(value);
    } else if (name in BOOLEAN_ATTRS) {
      // missing attribute = default (true), except show-legend which defaults to false
      const prop = BOOLEAN_ATTRS[name as keyof typeof BOOLEAN_ATTRS];
      this[prop] = value === null ? prop !== 'showLegend' : parseBool(value);
    }
  }

  // ── Properties ────────────────────────────────────────────

  /** Tasks to display. Ignored while a `dataSource` is set. */
  get tasks(): GanttTask[] {
    return this.layout.tasks();
  }
  set tasks(val: GanttTask[]) {
    if (this._dataSource) return;
    this.layout.setTasks(val ?? []);
    this.scheduleRender();
  }

  get columns(): VanillaColumnDef[] {
    return this.colSvc.columns;
  }
  set columns(val: VanillaColumnDef[] | null | undefined) {
    this.columnsProp = val?.length ? val : null;
    // options.columns, when set, keeps priority
    if (!this._options.columns?.length) {
      if (this.columnsProp) this.colSvc.setColumns(this.columnsProp);
      else this.colSvc.resetColumns();
    }
    this.scheduleRender();
  }

  get options(): GanttOptions {
    return this._options;
  }
  set options(val: GanttOptions | null | undefined) {
    const opts = val ?? {};
    const prev = this._options;
    this._options = opts;
    this.i18nSvc.apply(opts);
    // options.columns wins; removing it falls back to the `columns` property, else the built-ins
    if (opts.columns?.length) this.colSvc.setColumns(opts.columns as VanillaColumnDef[]);
    else if (prev.columns?.length) {
      if (this.columnsProp) this.colSvc.setColumns(this.columnsProp);
      else this.colSvc.resetColumns();
    } else this.colSvc.refresh();
    this.themeSvc.setOptionsTheme(opts.theme);
    if (opts.darkMode != null) this.darkMode = opts.darkMode;
    if (opts.enableDrag != null) this._enableDrag = opts.enableDrag;
    if (opts.enableResize != null) this._enableResize = opts.enableResize;
    // Only re-apply UI state the consumer actually changed — don't undo user interaction
    if (opts.viewMode && opts.viewMode !== prev.viewMode) this.layout.viewMode.set(opts.viewMode);
    const view = opts.view ?? (opts.panel?.collapsed ? 'chart' : undefined);
    const prevView = prev.view ?? (prev.panel?.collapsed ? 'chart' : undefined);
    if (view && view !== prevView) this.layout.view.set(view);
    if (opts.panel?.width !== prev.panel?.width || opts.panelWidth !== prev.panelWidth)
      this.layout.panelWidthPx.set(null);
    if (initialScrollChanged(opts.initialScroll, prev.initialScroll)) this.initialScrollDone = false;
    if (opts.stateKey && opts.stateKey !== this.restoredStateKey) {
      this.restoredStateKey = opts.stateKey;
      const saved = readState(opts.stateKey);
      if (saved) this.setState(saved, false);
    }
    this.scheduleRender();
  }

  get annotations(): GanttAnnotation[] {
    return this._annotations;
  }
  set annotations(val: GanttAnnotation[]) {
    this._annotations = val ?? [];
    this.scheduleRender();
  }

  /** `true` / `false` / `'auto'` (follows `prefers-color-scheme`). */
  get darkMode(): boolean | 'auto' {
    return this._darkMode;
  }
  set darkMode(val: boolean | 'auto') {
    this._darkMode = val;
    this.themeSvc.setDarkMode(val);
    this.scheduleRender();
  }

  get showToolbar(): boolean {
    return this._showToolbar;
  }
  set showToolbar(val: boolean) {
    this._showToolbar = val;
    this.scheduleRender();
  }

  get enableDrag(): boolean {
    return this._enableDrag;
  }
  set enableDrag(val: boolean) {
    this._enableDrag = val;
    this.scheduleRender();
  }

  get enableResize(): boolean {
    return this._enableResize;
  }
  set enableResize(val: boolean) {
    this._enableResize = val;
    this.scheduleRender();
  }

  get tooltipEnabled(): boolean {
    return this._tooltipEnabled;
  }
  set tooltipEnabled(val: boolean) {
    this._tooltipEnabled = val;
    if (!val) this.tooltip.hide();
  }

  /** Floating legend explaining the vertical markers (today + annotations). */
  get showLegend(): boolean {
    return this._showLegend;
  }
  set showLegend(val: boolean) {
    this._showLegend = val;
    this.scheduleRender();
  }

  /**
   * Lazy, paged loading. Pass `{ fetcher, pageSize }` or a `GanttDataSource`.
   * While set, it owns the task list (the `tasks` property is ignored).
   */
  get dataSource(): GanttDataSource | null {
    return this._dataSource;
  }
  set dataSource(val: GanttDataSource | GanttDataSourceConfig | null | undefined) {
    if (this._dataSource) this._dataSource.onChange = undefined;
    const ds = val == null ? null : val instanceof GanttDataSource ? val : new GanttDataSource(val);
    this._dataSource = ds;
    this.reportedLoadError = null;
    this.srAlertEl.textContent = '';
    if (!ds) return;
    this.attachDataSource(ds);
    this.scheduleRender();
  }

  /** Mirror the data source into the layout (also on reconnect) and start it per `initialPage`. */
  private attachDataSource(ds: GanttDataSource): void {
    ds.onChange = () => this.syncDataSource(ds);
    this.syncDataSource(ds);
    if (ds.loadedCount === 0 && ds.autoStart) void ds.loadNext();
  }

  /** Copy the loaded items; report each new failure once (event + screen-reader alert). */
  private syncDataSource(ds: GanttDataSource): void {
    this.layout.setTasks(ds.items);
    if (ds.error === null) {
      if (this.reportedLoadError !== null) this.srAlertEl.textContent = '';
      this.reportedLoadError = null;
    } else if (ds.error !== this.reportedLoadError && this.isConnected) {
      this.reportedLoadError = ds.error;
      this.srAlertEl.textContent = this.i18nSvc.labels.loadError;
      this.emit('load-error', { error: ds.error, page: ds.nextPage });
    }
    this.scheduleRender();
  }

  /** Replace or decorate the built-in bar SVG (see `GanttBarRenderer`). */
  get renderBar(): GanttBarRenderer | undefined {
    return this._renderBar;
  }
  set renderBar(fn: GanttBarRenderer | undefined) {
    this._renderBar = fn;
    this.scheduleRender();
  }

  // ── Public API ────────────────────────────────────────────

  zoomIn(): void {
    this.layout.zoomIn();
    this.scheduleRender();
  }
  zoomOut(): void {
    this.layout.zoomOut();
    this.scheduleRender();
  }

  /** Active zoom level (a `ViewMode` or a custom `zoomLevels` name). */
  get viewMode(): string {
    return this.layout.viewMode();
  }
  setViewMode(mode: ViewMode | (string & {})): void {
    this.layout.viewMode.set(mode);
    this.scheduleRender();
  }

  /** Current view: `'split'`, `'table'` (task list only) or `'chart'` (timeline only). */
  get view(): GanttView {
    return this.layout.view();
  }
  setView(view: GanttView): void {
    if (view === this.layout.view()) return;
    this.layout.view.set(view);
    this.saveState();
    this.scheduleRender();
  }

  /** Collapse / expand the task list; expanding restores its last width. */
  togglePanel(): void {
    this.setView(this.layout.view() === 'split' ? 'chart' : 'split');
  }

  scrollToToday(behavior: ScrollBehavior = 'smooth'): void {
    this.scrollToDate(new Date(), behavior);
  }

  /** Centre `date` in the timeline viewport. */
  scrollToDate(date: Date, behavior: ScrollBehavior = 'smooth'): void {
    if (this.fullRenderPending || !this.layout.config()) {
      this.pendingScroll = () => this.scrollToDate(date, behavior);
      return;
    }
    const x = this.layout.timeline.toX(date);
    this.scrollSvc.scrollToX(x - this.canvasViewportEl.clientWidth / 2, behavior);
  }

  /** Scroll the given task into view (vertically and horizontally). */
  scrollToTask(id: string, behavior: ScrollBehavior = 'smooth'): void {
    if (this.fullRenderPending || !this.layout.config()) {
      this.pendingScroll = () => this.scrollToTask(id, behavior);
      return;
    }
    const geo = this.layout.geometryById.get(id);
    if (!geo) return;
    this.scrollSvc.scrollToRow(geo.row.visibleIndex, this.layout.rowHeight, behavior);
    this.scrollToDate(geo.row.task.start, behavior);
  }

  getSelectedTasks(): GanttTask[] {
    const ids = this.selSvc.selectedIds;
    return this.layout.tasks().filter(t => ids.has(t.id));
  }
  setSelectedTasks(ids: string[]): void {
    this.selSvc.setSelected(ids);
  }
  clearSelection(): void {
    this.selSvc.clear();
  }
  selectAll(): void {
    const selection = this.layout.config()?.selection;
    if (!selection?.enabled || !selection.multi) return;
    this.selSvc.selectAll(this.layout.visibleRows);
  }

  updateTask(id: string, patch: Partial<GanttTask>): void {
    this.layout.updateTask(id, patch);
    this.scheduleRender();
  }
  appendTasks(tasks: GanttTask[]): void {
    this.layout.appendTasks(tasks);
    this.scheduleRender();
  }

  collapseAll(): void {
    this.layout.collapseAll();
    this.saveState();
    this.scheduleRender();
  }
  expandAll(): void {
    this.layout.expandAll();
    this.saveState();
    this.scheduleRender();
  }

  /** Show / hide a column (also persisted with `stateKey` via its width map). */
  /** Show / hide a column in both views, or only in the split panel / the table view. */
  setColumnVisible(key: string, visible: boolean, view?: 'split' | 'table'): void {
    this.colSvc.setVisible(key, visible, view);
  }
  /** Show a column if the view (both views by default) hides it, else hide it. */
  toggleColumnVisible(key: string, view?: 'split' | 'table'): void {
    this.colSvc.toggleVisible(key, view, this.layout.config() ?? undefined);
  }

  /** Replace the custom theme overrides (on top of the light/dark base and `options.theme`). */
  setTheme(override: GanttThemeOverrides): void {
    this.themeSvc.setTheme(override);
    this.scheduleRender();
  }
  patchTheme(patch: GanttThemeOverrides): void {
    this.themeSvc.patchTheme(patch);
    this.scheduleRender();
  }

  /** Rendered geometry of a task's bar (position in timeline px, size, label) — e.g. to anchor a popover. */
  getBarVisual(id: string): BarVisual | undefined {
    return this.canvasComp?.visuals.get(id);
  }

  /** IDs of the tasks on the critical path (empty unless `options.criticalPath`). */
  get criticalIds(): Set<string> {
    if (!this._options.criticalPath) return new Set();
    const tasks = this.layout.tasks();
    const cfg = this.layout.config();
    // Only the date reading matters — not the config object, which every full render replaces
    const key = `${cfg?.endDateMode}|${cfg?.normalizeDateOnly}`;
    if (this.critical.tasks !== tasks || this.critical.key !== key) {
      this.critical = { tasks, key, ids: computeCriticalPath(tasks, cfg ?? {}).criticalIds };
    }
    return this.critical.ids;
  }

  /** Snapshot of the UI state (panel, view, zoom, column widths, collapsed rows, sort). */
  getState(): GanttState {
    return {
      panelWidth: this.layout.panelWidthPx() ?? (this.panelPx || undefined),
      panelCollapsed: this.layout.view() === 'chart',
      view: this.layout.view(),
      viewMode: this.layout.viewMode(),
      columnWidths: this.colSvc.widths,
      collapsedIds: [...this.layout.collapsedIds()],
      sort: this.layout.sort(),
    };
  }

  /** Restore a state snapshot (e.g. from your backend). */
  setState(state: GanttState, emit = true): void {
    if (state.panelWidth != null) this.layout.panelWidthPx.set(state.panelWidth);
    if (state.view) this.layout.view.set(state.view);
    else if (state.panelCollapsed != null) this.layout.view.set(state.panelCollapsed ? 'chart' : 'split');
    if (state.viewMode) this.layout.viewMode.set(state.viewMode);
    if (state.columnWidths) this.colSvc.setColumnWidths(state.columnWidths);
    if (state.collapsedIds) this.layout.collapsedIds.set(new Set(state.collapsedIds));
    if (state.sort !== undefined) this.layout.sort.set(state.sort);
    if (emit) this.saveState();
    this.scheduleRender();
  }

  // ── State persistence ─────────────────────────────────────

  /** Debounced: emit `state-change` and persist under `options.stateKey`. */
  private saveState(): void {
    clearTimeout(this.stateTimer);
    this.stateTimer = setTimeout(() => {
      this.stateTimer = undefined;
      this.writeState();
    }, 150);
  }

  private writeState(): void {
    const state = this.getState();
    this.emit('state-change', state);
    const key = this._options.stateKey;
    if (key) {
      try {
        window.localStorage.setItem(STATE_PREFIX + key, JSON.stringify(state));
      } catch {
        /* storage unavailable */
      }
    }
  }

  // ── Rendering ─────────────────────────────────────────────

  /** Batch renders into one per frame. `full=false` re-renders rows only (scroll, hover, drag). */
  private scheduleRender(full = true): void {
    if (full) this.fullRenderPending = true;
    if (this.frame || !this.isConnected) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const fullRender = this.fullRenderPending;
      this.fullRenderPending = false;
      try {
        this.render(fullRender);
      } catch (err) {
        console.error('[gantry] render error:', err);
      }
    });
  }

  private i18nBundle(): GanttI18n {
    return { locale: this.i18nSvc.locale, labels: this.i18nSvc.labels, formats: this.i18nSvc.formats };
  }

  /** Resolve options + interactive state into the config the render model reads. */
  private reconfigure(): ResolvedGanttConfig {
    const i18n = this.i18nBundle();
    const cfg = resolveConfig(
      { ...this._options, viewMode: this.layout.viewMode() },
      this.themeSvc.resolvedTheme,
      i18n,
    );
    // A custom zoomLevels list may not contain the current level
    if (cfg.level.name !== this.layout.viewMode()) this.layout.viewMode.set(cfg.level.name);
    this.layout.i18n.set(i18n);
    this.layout.config.set(cfg);
    return cfg;
  }

  private render(full: boolean): void {
    const cfg = full || !this.layout.config() ? this.reconfigure() : this.layout.cfg;
    const theme = cfg.theme;
    const labels = this.i18nSvc.labels;
    const layout = this.layout;
    const view = layout.view();
    // In the coordinates of the painted timeline: read before the DOM changes (and clamps it)
    const scrollLeftBefore = this.canvasViewportEl.scrollLeft;
    // Rebuilt controls lose focus: remember which one had it
    const focusKey = (this.shadow.activeElement as HTMLElement | null)?.dataset?.['focusKey'];

    this.wrapperEl.dataset['view'] = view;
    this.applyPanelWidth(cfg, view);
    layout.viewportWidth.set(Math.max(0, this.canvasViewportEl.clientWidth));

    const tl = layout.timeline;
    const rows = layout.visibleRows;
    const rowHeight = cfg.rowHeight;
    const headerHeight = tl.headerHeight;
    this.style.setProperty('--gantry-toggle-top', `${headerHeight + 24}px`);

    if (full) {
      this.renderToolbar(cfg);
      this.renderLegend(theme);
    }
    // The header only changes with the timeline model (not on vertical scroll)
    if (this.headerTimeline !== tl) {
      this.headerTimeline = tl;
      const headerProps = { timeline: tl, config: cfg, labels };
      if (!this.headerComp) this.headerComp = new GanttHeaderComponent(this.headerContainerEl, headerProps);
      else this.headerComp.updateProps(headerProps);
    }

    // Keep the bottoms of both panes level despite either one's horizontal scrollbar
    const panelSB = this.panelEl.offsetHeight - this.panelEl.clientHeight;
    const canvasSB = this.canvasViewportEl.offsetHeight - this.canvasViewportEl.clientHeight;
    this.tasklistContainerEl.style.paddingBottom = `${Math.max(0, canvasSB - panelSB)}px`;
    this.canvasContainerEl.style.marginBottom = `${Math.max(0, panelSB - canvasSB)}px`;

    // Virtual window shared by both panes
    const viewportH = Math.max(
      rowHeight,
      (this.canvasViewportEl.clientHeight || this.panelEl.clientHeight || 500) - headerHeight,
    );
    const vw = computeVirtualWindow(this.scrollSvc.scrollTop, rowHeight, viewportH, rows.length, 4);
    const windowRows = rows.slice(vw.first, vw.last + 1);

    const ds = this._dataSource;
    const tasklistProps = {
      visibleRows: windowRows,
      rowCount: rows.length,
      columns: this.colSvc.columnsFor(view, cfg),
      cellContext: layout.columnContext,
      rowHeight,
      selectedIds: this.selSvc.selectedIds,
      theme,
      labels,
      colHeaderHeight: headerHeight,
      indentSize: cfg.indentSize,
      paddingTop: vw.paddingTop,
      paddingBottom: vw.paddingBottom,
      sort: layout.sort(),
      loadMore: ds
        ? { isLoading: ds.isLoading, hasMore: ds.hasMore, loadedCount: ds.loadedCount, error: ds.error !== null }
        : null,
      tableView: view === 'table',
    };
    if (!this.tasklistComp) {
      this.tasklistComp = new GanttTaskListComponent(this.tasklistContainerEl, tasklistProps);
      this.tasklistComp.collapseToggle$.subscribe(id => {
        layout.toggleCollapse(id);
        this.saveState();
        this.scheduleRender();
      });
      this.tasklistComp.rowClick$.subscribe(({ row, event }) => this.onRowClick(row, event));
      this.tasklistComp.rowDblClick$.subscribe(row => this.emit('row-dblclick', row));
      this.tasklistComp.sortColumn$.subscribe(key => {
        layout.toggleSort(key);
        this.saveState();
        this.scheduleRender();
      });
      this.tasklistComp.columnWidthChange$.subscribe(({ key, width }) => this.colSvc.setColumnWidth(key, width));
      this.tasklistComp.columnResizeEnd$.subscribe(() => this.saveState());
      this.tasklistComp.loadMore$.subscribe(() => void this._dataSource?.loadNext());
      this.tasklistComp.retry$.subscribe(() => void this._dataSource?.retry());
    } else {
      this.tasklistComp.updateProps(tasklistProps);
    }

    // Timeline (skipped while hidden in table view)
    if (view !== 'table' || !this.canvasComp) {
      this.dragSvc.configure({
        pxPerDay: tl.pxPerDay,
        toX: tl.toX,
        span: (start, end) => taskSpan({ start, end }, cfg),
        snap: bottomScale(cfg.scales).unit === 'hour' ? 'hour' : 'day',
      });
      const allGeometries = layout.rowGeometries;
      const canvasProps = {
        timeline: tl,
        config: cfg,
        labels,
        visibleGeometries: allGeometries.slice(vw.first, vw.last + 1),
        allGeometries,
        windowTop: vw.first * rowHeight,
        windowBottom: (vw.last + 1) * rowHeight,
        totalHeight: layout.totalHeight,
        annotations: this._annotations,
        criticalIds: this.criticalIds,
        selectedIds: this.selSvc.selectedIds,
        enableDrag: this._enableDrag,
        enableResize: this._enableResize,
        dragPreview: this.dragSvc.preview(),
        renderBar: this._renderBar,
      };
      if (!this.canvasComp) this.canvasComp = new GanttCanvasComponent(this.canvasContainerEl, canvasProps);
      else this.canvasComp.updateProps(canvasProps);
    }

    // A requested scroll wins; otherwise the first render with data applies `initialScroll`
    // and later timeline changes keep the anchor date in place
    if (this.pendingScroll) {
      const scroll = this.pendingScroll;
      this.pendingScroll = undefined;
      this.initialScrollDone = true;
      scroll();
    } else if (!this.initialScrollDone && rows.length && view !== 'table') {
      this.initialScrollDone = true;
      const left = initialScrollLeft({
        timeline: tl,
        initialScroll: cfg.initialScroll,
        viewportWidth: this.canvasViewportEl.clientWidth,
        now: this.layout.now(),
      });
      if (left !== null) this.scrollSvc.scrollToX(left, 'instant');
    } else if (view !== 'table') {
      this.keepScrollAnchor(tl, scrollLeftBefore);
    }
    if (view !== 'table') this.paintedTimeline = tl;
    if (focusKey) this.restoreFocus(focusKey);

    // Lazy loading: fetch the next page when the window nears the end — never while
    // a failed page waits for `retry()`, and the first page only per `initialPage`
    if (ds && ds.hasMore && !ds.isLoading && ds.error === null && ds.loadedCount > 0 && vw.last >= rows.length - 3)
      void ds.loadNext();
  }

  /** Focus the rebuilt control that had focus before the render (toolbar, sort header, collapse…). */
  private restoreFocus(key: string): void {
    const active = this.shadow.activeElement as HTMLElement | null;
    if (active?.dataset['focusKey'] === key) return;
    for (const el of this.shadow.querySelectorAll<HTMLElement>('[data-focus-key]')) {
      if (el.dataset['focusKey'] === key) {
        el.focus({ preventScroll: true });
        return;
      }
    }
    // The control is gone (e.g. its row scrolled out of the virtual window): keep focus on the
    // chart, so its keyboard shortcuts keep working, instead of dropping it to <body>
    this.focus({ preventScroll: true });
  }

  /** Keep the date at the viewport centre (zoom) or left edge (new range start) in place. */
  private keepScrollAnchor(tl: TimelineModel, scrollLeft: number): void {
    const prev = this.paintedTimeline;
    if (!prev || prev === tl) return;
    const zoomed = prev.pxPerDay !== tl.pxPerDay;
    if (!zoomed && prev.start.getTime() === tl.start.getTime()) return;
    const anchorX = zoomed ? this.canvasViewportEl.clientWidth / 2 : 0;
    this.scrollSvc.scrollToX(zoomAnchorScroll(prev, tl, scrollLeft, anchorX), 'instant');
  }

  /** Panel width for the current view; split view honours the user's last width. */
  private applyPanelWidth(cfg: ResolvedGanttConfig, view: GanttView): void {
    const hostW = this.mainEl.clientWidth || this.clientWidth || 1000;
    const splitterW = this.splitterEl.offsetWidth || 6;
    let width: number;
    if (view === 'table') width = hostW;
    else if (view === 'chart') width = 0;
    else
      width = this.clampPanel(
        this.layout.panelWidthPx() ?? resolveLength(cfg.panel.width, hostW, 320),
        cfg,
        hostW - splitterW,
      );
    if (width !== this.panelPx) {
      this.panelPx = width;
      this.panelEl.style.width = `${width}px`;
    }
    this.panelEl.inert = view === 'chart';
    // Hidden behind the table view: out of the tab order and the accessibility tree
    this.canvasViewportEl.inert = view === 'table';
    this.splitterEl.dataset['resizable'] = String(cfg.panel.resizable && view === 'split');
    this.toggleEl.hidden = !cfg.panel.collapsible;
    const collapsed = view === 'chart';
    this.toggleEl.textContent = collapsed ? '›' : '‹';
    const label = collapsed ? this.i18nSvc.labels.showPanel : this.i18nSvc.labels.hidePanel;
    this.toggleEl.title = label;
    this.toggleEl.setAttribute('aria-label', label);
    this.toggleEl.setAttribute('aria-expanded', String(!collapsed));
  }

  private clampPanel(px: number, cfg: ResolvedGanttConfig, available: number): number {
    const max = Math.min(available - 40, resolveLength(cfg.panel.maxWidth, available, available));
    return Math.round(Math.max(cfg.panel.minWidth, Math.min(px, max)));
  }

  private renderToolbar(cfg: ResolvedGanttConfig): void {
    const show = this._showToolbar && cfg.toolbar !== false;
    if (!show || cfg.toolbar === false) {
      this.toolbarComp?.destroy();
      this.toolbarComp = undefined;
      return;
    }
    const props = {
      toolbar: cfg.toolbar,
      zoomLevels: cfg.zoomLevels,
      currentView: this.layout.viewMode(),
      view: this.layout.view(),
      labels: this.i18nSvc.labels,
    };
    if (this.toolbarComp) {
      this.toolbarComp.updateProps(props);
      return;
    }
    this.toolbarComp = new GanttToolbarComponent(this.toolbarContainerEl, props);
    this.toolbarComp.zoomIn$.subscribe(() => this.zoomIn());
    this.toolbarComp.zoomOut$.subscribe(() => this.zoomOut());
    this.toolbarComp.viewModeChange$.subscribe(vm => this.setViewMode(vm));
    this.toolbarComp.scrollToToday$.subscribe(() => this.scrollToToday());
    this.toolbarComp.viewChange$.subscribe(v => this.setView(v));
  }

  private renderLegend(theme: Required<GanttTheme>): void {
    const labels = this.i18nSvc.labels;
    const items: { color: string; label: string; dashed: boolean }[] = [];
    if (this.layout.timeline.todayX >= 0) {
      items.push({ color: theme.todayColor, label: labels.today, dashed: false });
    }
    for (const ann of this._annotations) {
      items.push({ color: ann.color ?? theme.arrowColor, label: ann.label?.text ?? labels.annotation, dashed: true });
    }

    // The legend explains timeline markers: nothing to explain in the table view
    this.legendEl.hidden = !this._showLegend || !items.length || this.layout.view() === 'table';
    this.legendEl.replaceChildren();
    if (this.legendEl.hidden) return;

    const title = document.createElement('span');
    title.className = 'gantt-legend-title';
    title.textContent = labels.legend;
    this.legendEl.appendChild(title);
    for (const item of items) {
      const el = document.createElement('span');
      el.className = 'gantt-legend-item';
      el.innerHTML = `<svg width="18" height="12" aria-hidden="true"><line x1="9" y1="0" x2="9" y2="12" stroke-width="2"${item.dashed ? ' stroke-dasharray="3 2"' : ''}/></svg><span></span>`;
      el.querySelector('line')!.setAttribute('stroke', item.color);
      el.querySelector('span')!.textContent = item.label;
      this.legendEl.appendChild(el);
    }
  }

  // ── Interaction ───────────────────────────────────────────

  private emit<K extends keyof GantryEventDetailMap>(type: K, detail: GantryEventDetailMap[K]): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  private onRowClick(row: GanttFlatRow, event: MouseEvent | KeyboardEvent): void {
    const { enabled, multi } = this.layout.cfg.selection;
    if (enabled) {
      const e = multi ? event : ({ ctrlKey: false, metaKey: false, shiftKey: false } as MouseEvent);
      this.selSvc.handleClick(row.task.id, e, this.layout.visibleRows);
    }
    this.emit('row-click', row);
  }

  /** Splitter: drag to resize the task list, button / Enter to collapse. */
  private bindSplitter(): void {
    const splitter = this.splitterEl;
    this.toggleEl.addEventListener('pointerdown', e => e.stopPropagation());
    this.toggleEl.addEventListener('click', () => this.togglePanel());

    splitter.addEventListener('pointerdown', e => {
      const cfg = this.layout.config();
      if (e.button !== 0 || !cfg?.panel.resizable || this.layout.view() !== 'split') return;
      e.preventDefault();
      const startX = e.clientX;
      const startW = this.panelPx;
      const available = (this.mainEl.clientWidth || 1000) - splitter.offsetWidth;
      this.mainEl.classList.add('is-resizing');
      try {
        splitter.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic event */
      }
      const move = (ev: PointerEvent) => {
        this.layout.panelWidthPx.set(this.clampPanel(startW + ev.clientX - startX, cfg, available));
        this.scheduleRender(false);
      };
      const end = () => {
        splitter.removeEventListener('pointermove', move);
        splitter.removeEventListener('pointerup', end);
        splitter.removeEventListener('pointercancel', end);
        this.mainEl.classList.remove('is-resizing');
        this.saveState();
      };
      splitter.addEventListener('pointermove', move);
      splitter.addEventListener('pointerup', end);
      splitter.addEventListener('pointercancel', end);
    });

    splitter.addEventListener('keydown', e => {
      const cfg = this.layout.config();
      if (!cfg) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.togglePanel();
      } else if (
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        this.layout.view() === 'split' &&
        cfg.panel.resizable
      ) {
        e.preventDefault();
        const available = (this.mainEl.clientWidth || 1000) - splitter.offsetWidth;
        this.layout.panelWidthPx.set(
          this.clampPanel(this.panelPx + (e.key === 'ArrowLeft' ? -24 : 24), cfg, available),
        );
        this.saveState();
        this.scheduleRender(false);
      }
    });
  }

  /** Bar group (`[data-task-id]`) under an event target inside the canvas. */
  private barAt(target: EventTarget | null): SVGElement | null {
    return (target as Element | null)?.closest?.<SVGElement>('[data-task-id]') ?? null;
  }

  /** Visible row under a canvas-relative pointer position. */
  private rowAtPointer(e: MouseEvent): GanttFlatRow | undefined {
    const top = this.canvasContainerEl.getBoundingClientRect().top;
    const index = Math.floor((e.clientY - top) / this.layout.rowHeight);
    return this.layout.visibleRows[index];
  }

  private resizeHandleAt(bar: SVGElement, clientX: number): 'left' | 'right' | null {
    if (!this._enableResize) return null;
    const handles = this.canvasComp?.visuals.get(bar.getAttribute('data-task-id')!)?.handles;
    if (!handles) return null;
    const x = clientX - this.canvasContainerEl.getBoundingClientRect().left;
    if (x >= handles.left[0] && x <= handles.left[1]) return 'left';
    if (x >= handles.right[0] && x <= handles.right[1]) return 'right';
    return null;
  }

  private bindCanvasInteractions(): void {
    const canvas = this.canvasContainerEl;

    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const bar = this.barAt(e.target);
      if (!bar || !this._enableDrag || !bar.classList.contains('gantt-bar-draggable')) return;
      const geo = this.layout.geometryById.get(bar.getAttribute('data-task-id')!);
      if (!geo) return;
      this.focus({ preventScroll: true });
      this.tooltip.hide();
      this.dragSvc.startDrag(e, geo, this.resizeHandleAt(bar, e.clientX) ?? 'bar', canvas);
    });

    canvas.addEventListener('click', e => {
      if (this.dragSvc.lastDragMoved) {
        this.dragSvc.lastDragMoved = false;
        return;
      }
      const row = this.rowAtPointer(e);
      if (row) this.onRowClick(row, e);
    });

    canvas.addEventListener('dblclick', e => {
      const row = this.rowAtPointer(e);
      if (row) this.emit('row-dblclick', row);
    });

    canvas.addEventListener('pointermove', e => {
      if (this.dragSvc.state().kind !== 'idle') return;
      const bar = this.barAt(e.target);
      canvas.style.cursor =
        bar && bar.classList.contains('gantt-bar-draggable') && this.resizeHandleAt(bar, e.clientX) ? 'ew-resize' : '';
      if (!this._tooltipEnabled) return;
      const task = bar && this.layout.geometryById.get(bar.getAttribute('data-task-id')!)?.row.task;
      if (task) {
        this.tooltip.enter(task, e, this.themeSvc.resolvedTheme, this.layout.config() ?? undefined);
        this.tooltip.move(e);
      } else {
        this.tooltip.leave();
      }
    });

    canvas.addEventListener('pointerleave', () => this.tooltip.leave());
  }

  private onKeyDown(event: KeyboardEvent): void {
    // Don't hijack typing inside slotted/custom cell inputs, editable cells or the splitter
    if (event.defaultPrevented) return;
    const origin = event.composedPath()[0] as HTMLElement | undefined;
    if (origin && (/^(INPUT|TEXTAREA|SELECT)$/.test(origin.tagName) || origin.isContentEditable)) return;
    if (origin === this.splitterEl) return;

    const ctrl = event.ctrlKey || event.metaKey;
    switch (event.key) {
      case 'Escape':
        if (this.dragSvc.state().kind !== 'idle') this.dragSvc.cancel();
        else this.selSvc.clear();
        event.preventDefault();
        break;
      case 'a':
      case 'A':
        if (ctrl) {
          this.selectAll();
          event.preventDefault();
        }
        break;
      case '+':
      case '=':
        if (!ctrl) {
          this.zoomIn();
          event.preventDefault();
        }
        break;
      case '-':
        if (!ctrl) {
          this.zoomOut();
          event.preventDefault();
        }
        break;
      case 't':
      case 'T':
        if (!ctrl) {
          this.scrollToToday();
          event.preventDefault();
        }
        break;
    }
  }
}

function readState(key: string): GanttState | null {
  try {
    const raw = window.localStorage.getItem(STATE_PREFIX + key);
    return raw ? (JSON.parse(raw) as GanttState) : null;
  } catch {
    return null;
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
