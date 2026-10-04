/**
 * @file gantt-layout.service.ts
 * Vanilla JS layout engine — single source of truth for Gantt geometry calculations.
 */

import {
  GanttTask, GanttFlatRow, GanttOptions, RowGeometry, ViewMode,
  dateToPixel, getTimelineRange, generateGridLines, generateHeaderRows,
  PX_PER_DAY, GridLine, TimelineRange, HeaderRow, zoomIn, zoomOut,
  flattenTree, filterVisible, reindexVisible
} from '@gantry/core';
import { createState } from '../core/state';

const DEFAULT_ROW_HEIGHT = 36;
const DEFAULT_HEADER_HEIGHT = 32;
const DEFAULT_SUBHEADER_HEIGHT = 28;
const DEFAULT_PANEL_WIDTH = 320;
const DEFAULT_TIMELINE_PAD = 7;

export class GanttLayoutService {
  readonly tasks = createState<GanttTask[]>([]);
  readonly collapsedIds = createState<Set<string>>(new Set());
  readonly viewMode = createState<ViewMode>(ViewMode.Month);
  readonly canvasWidth = createState<number>(800);
  readonly canvasHeight = createState<number>(500);
  readonly panelWidth = createState<number>(DEFAULT_PANEL_WIDTH);
  readonly panelVisible = createState<boolean>(true);
  readonly rowHeight = createState<number>(DEFAULT_ROW_HEIGHT);
  readonly headerHeight = createState<number>(DEFAULT_HEADER_HEIGHT);
  readonly subHeaderHeight = createState<number>(DEFAULT_SUBHEADER_HEIGHT);
  readonly timelinePadding = createState<number>(DEFAULT_TIMELINE_PAD);
  readonly showBaseline = createState<boolean>(false);
  readonly showCriticalPath = createState<boolean>(false);
  readonly showToday = createState<boolean>(true);

  get allRows(): GanttFlatRow[] {
    return flattenTree(this.tasks(), this.collapsedIds());
  }

  get visibleRows(): GanttFlatRow[] {
    return reindexVisible(filterVisible(this.allRows));
  }

  get rowCount(): number {
    return this.visibleRows.length;
  }

  get timelineRange(): TimelineRange {
    return getTimelineRange(
      this.tasks(),
      this.viewMode(),
      this.timelinePadding(),
      this.showToday() ? new Date() : null
    );
  }

  get startDate(): Date {
    return this.timelineRange.start;
  }

  get endDate(): Date {
    return this.timelineRange.end;
  }

  get pxPerDay(): number {
    return PX_PER_DAY[this.viewMode()];
  }

  get totalWidth(): number {
    const diff = (this.endDate.getTime() - this.startDate.getTime()) / 86_400_000;
    return Math.ceil(diff * this.pxPerDay);
  }

  get totalHeight(): number {
    return this.rowCount * this.rowHeight();
  }

  get totalHeaderHeight(): number {
    return this.headerHeight() + this.subHeaderHeight();
  }

  get rowGeometries(): RowGeometry[] {
    const rows = this.visibleRows;
    const start = this.startDate;
    const pxPerDay = this.pxPerDay;
    const rh = this.rowHeight();
    const result: RowGeometry[] = [];

    for (const row of rows) {
      const y = row.visibleIndex * rh;
      const taskStart = row.task.start;
      const taskEnd = row.task.end ?? row.task.start;

      const barX = dateToPixel(taskStart, start, pxPerDay);
      const barW = Math.max(
        dateToPixel(taskEnd, start, pxPerDay) - barX,
        row.barType === 'milestone' ? 0 : 4
      );

      const progressWidth = Math.max((barW * (row.task.progress ?? 0)) / 100, 0);

      result.push({
        row,
        y,
        height: rh,
        barX,
        barWidth: barW,
        progressWidth,
      });
    }

    return result;
  }

  get geometryById(): Map<string, RowGeometry> {
    const map = new Map<string, RowGeometry>();
    for (const g of this.rowGeometries) {
      map.set(g.row.task.id, g);
    }
    return map;
  }

  get gridLines(): GridLine[] {
    return generateGridLines(this.viewMode(), this.startDate, this.endDate, this.pxPerDay);
  }

  get headerRows(): [HeaderRow, HeaderRow] {
    return generateHeaderRows(this.viewMode(), this.startDate, this.endDate, this.pxPerDay);
  }

  get todayX(): number {
    if (!this.showToday()) return -1;
    const today = new Date();
    const x = dateToPixel(today, this.startDate, this.pxPerDay);
    return x >= 0 && x <= this.totalWidth ? x : -1;
  }

  applyOptions(opts: GanttOptions): void {
    if (opts.viewMode != null) this.viewMode.set(opts.viewMode);
    if (opts.rowHeight != null) this.rowHeight.set(opts.rowHeight);
    if (opts.headerHeight != null) this.headerHeight.set(opts.headerHeight);
    if (opts.subHeaderHeight != null) this.subHeaderHeight.set(opts.subHeaderHeight);
    if (opts.panelWidth != null) this.panelWidth.set(opts.panelWidth);
    if (opts.panelVisible != null) this.panelVisible.set(opts.panelVisible);
    if (opts.timelinePadding != null) this.timelinePadding.set(opts.timelinePadding);
    if (opts.baseline != null) this.showBaseline.set(opts.baseline);
    if (opts.criticalPath != null) this.showCriticalPath.set(opts.criticalPath);
    if (opts.showToday != null) this.showToday.set(opts.showToday);
  }

  toggleCollapse(taskId: string): void {
    this.collapsedIds.update(ids => {
      const next = new Set(ids);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  collapseAll(): void {
    const parentIds = this.allRows.filter(r => r.hasChildren).map(r => r.task.id);
    this.collapsedIds.set(new Set(parentIds));
  }

  expandAll(): void {
    this.collapsedIds.set(new Set());
  }

  zoomIn(): void {
    this.viewMode.update(zoomIn);
  }

  zoomOut(): void {
    this.viewMode.update(zoomOut);
  }

  updateTask(taskId: string, patch: Partial<GanttTask>): void {
    this.tasks.update(tasks =>
      tasks.map(t => t.id === taskId ? { ...t, ...patch } : t)
    );
  }

  setTasks(tasks: GanttTask[]): void {
    this.tasks.set(tasks);
  }
}
