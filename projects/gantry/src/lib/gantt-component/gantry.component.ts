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
  type OnInit,
  type AfterViewInit,
  type OnDestroy,
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
  afterRenderEffect,
  afterNextRender,
  EnvironmentInjector,
} from '@angular/core';

import {
  type GanttTask,
  type GanttOptions,
  type GanttAnnotation,
  type GanttThemeOverrides,
  type GanttState,
  type GanttView,
  type ViewMode,
  type ColumnDef,
  type TaskDragEvent,
  type TaskResizeEvent,
  type SelectionChangeEvent,
  type RowGeometry,
  type GanttFlatRow,
} from '../types';
import {
  resolveConfig,
  initialScrollLeft,
  initialScrollChanged,
  zoomAnchorScroll,
  computeVirtualWindow,
  readStoredState,
  writeStoredState,
  normalizeState,
  viewFromOptions,
  viewFromState,
  resolvePanelWidth,
  clampPanelWidth,
  availablePanelWidth,
  buildLegend,
  LEGEND_SWATCH_SIZE,
  isLegendVisible,
  type LegendItem,
  type ResolvedGanttConfig,
  type TimelineModel,
} from '@gantry/core';

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
import { type GanttDataSource } from '../datasource/gantt-datasource';
import { computeCriticalPath, type CPMResult } from '../gantt-cpm';

/** `localStorage` without touching `window` on the server (the storage helpers also catch a throw) */
const browserStorage = () => (typeof window === 'undefined' ? null : window.localStorage);

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
  hostDirectives: [
    {
      directive: GanttKeyboardDirective,
      inputs: ['visibleRows'],
    },
  ],
  imports: [
    GanttToolbarComponent,
    GanttHeaderComponent,
    GanttTaskListComponent,
    GanttCanvasComponent,
    GanttLoadMoreComponent,
  ],
  host: {
    class: 'gantry',
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
    <div #mainEl class="gantry-main" [class.is-resizing]="splitterDragging() || !panelAnimated()">
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
          [columns]="activeColumns()"
          [cellContext]="layout.columnContext()"
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
            [error]="ds.error() !== null"
            [loadedCount]="ds.loadedCount()"
            [autoLoad]="true"
            (loadMore)="ds.loadNext()"
            (retry)="ds.retry()"
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
            >
              {{ layout.view() === 'split' ? '‹' : '›' }}
            </button>
          }
        </div>
      }

      <!-- Right: one scrollport — header + bars share horizontal scroll natively -->
      <div #canvasEl class="gantt-timeline-scroll" [attr.inert]="layout.view() === 'table' ? '' : null">
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
          [floatDays]="cpm()?.floatMap"
          [tasksById]="layout.columnContext().taskById"
          [enableResize]="dragEnabled() && resizeEnabled()"
          [enableDrag]="dragEnabled()"
          [enableSelection]="cfg().selection.enabled"
          [multiSelect]="cfg().selection.multi"
          [tooltipEnabled]="tooltipEnabled()"
          (taskDragged)="onTaskDragged($event)"
          (taskResized)="onTaskResized($event)"
          (rowClick)="onCanvasRowClick($event)"
          (rowDblClick)="rowDblClick.emit($event)"
        />
      </div>
    </div>

    <!-- ── Legend (optional) ─────────────────────────────────── -->
    @if (legendVisible()) {
      <div class="gantt-legend">
        <span class="gantt-legend-title">{{ i18n.labels().legend }}</span>
        @for (item of legendItems(); track item.key) {
          <span class="gantt-legend-item">
            <svg
              [attr.class]="'gantt-legend-swatch gantt-legend-swatch--' + item.shape"
              [attr.width]="swatchSize.width"
              [attr.height]="swatchSize.height"
              aria-hidden="true"
            >
              @let sw = item.swatch;
              @if (sw.kind === 'line') {
                <svg:line
                  [attr.x1]="sw.x"
                  [attr.y1]="sw.y1"
                  [attr.x2]="sw.x"
                  [attr.y2]="sw.y2"
                  [attr.stroke]="item.color"
                  [attr.stroke-width]="sw.strokeWidth"
                  [attr.stroke-dasharray]="sw.dash"
                />
              } @else {
                <svg:rect
                  [attr.x]="sw.x"
                  [attr.y]="sw.y"
                  [attr.width]="sw.width"
                  [attr.height]="sw.height"
                  [attr.rx]="sw.rx"
                  [attr.fill]="item.color"
                />
              }
            </svg>
            <span>{{ item.label }}</span>
          </span>
        }
      </div>
    }

    <!-- ── Consumer footer slot ──────────────────────────────── -->
    <ng-content select="[ganttFooter]" />
  `,
  styles: [
    `
      :host {
        box-sizing: border-box;
        outline: none;
      }
      :host(:focus-visible) {
        box-shadow: inset 0 0 0 2px var(--gantt-sel-border, #2563eb);
      }

      .gantry-main {
        display: flex;
        flex: 1;
        overflow: hidden;
        min-height: 0;
        position: relative;
      }

      .gantt-panel-scroll {
        flex: 0 0 auto;
        overflow-x: auto;
        overflow-y: hidden;
        background: var(--gantt-panel-bg);
        transition: width 0.25s ease;
      }
      .gantt-timeline-scroll {
        flex: 1;
        overflow: auto;
        position: relative;
        min-width: 0;
        min-height: 0;
        background: var(--gantt-bg);
        transition: opacity 0.25s ease;
      }
      .gantt-timeline-header {
        position: sticky;
        top: 0;
        z-index: 10;
        background: var(--gantt-header-bg);
        width: max-content;
      }
      :host([data-view='table']) .gantt-timeline-scroll {
        opacity: 0;
        pointer-events: none;
      }
      .is-resizing .gantt-panel-scroll {
        transition: none;
      }

      .gantry-splitter {
        flex: 0 0 6px;
        position: relative;
        cursor: col-resize;
        background: linear-gradient(
          to right,
          transparent 2px,
          var(--gantt-panel-border) 2px,
          var(--gantt-panel-border) 3px,
          transparent 3px
        );
        z-index: 12;
        outline: none;
      }
      .gantry-splitter:hover,
      .gantry-splitter:focus-visible,
      .is-resizing .gantry-splitter {
        background: linear-gradient(
          to right,
          transparent 1px,
          var(--gantt-sel-border) 1px,
          var(--gantt-sel-border) 4px,
          transparent 4px
        );
      }
      .gantry-splitter.is-locked {
        cursor: default;
      }
      .gantry-splitter-toggle {
        position: absolute;
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
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
        opacity: 0.85;
      }
      .gantry-splitter-toggle:hover {
        opacity: 1;
        color: var(--gantt-text);
        border-color: var(--gantt-sel-border);
      }

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
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        pointer-events: none;
      }
      .gantt-legend-title {
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        font-size: 9.5px;
        color: var(--gantt-text-muted);
      }
      .gantt-legend-item {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        white-space: nowrap;
        color: var(--gantt-text);
      }
      .gantt-legend-swatch {
        flex: none;
      }

      .gantt-timeline-scroll,
      .gantt-panel-scroll {
        scrollbar-width: thin;
        scrollbar-color: var(--gantt-scrollbar-thumb, #cbd5e1) var(--gantt-scrollbar-track, #f1f5f9);
      }
      .gantt-timeline-scroll::-webkit-scrollbar,
      .gantt-panel-scroll::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      .gantt-timeline-scroll::-webkit-scrollbar-track,
      .gantt-panel-scroll::-webkit-scrollbar-track {
        background: var(--gantt-scrollbar-track, #f1f5f9);
      }
      .gantt-timeline-scroll::-webkit-scrollbar-thumb,
      .gantt-panel-scroll::-webkit-scrollbar-thumb {
        background: var(--gantt-scrollbar-thumb, #cbd5e1);
        border-radius: 3px;
      }
      @media (prefers-reduced-motion: reduce) {
        .gantt-panel-scroll,
        .gantt-timeline-scroll {
          transition: none;
        }
      }
    `,
  ],
})
export class GantryComponent implements OnInit, AfterViewInit, OnDestroy {
  // ── Injected services ─────────────────────────────────────
  protected readonly layout = inject(GanttLayoutService);
  protected readonly scrollSvc = inject(GanttScrollService);
  protected readonly themeSvc = inject(GanttThemeService);
  protected readonly i18n = inject(GanttI18nService);
  protected readonly colSvc = inject(GanttColumnService);
  protected readonly selSvc = inject(GanttSelectionService);
  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);
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
  /** A data-source page failed after its automatic retries (`dataSource.retry()` tries again) */
  readonly loadError = output<{ error: unknown; page: number }>();
  readonly rowClick = output<RowGeometry>();
  readonly rowDblClick = output<GanttFlatRow>();
  /** The zoom level changed (toolbar, keyboard or API) */
  readonly viewModeChange = output<string>();
  /** Panel width / collapsed, view, zoom, column widths, collapsed rows or sort changed */
  readonly stateChange = output<GanttState>();

  // ── Resolved configuration (shared render model) ─────────
  protected readonly cfg = computed<ResolvedGanttConfig>(() =>
    resolveConfig(
      { ...this.options(), viewMode: this.layout.viewMode() },
      this.themeSvc.resolvedTheme(),
      this.i18n.bundle(),
    ),
  );
  protected readonly theme = computed(() => this.cfg().theme);
  /** Consumer columns: `options.columns` wins over the `columns` input (compared by reference) */
  private readonly columnSource = computed<ColumnDef[]>(() => {
    const fromOptions = this.options().columns as ColumnDef[] | undefined;
    return fromOptions?.length ? fromOptions : this.columns();
  });

  /** Columns of the current view: lean split panel, data-rich table view (resolved in core) */
  protected readonly activeColumns = computed(() => this.colSvc.columnsFor(this.layout.view(), this.cfg()));
  protected readonly dragEnabled = computed(() => this.options().enableDrag ?? this.enableDrag());
  protected readonly resizeEnabled = computed(() => this.options().enableResize ?? this.enableResize());

  // ── Panel / splitter ──────────────────────────────────────
  private readonly mainWidth = signal<number>(0);
  protected readonly splitterDragging = signal(false);
  /** Width transitions start after the first measured render (no 300px → 30% slide on load) */
  protected readonly panelAnimated = signal(false);
  protected readonly panelPx = computed(() =>
    resolvePanelWidth({
      view: this.layout.view(),
      panel: this.cfg().panel,
      userWidth: this.layout.panelWidthPx(),
      hostWidth: this.mainWidth(),
    }),
  );

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

  // ── Horizontal scroll ─────────────────────────────────────
  private readonly envInjector = inject(EnvironmentInjector);
  private readonly hasRows = computed(() => this.layout.visibleRows().length > 0);
  /** The first render with data has applied `initialScroll` */
  private _initialScrollDone = false;
  /** Timeline the canvas was last rendered with — anchors the scroll when it changes */
  private _paintedTimeline?: TimelineModel;

  private _resizeObserver?: ResizeObserver;
  private _clock?: ReturnType<typeof setInterval>;
  private _stateTimer?: ReturnType<typeof setTimeout>;
  private _restoredStateKey?: string;
  private _prevOptions: GanttOptions = {};
  private _lastViewMode?: string;

  // ── Critical path ─────────────────────────────────────────
  /** Only these config fields affect the critical path (cfg itself changes with theme, i18n…) */
  private readonly cpmConfig = computed(
    () => {
      const { criticalPath, endDateMode, normalizeDateOnly } = this.cfg();
      return { criticalPath, endDateMode, normalizeDateOnly };
    },
    {
      equal: (a, b) =>
        a.criticalPath === b.criticalPath &&
        a.endDateMode === b.endDateMode &&
        a.normalizeDateOnly === b.normalizeDateOnly,
    },
  );
  /** CPM result (critical ids, float), `null` when the critical path is off */
  protected readonly cpm = computed<CPMResult | null>(() => {
    const cfg = this.cpmConfig();
    return cfg.criticalPath ? computeCriticalPath(this.layout.tasks(), cfg) : null;
  });
  readonly criticalIds = computed<ReadonlySet<string>>(() => this.cpm()?.criticalIds ?? new Set());

  // ── Legend items (today, annotations, critical path, baseline — @gantry/core) ──
  protected readonly swatchSize = LEGEND_SWATCH_SIZE;
  protected readonly legendItems = computed<LegendItem[]>(() => {
    const cfg = this.cfg();
    return buildLegend({
      showToday: cfg.showToday,
      todayVisible: this.layout.todayX() >= 0,
      annotations: this.annotations(),
      theme: cfg.theme,
      labels: this.i18n.labels(),
      criticalPath: cfg.criticalPath,
      baseline: cfg.baseline,
    });
  });
  protected readonly legendVisible = computed(() =>
    isLegendVisible(this.showLegend(), this.layout.view(), this.legendItems()),
  );

  constructor() {
    this.layout.bindConfig(
      () => this.cfg(),
      () => this.i18n.bundle(),
    );
    this.layout.bindColumns(
      () => this.colSvc.columns(),
      () => this.colSvc.builtins(),
    );
    // Every selection change — canvas, task list, keyboard or API — reaches the output
    this.selSvc.onChange = e => this.selectionChange.emit(e);

    // After each render: apply `initialScroll` once rows exist, then keep the anchor date in place
    afterRenderEffect(() => {
      const tl = this.layout.timeline();
      const hasRows = this.hasRows();
      const view = this.layout.view();
      untracked(() => this.syncHorizontalScroll(tl, hasRows, view));
    });
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

      // data-source failures → loadError output (once per failure)
      effect(() => {
        const ds = this.dataSource();
        const error = ds?.error() ?? null;
        if (ds && error !== null) untracked(() => this.loadError.emit({ error, page: ds.nextPage() }));
      });

      // options → i18n, theme, columns, and UI state the consumer changed
      effect(() => {
        const opts = this.options();
        untracked(() => this.applyOptions(opts));
      });

      // options.columns, else the columns input, else the built-ins → column service
      effect(() => {
        const cols = this.columnSource();
        untracked(() => (cols.length ? this.colSvc.setColumns(cols) : this.colSvc.resetColumns()));
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
    afterNextRender(() => requestAnimationFrame(() => this.panelAnimated.set(true)), { injector: this.injector });
    this._resizeObserver = new ResizeObserver(measure);
    for (const el of [canvas, panel, main]) if (el) this._resizeObserver.observe(el);
    // Scrollbars appear/disappear with the content width too
    for (const el of [canvas?.lastElementChild, panel?.firstElementChild]) {
      if (el) this._resizeObserver.observe(el);
    }
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

    if (opts.viewMode && opts.viewMode !== prev.viewMode) this.layout.viewMode.set(opts.viewMode);
    const view = viewFromOptions(opts);
    if (view && view !== viewFromOptions(prev)) this.layout.view.set(view);
    if (opts.panel?.width !== prev.panel?.width || opts.panelWidth !== prev.panelWidth)
      this.layout.panelWidthPx.set(null);
    if (initialScrollChanged(opts.initialScroll, prev.initialScroll)) this._initialScrollDone = false;
    if (opts.stateKey && opts.stateKey !== this._restoredStateKey) {
      this._restoredStateKey = opts.stateKey;
      const saved = readStoredState(browserStorage, opts.stateKey);
      if (saved) this.setState(saved, false);
    }
  }

  // ── Event handlers ────────────────────────────────────────

  protected onTaskListRowClick(e: { row: GanttFlatRow; event: MouseEvent | KeyboardEvent }): void {
    this.selSvc.handleClick(e.row.task.id, e.event, this.layout.visibleRows(), this.cfg().selection);
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

  protected onSplitterDown(e: PointerEvent): void {
    const cfg = this.cfg();
    if (e.button !== 0 || !cfg.panel.resizable || this.layout.view() !== 'split') return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const startX = e.clientX;
    const startW = this.panelPx();
    const available = availablePanelWidth(this.mainWidth());
    this.splitterDragging.set(true);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic event */
    }
    const move = (ev: PointerEvent) =>
      this.layout.panelWidthPx.set(clampPanelWidth(startW + ev.clientX - startX, cfg.panel, available));
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
    } else if (
      (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
      this.layout.view() === 'split' &&
      this.cfg().panel.resizable
    ) {
      e.preventDefault();
      const available = availablePanelWidth(this.mainWidth());
      this.layout.panelWidthPx.set(
        clampPanelWidth(this.panelPx() + (e.key === 'ArrowLeft' ? -24 : 24), this.cfg().panel, available),
      );
      this.saveState();
    }
  }

  /** First render with data → `initialScroll`; later timeline changes keep the anchor date in place. */
  private syncHorizontalScroll(tl: TimelineModel, hasRows: boolean, view: GanttView): void {
    const canvas = this.canvasEl()?.nativeElement;
    if (!canvas || view === 'table') return;
    const prev = this._paintedTimeline;
    this._paintedTimeline = tl;
    if (!this._initialScrollDone) {
      if (!hasRows) return;
      this._initialScrollDone = true;
      const left = initialScrollLeft({
        timeline: tl,
        initialScroll: this.cfg().initialScroll,
        viewportWidth: canvas.clientWidth,
        now: new Date(),
      });
      if (left !== null) this.scrollSvc.scrollToX(left, 'instant');
      return;
    }
    if (!prev || prev === tl) return;
    const zoomed = prev.pxPerDay !== tl.pxPerDay;
    if (!zoomed && prev.start.getTime() === tl.start.getTime()) return;
    // Zoom keeps the centre date; a new range start keeps the left-edge date
    const anchorX = zoomed ? canvas.clientWidth / 2 : 0;
    this.scrollSvc.scrollToX(zoomAnchorScroll(prev, tl, this.scrollSvc.scrollLeft(), anchorX), 'instant');
  }

  // ── Public API ────────────────────────────────────────────

  zoomIn(): void {
    this.layout.zoomIn();
  }
  zoomOut(): void {
    this.layout.zoomOut();
  }

  setViewMode(mode: ViewMode | (string & {})): void {
    this.layout.viewMode.set(mode);
  }

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
    // After the next render, so a pending zoom change has painted its new timeline
    // (the environment injector makes the hook schedule that render)
    afterNextRender(
      () => {
        if (!this.canvasEl()) return;
        this._initialScrollDone = true;
        const x = this.layout.timeline().toX(date);
        this.scrollSvc.scrollToX(x - this.scrollSvc.viewportWidth / 2, behavior);
      },
      { injector: this.envInjector },
    );
  }

  /** Scroll the given task into view (vertically and horizontally). */
  scrollToTask(id: string, behavior: ScrollBehavior = 'smooth'): void {
    const geo = this.layout.geometryById().get(id);
    if (!geo) return;
    this.scrollSvc.scrollToRow(geo.row.visibleIndex, this.layout.rowHeight(), behavior);
    this.scrollToDate(geo.row.task.start, behavior);
  }

  getSelectedTasks(): GanttTask[] {
    const ids = this.selSvc.selectedIds();
    return this.layout.tasks().filter(t => ids.has(t.id));
  }

  setSelectedTasks(ids: string[]): void {
    this.selSvc.setSelected(ids);
  }

  clearSelection(): void {
    this.selSvc.clear();
  }

  /** Select every visible row (ignored unless selection and multi-select are on). */
  selectAll(): void {
    this.selSvc.selectAll(this.layout.visibleRows(), this.cfg().selection);
  }

  updateTask(id: string, patch: Partial<GanttTask>): void {
    this.layout.updateTask(id, patch);
  }

  appendTasks(tasks: GanttTask[]): void {
    this.layout.appendTasks(tasks);
  }

  collapseAll(): void {
    this.layout.collapseAll();
    this.saveState();
  }
  expandAll(): void {
    this.layout.expandAll();
    this.saveState();
  }

  /** Show / hide a column. */
  /** Show / hide a column in both views, or only in the split panel / the table view. */
  setColumnVisible(key: string, visible: boolean, view?: 'split' | 'table'): void {
    this.colSvc.setVisible(key, visible, view);
  }
  /** Show a column if the view (both views by default) hides it, else hide it. */
  toggleColumnVisible(key: string, view?: 'split' | 'table'): void {
    this.colSvc.toggleVisible(key, view, this.cfg());
  }

  setTheme(override: GanttThemeOverrides): void {
    this.themeSvc.setCustomTheme(override);
  }

  patchTheme(patch: GanttThemeOverrides): void {
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

  /** Restore a state snapshot (e.g. from your backend); invalid fields are ignored. */
  setState(snapshot: GanttState, emit = true): void {
    const state = normalizeState(snapshot);
    if (state.panelWidth != null) this.layout.panelWidthPx.set(state.panelWidth);
    const view = viewFromState(state);
    if (view) this.layout.view.set(view);
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
      if (key) writeStoredState(browserStorage, key, state);
    }, 150);
  }
}
