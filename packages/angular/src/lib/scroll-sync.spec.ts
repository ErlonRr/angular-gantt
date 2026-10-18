// Vertical scroll mirroring between the task-list panel and the timeline (`GanttScrollService`, core
// `createScrollMirror`, as the Web Component's `interaction/scroll.ts`): each scroll event mirrors at
// once, and the echo of a mirror write never undoes a newer scroll — keyboard moves at key-repeat
// speed scroll the timeline in each keydown, before the panel's echo of the previous move arrives.
import { describe, it, expect } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { type GanttOptions, type GanttTask } from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttScrollService } from './scroll/gantt-scroll.service';

const TASKS = (): GanttTask[] =>
  Array.from({ length: 80 }, (_, i) => ({
    id: `t${i}`,
    name: `Task ${i}`,
    start: new Date(2026, 2, 2 + (i % 20)),
    end: new Date(2026, 2, 9 + (i % 20)),
  }));

@Component({
  imports: [GantryComponent],
  template: `<gantry style="height: 400px" [series]="tasks()" [options]="options()" />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(TASKS());
  readonly options = signal<GanttOptions>({ viewMode: 'Day', initialScroll: false });
}

async function mount() {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  await f.whenStable();
  const debug = f.debugElement.query(By.directive(GantryComponent));
  const host = debug.nativeElement as HTMLElement;
  return {
    scroll: debug.injector.get(GanttScrollService),
    panel: host.querySelector<HTMLElement>('.gantry-panel')!,
    viewport: host.querySelector<HTMLElement>('.gantry-canvas-viewport')!,
  };
}

const scrolled = (pane: HTMLElement) => pane.dispatchEvent(new Event('scroll'));

describe('scroll sync', () => {
  it('mirrors either pane into the other at once and publishes the timeline’s offsets', async () => {
    const { scroll, panel, viewport } = await mount();
    viewport.scrollTop = 300;
    viewport.scrollLeft = 40;
    scrolled(viewport);
    expect(panel.scrollTop).toBe(300);
    expect(scroll.scrollTop()).toBe(300);
    expect(scroll.scrollLeft()).toBe(40);
    panel.scrollTop = 120;
    scrolled(panel);
    expect(viewport.scrollTop).toBe(120);
    expect(scroll.scrollTop()).toBe(120);
  });

  it('the echo of the previous mirror write never undoes a newer keyboard scroll (key-repeat speed)', async () => {
    const { scroll, panel, viewport } = await mount();
    viewport.scrollTop = 1951;
    scrolled(viewport);
    expect(panel.scrollTop).toBe(1951);
    // The next ↑ scrolls the timeline before the panel's own (echo) event arrives; the browser
    // dispatches the echo first
    viewport.scrollTop = 1915;
    scrolled(panel);
    expect(viewport.scrollTop).toBe(1915);
    scrolled(viewport);
    expect(panel.scrollTop).toBe(1915);
    expect(scroll.scrollTop()).toBe(1915);
  });
});
