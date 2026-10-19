// Phase 10 review fix (step 7.1): the open tooltip follows its row's resolved style too, field by
// field (core `sameTaskStyle`): a new progress colour for its row rebuilds it (`render` again), equal
// styles in new objects do not. The Web Component's tooltip triggers (`tooltip-triggers.test.ts`)
// follow the same key.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { type GanttOptions, type GanttTask, type GanttTooltipRenderContext } from '@gantryjs/core';
import { GantryComponent } from '../gantt-component/gantry.component';
import { GanttLayoutService } from '../layout/gantt-layout.service';

const day = (d: number) => new Date(2026, 2, d);
const TASKS = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(9), progress: 50 },
  { id: 'b', name: 'Beta', start: day(9), end: day(20), progress: 20 },
];

@Component({
  imports: [GantryComponent],
  template: `<gantry style="height: 400px" [series]="tasks()" [options]="options()" />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(TASKS());
  readonly options = signal<GanttOptions>({});
}

/** The fill's paint, hex colours in upper case (the test DOM may hand back `rgb()`) */
function fillOf(host: HTMLElement): string {
  const v = host
    .querySelector<HTMLElement>('.gantt-tooltip .gantt-tooltip-fill')!
    .style.getPropertyValue('background-color');
  const rgb = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(v);
  return rgb
    ? '#' +
        rgb
          .slice(1)
          .map(n => Number(n).toString(16).padStart(2, '0').toUpperCase())
          .join('')
    : v.toUpperCase();
}

describe('tooltip: follows the row style (phase 10 step 7.1)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rebuilds the open tooltip when its row style changes, not for equal fields in new objects', async () => {
    const render = vi.fn((_ctx: GanttTooltipRenderContext): unknown => null);
    const base: GanttOptions = { viewMode: 'Day', initialScroll: false, tooltip: { render } };
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(Host);
    f.componentInstance.options.set({ ...base, styles: { task: { color: '#0EA5E9' } } });
    await f.whenStable();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const debug = f.debugElement.query(By.css('gantry'));
    const host = debug.nativeElement as HTMLElement;
    const layout = debug.injector.get(GanttLayoutService);
    const change = (apply: () => void) => {
      apply();
      TestBed.tick();
    };

    // Keyboard focus on Alpha's bar opens its tooltip at once
    change(() => layout.focusVisibleBarId.set('a'));
    expect(host.querySelector<HTMLElement>('.gantt-tooltip')!.hidden).toBe(false);
    expect(fillOf(host)).toBe('#0EA5E9');
    expect(render).toHaveBeenCalledTimes(1);

    // Equal styles in new objects: a new resolver, the same fields: nothing built again
    const resolver = layout.rowStyle();
    change(() => f.componentInstance.options.set({ ...base, styles: { task: { color: '#0EA5E9' } } }));
    expect(render).toHaveBeenCalledTimes(1);

    // A new colour for its row (the task object is the same): built again
    change(() => f.componentInstance.options.set({ ...base, styles: { task: { color: '#22C55E' } } }));
    expect(layout.rowStyle()).not.toBe(resolver);
    expect(render).toHaveBeenCalledTimes(2);
    expect(fillOf(host)).toBe('#22C55E');
    expect(host.querySelector<HTMLElement>('.gantt-tooltip')!.hidden).toBe(false);

    // Its own style wins over the kind style
    change(() =>
      f.componentInstance.tasks.update(ts => ts.map(t => (t.id === 'a' ? { ...t, style: { color: '#F97316' } } : t))),
    );
    expect(render).toHaveBeenCalledTimes(3);
    expect(fillOf(host)).toBe('#F97316');

    // Closed: no longer followed
    change(() => layout.focusVisibleBarId.set(null));
    change(() => f.componentInstance.options.set({ ...base, styles: { task: { color: '#8B5CF6' } } }));
    expect(render).toHaveBeenCalledTimes(3);
  });
});
