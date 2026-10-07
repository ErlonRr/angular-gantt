/**
 * @file gantt-layout.service.ts
 * Vanilla JS layout engine — single source of truth for Gantt geometry calculations.
 *
 * Derived values (rows, geometries, timeline range…) are memoised and
 * invalidated whenever any input state changes, so a render pass can read
 * them as often as it likes without re-flattening the tree.
 */

import {
  GanttTask, GanttFlatRow, GanttOptions, RowGeometry, ViewMode,
  dateToPixel, getTimelineRange, generateGridLines, generateHeaderRows,
  PX_PER_DAY, GridLine, TimelineRange, HeaderRow, zoomIn, zoomOut,
  flattenTree, filterVisible, reindexVisible, sortRoots, columnComparator, SortDirection,
} from '@gantry/core';
import { createState, WritableState } from '../core/state';

const DEFAULT_ROW_HEIGHT = 36;
const DEFAULT_HEADER_HEIGHT = 32;
const DEFAULT_SUBHEADER_HEIGHT = 28;
const DEFAULT_PANEL_WIDTH = 320;
const DEFAULT_TIMELINE_PAD = 7;

export interface SortState { key: string; dir: SortDirection }

export class GanttLayoutService {
  readonly tasks = createState<GanttTask[]>([]);
  readonly collapsedIds = createState<Set<string>>(new Set());
  readonly viewMode = createState<ViewMode>(ViewMode.Month);
  readonly panelWidth = createState<number>(DEFAULT_PANEL_WIDTH);
  readonly panelVisible = createState<boolean>(true);
  readonly rowHeight = createState<number>(DEFAULT_ROW_HEIGHT);
  readonly headerHeight = createState<number>(DEFAULT_HEADER_HEIGHT);
  readonly subHeaderHeight = createState<number>(DEFAULT_SUBHEADER_HEIGHT);
  readonly timelinePadding = createState<number>(DEFAULT_TIMELINE_PAD);
  readonly showBaseline = createState<boolean>(false);
  readonly showCriticalPath = createState<boolean>(false);
  readonly showToday = createState<boolean>(true);
  readonly sort = createState<SortState | null>(null);

  private cache = new Map<string, unknown>();

  constructor() {
    const states: WritableState<unknown>[] = [
      this.tasks, this.collapsedIds, this.viewMode, this.rowHeight,
      this.timelinePadding, this.showToday, this.sort,
    ] as WritableState<unknown>[];
    for (const s of states) s.subscribe(() => this.cache.clear());
  }

  private memo<T>(key: string, fn: () => T): T {
    if (!this.cache.has(key)) this.cache.set(key, fn());
    return this.cache.get(key) as T;
  }

  get allRows(): GanttFlatRow[] {
    return this.memo('allRows', () => {
      const rows = flattenTree(this.tasks(), this.collapsedIds());
      const sort = this.sort();
      return sort ? sortRoots(rows, columnComparator(sort.key, sort.dir)) : rows;
    });
  }

  get visibleRows(): GanttFlatRow[] {
    return this.memo('visibleRows', () => reindexVisible(filterVisible(this.allRows)));
  }

  get rowCount(): number {
    return this.visibleRows.length;
  }

  get timelineRange(): TimelineRange {
    return this.memo('range', () => getTimelineRange(
      this.tasks(),
      this.viewMode(),
      this.timelinePadding(),
      this.showToday() ? new Date() : null,
    ));
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
    return this.memo('geometries', () => {
      const start = this.startDate;
      const pxPerDay = this.pxPerDay;
      const rh = this.rowHeight();

      return this.visibleRows.map(row => {
        const taskEnd = row.task.end ?? row.task.start;
        const barX = dateToPixel(row.task.start, start, pxPerDay);
        const barWidth = Math.max(
          dateToPixel(taskEnd, start, pxPerDay) - barX,
          row.barType === 'milestone' ? 0 : 4,
        );
        const progressWidth = Math.max((barWidth * (row.task.progress ?? 0)) / 100, 0);
        return { row, y: row.visibleIndex * rh, height: rh, barX, barWidth, progressWidth };
      });
    });
  }

  get geometryById(): Map<string, RowGeometry> {
    return this.memo('geometryById', () =>
      new Map(this.rowGeometries.map(g => [g.row.task.id, g])));
  }

  get gridLines(): GridLine[] {
    return this.memo('gridLines', () =>
      generateGridLines(this.viewMode(), this.startDate, this.endDate, this.pxPerDay));
  }

  get headerRows(): [HeaderRow, HeaderRow] {
    return generateHeaderRows(this.viewMode(), this.startDate, this.endDate, this.pxPerDay);
  }

  get todayX(): number {
    if (!this.showToday()) return -1;
    const x = dateToPixel(new Date(), this.startDate, this.pxPerDay);
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
    const parentIds = flattenTree(this.tasks(), new Set())
      .filter(r => r.hasChildren)
      .map(r => r.task.id);
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

  /** Cycle a column's sort: ascending → descending → original order. */
  toggleSort(key: string): void {
    this.sort.update(cur => {
      if (cur?.key !== key) return { key, dir: 'asc' };
      return cur.dir === 'asc' ? { key, dir: 'desc' } : null;
    });
  }

  updateTask(taskId: string, patch: Partial<GanttTask>): void {
    this.tasks.update(tasks =>
      tasks.map(t => t.id === taskId ? { ...t, ...patch } : t)
    );
  }

  appendTasks(tasks: GanttTask[]): void {
    if (tasks.length) this.tasks.update(cur => [...cur, ...tasks]);
  }

  setTasks(tasks: GanttTask[]): void {
    this.tasks.set(tasks);
  }
}
