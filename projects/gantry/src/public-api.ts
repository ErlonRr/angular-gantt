// ─────────────────────────────────────────────────────────────
//  gantry · public-api.ts   (final)
// ─────────────────────────────────────────────────────────────

export * from './lib/types';

export {
  dateToPixel, pixelToDate, snapToDay, addDays, diffDays,
  getTimelineRange, generateHeaderRows, generateGridLines,
  zoomIn, zoomOut, clamp, formatDate, durationLabel, PX_PER_DAY,
} from './lib/gantt-math';
export type { TimelineRange, GridLine, HeaderRow, HeaderCell } from './lib/gantt-math';

export {
  flattenTree, filterVisible, reindexVisible,
  sortRoots, findRowById, collectDescendants,
  DEFAULT_COLUMNS, SORT_BY_START, SORT_BY_NAME, SORT_BY_PROGRESS,
} from './lib/gantt-data';
export type { SortComparator } from './lib/gantt-data';

export { computeCriticalPath, longestChain } from './lib/gantt-cpm';
export type { CPMResult } from './lib/gantt-cpm';

export { GanttBarBase, GanttBarRegistry, GANTT_BAR_DEF, provideGanttBar } from './lib/bar-registry';
export type { GanttBarDef } from './lib/bar-registry';

export { GanttTaskBarComponent } from './lib/bars/task-bar.component';
export { GanttMilestoneComponent } from './lib/bars/milestone.component';
export { GanttGroupBarComponent } from './lib/bars/group-bar.component';

export { GanttArrowComponent } from './lib/arrows/gantt-arrow.component';
export { GanttHeaderComponent } from './lib/header/gantt-header.component';
export { GanttTaskListComponent } from './lib/tasklist/gantt-tasklist.component';
export { GanttCanvasComponent } from './lib/layout/gantt-canvas.component';

export { GanttColumnService } from './lib/columns/gantt-column.service';
export { GanttColumnDefDirective } from './lib/columns/gantt-column.directive';
export type { ColumnCellContext } from './lib/columns/gantt-column.directive';

export {
  GanttThemeService, LightTheme, DarkTheme,
  GANTT_GLOBAL_CONFIG, provideGantt,
} from './lib/services/gantt-theme.service';
export type { GanttGlobalConfig } from './lib/services/gantt-theme.service';

export { GanttI18nService } from './lib/services/gantt-i18n.service';

export { GanttLayoutService } from './lib/layout/gantt-layout.service';
export { GanttScrollService } from './lib/scroll/gantt-scroll.service';
export { GanttVirtualScrollDirective } from './lib/virtual-scroll/gantt-virtual-scroll.directive';
export { GanttDragService } from './lib/drag/gantt-drag.service';
export { GanttDragPreviewComponent } from './lib/drag/gantt-drag-preview.component';
export type { DragState, DragPreview } from './lib/drag/gantt-drag.service';
export { GanttSelectionService } from './lib/selection/gantt-selection.service';
export { GanttKeyboardDirective } from './lib/selection/gantt-keyboard.directive';
export { GanttTooltipDirective } from './lib/tooltip/gantt-tooltip.directive';

export { GanttDataSource, createGanttDataSource } from './lib/datasource/gantt-datasource';
export type { GanttDataSourceConfig } from './lib/datasource/gantt-datasource';
export { GanttLoadMoreComponent } from './lib/datasource/gantt-load-more.component';
export { GanttAnnotationComponent } from './lib/annotations/gantt-annotation.component';
export { GanttToolbarComponent } from './lib/annotations/gantt-toolbar.component';

export { GantryComponent } from './lib/gantt-component/gantry.component';
export { GanttModule, provideGanttLib, BUILT_IN_BAR_DEFS } from './lib/module/gantt.module';
