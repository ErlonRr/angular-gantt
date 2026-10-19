// ─────────────────────────────────────────────────────────────
//  gantry · columns/gantt-column.directive.ts
//
//  Declarative column definition.
//
//  Usage in consumer template:
//
//  <gantry [series]="tasks">
//    <ng-template ganttColumn="name" label="Task" [width]="200" />
//    <ng-template ganttColumn="status" label="Status" [width]="100"
//                 [render]="statusRenderer" />
//    <ng-container ganttColumn="owner" label="Owner" [width]="120">
//      <ng-template let-row>
//        <span>{{ row.task.data?.owner }}</span>
//      </ng-template>
//    </ng-container>
//  </gantry>
//
//  A cell template goes inside an `<ng-container ganttColumn>`: the content
//  query that finds it can't see inside an `<ng-template>` host.
//
//  GantryComponent reads every `ganttColumn` of its content through a
//  content query (inside `@if` / `<ng-container>` too) and binds their
//  `def`s into its column service: adding, removing or changing one
//  updates the columns, with no registration step.
// ─────────────────────────────────────────────────────────────

import { Directive, computed, input, TemplateRef, contentChild } from '@angular/core';

import type { ColumnContext, ColumnSortValue, GanttFlatRow } from '@gantryjs/core';
import { type ColumnDef, type ColumnRenderer, type ColumnCellContext } from '../types';

@Directive({
  selector: '[ganttColumn]',
})
export class GanttColumnDefDirective {
  // ── Required input ───────────────────────────────────────
  readonly key = input.required<string>({ alias: 'ganttColumn' });

  // ── Optional inputs ───────────────────────────────────────
  // Unset inputs inherit from a built-in column with the same key (else core defaults apply)
  readonly label = input<string | undefined>(undefined);
  readonly width = input<number | undefined>(undefined);
  readonly minWidth = input<number | undefined>(undefined);
  readonly maxWidth = input<number | undefined>(undefined);
  readonly visible = input<boolean | undefined>(undefined);
  readonly sortable = input<boolean | undefined>(undefined);
  /** What the column sorts by (default: the cell text); over your own `columns` entry its rule stays */
  readonly sortValue = input<((row: GanttFlatRow, ctx: ColumnContext) => ColumnSortValue) | undefined>(undefined);
  /** Function-based renderer — overrides template cell if provided */
  readonly render = input<ColumnRenderer | undefined>(undefined);

  /** The cell content: an `<ng-template let-row>` inside an `<ng-container ganttColumn>` */
  readonly cellTemplate = contentChild<TemplateRef<ColumnCellContext>>(TemplateRef);

  /** The column definition: only what was given, so a built-in column with this key fills in the rest */
  readonly def = computed<ColumnDef>(() => {
    const render = this.render();
    const cellTemplate = render ? undefined : this.cellTemplate();
    const def: Partial<ColumnDef> & { key: string } = { key: this.key() };
    const label = this.label();
    const width = this.width();
    const minWidth = this.minWidth();
    const maxWidth = this.maxWidth();
    const visible = this.visible();
    const sortable = this.sortable();
    const sortValue = this.sortValue();
    if (label !== undefined) def.label = label;
    if (width !== undefined) def.width = width;
    if (minWidth !== undefined) def.minWidth = minWidth;
    if (maxWidth !== undefined) def.maxWidth = maxWidth;
    if (visible !== undefined) def.visible = visible;
    if (sortable !== undefined) def.sortable = sortable;
    if (sortValue) def.sortValue = sortValue;
    if (render) def.render = render;
    if (cellTemplate) def.cellTemplate = cellTemplate;
    return def as ColumnDef;
  });
}
