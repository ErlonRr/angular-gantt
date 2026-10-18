// ─────────────────────────────────────────────────────────────
//  gantry · tooltip/gantt-tooltip-template.directive.ts
//
//  Custom tooltip content: an `<ng-template ganttTooltip>` inside
//  `<gantry>` replaces the built-in title and rows (the tooltip box,
//  its placement and timing stay the chart's). It takes precedence over
//  `options.tooltip.render`. GantryComponent finds it with a content
//  query and hands its TemplateRef to the chart's tooltip state.
//
//    <gantry [series]="tasks">
//      <ng-template ganttTooltip let-model let-task="task">
//        <strong>{{ task.name }}</strong> · {{ model.rows.length }} facts
//      </ng-template>
//    </gantry>
// ─────────────────────────────────────────────────────────────

import { Directive, TemplateRef, inject } from '@angular/core';
import { type GanttFlatRow, type GanttTask, type TooltipModel } from '@gantryjs/core';

/** What an `<ng-template ganttTooltip>` receives. */
export interface GanttTooltipTemplateContext {
  /** The content the built-in tooltip would show (`let-model`) */
  readonly $implicit: TooltipModel;
  /** The same model, by name (`let-model="model"`) */
  readonly model: TooltipModel;
  /** The task whose bar is hovered, focused or tapped */
  readonly task: GanttTask;
  /** Its visible row (level, position, bar type…) */
  readonly row: GanttFlatRow;
}

/**
 * Marks the `<ng-template>` that renders the task tooltip's content.
 *
 * @example
 * <ng-template ganttTooltip let-task="task" let-model>
 *   {{ task.name }}: {{ model.rows.length }} rows
 * </ng-template>
 */
@Directive({ selector: 'ng-template[ganttTooltip]' })
export class GanttTooltipTemplateDirective {
  /** The template the tooltip renders, with a `GanttTooltipTemplateContext` */
  readonly template: TemplateRef<GanttTooltipTemplateContext> =
    inject<TemplateRef<GanttTooltipTemplateContext>>(TemplateRef);

  /** Types the template's context (`let-…` variables) in strict templates. */
  static ngTemplateContextGuard(
    _directive: GanttTooltipTemplateDirective,
    _context: unknown,
  ): _context is GanttTooltipTemplateContext {
    return true;
  }
}
