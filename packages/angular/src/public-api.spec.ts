// The published surface (Gantry 2 phase 7, step 5.1): `export * from '@gantryjs/core'` plus the
// curated Angular names. The type side is reviewed in `packages/angular/etc/gantryjs-angular.api.md`.
import { describe, it, expect, expectTypeOf } from 'vitest';
import type { Provider, TemplateRef } from '@angular/core';
import * as core from '@gantryjs/core';
import * as api from './public-api';

/** The runtime (value) exports @gantryjs/angular adds to @gantryjs/core. */
const ANGULAR_VALUES = [
  'GantryComponent',
  'GanttBarBase',
  'GanttColumnDefDirective',
  'GanttDataSource',
  'GanttGroupBarComponent',
  'GanttMilestoneComponent',
  'GanttTaskBarComponent',
  'GanttTooltipTemplateDirective',
  'createGanttDataSource',
  'provideGantt',
  'provideGanttBar',
  'withBars',
];

/**
 * Private (ɵ) exports: not API. Only what the Angular compiler needs reachable from the entry point
 * (NG3001: classes in a public component's metadata, here GantryComponent's `hostDirectives`).
 */
const PRIVATE_VALUES = ['ɵGanttKeyboardDirective'];

/** 1.x exports that are internal or deleted in 2.0 (listed in the ngx-gantry changeset). */
const REMOVED = [
  'GanttModule',
  'provideGanttLib',
  'BUILT_IN_BAR_DEFS',
  'GanttBarRegistry',
  'GANTT_BAR_DEF',
  'GANTT_GLOBAL_CONFIG',
  'GanttArrowComponent',
  'GanttHeaderComponent',
  'GanttTaskListComponent',
  'GanttCanvasComponent',
  'GanttColumnService',
  'GanttThemeService',
  'GanttI18nService',
  'GanttLayoutService',
  'GanttScrollService',
  'GanttDragService',
  'GanttDragPreviewComponent',
  'GanttSelectionService',
  'GanttKeyboardDirective',
  'GanttTooltipDirective',
  'GanttLoadMoreComponent',
  'GanttToolbarComponent',
  'GanttVirtualScrollDirective',
  'GanttAnnotationComponent',
];

const exported = api as Record<string, unknown>;

describe('@gantryjs/angular public API', () => {
  it('adds exactly the curated Angular values (and the ɵ ones the compiler needs) to @gantryjs/core', () => {
    const own = Object.keys(api).filter(name => !(name in core));
    expect(own.filter(name => !name.startsWith('ɵ')).sort()).toEqual([...ANGULAR_VALUES].sort());
    expect(own.filter(name => name.startsWith('ɵ')).sort()).toEqual([...PRIVATE_VALUES].sort());
  });

  it('re-exports every @gantryjs/core value as the same object', () => {
    const names = Object.keys(core);
    expect(names.length).toBeGreaterThan(100);
    for (const name of names) expect(exported[name], name).toBe((core as Record<string, unknown>)[name]);
  });

  it('core helpers and constants are real values (1.x published some as type-only aliases)', () => {
    expect(typeof api.addDays).toBe('function');
    expect(typeof api.computeCriticalPath).toBe('function');
    expect(typeof api.flattenTree).toBe('function');
    expect(api.LightTheme).toBe(core.LightTheme);
    expect(api.ViewMode.Week).toBe(core.ViewMode.Week);
  });

  it('no longer exports the internal services, components and the 1.x setup', () => {
    for (const name of REMOVED) expect(name in api, name).toBe(false);
  });

  it('ColumnDef is the Angular refinement: the cell template is a TemplateRef', () => {
    expectTypeOf<api.ColumnDef['cellTemplate']>().toEqualTypeOf<TemplateRef<api.ColumnCellContext> | undefined>();
    expectTypeOf<api.GanttDataSourceConfig>().not.toHaveProperty('injector');
    expectTypeOf(api.provideGantt).returns.toEqualTypeOf<Provider[]>();
  });

  it('the tooltip template context: the model as $implicit and by name, the task and its row', () => {
    expectTypeOf<api.GanttTooltipTemplateContext['$implicit']>().toEqualTypeOf<api.TooltipModel>();
    expectTypeOf<api.GanttTooltipTemplateContext['model']>().toEqualTypeOf<api.TooltipModel>();
    expectTypeOf<api.GanttTooltipTemplateContext['task']>().toEqualTypeOf<api.GanttTask>();
    expectTypeOf<api.GanttTooltipTemplateContext['row']>().toEqualTypeOf<api.GanttFlatRow>();
  });
});
