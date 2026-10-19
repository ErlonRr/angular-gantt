/**
 * @file types.ts
 * Web Component–specific refinements of the @gantryjs/core types.
 */

import type {
  ColumnDef,
  GanttFlatRow,
  GanttTask,
  GanttOptions,
  GanttAnnotation,
  GanttState,
  TaskDragEvent,
  TaskResizeEvent,
  SelectionChangeEvent,
  RetryEvent,
  PagedLoaderConfig,
  ColumnContext,
  GanttBarContext,
  GanttSyncGroup,
} from '@gantryjs/core';
import type { GanttDataSource } from './datasource/gantt-datasource';

/** Custom cell content: a DOM node, or a string rendered as text. `ctx` carries "now" and the task index. */
export type VanillaCellTemplate = (row: GanttFlatRow, ctx: ColumnContext) => Node | string;

/** Column definition whose `cellTemplate` builds the cell's DOM content. */
export type VanillaColumnDef = ColumnDef<VanillaCellTemplate>;

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
} as const satisfies Record<keyof GantryEventDetailMap, string>;

/** Callback props (`onTaskDragged`, …) receiving each event's `detail`. */
export type GantryEventCallbacks = {
  [K in keyof GantryEventDetailMap as (typeof GANTRY_EVENTS)[K]]?:
    ((detail: GantryEventDetailMap[K]) => void) | undefined;
};
