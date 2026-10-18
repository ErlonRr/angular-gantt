/**
 * @file index.ts
 * Public API of `@gantryjs/vanilla`. Importing it defines `<gantry-element>` (a side effect).
 *
 * Only the element, its data source and the types and tables framework bindings build on are
 * exported; the engine (`engine/`, `layers/`, `interaction/`, `dom/`, `reactive/`, `styles/`) is
 * private. Everything in `@gantryjs/core` is re-exported, so one import covers the model types,
 * themes, labels and helpers.
 */

export { GantryElement } from './gantry.element';
export { GanttDataSource } from './datasource/gantt-datasource';
export { GANTRY_PROPERTIES, GANTRY_EVENTS } from './types';
export type {
  VanillaCellTemplate,
  VanillaColumnDef,
  GanttDataSourceConfig,
  GantryEventDetailMap,
  GantryEventMap,
  GantryProperties,
  GantryEventCallbacks,
  GanttBarRenderer,
} from './types';
export * from '@gantryjs/core';
