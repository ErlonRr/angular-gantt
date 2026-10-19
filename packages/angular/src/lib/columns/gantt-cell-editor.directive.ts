// ─────────────────────────────────────────────────────────────
//  gantry · columns/gantt-cell-editor.directive.ts
//
//  A custom cell editor (D16 of Gantry 2 phase 11): an
//  `<ng-template ganttCellEditor let-edit>` inside an
//  `<ng-container ganttColumn>` renders the column's editor in place of
//  the built-in input while one of its cells is edited. The template
//  gets the editor's context (`CellEditorContext`): its text, the error
//  message, `setValue()`, `commit()` and `cancel()`. The chart focuses
//  the editor (or its first focusable child) and handles Enter / Tab /
//  Esc unless the editor called `preventDefault()`.
//
//    <gantry [series]="tasks" [options]="{ editing: true }">
//      <ng-container ganttColumn="estimate" label="Estimate" editable>
//        <ng-template let-row>{{ row.task.data?.estimate }} h</ng-template>
//        <ng-template ganttCellEditor let-edit>
//          <input type="number" [value]="edit.value" (input)="edit.setValue($any($event.target).value)" />
//        </ng-template>
//      </ng-container>
//    </gantry>
//
//  Import `GanttCellEditorDirective` next to `GanttColumnDefDirective`:
//  without it the template is not recognised (and would be taken for the
//  cell template). The column directive hands this template to its
//  `ColumnDef.editor` (an `[editor]` input wins over it); the task list
//  renders it in the edited cell, its first element taking the class
//  `gantt-tl-editor`, the focus (or its first focusable child) and the
//  editor's accessible name unless it has one.
// ─────────────────────────────────────────────────────────────

import { Directive, TemplateRef, inject } from '@angular/core';

import { type CellEditorTemplateContext } from '../types';

/**
 * Marks the `<ng-template>` that renders a column's custom cell editor (inside its
 * `<ng-container ganttColumn>`).
 *
 * @example
 * <ng-template ganttCellEditor let-edit>
 *   <input [value]="edit.value" (input)="edit.setValue($any($event.target).value)" />
 * </ng-template>
 */
@Directive({ selector: 'ng-template[ganttCellEditor]' })
export class GanttCellEditorDirective {
  /** The template the editor renders, with a `CellEditorTemplateContext` */
  readonly template: TemplateRef<CellEditorTemplateContext> =
    inject<TemplateRef<CellEditorTemplateContext>>(TemplateRef);

  /** Types the template's context (`let-…` variables) in strict templates. */
  static ngTemplateContextGuard(
    _directive: GanttCellEditorDirective,
    _context: unknown,
  ): _context is CellEditorTemplateContext {
    return true;
  }
}
