// The drag readout and the drag ghost after Gantry 2 phase 10 step 4.10 (the Web Component's steps
// 4.4 and 2.6): the readout chip writes its dates in `formats.readoutFormat` when set (core's default
// for the scale unit otherwise), and the ghost has no movement label any more — no `<text>`, no
// label styles, no forced-colors rule for it.
import { describe, it, expect } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, ɵgetComponentDef as getComponentDef } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TaskType, type DragPreview, type GanttOptions, type GanttTask } from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttDragService } from './drag/gantt-drag.service';
import { GanttDragPreviewComponent } from './drag/gantt-drag-preview.component';

const TASKS = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: new Date(2026, 2, 2), end: new Date(2026, 2, 9) },
  { id: 'm', name: 'Gate', start: new Date(2026, 2, 16), end: new Date(2026, 2, 16), type: TaskType.Milestone },
];

@Component({
  imports: [GantryComponent],
  template: `<gantry style="height: 400px" [series]="tasks()" [options]="options()" />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(TASKS());
  readonly options = signal<GanttOptions>({ viewMode: 'Day', initialScroll: false });
}

interface Chart {
  f: ComponentFixture<Host>;
  host: HTMLElement;
  drag: GanttDragService;
  set(change: () => void): Promise<void>;
}

/** Mounts with the timeline viewport measured 600 × 300 px (happy-dom has no layout). */
async function mount(options: GanttOptions): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  f.componentInstance.options.set(options);
  await f.whenStable();
  const debug = f.debugElement.query(By.directive(GantryComponent));
  const layout = debug.injector.get(GanttLayoutService);
  const c: Chart = {
    f,
    host: debug.nativeElement as HTMLElement,
    drag: debug.injector.get(GanttDragService),
    async set(change) {
      change();
      await f.whenStable();
    },
  };
  await c.set(() => {
    layout.viewportWidth.set(600);
    layout.viewportHeight.set(300);
  });
  return c;
}

/** A preview of `taskId` moved to `start` → `end`. */
function preview(taskId: string, start: Date, end: Date, x = 120, unit: 'day' | 'hour' = 'day'): DragPreview {
  return { taskId, x, width: 160, y: 0, height: 20, delta: 1, unit, daysDelta: 1, start, end };
}

/** Shows `p` through a keyboard move session. */
async function move(c: Chart, p: DragPreview): Promise<void> {
  await c.set(() => {
    if (!c.drag.isActive()) c.drag.startExternal(p.taskId);
    c.drag.setExternalPreview(p);
  });
}

const chip = (c: Chart) => c.host.querySelector<HTMLElement>('.gantt-drag-readout')!;

describe('drag readout format (phase 10)', () => {
  it('writes its dates in formats.readoutFormat, on every scale, and the default again once it is unset', async () => {
    const c = await mount({ viewMode: 'Day', initialScroll: false, formats: { readoutFormat: 'YYYY-MM-DD' } });
    await move(c, preview('a', new Date(2026, 2, 3), new Date(2026, 2, 10)));
    expect(chip(c).textContent).toMatch(/^2026-03-03 – 2026-03-10 · /);
    // A milestone: its date alone, in the same format
    await move(c, preview('m', new Date(2026, 2, 17), new Date(2026, 2, 17)));
    expect(chip(c).textContent).toBe('2026-03-17');

    // Hour scales: the format wins over the time-only end of the default
    await c.set(() =>
      c.f.componentInstance.options.set({
        viewMode: 'Hour',
        initialScroll: false,
        formats: { readoutFormat: 'D/M HH:mm' },
      }),
    );
    const hours = preview('a', new Date(2026, 2, 3, 9), new Date(2026, 2, 3, 17), 120, 'hour');
    await move(c, hours);
    expect(chip(c).textContent).toMatch(/^3\/3 09:00 – 3\/3 17:00 · /);

    // Unset: core's default for the scale unit again
    await c.set(() => c.f.componentInstance.options.set({ viewMode: 'Hour', initialScroll: false }));
    await move(c, { ...hours, x: 140 });
    expect(chip(c).textContent).toMatch(/^3 Mar 09:00 – 17:00 · /);
  });
});

describe('drag ghost without a label (phase 10)', () => {
  it('has no label styles: no text rule, no .gantt-drag-preview-label, one forced-colors rule for the ghost', () => {
    const css = (getComponentDef(GanttDragPreviewComponent)?.styles ?? []).join('\n');
    expect(css).not.toContain('gantt-drag-preview-label');
    expect(css).not.toMatch(/(^|[\s}])text(\[[^\]]*\])?\s*\{/);
    expect(css).not.toContain('CanvasText');
    expect(css).toMatch(/@media \(forced-colors: active\)/);
    expect(css).toMatch(
      /\.gantt-drag-preview(\[[^\]]*\])?\s*\{\s*fill:\s*Highlight\s*!important;\s*stroke:\s*Highlight\s*!important;?\s*\}/,
    );
  });

  it('draws no <text> next to the ghost during a keyboard move', async () => {
    const c = await mount({ viewMode: 'Day', initialScroll: false });
    await move(c, preview('a', new Date(2026, 2, 5), new Date(2026, 2, 12)));
    const ghost = c.host.querySelector('g[ganttDragPreview]')!;
    expect(ghost.querySelector('rect.gantt-drag-preview')).not.toBeNull();
    expect(ghost.querySelectorAll('text')).toHaveLength(0);
    expect(chip(c).textContent).toMatch(/^5 Mar – 12 Mar · /);
  });
});
