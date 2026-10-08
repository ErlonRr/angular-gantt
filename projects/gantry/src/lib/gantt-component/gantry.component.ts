// ─────────────────────────────────────────────────────────────
//  gantry · gantt-component/gantry.component.ts
//
//  Root compositor — wires every service and child component.
//
//  Layout:
//  ┌──────────────────────────────────────────────────────────────┐
//  │  <gantt-toolbar>                        (options.toolbar)    │
//  ├────────────────┬─┬───────────────────────────────────────────┤
//  │  <gantt-       │s│  #canvasEl: scroll X+Y                    │
//  │   tasklist>    │p│    ├ <gantt-header> tiers (sticky top)    │
//  │  (scrolls X,   │l│    └ <gantt-canvas>                       │
//  │   Y mirrored)  │ │                                           │
//  ├────────────────┴─┴───────────────────────────────────────────┤
//  │  <ng-content select="[ganttFooter]">                         │
//  └──────────────────────────────────────────────────────────────┘
//  Views: 'split' (both), 'table' (task list only), 'chart' (timeline only).
//
//  Geometry comes from the @gantry/core render model (shared with the
//  Web Component). The component itself contains no layout math.
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  input,
  output,
  signal,
  computed,
  effect,
  inject,
  Injector,
  runInInjectionContext,
  viewChild,
  ElementRef,
  untracked,
} from '@angular/core';

import {
  GanttTask,
  GanttOptions,
  GanttAnnotation,
  GanttTheme,
  GanttState,
  GanttView,
  ViewMode,
  ColumnDef,
  TaskDragEvent,
  TaskResizeEvent,
  SelectionChangeEvent,
  RowGeometry,
  GanttFlatRow,
} from '../types';
import { resolveConfig, resolveLength, type ResolvedGanttConfig } from '@gantry/core';

import { GanttLayoutService } from '../layout/gantt-layout.service';
import { GanttCanvasComponent } from '../layout/gantt-canvas.component';
import { GanttHeaderComponent } from '../header/gantt-header.component';
import { GanttTaskListComponent } from '../tasklist/gantt-tasklist.component';
import { GanttToolbarComponent } from '../annotations/gantt-toolbar.component';
import { GanttScrollService } from '../scroll/gantt-scroll.service';
import { GanttThemeService } from '../services/gantt-theme.service';
import { GanttI18nService } from '../services/gantt-i18n.service';
import { GanttColumnService } from '../columns/gantt-column.service';
import { GanttSelectionService } from '../selection/gantt-selection.service';
import { GanttDragService } from '../drag/gantt-drag.service';
import { GanttKeyboardDirective } from '../selection/gantt-keyboard.directive';
import { GanttLoadMoreComponent } from '../datasource/gantt-load-more.component';
import { GanttDataSource } from '../datasource/gantt-datasource';
import { computeCriticalPath } from '../gantt-cpm';
import { computeVirtualWindow } from '../virtual-scroll/virtual-window';

const STATE_PREFIX = 'gantry:';
const SPLITTER_PX = 6;

@Component({
  selector: 'gantry',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    GanttLayoutService,
    GanttScrollService,
    GanttThemeService,
    GanttI18nService,
    GanttColumnService,
    GanttSelectionService,
    GanttDragService,
  ],
  hostDirectives: [{
    directive: GanttKeyboardDirective,
    inputs: ['visibleRows'],
  }],
  imports: [
    GanttToolbarComponent,
    GanttHeaderComponent,
    GanttTaskListComponent,
    GanttCanvasComponent,
    GanttLoadMoreComponent,
  ],
  host: {
    'class': 'gantry',
    '[attr.data-view]': 'layout.view()',
    '[style.display]': '"flex"',
    '[style.flex-direction]': '"column"',
    '[style.overflow]': '"hidden"',
    '[style.position]': '"relative"',
    '[attr.tabindex]': '"0"',
    '[style.font-family]': 'theme().fontFamily',
    '[style.font-size]': 'theme().fontSize',
    '[style.color]': 'theme().textPrimary',
    '[style.background-color]': 'theme().backgroundColor',
  },
  template: `
    <!-- ── Toolbar (optional) ─────────────────────────────── -->
    @if (showToolbar() && cfg().toolbar; as tb) {
      <gantt-toolbar
        [toolbar]="tb"
        [zoomLevels]="cfg().zoomLevels"
        [currentView]="layout.viewMode()"
        [view]="layout.view()"
        (zoomIn)="zoomIn()"
        (zoomOut)="zoomOut()"
        (viewModeChange)="setViewMode($event)"
        (scrollToToday)="scrollToToday()"
        (viewChange)="setView($event)"
      >
        <ng-content select="[ganttToolbar]" />
      </gantt-toolbar>
    }

    <!-- ── Main area: panel · splitter · timeline ─────────── -->
    <div #mainEl class="gantry-main" [class.is-resizing]="splitterDragging()">
      <!-- Left: task list (scrolls horizontally; vertical scroll mirrors the timeline) -->
      <div
        #panelEl
        class="gantt-panel-scroll"
        [style.width.px]="panelPx()"
        [attr.inert]="layout.view() === 'chart' ? '' : null"
        (wheel)="onPanelWheel($event)"
      >
        <gantt-tasklist
          [visibleRows]="vsVisibleRows()"
          [rowCount]="layout.rowCount()"
          [columns]="colSvc.columns()"
          [rowHeight]="layout.rowHeight()"
          [selectedIds]="selSvc.selectedIds()"
          [theme]="theme()"
          [colHeaderHeight]="layout.totalHeaderHeight()"
          [indentSize]="cfg().indentSize"
          [paddingTop]="vsPaddingTop()"
          [paddingBottom]="vsPaddingBottom()"
          [sort]="layout.sort()"
          [tableView]="layout.view() === 'table'"
          [style.padding-bottom.px]="panelBottomPad()"
          (collapseToggle)="onCollapseToggle($event)"
          (rowClick)="onTaskListRowClick($event)"
          (rowDblClick)="rowDblClick.emit($event)"
          (columnWidthChange)="colSvc.setColumnWidth($event.key, $event.width)"
          (columnResizeEnd)="saveState()"
          (sortColumn)="onSortColumn($event)"
        />

        <!-- Load-more footer (lazy datasource) -->
        @if (dataSource(); as ds) {
          <gantt-load-more
            [theme]="theme()"
            [isLoading]="ds.isLoading()"
            [hasMore]="ds.hasMore()"
            [loadedCount]="ds.loadedCount()"
            [autoLoad]="true"
            (loadMore)="ds.loadNext()"
          />
        }

        <!-- Consumer footer slot -->
        <ng-content select="[tlFooter]" />
      </div>

      <!-- Splitter: drag to resize, button to collapse / expand -->
      @if (layout.view() !== 'table') {
        <div
          class="gantry-splitter"
          role="separator"
          aria-orientation="vertical"
          tabindex="0"
          [attr.aria-valuenow]="panelPx()"
          [class.is-locked]="!cfg().panel.resizable || layout.view() !== 'split'"
          (pointerdown)="onSplitterDown($event)"
          (keydown)="onSplitterKey($event)"
        >
          @if (cfg().panel.collapsible) {
            <button
              type="button"
              class="gantry-splitter-toggle"
              [style.top.px]="layout.totalHeaderHeight() + 24"
              [attr.aria-expanded]="layout.view() === 'split'"
              [attr.aria-label]="layout.view() === 'split' ? i18n.labels().hidePanel : i18n.labels().showPanel"
              [title]="layout.view() === 'split' ? i18n.labels().hidePanel : i18n.labels().showPanel"
              (pointerdown)="$event.stopPropagation()"
              (click)="togglePanel()"
            >{{ layout.view() === 'split' ? '‹' : '›' }}</button>
          }
        </div>
      }

      <!-- Right: one scrollport — header + bars share horizontal scroll natively -->
      <div #canvasEl class="gantt-timeline-scroll">
        <div class="gantt-timeline-header">
          <gantt-header [timeline]="layout.timeline()" [config]="cfg()" />
        </div>
        <gantt-canvas
          [style.margin-bottom.px]="canvasBottomPad()"
          [timeline]="layout.timeline()"
          [config]="cfg()"
          [visibleGeometries]="vsVisibleGeos()"
          [allGeometries]="layout.rowGeometries()"
          [windowTop]="vsWindowTop()"
          [windowBottom]="vsWindowBottom()"
          [totalHeight]="layout.totalHeight()"
          [annotations]="annotations()"
          [criticalIds]="criticalIds()"
          [enableResize]="dragEnabled() && resizeEnabled()"
          [enableDrag]="dragEnabled()"
          [enableSelection]="options().enableSelection !== false"
          [multiSelect]="options().multiSelect !== false"
          [tooltipEnabled]="tooltipEnabled()"
          (taskDragged)="onTaskDragged($event)"
          (taskResized)="onTaskResized($event)"
          (selectionChange)="selectionChange.emit($event)"
          (rowClick)="onCanvasRowClick($event)"
          (rowDblClick)="rowDblClick.emit($event)"
        />
      </div>
    </div>

    <!-- ── Legend (optional) ─────────────────────────────────── -->
    @if (showLegend() && legendItems().length) {
      <div class="gantt-legend">
        <span class="gantt-legend-title">{{ i18n.labels().legend }}</span>
        @for (item of legendItems(); track item.label) {
          <span class="gantt-legend-item">
            <svg width="18" height="12" aria-hidden="true">
              <line x1="9" y1="0" x2="9" y2="12"
                [attr.stroke]="item.color" stroke-width="2"
                [attr.stroke-dasharray]="item.dashed ? '3 2' : null" />
            </svg>
            <span>{{ item.label }}</span>
          </span>
        }
      </div>
    }

    <!-- ── Consumer footer slot ──────────────────────────────── -->
    <ng-content select="[ganttFooter]" />
  `,
  styles: [`
    :host { box-sizing: border-box; outline: none; }
    :host(:focus-visible) { box-shadow: inset 0 0 0 2px var(--gantt-sel-border, #2563EB); }

    .gantry-main { display: flex; flex: 1; overflow: hidden; min-height: 0; position: relative; }

    .gantt-panel-scroll {
      flex: 0 0 auto;
      overflow-x: auto;
      overflow-y: hidden;
      background: var(--gantt-panel-bg);
      transition: width .25s ease;
    }
    .gantt-timeline-scroll {
      flex: 1;
      overflow: auto;
      position: relative;
      min-width: 0;
      min-height: 0;
      background: var(--gantt-bg);
      transition: opacity .25s ease;
    }
    .gantt-timeline-header { position: sticky; top: 0; z-index: 10; background: var(--gantt-header-bg); width: max-content; }
    :host([data-view="table"]) .gantt-timeline-scroll { opacity: 0; pointer-events: none; }
    .is-resizing .gantt-panel-scroll { transition: none; }

    .gantry-splitter {
      flex: 0 0 6px;
      position: relative;
      cursor: col-resize;
      background: linear-gradient(to right, transparent 2px, var(--gantt-panel-border) 2px, var(--gantt-panel-border) 3px, transparent 3px);
      z-index: 12;
      outline: none;
    }
    .gantry-splitter:hover, .gantry-splitter:focus-visible, .is-resizing .gantry-splitter {
      background: linear-gradient(to right, transparent 1px, var(--gantt-sel-border) 1px, var(--gantt-sel-border) 4px, transparent 4px);
    }
    .gantry-splitter.is-locked { cursor: default; }
    .gantry-splitter-toggle {
      position: absolute; left: 50%; transform: translate(-50%, -50%);
      width: 18px; height: 32px; padding: 0;
      border: 1px solid var(--gantt-border); border-radius: 9px;
      background: var(--gantt-panel-bg); color: var(--gantt-text-sec);
      font-size: 15px; font-weight: 600; line-height: 1; cursor: pointer;
      box-shadow: 0 1px 4px rgba(0,0,0,.12); opacity: .85;
    }
    .gantry-splitter-toggle:hover { opacity: 1; color: var(--gantt-text); border-color: var(--gantt-sel-border); }

    .gantt-legend {
      position: absolute; bottom: 12px; right: 12px; z-index: 15;
      display: flex; align-items: center; gap: 14px; padding: 6px 12px; border-radius: 8px; font-size: 11px;
      background: var(--gantt-panel-bg); border: 1px solid var(--gantt-border); color: var(--gantt-text-sec);
      box-shadow: 0 4px 16px rgba(0,0,0,0.12); pointer-events: none;
    }
    .gantt-legend-title { font-weight: 700; text-transform: uppercase; letter-spacing: .4px; font-size: 9.5px; color: var(--gantt-text-muted); }
    .gantt-legend-item { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; color: var(--gantt-text); }

    .gantt-timeline-scroll, .gantt-panel-scroll {
      scrollbar-width: thin;
      scrollbar-color: var(--gantt-scrollbar-thumb, #CBD5E1) var(--gantt-scrollbar-track, #F1F5F9);
    }
    .gantt-timeline-scroll::-webkit-scrollbar, .gantt-panel-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
    .gantt-timeline-scroll::-webkit-scrollbar-track, .gantt-panel-scroll::-webkit-scrollbar-track { background: var(--gantt-scrollbar-track, #F1F5F9); }
    .gantt-timeline-scroll::-webkit-scrollbar-thumb, .gantt-panel-scroll::-webkit-scrollbar-thumb {
      background: var(--gantt-scrollbar-thumb, #CBD5E1); border-radius: 3px;
    }
    @media (prefers-reduced-motion: reduce) {
      .gantt-panel-scroll, .gantt-timeline-scroll { transition: none; }
    }
  `],
})
export class GantryComponent implements OnInit, AfterViewInit, OnDestroy {

  // ── Injected services ─────────────────────────────────────
  protected readonly layout = inject(GanttLayoutService);
  protected readonly scrollSvc = inject(GanttScrollService);
  protected readonly themeSvc = inject(GanttThemeService);
  protected readonly i18n = inject(GanttI18nService);
  protected readonly colSvc = inject(GanttColumnService);
  protected readonly selSvc = inject(GanttSelectionService);
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  // ── DOM references ────────────────────────────────────────
  private readonly mainEl = viewChild<ElementRef<HTMLElement>>('mainEl');
  private readonly panelEl = viewChild<ElementRef<HTMLElement>>('panelEl');
  private readonly canvasEl = viewChild<ElementRef<HTMLElement>>('canvasEl');

  // ── Inputs ────────────────────────────────────────────────
  readonly series = input<GanttTask[]>([]);
  readonly dataSource = input<GanttDataSource | null>(null);
  readonly options = input<GanttOptions>({});
  readonly annotations = input<GanttAnnotation[]>([]);
  readonly columns = input<ColumnDef[]>([]);
  readonly darkMode = input<boolean | 'auto'>(false);
  readonly showToolbar = input<boolean>(true);
  readonly enableDrag = input<boolean>(true);
  readonly enableResize = input<boolean>(true);
  readonly tooltipEnabled = input<boolean>(true);
  /** Show a floating legend explaining the vertical markers (today + annotations) */
  readonly showLegend = input<boolean>(false);

  // ── Outputs ───────────────────────────────────────────────
  readonly taskDragged = output<TaskDragEvent>();
  readonly taskResized = output<TaskResizeEvent>();
  readonly selectionChange = output<SelectionChangeEvent>();
  readonly rowClick = output<RowGeometry>();
  readonly rowDblClick = output<GanttFlatRow>();
  /** The zoom level changed (toolbar, keyboard or API) */
  readonly viewModeChange = output<string>();
  /** Panel width / collapsed, view, zoom, column widths, collapsed rows or sort changed */
  readonly stateChange = output<GanttState>();

  // ── Resolved configuration (shared render model) ─────────
  protected readonly cfg = computed<ResolvedGanttConfig>(() =>
    resolveConfig({ ...this.options(), viewMode: this.layout.viewMode() }, this.themeSvc.resolvedTheme(), this.i18n.bundle()),
  );
  protected readonly theme = computed(() => this.cfg().theme);
  protected readonly dragEnabled = computed(() => this.options().enableDrag ?? this.enableDrag());
  protected readonly resizeEnabled = computed(() => this.options().enableResize ?? this.enableResize());

  // ── Panel / splitter ──────────────────────────────────────
  private readonly mainWidth = signal<number>(0);
  protected readonly splitterDragging = signal(false);
  protected readonly panelPx = computed(() => {
    const view = this.layout.view();
    const hostW = this.mainWidth() || 1000;
    if (view === 'table') return hostW;
    if (view === 'chart') return 0;
    const cfg = this.cfg();
    return this.clampPanel(this.layout.panelWidthPx() ?? resolveLength(cfg.panel.width, hostW, 320), cfg, hostW - SPLITTER_PX);
  });

  /** Keep both panes' bottoms level despite either one's horizontal scrollbar */
  private readonly panelSB = signal(0);
  private readonly canvasSB = signal(0);
  protected readonly panelBottomPad = computed(() => Math.max(0, this.canvasSB() - this.panelSB()));
  protected readonly canvasBottomPad = computed(() => Math.max(0, this.panelSB() - this.canvasSB()));

  // ── Virtual scroll state ──────────────────────────────────
  /** Timeline viewport height (px), tracked via ResizeObserver. */
  private readonly _viewportH = signal<number>(0);
  private readonly _window = computed(() => {
    const rows = this.layout.visibleRows();
    const rh = this.layout.rowHeight();
    const viewH = Math.max(rh, (this._viewportH() || 500) - this.layout.totalHeaderHeight());
    return computeVirtualWindow(Math.max(0, this.scrollSvc.scrollTop()), rh, viewH, rows.length, 4);
  });
  protected readonly vsVisibleRows = computed(() => {
    const w = this._window();
    return this.layout.visibleRows().slice(w.first, w.last + 1);
  });
  protected readonly vsVisibleGeos = computed<RowGeometry[]>(() => {
    const w = this._window();
    return this.layout.rowGeometries().slice(w.first, w.last + 1);
  });
  protected readonly vsPaddingTop = computed(() => this._window().paddingTop);
  protected readonly vsPaddingBottom = computed(() => this._window().paddingBottom);
  protected readonly vsWindowTop = computed(() => this._window().first * this.layout.rowHeight());
  protected readonly vsWindowBottom = computed(() => (this._window().last + 1) * this.layout.rowHeight());

  private _resizeObserver?: ResizeObserver;
  private _clock?: ReturnType<typeof setInterval>;
  private _stateTimer?: ReturnType<typeof setTimeout>;
  private _restoredStateKey?: string;
  private _prevOptions: GanttOptions = {};
  private _lastViewMode?: string;

  // ── Critical path ─────────────────────────────────────────
  readonly criticalIds = computed<Set<string>>(() => {
    const cfg = this.cfg();
    if (!cfg.criticalPath) return new Set();
    return computeCriticalPath(this.layout.tasks(), cfg).criticalIds;
  });

  // ── Legend items (today marker + user annotations) ───────
  protected readonly legendItems = computed<{ color: string; label: string; dashed: boolean }[]>(() => {
    const t = this.theme();
    const lbl = this.i18n.labels();
    const items: { color: string; label: string; dashed: boolean }[] = [];
    if (this.layout.todayX() >= 0) items.push({ color: t.todayColor, label: lbl.today, dashed: false });
    for (const ann of this.annotations()) {
      items.push({ color: ann.color ?? t.arrowColor, label: ann.label?.text ?? lbl.annotation, dashed: true });
    }
    return items;
  });

  constructor() {
    this.layout.bindConfig(() => this.cfg(), () => this.i18n.bundle());
  }

  // ── Lifecycle ─────────────────────────────────────────────

  ngOnInit(): void {
    this.themeSvc.init(this.hostEl.nativeElement);

    // ngOnInit is not an injection context — effects must run inside one.
    runInInjectionContext(this.injector, () => {
      // darkMode input → service (options.darkMode wins when set)
      effect(() => {
        this.themeSvc.setDarkMode(this.options().darkMode ?? this.darkMode());
      });

      // series / dataSource → layout
      effect(() => {
        const ds = this.dataSource();
        const tasks = ds ? ds.items() : this.series();
        untracked(() => this.layout.setTasks(tasks));
      });

      // options → i18n, theme, columns, and UI state the consumer changed
      effect(() => {
        const opts = this.options();
        untracked(() => this.applyOptions(opts));
      });

      // columns input → column service
      effect(() => {
        const cols = this.columns();
        if (cols.length) untracked(() => this.colSvc.setColumns(cols));
      });

      // zoom level changes → output + persisted state
      effect(() => {
        const vm = this.layout.viewMode();
        untracked(() => {
          if (this._lastViewMode !== undefined && vm !== this._lastViewMode) {
            this.viewModeChange.emit(vm);
            this.saveState();
          }
          this._lastViewMode = vm;
        });
      });
    });

    // Keep "today" fresh in long-lived sessions
    this._clock = setInterval(() => this.layout.now.set(Date.now()), 60_000);
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasEl()?.nativeElement;
    const panel = this.panelEl()?.nativeElement;
    const main = this.mainEl()?.nativeElement;
    if (panel) this.scrollSvc.registerPanel(panel);
    if (canvas) this.scrollSvc.registerCanvas(canvas);

    // Track sizes so the virtual window, fitToWidth and the panel % width follow the layout
    const measure = () => {
      if (canvas) {
        this._viewportH.set(canvas.clientHeight);
        this.layout.viewportWidth.set(canvas.clientWidth);
        this.canvasSB.set(canvas.offsetHeight - canvas.clientHeight);
      }
      if (panel) this.panelSB.set(panel.offsetHeight - panel.clientHeight);
      if (main) this.mainWidth.set(main.clientWidth);
    };
    measure();
    this._resizeObserver = new ResizeObserver(measure);
    for (const el of [canvas, panel, main]) if (el) this._resizeObserver.observe(el);
    // Scrollbars appear/disappear with the content width too
    for (const el of [canvas?.lastElementChild, panel?.firstElementChild]) {
      if (el) this._resizeObserver.observe(el);
    }

    // Scroll to today on mount
    requestAnimationFrame(() => this.scrollToToday('instant'));
  }

  ngOnDestroy(): void {
    this._resizeObserver?.disconnect();
    clearInterval(this._clock);
    clearTimeout(this._stateTimer);
  }

  /** Apply an options object; only UI state the consumer actually changed is reset. */
  private applyOptions(opts: GanttOptions): void {
    const prev = this._prevOptions;
    this._prevOptions = opts;
    this.i18n.apply(opts);
    this.themeSvc.setOptionsTheme(opts.theme);
    if (opts.columns?.length) this.colSvc.setColumns(opts.columns as ColumnDef[]);
    if (opts.viewMode && opts.viewMode !== prev.viewMode) this.layout.viewMode.set(opts.viewMode);
    const view = opts.view ?? (opts.panel?.collapsed || opts.panelVisible === false ? 'chart' : undefined);
    const prevView = prev.view ?? (prev.panel?.collapsed || prev.panelVisible === false ? 'chart' : undefined);
    if (view && view !== prevView) this.layout.view.set(view);
    if (opts.panel?.width !== prev.panel?.width || opts.panelWidth !== prev.panelWidth) this.layout.panelWidthPx.set(null);
    if (opts.stateKey && opts.stateKey !== this._restoredStateKey) {
      this._restoredStateKey = opts.stateKey;
      const saved = readState(opts.stateKey);
      if (saved) this.setState(saved, false);
    }
  }

  // ── Event handlers ────────────────────────────────────────

  protected onTaskListRowClick(e: { row: GanttFlatRow; event: MouseEvent }): void {
    const opts = this.options();
    if (opts.enableSelection !== false) {
      const ev = opts.multiSelect === false ? ({ ctrlKey: false, metaKey: false, shiftKey: false } as MouseEvent) : e.event;
      this.selSvc.handleClick(e.row.task.id, ev, this.layout.visibleRows());
    }
    const geo = this.layout.geometryById().get(e.row.task.id);
    if (geo) this.rowClick.emit(geo);
  }

  protected onCanvasRowClick(geo: RowGeometry): void {
    this.rowClick.emit(geo);
  }

  protected onSortColumn(key: string): void {
    this.layout.toggleSort(key);
    this.saveState();
  }

  protected onCollapseToggle(id: string): void {
    this.layout.toggleCollapse(id);
    this.saveState();
  }

  protected onTaskDragged(event: TaskDragEvent): void {
    this.layout.updateTask(event.taskId, { start: event.newStart, end: event.newEnd });
    this.taskDragged.emit(event);
  }

  protected onTaskResized(event: TaskResizeEvent): void {
    this.layout.updateTask(event.taskId, { start: event.newStart, end: event.newEnd });
    this.taskResized.emit(event);
  }

  /** The panel only scrolls horizontally: forward vertical wheel to the timeline. */
  protected onPanelWheel(e: WheelEvent): void {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const canvas = this.canvasEl()?.nativeElement;
    if (!canvas) return;
    canvas.scrollTop += e.deltaY;
    e.preventDefault();
  }

  // ── Splitter ──────────────────────────────────────────────

  private clampPanel(px: number, cfg: ResolvedGanttConfig, available: number): number {
    const max = Math.min(available - 40, resolveLength(cfg.panel.maxWidth, available, available));
    return Math.round(Math.max(cfg.panel.minWidth, Math.min(px, max)));
  }

  protected onSplitterDown(e: PointerEvent): void {
    const cfg = this.cfg();
    if (e.button !== 0 || !cfg.panel.resizable || this.layout.view() !== 'split') return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const startX = e.clientX;
    const startW = this.panelPx();
    const available = (this.mainWidth() || 1000) - SPLITTER_PX;
    this.splitterDragging.set(true);
    try { el.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
    const move = (ev: PointerEvent) =>
      this.layout.panelWidthPx.set(this.clampPanel(startW + ev.clientX - startX, cfg, available));
    const end = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      this.splitterDragging.set(false);
      this.saveState();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  protected onSplitterKey(e: KeyboardEvent): void {
    e.stopPropagation();
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.togglePanel();
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && this.layout.view() === 'split' && this.cfg().panel.resizable) {
      e.preventDefault();
      const available = (this.mainWidth() || 1000) - SPLITTER_PX;
      this.layout.panelWidthPx.set(this.clampPanel(this.panelPx() + (e.key === 'ArrowLeft' ? -24 : 24), this.cfg(), available));
      this.saveState();
    }
  }

  // ── Public API ────────────────────────────────────────────

  zoomIn(): void { this.layout.zoomIn(); }
  zoomOut(): void { this.layout.zoomOut(); }

  setViewMode(mode: ViewMode | string): void { this.layout.viewMode.set(mode); }

  /** Switch view: `'split'`, `'table'` (task list only) or `'chart'` (timeline only). */
  setView(view: GanttView): void {
    if (view === this.layout.view()) return;
    this.layout.view.set(view);
    this.saveState();
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
    // Wait a frame so a pending zoom change has rendered its new timeline
    requestAnimationFrame(() => {
      const x = this.layout.timeline().toX(date);
      this.scrollSvc.scrollToX(x - this.scrollSvc.viewportWidth / 2, behavior);
    });
  }

  /** Scroll the given task into view (vertically and horizontally). */
  scrollToTask(id: string, behavior: ScrollBehavior = 'smooth'): void {
    const geo = this.layout.geometryById().get(id);
    if (!geo) return;
    this.scrollSvc.scrollToRow(geo.row.visibleIndex, this.layout.rowHeight(), behavior);
    this.scrollToDate(geo.row.task.start, behavior);
  }

  getSelectedTasks(): GanttTask[] {
    const ids = this.selSvc.getSelectedIds();
    const tasks = this.layout.tasks();
    return tasks.filter(t => ids.includes(t.id));
  }

  setSelectedTasks(ids: string[]): void { this.selSvc.setSelected(ids); }

  clearSelection(): void { this.selSvc.clear(); }

  selectAll(): void {
    const opts = this.options();
    if (opts.enableSelection === false || opts.multiSelect === false) return;
    this.selSvc.selectAll(this.layout.visibleRows());
  }

  updateTask(id: string, patch: Partial<GanttTask>): void {
    this.layout.updateTask(id, patch);
  }

  appendTasks(tasks: GanttTask[]): void { this.layout.appendTasks(tasks); }

  collapseAll(): void { this.layout.collapseAll(); this.saveState(); }
  expandAll(): void { this.layout.expandAll(); this.saveState(); }

  /** Show / hide a column. */
  setColumnVisible(key: string, visible: boolean): void { this.colSvc.setVisible(key, visible); }

  setTheme(override: Partial<GanttTheme>): void {
    this.themeSvc.setCustomTheme(override);
  }

  patchTheme(patch: Partial<GanttTheme>): void {
    this.themeSvc.patchTheme(patch);
  }

  /** Snapshot of the UI state (panel, view, zoom, column widths, collapsed rows, sort). */
  getState(): GanttState {
    return {
      panelWidth: this.layout.panelWidthPx() ?? (this.layout.view() === 'split' ? this.panelPx() : undefined),
      panelCollapsed: this.layout.view() === 'chart',
      view: this.layout.view(),
      viewMode: this.layout.viewMode(),
      columnWidths: this.colSvc.widths(),
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
  }

  /** Debounced: emit `stateChange` and persist under `options.stateKey`. */
  protected saveState(): void {
    clearTimeout(this._stateTimer);
    this._stateTimer = setTimeout(() => {
      const state = this.getState();
      this.stateChange.emit(state);
      const key = this.options().stateKey;
      if (key) {
        try { window.localStorage.setItem(STATE_PREFIX + key, JSON.stringify(state)); } catch { /* storage unavailable */ }
      }
    }, 150);
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
