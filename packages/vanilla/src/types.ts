/**
 * @file types.ts
 * Web Component–specific refinements of the @gantry/core types.
 */

import type {
  ColumnDef, GanttFlatRow, GanttTask, GanttOptions, GanttAnnotation, GanttState,
  TaskDragEvent, TaskResizeEvent, SelectionChangeEvent, PagedLoaderConfig, ColumnContext,
} from '@gantry/core';
import type { GanttDataSource } from './datasource/gantt-datasource';
import type { GanttBarRenderer } from './layout/gantt-canvas.component';

/** Custom cell content: a DOM node, or a string rendered as text. `ctx` carries "now" and the task index. */
export type VanillaCellTemplate = (row: GanttFlatRow, ctx: ColumnContext) => Node | string;

/** Column definition whose `cellTemplate` builds the cell's DOM content. */
export type VanillaColumnDef = ColumnDef<VanillaCellTemplate>;

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
}

export type GantryEventMap = {
  [K in keyof GantryEventDetailMap]: CustomEvent<GantryEventDetailMap[K]>;
};

/** Settable properties of `<gantry-element>` — what framework bindings forward. */
export interface GantryProperties {
  tasks?: GanttTask[];
  columns?: VanillaColumnDef[];
  options?: GanttOptions;
  annotations?: GanttAnnotation[];
  darkMode?: boolean | 'auto';
  showToolbar?: boolean;
  enableDrag?: boolean;
  enableResize?: boolean;
  tooltipEnabled?: boolean;
  showLegend?: boolean;
  dataSource?: GanttDataSourceConfig | GanttDataSource | null;
  renderBar?: GanttBarRenderer;
}

export const GANTRY_PROPERTIES = [
  'tasks', 'columns', 'options', 'annotations', 'darkMode', 'showToolbar',
  'enableDrag', 'enableResize', 'tooltipEnabled', 'showLegend', 'dataSource', 'renderBar',
] as const satisfies readonly (keyof GantryProperties)[];

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
} as const satisfies Record<keyof GantryEventDetailMap, string>;

/** Callback props (`onTaskDragged`, …) receiving each event's `detail`. */
export type GantryEventCallbacks = {
  [K in keyof GantryEventDetailMap as (typeof GANTRY_EVENTS)[K]]?: (detail: GantryEventDetailMap[K]) => void;
};
