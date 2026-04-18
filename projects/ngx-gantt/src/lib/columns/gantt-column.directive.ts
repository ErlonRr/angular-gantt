// ─────────────────────────────────────────────────────────────
//  ngx-gantt · columns/gantt-column.directive.ts
//
//  Structural directive for declarative column definition.
//
//  Usage in consumer template:
//
//  <ngx-gantt [series]="tasks">
//    <ng-template ganttColumn key="name"   label="Task" [width]="200">
//    </ng-template>
//    <ng-template ganttColumn key="status" label="Status" [width]="100"
//                 [render]="statusRenderer">
//    </ng-template>
//    <ng-template ganttColumn key="owner"  label="Owner"  [width]="120">
//      <ng-template let-row>
//        <span>{{ row.task.data?.owner }}</span>
//      </ng-template>
//    </ng-template>
//  </ngx-gantt>
//
//  The directive registers itself with GanttColumnService on init
//  and deregisters on destroy — reactive, no manual cleanup needed.
// ─────────────────────────────────────────────────────────────

import {
  Directive,
  input,
  effect,
  inject,
  Injector,
  runInInjectionContext,
  OnInit,
  OnDestroy,
  TemplateRef,
  ContentChild,
} from '@angular/core';

import { GanttColumnService }  from './gantt-column.service';
import { ColumnDef, ColumnRenderer, GanttFlatRow } from '../types';

/** Context passed to the cell template: `let-row` */
export interface ColumnCellContext {
  $implicit: GanttFlatRow;
  row:       GanttFlatRow;
}

@Directive({
  selector:  '[ganttColumn]',
  standalone: true,
})
export class GanttColumnDefDirective implements OnInit, OnDestroy {
  // ── Required input ───────────────────────────────────────
  readonly key   = input.required<string>({ alias: 'ganttColumn' });

  // ── Optional inputs ───────────────────────────────────────
  readonly label    = input<string>('');
  readonly width    = input<number>(120);
  readonly minWidth = input<number>(40);
  readonly maxWidth = input<number>(600);
  readonly visible  = input<boolean>(true);
  readonly sortable = input<boolean>(false);
  /** Function-based renderer — overrides template cell if provided */
  readonly render   = input<ColumnRenderer | undefined>(undefined);

  /** Optional ng-template for the cell content */
  @ContentChild(TemplateRef)
  cellTemplate?: TemplateRef<ColumnCellContext>;

  private readonly columnService = inject(GanttColumnService);
  private readonly tpl = inject(TemplateRef, { optional: true });
  private readonly injector = inject(Injector);

  ngOnInit(): void {
    const def = this.buildDef();
    this.columnService.addColumn(def);

    // Keep service in sync when inputs change (ngOnInit is not an injection context)
    runInInjectionContext(this.injector, () => {
      effect(() => {
        this.columnService.setColumns(
          // Merge this column's latest values into the existing set
          this.columnService.columns().map(c =>
            c.key === this.key() ? { ...c, ...this.buildDef() } : c
          )
        );
      });
    });
  }

  ngOnDestroy(): void {
    this.columnService.removeColumn(this.key());
  }

  private buildDef(): ColumnDef {
    // If a template or function renderer is provided, wrap it
    const renderFn: ColumnRenderer | undefined =
      this.render() ??
      (this.cellTemplate
        ? (row) => `<!-- template:${this.key()} row:${row.task.id} -->`
        : undefined);

    return {
      key:      this.key(),
      label:    this.label() || this.key(),
      width:    this.width(),
      minWidth: this.minWidth(),
      maxWidth: this.maxWidth(),
      visible:  this.visible(),
      sortable: this.sortable(),
      render:   renderFn,
      builtin:  false,
    };
  }

  /** Exposed for the task list to use as a TemplateRef per-cell */
  getTemplate(): TemplateRef<ColumnCellContext> | undefined {
    return this.cellTemplate ?? (this.tpl ?? undefined);
  }
}
