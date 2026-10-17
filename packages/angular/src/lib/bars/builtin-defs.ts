// ─────────────────────────────────────────────────────────────
//  gantry · bars/builtin-defs.ts
//  The bars every chart knows without a provider. `provideGanttBar` at
//  any injector level can override them (e.g. a custom 'task' bar).
// ─────────────────────────────────────────────────────────────

import { type GanttBarDef } from '../bar-registry';
import { GanttGroupBarComponent } from './group-bar.component';
import { GanttMilestoneComponent } from './milestone.component';
import { GanttTaskBarComponent } from './task-bar.component';

/** Built-in bar types: 'task' (also the fallback of unknown types), 'milestone', 'group'. */
export const BUILTIN_BARS: readonly GanttBarDef[] = [
  { type: 'task', component: GanttTaskBarComponent },
  { type: 'milestone', component: GanttMilestoneComponent },
  { type: 'group', component: GanttGroupBarComponent },
];

/** What `GanttBarRegistry.resolve()` returns for a type nobody registered. */
export const FALLBACK_BAR = GanttTaskBarComponent;
