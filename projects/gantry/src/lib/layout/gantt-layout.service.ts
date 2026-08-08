// ─────────────────────────────────────────────────────────────
//  gantry · layout/gantt-layout.service.ts
//
//  The layout engine — single source of truth for all geometry.
//
//  Data flow (all computed(), no imperative push):
//
//   tasks signal
//     └─ flattenTree()  ──► allRows
//           └─ filterVisible()  ──► visibleRows
//                 └─ reindexVisible()  ──► indexedRows
//                       ├─ rowGeometries  (Y coords + bar geometry)
//                       ├─ totalHeight
//                       └─ totalWidth
//
//   viewMode + containerWidth ──► pxPerDay
//   tasks + viewMode ──► timelineRange (start / end)
//
//  Nothing in this service touches the DOM.
//  No Angular animations, no RxJS, no zone.js.
// ─────────────────────────────────────────────────────────────

import {
  Injectable,
  signal,
  computed,
  Signal,
} from '@angular/core';

import {
  GanttTask,
  GanttFlatRow,
  GanttOptions,
  RowGeometry,
  ViewMode,
} from '../types';

import {
  dateToPixel,
  getTimelineRange,
  generateGridLines,
  generateHeaderRows,
  PX_PER_DAY,
  GridLine,
  TimelineRange,
  HeaderRow,
  zoomIn,
  zoomOut,
  snapToDay,
} from '../gantt-math';

import {
  flattenTree,
  filterVisible,
  reindexVisible,
} from '../gantt-data';

// ─── Constants ───────────────────────────────────────────────

const DEFAULT_ROW_HEIGHT      = 36;
const DEFAULT_HEADER_HEIGHT   = 32;
const DEFAULT_SUBHEADER_HEIGHT = 28;
const DEFAULT_PANEL_WIDTH     = 320;
const DEFAULT_TIMELINE_PAD    = 7;   // days

// ─── Service ─────────────────────────────────────────────────

@Injectable()
export class GanttLayoutService {

  // ══════════════════════════════════════════════════════════
  //  Primary writable signals  (set by GantryComponent)
  // ══════════════════════════════════════════════════════════

  /** Raw task array provided by the consumer */
  readonly tasks = signal<GanttTask[]>([]);

  /** Set of collapsed task IDs — toggled by the task list panel */
  readonly collapsedIds = signal<Set<string>>(new Set());

  /** Current view mode */
  readonly viewMode = signal<ViewMode>(ViewMode.Month);

  /** Width of the scrollable canvas area in px (measured from DOM) */
  readonly canvasWidth = signal<number>(800);

  /** Height of the scrollable canvas area in px */
  readonly canvasHeight = signal<number>(500);

  /** Width of the left task-list panel in px */
  readonly panelWidth = signal<number>(DEFAULT_PANEL_WIDTH);

  /** Whether the task-list panel is visible */
  readonly panelVisible = signal<boolean>(true);

  /** Row height in px */
  readonly rowHeight = signal<number>(DEFAULT_ROW_HEIGHT);

  /** Header row heights */
  readonly headerHeight    = signal<number>(DEFAULT_HEADER_HEIGHT);
  readonly subHeaderHeight = signal<number>(DEFAULT_SUBHEADER_HEIGHT);

  /** Extra padding days at timeline start/end */
  readonly timelinePadding = signal<number>(DEFAULT_TIMELINE_PAD);

  /** Whether baseline bars are enabled */
  readonly showBaseline = signal<boolean>(false);

  /** Whether critical path is enabled */
  readonly showCriticalPath = signal<boolean>(false);

  /** Whether the "today" marker is shown (also keeps today inside the range) */
  readonly showToday = signal<boolean>(true);

  // ══════════════════════════════════════════════════════════
  //  Derived: tree processing
  // ══════════════════════════════════════════════════════════

  /** All rows (DFS flat, including hidden) */
  readonly allRows = computed<GanttFlatRow[]>(() =>
    flattenTree(this.tasks(), this.collapsedIds())
  );

  /** Visible rows only (hidden === false) */
  readonly visibleRows = computed<GanttFlatRow[]>(() =>
    reindexVisible(filterVisible(this.allRows()))
  );

  /** Total number of visible rows */
  readonly rowCount = computed(() => this.visibleRows().length);

  // ══════════════════════════════════════════════════════════
  //  Derived: timeline range & scale
  // ══════════════════════════════════════════════════════════

  /** Computed timeline start/end — snapped to view-mode boundaries */
  readonly timelineRange = computed<TimelineRange>(() =>
    getTimelineRange(
      this.tasks(),
      this.viewMode(),
      this.timelinePadding(),
      this.showToday() ? new Date() : null,
    )
  );

  readonly startDate = computed<Date>(() => this.timelineRange().start);
  readonly endDate   = computed<Date>(() => this.timelineRange().end);

  /** Pixels per calendar day for the current view mode */
  readonly pxPerDay = computed<number>(() =>
    PX_PER_DAY[this.viewMode()]
  );

  // ══════════════════════════════════════════════════════════
  //  Derived: canvas dimensions
  // ══════════════════════════════════════════════════════════

  /** Total SVG width = distance from startDate to endDate in px */
  readonly totalWidth = computed<number>(() => {
    const start = this.startDate();
    const end   = this.endDate();
    const diff  = (end.getTime() - start.getTime()) / 86_400_000;
    return Math.ceil(diff * this.pxPerDay());
  });

  /** Total SVG height = all visible rows */
  readonly totalHeight = computed<number>(() =>
    this.rowCount() * this.rowHeight()
  );

  /** Header total height (top row + bottom row) */
  readonly totalHeaderHeight = computed<number>(() =>
    this.headerHeight() + this.subHeaderHeight()
  );

  // ══════════════════════════════════════════════════════════
  //  Derived: row geometry
  //  This is the critical computed — maps every visible row
  //  to its SVG coordinates. All bar components consume this.
  // ══════════════════════════════════════════════════════════

  readonly rowGeometries = computed<RowGeometry[]>(() => {
    const rows      = this.visibleRows();
    const start     = this.startDate();
    const pxPerDay  = this.pxPerDay();
    const rh        = this.rowHeight();
    const result: RowGeometry[] = [];

    for (const row of rows) {
      const y         = row.visibleIndex * rh;
      const taskStart = row.task.start;
      const taskEnd   = row.task.end ?? row.task.start;

      const barX = dateToPixel(taskStart, start, pxPerDay);
      const barW = Math.max(
        dateToPixel(taskEnd, start, pxPerDay) - barX,
        row.barType === 'milestone' ? 0 : 4,  // milestones: 0 width (point)
      );

      const progressWidth = Math.max((barW * (row.task.progress ?? 0)) / 100, 0);

      result.push({
        row,
        y,
        height:        rh,
        barX,
        barWidth:      barW,
        progressWidth,
      });
    }

    return result;
  });

  /** Quick lookup: taskId → RowGeometry */
  readonly geometryById = computed<Map<string, RowGeometry>>(() => {
    const map = new Map<string, RowGeometry>();
    for (const g of this.rowGeometries()) {
      map.set(g.row.task.id, g);
    }
    return map;
  });

  // ══════════════════════════════════════════════════════════
  //  Derived: grid lines & header cells
  // ══════════════════════════════════════════════════════════

  readonly gridLines = computed<GridLine[]>(() =>
    generateGridLines(
      this.viewMode(),
      this.startDate(),
      this.endDate(),
      this.pxPerDay(),
    )
  );

  readonly headerRows = computed<[HeaderRow, HeaderRow]>(() =>
    generateHeaderRows(
      this.viewMode(),
      this.startDate(),
      this.endDate(),
      this.pxPerDay(),
    )
  );

  // ══════════════════════════════════════════════════════════
  //  Derived: today marker
  // ══════════════════════════════════════════════════════════

  readonly todayX = computed<number>(() => {
    if (!this.showToday()) return -1;
    const today  = new Date();
    const start  = this.startDate();
    const px     = this.pxPerDay();
    const x      = dateToPixel(today, start, px);
    return x >= 0 && x <= this.totalWidth() ? x : -1;
  });

  // ══════════════════════════════════════════════════════════
  //  Derived: layout params (used by bar components)
  // ══════════════════════════════════════════════════════════

  readonly layoutParams = computed(() => ({
    origin:    this.startDate(),
    pxPerDay:  this.pxPerDay(),
    rowHeight: this.rowHeight(),
  }));

  // ══════════════════════════════════════════════════════════
  //  Mutations
  // ══════════════════════════════════════════════════════════

  /** Apply a full options object — merges into current signals */
  applyOptions(opts: GanttOptions): void {
    if (opts.viewMode       != null) this.viewMode.set(opts.viewMode);
    if (opts.rowHeight      != null) this.rowHeight.set(opts.rowHeight);
    if (opts.headerHeight   != null) this.headerHeight.set(opts.headerHeight);
    if (opts.subHeaderHeight != null) this.subHeaderHeight.set(opts.subHeaderHeight);
    if (opts.panelWidth     != null) this.panelWidth.set(opts.panelWidth);
    if (opts.panelVisible   != null) this.panelVisible.set(opts.panelVisible);
    if (opts.timelinePadding != null) this.timelinePadding.set(opts.timelinePadding);
    if (opts.baseline       != null) this.showBaseline.set(opts.baseline);
    if (opts.criticalPath   != null) this.showCriticalPath.set(opts.criticalPath);
    if (opts.showToday      != null) this.showToday.set(opts.showToday);
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
    const parentIds = this.allRows()
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

  /** Update a single task in-place (no full re-render of unrelated rows) */
  updateTask(taskId: string, patch: Partial<GanttTask>): void {
    this.tasks.update(tasks =>
      tasks.map(t => t.id === taskId ? { ...t, ...patch } : t)
    );
  }

  /** Replace the entire task array */
  setTasks(tasks: GanttTask[]): void {
    this.tasks.set(tasks);
  }

  /** Append tasks (lazy load) */
  appendTasks(newTasks: GanttTask[]): void {
    this.tasks.update(existing => [...existing, ...newTasks]);
  }
}
