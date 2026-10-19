// `ganttColumn` definitions (Gantry 2 phase 10): a cell template comes from an `<ng-container
// ganttColumn>` holding an `<ng-template let-row>` (a content query can't see inside an
// `<ng-template>` host). Over a column of the consumer's `[columns]` a definition overrides what it
// sets, and its own cell replaces only the cell, so the column keeps its sort rule.
import { describe, it, expect } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { ColumnSortValue, GanttFlatRow, GanttTask } from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttColumnDefDirective } from './columns/gantt-column.directive';
import { GanttColumnService } from './columns/gantt-column.service';
import type { ColumnDef } from './types';

const day = (d: number) => new Date(2026, 0, d);
const TASKS: GanttTask[] = [
  { id: 'a', name: 'Alpha', start: day(5), end: day(9), data: { rank: 2 } },
  { id: 'b', name: 'Beta', start: day(6), end: day(12), data: { rank: 1 } },
];
const rankOf = (row: GanttFlatRow): ColumnSortValue => row.task.data?.['rank'] as number;

@Component({
  imports: [GantryComponent, GanttColumnDefDirective],
  template: `<gantry style="height: 300px" [series]="tasks" [columns]="columns" [options]="{ initialScroll: false }">
    <ng-container ganttColumn="rank" [label]="label()">
      <ng-template let-row
        ><b class="rank-cell">#{{ row.task.data?.rank }}</b></ng-template
      >
    </ng-container>
    <ng-container ganttColumn="status">
      <ng-template let-row
        ><i class="status-cell">{{ row.task.name }}</i></ng-template
      >
    </ng-container>
    @if (withSort()) {
      <ng-template ganttColumn="end" [sortable]="true" [sortValue]="byName" />
    }
  </gantry>`,
})
class Host {
  readonly tasks = TASKS;
  readonly columns: ColumnDef[] = [
    { key: 'name', label: 'Task', width: 160 },
    {
      key: 'rank',
      label: 'Rank',
      width: 80,
      render: r => String(r.task.data?.['rank']),
      sortable: true,
      sortValue: rankOf,
    },
    { key: 'status', label: 'Status', width: 100 },
    { key: 'end', label: 'End', width: 100 },
  ];
  readonly label = signal<string | undefined>(undefined);
  readonly withSort = signal(false);
  readonly byName = (row: GanttFlatRow): ColumnSortValue => row.task.name;
}

async function mount(): Promise<ComponentFixture<Host>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  await f.whenStable();
  return f;
}
const columnOf = (f: ComponentFixture<Host>, key: string) =>
  f.debugElement
    .query(By.directive(GantryComponent))
    .injector.get(GanttColumnService)
    .columns()
    .find(c => c.key === key);

describe('ganttColumn', () => {
  it('takes its cell template from an <ng-container ganttColumn> and renders it', async () => {
    const f = await mount();
    const cells = (f.nativeElement as HTMLElement).querySelectorAll('.status-cell');
    expect([...cells].map(c => c.textContent)).toEqual(['Alpha', 'Beta']);
  });
});

describe('ganttColumn over a [columns] entry', () => {
  it('replaces the cell and keeps the label, width and sort rule it does not set', async () => {
    const f = await mount();
    const rank = columnOf(f, 'rank')!;
    expect(rank.cellTemplate).toBeDefined();
    expect(rank.render).toBeUndefined();
    expect(rank.sortable).toBe(true);
    expect(rank.sortValue).toBe(rankOf);
    expect(rank.label).toBe('Rank');
    expect(rank.width).toBe(80);
    const cells = (f.nativeElement as HTMLElement).querySelectorAll('.rank-cell');
    expect([...cells].map(c => c.textContent)).toEqual(['#2', '#1']);

    f.componentInstance.label.set('Priority');
    await f.whenStable();
    expect(columnOf(f, 'rank')!.label).toBe('Priority');
    expect(columnOf(f, 'rank')!.sortValue).toBe(rankOf);
  });

  it('sets a sort rule with [sortValue]', async () => {
    const f = await mount();
    expect(columnOf(f, 'end')!.sortValue).not.toBe(f.componentInstance.byName);
    f.componentInstance.withSort.set(true);
    await f.whenStable();
    expect(columnOf(f, 'end')!.sortValue).toBe(f.componentInstance.byName);
    expect(columnOf(f, 'end')!.sortable).toBe(true);
  });

  it('keeps the sort rule a consumer entry inherited from a built-in', async () => {
    const f = await mount();
    // `status` is a consumer entry over the built-in: the consumer's own column, so its sort rule stays
    const status = columnOf(f, 'status')!;
    expect(status.cellTemplate).toBeDefined();
    expect(typeof status.sortValue).toBe('function');
  });
});
