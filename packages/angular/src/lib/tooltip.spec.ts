// The task tooltip (Gantry 2 phase 7 step 4.1, phase 9 step 4.8): one popover per chart, inside
// <gantry>, with the Web Component's markup (`div.gantt-tooltip` > title + `<dl>` of `dt` / `dd`
// groups) built from the core tooltip model and written as text; opened and closed by core's
// tooltip machine (`reduceTooltip`, with the resolved `options.tooltip`), anchored to its bar by
// core `placeTooltip` (one measurement per opening), closed on drag start and when
// `tooltipEnabled` turns off, its timer cleared with the chart. The chart's tooltip state is
// driven directly (as the canvas pointer handlers do) or through pointer events on the bars.
// Timers are faked (setTimeout only) and the renders flushed with TestBed.tick(); the test DOM has
// no Popover API (the `hidden` attribute alone shows the popover), the Popover API test stubs it.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChildren } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  DEFAULT_FORMATS,
  DEFAULT_LABELS,
  TOOLTIP_HIDE_DELAY,
  TOOLTIP_SHOW_DELAY,
  TaskType,
  buildTooltipModel,
  placeTooltip,
  resolveConfig,
  themeVar,
  type GanttFlatRow,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttCanvasComponent } from './layout/gantt-canvas.component';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttDragService } from './drag/gantt-drag.service';
import { GanttTooltipState } from './tooltip/tooltip-state';

const day = (d: number) => new Date(2026, 0, d);

/** a → b is the critical chain; c is short and independent (float), with its own colour; m is a milestone. */
const PLAN = (): GanttTask[] => [
  { id: 'a', name: 'Task a', start: day(1), end: day(10), progress: 50 },
  { id: 'b', name: 'Task b', start: day(10), end: day(20), progress: 50, dependency: 'a' },
  { id: 'c', name: 'Task c', start: day(2), end: day(4), progress: 25, barColor: '#FDE68A' },
  { id: 'm', name: 'Task m', type: TaskType.Milestone, start: day(15), end: day(15) },
];

@Component({
  imports: [GantryComponent],
  template: `
    <gantry id="one" style="height: 400px" [series]="tasks()" [options]="options()" [tooltipEnabled]="enabled()" />
    @if (second()) {
      <gantry id="two" style="height: 400px" [series]="tasks()" [options]="options()" />
    }
  `,
})
class Host {
  readonly tasks = signal<GanttTask[]>(PLAN());
  readonly options = signal<GanttOptions>({ initialScroll: false, viewMode: 'Day' });
  readonly enabled = signal(true);
  readonly second = signal(false);
  readonly charts = viewChildren(GantryComponent);
}

type Fixture = ComponentFixture<Host>;

async function mount(setup?: (host: Host) => void): Promise<Fixture> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  setup?.(f.componentInstance);
  await f.whenStable();
  // From here on the tooltip timer is driven by hand; renders are flushed with TestBed.tick()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  return f;
}

const chartEl = (f: Fixture, id = 'one') => (f.nativeElement as HTMLElement).querySelector<HTMLElement>(`#${id}`)!;
const tipOf = (f: Fixture, id = 'one') => chartEl(f, id).querySelector<HTMLElement>('.gantt-tooltip');
const barOf = (f: Fixture, task: string, id = 'one') =>
  chartEl(f, id).querySelector<SVGGElement>(`.gantt-bars-layer [data-task-id="${task}"]`)!;
const texts = (tip: HTMLElement, sel: string) => [...tip.querySelectorAll(sel)].map(n => n.textContent);
const children = (tip: HTMLElement) => [...tip.children].map(c => `${c.tagName.toLowerCase()}.${c.className}`);

/** The chart's tooltip state (provided by its canvas) */
function stateOf(f: Fixture, id = 'one'): GanttTooltipState {
  const chart = f.debugElement.query(By.css(`#${id}`));
  return chart.query(By.directive(GanttCanvasComponent)).injector.get(GanttTooltipState);
}
function rowOf(f: Fixture, task: string, id = 'one'): GanttFlatRow {
  return f.debugElement
    .query(By.css(`#${id}`))
    .injector.get(GanttLayoutService)
    .geometryById()
    .get(task)!.row;
}

/** The pointer over `task`'s bar at `x` (what the canvas pointer handler sends) */
function hover(f: Fixture, task: string, x = 100, chart = 'one'): void {
  stateOf(f, chart).hover(rowOf(f, task, chart), barOf(f, task, chart), x);
  TestBed.tick();
}
/** The pointer left the bars */
function unhover(f: Fixture): void {
  stateOf(f).unhover();
  TestBed.tick();
}
function wait(ms: number): void {
  vi.advanceTimersByTime(ms);
  TestBed.tick();
}
/** Hovers `task`'s bar and waits for the tooltip to open */
function open(f: Fixture, task: string, x = 100): HTMLElement {
  hover(f, task, x);
  wait(TOOLTIP_SHOW_DELAY);
  return tipOf(f)!;
}

describe('task tooltip', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is one popover per chart, inside <gantry>, created on the first hover, with the WC markup and its own id', async () => {
    const f = await mount(h => h.second.set(true));
    // Nothing before a hover (a server render has no popover either)
    expect(document.querySelectorAll('.gantt-tooltip')).toHaveLength(0);

    hover(f, 'a');
    hover(f, 'b');
    hover(f, 'a', 10, 'two');
    expect(document.querySelectorAll('.gantt-tooltip')).toHaveLength(2);
    expect(document.body.querySelector(':scope > .gantt-tooltip')).toBeNull();
    for (const id of ['one', 'two']) {
      const tip = tipOf(f, id)!;
      expect(tip.closest('gantry')).toBe(chartEl(f, id));
      expect(chartEl(f, id).querySelectorAll('.gantt-tooltip')).toHaveLength(1);
      expect(tip.tagName).toBe('DIV');
      expect(tip.getAttribute('popover')).toBe('manual');
      expect(tip.getAttribute('role')).toBe('tooltip');
      expect(tip.id).toBe(stateOf(f, id).elementId());
      expect(tip.hidden).toBe(true);
      expect(children(tip)).toEqual(['div.gantt-tooltip-title', 'dl.gantt-tooltip-rows']);
    }
    expect(tipOf(f)!.id).toMatch(/^gantt-tooltip-\d+$/);
    expect(tipOf(f)!.id).not.toBe(tipOf(f, 'two')!.id);
    // The tokens are inherited from the chart, never copied onto the popover
    expect(tipOf(f)!.style.getPropertyValue('--gantt-tooltip-bg')).toBe('');
    expect(chartEl(f).style.getPropertyValue('--gantt-tooltip-bg')).not.toBe('');
  });

  it('opens after the show delay from a pointer move over a bar, with the core model rows as dt / dd text', async () => {
    const f = await mount();
    const gantt = f.componentInstance.charts()[0];
    const v = gantt.getBarVisual('a')!;
    // The canvas' delegated hover (the test DOM maps client to SVG coordinates 1:1)
    barOf(f, 'a').dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerType: 'mouse',
        clientX: v.x + v.width / 2,
        clientY: v.y + v.height / 2,
      }),
    );
    TestBed.tick();
    const tip = tipOf(f)!;
    wait(TOOLTIP_SHOW_DELAY - 1);
    expect(tip.hidden).toBe(true);
    wait(1);
    expect(tip.hidden).toBe(false);

    // The rows of the core model (the status does not depend on the clock: no status row)
    const tasks = PLAN();
    const expected = buildTooltipModel({
      task: tasks[0],
      config: resolveConfig({ viewMode: 'Day' }),
      labels: DEFAULT_LABELS,
      dateFormat: DEFAULT_FORMATS.dateFormat,
      now: day(5),
      tasksById: new Map(tasks.map(t => [t.id, t])),
    });
    expect(tip.querySelector('.gantt-tooltip-title')!.textContent).toBe('Task a');
    expect(texts(tip, 'dl > div > dt')).toEqual(expected.rows.map(r => r.label));
    expect(texts(tip, 'dl > div > dd.gantt-tooltip-value')).toEqual(expected.rows.map(r => r.value));
    expect(texts(tip, 'dl > div > dt')).toEqual([
      DEFAULT_LABELS.ttStart,
      DEFAULT_LABELS.ttEnd,
      DEFAULT_LABELS.ttDuration,
      DEFAULT_LABELS.ttProgress,
      DEFAULT_LABELS.ttSuccessors,
    ]);
    const values = texts(tip, 'dl > div > dd.gantt-tooltip-value');
    expect(values[3]).toBe('50%');
    expect(values[4]).toContain('Task b');
    // Only the progress group has the (decorative) track; the progress reaches the stylesheet as a number
    const progress = tip.querySelector('.gantt-tooltip-row--progress')!;
    expect(progress.classList[0]).toBe('gantt-tooltip-row');
    expect(progress.querySelector('dt')!.textContent).toBe(DEFAULT_LABELS.ttProgress);
    expect(tip.querySelectorAll('.gantt-tooltip-track')).toHaveLength(1);
    expect(tip.querySelector('.gantt-tooltip-track')!.getAttribute('aria-hidden')).toBe('true');
    const fill = tip.querySelector<HTMLElement>('.gantt-tooltip-fill')!;
    expect(fill.style.getPropertyValue('--gantt-tt-progress')).toBe('50');
    expect(fill.style.getPropertyValue('background-color')).toBe(themeVar('barColor'));
    expect(fill.style.getPropertyValue('width')).toBe('');
    // Chrome comes from the stylesheet, the position from a translate
    for (const prop of ['background', 'color', 'left', 'top', 'display']) {
      expect(tip.style.getPropertyValue(prop), prop).toBe('');
    }
  });

  it('takes its delays from options.tooltip, and the hover intent restarts the show delay', async () => {
    const f = await mount(h =>
      h.options.set({ initialScroll: false, viewMode: 'Day', tooltip: { showDelay: 100, hideDelay: 40 } }),
    );
    hover(f, 'a', 100);
    wait(80);
    hover(f, 'a', 110); // still moving over the bar
    wait(80);
    const tip = tipOf(f)!;
    expect(tip.hidden).toBe(true);
    wait(20);
    expect(tip.hidden).toBe(false);
    unhover(f);
    wait(39);
    expect(tip.hidden).toBe(false);
    wait(1);
    expect(tip.hidden).toBe(true);

    // A zero delay opens at once
    f.componentInstance.options.set({ initialScroll: false, viewMode: 'Day', tooltip: { showDelay: 0 } });
    TestBed.tick();
    hover(f, 'b');
    expect(tip.hidden).toBe(false);
    expect(tip.querySelector('.gantt-tooltip-title')!.textContent).toBe('Task b');
  });

  it('switches to another hovered bar at once, keeping row nodes (keyed by kind) and dropping the rows a task lacks', async () => {
    const f = await mount();
    const tip = open(f, 'a');
    const firstRow = tip.querySelector('dl > div')!;
    expect(tip.querySelectorAll('dl > div')).toHaveLength(5);

    hover(f, 'm');
    expect(tip.hidden).toBe(false);
    expect(tip.querySelector('.gantt-tooltip-title')!.textContent).toBe('Task m');
    expect(texts(tip, 'dl > div > dt')).toEqual([DEFAULT_LABELS.ttMilestone]);
    expect(tip.querySelector('dl > div')).toBe(firstRow);
    expect(tip.querySelector('.gantt-tooltip-fill')).toBeNull();

    hover(f, 'c');
    expect(tip.querySelector('dl > div')).toBe(firstRow);
    expect(tip.querySelectorAll('dl > div')).toHaveLength(4);
    expect(tipOf(f)).toBe(tip);
  });

  it('hides after the hide delay unless the pointer comes back; leaving the canvas counts as leaving the bars', async () => {
    const f = await mount();
    const tip = open(f, 'a');
    unhover(f);
    wait(TOOLTIP_HIDE_DELAY - 1);
    expect(tip.hidden).toBe(false);
    hover(f, 'a');
    wait(TOOLTIP_HIDE_DELAY + TOOLTIP_SHOW_DELAY);
    expect(tip.hidden).toBe(false);

    // Leaving the canvas, then moving off again: the first deadline holds
    chartEl(f).querySelector('gantt-canvas svg')!.dispatchEvent(new PointerEvent('pointerleave'));
    TestBed.tick();
    wait(TOOLTIP_HIDE_DELAY - 1);
    unhover(f);
    wait(1);
    expect(tip.hidden).toBe(true);
    // Its last content stays (hidden) for the next opening
    expect(tip.querySelector('.gantt-tooltip-title')!.textContent).toBe('Task a');
  });

  it('writes names and labels as text, never as markup', async () => {
    const name = '<img src=x onerror=alert(1)>';
    const label = '<b onclick="x()">Start</b>';
    const f = await mount(h => {
      h.tasks.set([{ id: 'x', name, start: day(1), end: day(10) }]);
      h.options.set({ initialScroll: false, viewMode: 'Day', labels: { ttStart: label } });
    });
    const tip = open(f, 'x');
    expect(tip.querySelector('img, b, [onerror], [onclick]')).toBeNull();
    expect(tip.querySelector('.gantt-tooltip-title')!.textContent).toBe(name);
    expect(tip.querySelector('dt')!.textContent).toBe(label);
  });

  it('marks the critical path with a class and paints the fill with the model paint', async () => {
    const f = await mount(h => h.options.set({ initialScroll: false, viewMode: 'Day', criticalPath: true }));
    const tip = open(f, 'a');
    expect(tip.classList.contains('gantt-tooltip--critical')).toBe(true);
    expect(texts(tip, 'dt')).toContain(DEFAULT_LABELS.ttCritical);
    let fill = tip.querySelector<HTMLElement>('.gantt-tooltip-fill')!;
    expect(fill.style.getPropertyValue('background-color')).toBe(themeVar('criticalColor'));

    hover(f, 'c');
    expect(tip.classList.contains('gantt-tooltip--critical')).toBe(false);
    expect(tip.classList[0]).toBe('gantt-tooltip');
    fill = tip.querySelector<HTMLElement>('.gantt-tooltip-fill')!;
    expect(fill.style.getPropertyValue('--gantt-tt-progress')).toBe('25');
    expect(['#FDE68A', 'rgb(253, 230, 138)']).toContain(fill.style.getPropertyValue('background-color'));
  });

  it('sits by its bar (core placeTooltip): on the pointer while hovering, centred on focus; one measurement per opening', async () => {
    const f = await mount();
    hover(f, 'b', 10); // creates the popover (still waiting for the show delay)
    stateOf(f).hide();
    TestBed.tick();
    const tip = tipOf(f)!;
    const measure = vi.spyOn(tip, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 100));
    const box = new DOMRect(300, 120, 240, 24);
    const anchor = vi.spyOn(barOf(f, 'a'), 'getBoundingClientRect').mockReturnValue(box);
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const size = { width: 200, height: 100 };
    const at = () => tip.style.getPropertyValue('translate');

    open(f, 'a', 500);
    const hovered = placeTooltip({ anchor: box, pointerX: 500, size, viewport });
    expect(at()).toBe(`${hovered.x}px ${hovered.y}px`);
    expect(hovered.y).toBe(120 + 24 + 8); // below the bar
    // Moving over the same bar does not move it, nor measure again
    hover(f, 'a', 320);
    expect(at()).toBe(`${hovered.x}px ${hovered.y}px`);
    expect(measure).toHaveBeenCalledTimes(1);

    // Keyboard focus: centred on the bar, at once
    stateOf(f).hide();
    TestBed.tick();
    stateOf(f).focus(rowOf(f, 'a'), barOf(f, 'a'));
    TestBed.tick();
    const focused = placeTooltip({ anchor: box, size, viewport });
    expect(at()).toBe(`${focused.x}px ${focused.y}px`);
    expect(focused.x).toBe(300 + 120 - 100);
    expect(measure).toHaveBeenCalledTimes(2);

    // A scroll of the timeline re-reads the bar only
    anchor.mockReturnValue(new DOMRect(300, 60, 240, 24));
    chartEl(f).querySelector('.gantry-canvas-viewport')!.dispatchEvent(new Event('scroll'));
    expect(at()).toBe(`${focused.x}px ${60 + 24 + 8}px`);
    expect(measure).toHaveBeenCalledTimes(2);
    for (const prop of ['left', 'top', 'display']) expect(tip.style.getPropertyValue(prop)).toBe('');
  });

  it('uses the Popover API when the browser has it, once per opening', async () => {
    const showPopover = vi.fn();
    const hidePopover = vi.fn();
    Object.assign(HTMLElement.prototype, { showPopover, hidePopover });
    try {
      const f = await mount();
      open(f, 'a');
      hover(f, 'b');
      expect(showPopover).toHaveBeenCalledTimes(1);
      expect(tipOf(f)!.querySelector('.gantt-tooltip-title')!.textContent).toBe('Task b');
      unhover(f);
      wait(TOOLTIP_HIDE_DELAY);
      stateOf(f).hide();
      TestBed.tick();
      expect(hidePopover).toHaveBeenCalledTimes(1);
    } finally {
      const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
      delete proto['showPopover'];
      delete proto['hidePopover'];
    }
  });

  it('closes when a drag or keyboard move mode starts, and the bar does not reopen it meanwhile', async () => {
    const f = await mount();
    const drag = f.debugElement.query(By.directive(GantryComponent)).injector.get(GanttDragService);
    const tip = open(f, 'a');
    // Keyboard move mode borrows the drag's visuals: the tooltip closes like on a pointer drag start
    expect(drag.startExternal('a')).toBe(true);
    TestBed.tick();
    expect(drag.isActive()).toBe(true);
    expect(tip.hidden).toBe(true);
    expect(stateOf(f).visibleId()).toBeNull();
    // Dismissed: the bar does not reopen it
    hover(f, 'a');
    wait(TOOLTIP_SHOW_DELAY);
    expect(tip.hidden).toBe(true);
    drag.endExternal();
    TestBed.tick();
    // Once the pointer has left the bar, it opens again
    unhover(f);
    open(f, 'a');
    expect(tip.hidden).toBe(false);
  });

  it('closes when tooltipEnabled turns off and ignores the bars while off', async () => {
    const f = await mount();
    const tip = open(f, 'a');
    f.componentInstance.enabled.set(false);
    TestBed.tick();
    expect(tip.hidden).toBe(true);
    hover(f, 'b');
    wait(TOOLTIP_SHOW_DELAY);
    expect(tip.hidden).toBe(true);

    // Disabled while a show was pending: it never opens, not even once enabled again
    f.componentInstance.enabled.set(true);
    TestBed.tick();
    hover(f, 'a');
    f.componentInstance.enabled.set(false);
    TestBed.tick();
    wait(TOOLTIP_SHOW_DELAY);
    expect(tip.hidden).toBe(true);
    f.componentInstance.enabled.set(true);
    TestBed.tick();
    wait(TOOLTIP_SHOW_DELAY);
    expect(tip.hidden).toBe(true);
  });

  it('keeps one timer, cleared when the tooltip resets and when the chart goes away (with its popover)', async () => {
    const f = await mount(h => h.second.set(true));
    const settle = () => vi.advanceTimersByTime(0); // Angular's own render callbacks: what is left are the tooltips'
    settle();
    const idle = vi.getTimerCount();

    // Pending show: one timer however often the pointer moves
    hover(f, 'a', 10, 'two');
    hover(f, 'a', 20, 'two');
    settle();
    expect(vi.getTimerCount()).toBe(idle + 1);
    stateOf(f, 'two').hide();
    expect(vi.getTimerCount()).toBe(idle);

    hover(f, 'a', 10, 'two');
    wait(TOOLTIP_SHOW_DELAY);
    const tip = tipOf(f, 'two')!;
    expect(tip.hidden).toBe(false);
    settle();
    expect(vi.getTimerCount()).toBe(idle);
    // Pending hide (the pointer left the bars), then the chart goes away
    stateOf(f, 'two').unhover();
    TestBed.tick();
    settle();
    expect(vi.getTimerCount()).toBe(idle + 1);
    const state = stateOf(f, 'two');
    f.componentInstance.second.set(false);
    TestBed.tick();
    settle();
    expect(vi.getTimerCount()).toBe(idle);
    expect(tip.isConnected).toBe(false);
    // A destroyed state ignores the pointer
    state.unhover();
    expect(vi.getTimerCount()).toBe(idle);
    // The other chart still works
    expect(open(f, 'b').hidden).toBe(false);
  });
});
