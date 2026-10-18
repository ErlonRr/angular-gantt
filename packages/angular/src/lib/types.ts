// ─────────────────────────────────────────────────────────────
//  gantry · types.ts
//  Domain types live in @gantryjs/core (framework-free, shared with
//  the Web Component and React / Vue / Svelte bindings).
//  Only Angular-specific refinements are declared here.
//
//  The core names the library modules import through this file are
//  re-exported by name, never with `export *`: a local module that
//  star-re-exports an external one makes the bundled d.ts reach those
//  names through a namespace that does not declare them (they turn
//  into unresolved types). Need another core name? Add it below, or
//  import it from '@gantryjs/core'. The public surface is
//  `src/public-api.ts` (`export * from '@gantryjs/core'` lives there).
// ─────────────────────────────────────────────────────────────

import type { TemplateRef } from '@angular/core';
import type { ColumnDef as CoreColumnDef, ColumnCellContext } from '@gantryjs/core';

export { DEFAULT_FORMATS, DEFAULT_LABELS, DependencyType } from '@gantryjs/core';
export type {
  ColumnCellContext,
  ColumnRenderer,
  GanttAnnotation,
  GanttBarContext,
  GanttFlatRow,
  GanttFormats,
  GanttI18n,
  GanttLabels,
  GanttLayoutParams,
  GanttOptions,
  GanttPanelOptions,
  GanttState,
  GanttTask,
  GanttTheme,
  GanttThemeOverrides,
  GanttView,
  RowGeometry,
  SelectionChangeEvent,
  TaskDragEvent,
  TaskResizeEvent,
  ViewMode,
} from '@gantryjs/core';

/** Column definition whose `cellTemplate` is an Angular `<ng-template ganttColumn>`. */
export type ColumnDef = CoreColumnDef<TemplateRef<ColumnCellContext>>;
