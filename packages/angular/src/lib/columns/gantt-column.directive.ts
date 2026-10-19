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
//  Editing (Phase 11, D14 / D16; with `options.editing`): `[editable]`
//  (`true`, `false` or per row; a bare `editable` attribute is `true`),
//  `[editor]` (a built-in kind — 'text', 'number', 'date',
//  'datetime-local', 'select' — or a function returning the editor's DOM
//  node), `[editorOptions]`, `[exportValue]`, `[parse]` and `[validate]`.
//  A custom editor can also be an `<ng-template ganttCellEditor let-edit>`
//  inside the `<ng-container ganttColumn>` (an `[editor]` input wins over
//  it); the cell template is then the first other `<ng-template>`:
//
//  <ng-container ganttColumn="estimate" label="Estimate" editable>
//    <ng-template let-row>{{ row.task.data?.estimate }} h</ng-template>
//    <ng-template ganttCellEditor let-edit>
//      <input [value]="edit.value" (input)="edit.setValue($any($event.target).value)" />
//    </ng-template>
//  </ng-container>
//
//  GantryComponent reads every `ganttColumn` of its content through a
//  content query (inside `@if` / `<ng-container>` too) and binds their
//  `def`s into its column service: adding, removing or changing one
//  updates the columns, with no registration step.
// ─────────────────────────────────────────────────────────────

import {
  Directive,
  computed,
  input,
  type InputSignal,
  TemplateRef,
  contentChild,
  contentChildren,
  booleanAttribute,
} from '@angular/core';

import type { CellEditorOptions, ColumnContext, ColumnSortValue, GanttFlatRow, GanttTask } from '@gantryjs/core';
import { type ColumnDef, type ColumnRenderer, type ColumnCellContext } from '../types';
import { GanttCellEditorDirective } from './gantt-cell-editor.directive';

/** `[editable]`: a boolean, a per-row rule, or the attribute (`editable` / `editable="false"`). */
function editableAttribute(value: ColumnDef['editable'] | string): ColumnDef['editable'] {
  return typeof value === 'string' ? booleanAttribute(value) : value;
}

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

  // ── Editing (Phase 11) ────────────────────────────────────
  /** The cell can be edited (with `options.editing`): `true`, `false` or per row; a built-in key keeps its rule when unset */
  readonly editable = input<ColumnDef['editable'], ColumnDef['editable'] | string>(undefined, {
    transform: editableAttribute,
  });
  /** A built-in editor kind, or a function returning the editor's DOM node (wins over a `ganttCellEditor` template) */
  // Annotated: an inferred union prints in a build-dependent order in the API report
  readonly editor: InputSignal<ColumnDef['editor']> = input<ColumnDef['editor']>(undefined);
  /** Settings of a built-in editor (`min` / `max` / `step`, the `select` options) */
  readonly editorOptions = input<CellEditorOptions | undefined>(undefined);
  /** The cell's value as text: the editor's first value */
  readonly exportValue = input<((row: GanttFlatRow, ctx: ColumnContext) => string) | undefined>(undefined);
  /** The editor's text → the task fields to change (throw `new Error(message)` to reject it) */
  readonly parse = input<((value: string, row: GanttFlatRow, ctx: ColumnContext) => Partial<GanttTask>) | undefined>(
    undefined,
  );
  /** Checks the parsed fields: a message rejects them */
  readonly validate = input<ColumnDef['validate']>(undefined);

  /** The custom editor: an `<ng-template ganttCellEditor let-edit>` inside an `<ng-container ganttColumn>` */
  readonly editorTemplate = contentChild(GanttCellEditorDirective);
  /** Every `<ng-template>` of the content (the editor's included) */
  private readonly templates = contentChildren<TemplateRef<ColumnCellContext>>(TemplateRef, { descendants: true });

  /**
   * The cell content: the first `<ng-template>` inside an `<ng-container ganttColumn>` that is not
   * the editor's (`ganttCellEditor`)
   */
  readonly cellTemplate = computed<TemplateRef<ColumnCellContext> | undefined>(() => {
    // Each query makes its own TemplateRef: the same template has the same anchor node
    const editorAnchor: unknown = this.editorTemplate()?.template.elementRef.nativeElement;
    return this.templates().find(t => t.elementRef.nativeElement !== editorAnchor);
  });

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
    const editable = this.editable();
    const editor = this.editor() ?? this.editorTemplate()?.template;
    const editorOptions = this.editorOptions();
    const exportValue = this.exportValue();
    const parse = this.parse();
    const validate = this.validate();
    if (editable !== undefined) def.editable = editable;
    if (editor !== undefined) def.editor = editor;
    if (editorOptions) def.editorOptions = editorOptions;
    if (exportValue) def.exportValue = exportValue;
    if (parse) def.parse = parse;
    if (validate) def.validate = validate;
    return def as ColumnDef;
  });
}
