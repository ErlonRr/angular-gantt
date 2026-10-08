/**
 * @file gantt-layout.service.ts
 * Vanilla JS layout state. Geometry comes from the shared @gantry/core render
 * model (`buildTimeline` / `computeRowGeometries`), memoised and invalidated
 * whenever an input changes.
 */

import {
  GanttTask, GanttFlatRow, RowGeometry, GanttI18n, GanttView,
  flattenTree, filterVisible, reindexVisible, sortRoots, columnComparator, SortDirection,
  buildTimeline, computeRowGeometries, zoomStep,
  type ResolvedGanttConfig, type TimelineModel,
} from '@gantry/core';
import { createState, WritableState } from '../core/state';

export interface SortState { key: string; dir: SortDirection }

export class GanttLayoutService {
  readonly tasks = createState<GanttTask[]>([]);
  readonly collapsedIds = createState<Set<string>>(new Set());
  /** Active zoom level name (`ViewMode` or a custom level) */
  readonly viewMode = createState<string>('Month');
  readonly sort = createState<SortState | null>(null);
  readonly viewportWidth = createState<number>(0);
  readonly config = createState<ResolvedGanttConfig | null>(null);
  readonly i18n = createState<GanttI18n | undefined>(undefined);

  // ── Panel / view UI state ──────────────────────────────────
  /** Panel width in px once the user resized it (null = from `panel.width`) */
  readonly panelWidthPx = createState<number | null>(null);
  readonly panelCollapsed = createState<boolean>(false);
  readonly view = createState<GanttView>('split');

  private cache = new Map<string, unknown>();
  /** Bumped when "now" moves to a new minute, so the today marker stays fresh */
  private nowTick = createState<number>(0);

  constructor() {
    const states = [
      this.tasks, this.collapsedIds, this.sort, this.viewportWidth, this.config, this.i18n, this.nowTick,
    ] as WritableState<unknown>[];
    for (const s of states) s.subscribe(() => this.cache.clear());
  }

  private memo<T>(key: string, fn: () => T): T {
    if (!this.cache.has(key)) this.cache.set(key, fn());
    return this.cache.get(key) as T;
  }

  get cfg(): ResolvedGanttConfig {
    const c = this.config();
    if (!c) throw new Error('[gantry] layout used before configuration');
    return c;
  }

  /** Invalidate time-dependent values (today marker, current-period highlight). */
  tick(): void {
    this.nowTick.update(n => n + 1);
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

  get rowHeight(): number {
    return this.cfg.rowHeight;
  }

  get totalHeight(): number {
    return this.visibleRows.length * this.rowHeight;
  }

  get timeline(): TimelineModel {
    return this.memo('timeline', () => buildTimeline({
      tasks: this.tasks(),
      config: this.cfg,
      viewportWidth: this.viewportWidth(),
      i18n: this.i18n(),
    }));
  }

  get rowGeometries(): RowGeometry[] {
    return this.memo('geometries', () => computeRowGeometries(this.visibleRows, this.timeline, this.cfg));
  }

  get geometryById(): Map<string, RowGeometry> {
    return this.memo('geometryById', () =>
      new Map(this.rowGeometries.map(g => [g.row.task.id, g])));
  }

  /** Seed collapsed state from `task.collapsed` (only for ids not seen before). */
  private seenIds = new Set<string>();

  setTasks(tasks: GanttTask[]): void {
    const initiallyCollapsed = tasks.filter(t => t.collapsed && !this.seenIds.has(t.id)).map(t => t.id);
    for (const t of tasks) this.seenIds.add(t.id);
    if (initiallyCollapsed.length) {
      this.collapsedIds.update(ids => new Set([...ids, ...initiallyCollapsed]));
    }
    this.tasks.set(tasks);
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
    this.viewMode.update(v => zoomStep(this.cfg.zoomLevels, v, -1));
  }

  zoomOut(): void {
    this.viewMode.update(v => zoomStep(this.cfg.zoomLevels, v, 1));
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
}
