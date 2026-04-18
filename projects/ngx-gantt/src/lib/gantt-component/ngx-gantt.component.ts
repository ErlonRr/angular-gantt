// ─────────────────────────────────────────────────────────────
//  ngx-gantt · gantt-component/ngx-gantt.component.ts
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
  contentChildren,
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
} from '../types';

import { GanttLayoutService }          from '../layout/gantt-layout.service';
import { GanttCanvasComponent }        from '../layout/gantt-canvas.component';
import { GanttHeaderComponent }        from '../header/gantt-header.component';
import { GanttTaskListComponent }      from '../tasklist/gantt-tasklist.component';
import { GanttToolbarComponent }       from '../annotations/gantt-toolbar.component';
import { GanttScrollService }          from '../scroll/gantt-scroll.service';
import { GanttThemeService }           from '../services/gantt-theme.service';
import { GanttColumnService }          from '../columns/gantt-column.service';
import { GanttColumnDefDirective }     from '../columns/gantt-column.directive';
import { GanttSelectionService }       from '../selection/gantt-selection.service';
import { GanttDragService }            from '../drag/gantt-drag.service';
import { GanttKeyboardDirective }      from '../selection/gantt-keyboard.directive';
import { GanttVirtualScrollDirective } from '../virtual-scroll/gantt-virtual-scroll.directive';
import { GanttLoadMoreComponent }      from '../datasource/gantt-load-more.component';
import { GanttDataSource }             from '../datasource/gantt-datasource';
import { computeCriticalPath }         from '../gantt-cpm';
import { DEFAULT_COLUMNS }             from '../gantt-data';

@Component({
  selector: 'ngx-gantt',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    GanttLayoutService,
    GanttScrollService,
    GanttThemeService,
    GanttColumnService,
    GanttSelectionService,
    GanttDragService,
  ],
  hostDirectives: [{
    directive: GanttKeyboardDirective,
    inputs:    ['visibleRows'],
  }],
  imports: [
    GanttToolbarComponent,
    GanttHeaderComponent,
    GanttTaskListComponent,
    GanttCanvasComponent,
    GanttVirtualScrollDirective,
    GanttLoadMoreComponent,
  ],
  host: {
    'class':              'ngx-gantt',
    '[style.display]':    '"flex"',
    '[style.flex-direction]': '"column"',
    '[style.overflow]':   '"hidden"',
    '[style.position]':   '"relative"',
    '[attr.tabindex]':    '"0"',
    '[style.font-family]': 'themeSvc.resolvedTheme().fontFamily',
    '[style.font-size]':  'themeSvc.resolvedTheme().fontSize',
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
      <!-- ── Left: Task list panel ──────────────────────────── -->
      @if (layout.panelVisible()) {
        <div
          #panelEl
          [style.width.px]="layout.panelWidth()"
          [style.flex-shrink]="'0'"
          [style.display]="'flex'"
          [style.flex-direction]="'column'"
          [style.overflow-y]="'auto'"
          [style.overflow-x]="'hidden'"
          [style.background-color]="theme().panelBg"
          [style.border-right]="'1px solid ' + theme().panelBorder"
        >
          <!-- Sticky column headers (same height as gantt header) -->
          <div
            [style.height.px]="layout.totalHeaderHeight()"
            [style.flex-shrink]="'0'"
            [style.position]="'sticky'"
            [style.top]="'0'"
            [style.z-index]="'10'"
            [style.background-color]="theme().headerBackground"
            [style.border-bottom]="'1px solid ' + theme().borderColor"
            [style.display]="'grid'"
            [style.grid-template-columns]="colSvc.gridTemplate()"
            [style.align-items]="'end'"
          >
            @for (col of colSvc.visibleColumns(); track col.key) {
              <div
                [style.padding]="'0 8px 4px'"
                [style.font-size]="'11px'"
                [style.font-weight]="'600'"
                [style.color]="theme().textMuted"
                [style.overflow]="'hidden'"
                [style.text-overflow]="'ellipsis'"
                [style.white-space]="'nowrap'"
                [style.border-right]="'1px solid ' + theme().borderColor"
                [style.cursor]="col.sortable ? 'pointer' : 'default'"
                (click)="col.sortable && onSortColumn(col.key)"
              >{{ col.label }}</div>
            }
          </div>

          <!-- Spacer top (virtual scroll) -->
          <div [style.height.px]="vsPaddingTop()"></div>

          <!-- Task rows -->
          @for (row of vsVisibleRows(); track row.task.id) {
            <div
              class="ngx-gantt-row"
              [style.height.px]="layout.rowHeight()"
              [style.display]="'grid'"
              [style.grid-template-columns]="colSvc.gridTemplate()"
              [style.background-color]="selSvc.isSelected(row.task.id)
                ? theme().selectionBg : (row.task.rowColor ?? (row.visibleIndex % 2 === 0 ? theme().rowBg : theme().rowBgAlt))"
              [style.border-bottom]="'1px solid ' + theme().borderColor"
              [style.cursor]="'pointer'"
              (click)="onRowClick($event, row)"
              (dblclick)="rowDblClick.emit(row)"
            >
              @for (col of colSvc.visibleColumns(); track col.key) {
                <div
                  [style.display]="'flex'"
                  [style.align-items]="'center'"
                  [style.padding]="'0 6px'"
                  [style.overflow]="'hidden'"
                  [style.border-right]="'1px solid ' + theme().borderColor"
                >
                  @if (col.key === 'name') {
                    <!-- Name cell: indent + collapse toggle -->
                    <span
                      [style.display]="'flex'"
                      [style.align-items]="'center'"
                      [style.gap]="'4px'"
                      [style.padding-left.px]="row.level * 16"
                      [style.width]="'100%'"
                      [style.overflow]="'hidden'"
                    >
                      @if (row.hasChildren) {
                        <button
                          [style.background]="'none'"
                          [style.border]="'none'"
                          [style.cursor]="'pointer'"
                          [style.padding]="'0 2px'"
                          [style.color]="theme().textMuted"
                          [style.font-size]="'10px'"
                          [style.flex-shrink]="'0'"
                          [style.line-height]="'1'"
                          (click)="onCollapseClick($event, row.task.id)"
                        >{{ row.isCollapsed ? '▶' : '▼' }}</button>
                      } @else {
                        <span [style.width]="'14px'" [style.flex-shrink]="'0'"></span>
                      }
                      <span
                        [style.overflow]="'hidden'"
                        [style.text-overflow]="'ellipsis'"
                        [style.white-space]="'nowrap'"
                        [style.font-weight]="row.hasChildren ? '600' : '400'"
                        [style.color]="theme().textPrimary"
                      >{{ row.task.name }}</span>
                    </span>
                  } @else {
                    <span
                      [style.overflow]="'hidden'"
                      [style.text-overflow]="'ellipsis'"
                      [style.white-space]="'nowrap'"
                      [style.color]="theme().textSecondary"
                      [style.font-size]="'12px'"
                    >{{ col.render ? col.render(row) : '' }}</span>
                  }
                </div>
              }
            </div>
          }

          <!-- Spacer bottom (virtual scroll) -->
          <div [style.height.px]="vsPaddingBottom()"></div>

          <!-- Load-more footer -->
          @if (dataSource()) {
            <gantt-load-more
              [theme]="theme()"
              [isLoading]="dataSource()!.isLoading()"
              [hasMore]="dataSource()!.hasMore()"
              [loadedCount]="dataSource()!.loadedCount()"
              [autoLoad]="true"
              (loadMore)="dataSource()!.loadNext()"
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

    <!-- ── Consumer footer slot ──────────────────────────────── -->
    <ng-content select="[ganttFooter]" />
  `,
  styles: [`
    :host { box-sizing: border-box; }

    .ngx-gantt-row { transition: background-color 0.08s; }
    .ngx-gantt-row:hover { filter: brightness(0.97); }

    .gantt-timeline-scroll {
      scrollbar-width: thin;
      scrollbar-color: var(--gantt-scrollbar-thumb, #CBD5E1) var(--gantt-scrollbar-track, #F1F5F9);
    }
    .gantt-timeline-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
    .gantt-timeline-scroll::-webkit-scrollbar-track { background: var(--gantt-scrollbar-track, #F1F5F9); }
    .gantt-timeline-scroll::-webkit-scrollbar-thumb {
      background: var(--gantt-scrollbar-thumb, #CBD5E1);
      border-radius: 3px;
    }
  `],
})
export class NgxGanttComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {

  // ── Injected services ─────────────────────────────────────
  protected readonly layout   = inject(GanttLayoutService);
  protected readonly scrollSvc = inject(GanttScrollService);
  protected readonly themeSvc  = inject(GanttThemeService);
  protected readonly colSvc    = inject(GanttColumnService);
  protected readonly selSvc    = inject(GanttSelectionService);
  private   readonly dragSvc   = inject(GanttDragService);
  private   readonly hostEl    = inject(ElementRef<HTMLElement>);
  private   readonly injector  = inject(Injector);

  // ── DOM references ────────────────────────────────────────
  private readonly panelEl  = viewChild<ElementRef<HTMLElement>>('panelEl');
  private readonly canvasEl = viewChild<ElementRef<HTMLElement>>('canvasEl');

  // ── Content children (column directives) ─────────────────
  private readonly columnDefs = contentChildren(GanttColumnDefDirective);

  // ── Inputs ────────────────────────────────────────────────
  readonly series        = input<GanttTask[]>([]);
  readonly dataSource    = input<GanttDataSource | null>(null);
  readonly options       = input<GanttOptions>({});
  readonly annotations   = input<GanttAnnotation[]>([]);
  readonly columns       = input<ColumnDef[]>([]);
  readonly darkMode      = input<boolean | 'auto'>(false);
  readonly showToolbar   = input<boolean>(true);
  readonly enableDrag    = input<boolean>(true);
  readonly enableResize  = input<boolean>(true);
  readonly tooltipEnabled = input<boolean>(true);

  // ── Outputs ───────────────────────────────────────────────
  readonly taskDragged     = output<TaskDragEvent>();
  readonly taskResized     = output<TaskResizeEvent>();
  readonly selectionChange = output<SelectionChangeEvent>();
  readonly rowClick        = output<RowGeometry>();
  readonly rowDblClick     = output<any>();

  // ── Theme shortcut ────────────────────────────────────────
  protected readonly theme = computed(() => this.themeSvc.resolvedTheme());

  // ── Virtual scroll state ──────────────────────────────────
  private readonly _vsVisibleRows  = signal<any[]>([]);
  private readonly _vsPaddingTop   = signal<number>(0);
  private readonly _vsPaddingBot   = signal<number>(0);

  protected readonly vsVisibleRows   = this._vsVisibleRows.asReadonly();
  protected readonly vsPaddingTop    = this._vsPaddingTop.asReadonly();
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

  // ── Annotations (merge consumer + today) ─────────────────
  protected readonly resolvedAnnotations = computed<GanttAnnotation[]>(() => {
    const anns = [...this.annotations()];
    if (this.options().showToday !== false) {
      anns.unshift({ x1: new Date(), isToday: true });
    }
    return anns;
  });

  // ── Scroll sync (panel ↔ canvas vertical) ─────────────────
  private _scrollSetup = false;

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
        const ds   = this.dataSource();
        const tasks = ds ? ds.items() : this.series();
        this.layout.setTasks(tasks);
      });

      // Sync options → layout
      effect(() => {
        this.layout.applyOptions(this.options());
      });

      // Sync columns input → column service
      effect(() => {
        const cols = this.columns();
        if (cols.length) this.colSvc.setColumns(cols);
      });

      // Virtual scroll: row slice follows canvas scrollTop (minus timeline header height)
      effect(() => {
        const rows = this.layout.visibleRows();
        void this.scrollSvc.scrollTop();
        this._runVirtualScroll(rows);
      });
    });
  }

  ngAfterViewInit(): void {
    // Register scroll elements
    const panel  = this.panelEl()?.nativeElement;
    const canvas = this.canvasEl()?.nativeElement;
    if (panel)  this.scrollSvc.registerPanel(panel);
    if (canvas) this.scrollSvc.registerCanvas(canvas);

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
    // Services clean up via DestroyRef — nothing needed here.
  }

  // ── Virtual scroll (simple implementation on layout rows) ──

  private _runVirtualScroll(rows: any[]): void {
    const rh       = this.layout.rowHeight();
    const hh       = this.layout.totalHeaderHeight();
    const st       = this.scrollSvc.scrollTop();
    const rowScroll = Math.max(0, st - hh);
    const el       = this.canvasEl()?.nativeElement;
    const viewH    = Math.max(rh, (el?.clientHeight ?? 500) - hh);
    const overscan = 4;

    const first  = Math.max(0, Math.floor(rowScroll / rh) - overscan);
    const last   = Math.min(
      rows.length - 1,
      Math.ceil((rowScroll + viewH) / rh) + overscan,
    );

    this._vsVisibleRows.set(rows.slice(first, last + 1));
    this._vsPaddingTop.set(first * rh);
    this._vsPaddingBot.set(Math.max(0, (rows.length - last - 1) * rh));
  }

  // ── Event handlers ────────────────────────────────────────

  protected onCollapseClick(event: MouseEvent, taskId: string): void {
    event.stopPropagation();
    this.layout.toggleCollapse(taskId);
  }

  protected onRowClick(event: MouseEvent, row: any): void {
    this.selSvc.handleClick(row.task.id, event, this.layout.visibleRows());
    this.rowClick.emit(row);
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
      end:   event.newEnd,
    });
    this.taskDragged.emit(event);
  }

  protected onTaskResized(event: TaskResizeEvent): void {
    this.layout.updateTask(event.taskId, {
      start: event.newStart,
      end:   event.newEnd,
    });
    this.taskResized.emit(event);
  }

  // ── Public API ────────────────────────────────────────────

  zoomIn():  void { this.layout.zoomIn(); }
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
    const ids  = this.selSvc.getSelectedIds();
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

  collapseAll(): void  { this.layout.collapseAll(); }
  expandAll():  void   { this.layout.expandAll(); }

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
