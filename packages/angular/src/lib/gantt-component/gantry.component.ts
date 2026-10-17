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
//
//  Accessibility (the Web Component's model): the host is a region named
//  by `labels.ariaChart`, never a tab stop. Tab stops, in order: the
//  toolbar's buttons, the sortable column headers, one task-list row
//  (the focused one, else the one focused last while it is mounted, else
//  the first in view), the collapse toggles, the splitter's separator
//  (`.gantry-splitter-handle`), its collapse toggle (a sibling, not a
//  child: a separator's children are presentational), the timeline
//  viewport (`role=group`, arrow keys scroll it). `focusin` records the
//  focused row (`layout.focusedRowId`, pinned in the virtual window); a
//  focused control that is removed hands focus to the viewport (table
//  view: the tab-stop row). Live regions: `.gantt-sr-live` (polite:
//  selection count, data-source load state) and `.gantt-sr-alert`
//  (a failed page).
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  model,
  type ModelSignal,
  signal,
  computed,
  effect,
  inject,
  viewChild,
  contentChildren,
  linkedSignal,
  ElementRef,
  untracked,
  afterRenderEffect,
  afterNextRender,
  afterEveryRender,
  DestroyRef,
  EnvironmentInjector,
  booleanAttribute,
  DOCUMENT,
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
  zoomAnchorScroll,
  computeBarVisual,
  readStoredState,
  writeStoredState,
  normalizeState,
  viewFromState,
  resolvePanelWidth,
  clampPanelWidth,
  availablePanelWidth,
  splitterValue,
  SPLITTER_KEY_STEP,
  SPLITTER_TOGGLE_OFFSET,
  STATE_SAVE_DELAY,
  CLOCK_INTERVAL,
  buildLegend,
  LEGEND_SWATCH_SIZE,
  isLegendVisible,
  themeMetrics,
  sameThemeMetrics,
  computeCriticalPath,
  type BarVisual,
  type CPMResult,
  type LegendItem,
  type LoadStateSnapshot,
  type ResolvedGanttConfig,
  type SplitterValue,
  type TimelineModel,
} from '@gantry/core';

import { GanttLayoutService } from '../layout/gantt-layout.service';
import { GanttCanvasComponent, type BarVisualOf } from '../layout/gantt-canvas.component';
import { GanttHeaderComponent } from '../header/gantt-header.component';
import {
  GanttTaskListComponent,
  mountedRows,
  sameMountedRows,
  tabStopRow,
  type MountedRow,
} from '../tasklist/gantt-tasklist.component';
import { GanttToolbarComponent } from '../annotations/gantt-toolbar.component';
import { GanttScrollService } from '../scroll/gantt-scroll.service';
import { GanttThemeService } from '../services/gantt-theme.service';
import { GanttI18nService } from '../services/gantt-i18n.service';
import { GanttColumnService } from '../columns/gantt-column.service';
import { GanttColumnDefDirective } from '../columns/gantt-column.directive';
import { GanttSelectionService } from '../selection/gantt-selection.service';
import { GanttDragService } from '../drag/gantt-drag.service';
import { GanttKeyboardDirective } from '../selection/gantt-keyboard.directive';
import { GanttLoadMoreComponent } from '../datasource/gantt-load-more.component';
import { type GanttDataSource } from '../datasource/gantt-datasource';
import { GanttAnnouncer, loadStateOf } from '../a11y/announcer';

/** The control inside the chart that received focus last (focus restore when it is removed) */
interface FocusRecord {
  readonly el: Element;
  /** The load-more footer around it: the footer keeps focus on its own buttons */
  readonly footer: Element | null;
}

@Component({
  selector: 'gantry',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    GanttLayoutService,
    GanttScrollService,
    GanttThemeService,
    GanttI18nService,
    GanttColumnService,
    GanttSelectionService,
    GanttDragService,
    GanttAnnouncer,
  ],
  hostDirectives: [GanttKeyboardDirective],
  imports: [
    GanttToolbarComponent,
    GanttHeaderComponent,
    GanttTaskListComponent,
    GanttCanvasComponent,
    GanttLoadMoreComponent,
  ],
  host: {
    class: 'gantry',
    // A named landmark, not a tab stop: focus moves through the internal tab stops
    role: 'region',
    '[attr.aria-label]': 'i18n.labels().ariaChart',
    '[attr.data-view]': 'layout.view()',
    // Every --gantt-* token of the theme (rendered on the server too); chrome reads them in :host
    '[style]': 'themeSvc.style()',
    '[class.gantry-dark]': 'themeSvc.isDark()',
    '[class.gantry-dragging]': 'dragSvc.isActive()',
    '[class.gantry-loading]': 'dataSource()?.isLoading() === true',
    '(focusin)': 'onFocusIn($event)',
    '(focusout)': 'onFocusOut($event)',
  },
  template: `
    <!-- ── Toolbar (optional) ─────────────────────────────── -->
    @if (showToolbar() && cfg().toolbar; as tb) {
      <gantt-toolbar
        [toolbar]="tb"
        [zoomLevels]="cfg().zoomLevels"
        [currentView]="layout.level()"
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
        class="gantry-panel"
        [style.width.px]="panelPx()"
        [attr.inert]="layout.view() === 'chart' ? '' : null"
        (wheel)="onPanelWheel($event)"
      >
        <gantt-tasklist
          [rows]="tlRows()"
          [tabStopId]="tabStopId()"
          [multiselectable]="multiselectable()"
          [rowCount]="layout.rowCount()"
          [columns]="activeColumns()"
          [cellContext]="layout.columnContext()"
          [rowHeight]="layout.rowHeight()"
          [selectedIds]="selSvc.selectedIds()"
          [colHeaderHeight]="layout.totalHeaderHeight()"
          [indentSize]="cfg().indentSize"
          [paddingTop]="layout.vWindow().paddingTop"
          [paddingBottom]="layout.vWindow().paddingBottom"
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

      <!-- Splitter: drag to resize, Arrow keys to resize, Enter / Space or the toggle to collapse /
           expand. The focusable separator covers the box; the toggle is its sibling (a separator's
           children are presentational). The box hears the keys of both, as the Web Component's. -->
      @if (layout.view() !== 'table') {
        <!-- eslint-disable-next-line @angular-eslint/template/interactive-supports-focus -->
        <div
          class="gantry-splitter"
          [class.is-locked]="!cfg().panel.resizable || layout.view() !== 'split'"
          (pointerdown)="onSplitterDown($event)"
          (keydown)="onSplitterKey($event)"
        >
          <div
            class="gantry-splitter-handle"
            role="separator"
            aria-orientation="vertical"
            tabindex="0"
            [attr.aria-valuenow]="splitter().now"
            [attr.aria-valuemin]="splitter().min"
            [attr.aria-valuemax]="splitter().max"
          ></div>
          @if (cfg().panel.collapsible) {
            <button
              type="button"
              class="gantry-splitter-toggle"
              [style.top.px]="toggleTop()"
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

      <!-- Right: one scrollport — header + bars share horizontal scroll natively. A tab stop
           (arrow keys scroll it), hidden behind the table view. -->
      <div
        #canvasEl
        class="gantry-canvas-viewport"
        role="group"
        tabindex="0"
        [attr.aria-label]="i18n.labels().ariaChart"
        [attr.inert]="layout.view() === 'table' ? '' : null"
      >
        <div class="gantry-canvas-header-sticky">
          <gantt-header />
        </div>
        <gantt-canvas
          [style.margin-bottom.px]="canvasBottomPad()"
          [barVisual]="barVisual()"
          [annotations]="annotations()"
          [criticalIds]="criticalIds()"
          [floatDays]="cpm()?.floatMap"
          [tasksById]="layout.columnContext().taskById"
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
                  [style.stroke]="item.paint"
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
                  [style.fill]="item.paint"
                />
              }
            </svg>
            <span>{{ item.label }}</span>
          </span>
        }
      </div>
    }

    <!-- ── Live regions (read by screen readers, never shown) ── -->
    <div class="gantt-sr-alert" role="alert">{{ srAlert() }}</div>
    <div class="gantt-sr-live" role="status" aria-live="polite" aria-atomic="true">{{ announcer.live() }}</div>

    <!-- ── Consumer footer slot ──────────────────────────────── -->
    <ng-content select="[ganttFooter]" />
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        position: relative;
        box-sizing: border-box;
        font-family: var(--gantt-font);
        font-size: var(--gantt-font-size);
        color: var(--gantt-text);
        background-color: var(--gantt-bg);
      }

      .gantry-main {
        display: flex;
        flex: 1;
        overflow: hidden;
        min-height: 0;
        position: relative;
      }

      .gantry-panel {
        flex: 0 0 auto;
        overflow-x: auto;
        overflow-y: hidden;
        background: var(--gantt-panel-bg);
        transition: width 0.25s ease;
      }
      :host([data-view='chart']) .gantry-panel {
        overflow: hidden;
      }
      .gantry-canvas-viewport {
        flex: 1;
        overflow: auto;
        position: relative;
        min-width: 0;
        min-height: 0;
        background: var(--gantt-bg);
        transition: opacity 0.25s ease;
        outline: none;
      }
      /* Keyboard focus (a tab stop: arrow keys scroll it); inset, so the panes' clipping keeps it whole */
      .gantry-canvas-viewport:focus-visible {
        outline: 2px solid var(--gantt-sel-border);
        outline-offset: -2px;
      }
      .gantry-canvas-header-sticky {
        position: sticky;
        top: 0;
        z-index: 10;
        background: var(--gantt-header-bg);
        width: max-content;
      }
      :host([data-view='table']) .gantry-canvas-viewport {
        opacity: 0;
        pointer-events: none;
      }
      .is-resizing .gantry-panel {
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
      }
      /* The focusable separator covers the box: keyboard focus shows as the highlighted line */
      .gantry-splitter-handle {
        position: absolute;
        inset: 0;
        outline: none;
      }
      .gantry-splitter:hover,
      .gantry-splitter-handle:focus-visible,
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
      .gantry-splitter-toggle:focus-visible {
        opacity: 1;
        outline: 2px solid var(--gantt-sel-border);
        outline-offset: 1px;
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

      .gantry-canvas-viewport,
      .gantry-panel {
        scrollbar-width: thin;
        scrollbar-color: var(--gantt-scrollbar-thumb, #cbd5e1) var(--gantt-scrollbar-track, #f1f5f9);
      }
      .gantry-canvas-viewport::-webkit-scrollbar,
      .gantry-panel::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      .gantry-canvas-viewport::-webkit-scrollbar-track,
      .gantry-panel::-webkit-scrollbar-track {
        background: var(--gantt-scrollbar-track, #f1f5f9);
      }
      .gantry-canvas-viewport::-webkit-scrollbar-thumb,
      .gantry-panel::-webkit-scrollbar-thumb {
        background: var(--gantt-scrollbar-thumb, #cbd5e1);
        border-radius: 3px;
      }

      /* Live regions: read by screen readers, never shown */
      .gantt-sr-alert,
      .gantt-sr-live {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }

      @media (prefers-reduced-motion: reduce) {
        .gantry-panel,
        .gantry-canvas-viewport {
          transition: none;
        }
      }
    `,
  ],
})
export class GantryComponent {
  // ── Injected services ─────────────────────────────────────
  protected readonly layout = inject(GanttLayoutService);
  protected readonly scrollSvc = inject(GanttScrollService);
  protected readonly themeSvc = inject(GanttThemeService);
  protected readonly i18n = inject(GanttI18nService);
  protected readonly colSvc = inject(GanttColumnService);
  protected readonly selSvc = inject(GanttSelectionService);
  protected readonly dragSvc = inject(GanttDragService);
  protected readonly announcer = inject(GanttAnnouncer);
  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);

  // ── DOM references ────────────────────────────────────────
  private readonly mainEl = viewChild<ElementRef<HTMLElement>>('mainEl');
  private readonly panelEl = viewChild<ElementRef<HTMLElement>>('panelEl');
  private readonly canvasEl = viewChild<ElementRef<HTMLElement>>('canvasEl');

  /** `<ng-template ganttColumn>` definitions of the content (inside `@if` / `<ng-container>` too) */
  private readonly columnDefs = contentChildren(GanttColumnDefDirective, { descendants: true });

  // ── Inputs ────────────────────────────────────────────────
  readonly series = input<GanttTask[]>([]);
  readonly dataSource = input<GanttDataSource | null>(null);
  readonly options = input<GanttOptions>({});
  readonly annotations = input<GanttAnnotation[]>([]);
  readonly columns = input<ColumnDef[]>([]);
  /** `true`, `false` or `'auto'` (follows `prefers-color-scheme`); unset: `provideGantt({ darkMode })`, else light. `options.darkMode` wins. */
  readonly darkMode = input<boolean | 'auto' | undefined>(undefined);
  readonly showToolbar = input(true, { transform: booleanAttribute });
  readonly enableDrag = input(true, { transform: booleanAttribute });
  readonly enableResize = input(true, { transform: booleanAttribute });
  readonly tooltipEnabled = input(true, { transform: booleanAttribute });
  /** Show a floating legend explaining the vertical markers (today + annotations) */
  readonly showLegend = input(false, { transform: booleanAttribute });
  /**
   * Zoom level (a `ViewMode` or a custom `zoomLevels` name), two-way: `[(viewMode)]`. Unset:
   * `options.viewMode`, else `'Month'`. Its `viewModeChange` output fires when the level changes
   * through the toolbar, the keyboard, the API, a restored state or `options.viewMode` — not
   * when the parent sets `[viewMode]`, and not on the first render.
   */
  // Explicit type: an inferred union is printed in a build-dependent order in the d.ts (unstable API report)
  readonly viewMode: ModelSignal<ViewMode | (string & {}) | undefined> = model<ViewMode | (string & {}) | undefined>(
    undefined,
  );

  // ── Outputs ───────────────────────────────────────────────
  readonly taskDragged = output<TaskDragEvent>();
  readonly taskResized = output<TaskResizeEvent>();
  readonly selectionChange = output<SelectionChangeEvent>();
  /** A data-source page failed after its automatic retries (`dataSource.retry()` tries again) */
  readonly loadError = output<{ error: unknown; page: number }>();
  readonly rowClick = output<RowGeometry>();
  readonly rowDblClick = output<GanttFlatRow>();
  /** Panel width / collapsed, view, zoom, column widths, collapsed rows or sort changed */
  readonly stateChange = output<GanttState>();

  // ── Resolved configuration (shared render model) ─────────
  /** Resolved theme: only its metrics enter the config (colours reach the chart through the host's `--gantt-*` tokens) */
  private readonly theme = this.themeSvc.resolvedTheme;
  /** The theme values geometry depends on; a colour-only theme change keeps them (and the config) */
  private readonly themeMetrics = computed(() => themeMetrics(this.theme()), { equal: sameThemeMetrics });
  protected readonly cfg = computed<ResolvedGanttConfig>(() =>
    resolveConfig({ ...this.options(), viewMode: this.layout.level() }, this.i18n.bundle(), this.themeMetrics()),
  );
  /** Consumer columns: `options.columns` wins over the `columns` input (compared by reference) */
  private readonly columnSource = computed<ColumnDef[]>(() => {
    const fromOptions = this.options().columns as ColumnDef[] | undefined;
    return fromOptions?.length ? fromOptions : this.columns();
  });
  /** The `ganttColumn` definitions of the content, in template order */
  private readonly directiveColumns = computed<ColumnDef[]>(() => this.columnDefs().map(d => d.def()));
  /** `options.stateKey` (a re-assigned options object with the same key changes nothing) */
  private readonly stateKey = computed(() => this.options().stateKey);

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

  /**
   * The splitter separator's `aria-valuenow` / `aria-valuemin` / `aria-valuemax` (core
   * `splitterValue`): the panel width in px within the widths the splitter allows, as the Web
   * Component's.
   */
  protected readonly splitter = computed<SplitterValue>(
    () =>
      splitterValue({
        view: this.layout.view(),
        panel: this.cfg().panel,
        userWidth: this.layout.panelWidthPx(),
        hostWidth: this.mainWidth(),
      }),
    { equal: (a, b) => a.now === b.now && a.min === b.min && a.max === b.max },
  );
  /** Vertical centre of the splitter's collapse toggle (px): below the header */
  protected readonly toggleTop = computed(() => this.layout.totalHeaderHeight() + SPLITTER_TOGGLE_OFFSET);

  // ── Task list: mounted rows and the tab stop ──────────────
  /**
   * Task-list rows of the layout's `vWindow`: the pinned rows before the window, the window, the
   * pinned rows after it (each pinned row with its offset). Compared by value, so a scroll inside
   * the overscan changes nothing downstream.
   */
  protected readonly tlRows = computed<readonly MountedRow[]>(
    () => mountedRows(this.layout.visibleRows(), this.layout.vWindow(), this.layout.rowHeight()),
    { equal: sameMountedRows },
  );
  /** The row focused last (kept while focus is elsewhere): it keeps the tab stop while mounted */
  private readonly lastFocusedRowId = linkedSignal<string | null, string | null>({
    source: this.layout.focusedRowId,
    computation: (id, prev) => id ?? prev?.value ?? null,
  });
  /** Task id of the task list's one tab-stop row (`tabStopRow`) */
  protected readonly tabStopId = computed(() => {
    const mounted = this.tlRows();
    const preferred = [this.layout.focusedRowId(), this.lastFocusedRowId()];
    // Read, not tracked: the window (so `tlRows`) changes whenever a row crosses the top
    const firstInView = untracked(() => Math.ceil(Math.max(0, this.scrollSvc.scrollTop()) / this.layout.rowHeight()));
    return tabStopRow(mounted, preferred, firstInView)?.row.task.id ?? null;
  });
  /** `aria-multiselectable` of the task list: selection and multi-select are both on */
  protected readonly multiselectable = computed(() => {
    const { enabled, multi } = this.cfg().selection;
    return enabled && multi;
  });

  // ── Live regions ──────────────────────────────────────────
  /** Assertive `.gantt-sr-alert`: `labels.loadError` while the data source's last page failed */
  protected readonly srAlert = computed(() => {
    const error = this.dataSource()?.error();
    return error === null || error === undefined ? '' : this.i18n.labels().loadError;
  });

  // ── Focus ─────────────────────────────────────────────────
  /** The control that received focus last while focus is inside the chart (`null` once it left) */
  private focusRecord: FocusRecord | null = null;

  // ── Horizontal scroll ─────────────────────────────────────
  private readonly envInjector = inject(EnvironmentInjector);
  private readonly hasRows = computed(() => this.layout.visibleRows().length > 0);
  /** Timeline the canvas was last rendered with — anchors the scroll when it changes */
  private _paintedTimeline?: TimelineModel;

  private _stateTimer?: ReturnType<typeof setTimeout>;
  /** `stateKey` whose saved state was restored (each key is restored once) */
  private _restoredStateKey?: string;
  /** Zoom level already reported through `viewModeChange` (undefined before the first render) */
  private _shownLevel?: string;
  /** `localStorage` without touching globals (null on the server; the storage helpers also catch a throw) */
  private readonly storage = (): Storage | null => this.doc.defaultView?.localStorage ?? null;

  // ── Critical path ─────────────────────────────────────────
  /** Only these config fields affect the critical path (cfg itself changes with options, i18n, theme metrics…) */
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

  // ── Bar visuals (@gantry/core) ────────────────────────────
  /**
   * Bar visual of a row geometry, memoised per geometry. A new memo starts whenever an input of
   * `computeBarVisual` changes (config, timeline, critical path, theme metrics, drag / resize
   * flags); a scroll, a selection or a colour-only theme change reuses every visual. Serves any
   * visible row, mounted or not (the canvas, its arrows and `getBarVisual`).
   */
  protected readonly barVisual = computed<BarVisualOf>(() => {
    const cfg = this.cfg();
    const { toX } = this.layout.timeline();
    const { fontPx, barTextColor } = this.themeMetrics();
    const crit = this.criticalIds();
    const resizable = this.dragEnabled() && this.resizeEnabled();
    const memo = new WeakMap<RowGeometry, BarVisual>();
    return geo => {
      let v = memo.get(geo);
      if (!v) {
        const task = geo.row.task;
        v = computeBarVisual({
          geo,
          cfg,
          toX,
          fontPx,
          barTextColor,
          isCritical: crit.has(task.id),
          resizable: resizable && task.draggable !== false,
        });
        memo.set(geo, v);
      }
      return v;
    };
  });

  // ── Legend items (today, annotations, critical path, baseline — @gantry/core) ──
  protected readonly swatchSize = LEGEND_SWATCH_SIZE;
  protected readonly legendItems = computed<LegendItem[]>(() => {
    const cfg = this.cfg();
    return buildLegend({
      showToday: cfg.showToday,
      todayVisible: this.layout.todayX() !== null,
      annotations: this.annotations(),
      labels: this.i18n.labels(),
      criticalPath: cfg.criticalPath,
      baseline: cfg.baseline,
    });
  });
  protected readonly legendVisible = computed(() =>
    isLegendVisible(this.showLegend(), this.layout.view(), this.legendItems()),
  );

  constructor() {
    // Bind the inputs into the services once: everything downstream is computed / linkedSignal
    this.themeSvc.bind({ options: this.options, darkMode: this.darkMode });
    this.i18n.bind(this.options);
    this.colSvc.bind(this.columnSource, this.directiveColumns);
    this.layout.bindTasks(() => this.dataSource()?.items() ?? this.series());
    this.layout.bindState(this.options, this.viewMode);
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

    // Zoom level changes → [(viewMode)] + viewModeChange (unless the parent set it) + persisted state.
    // The first render reports nothing. Created BEFORE the stateKey restore below, so its first run
    // records the level of the inputs: a restored zoom level is then a change like any other (it
    // syncs the model and emits once), as the Web Component's `view-mode-change`.
    effect(() => {
      const level = this.layout.level();
      untracked(() => {
        const first = this._shownLevel === undefined;
        if (level === this._shownLevel) return;
        this._shownLevel = level;
        if (first) return;
        if (this.viewMode() !== level) this.viewMode.set(level);
        this.saveState();
      });
    });

    // options.stateKey → restore the saved state once per key (a storage read, then signal writes)
    effect(() => {
      const key = this.stateKey();
      untracked(() => {
        if (!key || key === this._restoredStateKey) return;
        this._restoredStateKey = key;
        const saved = readStoredState(this.storage, key);
        if (saved) this.setState(saved, false);
      });
    });

    // Data-source failures → loadError output (once per failure)
    effect(() => {
      const ds = this.dataSource();
      const error = ds?.error() ?? null;
      if (ds && error !== null) untracked(() => this.loadError.emit({ error, page: ds.nextPage() }));
    });

    // Data-source load state → the polite live region ("Loading…", "30 tasks loaded", "All 42 tasks
    // loaded"); the state found at the first render is the baseline and is not announced
    let load: LoadStateSnapshot | null | undefined;
    effect(() => {
      const next = loadStateOf(this.dataSource());
      untracked(() => {
        const prev = load;
        load = next;
        if (prev !== undefined) this.announcer.loadState(prev, next);
      });
    });

    // A drag (pointer-down on a draggable bar) takes keyboard focus to the timeline: Escape cancels it
    afterRenderEffect(() => {
      if (this.dragSvc.isActive()) untracked(() => this.canvasEl()?.nativeElement.focus({ preventScroll: true }));
    });

    // After every render: a focused control that went away hands focus back to the chart
    // (nothing tracks every node a render can remove: consumer cells and toolbar content too)
    afterEveryRender(() => this.restoreFocus());

    // After each render: apply `initialScroll` once rows exist, then keep the anchor date in place
    afterRenderEffect(() => {
      const tl = this.layout.timeline();
      const hasRows = this.hasRows();
      const view = this.layout.view();
      const pending = this.layout.initialScrollPending();
      untracked(() => this.syncHorizontalScroll(tl, hasRows, view, pending));
    });

    // Browser only (never on the server): sizes, scroll sync and the clock, released with the chart.
    // `earlyRead`: the panes are registered and measured before the scroll sync above runs
    // (`mixedReadWrite`), so `initialScroll` applies on the first render.
    afterNextRender({ earlyRead: () => this.connectBrowser() });
    // A pending state save is written now, as the Web Component does when it disconnects (the
    // outputs are gone with the chart: no `stateChange`)
    this.destroyRef.onDestroy(() => {
      if (this._stateTimer === undefined) return;
      clearTimeout(this._stateTimer);
      this._stateTimer = undefined;
      this.storeState(this.getState());
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────

  /** After the first render, in the browser: scroll listeners, ResizeObserver, panel transitions, clock. */
  private connectBrowser(): void {
    // Live-region announcements start now: the state the chart rendered with is the baseline
    this.announcer.start();
    const win = this.doc.defaultView;
    const canvas = this.canvasEl()?.nativeElement;
    const panel = this.panelEl()?.nativeElement;
    const main = this.mainEl()?.nativeElement;
    if (panel) this.scrollSvc.registerPanel(panel);
    if (canvas) this.scrollSvc.registerCanvas(canvas);

    // Track sizes so the vertical and horizontal windows, fitToWidth and the panel % width follow the layout
    const measure = () => {
      if (canvas) {
        this.layout.viewportHeight.set(canvas.clientHeight);
        this.layout.viewportWidth.set(canvas.clientWidth);
        this.canvasSB.set(canvas.offsetHeight - canvas.clientHeight);
      }
      if (panel) this.panelSB.set(panel.offsetHeight - panel.clientHeight);
      if (main) this.mainWidth.set(main.clientWidth);
    };
    measure();
    // Width transitions start one frame after the measured render
    const frame = win?.requestAnimationFrame?.(() => this.panelAnimated.set(true));
    if (frame === undefined) this.panelAnimated.set(true);
    const observer = typeof win?.ResizeObserver === 'function' ? new win.ResizeObserver(measure) : null;
    // Scrollbars appear/disappear with the content width too
    for (const el of [canvas, panel, main, canvas?.lastElementChild, panel?.firstElementChild]) {
      if (el) observer?.observe(el);
    }
    // Keep "today" fresh in long-lived sessions
    const clock = setInterval(() => this.layout.now.set(Date.now()), CLOCK_INTERVAL);

    this.destroyRef.onDestroy(() => {
      observer?.disconnect();
      clearInterval(clock);
      if (frame !== undefined) win?.cancelAnimationFrame(frame);
    });
  }

  // ── Focus ─────────────────────────────────────────────────

  /** Focus moved inside the chart: remember the control, record the task-list row holding it (pinned). */
  protected onFocusIn(event: FocusEvent): void {
    const target = event.target as Element;
    this.focusRecord = { el: target, footer: target.closest('gantt-load-more') };
    this.layout.focusedRowId.set(target.closest('.gantt-tl-row')?.getAttribute('data-task-id') ?? null);
  }

  /** Focus left the chart for another control (a removed, moved or clicked-away control has no related target). */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && !this.hostEl.nativeElement.contains(next)) {
      this.focusRecord = null;
      this.layout.focusedRowId.set(null);
    }
  }

  /**
   * After a render: when the control that held focus was removed and nothing holds focus now, focus
   * the rebuilt control with the same `data-focus-key`, else the timeline viewport, else (table view)
   * the task list's tab-stop row — so the keyboard shortcuts keep working. A control still in the
   * page lost focus to a click outside any control: nothing to restore.
   */
  private restoreFocus(): void {
    const record = this.focusRecord;
    if (!record) return;
    const active = this.doc.activeElement;
    if (active && active !== this.doc.body && active.isConnected) return;
    this.focusRecord = null;
    // The load-more footer keeps focus on its own buttons (`GanttLoadMoreComponent`)
    if (record.el.isConnected || record.footer?.isConnected) return;
    const host = this.hostEl.nativeElement;
    const key = record.el.getAttribute('data-focus-key');
    const same =
      key === null
        ? undefined
        : [...host.querySelectorAll<HTMLElement>('[data-focus-key]')].find(
            el => el.getAttribute('data-focus-key') === key,
          );
    const target =
      same ??
      (this.layout.view() === 'table'
        ? host.querySelector<HTMLElement>('.gantt-tl-row[tabindex="0"]')
        : this.canvasEl()?.nativeElement);
    target?.focus({ preventScroll: true });
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
      const step = e.key === 'ArrowLeft' ? -SPLITTER_KEY_STEP : SPLITTER_KEY_STEP;
      this.layout.panelWidthPx.set(clampPanelWidth(this.panelPx() + step, this.cfg().panel, available));
      this.saveState();
    }
  }

  /** First render with data → `initialScroll`; later timeline changes keep the anchor date in place. */
  private syncHorizontalScroll(tl: TimelineModel, hasRows: boolean, view: GanttView, pending: boolean): void {
    const canvas = this.canvasEl()?.nativeElement;
    if (!canvas || view === 'table') return;
    const prev = this._paintedTimeline;
    this._paintedTimeline = tl;
    if (pending) {
      if (!hasRows) return;
      this.layout.initialScrollPending.set(false);
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

  /** Current view, read-only (`setView()` / `togglePanel()` change it) */
  readonly view = this.layout.view.asReadonly();

  zoomIn(): void {
    this.layout.zoomIn();
  }
  zoomOut(): void {
    this.layout.zoomOut();
  }

  /** Switch the zoom level: a `ViewMode` or a custom `zoomLevels` name (reported through `viewModeChange`). */
  setViewMode(mode: ViewMode | (string & {})): void {
    this.layout.level.set(mode);
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
        this.layout.initialScrollPending.set(false);
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

  /**
   * Bar geometry and paints of a task (`computeBarVisual` from @gantry/core, the same object the
   * canvas paints), or `undefined` when the task has no visible row. Works for rows outside the
   * virtual window too.
   */
  getBarVisual(id: string): BarVisual | undefined {
    const geo = this.layout.geometryById().get(id);
    return geo && this.barVisual()(geo);
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

  /** Drop the `setTheme()` / `patchTheme()` overrides (`options.theme` and the global theme stay). */
  resetTheme(): void {
    this.themeSvc.resetTheme();
  }

  /** Snapshot of the UI state (panel, view, zoom, column widths, collapsed rows, sort). */
  getState(): GanttState {
    return {
      panelWidth: this.layout.panelWidthPx() ?? (this.layout.view() === 'split' ? this.panelPx() : undefined),
      panelCollapsed: this.layout.view() === 'chart',
      view: this.layout.view(),
      viewMode: this.layout.level(),
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
    if (state.viewMode) this.layout.level.set(state.viewMode);
    if (state.columnWidths) this.colSvc.setColumnWidths(state.columnWidths);
    if (state.collapsedIds) this.layout.collapsedIds.set(new Set(state.collapsedIds));
    if (state.sort !== undefined) this.layout.sort.set(state.sort);
    if (emit) this.saveState();
  }

  /** Debounced: emit `stateChange` and persist under `options.stateKey` (a pending save is written on destroy). */
  protected saveState(): void {
    clearTimeout(this._stateTimer);
    this._stateTimer = setTimeout(() => {
      this._stateTimer = undefined;
      const state = this.getState();
      this.stateChange.emit(state);
      this.storeState(state);
    }, STATE_SAVE_DELAY);
  }

  /** Write `state` under `options.stateKey` (nothing without a key). */
  private storeState(state: GanttState): void {
    const key = this.options().stateKey;
    if (key) writeStoredState(this.storage, key, state);
  }
}
