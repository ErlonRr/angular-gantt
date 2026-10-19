// Phase 10 review fix (step 7.1): the drag ghost takes the dragged row's resolved style, like its
// bar — the height and radius of `styles.levels` / `styles.task` / `task.style` (core
// `computeDragGhostVisual(…, style)` with `layout.rowStyle()`) — and the drag readout chip is placed
// by that ghost. The Web Component's `graph/visuals.ts` passes the same style (vanilla
// `readout.test.ts`).
import { describe, it, expect } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  computeDragGhostVisual,
  dragReadoutWidth,
  placeDragReadout,
  type DragPreview,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { GantryComponent } from '../gantt-component/gantry.component';
import { GanttLayoutService } from '../layout/gantt-layout.service';
import { GanttScrollService } from '../scroll/gantt-scroll.service';
import { GanttDragService } from './gantt-drag.service';
import { GanttI18nService } from '../services/gantt-i18n.service';

const TASKS = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: new Date(2026, 2, 2), end: new Date(2026, 2, 9) },
  { id: 'b', name: 'Beta', start: new Date(2026, 2, 4), end: new Date(2026, 2, 11), style: { height: 14, radius: 1 } },
];
const LEVELS: GanttOptions = {
  viewMode: 'Day',
  initialScroll: false,
  styles: { levels: [{ height: '70%', radius: 9 }] },
};

@Component({
  imports: [GantryComponent],
  template: `<gantry style="height: 400px" [series]="tasks()" [options]="options()" />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(TASKS());
  readonly options = signal<GanttOptions>(LEVELS);
}

interface Chart {
  f: ComponentFixture<Host>;
  host: HTMLElement;
  gantt: GantryComponent;
  layout: GanttLayoutService;
  scroll: GanttScrollService;
  drag: GanttDragService;
  i18n: GanttI18nService;
  set(change: () => void): Promise<void>;
}

/** Mounts with the timeline viewport measured 600 × 300 px (happy-dom has no layout). */
async function mount(): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  await f.whenStable();
  const debug = f.debugElement.query(By.directive(GantryComponent));
  const layout = debug.injector.get(GanttLayoutService);
  const c: Chart = {
    f,
    host: debug.nativeElement as HTMLElement,
    gantt: debug.componentInstance as GantryComponent,
    layout,
    scroll: debug.injector.get(GanttScrollService),
    drag: debug.injector.get(GanttDragService),
    i18n: debug.injector.get(GanttI18nService),
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

/** The new dates of a one-day move */
const MOVED: Record<string, [Date, Date]> = {
  a: [new Date(2026, 2, 3), new Date(2026, 2, 10)],
  b: [new Date(2026, 2, 5), new Date(2026, 2, 12)],
};

/** A keyboard move of `taskId` one day on, in its row (what the move session writes). */
async function move(c: Chart, taskId: string): Promise<DragPreview> {
  const geo = c.layout.geometryById().get(taskId)!;
  const [start, end] = MOVED[taskId];
  const p: DragPreview = {
    taskId,
    x: geo.barX + 48,
    width: geo.barWidth,
    y: geo.y,
    height: geo.height,
    delta: 1,
    unit: 'day',
    daysDelta: 1,
    start,
    end,
  };
  await c.set(() => {
    c.drag.startExternal(taskId);
    c.drag.setExternalPreview(p);
  });
  return p;
}

const ghostRect = (c: Chart) => c.host.querySelector<SVGRectElement>('rect.gantt-drag-preview')!;

describe('drag ghost: the row style (phase 10 step 7.1)', () => {
  it('is drawn at the bar’s styled height and radius (styles.levels), centred like the bar', async () => {
    const c = await mount();
    await move(c, 'a');
    const bar = c.gantt.getBarVisual('a')!;
    const geo = c.layout.geometryById().get('a')!;
    expect(bar.height).toBeCloseTo(geo.height * 0.7);
    const rect = ghostRect(c);
    expect(rect.getAttribute('height')).toBe(String(bar.height));
    expect(rect.getAttribute('y')).toBe(String(bar.y));
    expect(rect.getAttribute('rx')).toBe('9');
  });

  it('follows task.style over the level style', async () => {
    const c = await mount();
    await move(c, 'b');
    const bar = c.gantt.getBarVisual('b')!;
    expect(bar.height).toBe(14);
    expect(ghostRect(c).getAttribute('height')).toBe('14');
    expect(ghostRect(c).getAttribute('rx')).toBe('1');
  });

  it('places the readout chip by that ghost', async () => {
    const c = await mount();
    const p = await move(c, 'a');
    const { layout } = c;
    const geo = layout.geometryById().get('a')!;
    const chip = c.host.querySelector<HTMLElement>('.gantt-drag-readout')!;
    const ghost = computeDragGhostVisual(
      p,
      geo,
      layout.cfg(),
      layout.timeline().toX,
      c.i18n.bundle(),
      layout.fontPx(),
      layout.rowStyle()(geo.row),
    );
    expect(ghost.height).toBeCloseTo(geo.height * 0.7);
    const metrics = {
      scrollLeft: c.scroll.scrollLeft(),
      viewportWidth: 600,
      scrollTop: c.scroll.scrollTop(),
      headerHeight: layout.headerHeight(),
      viewportHeight: 300,
      width: dragReadoutWidth(chip.textContent),
    };
    const place = placeDragReadout(ghost, metrics);
    expect(chip.style.getPropertyValue('--y')).toBe(`${place.y}px`);
    // Not where a ghost at the default 60 % would put it
    const plain = computeDragGhostVisual(p, geo, layout.cfg(), layout.timeline().toX, c.i18n.bundle(), layout.fontPx());
    expect(placeDragReadout(plain, metrics).y).not.toBe(place.y);
  });
});
