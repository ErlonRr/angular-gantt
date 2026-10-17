// The task tooltip (Gantry 2 phase 7, step 4.1): one popover per chart, inside <gantry>, with the
// Web Component's markup (`div.gantt-tooltip` > title + `<dl>` of `dt` / `dd` groups) built from
// the core tooltip model, written as text, and driven like the Web Component's tooltip layer:
// delegated hover on the canvas, the core show / hide delays, closed on drag start and when
// `tooltipEnabled` turns off, timers cleared with the chart. Timers are faked (setTimeout only) and
// the renders flushed with TestBed.tick(); the test DOM has no Popover API (the `hidden`
// attribute alone shows the popover), the Popover API test stubs it.
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
  resolveConfig,
  themeVar,
  type GanttOptions,
  type GanttTask,
} from '@gantry/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttDragService } from './drag/gantt-drag.service';

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
  // From here on the hover timers are driven by hand; renders are flushed with TestBed.tick()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  return f;
}

const chartEl = (f: Fixture, id = 'one') => (f.nativeElement as HTMLElement).querySelector<HTMLElement>(`#${id}`)!;
const tipOf = (f: Fixture, id = 'one') => chartEl(f, id).querySelector<HTMLElement>('.gantt-tooltip');
const barOf = (f: Fixture, task: string, id = 'one') =>
  chartEl(f, id).querySelector<SVGGElement>(`.gantt-bars-layer [data-task-id="${task}"]`)!;
const texts = (tip: HTMLElement, sel: string) => [...tip.querySelectorAll(sel)].map(n => n.textContent);

/** Pointer move over `task`'s bar (the canvas delegates hover from the <svg>) */
function hover(f: Fixture, task: string, x = 100, y = 100, chart = 'one'): void {
  barOf(f, task, chart).dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y }));
  TestBed.tick();
}
/** Pointer move over the canvas outside the bars */
function moveOff(f: Fixture): void {
  chartEl(f)
    .querySelector('.gantt-rows')!
    .dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
  TestBed.tick();
}
function wait(ms: number): void {
  vi.advanceTimersByTime(ms);
  TestBed.tick();
}
/** Hovers `task`'s bar and waits for the tooltip to open */
function open(f: Fixture, task: string, x = 100, y = 100): HTMLElement {
  hover(f, task, x, y);
  wait(TOOLTIP_SHOW_DELAY);
  return tipOf(f)!;
}

describe('task tooltip', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is one popover per chart, inside <gantry>, created on the first hover, with the WC markup', async () => {
    const f = await mount(h => h.second.set(true));
    // Nothing before a hover (a server render has no popover either)
    expect(document.querySelectorAll('.gantt-tooltip')).toHaveLength(0);

    hover(f, 'a');
    hover(f, 'b');
    hover(f, 'a', 10, 10, 'two');
    expect(document.querySelectorAll('.gantt-tooltip')).toHaveLength(2);
    expect(document.body.querySelector(':scope > .gantt-tooltip')).toBeNull();
    for (const id of ['one', 'two']) {
      const tip = tipOf(f, id)!;
      expect(tip.closest('gantry')).toBe(chartEl(f, id));
      expect(chartEl(f, id).querySelectorAll('.gantt-tooltip')).toHaveLength(1);
      expect(tip.tagName).toBe('DIV');
      expect(tip.getAttribute('popover')).toBe('manual');
      expect(tip.getAttribute('role')).toBe('tooltip');
      expect(tip.hidden).toBe(true);
      expect([...tip.children].map(c => `${c.tagName.toLowerCase()}.${c.className}`)).toEqual([
        'div.gantt-tooltip-title',
        'dl.gantt-tooltip-rows',
      ]);
    }
    // The tokens are inherited from the chart, never copied onto the popover
    expect(tipOf(f)!.style.getPropertyValue('--gantt-tooltip-bg')).toBe('');
    expect(chartEl(f).style.getPropertyValue('--gantt-tooltip-bg')).not.toBe('');
  });

  it('opens after the show delay with the core model rows as dt / dd text and the progress fill', async () => {
    const f = await mount();
    hover(f, 'a');
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

  it('moving to another bar while open keeps it open and swaps the content after the show delay, keeping row nodes', async () => {
    const f = await mount();
    const tip = open(f, 'a');
    const firstRow = tip.querySelector('dl > div')!;
    expect(tip.querySelectorAll('dl > div')).toHaveLength(5);

    hover(f, 'm');
    // Same delay as the Web Component (hover intent); the open tooltip stays up meanwhile
    wait(TOOLTIP_SHOW_DELAY - 1);
    expect(tip.hidden).toBe(false);
    expect(tip.querySelector('.gantt-tooltip-title')!.textContent).toBe('Task a');
    wait(1);
    expect(tip.hidden).toBe(false);
    expect(tip.querySelector('.gantt-tooltip-title')!.textContent).toBe('Task m');
    expect(texts(tip, 'dl > div > dt')).toEqual([DEFAULT_LABELS.ttMilestone]);
    expect(tip.querySelector('dl > div')).toBe(firstRow);
    expect(tip.querySelector('.gantt-tooltip-fill')).toBeNull();

    hover(f, 'c');
    wait(TOOLTIP_SHOW_DELAY);
    expect(tip.querySelector('dl > div')).toBe(firstRow);
    expect(tip.querySelectorAll('dl > div')).toHaveLength(4);
    expect(tipOf(f)).toBe(tip);
  });

  it('hides after the hide delay unless the pointer comes back', async () => {
    const f = await mount();
    const tip = open(f, 'a');
    moveOff(f);
    wait(TOOLTIP_HIDE_DELAY - 1);
    expect(tip.hidden).toBe(false);
    hover(f, 'a');
    wait(TOOLTIP_HIDE_DELAY + TOOLTIP_SHOW_DELAY);
    expect(tip.hidden).toBe(false);

    // Leaving the canvas, then moving off again: the first deadline holds
    chartEl(f).querySelector('svg')!.dispatchEvent(new PointerEvent('pointerleave'));
    TestBed.tick();
    wait(TOOLTIP_HIDE_DELAY - 1);
    moveOff(f);
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
    wait(TOOLTIP_SHOW_DELAY);
    expect(tip.classList.contains('gantt-tooltip--critical')).toBe(false);
    expect(tip.classList[0]).toBe('gantt-tooltip');
    fill = tip.querySelector<HTMLElement>('.gantt-tooltip-fill')!;
    expect(fill.style.getPropertyValue('--gantt-tt-progress')).toBe('25');
    expect(['#FDE68A', 'rgb(253, 230, 138)']).toContain(fill.style.getPropertyValue('background-color'));
  });

  it('follows the pointer with a translate, flips at the viewport edges, and measures once per content', async () => {
    const f = await mount();
    hover(f, 'a');
    const tip = tipOf(f)!;
    const measure = vi.spyOn(tip, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 100));
    wait(TOOLTIP_SHOW_DELAY);
    expect(tip.style.getPropertyValue('translate')).toBe('112px 108px');

    const view = document.defaultView!;
    const x = view.innerWidth - 50;
    const y = view.innerHeight - 20;
    hover(f, 'a', x, y);
    expect(tip.style.getPropertyValue('translate')).toBe(`${x - 200 - 12}px ${y - 100 - 8}px`);
    // Never closer than 8px to the top-left corner
    hover(f, 'a', -40, -40);
    expect(tip.style.getPropertyValue('translate')).toBe('8px 8px');
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it('uses the Popover API when the browser has it, once per opening', async () => {
    const showPopover = vi.fn();
    const hidePopover = vi.fn();
    Object.assign(HTMLElement.prototype, { showPopover, hidePopover });
    try {
      const f = await mount();
      open(f, 'a');
      hover(f, 'b');
      wait(TOOLTIP_SHOW_DELAY);
      expect(showPopover).toHaveBeenCalledTimes(1);
      expect(tipOf(f)!.querySelector('.gantt-tooltip-title')!.textContent).toBe('Task b');
      moveOff(f);
      wait(TOOLTIP_HIDE_DELAY);
      moveOff(f);
      wait(TOOLTIP_HIDE_DELAY);
      expect(hidePopover).toHaveBeenCalledTimes(1);
    } finally {
      const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
      delete proto['showPopover'];
      delete proto['hidePopover'];
    }
  });

  it('closes on drag start and stays closed during the drag', async () => {
    const f = await mount();
    const gantt = f.componentInstance.charts()[0];
    const drag = f.debugElement.query(By.directive(GantryComponent)).injector.get(GanttDragService);
    const tip = open(f, 'a');
    // Pointer down on the bar starts a drag (the test DOM maps client to SVG coordinates 1:1)
    const v = gantt.getBarVisual('a')!;
    chartEl(f)
      .querySelector('svg')!
      .dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          clientX: v.x + v.width / 2,
          clientY: v.y + v.height / 2,
        }),
      );
    TestBed.tick();
    expect(drag.isDragging()).toBe(true);
    expect(tip.hidden).toBe(true);
    // No tooltip during the drag
    hover(f, 'b');
    wait(TOOLTIP_SHOW_DELAY);
    expect(tip.hidden).toBe(true);
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

  it('destroying the chart clears both timers and removes the popover', async () => {
    const f = await mount(h => h.second.set(true));
    const settle = () => vi.advanceTimersByTime(0); // Angular's own render callbacks: what is left are the tooltips'
    settle();
    const idle = vi.getTimerCount();

    // Pending show
    hover(f, 'a', 10, 10, 'two');
    settle();
    expect(vi.getTimerCount()).toBe(idle + 1);
    wait(TOOLTIP_SHOW_DELAY);
    const tip = tipOf(f, 'two')!;
    expect(tip.hidden).toBe(false);
    // Pending hide (the pointer left the bars), then the chart goes away
    chartEl(f, 'two').querySelector('svg')!.dispatchEvent(new PointerEvent('pointerleave'));
    TestBed.tick();
    settle();
    expect(vi.getTimerCount()).toBe(idle + 1);
    f.componentInstance.second.set(false);
    TestBed.tick();
    settle();
    expect(vi.getTimerCount()).toBe(idle);
    expect(tip.isConnected).toBe(false);
    // The other chart still works
    expect(open(f, 'b').hidden).toBe(false);
  });
});
