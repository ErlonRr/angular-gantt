/**
 * @file gantry.element.ts
 * Root Web Component (<gantry-element>) orchestrating all Vanilla JS services and subcomponents.
 */

import { GanttTask, GanttOptions, GanttAnnotation, ColumnDef, ViewMode } from '@gantry/core';
import { GanttThemeService } from './services/gantt-theme.service';
import { GanttI18nService } from './services/gantt-i18n.service';
import { GanttColumnService } from './columns/gantt-column.service';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttScrollService } from './scroll/gantt-scroll.service';
import { GanttSelectionService } from './selection/gantt-selection.service';
import { GanttDragService } from './drag/gantt-drag.service';
import { GanttHeaderComponent } from './header/gantt-header.component';
import { GanttTaskListComponent } from './tasklist/gantt-tasklist.component';
import { GanttCanvasComponent } from './layout/gantt-canvas.component';
import { GanttToolbarComponent } from './annotations/gantt-toolbar.component';
import { computeVirtualWindow } from './virtual-scroll/virtual-window';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      font-family: var(--gantt-font, system-ui, -apple-system, sans-serif);
      font-size: var(--gantt-font-size, 13px);
      color: var(--gantt-text, #F1F5F9);
      background-color: var(--gantt-bg, #0F172A);
      
      --gantt-bg: #0F172A;
      --gantt-header-bg: #1E293B;
      --gantt-row-bg: #0F172A;
      --gantt-row-bg-alt: #111827;
      --gantt-bar: #3B82F6;
      --gantt-bar-text: #FFFFFF;
      --gantt-bar-radius: 4px;
      --gantt-milestone: #A78BFA;
      --gantt-baseline: #334155;
      --gantt-critical: #F87171;
      --gantt-panel-bg: #0F172A;
      --gantt-panel-border: #1E293B;
      --gantt-border: #1E293B;
      --gantt-grid-line: #1A2744;
      --gantt-today: #FBBF24;
      --gantt-text: #F1F5F9;
      --gantt-text-sec: #94A3B8;
      --gantt-text-muted: #475569;
      --gantt-arrow: #60A5FA;
      --gantt-tooltip-bg: #1E293B;
      --gantt-tooltip-bdr: #334155;
      --gantt-tooltip-txt: #F1F5F9;
      --gantt-sel-bg: #1D3461;
      --gantt-sel-border: #60A5FA;
      --gantt-scrollbar-track: #1E293B;
      --gantt-scrollbar-thumb: #334155;
    }

    :host([data-theme="light"]) {
      --gantt-bg: #FFFFFF;
      --gantt-header-bg: #F8FAFC;
      --gantt-row-bg: #FFFFFF;
      --gantt-row-bg-alt: #F8FAFC;
      --gantt-bar: #3B82F6;
      --gantt-bar-text: #FFFFFF;
      --gantt-bar-radius: 4px;
      --gantt-milestone: #8B5CF6;
      --gantt-baseline: #94A3B8;
      --gantt-critical: #EF4444;
      --gantt-panel-bg: #FFFFFF;
      --gantt-panel-border: #E2E8F0;
      --gantt-border: #E2E8F0;
      --gantt-grid-line: #F1F5F9;
      --gantt-today: #F59E0B;
      --gantt-text: #1E293B;
      --gantt-text-sec: #475569;
      --gantt-text-muted: #94A3B8;
      --gantt-arrow: #3B82F6;
      --gantt-tooltip-bg: #FFFFFF;
      --gantt-tooltip-bdr: #E2E8F0;
      --gantt-tooltip-txt: #1E293B;
      --gantt-sel-bg: #EFF6FF;
      --gantt-sel-border: #3B82F6;
      --gantt-scrollbar-track: #F1F5F9;
      --gantt-scrollbar-thumb: #CBD5E1;
    }

    .gantry-wrapper {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      background: var(--gantt-bg);
      overflow: hidden;
    }

    .gantry-main {
      display: flex;
      flex: 1;
      overflow: hidden;
      min-height: 0;
    }

    .gantry-panel {
      flex-shrink: 0;
      overflow-y: auto;
      overflow-x: hidden;
      background: var(--gantt-panel-bg);
      border-right: 1px solid var(--gantt-panel-border);
    }

    .gantry-canvas-viewport {
      flex: 1;
      overflow: auto;
      position: relative;
    }

    .gantry-canvas-header-sticky {
      position: sticky;
      top: 0;
      z-index: 10;
      background: var(--gantt-header-bg);
    }
  </style>
  <div class="gantry-wrapper">
    <div class="gantry-toolbar-container"></div>
    <div class="gantry-main">
      <div class="gantry-panel">
        <div class="gantry-tasklist-container"></div>
      </div>
      <div class="gantry-canvas-viewport">
        <div class="gantry-canvas-header-sticky">
          <div class="gantry-header-container"></div>
        </div>
        <div class="gantry-canvas-container"></div>
      </div>
    </div>
  </div>
`;

export class GantryElement extends HTMLElement {
  private shadow: ShadowRoot;

  readonly themeSvc = new GanttThemeService();
  readonly i18nSvc = new GanttI18nService();
  readonly colSvc = new GanttColumnService(this.i18nSvc);
  readonly layout = new GanttLayoutService();
  readonly scrollSvc = new GanttScrollService();
  readonly selSvc = new GanttSelectionService();
  readonly dragSvc = new GanttDragService();

  private toolbarContainerEl!: HTMLElement;
  private panelEl!: HTMLElement;
  private tasklistContainerEl!: HTMLElement;
  private canvasViewportEl!: HTMLElement;
  private headerContainerEl!: HTMLElement;
  private canvasContainerEl!: HTMLElement;

  private headerComp?: GanttHeaderComponent;
  private tasklistComp?: GanttTaskListComponent;
  private canvasComp?: GanttCanvasComponent;
  private toolbarComp?: GanttToolbarComponent;

  private renderPending = false;
  private _showToolbar = true;
  private _annotations: GanttAnnotation[] = [];

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
    this.shadow.appendChild(template.content.cloneNode(true));

    this.toolbarContainerEl = this.shadow.querySelector('.gantry-toolbar-container')!;
    this.panelEl = this.shadow.querySelector('.gantry-panel')!;
    this.tasklistContainerEl = this.shadow.querySelector('.gantry-tasklist-container')!;
    this.canvasViewportEl = this.shadow.querySelector('.gantry-canvas-viewport')!;
    this.headerContainerEl = this.shadow.querySelector('.gantry-header-container')!;
    this.canvasContainerEl = this.shadow.querySelector('.gantry-canvas-container')!;

    this.themeSvc.init(this);

    this.scrollSvc.bindViewports(
      this.panelEl,
      this.canvasViewportEl,
      this.canvasViewportEl
    );

    this.dragSvc.onTaskDragged = (e) => {
      this.layout.updateTask(e.taskId, { start: e.newStart, end: e.newEnd });
      this.dispatchEvent(new CustomEvent('taskUpdated', { detail: e, bubbles: true, composed: true }));
      this.scheduleRender();
    };

    this.dragSvc.onTaskResized = (e) => {
      this.layout.updateTask(e.taskId, { start: e.newStart, end: e.newEnd });
      this.dispatchEvent(new CustomEvent('taskUpdated', { detail: e, bubbles: true, composed: true }));
      this.scheduleRender();
    };
  }

  get tasks(): GanttTask[] {
    return this.layout.tasks();
  }
  set tasks(val: GanttTask[]) {
    this.layout.setTasks(val);
    this.scheduleRender();
  }

  get columns(): ColumnDef[] {
    return this.colSvc.columns;
  }
  set columns(val: ColumnDef[]) {
    this.colSvc.setColumns(val);
    this.scheduleRender();
  }

  get options(): GanttOptions {
    return { viewMode: this.layout.viewMode() };
  }
  set options(val: GanttOptions) {
    if (val.viewMode) this.layout.viewMode.set(val.viewMode);
    this.scheduleRender();
  }

  get annotations(): GanttAnnotation[] {
    return this._annotations;
  }
  set annotations(val: GanttAnnotation[]) {
    this._annotations = val;
    this.scheduleRender();
  }

  get darkMode(): boolean | 'auto' {
    return this.themeSvc.isDark;
  }
  set darkMode(val: boolean | 'auto') {
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

  private scheduleRender(): void {
    if (this.renderPending) return;
    this.renderPending = true;
    requestAnimationFrame(() => {
      try {
        this.render();
      } catch (err) {
        console.error('[GantryElement] render error:', err);
      }
      this.renderPending = false;
    });
  }

  private render(): void {
    const theme = this.themeSvc.resolvedTheme;
    const viewMode = this.layout.viewMode();
    const startDate = this.layout.startDate;
    const endDate = this.layout.endDate;
    const pxPerDay = this.layout.pxPerDay;
    const totalWidth = this.layout.totalWidth;
    const totalHeight = this.layout.totalHeight;
    const visibleGeometries = this.layout.rowGeometries;
    const allGeometries = this.layout.rowGeometries;
    const gridLines = this.layout.gridLines;
    const todayX = this.layout.todayX;

    this.panelEl.style.width = `${this.layout.panelWidth()}px`;

    // 1. Toolbar
    if (this._showToolbar) {
      if (!this.toolbarComp) {
        this.toolbarComp = new GanttToolbarComponent(this.toolbarContainerEl, {
          theme,
          currentView: viewMode,
          i18n: this.i18nSvc
        });
        this.toolbarComp.zoomIn$.subscribe(() => {
          this.layout.zoomIn();
          this.scheduleRender();
        });
        this.toolbarComp.zoomOut$.subscribe(() => {
          this.layout.zoomOut();
          this.scheduleRender();
        });
        this.toolbarComp.viewModeChange$.subscribe(vm => {
          this.layout.viewMode.set(vm);
          this.scheduleRender();
        });
      } else {
        this.toolbarComp.updateProps({ theme, currentView: viewMode });
      }
    } else {
      this.toolbarContainerEl.innerHTML = '';
      this.toolbarComp = undefined;
    }

    // 2. Header
    if (!this.headerComp) {
      this.headerComp = new GanttHeaderComponent(this.headerContainerEl, {
        viewMode,
        startDate,
        endDate,
        pxPerDay,
        totalWidth,
        theme,
        i18nService: this.i18nSvc
      });
    } else {
      this.headerComp.updateProps({ viewMode, startDate, endDate, pxPerDay, totalWidth, theme });
    }

    // 3. TaskList
    const scrollTop = this.panelEl.scrollTop || 0;
    const viewportHeight = this.panelEl.clientHeight || 500;
    const vw = computeVirtualWindow(scrollTop, this.layout.rowHeight(), viewportHeight, this.layout.visibleRows.length);

    const vsVisibleRows = this.layout.visibleRows.slice(vw.first, vw.last + 1);

    if (!this.tasklistComp) {
      this.tasklistComp = new GanttTaskListComponent(this.tasklistContainerEl, {
        visibleRows: vsVisibleRows,
        columns: this.colSvc.columns,
        rowHeight: this.layout.rowHeight(),
        selectedIds: this.selSvc.selectedIds,
        theme,
        colHeaderHeight: this.layout.totalHeaderHeight,
        indentSize: 16,
        paddingTop: vw.paddingTop,
        paddingBottom: vw.paddingBottom
      });
      this.tasklistComp.collapseToggle$.subscribe(id => {
        this.layout.toggleCollapse(id);
        this.scheduleRender();
      });
      this.tasklistComp.rowClick$.subscribe(({ row, event }) => {
        this.selSvc.handleClick(row.task.id, event, this.layout.visibleRows);
        this.scheduleRender();
      });
    } else {
      this.tasklistComp.updateProps({
        visibleRows: vsVisibleRows,
        columns: this.colSvc.columns,
        rowHeight: this.layout.rowHeight(),
        selectedIds: this.selSvc.selectedIds,
        theme,
        colHeaderHeight: this.layout.totalHeaderHeight,
        paddingTop: vw.paddingTop,
        paddingBottom: vw.paddingBottom
      });
    }

    // 4. Canvas
    if (!this.canvasComp) {
      this.canvasComp = new GanttCanvasComponent(this.canvasContainerEl, {
        visibleGeometries,
        allGeometries,
        totalWidth,
        totalHeight,
        gridLines,
        theme,
        todayX,
        annotations: this._annotations,
        criticalIds: new Set(),
        selectedIds: this.selSvc.selectedIds,
        layoutParams: { origin: startDate, pxPerDay, rowHeight: this.layout.rowHeight() },
        showBaseline: this.layout.showBaseline()
      });
    } else {
      this.canvasComp.updateProps({
        visibleGeometries,
        allGeometries,
        totalWidth,
        totalHeight,
        gridLines,
        theme,
        todayX,
        annotations: this._annotations,
        selectedIds: this.selSvc.selectedIds,
        layoutParams: { origin: startDate, pxPerDay, rowHeight: this.layout.rowHeight() },
        showBaseline: this.layout.showBaseline()
      });
    }
  }
}

if (!customElements.get('gantry-element')) {
  customElements.define('gantry-element', GantryElement);
}
