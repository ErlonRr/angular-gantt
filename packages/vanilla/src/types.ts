/**
 * @file types.ts
 * Web Component–specific refinements of the @gantryjs/core types.
 */

import type {
  CellEditorContext,
  ColumnDef,
  DependencyChangeEvent,
  GanttBeforeChangeEvent,
  GanttFlatRow,
  GanttHistoryState,
  GanttTasksChangeEvent,
  GanttTask,
  GanttOptions,
  GanttAnnotation,
  GanttResource,
  GanttState,
  TaskDragEvent,
  TaskProgressEvent,
  TaskResizeEvent,
  TaskUpdatedEvent,
  SelectionChangeEvent,
  RetryEvent,
  PagedLoaderConfig,
  ColumnContext,
  GanttBarContext,
  GanttSyncGroup,
  GanttBeforeExportEvent,
  GanttExportEvent,
} from '@gantryjs/core';
import type { GanttDataSource } from './datasource/gantt-datasource';

/** Custom cell content: a DOM node, or a string rendered as text. `ctx` carries "now" and the task index. */
export type VanillaCellTemplate = (row: GanttFlatRow, ctx: ColumnContext) => Node | string;

/**
 * Custom cell editor (`ColumnDef.editor`): returns the editor's DOM node, mounted in the cell inside
 * the shadow root (page CSS does not reach it: style it on the node). The chart focuses it (or its first focusable child) and handles Enter / Tab / Esc unless
 * the node calls `preventDefault()`; call `ctx.setValue()` as the value changes and `ctx.commit()` /
 * `ctx.cancel()` to finish.
 */
export type VanillaCellEditor = (ctx: CellEditorContext) => HTMLElement;

/** Column definition whose `cellTemplate` builds the cell's DOM content and whose `editor` builds a custom cell editor. */
export type VanillaColumnDef = ColumnDef<VanillaCellTemplate, VanillaCellEditor>;

/**
 * Custom bar renderer. Return an SVG element to replace the built-in bar, or
 * `null`/`undefined` to fall back to `renderDefault()`. `ctx.visual` holds the
 * computed geometry (position, size, label placement).
 */
export type GanttBarRenderer = (ctx: GanttBarContext, renderDefault: () => SVGElement) => SVGElement | null | undefined;

/**
 * Lazy-loading configuration — the same shape as Angular's
 * `GanttDataSourceConfig`, so paging code is portable across bindings.
 */
export type GanttDataSourceConfig<T extends GanttTask = GanttTask> = PagedLoaderConfig<T>;

/** Detail payloads of the events dispatched by `<gantry-element>`. */
export interface GantryEventDetailMap {
  'task-dragged': TaskDragEvent;
  'task-resized': TaskResizeEvent;
  'selection-change': SelectionChangeEvent;
  'row-click': GanttFlatRow;
  'row-dblclick': GanttFlatRow;
  'view-mode-change': { viewMode: string };
  /** Panel width / collapsed, view, zoom, column widths, collapsed rows or sort changed */
  'state-change': GanttState;
  /** A data-source page failed after its automatic retries (`dataSource.retry()` tries again) */
  'load-error': { error: unknown; page: number };
  /**
   * The user pressed Retry on the chart's error state: `source: 'error'` for the `errorMessage`
   * state (load again yourself), `'dataSource'` after a failed first data-source page (the element
   * also calls `dataSource.retry()`)
   */
  retry: RetryEvent;
  /**
   * A change is about to be applied (every edit: drag, resize, keyboard, progress, cell, link, API,
   * undo / redo). Cancelable: `event.preventDefault()` or `detail.preventDefault()` (synchronously)
   * vetoes it. Assigning `tasks` meanwhile counts as handled: nothing is applied (`applied: false`).
   */
  'before-change': GanttBeforeChangeEvent;
  /** After every accepted change: the tasks now, or (controlled mode, `applied: false`) the tasks to set yourself */
  'tasks-change': GanttTasksChangeEvent;
  /** One per changed task, after the op events */
  'task-updated': TaskUpdatedEvent;
  /** A task's progress changed (progress grip, ↑ / ↓ in move mode, the progress cell, undo / redo) */
  'task-progress-changed': TaskProgressEvent;
  /** A dependency was added (link drawn, predecessors cell, `addDependency()`, undo / redo) */
  'dependency-created': DependencyChangeEvent;
  /** A dependency was removed (selected link + Delete, predecessors cell, `removeDependency()`, undo / redo) */
  'dependency-deleted': DependencyChangeEvent;
  /** The undo / redo state changed (`canUndo`, `canRedo`, labels, counts) */
  'history-change': GanttHistoryState;
  /**
   * A `download()` or `print()` is about to run (the toolbar's Export menu or the API): `{ format,
   * trigger, fileName }` (`fileName` with its extension; `null` for print). Cancelable:
   * `event.preventDefault()` or `detail.preventDefault()` (synchronously) vetoes it.
   */
  'before-export': GanttBeforeExportEvent;
  /** A `download()` or `print()` ran: `{ format, trigger, fileName, size, pages }` (bytes; pages printed) */
  export: GanttExportEvent;
}

export type GantryEventMap = {
  [K in keyof GantryEventDetailMap]: CustomEvent<GantryEventDetailMap[K]>;
};

/**
 * Settable properties of `<gantry-element>` — what framework bindings forward. Assigning
 * `undefined` restores a property's default.
 */
export interface GantryProperties {
  tasks?: GanttTask[] | undefined;
  columns?: VanillaColumnDef[] | undefined;
  options?: GanttOptions | undefined;
  annotations?: GanttAnnotation[] | undefined;
  /** The people and teams tasks are assigned to (`task.resources`); shown by `options.rows: 'resources'` */
  resources?: GanttResource[] | undefined;
  darkMode?: boolean | 'auto' | undefined;
  showToolbar?: boolean | undefined;
  enableDrag?: boolean | undefined;
  enableResize?: boolean | undefined;
  tooltipEnabled?: boolean | undefined;
  showLegend?: boolean | undefined;
  dataSource?: GanttDataSourceConfig | GanttDataSource | null | undefined;
  renderBar?: GanttBarRenderer | undefined;
  loading?: boolean | undefined;
  errorMessage?: string | null | undefined;
  /** Sync group shared with other charts (core `createGanttSyncGroup()`); `null` = not synchronised */
  syncGroup?: GanttSyncGroup | null | undefined;
}

/** Settable properties of `<gantry-element>`, in order (from the property table, `engine/props.ts`). */
export { GANTRY_PROPERTIES } from './engine/props';

/** DOM event name → camelCase callback name used by the React / Vue / Svelte bindings. */
export const GANTRY_EVENTS = {
  'task-dragged': 'onTaskDragged',
  'task-resized': 'onTaskResized',
  'selection-change': 'onSelectionChange',
  'row-click': 'onRowClick',
  'row-dblclick': 'onRowDblClick',
  'view-mode-change': 'onViewModeChange',
  'state-change': 'onStateChange',
  'load-error': 'onLoadError',
  retry: 'onRetry',
  'before-change': 'onBeforeChange',
  'tasks-change': 'onTasksChange',
  'task-updated': 'onTaskUpdated',
  'task-progress-changed': 'onTaskProgressChanged',
  'dependency-created': 'onDependencyCreated',
  'dependency-deleted': 'onDependencyDeleted',
  'history-change': 'onHistoryChange',
  'before-export': 'onBeforeExport',
  export: 'onExport',
} as const satisfies Record<keyof GantryEventDetailMap, string>;

/** Callback props (`onTaskDragged`, …) receiving each event's `detail`. */
export type GantryEventCallbacks = {
  [K in keyof GantryEventDetailMap as (typeof GANTRY_EVENTS)[K]]?:
    ((detail: GantryEventDetailMap[K]) => void) | undefined;
};
