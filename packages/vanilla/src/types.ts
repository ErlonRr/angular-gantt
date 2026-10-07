/**
 * @file types.ts
 * Web Component–specific refinements of the @gantry/core types.
 */

import type {
  ColumnDef, GanttFlatRow, GanttTask, GanttOptions, GanttAnnotation, ViewMode,
  TaskDragEvent, TaskResizeEvent, SelectionChangeEvent,
} from '@gantry/core';
import type { GanttDataSource } from './datasource/gantt-datasource';
import type { GanttBarRenderer } from './layout/gantt-canvas.component';

/** Custom cell content: a DOM node, or a string rendered as text. */
export type VanillaCellTemplate = (row: GanttFlatRow) => Node | string;

/** Column definition whose `cellTemplate` builds the cell's DOM content. */
export type VanillaColumnDef = ColumnDef<VanillaCellTemplate>;

/**
 * Lazy-loading configuration — the same shape as Angular's
 * `GanttDataSourceConfig`, so paging code is portable across bindings.
 */
export interface GanttDataSourceConfig<T extends GanttTask = GanttTask> {
  /** Async fetcher for page `page` (1-based). Fewer than `pageSize` items = last page. */
  fetcher: (page: number, pageSize: number) => Promise<T[]>;
  /** Items per page (default: 30) */
  pageSize?: number;
}

/** Detail payloads of the events dispatched by `<gantry-element>`. */
export interface GantryEventDetailMap {
  'task-dragged': TaskDragEvent;
  'task-resized': TaskResizeEvent;
  'selection-change': SelectionChangeEvent;
  'row-click': GanttFlatRow;
  'row-dblclick': GanttFlatRow;
  'view-mode-change': { viewMode: ViewMode };
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
} as const satisfies Record<keyof GantryEventDetailMap, string>;

/** Callback props (`onTaskDragged`, …) receiving each event's `detail`. */
export type GantryEventCallbacks = {
  [K in keyof GantryEventDetailMap as (typeof GANTRY_EVENTS)[K]]?: (detail: GantryEventDetailMap[K]) => void;
};
