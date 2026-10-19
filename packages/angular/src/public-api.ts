// ─────────────────────────────────────────────────────────────
//  @gantryjs/angular · public-api.ts
//
//  The published surface, reviewed in `packages/angular/etc/gantryjs-angular.api.md`
//  (`pnpm api:angular` after a deliberate change; CI fails on drift).
//  Only explicit named exports of local modules: a local `export *` makes
//  the bundled d.ts declare namespaces (and lose names) instead of exports.
// ─────────────────────────────────────────────────────────────

// Everything framework-free: types, the render model, helpers, themes (same as every other binding)
export * from '@gantryjs/core';

// Angular-specific
export type { ColumnDef, CellEditorTemplateContext } from './lib/types';
export { provideGantt, withBars, type GanttGlobalConfig, type GanttFeature } from './lib/provide';
export { provideGanttBar, type GanttBarDef } from './lib/bar-registry';
export { GantryComponent } from './lib/gantt-component/gantry.component';
export { GanttColumnDefDirective } from './lib/columns/gantt-column.directive';
export { GanttCellEditorDirective } from './lib/columns/gantt-cell-editor.directive';
export {
  GanttTooltipTemplateDirective,
  type GanttTooltipTemplateContext,
} from './lib/tooltip/gantt-tooltip-template.directive';
export { GanttBarBase } from './lib/bars/bar-base';
export { GanttTaskBarComponent } from './lib/bars/task-bar.component';
export { GanttMilestoneComponent } from './lib/bars/milestone.component';
export { GanttGroupBarComponent } from './lib/bars/group-bar.component';
export { GanttDataSource, createGanttDataSource, type GanttDataSourceConfig } from './lib/datasource/gantt-datasource';
export type { GanttDownloadOptions } from './lib/export/gantt-export.service';

// Private (ɵ): not part of the API. The Angular compiler needs every class in a public component's
// metadata to be reachable from the entry point (NG3001): GantryComponent's `hostDirectives`.
export { GanttKeyboardDirective as ɵGanttKeyboardDirective } from './lib/selection/gantt-keyboard.directive';
