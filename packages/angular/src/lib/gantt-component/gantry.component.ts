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
//  │                (div.gantt-state over the body while not ready) │
//  ├────────────────┴─┴───────────────────────────────────────────┤
//  │  div.gantt-legend.gantt-legend--bottom      (showLegend)     │
//  │  <ng-content select="[ganttFooter]">                         │
//  └──────────────────────────────────────────────────────────────┘
//  Views: 'split' (both), 'table' (task list only), 'chart' (timeline only).
//
//  States (D11 of phase 9): `loading`, `errorMessage` and the data source's
//  load state resolve to `layout.chartState` (core `resolveChartState`):
//  the state box (`div.gantt-state[ganttChartState]`, `[ganttEmpty]`
//  content projected into its empty state), the host's `aria-busy`, the
//  task-list footer, and the `retry` output.
//
//  Geometry comes from the @gantryjs/core render model (shared with the
//  Web Component). The component itself contains no layout math.
//
//  Accessibility (the Web Component's model): the host is a region named
//  by `labels.ariaChart`, never a tab stop. Tab stops, in order: the
//  toolbar (one roving stop), the task list (one stop: a row-first
//  treegrid whose header cells, rows and cells rove), the splitter's
//  separator (`.gantry-splitter-handle`), its collapse toggle (a sibling,
//  not a child: a separator's children are presentational), the
//  timeline's tab-stop bar (the bars rove; the viewport, `role=group`, is
//  a tab stop only while no bar is mounted: its arrow keys scroll). The
//  keys are the `GanttKeyboardDirective` host directive (contract §3d of
//  Gantry 2 phase 9: grid and bar navigation, selection, keyboard move
//  mode, the global shortcuts). `focusin` records the focused row (a
//  task-list row or cell, or a bar: `layout.focusedRowId`, pinned in the
//  virtual window, so both panes' tab stops follow it). After every
//  render, a control a key moved to before it was mounted is focused, and
//  a focused control that was removed hands focus to the control with its
//  `data-focus-key`, else the tab-stop bar, else the viewport (table view:
//  the task list's tab stop).
//  Live regions: `.gantt-sr-live` (polite, debounced: selection count,
//  data-source load state, zoom level) and `.gantt-sr-alert` (a failed
//  page while rows are shown; with none, the error state box says it).
//
//  Host (phase 10): `data-view`, `data-density` and `data-narrow` (while
//  below `responsive.breakpoint`); the host style map carries the theme
//  tokens, the read-only layout variables (`--gantt-row-height`,
//  `--gantt-bar-height`: core `layoutCssVars`) and the toolbar's
//  `--gantry-control-size`. The responsive view switch
//  (`layout/responsive.ts`) hears the measured width and the user's view
//  picks; the sync member (`sync/gantt-sync.ts`) follows `[syncGroup]`
//  and hears the level, panel width and scroll changes.
//
//  Editing (phase 11): every task change — a drag, a resize, move mode,
//  the progress grip, a cell, a link, the API (`addDependency()`…),
//  undo / redo — goes through the chart's editor
//  (`editing/gantt-editor.service.ts`, the change pipeline), which applies
//  it to the raw input: the data source (`patch`), else the `series`
//  model (`[(series)]`). Its events are the outputs `beforeChange` (veto
//  with `preventDefault()`), the op events (`taskDragged`, `taskResized`,
//  `taskProgressChanged`, `dependencyCreated`, `dependencyDeleted`),
//  `taskUpdated`, `tasksChange` and `historyChange`; `canUndo` /
//  `canRedo` are signals. The link, progress and cell services
//  (`editing/link.ts`, `progress.ts`, `cell-edit.ts`) are the gestures'
//  (wave 4); the host has the class `gantry-linking` while a link is drawn.
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  model,
  type ModelSignal,
  type OutputEmitterRef,
  signal,
  computed,
  effect,
  inject,
  type Signal,
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
  contentChild,
  DOCUMENT,
  ChangeDetectorRef,
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
  DependencyType,
} from '../types';
import {
  resolveConfig,
  initialScrollLeft,
  anchoredScrollLeft,
  fitScrollLeft,
  computeBarVisual,
  readStoredState,
  writeStoredState,
  normalizeState,
  viewFromState,
  togglePanelView,
  resolvePanelWidth,
  clampPanelWidth,
  availablePanelWidth,
  splitterValue,
  SPLITTER_KEY_STEP,
  SPLITTER_TOGGLE_OFFSET,
  STATE_SAVE_DELAY,
  CLOCK_INTERVAL,
  themeMetrics,
  sameThemeMetrics,
  tabStopIndex,
  timelineScrollPadding,
  layoutCssVars,
  rollupSource,
  dragChange,
  linkChange,
  fieldLabel,
  findColumn,
  type BarSegment,
  type BarVisual,
  type CPMResult,
  type DependencyChangeEvent,
  type EditRules,
  type GanttBeforeChangeEvent,
  type GanttChangeSource,
  type GanttHistoryState,
  type GanttTasksChangeEvent,
  type ResolvedTaskStyle,
  type TaskProgressEvent,
  type TaskUpdatedEvent,
  type GanttSyncGroup,
  type LoadStateSnapshot,
  type ResolvedGanttConfig,
  type RetryEvent,
  type SplitterValue,
  type TimelineModel,
} from '@gantryjs/core';

import { GanttLayoutService, type GanttScrollRequest } from '../layout/gantt-layout.service';
import { GanttCanvasComponent, type BarVisualOf } from '../layout/gantt-canvas.component';
import { GanttHeaderComponent } from '../header/gantt-header.component';
import {
  GanttTaskListComponent,
  mountedRows,
  sameMountedRows,
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
import { GanttLegendComponent } from '../legend/gantt-legend.component';
import { GanttChartStateComponent } from '../states/gantt-chart-state.component';
import { GanttDragReadoutComponent, injectDragReadout } from '../drag/gantt-drag-readout.component';
import { GanttBarFocusService } from '../bars/bar-focus.service';
import { findFocusKey, focusIntoView, focusKeyOf, isInert } from '../a11y/grid-keys';
import { GanttTooltipTemplateDirective } from '../tooltip/gantt-tooltip-template.directive';
import { bindZoomGestures } from '../scroll/zoom-gestures';
import { GanttResponsive } from '../layout/responsive';
import { GanttSync } from '../sync/gantt-sync';
import {
  GanttEditorService,
  sameHistorySettings,
  type GanttEditorEvents,
  type GanttHistorySettings,
} from '../editing/gantt-editor.service';
import { GanttLinkService } from '../editing/link';
import { GanttProgressService } from '../editing/progress';
import { GanttCellEditService } from '../editing/cell-edit';

/** The control inside the chart that received focus last (focus restore when it is removed) */
interface FocusRecord {
  readonly el: Element;
  /** The load-more footer around it: the footer keeps focus on its own buttons */
  readonly footer: Element | null;
}

/** Same CSS property map (same keys, same values) */
function sameStyleMap(a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => a[k] === b[k]);
}

/** A row as events carry it: a rolled-up parent's row with its raw task (core `rollupSource`) */
function rawRow(row: GanttFlatRow): GanttFlatRow {
  const task = rollupSource(row.task);
  return task === row.task ? row : { ...row, task };
}

/** Everything `computeBarVisual` reads besides the row: a new memo of visuals starts when one changes */
interface BarInputs {
  readonly cfg: ResolvedGanttConfig;
  readonly toX: (d: Date) => number;
  readonly fontPx: number;
  readonly barTextColor: string;
  readonly critical: ReadonlySet<string>;
  readonly styleOf: (row: GanttFlatRow) => ResolvedTaskStyle;
  readonly segmentsOf: (geo: RowGeometry) => BarSegment[] | null;
  readonly rulesOf: (row: GanttFlatRow) => EditRules;
}

/**
 * A row's bar visual (core `computeBarVisual`): its resolved style and segments, resize handles,
 * progress grip and link connectors as its edit rules allow (D9, D11), and `progress` instead of the
 * task's (a progress drag's preview).
 */
function barVisualOf(inputs: BarInputs, geo: RowGeometry, progress?: number): BarVisual {
  const rules = inputs.rulesOf(geo.row);
  return computeBarVisual({
    geo,
    cfg: inputs.cfg,
    toX: inputs.toX,
    fontPx: inputs.fontPx,
    barTextColor: inputs.barTextColor,
    isCritical: inputs.critical.has(geo.row.task.id),
    resizable: rules.resize,
    progressEditable: rules.progress,
    linkable: rules.linkFrom,
    style: inputs.styleOf(geo.row),
    segments: inputs.segmentsOf(geo),
    progress,
  });
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
    GanttBarFocusService,
    GanttResponsive,
    GanttSync,
    GanttEditorService,
    GanttLinkService,
    GanttProgressService,
    GanttCellEditService,
  ],
  hostDirectives: [GanttKeyboardDirective],
  imports: [
    GanttToolbarComponent,
    GanttHeaderComponent,
    GanttTaskListComponent,
    GanttCanvasComponent,
    GanttLoadMoreComponent,
    GanttLegendComponent,
    GanttChartStateComponent,
    GanttDragReadoutComponent,
  ],
  host: {
    class: 'gantry',
    // A named landmark, not a tab stop: focus moves through the internal tab stops
    role: 'region',
    '[attr.aria-label]': 'i18n.labels().ariaChart',
    '[attr.data-view]': 'layout.view()',
    // The row, tier and control sizes in use (`density`); present while narrower than `responsive.breakpoint`
    '[attr.data-density]': 'cfg().density',
    '[attr.data-narrow]': "responsive.narrow() ? '' : null",
    // Busy while loading (the skeleton, or the consumer's `loading` over shown rows)
    '[attr.aria-busy]': "layout.chartState().busy ? 'true' : null",
    // Every --gantt-* token of the theme, the read-only layout variables and the control size
    // (rendered on the server too); chrome reads them in :host
    '[style]': 'hostStyle()',
    '[class.gantry-dark]': 'themeSvc.isDark()',
    '[class.gantry-dragging]': 'dragSvc.isActive()',
    // The consumer's `loading` or a data-source page loading (the Web Component's :state(loading))
    '[class.gantry-loading]': 'loading() || dataSource()?.isLoading() === true',
    // A link is being drawn (the Web Component's :state(linking))
    '[class.gantry-linking]': 'layout.link() !== null',
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
        (fit)="fitToScreen()"
        (viewModeChange)="setViewMode($event)"
        (scrollToToday)="scrollToToday()"
        (viewChange)="setView($event)"
        (togglePanel)="togglePanel()"
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
        [style.scroll-padding-top.px]="layout.headerHeight()"
        [attr.inert]="layout.view() === 'chart' ? '' : null"
        (wheel)="onPanelWheel($event)"
      >
        <gantt-tasklist
          [rows]="tlRows()"
          [tabStopId]="tabStopId()"
          [covered]="covered()"
          [multiselectable]="multiselectable()"
          [rowCount]="layout.rowCount()"
          [columns]="activeColumns()"
          [cellContext]="layout.columnContext()"
          [rowHeight]="layout.rowHeight()"
          [selectedIds]="selSvc.selectedIds()"
          [colHeaderHeight]="layout.headerHeight()"
          [indentSize]="cfg().indentSize"
          [paddingTop]="layout.vWindow().paddingTop"
          [paddingBottom]="layout.vWindow().paddingBottom"
          [sort]="layout.sort()"
          [tableView]="layout.view() === 'table'"
          [style.padding-bottom.px]="panelBottomPad()"
          (collapseToggle)="onCollapseToggle($event)"
          (rowClick)="onTaskListRowClick($event)"
          (rowDblClick)="onRowDblClick($event)"
          (columnWidthChange)="colSvc.setColumnWidth($event.key, $event.width)"
          (columnResizeEnd)="saveState()"
          (sortColumn)="onSortColumn($event)"
        />

        <!-- Load-more footer (lazy datasource), while the chart state keeps it (not over the states) -->
        @if (layout.chartState().footer && dataSource(); as ds) {
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
          [attr.inert]="covered() ? '' : null"
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

      <!-- Right: one scrollport — header + bars share horizontal scroll natively. A tab stop while no
           bar is one (arrow keys scroll it), hidden behind the table view. -->
      <div
        #canvasEl
        class="gantry-canvas-viewport"
        role="group"
        [attr.tabindex]="barFocus.viewportTabIndex()"
        [attr.aria-label]="i18n.labels().ariaChart"
        [attr.inert]="layout.view() === 'table' || covered() ? '' : null"
        [style.scroll-padding-top.px]="scrollPadding().top"
        [style.scroll-padding-right.px]="scrollPadding().right"
        [style.scroll-padding-bottom.px]="scrollPadding().bottom"
        [style.scroll-padding-left.px]="scrollPadding().left"
      >
        <!-- As tall as the header with its marker lane (the task-list header has the same height) -->
        <div class="gantry-canvas-header-sticky" [style.height.px]="layout.headerHeight()">
          <gantt-header />
        </div>
        <gantt-canvas
          [style.margin-bottom.px]="canvasBottomPad()"
          [barVisual]="barVisual()"
          [baseBarVisual]="taskBarVisual()"
          [criticalIds]="criticalIds()"
          [floatDays]="cpm()?.floatMap"
          [tasksById]="layout.columnContext().taskById"
          [enableDrag]="dragEnabled()"
          [enableSelection]="cfg().selection.enabled"
          [multiSelect]="cfg().selection.multi"
          [tooltipEnabled]="tooltipEnabled()"
          [tooltipTemplate]="tooltipTemplate()?.template ?? null"
          (taskDragged)="onTaskDragged($event)"
          (taskResized)="onTaskResized($event)"
          (rowClick)="onCanvasRowClick($event)"
          (rowDblClick)="onRowDblClick($event)"
        />
        <!-- Drag readout chip (pointer drag, keyboard move mode and the progress grip), attached while it shows -->
        @if (dragReadout(); as readout) {
          <div ganttDragReadout [readout]="readout"></div>
        }
      </div>

      <!-- Loading / error / empty state over the body, attached while the chart is not ready -->
      @let chartState = layout.chartState();
      @if (chartState.kind !== 'ready') {
        <div ganttChartState [state]="chartState" [panelWidth]="panelPx()" (retry)="onRetry($event.source)">
          <ng-content select="[ganttEmpty]"
            ><p class="gantt-state-message">{{ chartState.message }}</p></ng-content
          >
        </div>
      }
    </div>

    <!-- ── Legend (showLegend): the strip under the chart (legend.position 'toolbar': in the toolbar) ── -->
    @if (layout.legendPlacement() === 'bottom') {
      <div class="gantt-legend gantt-legend--bottom" ganttLegend></div>
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
        /* The chart's own line height, whatever the page sets */
        line-height: normal;
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
      /* Keyboard focus (a tab stop while no bar is: arrow keys scroll it); inset, so the panes' clipping keeps it whole */
      .gantry-canvas-viewport:focus-visible {
        outline: 2px solid var(--gantt-focus-ring);
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
      .is-resizing .gantry-splitter {
        background: linear-gradient(
          to right,
          transparent 1px,
          var(--gantt-sel-border) 1px,
          var(--gantt-sel-border) 4px,
          transparent 4px
        );
      }
      .gantry-splitter-handle:focus-visible {
        background: linear-gradient(
          to right,
          transparent 1px,
          var(--gantt-focus-ring) 1px,
          var(--gantt-focus-ring) 4px,
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
        outline: 2px solid var(--gantt-focus-ring);
        outline-offset: 1px;
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

      /* Forced colours (D25, the Web Component's forced-colors.css.ts): every focus ring reads the
         token, so Highlight reaches them all (!important wins over the inline theme tokens); the
         separator's line and its focus / hover line are drawn again (gradients are dropped) */
      @media (forced-colors: active) {
        :host {
          --gantt-focus-ring: Highlight !important;
        }
        .gantry-splitter-handle::before {
          content: '';
          position: absolute;
          top: 0;
          bottom: 0;
          left: 2px;
          width: 1px;
          background-color: CanvasText;
        }
        .gantry-splitter:hover > .gantry-splitter-handle::before,
        .is-resizing .gantry-splitter-handle::before,
        .gantry-splitter-handle:focus-visible::before {
          left: 1px;
          width: 3px;
          background-color: Highlight;
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
  /** The drag readout chip's text and place, `null` while it shows nothing (then it is detached) */
  protected readonly dragReadout = injectDragReadout(this.dragSvc.preview);
  protected readonly announcer = inject(GanttAnnouncer);
  protected readonly barFocus = inject(GanttBarFocusService);
  /** The narrow-width view switch (`options.responsive`): `data-narrow`, the persisted view */
  protected readonly responsive = inject(GanttResponsive);
  /** The chart's member of `[syncGroup]` */
  private readonly sync = inject(GanttSync);
  /** The chart's keyboard (host directive): bound in the constructor, connected after the first render */
  private readonly keyboard = inject(GanttKeyboardDirective, { self: true });
  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly cdr = inject(ChangeDetectorRef);
  /** The change pipeline: every task change, the history */
  private readonly editor = inject(GanttEditorService);
  /** Cell editing (`editCell()`) */
  private readonly cellEdit = inject(GanttCellEditService);

  // ── DOM references ────────────────────────────────────────
  private readonly mainEl = viewChild<ElementRef<HTMLElement>>('mainEl');
  private readonly panelEl = viewChild<ElementRef<HTMLElement>>('panelEl');
  private readonly canvasEl = viewChild<ElementRef<HTMLElement>>('canvasEl');

  /** `<ng-template ganttColumn>` definitions of the content (inside `@if` / `<ng-container>` too) */
  private readonly columnDefs = contentChildren(GanttColumnDefDirective, { descendants: true });
  /** The `<ng-template ganttTooltip>` of the content: custom tooltip content (wins over `options.tooltip.render`) */
  protected readonly tooltipTemplate = contentChild(GanttTooltipTemplateDirective, { descendants: true });

  // ── Inputs ────────────────────────────────────────────────
  /**
   * The tasks, two-way: `[(series)]`. The chart writes it when it applies an edit (a drag, a cell, a
   * link, undo…) without a data source, and in `updateTask()` / `appendTasks()`: the untouched tasks
   * keep their objects. With `editing.controlled` it never writes it (set the tasks from
   * `tasksChange`). Ignored while `dataSource` is set (the edits go to `dataSource.patch()`).
   */
  // Explicit type: the API report prints it as written
  readonly series: ModelSignal<GanttTask[]> = model<GanttTask[]>([]);
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
  /** Show the legend explaining the vertical markers (today, annotations, critical path, baseline) */
  readonly showLegend = input(false, { transform: booleanAttribute });
  /**
   * The consumer is loading the tasks: while the chart has no rows it shows the loading state (a
   * skeleton); over shown rows only the host's `aria-busy` says it. Default false.
   */
  readonly loading = input(false, { transform: booleanAttribute });
  /**
   * Show the error state with this message and a Retry button (which emits `retry` with
   * `{ source: 'error' }`); `null`, `undefined` or a blank string shows none. Default null.
   */
  readonly errorMessage = input<string | null | undefined>(null);
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
  /**
   * A sync group (core `createGanttSyncGroup`) shared with other charts: they keep the same
   * timeline range, zoom level, horizontal scroll and panel width (each can be turned off in the
   * group's options). Passed by reference; `null` (default) leaves the group.
   */
  readonly syncGroup = input<GanttSyncGroup | null | undefined>(null);

  // ── Outputs ───────────────────────────────────────────────
  readonly taskDragged = output<TaskDragEvent>();
  readonly taskResized = output<TaskResizeEvent>();
  readonly selectionChange = output<SelectionChangeEvent>();
  /** A data-source page failed after its automatic retries (`dataSource.retry()` tries again) */
  readonly loadError = output<{ error: unknown; page: number }>();
  /** A row was clicked or activated (Enter) in either pane: its row (a rolled-up parent's with its raw task) */
  readonly rowClick = output<GanttFlatRow>();
  readonly rowDblClick = output<GanttFlatRow>();
  /** Panel width / collapsed, view, zoom, column widths, collapsed rows or sort changed */
  readonly stateChange = output<GanttState>();
  /**
   * Retry was pressed on the error state: `{ source: 'error' }` for `errorMessage` (load again, then
   * clear it), `{ source: 'dataSource' }` after a failed first data-source page (the chart calls
   * `dataSource.retry()`). The task-list footer's Retry (a failed later page) retries the data
   * source without this output.
   */
  readonly retry = output<RetryEvent>();
  /**
   * A change is about to be applied (every edit: drag, resize, keyboard, progress, cell, link, API,
   * undo / redo). Call `preventDefault()` on it, synchronously, to veto it; writing `series` (or the
   * data source) meanwhile counts as handled: nothing is applied (`tasksChange` with `applied: false`).
   */
  readonly beforeChange = output<GanttBeforeChangeEvent>();
  /** After every accepted change: the tasks now, or (`editing.controlled`, `applied: false`) the tasks to set yourself */
  readonly tasksChange = output<GanttTasksChangeEvent>();
  /** One per changed task, after the op events */
  readonly taskUpdated = output<TaskUpdatedEvent>();
  /** A task's progress changed (progress grip, ↑ / ↓ in move mode, the progress cell, undo / redo) */
  readonly taskProgressChanged = output<TaskProgressEvent>();
  /** A dependency was added (link drawn, predecessors cell, `addDependency()`, undo / redo) */
  readonly dependencyCreated = output<DependencyChangeEvent>();
  /** A dependency was removed (selected link + Delete, predecessors cell, `removeDependency()`, undo / redo) */
  readonly dependencyDeleted = output<DependencyChangeEvent>();
  /** The undo / redo state changed (`canUndo`, `canRedo`, labels, counts) */
  readonly historyChange = output<GanttHistoryState>();

  /** The outputs of the editor's events, by the Web Component's names */
  private readonly editorOutputs: { readonly [K in keyof GanttEditorEvents]: OutputEmitterRef<GanttEditorEvents[K]> } =
    {
      'before-change': this.beforeChange,
      'tasks-change': this.tasksChange,
      'task-updated': this.taskUpdated,
      'task-dragged': this.taskDragged,
      'task-resized': this.taskResized,
      'task-progress-changed': this.taskProgressChanged,
      'dependency-created': this.dependencyCreated,
      'dependency-deleted': this.dependencyDeleted,
      'history-change': this.historyChange,
    };

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
  /** Width of the main area (measured; the layout graph's, so the toolbar and responsive read it too) */
  private readonly mainWidth = this.layout.mainWidth;
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
  protected readonly toggleTop = computed(() => this.layout.headerHeight() + SPLITTER_TOGGLE_OFFSET);
  /**
   * The timeline's scroll padding (core `timelineScrollPadding`): what the browser scrolls into view
   * stays below the sticky header, a bar with its whole focus ring (WCAG 2.4.11). The panel keeps
   * `scroll-padding-top` at the header height.
   */
  protected readonly scrollPadding = computed(() => timelineScrollPadding(this.layout.headerHeight()), {
    equal: (a, b) => a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left,
  });
  /**
   * The state box covers the body (the chart is not ready): the timeline, the splitter and the task-list
   * rows under it are inert (out of the tab order and the accessibility tree); the task-list header row
   * stays above the box and keeps the list's tab stop.
   */
  protected readonly covered = computed(() => this.layout.chartState().kind !== 'ready');

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
  /**
   * Task id of the task list's tab-stop row (core `tabStopIndex`): the focused row, else the one
   * focused last while it is mounted, else the first row of the window in view.
   */
  protected readonly tabStopId = computed(() => {
    const mounted = this.tlRows();
    const preferred = [this.layout.focusedRowId(), this.lastFocusedRowId()];
    // Read, not tracked: the window (so `tlRows`) changes whenever a row crosses the top
    const firstInView = Math.ceil(untracked(this.scrollSvc.scrollTop) / this.layout.rowHeight());
    const stop = tabStopIndex(
      mounted.map(m => m.row.task.id),
      preferred,
      mounted.findIndex(m => m.pinnedTop === null && m.row.visibleIndex >= firstInView),
    );
    return mounted[stop]?.row.task.id ?? null;
  });
  /** `aria-multiselectable` of the task list: selection and multi-select are both on */
  protected readonly multiselectable = computed(() => {
    const { enabled, multi } = this.cfg().selection;
    return enabled && multi;
  });

  // ── Live regions ──────────────────────────────────────────
  /**
   * Assertive `.gantt-sr-alert`: `labels.loadError` while the data source's last page failed under
   * shown rows (with no rows the error state box, `role=alert`, says it: read once, not twice)
   */
  protected readonly srAlert = computed(() => {
    // A cell editor's message (an invalid value) wins while it shows
    const cell = this.cellEdit.alert();
    if (cell) return cell;
    const error = this.dataSource()?.error();
    if (error === null || error === undefined || this.layout.chartState().kind === 'error') return '';
    return this.i18n.labels().loadError;
  });

  // ── Focus ─────────────────────────────────────────────────
  /** The control that received focus last while focus is inside the chart (`null` once it left) */
  private focusRecord: FocusRecord | null = null;
  /** `data-focus-key` `focusTask()` asked for: focused after the next render, its focus ring shown */
  private focusRequest: string | null = null;

  // ── Horizontal scroll ─────────────────────────────────────
  private readonly envInjector = inject(EnvironmentInjector);
  private readonly hasRows = computed(() => this.layout.visibleRows().length > 0);
  /** Timeline the canvas was last rendered with — anchors the scroll when it changes */
  private _paintedTimeline?: TimelineModel;

  private _stateTimer?: number;
  /** `stateKey` whose saved state was restored (each key is restored once) */
  private _restoredStateKey?: string;
  /** Zoom level already reported through `viewModeChange` (undefined before the first render) */
  private _shownLevel?: string;
  /** `localStorage` without touching globals (null on the server; the storage helpers also catch a throw) */
  private readonly storage = (): Storage | null => this.doc.defaultView?.localStorage ?? null;

  // ── Critical path ─────────────────────────────────────────
  /** CPM result (critical ids, float), `null` when the critical path is off (the layout graph's: row styles read it) */
  protected readonly cpm: Signal<CPMResult | null> = this.layout.critical;
  readonly criticalIds: Signal<ReadonlySet<string>> = this.layout.criticalIds;

  // ── Bar visuals (@gantryjs/core) ────────────────────────────
  /**
   * Bar visual of a row geometry, memoised per geometry. A new memo starts whenever an input of
   * `computeBarVisual` changes (config, timeline, critical path, theme metrics, drag / resize
   * flags and edit rules, row styles, segments); a scroll, a selection or a colour-only theme change
   * reuses every visual. Serves any visible row, mounted or not (the canvas, its arrows and
   * `getBarVisual`). Each bar gets its row's resolved style (`layout.rowStyle`), with
   * `rollup.segments` a collapsed parent its children's segments (`layout.barSegments`), and the
   * handles, progress grip and connectors its edit rules allow (`layout.editRules`). While a progress
   * drag previews a bar (`layout.progressPreview`), that bar draws the previewed progress.
   */
  protected readonly barVisual = computed<BarVisualOf>(() => {
    const visualOf = this.taskBarVisual();
    // A progress drag draws its bar at the previewed progress; every other bar keeps its visual
    const preview = this.layout.progressPreview();
    if (!preview) return visualOf;
    const inputs = this.barInputs();
    let previewed: { readonly geo: RowGeometry; readonly visual: BarVisual } | null = null;
    return geo => {
      if (geo.row.task.id !== preview.taskId) return visualOf(geo);
      if (previewed?.geo !== geo) previewed = { geo, visual: barVisualOf(inputs, geo, preview.progress) };
      return previewed.visual;
    };
  });

  /** What the bar visuals read besides the row (each bar's edit rules: `layout.editRules`) */
  private readonly barInputs = computed<BarInputs>(() => {
    const { fontPx, barTextColor } = this.themeMetrics();
    return {
      cfg: this.cfg(),
      toX: this.layout.timeline().toX,
      fontPx,
      barTextColor,
      critical: this.criticalIds(),
      styleOf: this.layout.rowStyle(),
      segmentsOf: this.layout.barSegments(),
      rulesOf: this.layout.editRules(),
    };
  });

  /** The bar visuals as the tasks stand (no preview), memoised per geometry */
  protected readonly taskBarVisual = computed<BarVisualOf>(() => {
    const inputs = this.barInputs();
    const memo = new WeakMap<RowGeometry, BarVisual>();
    return geo => {
      let v = memo.get(geo);
      if (!v) {
        v = barVisualOf(inputs, geo);
        memo.set(geo, v);
      }
      return v;
    };
  });

  // ── Host style ────────────────────────────────────────────
  /**
   * The read-only layout variables (`--gantt-row-height`, `--gantt-bar-height`: core
   * `layoutCssVars`) and the toolbar control size of the density (`--gantry-control-size`).
   * Compared by value: only a row height, bar height or density change rewrites them.
   */
  private readonly layoutStyle = computed<Readonly<Record<string, string>>>(
    () => {
      const cfg = this.cfg();
      return { ...Object.fromEntries(layoutCssVars(cfg)), '--gantry-control-size': `${cfg.controlSize}px` };
    },
    { equal: sameStyleMap },
  );
  /** The host's style map: the theme tokens (`themeToCss`), then the layout variables */
  protected readonly hostStyle = computed<Record<string, string>>(() => ({
    ...this.themeSvc.style(),
    ...this.layoutStyle(),
  }));

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
    this.layout.bindChart({
      annotations: () => this.annotations(),
      fontPx: () => this.themeMetrics().fontPx,
      loading: () => this.loading(),
      errorMessage: () => this.errorMessage(),
      loadState: () => loadStateOf(this.dataSource()),
      showLegend: () => this.showLegend(),
      toolbarShown: () => this.showToolbar() && !!this.cfg().toolbar,
      enableDrag: () => this.dragEnabled(),
      enableResize: () => this.resizeEnabled(),
    });
    // The change pipeline: applied to the data source, else the `series` model; its events are the outputs
    this.editor.bind({
      source: () => untracked(() => this.dataSource()?.items() ?? this.series()),
      write: update => this.writeTasks(update),
      emit: (type, detail) => this.editorOutputs[type].emit(detail),
      columnLabel: key =>
        untracked(
          () =>
            findColumn(this.colSvc.columns(), this.colSvc.builtins(), key)?.label ??
            fieldLabel(key, this.i18n.labels()),
        ),
    });
    this.layout.bindHistory(() => this.editor.state());
    // The history follows `editing.history` for the chart's lifetime: created, re-configured (trimmed)
    // or dropped (`historyChange` when that empties it), as the Web Component's element effect
    const historySettings = computed<GanttHistorySettings>(() => this.cfg().editing.history, {
      equal: sameHistorySettings,
    });
    effect(() => {
      const settings = historySettings();
      untracked(() => this.editor.syncHistory(settings));
    });
    // Every selection change — canvas, task list, keyboard or API — reaches the output
    this.selSvc.onChange = e => this.selectionChange.emit(e);
    // The bar overlay paints the bars' focus rings and grips from the chart's visuals
    this.barFocus.bindVisuals(() => this.barVisual());
    // What the keys do to the chart (the keyboard directive's handlers call back into it)
    this.keyboard.bind({
      element: this.hostEl.nativeElement,
      viewport: () => this.canvasEl()?.nativeElement ?? null,
      columns: () => this.activeColumns(),
      barVisual: geo => this.barVisual()(geo),
      dragEnabled: () => this.dragEnabled(),
      resizeEnabled: () => this.resizeEnabled(),
      rowClick: (row, event) => this.onTaskListRowClick({ row, event }),
      sort: key => this.onSortColumn(key),
      saveState: () => this.saveState(),
      selectAll: () => this.selectAll(),
      zoomIn: () => this.zoomIn(),
      zoomOut: () => this.zoomOut(),
      scrollToToday: () => this.scrollToToday(),
      fitToScreen: () => this.fitToScreen(),
      taskDragged: e => this.onTaskDragged(e),
      taskResized: e => this.onTaskResized(e),
    });

    // Zoom level changes → [(viewMode)] + viewModeChange (unless the parent set it) + persisted state.
    // The first render reports nothing. Created BEFORE the stateKey restore below, so its first run
    // records the level of the inputs: a restored zoom level is then a change like any other (it
    // syncs the model and emits once), as the Web Component's `view-mode-change`. A level the sync
    // group applied (a zoom made in another chart) is emitted and saved but not announced: the chart
    // the user zoomed announces it, not every member.
    effect(() => {
      const level = this.layout.level();
      untracked(() => {
        const first = this._shownLevel === undefined;
        if (level === this._shownLevel) return;
        this._shownLevel = level;
        if (first) return;
        if (this.viewMode() !== level) this.viewMode.set(level);
        if (!this.sync.takeGroupLevel(level)) this.announcer.zoom(this.layout.levelLabel());
        this.saveState();
        this.sync.reportLevel(level);
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

    // [syncGroup] → join / leave the group (after the stateKey restore: the group's level and panel
    // width win over a restored state); the chart leaves when it is destroyed
    effect(() => {
      const group = this.syncGroup() ?? null;
      untracked(() => this.sync.connect(group));
    });
    this.destroyRef.onDestroy(() => this.sync.disconnect());

    // Data-source failures → loadError output (once per failure)
    effect(() => {
      const ds = this.dataSource();
      const error = ds?.error() ?? null;
      if (ds && error !== null) untracked(() => this.loadError.emit({ error, page: ds.nextPage() }));
    });

    // Data-source load state → the polite live region ("Loading…", "30 tasks loaded", "All 42 tasks
    // loaded"), from the source's own change stream: every previous → next transition, whenever an
    // effect runs. Tracks the `dataSource` input only: a new source is compared with the last state
    // of the old one. The state found at the first render is the baseline and is not announced.
    let load: LoadStateSnapshot | null | undefined;
    effect(onCleanup => {
      const ds = this.dataSource();
      untracked(() => {
        const next = loadStateOf(ds);
        if (load !== undefined) this.announcer.loadState(load, next);
        load = next;
        if (!ds) return;
        onCleanup(
          ds.ɵsubscribe((prev, state) => {
            load = state;
            this.announcer.loadState(prev, state);
          }),
        );
      });
    });

    // After every render: a focused control that went away hands focus back to the chart
    // (nothing tracks every node a render can remove: consumer cells and toolbar content too)
    afterEveryRender(() => this.restoreFocus());

    // After each render: a scroll request (`fitToScreen`) on the timeline it targets, else a scroll
    // the sync group sent, else `initialScroll` once rows exist, else keep the anchor date in place
    afterRenderEffect(() => {
      const tl = this.layout.timeline();
      const hasRows = this.hasRows();
      const view = this.layout.view();
      const pending = this.layout.initialScrollPending();
      const request = this.layout.scrollRequest();
      // Tracked so that a group scroll alone schedules this
      this.sync.pendingScroll();
      untracked(() => this.syncHorizontalScroll(tl, hasRows, view, pending, request));
    });

    // Browser only (never on the server): sizes, scroll sync and the clock, released with the chart.
    // `earlyRead`: the panes are registered and measured before the scroll sync above runs
    // (`mixedReadWrite`), so `initialScroll` applies on the first render.
    afterNextRender({ earlyRead: () => this.connectBrowser() });
    // A pending state save is written now, as the Web Component does when it disconnects (the
    // outputs are gone with the chart: no `stateChange`)
    this.destroyRef.onDestroy(() => {
      if (this._stateTimer === undefined) return;
      this.doc.defaultView?.clearTimeout(this._stateTimer);
      this._stateTimer = undefined;
      this.storeState(this.getState());
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────

  /** After the first render, in the browser: scroll listeners, ResizeObserver, panel transitions, clock. */
  private connectBrowser(): void {
    // Live-region announcements start now: the state the chart rendered with is the baseline
    this.announcer.start();
    // Input modality (the bars' focus ring) and the pointer press that ends keyboard move mode
    this.barFocus.connect(this.hostEl.nativeElement);
    this.keyboard.connect();
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
      if (main) {
        this.mainWidth.set(main.clientWidth);
        // The responsive view switch hears every measured width (never during a render)
        this.responsive.onWidth(main.clientWidth);
      }
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
    // Ctrl / ⌘ + wheel and pinch zoom, anchored at the pointer
    const unbindZoom = canvas
      ? bindZoomGestures(canvas, {
          zoom: (steps, anchorX) => this.layout.zoomBy(steps, anchorX),
          level: () => this.layout.level(),
          // A bar is moved by the pointer or in keyboard move mode: its maths is in the timeline it started on
          busy: () => this.dragSvc.isActive(),
        })
      : null;

    this.destroyRef.onDestroy(() => {
      observer?.disconnect();
      clearInterval(clock);
      unbindZoom?.();
      if (frame !== undefined) win?.cancelAnimationFrame(frame);
    });
  }

  // ── Focus ─────────────────────────────────────────────────

  /**
   * Focus moved inside the chart: remember the control, record the row holding it (a task-list row
   * or one of its cells or buttons, or a bar: pinned in the virtual window), `null` elsewhere.
   */
  protected onFocusIn(event: FocusEvent): void {
    const target = event.target as Element;
    this.focusRecord = { el: target, footer: target.closest('gantt-load-more') };
    const row = target.closest('.gantt-tl-row, .gantt-bars-layer > [data-task-id]');
    this.layout.focusedRowId.set(row?.getAttribute('data-task-id') ?? null);
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
   * After a render:
   * - a keyboard move to a control that was not mounted yet (a row or bar beyond the virtual window:
   *   PageDown, End) focuses it now and scrolls it into view, else the focus fallback;
   * - when the control that held focus was removed or became inert (the table view hides the
   *   timeline, the state box covers the body) and nothing else holds focus now, the rebuilt control
   *   with the same `data-focus-key` takes it, else the focus fallback — so the keyboard shortcuts
   *   keep working. A control still in the page lost focus to a click outside any control: nothing
   *   to restore.
   */
  private restoreFocus(): void {
    const host = this.hostEl.nativeElement;
    const own = this.focusRequest;
    this.focusRequest = null;
    const keys = this.keyboard.takeFocusRequest();
    const request = keys ?? own;
    if (request !== null) {
      this.focusRecord = null;
      const active = this.doc.activeElement;
      const el =
        active && host.contains(active) && focusKeyOf(active) === request
          ? (active as HTMLElement)
          : findFocusKey(host, request);
      // `focusTask()`'s target shows its focus ring even when a pointer led here
      if (el && !isInert(el)) focusIntoView(el, keys === null);
      else this.focusFallback();
      return;
    }
    const record = this.focusRecord;
    if (!record) return;
    const active = this.doc.activeElement;
    // Focus on a control that just turned inert: the browser drops it at its next update
    const covered = !!active && host.contains(active) && isInert(active);
    if (active && active !== this.doc.body && active.isConnected && !covered) return;
    this.focusRecord = null;
    if (covered || (record.el.isConnected && isInert(record.el))) {
      this.focusFallback();
      return;
    }
    // The load-more footer keeps focus on its own buttons (`GanttLoadMoreComponent`)
    if (record.el.isConnected || record.footer?.isConnected) return;
    const key = focusKeyOf(record.el);
    const same = key === null ? null : findFocusKey(host, key);
    if (same) same.focus({ preventScroll: true });
    else this.focusFallback();
  }

  /**
   * Focus for a chart whose focused control is gone or inert: while the state box covers the body,
   * its Retry, else the toolbar's tab stop, else the task list's (a header cell, above the box);
   * otherwise the timeline's tab stop (the bar with `tabindex=0`, else the viewport when no bar is
   * mounted), else (table view, where the timeline is inert) the task list's tab stop — a row, a
   * cell or a header cell.
   */
  private focusFallback(): void {
    const host = this.hostEl.nativeElement;
    const stop = '[tabindex="0"]';
    let target: HTMLElement | SVGElement | null | undefined;
    if (this.covered()) {
      target =
        host.querySelector<HTMLElement>('.gantt-state-retry') ??
        host.querySelector<HTMLElement>(`.gantt-toolbar ${stop}`) ??
        host.querySelector<HTMLElement>(`gantt-tasklist ${stop}`);
    } else {
      target =
        this.layout.view() === 'table'
          ? host.querySelector<HTMLElement>(`gantt-tasklist ${stop}`)
          : (host.querySelector<HTMLElement | SVGElement>(`.gantt-bars-layer ${stop}`) ??
            this.canvasEl()?.nativeElement);
    }
    if (target && !isInert(target)) target.focus({ preventScroll: true });
  }

  // ── Event handlers ────────────────────────────────────────

  /** A row clicked or activated in the task list (a rolled-up parent's row carries its raw task: events stay raw) */
  protected onTaskListRowClick(e: { row: GanttFlatRow; event: MouseEvent | KeyboardEvent }): void {
    this.selSvc.handleClick(e.row.task.id, e.event, this.layout.visibleRows(), this.cfg().selection);
    this.rowClick.emit(rawRow(e.row));
  }

  /** A row clicked in the timeline (a rolled-up parent's row carries its raw task: events stay raw) */
  protected onCanvasRowClick(row: GanttFlatRow): void {
    this.rowClick.emit(rawRow(row));
  }

  /** A row double-clicked in either pane (a rolled-up parent's row carries its raw task) */
  protected onRowDblClick(row: GanttFlatRow): void {
    this.rowDblClick.emit(rawRow(row));
  }

  protected onSortColumn(key: string): void {
    this.layout.toggleSort(key);
    this.saveState();
  }

  protected onCollapseToggle(id: string): void {
    this.layout.toggleCollapse(id);
    this.saveState();
  }

  /** A pointer drag dropped a bar (or a keyboard move): the new dates through the change pipeline */
  protected onTaskDragged(event: TaskDragEvent): void {
    this.commitDates(event, 'drag');
  }

  /** A pointer resize ended (or a keyboard resize): the new dates through the change pipeline */
  protected onTaskResized(event: TaskResizeEvent): void {
    this.commitDates(event, 'resize');
  }

  /** New dates of a task as one change of its raw task (`taskDragged` / `taskResized` come from the pipeline). */
  private commitDates(event: TaskDragEvent | TaskResizeEvent, source: GanttChangeSource): void {
    const task = this.editor.rawTask(event.taskId);
    if (task) this.editor.commit(dragChange(event, task, source));
  }

  /**
   * Writes the raw tasks: the data source's (`patch`: the edit survives the next page), else the
   * `series` model (`[(series)]`). Untouched tasks keep their objects.
   */
  private writeTasks(update: (items: readonly GanttTask[]) => GanttTask[]): void {
    const ds = untracked(this.dataSource);
    if (ds) ds.patch(update);
    else this.series.update(items => update(items));
  }

  /** Retry of the error state: the `retry` output, then (data-source failure) the data source's own retry. */
  protected onRetry(source: RetryEvent['source']): void {
    this.retry.emit({ source });
    if (source === 'dataSource') void this.dataSource()?.retry();
  }

  /**
   * The panel only scrolls horizontally: forward vertical wheel to the timeline. Ctrl/⌘ + wheel (and a
   * trackpad pinch) is a zoom: over the timeline the chart zooms, over the panel the browser keeps it.
   */
  protected onPanelWheel(e: WheelEvent): void {
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
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
      this.resizePanel(clampPanelWidth(startW + ev.clientX - startX, cfg.panel, available));
    const end = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      this.splitterDragging.set(false);
      this.saveState();
      this.reportPanelWidth();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /**
   * Keys on the splitter box (the handle and the toggle), as the Web Component's: Enter / Space
   * collapse or expand the panel, ←/→ resize it. The keys go on to the chart's keyboard directive,
   * which leaves the handle's alone (a handled key is `defaultPrevented`): a shortcut on the toggle
   * (`+`, Ctrl/⌘+A…) works as anywhere else in the chart.
   */
  protected onSplitterKey(e: KeyboardEvent): void {
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
      this.resizePanel(clampPanelWidth(this.panelPx() + step, this.cfg().panel, available));
      this.saveState();
      this.reportPanelWidth();
    }
  }

  /** The splitter set the panel width to `px` (pointer or keys). */
  private resizePanel(px: number): void {
    this.layout.panelWidthPx.set(px);
  }

  /**
   * The width the user chose, for the other charts of the sync group (none chosen yet: nothing): when
   * a splitter drag ends or a key moved it. A width the group applied is neither saved nor reported.
   */
  private reportPanelWidth(): void {
    const width = this.layout.panelWidthPx();
    if (width !== null) this.sync.reportPanel(width);
  }

  /**
   * After a render (the Web Component's scroll-commands region), for the timeline just rendered:
   * - a scroll request made before it (`fitToScreen` → `fitScrollLeft`) wins, and replaces a group
   *   scroll waiting for this render (the chart's own scroll is reported);
   * - then a scroll the sync group sent: an instant jump whose scroll event is an echo, in place of
   *   `initialScroll` when it comes first (joining a group that has a scroll) and of the anchoring;
   * - then, on the first render with data, `initialScroll`;
   * - otherwise a new timeline keeps its anchor date in place (`anchoredScrollLeft` from the
   *   viewport's real `scrollLeft`: the zoom anchor, else the centre; a new range start keeps the
   *   left edge). Inside a group, the anchoring after a level the group applied and a start
   *   correction at the chart's scroll limit stay out of the group (`GanttSync.correct`).
   * The table view hides the timeline: nothing scrolls, a group scroll waits for the timeline.
   */
  /**
   * The timeline viewport's width once the panel has the width the layout wants: on the first
   * render the measurement (`earlyRead`) may still resize the panel, which the DOM shows one render
   * later. The Web Component measures before its first paint, so it never sees the provisional one.
   */
  private settledViewportWidth(canvas: HTMLElement, view: GanttView): number {
    const panel = this.panelEl()?.nativeElement;
    const shown = view === 'split' && panel ? Number.parseFloat(panel.style.width) : NaN;
    return Number.isFinite(shown) ? Math.max(0, canvas.clientWidth - (this.panelPx() - shown)) : canvas.clientWidth;
  }

  private syncHorizontalScroll(
    tl: TimelineModel,
    hasRows: boolean,
    view: GanttView,
    pending: boolean,
    request: GanttScrollRequest | null,
  ): void {
    // A level the group applied concerns the timeline rendered now only (read and cleared on every run)
    const groupLevel = this.sync.takeLevelCorrection();
    const canvas = this.canvasEl()?.nativeElement;
    if (!canvas || view === 'table') return;
    const prev = this._paintedTimeline;
    this._paintedTimeline = tl;
    // A zoom anchor serves the one new timeline it was set for
    const anchorX = this.layout.zoomAnchorX();
    if (prev && prev !== tl) this.layout.zoomAnchorX.set(null);
    if (request === 'fit') {
      this.layout.scrollRequest.set(null);
      this.layout.initialScrollPending.set(false);
      this.sync.dropScroll();
      const left = fitScrollLeft(tl, canvas.clientWidth);
      if (left !== null) this.scrollSvc.scrollToX(left, 'instant');
    } else if (this.sync.applyScroll()) {
      this.layout.initialScrollPending.set(false);
    } else if (pending) {
      if (!hasRows) return;
      this.layout.initialScrollPending.set(false);
      const left = initialScrollLeft({
        timeline: tl,
        initialScroll: this.cfg().initialScroll,
        viewportWidth: this.settledViewportWidth(canvas, view),
        now: new Date(),
      });
      if (left !== null) this.scrollSvc.scrollToX(left, 'instant');
    } else if (prev && prev !== tl) {
      // The viewport's own offset: the scroll signal lags behind a scroll whose event is not out yet
      const left = anchoredScrollLeft(prev, tl, canvas.scrollLeft, canvas.clientWidth, anchorX);
      if (left !== null) this.sync.correct(prev, tl, left, canvas.clientWidth, groupLevel);
    }
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

  /**
   * Zoom to the finest zoom level at which every task fits the timeline viewport (the coarsest when
   * none does; core `fitZoomLevel`), then scroll to the first task, and announce the level. The
   * levels are the chart's: those of `options.zoomLevels`, or the built-in presets when it is unset.
   * Nothing happens without tasks or before the viewport is measured.
   */
  fitToScreen(): void {
    if (this.layout.fitToScreen() !== null) this.announcer.zoom(this.layout.levelLabel());
  }

  /** Switch the zoom level: a `ViewMode` or a custom `zoomLevels` name (reported through `viewModeChange`). */
  setViewMode(mode: ViewMode | (string & {})): void {
    this.layout.level.set(mode);
  }

  /**
   * Switch view: `'split'`, `'table'` (task list only) or `'chart'` (timeline only). On a narrow
   * chart (`options.responsive`) the view picked wins until the width crosses the breakpoint again.
   */
  setView(view: GanttView): void {
    // The view shown already: nothing changes, and it is no pick (as in the Web Component)
    if (view === this.layout.view()) return;
    this.layout.view.set(view);
    // A view picked while narrow wins until the width crosses back
    this.responsive.userView(view);
    this.saveState();
  }

  /**
   * Hide / show the task list (core `togglePanelView`): from `'split'` or `'table'` to the timeline
   * alone, from `'chart'` back to `'split'` at the panel's last width.
   */
  togglePanel(): void {
    this.setView(togglePanelView(this.layout.view()));
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
   * Bar geometry and paints of a task (`computeBarVisual` from @gantryjs/core, the same object the
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

  /**
   * Change a task's fields as data, silently: no change pipeline, no event (besides `seriesChange`),
   * no history. Written to the data source (`patch`), else to `series`.
   */
  updateTask(id: string, patch: Partial<GanttTask>): void {
    this.writeTasks(items => items.map(t => (t.id === id ? { ...t, ...patch } : t)));
  }

  /** Add tasks at the end, silently (as `updateTask()`). */
  appendTasks(tasks: GanttTask[]): void {
    if (tasks.length) this.writeTasks(items => [...items, ...tasks]);
  }

  // ── Editing ───────────────────────────────────────────────

  /** Undo is possible: the chart keeps history (`editing`, not controlled) and has a step to undo */
  readonly canUndo: Signal<boolean> = computed(() => this.editor.state().canUndo);
  /** Redo is possible: a step was undone and nothing was recorded since */
  readonly canRedo: Signal<boolean> = computed(() => this.editor.state().canRedo);

  /**
   * Undo the last change (as Ctrl/⌘+Z): through the change pipeline (source `'undo'`), so
   * `beforeChange` can veto it and the events fire with the inverse ops. `false` when there is
   * nothing to undo, or it was rejected or vetoed.
   */
  undo(): boolean {
    return this.editor.undo();
  }

  /** Redo the last undone change (as Ctrl/⌘+Shift+Z, Ctrl+Y); `false` when there is nothing to redo, or it was refused. */
  redo(): boolean {
    return this.editor.redo();
  }

  /** Forget every undo and redo step (`historyChange` when there were some). Task changes never clear it. */
  clearHistory(): void {
    this.editor.clear();
  }

  /**
   * Add the dependency `fromId` → `toId` (`toId` gets the link), through the change pipeline
   * (source `'api'`): validated (self link, duplicate, cycle, parent ↔ child, read-only), vetoable,
   * undoable. Works whatever `editing` is. `false` when it was refused.
   */
  addDependency(fromId: string, toId: string, type: DependencyType = DependencyType.FS, lag = 0): boolean {
    return this.editor.commit(linkChange(this.editor.rawTasks(), { fromId, toId, type, lag }, 'link', 'api'));
  }

  /**
   * Remove the dependency `fromId` → `toId` (of any type, or only `type`), through the change
   * pipeline (source `'api'`). `false` when there is no such link or the change was refused.
   */
  removeDependency(fromId: string, toId: string, type?: DependencyType): boolean {
    return this.editor.commit(linkChange(this.editor.rawTasks(), { fromId, toId, type }, 'unlink', 'api'));
  }

  /**
   * Open the editor of `columnKey`'s cell on `taskId`'s row (as F2 on that cell): needs
   * `editing.cells` and an editable cell. `false` when it can't be edited.
   */
  editCell(taskId: string, columnKey: string): boolean {
    return this.cellEdit.start(taskId, columnKey);
  }

  /**
   * Move keyboard focus to a task: its bar (`area: 'bar'`, the default) or its task-list row
   * (`'row'`). Its collapsed ancestors expand, its row is kept mounted and, after the next render,
   * focused and scrolled into view. The other area is used while the view hides the requested one.
   * Its focus ring shows even when a pointer triggered the call (a button): `focus({ focusVisible:
   * true })` where supported, and the bar's own ring. `false` for an unknown id.
   */
  focusTask(id: string, options: { area?: 'bar' | 'row' | undefined } = {}): boolean {
    const byId = new Map<string, GanttTask>();
    for (const t of this.layout.tasks()) if (!byId.has(t.id)) byId.set(t.id, t);
    if (!byId.has(id)) return false;
    // Expand the collapsed ancestors (a loop in the data ends at the first repeated id)
    const collapsed = this.layout.collapsedIds();
    const expand = new Set<string>();
    const seen = new Set<string>([id]);
    for (let p = byId.get(id)?.parentId; p !== undefined && !seen.has(p); p = byId.get(p)?.parentId) {
      seen.add(p);
      if (collapsed.has(p)) expand.add(p);
    }
    if (expand.size) {
      this.layout.collapsedIds.set(new Set([...collapsed].filter(c => !expand.has(c))));
      this.saveState();
    }
    const view = this.layout.view();
    const area = view === 'table' ? 'row' : view === 'chart' ? 'bar' : (options.area ?? 'bar');
    // Pinned in the virtual window until focus moves on; focused once mounted (`restoreFocus`), with
    // its focus ring as from the keyboard (a bar already focused by a pointer shows it now)
    this.layout.focusedRowId.set(id);
    const key = `${area}:${id}`;
    const active = this.doc.activeElement;
    const focused = !!active && this.hostEl.nativeElement.contains(active) && focusKeyOf(active) === key;
    this.barFocus.showFocus(area === 'bar' && focused ? id : null);
    this.focusRequest = key;
    this.cdr.markForCheck();
    return true;
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

  /**
   * Snapshot of the UI state (panel, view, zoom, column widths, collapsed rows, sort). While the
   * chart is narrow (`options.responsive`) the view is the wide one, not the forced one.
   */
  getState(): GanttState {
    const shown = this.layout.view();
    const view = this.responsive.persistedView(shown);
    return {
      panelWidth: this.layout.panelWidthPx() ?? (shown === 'split' ? this.panelPx() : undefined),
      panelCollapsed: view === 'chart',
      view,
      viewMode: this.layout.level(),
      columnWidths: this.colSvc.widths(),
      collapsedIds: [...this.layout.collapsedIds()],
      sort: this.layout.sort(),
    };
  }

  /** Restore a state snapshot (e.g. from your backend); invalid fields are ignored. */
  setState(snapshot: GanttState, emit = true): void {
    const state = normalizeState(snapshot);
    if (state.panelWidth != null) {
      this.layout.panelWidthPx.set(state.panelWidth);
      this.sync.reportPanel(state.panelWidth);
    }
    const view = viewFromState(state);
    if (view) this.layout.view.set(view);
    // A view restored while narrow becomes the wide view at once (not after the next render), as
    // in the Web Component: `view` and `getState()` are right as soon as this returns
    this.responsive.recheck();
    if (state.viewMode) this.layout.level.set(state.viewMode);
    if (state.columnWidths) this.colSvc.setColumnWidths(state.columnWidths);
    if (state.collapsedIds) this.layout.collapsedIds.set(new Set(state.collapsedIds));
    if (state.sort !== undefined) this.layout.sort.set(state.sort);
    if (emit) this.saveState();
  }

  /** Debounced: emit `stateChange` and persist under `options.stateKey` (a pending save is written on destroy). */
  protected saveState(): void {
    // Timers go through the document's window (none on the server: nothing to save there)
    const win = this.doc.defaultView;
    if (this._stateTimer !== undefined) win?.clearTimeout(this._stateTimer);
    this._stateTimer = win?.setTimeout(() => {
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
