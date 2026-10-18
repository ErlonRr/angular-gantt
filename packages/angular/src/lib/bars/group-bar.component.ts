// ─────────────────────────────────────────────────────────────
//  gantry · bars/group-bar.component.ts
//  Summary bar of a parent task (bracket style or regular bar).
//  Geometry comes from `ctx.visual` (the shared @gantryjs/core render model).
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BUILTIN_BAR_HOST, BUILTIN_BAR_STYLES, BUILTIN_BAR_TEMPLATE, GanttBuiltinBar } from './builtin-bar';

@Component({
  selector: 'g[ganttGroupBar]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: BUILTIN_BAR_HOST,
  template: BUILTIN_BAR_TEMPLATE,
  styles: [BUILTIN_BAR_STYLES],
})
export class GanttGroupBarComponent extends GanttBuiltinBar {}
