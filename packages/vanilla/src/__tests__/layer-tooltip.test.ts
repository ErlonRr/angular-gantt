// The tooltip layer (Gantry 2 phase 6, step 2.4): one popover built once, its `<dl>` rows written
// through textContent and keyed by kind, the critical path as a class, progress and position
// through the CSSOM, and both timers cleared on hide() / destroy(). The layer is driven directly
// (as `interaction/canvas-pointer.ts` does), so these tests never depend on the bar painter.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_LABELS, TaskType, themeVar, type GanttFlatRow, type GanttTask } from '@gantry/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { TOOLTIP_HIDE_DELAY, TOOLTIP_SHOW_DELAY } from '../layers/tooltip';
import { TOOLTIP_CSS } from '../styles/tooltip.css';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();

function task(id: string, start: string, end: string, extra: Partial<GanttTask> = {}): GanttTask {
  return { id, name: `Task ${id}`, start: new Date(start), end: new Date(end), progress: 50, ...extra };
}

/** a → b is the critical chain; c is short and independent (float), with its own colour; m is a milestone. */
const PLAN = (): GanttTask[] => [
  task('a', '2026-01-01', '2026-01-10'),
  task('b', '2026-01-10', '2026-01-20', { dependency: 'a' }),
  task('c', '2026-01-02', '2026-01-04', { progress: 25, barColor: '#FDE68A' }),
  task('m', '2026-01-15', '2026-01-15', { type: TaskType.Milestone }),
];

function mount(props: Partial<Pick<GantryElement, 'tasks' | 'options'>> = {}): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, props);
  document.body.appendChild(el);
  flush(el);
  return el;
}

const tipOf = (el: GantryElement) => el.shadowRoot!.querySelector<HTMLElement>('.gantt-tooltip')!;
const layerOf = (el: GantryElement) => getEngine(el).layers.tooltip;
const rowOf = (el: GantryElement, id: string): GanttFlatRow =>
  getEngine(el)
    .graph.allRows.peek()
    .find(r => r.task.id === id)!;
const at = (x: number, y: number) => new PointerEvent('pointermove', { clientX: x, clientY: y });

/** Hovers `id`'s bar and waits for the tooltip to open. */
function open(el: GantryElement, id: string, x = 100, y = 100): HTMLElement {
  layerOf(el).enter(rowOf(el, id), at(x, y));
  vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY);
  return tipOf(el);
}

const texts = (tip: HTMLElement, sel: string) => [...tip.querySelectorAll(sel)].map(n => n.textContent);

describe('tooltip layer', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    el?.remove();
    vi.useRealTimers();
  });

  it('builds one hidden popover once, with a title and a <dl>', () => {
    el = mount({ tasks: PLAN() });
    const tips = el.shadowRoot!.querySelectorAll('.gantt-tooltip');
    expect(tips).toHaveLength(1);
    const tip = tipOf(el);
    expect(tip.tagName).toBe('DIV');
    expect(tip.getAttribute('popover')).toBe('manual');
    expect(tip.getAttribute('role')).toBe('tooltip');
    expect(tip.hidden).toBe(true);
    expect([...tip.children].map(c => `${c.tagName.toLowerCase()}.${c.className}`)).toEqual([
      'div.gantt-tooltip-title',
      'dl.gantt-tooltip-rows',
    ]);

    const title = tip.querySelector('.gantt-tooltip-title');
    const list = tip.querySelector('dl');
    open(el, 'a');
    open(el, 'm');
    el.options = { rowHeight: 40 };
    flush(el);
    open(el, 'c');
    expect(tipOf(el)).toBe(tip);
    expect(tip.querySelector('.gantt-tooltip-title')).toBe(title);
    expect(tip.querySelector('dl')).toBe(list);
  });

  it('opens after the hover delay and lists the model rows as dt / dd text', () => {
    el = mount({ tasks: PLAN() });
    const tip = tipOf(el);
    layerOf(el).enter(rowOf(el, 'a'), at(100, 100));
    vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY - 1);
    expect(tip.hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(tip.hidden).toBe(false);

    expect(tip.querySelector('.gantt-tooltip-title')!.textContent).toBe('Task a');
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
    // Only the progress group has the (decorative) track
    expect(tip.querySelectorAll('.gantt-tooltip-track')).toHaveLength(1);
    expect(tip.querySelector('.gantt-tooltip-track')!.getAttribute('aria-hidden')).toBe('true');
    expect(tip.querySelector('.gantt-tooltip-row--progress dt')!.textContent).toBe(DEFAULT_LABELS.ttProgress);
  });

  it('keeps row nodes from one task to the next (keyed by kind) and drops the rows a task lacks', () => {
    el = mount({ tasks: PLAN() });
    const tip = open(el, 'a');
    const firstDate = tip.querySelector('dl > div')!;
    expect(tip.querySelectorAll('dl > div')).toHaveLength(5);

    open(el, 'm');
    expect(texts(tip, 'dl > div > dt')).toEqual([DEFAULT_LABELS.ttMilestone]);
    expect(tip.querySelector('dl > div')).toBe(firstDate);
    expect(tip.querySelector('.gantt-tooltip-fill')).toBeNull();

    open(el, 'c');
    expect(tip.querySelector('dl > div')).toBe(firstDate);
    expect(tip.querySelectorAll('dl > div')).toHaveLength(4);
  });

  it('writes names and labels as text, never as markup', () => {
    const name = '<img src=x onerror=alert(1)>';
    const label = '<b onclick="x()">Start</b>';
    el = mount({
      tasks: [task('x', '2026-01-01', '2026-01-10', { name })],
      options: { labels: { ttStart: label } },
    });
    const tip = open(el, 'x');
    expect(tip.querySelector('img, b, [onerror], [onclick]')).toBeNull();
    expect(tip.querySelector('.gantt-tooltip-title')!.textContent).toBe(name);
    expect(tip.querySelector('dt')!.textContent).toBe(label);
  });

  it('marks the critical path with a class and paints the progress through the CSSOM', () => {
    el = mount({ tasks: PLAN(), options: { criticalPath: true } });
    const tip = open(el, 'a');
    expect(tip.classList.contains('gantt-tooltip--critical')).toBe(true);
    expect(texts(tip, 'dt')).toContain(DEFAULT_LABELS.ttCritical);
    let fill = tip.querySelector<HTMLElement>('.gantt-tooltip-fill')!;
    expect(fill.style.getPropertyValue('--gantt-tt-progress')).toBe('50');
    expect(fill.style.getPropertyValue('background-color')).toBe(themeVar('criticalColor'));
    expect(fill.style.getPropertyValue('width')).toBe('');

    open(el, 'c');
    expect(tip.classList.contains('gantt-tooltip--critical')).toBe(false);
    fill = tip.querySelector<HTMLElement>('.gantt-tooltip-fill')!;
    expect(fill.style.getPropertyValue('--gantt-tt-progress')).toBe('25');
    expect(fill.style.getPropertyValue('background-color').toUpperCase()).toBe('#FDE68A');
    // The stylesheet turns the number into the fill width
    expect(TOOLTIP_CSS).toContain('inline-size: calc(var(--gantt-tt-progress, 0) * 1%)');
  });

  it('follows the pointer with a CSSOM translate and flips at the viewport edges', () => {
    el = mount({ tasks: PLAN() });
    const tip = tipOf(el);
    const measure = vi.spyOn(tip, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 100));
    open(el, 'a', 100, 100);
    expect(tip.style.getPropertyValue('translate')).toBe('112px 108px');

    const x = window.innerWidth - 50;
    const y = window.innerHeight - 20;
    layerOf(el).move(at(x, y));
    expect(tip.style.getPropertyValue('translate')).toBe(`${x - 200 - 12}px ${y - 100 - 8}px`);
    // Never closer than 8px to the top-left corner
    layerOf(el).move(at(-40, -40));
    expect(tip.style.getPropertyValue('translate')).toBe('8px 8px');
    // Measured once when it opened, not on every move
    expect(measure).toHaveBeenCalledTimes(1);
    for (const prop of ['left', 'top', 'display']) expect(tip.style.getPropertyValue(prop)).toBe('');
  });

  it('hides after the leave delay unless the pointer comes back', () => {
    el = mount({ tasks: PLAN() });
    const layer = layerOf(el);
    const tip = open(el, 'a');
    layer.leave();
    vi.advanceTimersByTime(TOOLTIP_HIDE_DELAY - 1);
    expect(tip.hidden).toBe(false);
    layer.enter(rowOf(el, 'a'), at(100, 100));
    vi.advanceTimersByTime(TOOLTIP_HIDE_DELAY + TOOLTIP_SHOW_DELAY);
    expect(tip.hidden).toBe(false);
    layer.leave();
    layer.leave();
    vi.advanceTimersByTime(TOOLTIP_HIDE_DELAY);
    expect(tip.hidden).toBe(true);
  });

  it('clears both timers on hide() and destroy()', () => {
    el = mount({ tasks: PLAN() });
    const layer = layerOf(el);
    const idle = vi.getTimerCount();

    layer.enter(rowOf(el, 'a'), at(10, 10));
    expect(vi.getTimerCount()).toBe(idle + 1);
    layer.hide();
    expect(vi.getTimerCount()).toBe(idle);
    vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY);
    expect(tipOf(el).hidden).toBe(true);

    open(el, 'a');
    layer.leave();
    expect(vi.getTimerCount()).toBe(idle + 1);
    layer.hide();
    expect(vi.getTimerCount()).toBe(idle);
    expect(tipOf(el).hidden).toBe(true);

    open(el, 'a');
    layer.leave();
    layer.enter(rowOf(el, 'b'), at(10, 10));
    const tip = tipOf(el);
    layer.destroy();
    expect(vi.getTimerCount()).toBe(idle);
    expect(tip.isConnected).toBe(false);
    expect(tip.hidden).toBe(true);
    // A destroyed layer ignores the pointer
    layer.enter(rowOf(el, 'a'), at(10, 10));
    layer.move(at(20, 20));
    layer.leave();
    expect(vi.getTimerCount()).toBe(idle);
  });

  it('uses the Popover API when the browser has it, once per opening', () => {
    el = mount({ tasks: PLAN() });
    const tip = tipOf(el);
    const showPopover = vi.fn();
    const hidePopover = vi.fn();
    Object.assign(tip, { showPopover, hidePopover });
    open(el, 'a');
    open(el, 'b');
    expect(showPopover).toHaveBeenCalledTimes(1);
    expect(tip.querySelector('.gantt-tooltip-title')!.textContent).toBe('Task b');
    layerOf(el).hide();
    layerOf(el).hide();
    expect(hidePopover).toHaveBeenCalledTimes(1);
  });

  it('closes when tooltipEnabled turns off and when the element leaves the document', () => {
    el = mount({ tasks: PLAN() });
    const tip = open(el, 'a');
    el.tooltipEnabled = false;
    expect(tip.hidden).toBe(true);
    // Disabled while a show was pending: it never opens
    el.tooltipEnabled = true;
    layerOf(el).enter(rowOf(el, 'a'), at(10, 10));
    el.tooltipEnabled = false;
    vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY);
    expect(tip.hidden).toBe(true);

    el.tooltipEnabled = true;
    open(el, 'a');
    const idle = vi.getTimerCount();
    layerOf(el).leave();
    el.remove();
    expect(tip.hidden).toBe(true);
    expect(vi.getTimerCount()).toBe(idle);
  });

  it('opening reads the graph without subscribing: no region re-runs', () => {
    el = mount({ tasks: PLAN(), options: { criticalPath: true } });
    const { regionRuns } = getEngine(el);
    const before = { ...regionRuns };
    open(el, 'a');
    layerOf(el).move(at(300, 200));
    open(el, 'm');
    layerOf(el).hide();
    flush(el);
    expect(regionRuns).toEqual(before);
  });
});
