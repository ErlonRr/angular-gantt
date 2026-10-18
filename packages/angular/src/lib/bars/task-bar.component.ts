// ─────────────────────────────────────────────────────────────
//  gantry · bars/task-bar.component.ts
//  Standard task bar (progress fill, label, baseline).
//  Geometry comes from `ctx.visual` (the shared @gantryjs/core render model).
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BUILTIN_BAR_HOST, BUILTIN_BAR_STYLES, BUILTIN_BAR_TEMPLATE, GanttBuiltinBar } from './builtin-bar';

@Component({
  selector: 'g[ganttTaskBar]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: BUILTIN_BAR_HOST,
  template: BUILTIN_BAR_TEMPLATE,
  styles: [BUILTIN_BAR_STYLES],
})
export class GanttTaskBarComponent extends GanttBuiltinBar {}
