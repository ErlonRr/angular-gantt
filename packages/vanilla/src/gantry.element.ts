/**
 * @file gantry.element.ts
 * Root Web Component (<gantry-element>) orchestrating all Vanilla JS services and subcomponents.
 *
 * Layout:
 * ┌──────────────────────────────────────────────────────────┐
 * │  toolbar                       (optional, showToolbar)   │
 * ├─────────────────┬────────────────────────────────────────┤
 * │  task list      │  timeline viewport: scroll X+Y         │
 * │  (scrolls Y,    │    ├ header (sticky top)               │
 * │   mirrored)     │    └ canvas (virtualised SVG rows)     │
 * └─────────────────┴────────────────────────────────────────┘
 */

import {
  GanttTask, GanttOptions, GanttAnnotation, GanttTheme, GanttFlatRow, ViewMode,
  computeCriticalPath,
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
import { GanttCanvasComponent, GanttBarRenderer, isResizable } from './layout/gantt-canvas.component';
import { GanttToolbarComponent } from './annotations/gantt-toolbar.component';
import { GanttTooltip } from './tooltip/gantt-tooltip';
import { GanttDataSource } from './datasource/gantt-datasource';
import { computeVirtualWindow } from './virtual-scroll/virtual-window';
import type {
  VanillaColumnDef, GanttDataSourceConfig, GantryEventDetailMap, GantryEventMap,
} from './types';

/** Pointer distance (px) from a bar edge that starts a resize instead of a move. */
const RESIZE_HANDLE_PX = 8;

const template = typeof document === 'undefined' ? null : document.createElement('template');
if (template) template.innerHTML = `
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
    :host(:focus-visible) { box-shadow: inset 0 0 0 2px var(--gantt-sel-border, #3B82F6); }
    :host([hidden]) { display: none; }

    .gantry-wrapper {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      background: var(--gantt-bg);
      overflow: hidden;
    }
    .gantry-main { display: flex; flex: 1; overflow: hidden; min-height: 0; }
    .gantry-panel {
      flex-shrink: 0;
      overflow-y: auto;
      overflow-x: hidden;
      background: var(--gantt-panel-bg);
      border-right: 1px solid var(--gantt-panel-border);
    }
    .gantry-panel[hidden] { display: none; }
    .gantry-canvas-viewport { flex: 1; overflow: auto; position: relative; min-width: 0; }
    .gantry-canvas-header-sticky {
      position: sticky;
      top: 0;
      z-index: 10;
      background: var(--gantt-header-bg);
    }
    .gantry-panel, .gantry-canvas-viewport {
      scrollbar-width: thin;
      scrollbar-color: var(--gantt-scrollbar-thumb) var(--gantt-scrollbar-track);
    }
    .gantry-panel::-webkit-scrollbar, .gantry-canvas-viewport::-webkit-scrollbar { width: 6px; height: 6px; }
    .gantry-panel::-webkit-scrollbar-track, .gantry-canvas-viewport::-webkit-scrollbar-track { background: var(--gantt-scrollbar-track); }
    .gantry-panel::-webkit-scrollbar-thumb, .gantry-canvas-viewport::-webkit-scrollbar-thumb {
      background: var(--gantt-scrollbar-thumb);
      border-radius: 3px;
    }
    /* Hide the panel's own scrollbar — the timeline's scrollbar drives both */
    .gantry-panel { scrollbar-width: none; }
    .gantry-panel::-webkit-scrollbar { display: none; }

    .gantt-bar-draggable { cursor: grab; }
    .gantry-dragging, .gantry-dragging .gantt-bar-draggable { cursor: grabbing; }
    .gantt-tl-row:hover { filter: brightness(0.97); }

    .gantt-legend {
      position: absolute;
      bottom: 12px;
      right: 12px;
      z-index: 15;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 11px;
      background: var(--gantt-panel-bg);
      border: 1px solid var(--gantt-border);
      color: var(--gantt-text-sec);
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
      pointer-events: none;
    }
    .gantt-legend-title {
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .4px;
      font-size: 9.5px;
      color: var(--gantt-text-muted);
    }
    .gantt-legend-item { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; color: var(--gantt-text); }
  </style>
  <div class="gantry-wrapper" part="wrapper">
    <div class="gantry-toolbar-container" part="toolbar"></div>
    <div class="gantry-main">
      <div class="gantry-panel" part="panel">
        <div class="gantry-tasklist-container"></div>
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
`;

const BOOLEAN_ATTRS = {
  'show-toolbar': 'showToolbar',
  'enable-drag': 'enableDrag',
  'enable-resize': 'enableResize',
  'tooltip-enabled': 'tooltipEnabled',
  'show-legend': 'showLegend',
} as const;

const parseBool = (v: string | null) => v !== null && v !== 'false';

// Typed event listener overloads (`el.addEventListener('task-dragged', e => e.detail.taskId)`)
export interface GantryElement {
  addEventListener<K extends keyof GantryEventMap>(
    type: K, listener: (this: GantryElement, ev: GantryEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions): void;
  addEventListener<K extends keyof HTMLElementEventMap>(
    type: K, listener: (this: GantryElement, ev: HTMLElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions): void;
  addEventListener(
    type: string, listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions): void;
  removeEventListener<K extends keyof GantryEventMap>(
    type: K, listener: (this: GantryElement, ev: GantryEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions): void;
  removeEventListener<K extends keyof HTMLElementEventMap>(
    type: K, listener: (this: GantryElement, ev: HTMLElementEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions): void;
  removeEventListener(
    type: string, listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions): void;
}

// Allow importing (not defining) the element during SSR, where HTMLElement doesn't exist
const BaseElement: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;

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

  private readonly toolbarContainerEl: HTMLElement;
  private readonly panelEl: HTMLElement;
  private readonly tasklistContainerEl: HTMLElement;
  private readonly canvasViewportEl: HTMLElement;
  private readonly headerContainerEl: HTMLElement;
  private readonly canvasContainerEl: HTMLElement;
  private readonly legendEl: HTMLElement;

  private headerComp?: GanttHeaderComponent;
  private tasklistComp?: GanttTaskListComponent;
  private canvasComp?: GanttCanvasComponent;
  private toolbarComp?: GanttToolbarComponent;

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
  private _renderBar?: GanttBarRenderer;

  // ── Render bookkeeping ────────────────────────────────────
  private frame = 0;
  /** true = toolbar/header/legend need re-rendering too, not just the rows */
  private fullRenderPending = false;
  private resizeObserver?: ResizeObserver;
  private scrolledToToday = false;
  private critical: { tasks: GanttTask[] | null; ids: Set<string> } = { tasks: null, ids: new Set() };
  private lastViewMode: ViewMode;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
    this.shadow.appendChild(template!.content.cloneNode(true));

    const $ = (sel: string) => this.shadow.querySelector<HTMLElement>(sel)!;
    this.toolbarContainerEl = $('.gantry-toolbar-container');
    this.panelEl = $('.gantry-panel');
    this.tasklistContainerEl = $('.gantry-tasklist-container');
    this.canvasViewportEl = $('.gantry-canvas-viewport');
    this.headerContainerEl = $('.gantry-header-container');
    this.canvasContainerEl = $('.gantry-canvas-container');
    this.legendEl = $('.gantt-legend');

    this.tooltip = new GanttTooltip(this.shadow, this.i18nSvc);
    this.lastViewMode = this.layout.viewMode();

    this.scrollSvc.bindViewports(this.panelEl, this.canvasViewportEl);
    this.scrollSvc.onScroll = () => this.scheduleRender(false);

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
    this.dragSvc.state.subscribe(s =>
      this.canvasContainerEl.classList.toggle('gantry-dragging', s.kind !== 'idle'));

    this.selSvc.onChange = e => {
      this.emit('selection-change', e);
      this.scheduleRender(false);
    };

    this.layout.viewMode.subscribe(vm => {
      if (vm === this.lastViewMode) return;
      this.lastViewMode = vm;
      this.emit('view-mode-change', { viewMode: vm });
    });

    this.bindCanvasInteractions();
    this.addEventListener('keydown', e => this.onKeyDown(e));
  }

  // ── Lifecycle ─────────────────────────────────────────────

  connectedCallback(): void {
    // Attributes/styles may only be added once connected (not in the constructor)
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this.themeSvc.init(this, this._darkMode);
    this.resizeObserver = new ResizeObserver(() => this.scheduleRender(false));
    this.resizeObserver.observe(this.canvasViewportEl);
    this.scheduleRender();
  }

  disconnectedCallback(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.themeSvc.destroy();
    this.tooltip.hide();
    this.dragSvc.cancel();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === 'dark-mode') {
      this.darkMode = value === 'auto' ? 'auto' : parseBool(value);
    } else if (name === 'view-mode') {
      if (value) this.setViewMode(value as ViewMode);
    } else if (name in BOOLEAN_ATTRS) {
      // missing attribute = default (true), except show-legend which defaults to false
      const prop = BOOLEAN_ATTRS[name as keyof typeof BOOLEAN_ATTRS];
      this[prop] = value === null ? prop !== 'showLegend' : parseBool(value);
    }
  }

  // ── Properties ────────────────────────────────────────────

  /** Tasks to display. Ignored while a `dataSource` is set. */
  get tasks(): GanttTask[] { return this.layout.tasks(); }
  set tasks(val: GanttTask[]) {
    if (this._dataSource) return;
    this.layout.setTasks(val ?? []);
    this.scheduleRender();
  }

  get columns(): VanillaColumnDef[] { return this.colSvc.columns; }
  set columns(val: VanillaColumnDef[] | null | undefined) {
    if (val?.length) this.colSvc.setColumns(val);
    else this.colSvc.resetColumns();
    this.scheduleRender();
  }

  get options(): GanttOptions { return this._options; }
  set options(val: GanttOptions | null | undefined) {
    const opts = val ?? {};
    this._options = opts;
    this.layout.applyOptions(opts);
    this.i18nSvc.apply(opts);
    if (opts.columns?.length) this.colSvc.setColumns(opts.columns);
    else this.colSvc.refresh();
    this.themeSvc.resetTheme();
    if (opts.theme) this.themeSvc.patchTheme(opts.theme);
    if (opts.darkMode != null) this.darkMode = opts.darkMode;
    this.scheduleRender();
  }

  get annotations(): GanttAnnotation[] { return this._annotations; }
  set annotations(val: GanttAnnotation[]) {
    this._annotations = val ?? [];
    this.scheduleRender();
  }

  /** `true` / `false` / `'auto'` (follows `prefers-color-scheme`). */
  get darkMode(): boolean | 'auto' { return this._darkMode; }
  set darkMode(val: boolean | 'auto') {
    this._darkMode = val;
    this.themeSvc.setDarkMode(val);
    this.scheduleRender();
  }

  get showToolbar(): boolean { return this._showToolbar; }
  set showToolbar(val: boolean) { this._showToolbar = val; this.scheduleRender(); }

  get enableDrag(): boolean { return this._enableDrag; }
  set enableDrag(val: boolean) { this._enableDrag = val; this.scheduleRender(); }

  get enableResize(): boolean { return this._enableResize; }
  set enableResize(val: boolean) { this._enableResize = val; this.scheduleRender(); }

  get tooltipEnabled(): boolean { return this._tooltipEnabled; }
  set tooltipEnabled(val: boolean) {
    this._tooltipEnabled = val;
    if (!val) this.tooltip.hide();
  }

  /** Floating legend explaining the vertical markers (today + annotations). */
  get showLegend(): boolean { return this._showLegend; }
  set showLegend(val: boolean) { this._showLegend = val; this.scheduleRender(); }

  /**
   * Lazy, paged loading. Pass `{ fetcher, pageSize }` or a `GanttDataSource`.
   * While set, it owns the task list (the `tasks` property is ignored).
   */
  get dataSource(): GanttDataSource | null { return this._dataSource; }
  set dataSource(val: GanttDataSource | GanttDataSourceConfig | null | undefined) {
    if (this._dataSource) this._dataSource.onChange = undefined;
    const ds = val == null ? null : val instanceof GanttDataSource ? val : new GanttDataSource(val);
    this._dataSource = ds;
    if (!ds) return;
    ds.onChange = () => {
      this.layout.setTasks(ds.items);
      this.scheduleRender();
    };
    this.layout.setTasks(ds.items);
    if (ds.loadedCount === 0) void ds.loadNext();
    this.scheduleRender();
  }

  /** Replace or decorate the built-in bar SVG (see `GanttBarRenderer`). */
  get renderBar(): GanttBarRenderer | undefined { return this._renderBar; }
  set renderBar(fn: GanttBarRenderer | undefined) { this._renderBar = fn; this.scheduleRender(); }

  // ── Public API ────────────────────────────────────────────

  zoomIn(): void { this.layout.zoomIn(); this.scheduleRender(); }
  zoomOut(): void { this.layout.zoomOut(); this.scheduleRender(); }

  get viewMode(): ViewMode { return this.layout.viewMode(); }
  setViewMode(mode: ViewMode): void {
    this.layout.viewMode.set(mode);
    this.scheduleRender();
  }

  scrollToToday(behavior: ScrollBehavior = 'smooth'): void {
    this.scrollSvc.scrollToToday(this.layout.startDate, this.layout.pxPerDay, behavior);
  }

  scrollToDate(date: Date, behavior: ScrollBehavior = 'smooth'): void {
    this.scrollSvc.scrollToDate(date, this.layout.startDate, this.layout.pxPerDay, behavior);
  }

  /** Scroll the given task into view (vertically and horizontally). */
  scrollToTask(id: string, behavior: ScrollBehavior = 'smooth'): void {
    const geo = this.layout.geometryById.get(id);
    if (!geo) return;
    this.scrollSvc.scrollToRow(geo.row.visibleIndex, this.layout.rowHeight(), behavior);
    this.scrollToDate(geo.row.task.start, behavior);
  }

  getSelectedTasks(): GanttTask[] {
    const ids = this.selSvc.selectedIds;
    return this.layout.tasks().filter(t => ids.has(t.id));
  }
  setSelectedTasks(ids: string[]): void {
    this.selSvc.setSelected(ids);
  }
  clearSelection(): void { this.selSvc.clear(); }
  selectAll(): void { this.selSvc.selectAll(this.layout.visibleRows); }

  updateTask(id: string, patch: Partial<GanttTask>): void {
    this.layout.updateTask(id, patch);
    this.scheduleRender();
  }
  appendTasks(tasks: GanttTask[]): void {
    this.layout.appendTasks(tasks);
    this.scheduleRender();
  }

  collapseAll(): void { this.layout.collapseAll(); this.scheduleRender(); }
  expandAll(): void { this.layout.expandAll(); this.scheduleRender(); }
  togglePanel(): void { this.layout.panelVisible.update(v => !v); this.scheduleRender(); }

  /** Replace the custom theme overrides (on top of the light/dark base). */
  setTheme(override: Partial<GanttTheme>): void {
    this.themeSvc.resetTheme();
    this.themeSvc.patchTheme(override);
    this.scheduleRender();
  }
  patchTheme(patch: Partial<GanttTheme>): void {
    this.themeSvc.patchTheme(patch);
    this.scheduleRender();
  }

  /** IDs of the tasks on the critical path (empty unless `options.criticalPath`). */
  get criticalIds(): Set<string> {
    if (!this.layout.showCriticalPath()) return new Set();
    const tasks = this.layout.tasks();
    if (this.critical.tasks !== tasks) {
      this.critical = { tasks, ids: computeCriticalPath(tasks).criticalIds };
    }
    return this.critical.ids;
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

  private render(full: boolean): void {
    const theme = this.themeSvc.resolvedTheme;
    const labels = this.i18nSvc.labels;
    const layout = this.layout;
    const rows = layout.visibleRows;
    const rowHeight = layout.rowHeight();
    const headerHeight = layout.totalHeaderHeight;

    if (full || !this.headerComp) {
      this.renderToolbar(theme);
      this.renderHeader(theme);
      this.renderLegend(theme);
    }

    // Left panel
    this.panelEl.hidden = !layout.panelVisible();
    this.panelEl.style.width = `${layout.panelWidth()}px`;
    // Keep panel & timeline scroll heights equal despite the timeline's horizontal scrollbar
    const hScrollbar = this.canvasViewportEl.offsetHeight - this.canvasViewportEl.clientHeight;
    this.tasklistContainerEl.style.paddingBottom = `${Math.max(0, hScrollbar)}px`;

    // Virtual window shared by both panes
    const viewportH = Math.max(rowHeight, (this.canvasViewportEl.clientHeight || 500) - headerHeight);
    const vw = computeVirtualWindow(this.scrollSvc.scrollTop, rowHeight, viewportH, rows.length, 4);
    const windowRows = rows.slice(vw.first, vw.last + 1);

    const ds = this._dataSource;
    const tasklistProps = {
      visibleRows: windowRows,
      rowCount: rows.length,
      columns: this.colSvc.columns,
      rowHeight,
      selectedIds: this.selSvc.selectedIds,
      theme,
      labels,
      colHeaderHeight: headerHeight,
      indentSize: 16,
      paddingTop: vw.paddingTop,
      paddingBottom: vw.paddingBottom,
      sort: layout.sort(),
      loadMore: ds ? { isLoading: ds.isLoading, hasMore: ds.hasMore, loadedCount: ds.loadedCount } : null,
    };
    if (!this.tasklistComp) {
      this.tasklistComp = new GanttTaskListComponent(this.tasklistContainerEl, tasklistProps);
      this.tasklistComp.collapseToggle$.subscribe(id => {
        layout.toggleCollapse(id);
        this.scheduleRender();
      });
      this.tasklistComp.rowClick$.subscribe(({ row, event }) => this.onRowClick(row, event));
      this.tasklistComp.rowDblClick$.subscribe(row => this.emit('row-dblclick', row));
      this.tasklistComp.sortColumn$.subscribe(key => {
        layout.toggleSort(key);
        this.scheduleRender();
      });
      this.tasklistComp.loadMore$.subscribe(() => void this._dataSource?.loadNext());
    } else {
      this.tasklistComp.updateProps(tasklistProps);
    }

    // Timeline
    const startDate = layout.startDate;
    const pxPerDay = layout.pxPerDay;
    const layoutParams = { origin: startDate, pxPerDay, rowHeight };
    this.dragSvc.configure(layoutParams);

    const allGeometries = layout.rowGeometries;
    const canvasProps = {
      visibleGeometries: allGeometries.slice(vw.first, vw.last + 1),
      allGeometries,
      windowTop: vw.first * rowHeight,
      windowBottom: (vw.last + 1) * rowHeight,
      totalWidth: layout.totalWidth,
      totalHeight: layout.totalHeight,
      gridLines: layout.gridLines,
      theme,
      todayX: layout.todayX,
      annotations: this._annotations,
      criticalIds: this.criticalIds,
      selectedIds: this.selSvc.selectedIds,
      layoutParams,
      showBaseline: layout.showBaseline(),
      enableDrag: this._enableDrag,
      enableResize: this._enableResize,
      dragPreview: this.dragSvc.preview(),
      ariaLabel: labels.ariaChart,
      renderBar: this._renderBar,
    };
    if (!this.canvasComp) this.canvasComp = new GanttCanvasComponent(this.canvasContainerEl, canvasProps);
    else this.canvasComp.updateProps(canvasProps);

    // First render with data: bring today into view
    if (!this.scrolledToToday && rows.length) {
      this.scrolledToToday = true;
      this.scrollToToday('instant');
    }

    // Lazy loading: fetch the next page when the window nears the end
    if (ds && ds.hasMore && !ds.isLoading && vw.last >= rows.length - 3) void ds.loadNext();
  }

  private renderToolbar(theme: GanttTheme): void {
    if (!this._showToolbar) {
      this.toolbarComp?.destroy();
      this.toolbarComp = undefined;
      this.toolbarContainerEl.removeAttribute('style');
      return;
    }
    const props = { theme, currentView: this.layout.viewMode(), i18n: this.i18nSvc };
    if (this.toolbarComp) {
      this.toolbarComp.updateProps(props);
      return;
    }
    this.toolbarComp = new GanttToolbarComponent(this.toolbarContainerEl, props);
    this.toolbarComp.zoomIn$.subscribe(() => this.zoomIn());
    this.toolbarComp.zoomOut$.subscribe(() => this.zoomOut());
    this.toolbarComp.viewModeChange$.subscribe(vm => this.setViewMode(vm));
    this.toolbarComp.scrollToToday$.subscribe(() => this.scrollToToday());
  }

  private renderHeader(theme: GanttTheme): void {
    const layout = this.layout;
    const props = {
      viewMode: layout.viewMode(),
      startDate: layout.startDate,
      endDate: layout.endDate,
      pxPerDay: layout.pxPerDay,
      totalWidth: layout.totalWidth,
      theme,
      i18nService: this.i18nSvc,
    };
    if (!this.headerComp) this.headerComp = new GanttHeaderComponent(this.headerContainerEl, props);
    else this.headerComp.updateProps(props);
  }

  private renderLegend(theme: GanttTheme): void {
    const labels = this.i18nSvc.labels;
    const items: { color: string; label: string; dashed: boolean }[] = [];
    if (this.layout.showToday() && this.layout.todayX >= 0) {
      items.push({ color: theme.todayColor, label: labels.today, dashed: false });
    }
    for (const ann of this._annotations) {
      items.push({ color: ann.color ?? theme.arrowColor, label: ann.label?.text ?? labels.annotation, dashed: true });
    }

    this.legendEl.hidden = !this._showLegend || !items.length;
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

  private onRowClick(row: GanttFlatRow, event: MouseEvent): void {
    this.selSvc.handleClick(row.task.id, event, this.layout.visibleRows);
    this.emit('row-click', row);
  }

  /** Bar group (`[data-task-id]`) under an event target inside the canvas. */
  private barAt(target: EventTarget | null): SVGElement | null {
    return (target as Element | null)?.closest?.<SVGElement>('[data-task-id]') ?? null;
  }

  /** Visible row under a canvas-relative pointer position. */
  private rowAtPointer(e: MouseEvent): GanttFlatRow | undefined {
    const top = this.canvasContainerEl.getBoundingClientRect().top;
    const index = Math.floor((e.clientY - top) / this.layout.rowHeight());
    return this.layout.visibleRows[index];
  }

  private resizeHandleAt(bar: SVGElement, clientX: number): 'left' | 'right' | null {
    if (!this._enableResize || !isResizable(bar.getAttribute('data-bar-type') ?? 'task')) return null;
    const rect = (bar.querySelector('.gantt-bar-bg') ?? bar).getBoundingClientRect();
    if (rect.width < RESIZE_HANDLE_PX * 3) return null; // too narrow: move only
    if (clientX - rect.left <= RESIZE_HANDLE_PX) return 'left';
    if (rect.right - clientX <= RESIZE_HANDLE_PX) return 'right';
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
      canvas.style.cursor = bar && bar.classList.contains('gantt-bar-draggable') && this.resizeHandleAt(bar, e.clientX)
        ? 'ew-resize' : '';
      if (!this._tooltipEnabled) return;
      const task = bar && this.layout.geometryById.get(bar.getAttribute('data-task-id')!)?.row.task;
      if (task) {
        this.tooltip.enter(task, e, this.themeSvc.resolvedTheme);
        this.tooltip.move(e);
      } else {
        this.tooltip.leave();
      }
    });

    canvas.addEventListener('pointerleave', () => this.tooltip.leave());
  }

  private onKeyDown(event: KeyboardEvent): void {
    // Don't hijack typing inside slotted/custom cell inputs
    const origin = event.composedPath()[0] as HTMLElement | undefined;
    if (origin && /^(INPUT|TEXTAREA|SELECT)$/.test(origin.tagName)) return;

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

declare global {
  interface HTMLElementTagNameMap {
    'gantry-element': GantryElement;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('gantry-element')) {
  customElements.define('gantry-element', GantryElement);
}
