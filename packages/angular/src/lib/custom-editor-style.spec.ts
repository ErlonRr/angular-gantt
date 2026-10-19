// A consumer's custom cell editor gets the chart's editor rules (Gantry 2 phase 11): it is the
// consumer's node, outside the task list's style scope, so the rules are `:host ::ng-deep` and reach
// it through the `gantt-tl-editor` class the chart adds (a scoped rule would leave it unstyled: no
// focus ring, no invalid outline, no forced-colours look).
import { describe, it, expect } from 'vitest';
import { Component, provideZonelessChangeDetection, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { GanttOptions, GanttTask } from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttColumnDefDirective } from './columns/gantt-column.directive';
import { GanttCellEditorDirective } from './columns/gantt-cell-editor.directive';
import type { ColumnDef } from './types';

const day = (d: number) => new Date(2026, 0, d);

@Component({
  imports: [GantryComponent, GanttColumnDefDirective, GanttCellEditorDirective],
  template: `<gantry style="height: 300px" [series]="tasks" [columns]="columns" [options]="options">
    <ng-container ganttColumn="note">
      <ng-template ganttCellEditor let-edit><input class="my-editor" [value]="edit.value" /></ng-template>
    </ng-container>
  </gantry>`,
})
class Host {
  readonly tasks: GanttTask[] = [{ id: 'a', name: 'Alpha', start: day(5), end: day(9), data: { note: 'x' } }];
  readonly columns: ColumnDef[] = [
    { key: 'name', label: 'Task', width: 120 },
    { key: 'note', label: 'Note', width: 120, editable: true },
  ];
  readonly options: GanttOptions = { initialScroll: false, editing: true };
  readonly gantt = viewChild.required(GantryComponent);
}

/** The editor rule's selector as injected (with the task list's host attribute) */
function injectedEditorSelectors(): string[] {
  const out: string[] = [];
  for (const style of document.querySelectorAll('style')) {
    const css = (style.textContent ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]*\.gantt-tl-editor)\s*\{/g)) out.push(m[1].trim());
  }
  return out;
}

describe('custom cell editor styles', () => {
  it('the editor rules reach the consumer’s template editor node', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    expect(f.componentInstance.gantt().editCell('a', 'note')).toBe(true);
    await f.whenStable();
    const chart = f.nativeElement as HTMLElement;
    const editor = chart.querySelector<HTMLInputElement>('input.my-editor');
    expect(editor).not.toBeNull();
    expect(editor!.classList.contains('gantt-tl-editor')).toBe(true);
    const selectors = injectedEditorSelectors();
    expect(selectors.length).toBeGreaterThan(0);
    expect(selectors.some(sel => editor!.matches(sel))).toBe(true);
  });
});
