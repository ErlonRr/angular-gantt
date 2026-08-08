// ─────────────────────────────────────────────────────────────
//  gantry · gantt-component/gantry.component.ts
//
//  Root compositor — wires every service and child component.
//
//  Layout:
//  ┌──────────────────────────────────────────────────────────┐
//  │  <gantt-toolbar>          (optional, [showToolbar])      │
//  ├─────────────────┬────────────────────────────────────────┤
//  │                 │  #canvasEl: scroll X+Y                 │
//  │  <gantt-        │    ├ <gantt-header> (sticky top)        │
//  │   tasklist>     │    └ <gantt-canvas>                    │
//  │  (scrolls Y)    │                                        │
//  ├─────────────────┴────────────────────────────────────────┤
//  │  <ng-content select="[ganttFooter]">                     │
//  └──────────────────────────────────────────────────────────┘
//
//  All public methods delegate to the appropriate service.
//  The component itself contains ZERO business logic.
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  AfterViewInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
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
} from '@angular/core';

import {
  GanttTask,
  GanttOptions,
  GanttAnnotation,
  GanttTheme,
  ViewMode,
  ColumnDef,
  TaskDragEvent,
  TaskResizeEvent,
  SelectionChangeEvent,
  RowGeometry,
  GanttFlatRow,
} from '../types';

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
    '[style.display]': '"flex"',
    '[style.flex-direction]': '"column"',
    '[style.overflow]': '"hidden"',
    '[style.position]': '"relative"',
    '[attr.tabindex]': '"0"',
    '[style.font-family]': 'themeSvc.resolvedTheme().fontFamily',
    '[style.font-size]': 'themeSvc.resolvedTheme().fontSize',
  },
  template: `
    <!-- ── Toolbar (optional) ─────────────────────────────── -->
    @if (showToolbar()) {
      <gantt-toolbar
        [theme]="theme()"
        [currentView]="layout.viewMode()"
        (zoomIn)="zoomIn()"
        (zoomOut)="zoomOut()"
        (viewModeChange)="setViewMode($event)"
        (scrollToToday)="scrollToToday()"
      >
        <ng-content select="[ganttToolbar]" />
      </gantt-toolbar>
    }

    <!-- ── Main area (panel + canvas side by side) ─────────── -->
    <div
      [style.display]="'flex'"
      [style.flex]="'1'"
      [style.overflow]="'hidden'"
      [style.min-height]="'0'"
    >
      <!-- ── Left: Task list panel (outer scrollport) ───────── -->
      @if (layout.panelVisible()) {
        <div
          #panelEl
          class="gantt-panel-scroll"
          [style.width.px]="layout.panelWidth()"
          [style.flex-shrink]="'0'"
          [style.overflow-y]="'auto'"
          [style.overflow-x]="'hidden'"
          [style.background-color]="theme().panelBg"
          [style.border-right]="'1px solid ' + theme().panelBorder"
        >
          <gantt-tasklist
            [visibleRows]="vsVisibleRows()"
            [columns]="colSvc.columns()"
            [rowHeight]="layout.rowHeight()"
            [selectedIds]="selSvc.selectedIds()"
            [theme]="theme()"
            [colHeaderHeight]="layout.totalHeaderHeight()"
            [paddingTop]="vsPaddingTop()"
            [paddingBottom]="vsPaddingBottom()"
            (collapseToggle)="layout.toggleCollapse($event)"
            (rowClick)="onTaskListRowClick($event)"
            (rowDblClick)="rowDblClick.emit($event)"
            (panelWidthChange)="layout.panelWidth.set($event)"
            (columnWidthChange)="colSvc.setColumnWidth($event.key, $event.width)"
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
      }

      <!-- ── Right: one scrollport — header + bars share horizontal scroll natively ── -->
      <div
        [style.display]="'flex'"
        [style.flex-direction]="'column'"
        [style.flex]="'1'"
        [style.overflow]="'hidden'"
        [style.min-width]="'0'"
      >
        <div
          #canvasEl
          class="gantt-timeline-scroll"
          [style.flex]="'1'"
          [style.overflow]="'auto'"
          [style.position]="'relative'"
          [style.min-height]="'0'"
          [style.background-color]="theme().backgroundColor"
        >
          <div
            [style.width.px]="layout.totalWidth()"
            [style.minWidth.px]="layout.totalWidth()"
            [style.display]="'block'"
          >
            <gantt-header
              [viewMode]="layout.viewMode()"
              [startDate]="layout.startDate()"
              [endDate]="layout.endDate()"
              [pxPerDay]="layout.pxPerDay()"
              [totalWidth]="layout.totalWidth()"
              [theme]="theme()"
              [todayX]="layout.todayX()"
              (zoomInEvent)="zoomIn()"
              (zoomOutEvent)="zoomOut()"
            />
            <gantt-canvas
              [visibleGeometries]="vsVisibleGeos()"
              [allGeometries]="layout.rowGeometries()"
              [totalWidth]="layout.totalWidth()"
              [totalHeight]="layout.totalHeight()"
              [gridLines]="layout.gridLines()"
              [theme]="theme()"
              [todayX]="layout.todayX()"
              [annotations]="resolvedAnnotations()"
              [criticalIds]="criticalIds()"
              [layoutParams]="layout.layoutParams()"
              [showBaseline]="layout.showBaseline()"
              [enableResize]="enableResize()"
              [enableDrag]="enableDrag()"
              [tooltipEnabled]="tooltipEnabled()"
              (taskDragged)="onTaskDragged($event)"
              (taskResized)="onTaskResized($event)"
              (selectionChange)="selectionChange.emit($event)"
              (rowClick)="onCanvasRowClick($event)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- ── Legend (optional) ─────────────────────────────────── -->
    @if (showLegend() && legendItems().length) {
      <div
        class="gantt-legend"
        [style.background-color]="theme().panelBg"
        [style.border]="'1px solid ' + theme().borderColor"
        [style.color]="theme().textSecondary"
      >
        <span class="gantt-legend-title" [style.color]="theme().textMuted">{{ i18n.labels().legend }}</span>
        @for (item of legendItems(); track item.label) {
          <span class="gantt-legend-item">
            <svg width="18" height="12" aria-hidden="true">
              <line x1="9" y1="0" x2="9" y2="12"
                [attr.stroke]="item.color" stroke-width="2"
                [attr.stroke-dasharray]="item.dashed ? '3 2' : null" />
            </svg>
            <span [style.color]="theme().textPrimary">{{ item.label }}</span>
          </span>
        }
      </div>
    }

    <!-- ── Consumer footer slot ──────────────────────────────── -->
    <ng-content select="[ganttFooter]" />
  `,
  styles: [`
    :host { box-sizing: border-box; }

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
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
      pointer-events: none;
    }
    .gantt-legend-title {
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .4px;
      font-size: 9.5px;
    }
    .gantt-legend-item {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      white-space: nowrap;
    }

    .gantt-timeline-scroll,
    .gantt-panel-scroll {
      scrollbar-width: thin;
      scrollbar-color: var(--gantt-scrollbar-thumb, #CBD5E1) var(--gantt-scrollbar-track, #F1F5F9);
    }
    .gantt-timeline-scroll::-webkit-scrollbar,
    .gantt-panel-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
    .gantt-timeline-scroll::-webkit-scrollbar-track,
    .gantt-panel-scroll::-webkit-scrollbar-track { background: var(--gantt-scrollbar-track, #F1F5F9); }
    .gantt-timeline-scroll::-webkit-scrollbar-thumb,
    .gantt-panel-scroll::-webkit-scrollbar-thumb {
      background: var(--gantt-scrollbar-thumb, #CBD5E1);
      border-radius: 3px;
    }
  `],
})
export class GantryComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {

  // ── Injected services ─────────────────────────────────────
  protected readonly layout = inject(GanttLayoutService);
  protected readonly scrollSvc = inject(GanttScrollService);
  protected readonly themeSvc = inject(GanttThemeService);
  protected readonly i18n = inject(GanttI18nService);
  protected readonly colSvc = inject(GanttColumnService);
  protected readonly selSvc = inject(GanttSelectionService);
  private readonly dragSvc = inject(GanttDragService);
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  // ── DOM references ────────────────────────────────────────
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
  readonly rowDblClick = output<any>();

  // ── Theme shortcut ────────────────────────────────────────
  protected readonly theme = computed(() => this.themeSvc.resolvedTheme());

  // ── Virtual scroll state ──────────────────────────────────
  private readonly _vsVisibleRows = signal<any[]>([]);
  private readonly _vsPaddingTop = signal<number>(0);
  private readonly _vsPaddingBot = signal<number>(0);
  /** Canvas viewport height (px), tracked via ResizeObserver so the visible
   *  row window recomputes once the layout settles / the container resizes. */
  private readonly _viewportH = signal<number>(0);
  private _canvasRO?: ResizeObserver;

  protected readonly vsVisibleRows = this._vsVisibleRows.asReadonly();
  protected readonly vsPaddingTop = this._vsPaddingTop.asReadonly();
  protected readonly vsPaddingBottom = this._vsPaddingBot.asReadonly();

  // ── Virtual-scrolled geometries (canvas) ─────────────────
  protected readonly vsVisibleGeos = computed<RowGeometry[]>(() => {
    const visibleIds = new Set(this._vsVisibleRows().map((r: any) => r.task.id));
    return this.layout.rowGeometries().filter(g => visibleIds.has(g.row.task.id));
  });

  // ── Critical path ─────────────────────────────────────────
  readonly criticalIds = computed<Set<string>>(() => {
    if (!this.layout.showCriticalPath()) return new Set();
    const { criticalIds } = computeCriticalPath(this.layout.tasks());
    return criticalIds;
  });

  // ── Annotations (consumer only) ──────────────────────────
  // The "today" marker is NOT injected here — it is drawn once by the
  // canvas/header via layout.todayX(), avoiding a duplicated vertical line.
  protected readonly resolvedAnnotations = computed<GanttAnnotation[]>(() =>
    this.annotations()
  );

  // ── Legend items (today marker + user annotations) ───────
  protected readonly legendItems = computed<{ color: string; label: string; dashed: boolean }[]>(() => {
    const t = this.theme();
    const lbl = this.i18n.labels();
    const items: { color: string; label: string; dashed: boolean }[] = [];
    if (this.layout.showToday() && this.layout.todayX() >= 0) {
      items.push({ color: t.todayColor, label: lbl.today, dashed: false });
    }
    for (const ann of this.annotations()) {
      items.push({
        color: ann.color ?? t.arrowColor,
        label: ann.label?.text ?? lbl.annotation,
        dashed: true,
      });
    }
    return items;
  });

  // ── Lifecycle ─────────────────────────────────────────────

  ngOnInit(): void {
    // Init theme with host element
    this.themeSvc.init(this.hostEl.nativeElement);

    // ngOnInit is not an injection context — effects must run inside one.
    runInInjectionContext(this.injector, () => {
      // Sync darkMode input → service
      effect(() => {
        this.themeSvc.setDarkMode(this.darkMode());
      });

      // Sync series / dataSource → layout
      effect(() => {
        const ds = this.dataSource();
        const tasks = ds ? ds.items() : this.series();
        this.layout.setTasks(tasks);
      });

      // Sync options → layout + i18n
      effect(() => {
        const opts = this.options();
        this.layout.applyOptions(opts);
        this.i18n.apply(opts);
      });

      // Sync columns input → column service
      effect(() => {
        const cols = this.columns();
        if (cols.length) this.colSvc.setColumns(cols);
      });

      // Virtual scroll: row slice follows canvas scrollTop + viewport height
      effect(() => {
        const rows = this.layout.visibleRows();
        void this.scrollSvc.scrollTop();
        void this._viewportH();
        this._runVirtualScroll(rows);
      });
    });
  }

  ngAfterViewInit(): void {
    // Register scroll elements
    const panel = this.panelEl()?.nativeElement;
    const canvas = this.canvasEl()?.nativeElement;
    if (panel) this.scrollSvc.registerPanel(panel);
    if (canvas) this.scrollSvc.registerCanvas(canvas);

    // Track the canvas height so the virtual-scroll window recomputes once the
    // flex layout settles (initial clientHeight can be smaller than final).
    if (canvas) {
      this._viewportH.set(canvas.clientHeight);
      this._canvasRO = new ResizeObserver(() => this._viewportH.set(canvas.clientHeight));
      this._canvasRO.observe(canvas);
    }

    // Scroll to today on mount
    requestAnimationFrame(() => {
      this.scrollToToday('instant');
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Column directives are handled by effect() above;
    // direct input changes are handled by effects in ngOnInit.
  }

  ngOnDestroy(): void {
    this._canvasRO?.disconnect();
    // Other services clean up via DestroyRef.
  }

  // ── Virtual scroll (shared window math on layout rows) ────

  private _runVirtualScroll(rows: any[]): void {
    const rh = this.layout.rowHeight();
    const hh = this.layout.totalHeaderHeight();
    const st = this.scrollSvc.scrollTop();
    const rowScroll = Math.max(0, st);
    const el = this.canvasEl()?.nativeElement;
    const clientH = this._viewportH() || el?.clientHeight || 500;
    const viewH = Math.max(rh, clientH - hh);

    const win = computeVirtualWindow(rowScroll, rh, viewH, rows.length, 4);

    this._vsVisibleRows.set(rows.slice(win.first, win.last + 1));
    this._vsPaddingTop.set(win.paddingTop);
    this._vsPaddingBot.set(win.paddingBottom);
  }

  // ── Event handlers ────────────────────────────────────────

  protected onTaskListRowClick(e: { row: GanttFlatRow; event: MouseEvent }): void {
    this.selSvc.handleClick(e.row.task.id, e.event, this.layout.visibleRows());
    this.rowClick.emit(e.row as unknown as RowGeometry);
  }

  protected onCanvasRowClick(geo: RowGeometry): void {
    this.rowClick.emit(geo);
  }

  protected onSortColumn(key: string): void {
    // Future: implement sort via GanttLayoutService
  }

  protected onTaskDragged(event: TaskDragEvent): void {
    this.layout.updateTask(event.taskId, {
      start: event.newStart,
      end: event.newEnd,
    });
    this.taskDragged.emit(event);
  }

  protected onTaskResized(event: TaskResizeEvent): void {
    this.layout.updateTask(event.taskId, {
      start: event.newStart,
      end: event.newEnd,
    });
    this.taskResized.emit(event);
  }

  // ── Public API ────────────────────────────────────────────

  zoomIn(): void { this.layout.zoomIn(); }
  zoomOut(): void { this.layout.zoomOut(); }

  setViewMode(mode: ViewMode): void { this.layout.viewMode.set(mode); }

  scrollToToday(behavior: ScrollBehavior = 'smooth'): void {
    this.scrollSvc.scrollToToday(
      this.layout.startDate(),
      this.layout.pxPerDay(),
      behavior,
    );
  }

  getSelectedTasks(): GanttTask[] {
    const ids = this.selSvc.getSelectedIds();
    const tasks = this.layout.tasks();
    return tasks.filter(t => ids.includes(t.id));
  }

  setSelectedTasks(ids: string[]): void { this.selSvc.setSelected(ids); }

  clearSelection(): void { this.selSvc.clear(); }

  selectAll(): void { this.selSvc.selectAll(this.layout.visibleRows()); }

  updateTask(id: string, patch: Partial<GanttTask>): void {
    this.layout.updateTask(id, patch);
  }

  appendTasks(tasks: GanttTask[]): void { this.layout.appendTasks(tasks); }

  collapseAll(): void { this.layout.collapseAll(); }
  expandAll(): void { this.layout.expandAll(); }

  togglePanel(): void {
    this.layout.panelVisible.update(v => !v);
  }

  setTheme(override: Partial<GanttTheme>): void {
    this.themeSvc.setCustomTheme(override);
  }

  patchTheme(patch: Partial<GanttTheme>): void {
    this.themeSvc.patchTheme(patch);
  }
}
