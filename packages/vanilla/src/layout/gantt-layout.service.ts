/**
 * @file gantt-layout.service.ts
 * Vanilla JS layout state. Geometry comes from the shared @gantry/core render
 * model (`buildTimeline` / `computeRowGeometries`), memoised and invalidated
 * whenever an input changes.
 */

import {
  GanttTask, GanttFlatRow, RowGeometry, GanttI18n, GanttView,
  flattenTree, filterVisible, reindexVisible, sortTree, columnComparator, SortDirection, normalizeTasks,
  buildColumnContext, findColumn, type ColumnContext, type ColumnDef,
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

  /** Column catalogue and built-ins (mirrored from the column service) — to sort by a column */
  readonly columns = createState<readonly ColumnDef[]>([]);
  readonly builtins = createState<readonly ColumnDef[]>([]);

  private cache = new Map<string, unknown>();
  /** The instant the chart renders at; `tick()` moves it every minute (today marker, statuses) */
  readonly now = createState<Date>(new Date());

  constructor() {
    const states = [
      this.tasks, this.collapsedIds, this.sort, this.viewportWidth, this.config, this.i18n, this.now,
    ] as WritableState<unknown>[];
    for (const s of states) s.subscribe(() => this.cache.clear());
    // Column edits (e.g. every pointermove of a column resize) only matter to a sorted row order
    for (const s of [this.columns, this.builtins] as WritableState<unknown>[]) {
      s.subscribe(() => {
        if (!this.sort()) return;
        for (const k of ['allRows', 'visibleRows', 'geometries', 'geometryById']) this.cache.delete(k);
      });
    }
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

  /** Move "now" (today marker, current-period highlight, task statuses). */
  tick(now: Date = new Date()): void {
    this.now.set(now);
  }

  /** Values time- and data-dependent cells read (status, predecessors, sort order). */
  get columnContext(): ColumnContext {
    return this.memo('columnContext', () => buildColumnContext({
      tasks: this.tasks(),
      config: this.config(),
      now: this.now(),
      locale: this.i18n()?.locale,
    }));
  }

  get allRows(): GanttFlatRow[] {
    return this.memo('allRows', () => {
      const rows = flattenTree(this.tasks(), this.collapsedIds());
      const sort = this.sort();
      if (!sort) return rows;
      const column = findColumn(this.columns(), this.builtins(), sort.key);
      // Siblings sort at every level, each subtree stays under its parent
      return sortTree(rows, columnComparator(sort.key, sort.dir, { column, ctx: this.columnContext }));
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
      now: this.now(),
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

  setTasks(input: GanttTask[]): void {
    const tasks = normalizeTasks(input);
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
    if (tasks.length) this.tasks.update(cur => normalizeTasks([...cur, ...tasks]));
  }
}
