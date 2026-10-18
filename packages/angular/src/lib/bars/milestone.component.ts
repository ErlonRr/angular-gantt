// ─────────────────────────────────────────────────────────────
//  gantry · bars/milestone.component.ts
//  Milestone (diamond / circle / square).
//  Geometry comes from `ctx.visual` (the shared @gantry/core render model).
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BUILTIN_BAR_HOST, BUILTIN_BAR_STYLES, BUILTIN_BAR_TEMPLATE, GanttBuiltinBar } from './builtin-bar';

@Component({
  selector: 'g[ganttMilestone]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: BUILTIN_BAR_HOST,
  template: BUILTIN_BAR_TEMPLATE,
  styles: [BUILTIN_BAR_STYLES],
})
export class GanttMilestoneComponent extends GanttBuiltinBar {}
