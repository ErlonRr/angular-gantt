// The task tooltip after Gantry 2 phase 10 step 4.10 (the Web Component's step 4.4): the open
// tooltip follows its row — built again (the template's context and `options.tooltip.render`
// included), measured and placed again only for a new task object, critical flag or i18n bundle,
// never on a clock tick; the progress colour is the row's resolved style (`layout.rowStyle()`, the
// one its bar is painted with; the task's own when a `styles.rule` throws); a keyboard focus made
// before the chart's first render, or before its bar is mounted, opens once the bar is there.
// Timers are faked (setTimeout only) and the renders flushed with TestBed.tick().
import { afterEach, describe, it, expect, vi } from 'vitest';
import { Component, Directive, inject, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  TaskType,
  placeTooltip,
  themeVar,
  type GanttFlatRow,
  type GanttOptions,
  type GanttTask,
  type GanttTooltipRenderContext,
  type StyleResolver,
  type TooltipModel,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttCanvasComponent } from './layout/gantt-canvas.component';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttTooltipState } from './tooltip/tooltip-state';
import { GanttTooltipComponent } from './tooltip/gantt-tooltip.component';
import { GanttTooltipTemplateDirective } from './tooltip/gantt-tooltip-template.directive';

const day = (d: number) => new Date(2026, 2, d);
/** Beta follows Alpha (the critical chain once the critical path is on); Root is independent; Gate a milestone */
const TASKS = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(9), progress: 50 },
  { id: 'b', name: 'Beta', start: day(9), end: day(20), progress: 20, dependency: 'a' },
  { id: 'r', name: 'Root', start: day(3), end: day(6), progress: 10, barColor: '#FDE68A' },
  { id: 'm', name: 'Gate', start: day(16), end: day(16), type: TaskType.Milestone },
];
const DAY: GanttOptions = { viewMode: 'Day', initialScroll: false };

/** The task a content directive focuses (keyboard modality) while the chart is created, before its first render */
let earlyFocus: string | null = null;

@Directive({ selector: '[focusBeforeRender]' })
class FocusBeforeRender {
  constructor() {
    if (earlyFocus !== null) inject(GanttLayoutService).focusVisibleBarId.set(earlyFocus);
  }
}

@Component({
  imports: [GantryComponent, GanttTooltipTemplateDirective, FocusBeforeRender],
  template: `
    <gantry id="one" style="height: 400px" [series]="tasks()" [options]="options()">
      <span focusBeforeRender></span>
      @if (custom()) {
        <ng-template ganttTooltip let-model let-task="task">
          <strong class="mine">{{ task.name }}</strong>
        </ng-template>
      }
    </gantry>
  `,
})
class Host {
  readonly tasks = signal<GanttTask[]>(TASKS());
  readonly options = signal<GanttOptions>(DAY);
  readonly custom = signal(false);
  readonly gantt = viewChild.required(GantryComponent);
}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  host: HTMLElement;
  layout: GanttLayoutService;
  state: GanttTooltipState;
  tip(): HTMLElement;
  bar(id: string): SVGGElement;
  row(id: string): GanttFlatRow;
  hover(id: string, x?: number): void;
}

async function mount(setup?: (host: Host) => void): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  setup?.(f.componentInstance);
  await f.whenStable();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const chart = f.debugElement.query(By.css('#one'));
  const host = chart.nativeElement as HTMLElement;
  const layout = chart.injector.get(GanttLayoutService);
  const state = chart.query(By.directive(GanttCanvasComponent)).injector.get(GanttTooltipState);
  const c: Chart = {
    f,
    h: f.componentInstance,
    host,
    layout,
    state,
    tip: () => host.querySelector<HTMLElement>('.gantt-tooltip')!,
    bar: id => host.querySelector<SVGGElement>(`.gantt-bars-layer [data-task-id="${id}"]`)!,
    row: id => layout.geometryById().get(id)!.row,
    hover(id, x = 50) {
      state.hover(c.row(id), c.bar(id), x);
      TestBed.tick();
    },
  };
  return c;
}

/** Keyboard focus reached a bar (what the keyboard model writes), or left the bars (`null`) */
function keyboardFocus(c: Chart, id: string | null): void {
  c.layout.focusVisibleBarId.set(id);
  TestBed.tick();
}
function change(apply: () => void): void {
  apply();
  TestBed.tick();
}
const title = (c: Chart) => c.tip().querySelector('.gantt-tooltip-title')?.textContent;
const values = (c: Chart) => [...c.tip().querySelectorAll('dd.gantt-tooltip-value')].map(n => n.textContent);
/** The fill's paint, hex colours in upper case (the test DOM may hand back `rgb()`) */
function fillOf(c: Chart): string {
  const v = c.tip().querySelector<HTMLElement>('.gantt-tooltip-fill')!.style.getPropertyValue('background-color');
  const rgb = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(v);
  return rgb
    ? '#' +
        rgb
          .slice(1)
          .map(n => Number(n).toString(16).padStart(2, '0').toUpperCase())
          .join('')
    : v.toUpperCase();
}

describe('tooltip refresh, row style and early focus (phase 10)', () => {
  afterEach(() => {
    earlyFocus = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('takes the progress colour from the row style its bar is painted with: styles, then task.style; critical wins', async () => {
    const c = await mount(h => {
      const tasks = TASKS();
      tasks[1] = { ...tasks[1], style: { color: '#22C55E' } };
      h.tasks.set(tasks);
      h.options.set({ ...DAY, styles: { task: { color: '#0EA5E9' } } });
    });
    keyboardFocus(c, 'a');
    expect(fillOf(c)).toBe('#0EA5E9');
    // The bar's own style is the same
    expect(c.layout.rowStyle()(c.row('a')).color).toBe('#0EA5E9');
    keyboardFocus(c, 'b');
    expect(fillOf(c)).toBe('#22C55E');
    // The deprecated flat field still beats a kind style
    keyboardFocus(c, 'r');
    expect(fillOf(c)).toBe('#FDE68A');

    change(() => c.h.options.set({ ...DAY, criticalPath: true, styles: { task: { color: '#0EA5E9' } } }));
    keyboardFocus(c, 'b');
    expect(c.tip().classList.contains('gantt-tooltip--critical')).toBe(true);
    expect(c.tip().querySelector<HTMLElement>('.gantt-tooltip-fill')!.style.getPropertyValue('background-color')).toBe(
      themeVar('criticalColor'),
    );
  });

  it('falls back to the task’s own style when the row style throws (a styles.rule that throws)', async () => {
    const c = await mount(h => h.options.set({ ...DAY, styles: { task: { color: '#0EA5E9' } } }));
    c.hover('a'); // creates the popover
    c.state.hide();
    TestBed.tick();
    // The content is built while the resolver throws (no render in between: the bars would throw too)
    const tooltip = c.f.debugElement.query(By.directive(GanttTooltipComponent)).componentInstance as unknown as {
      openView(): { model: TooltipModel } | null;
    };
    const rowStyle = c.layout.rowStyle;
    const throwing: StyleResolver = () => {
      throw new Error('rule');
    };
    Object.defineProperty(c.layout, 'rowStyle', { configurable: true, writable: true, value: () => throwing });
    try {
      c.state.focus(c.row('a'), c.bar('a'));
      // Alpha has no colour of its own: the theme's bar colour, not the kind style's
      expect(tooltip.openView()?.model.paint.progress).toBe(themeVar('barColor'));
    } finally {
      Object.defineProperty(c.layout, 'rowStyle', { configurable: true, writable: true, value: rowStyle });
    }
    TestBed.tick();
    expect(c.tip().hidden).toBe(false);
    expect(title(c)).toBe('Alpha');
    // Built while the swapped resolver (no signal) threw: nothing tells the source to follow it back
    expect(c.tip().querySelector<HTMLElement>('.gantt-tooltip-fill')!.style.getPropertyValue('background-color')).toBe(
      themeVar('barColor'),
    );
    // The next opening reads the row style again
    keyboardFocus(c, 'b');
    expect(fillOf(c)).toBe('#0EA5E9');
  });

  it('builds the open tooltip again when its task object, critical flag or labels change, not on clock ticks', async () => {
    const render = vi.fn((_ctx: GanttTooltipRenderContext): unknown => null);
    const options: GanttOptions = { ...DAY, tooltip: { render } };
    const c = await mount(h => h.options.set(options));
    keyboardFocus(c, 'b');
    expect(render).toHaveBeenCalledTimes(1);
    expect(title(c)).toBe('Beta');

    // The clock: nothing built again (statuses are read at the next opening)
    change(() => c.layout.now.set(new Date(2026, 2, 12, 10).getTime()));
    change(() => c.layout.now.set(new Date(2026, 2, 13, 11).getTime()));
    // Other tasks, an equal options object: the same task, flag and labels
    const renamed = c.h.tasks().map(t => (t.id === 'r' ? { ...t, name: 'Root 2' } : t));
    change(() => c.h.tasks.set(renamed));
    change(() => c.h.options.set({ ...options }));
    expect(render).toHaveBeenCalledTimes(1);
    // ...nor a new render function alone (a framework re-render may pass a new one every time)
    const next = vi.fn((_ctx: GanttTooltipRenderContext): unknown => null);
    change(() => c.h.options.set({ ...DAY, tooltip: { render: next } }));
    expect(render).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
    expect(c.tip().hidden).toBe(false);

    // Its task object: built again, with the row as the chart has it now
    change(() => c.h.tasks.set(renamed.map(t => (t.id === 'b' ? { ...t, name: 'Beta 2', progress: 60 } : t))));
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({ task: { name: 'Beta 2' } });
    expect(next.mock.calls[0][0].row).toBe(c.row('b'));
    expect(title(c)).toBe('Beta 2');
    expect(values(c)).toContain('60%');
    expect(c.tip().hidden).toBe(false);
    expect(c.bar('b').getAttribute('aria-describedby')).toBe(c.tip().id);

    // The critical flag
    change(() => c.h.options.set({ ...DAY, tooltip: { render: next }, criticalPath: true }));
    expect(c.layout.criticalIds().has('b')).toBe(true);
    expect(next).toHaveBeenCalledTimes(2);
    expect(c.tip().classList.contains('gantt-tooltip--critical')).toBe(true);

    // The labels
    change(() =>
      c.h.options.set({ ...DAY, tooltip: { render: next }, criticalPath: true, labels: { ttStart: 'From' } }),
    );
    expect(next).toHaveBeenCalledTimes(3);
    expect(c.tip().querySelector('dt')!.textContent).toBe('From');
    change(() => c.layout.now.set(new Date(2026, 2, 14).getTime()));
    expect(next).toHaveBeenCalledTimes(3);

    // Closed: no longer followed
    keyboardFocus(c, null);
    change(() => c.h.tasks.set(c.h.tasks().map(t => (t.id === 'b' ? { ...t, name: 'Beta 3' } : t))));
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('keeps the template content on clock ticks and rebuilds its context when the task changes', async () => {
    const c = await mount(h => h.custom.set(true));
    keyboardFocus(c, 'a');
    const mine = c.tip().querySelector('.mine')!;
    expect(mine.textContent).toBe('Alpha');
    change(() => c.layout.now.set(new Date(2026, 2, 12, 10).getTime()));
    expect(c.tip().querySelector('.mine')).toBe(mine);
    change(() => c.h.tasks.set(c.h.tasks().map(t => (t.id === 'a' ? { ...t, name: 'Alpha 2' } : t))));
    expect(c.tip().querySelector('.mine')!.textContent).toBe('Alpha 2');
  });

  it('measures and places the tooltip again after a refresh, by its bar as it is then; a clock tick measures nothing', async () => {
    const c = await mount();
    keyboardFocus(c, 'a');
    keyboardFocus(c, null);
    const tip = c.tip();
    const size = { width: 200, height: 100 };
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const measure = vi.spyOn(tip, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 100));
    const box = new DOMRect(300, 120, 240, 24);
    const anchor = vi.spyOn(c.bar('a'), 'getBoundingClientRect').mockReturnValue(box);
    const at = () => tip.style.getPropertyValue('translate');
    const placed = (anchor: DOMRect) => {
      const p = placeTooltip({ anchor, size, viewport });
      return `${p.x}px ${p.y}px`;
    };

    keyboardFocus(c, 'a');
    expect(measure).toHaveBeenCalledTimes(1);
    expect(at()).toBe(placed(box));
    // A clock tick: nothing measured or placed
    change(() => c.layout.now.set(new Date(2026, 2, 12, 10).getTime()));
    expect(measure).toHaveBeenCalledTimes(1);

    // New dates: the content is written, then measured once and placed by the bar where it now is
    const moved = new DOMRect(360, 120, 300, 24);
    anchor.mockReturnValue(moved);
    measure.mockReturnValue(new DOMRect(0, 0, 220, 100));
    change(() => c.h.tasks.set(c.h.tasks().map(t => (t.id === 'a' ? { ...t, end: day(12) } : t))));
    expect(measure).toHaveBeenCalledTimes(2);
    const p = placeTooltip({ anchor: moved, size: { width: 220, height: 100 }, viewport });
    expect(at()).toBe(`${p.x}px ${p.y}px`);
    expect(tip.hidden).toBe(false);
  });

  it('a keyboard focus before the first render opens the tooltip once that render is done', async () => {
    earlyFocus = 'a';
    const c = await mount();
    expect(c.layout.focusVisibleBarId()).toBe('a');
    expect(c.tip().hidden).toBe(false);
    expect(title(c)).toBe('Alpha');
    expect(c.state.source()).toBe('focus');
    expect(c.bar('a').getAttribute('aria-describedby')).toBe(c.tip().id);
  });

  it('a keyboard focus on a bar not mounted yet opens once it is, unless focus moved on; then follows nothing more', async () => {
    const c = await mount(h => h.tasks.set(TASKS().filter(t => t.id !== 'r')));
    const focus = vi.spyOn(c.state, 'focus');
    keyboardFocus(c, 'r');
    expect(focus).not.toHaveBeenCalled();
    expect(c.state.visibleId()).toBeNull();
    // Its row arrives: the render mounts its bar, then the tooltip opens
    change(() => c.h.tasks.set(TASKS()));
    expect(focus).toHaveBeenCalledTimes(1);
    expect(c.state.visibleId()).toBe('r');
    expect(c.tip().hidden).toBe(false);
    expect(title(c)).toBe('Root');
    // Opened: other row changes focus nothing again (Escape's dismiss holds)
    c.state.dismiss();
    TestBed.tick();
    change(() => c.h.tasks.set(c.h.tasks().map(t => (t.id === 'a' ? { ...t, name: 'Alpha 2' } : t))));
    expect(focus).toHaveBeenCalledTimes(1);
    expect(c.state.visibleId()).toBeNull();

    // Focus moved on before the bar came: nothing opens when it does
    keyboardFocus(c, null);
    change(() => c.h.tasks.set(TASKS().filter(t => t.id !== 'm')));
    keyboardFocus(c, 'm');
    keyboardFocus(c, null);
    change(() => c.h.tasks.set(TASKS()));
    expect(focus).toHaveBeenCalledTimes(1);
    expect(c.state.visibleId()).toBeNull();
  });
});
