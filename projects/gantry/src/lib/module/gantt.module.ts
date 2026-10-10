// ─────────────────────────────────────────────────────────────
//  gantry · module/gantt.module.ts
//
//  Two ways to bootstrap:
//
//  ① NgModule style:
//     @NgModule({ imports: [GanttModule.forRoot()] })
//     class AppModule {}
//
//  ② Standalone / bootstrapApplication:
//     bootstrapApplication(AppComponent, {
//       providers: [provideGantt(), provideGanttBar(...)]
//     });
//
//  forRoot() registers the three built-in bar types:
//    'task'      → GanttTaskBarComponent
//    'milestone' → GanttMilestoneComponent
//    'group'     → GanttGroupBarComponent
//
//  Additional bar types are registered via:
//    provideGanttBar({ type: 'sprint', component: SprintBarComponent })
// ─────────────────────────────────────────────────────────────

import { NgModule, ModuleWithProviders, EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';

import { GANTT_GLOBAL_CONFIG, GanttGlobalConfig, provideGantt } from '../services/gantt-theme.service';

import { GANTT_BAR_DEF, provideGanttBar, GanttBarDef } from '../bar-registry';

import { GanttTaskBarComponent } from '../bars/task-bar.component';
import { GanttMilestoneComponent } from '../bars/milestone.component';
import { GanttGroupBarComponent } from '../bars/group-bar.component';
import { GantryComponent } from '../gantt-component/gantry.component';
import { GanttColumnDefDirective } from '../columns/gantt-column.directive';
import { GanttLoadMoreComponent } from '../datasource/gantt-load-more.component';
import { GanttToolbarComponent } from '../annotations/gantt-toolbar.component';

// ─── Built-in bar defs ────────────────────────────────────────

export const BUILT_IN_BAR_DEFS: GanttBarDef[] = [
  { type: 'task', component: GanttTaskBarComponent },
  { type: 'milestone', component: GanttMilestoneComponent },
  { type: 'group', component: GanttGroupBarComponent },
];

// ─── Environment provider factory ────────────────────────────

/**
 * Use in bootstrapApplication providers array.
 * Registers built-in bars + optional global config.
 *
 * @example
 * bootstrapApplication(AppComponent, {
 *   providers: [
 *     provideGanttLib(),
 *     // optional: custom bar
 *     provideGanttBar({ type: 'epic', component: EpicBarComponent }),
 *   ]
 * });
 */
export function provideGanttLib(config: GanttGlobalConfig = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: GANTT_GLOBAL_CONFIG, useValue: config },
    ...BUILT_IN_BAR_DEFS.map(def => ({
      provide: GANTT_BAR_DEF,
      useValue: def,
      multi: true,
    })),
  ]);
}

// ─── NgModule ─────────────────────────────────────────────────

@NgModule({
  imports: [GantryComponent, GanttColumnDefDirective, GanttLoadMoreComponent, GanttToolbarComponent],
  exports: [GantryComponent, GanttColumnDefDirective, GanttLoadMoreComponent, GanttToolbarComponent],
})
export class GanttModule {
  static forRoot(config: GanttGlobalConfig = {}): ModuleWithProviders<GanttModule> {
    return {
      ngModule: GanttModule,
      providers: [
        { provide: GANTT_GLOBAL_CONFIG, useValue: config },
        ...BUILT_IN_BAR_DEFS.map(def => ({
          provide: GANTT_BAR_DEF,
          useValue: def,
          multi: true,
        })),
      ],
    };
  }
}
