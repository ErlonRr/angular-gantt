// ─────────────────────────────────────────────────────────────
//  gantry · columns/gantt-column.directive.ts
//
//  Structural directive for declarative column definition.
//
//  Usage in consumer template:
//
//  <gantry [series]="tasks">
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
//  </gantry>
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
  untracked,
  OnInit,
  OnDestroy,
  TemplateRef,
  ContentChild,
} from '@angular/core';

import { GanttColumnService } from './gantt-column.service';
import { ColumnDef, ColumnRenderer, ColumnCellContext } from '../types';

// Re-exported for backward compatibility — the canonical definition lives in types.ts
export type { ColumnCellContext } from '../types';

@Directive({
  selector: '[ganttColumn]',
  standalone: true,
})
export class GanttColumnDefDirective implements OnInit, OnDestroy {
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
  /** Function-based renderer — overrides template cell if provided */
  readonly render = input<ColumnRenderer | undefined>(undefined);

  /** Optional ng-template for the cell content */
  @ContentChild(TemplateRef)
  cellTemplate?: TemplateRef<ColumnCellContext>;

  private readonly columnService = inject(GanttColumnService);
  private readonly tpl = inject(TemplateRef, { optional: true });
  private readonly injector = inject(Injector);

  ngOnInit(): void {
    // Register, and keep this one definition in sync when the inputs change
    // (ngOnInit is not an injection context)
    runInInjectionContext(this.injector, () => {
      effect(() => {
        const def = this.buildDef();
        untracked(() => this.columnService.registerColumn(def));
      });
    });
  }

  ngOnDestroy(): void {
    this.columnService.unregisterColumn(this.key());
  }

  private buildDef(): ColumnDef {
    const render = this.render();
    const cellTemplate = render ? undefined : this.cellTemplate;
    // Only set what was given, so a built-in column with this key fills in the rest
    const def: Partial<ColumnDef> & { key: string } = { key: this.key() };
    if (this.label() !== undefined) def.label = this.label();
    if (this.width() !== undefined) def.width = this.width();
    if (this.minWidth() !== undefined) def.minWidth = this.minWidth();
    if (this.maxWidth() !== undefined) def.maxWidth = this.maxWidth();
    if (this.visible() !== undefined) def.visible = this.visible();
    if (this.sortable() !== undefined) def.sortable = this.sortable();
    if (render) def.render = render;
    if (cellTemplate) def.cellTemplate = cellTemplate;
    return def as ColumnDef;
  }

  /** Exposed for the task list to use as a TemplateRef per-cell */
  getTemplate(): TemplateRef<ColumnCellContext> | undefined {
    return this.cellTemplate ?? this.tpl ?? undefined;
  }
}
