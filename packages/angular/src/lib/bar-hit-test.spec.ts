// Bars are hit by geometry, the same test as the Web Component (Phase 9, D14 / D15): the row under
// the pointer's y, then core `hitTestBar` on that row's visual — resize handles first (up to
// `bar.handles.hitSize` wide, reaching past the bar's edges), then the bar's hit box. The test DOM
// maps client to SVG coordinates 1:1.
import { describe, it, expect } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DRAG_THRESHOLD_PX, TaskType, type GanttOptions, type GanttTask } from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttDragService } from './drag/gantt-drag.service';

const day = (d: number) => new Date(2026, 2, d);

const TASKS: GanttTask[] = [
  { id: 'a', name: 'Alpha', start: day(2), end: day(12) },
  { id: 'b', name: 'Beta', start: day(4), end: day(14), draggable: false },
  { id: 'm', name: 'Gate', type: TaskType.Milestone, start: day(16), end: day(16) },
];

@Component({
  imports: [GantryComponent],
  template: `<gantry style="height: 400px" [series]="tasks" [options]="options()" />`,
})
class Host {
  readonly tasks = TASKS;
  readonly options = signal<GanttOptions>({ initialScroll: false, viewMode: 'Day' });
  readonly chart = viewChild.required(GantryComponent);
}

type Fixture = ComponentFixture<Host>;

async function mount(options: GanttOptions = {}): Promise<Fixture> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  f.componentInstance.options.update(o => ({ ...o, ...options }));
  await f.whenStable();
  return f;
}

/** The timeline <svg> (the toolbar's icons are svgs too) */
const svgOf = (f: Fixture) => (f.nativeElement as HTMLElement).querySelector<SVGSVGElement>('gantt-canvas svg')!;
const dragOf = (f: Fixture) => f.debugElement.query(By.directive(GantryComponent)).injector.get(GanttDragService);

/**
 * Presses a mouse at `(x, y)` on the timeline <svg>, moves it `DRAG_THRESHOLD_PX` (a mouse press
 * drags from there), reads the drag state, then releases.
 */
function pressAt(f: Fixture, x: number, y: number): string {
  const svg = svgOf(f);
  const init = { bubbles: true, button: 0, pointerId: 1, pointerType: 'mouse' };
  svg.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: x, clientY: y }));
  svg.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: x + DRAG_THRESHOLD_PX, clientY: y }));
  const kind = dragOf(f).state().kind;
  svg.dispatchEvent(new PointerEvent('pointerup', { ...init, clientX: x + DRAG_THRESHOLD_PX, clientY: y }));
  TestBed.tick();
  return kind;
}

describe('<gantry> bar hit-testing', () => {
  it('resizes from the handles (also just outside the edges) and moves from the body', async () => {
    const f = await mount();
    const v = f.componentInstance.chart().getBarVisual('a')!;
    const { left, right } = v.handles!;
    expect(left.hit.width).toBe(24);
    expect(pressAt(f, v.x + v.width / 2, v.cy)).toBe('dragging');
    expect(pressAt(f, v.x + 2, v.cy)).toBe('resizing-left');
    expect(pressAt(f, v.x - 8, v.cy)).toBe('resizing-left');
    expect(pressAt(f, v.x + v.width - 2, v.cy)).toBe('resizing-right');
    expect(pressAt(f, v.x + v.width + 8, v.cy)).toBe('resizing-right');
    expect(pressAt(f, left.hit.x - 2, v.cy)).toBe('idle');
    expect(pressAt(f, right.hit.x + right.hit.width + 2, v.cy)).toBe('idle');
    expect(pressAt(f, v.x + v.width / 2, v.y - 2)).toBe('idle');
  });

  it('never drags a task with draggable: false', async () => {
    const f = await mount();
    const v = f.componentInstance.chart().getBarVisual('b')!;
    expect(v.handles).toBeNull();
    expect(pressAt(f, v.x + v.width / 2, v.cy)).toBe('idle');
  });

  it('moves a milestone from its padded box', async () => {
    const f = await mount();
    const m = f.componentInstance.chart().getBarVisual('m')!;
    expect(pressAt(f, m.x - 2, m.cy)).toBe('dragging');
    expect(pressAt(f, m.x - 5, m.cy)).toBe('idle');
  });

  it('only moves when resize is off, and does nothing when drag is off', async () => {
    const f = await mount({ enableResize: false });
    const v = f.componentInstance.chart().getBarVisual('a')!;
    expect(v.handles).toBeNull();
    expect(pressAt(f, v.x + 2, v.cy)).toBe('dragging');
    f.componentInstance.options.update(o => ({ ...o, enableDrag: false }));
    await f.whenStable();
    expect(pressAt(f, v.x + 2, v.cy)).toBe('idle');
  });

  it('honours bar.handles.hitSize', async () => {
    const f = await mount({ bar: { handles: { hitSize: 32 } } });
    const v = f.componentInstance.chart().getBarVisual('a')!;
    expect(v.handles!.left.hit.width).toBe(32);
    expect(pressAt(f, v.x - 14, v.cy)).toBe('resizing-left');
  });
});
