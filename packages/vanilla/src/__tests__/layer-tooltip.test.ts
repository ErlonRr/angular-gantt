// The tooltip layer (Gantry 2 phase 6 step 2.4, Phase 9 step 4.4): one popover built once, its
// `<dl>` rows written through textContent and keyed by kind, the critical path as a class and the
// progress through the CSSOM; opened and closed by core's tooltip machine (`reduceTooltip`, with
// the resolved `options.tooltip`), anchored to its bar by core `placeTooltip` (one measurement per
// opening), `aria-describedby` on that bar while it shows, custom content from
// `options.tooltip.render`, one timer cleared on hide() / destroy(). Phase 10 step 4.4: the
// progress colour of the row's resolved style, and `refresh(row)` (content written again only for a
// new task object, critical flag or i18n bundle). The layer is driven directly (as
// `interaction/canvas-pointer.ts` and `interaction/tooltip-triggers.ts` do).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_LABELS,
  TaskType,
  placeTooltip,
  themeVar,
  type GanttFlatRow,
  type GanttOptions,
  type GanttTask,
  type GanttTooltipRenderContext,
} from '@gantryjs/core';
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
const barOf = (el: GantryElement, id: string) =>
  el.shadowRoot!.querySelector<SVGGElement>(`.gantt-bars-layer [data-task-id="${id}"]`)!;

/** Hovers `id`'s bar at `x` and waits for the tooltip to open. */
function open(el: GantryElement, id: string, x = 100): HTMLElement {
  layerOf(el).hover(rowOf(el, id), barOf(el, id), x);
  vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY);
  return tipOf(el);
}

const texts = (tip: HTMLElement, sel: string) => [...tip.querySelectorAll(sel)].map(n => n.textContent);
const children = (tip: HTMLElement) => [...tip.children].map(c => `${c.tagName.toLowerCase()}.${c.className}`);

describe('tooltip layer', () => {
  let el: GantryElement;
  let other: GantryElement | undefined;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    el?.remove();
    other?.remove();
    other = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('builds one hidden popover once, with its own id, a title and a <dl>', () => {
    el = mount({ tasks: PLAN() });
    const tips = el.shadowRoot!.querySelectorAll('.gantt-tooltip');
    expect(tips).toHaveLength(1);
    const tip = tipOf(el);
    expect(tip.tagName).toBe('DIV');
    expect(tip.getAttribute('popover')).toBe('manual');
    expect(tip.getAttribute('role')).toBe('tooltip');
    expect(tip.id).toMatch(/^gantt-tooltip-\d+$/);
    expect(tip.hidden).toBe(true);
    expect(children(tip)).toEqual(['div.gantt-tooltip-title', 'dl.gantt-tooltip-rows']);
    other = mount({ tasks: PLAN() });
    expect(tipOf(other).id).not.toBe(tip.id);

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

  it('opens after the show delay and lists the model rows as dt / dd text', () => {
    el = mount({ tasks: PLAN() });
    const tip = tipOf(el);
    layerOf(el).hover(rowOf(el, 'a'), barOf(el, 'a'), 100);
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

  it('takes its delays from options.tooltip, and the hover intent restarts the show delay', () => {
    el = mount({ tasks: PLAN(), options: { tooltip: { showDelay: 100, hideDelay: 40 } } });
    const layer = layerOf(el);
    const tip = tipOf(el);
    layer.hover(rowOf(el, 'a'), barOf(el, 'a'), 100);
    vi.advanceTimersByTime(80);
    layer.hover(rowOf(el, 'a'), barOf(el, 'a'), 110); // still moving over the bar
    vi.advanceTimersByTime(80);
    expect(tip.hidden).toBe(true);
    vi.advanceTimersByTime(20);
    expect(tip.hidden).toBe(false);
    layer.unhover();
    vi.advanceTimersByTime(39);
    expect(tip.hidden).toBe(false);
    vi.advanceTimersByTime(1);
    expect(tip.hidden).toBe(true);

    // A zero delay opens at once
    el.options = { tooltip: { showDelay: 0 } };
    flush(el);
    layer.hover(rowOf(el, 'b'), barOf(el, 'b'), 100);
    expect(tip.hidden).toBe(false);
  });

  it('keeps row nodes from one task to the next (keyed by kind) and drops the rows a task lacks', () => {
    el = mount({ tasks: PLAN() });
    const tip = open(el, 'a');
    const firstDate = tip.querySelector('dl > div')!;
    expect(tip.querySelectorAll('dl > div')).toHaveLength(5);

    // Another bar while it shows: switches at once
    layerOf(el).hover(rowOf(el, 'm'), barOf(el, 'm'), 100);
    expect(texts(tip, 'dl > div > dt')).toEqual([DEFAULT_LABELS.ttMilestone]);
    expect(tip.querySelector('dl > div')).toBe(firstDate);
    expect(tip.querySelector('.gantt-tooltip-fill')).toBeNull();

    layerOf(el).hover(rowOf(el, 'c'), barOf(el, 'c'), 100);
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

    layerOf(el).hover(rowOf(el, 'c'), barOf(el, 'c'), 100);
    expect(tip.classList.contains('gantt-tooltip--critical')).toBe(false);
    fill = tip.querySelector<HTMLElement>('.gantt-tooltip-fill')!;
    expect(fill.style.getPropertyValue('--gantt-tt-progress')).toBe('25');
    expect(fill.style.getPropertyValue('background-color').toUpperCase()).toBe('#FDE68A');
    // The stylesheet turns the number into the fill width
    expect(TOOLTIP_CSS).toContain('inline-size: calc(var(--gantt-tt-progress, 0) * 1%)');
  });

  it('takes the progress colour from the row style its bar is painted with: styles, then task.style; critical wins', () => {
    const tasks = PLAN();
    tasks[1] = { ...tasks[1], style: { color: '#22C55E' } };
    el = mount({ tasks, options: { styles: { task: { color: '#0EA5E9' } } } });
    const fill = () =>
      tipOf(el).querySelector<HTMLElement>('.gantt-tooltip-fill')!.style.getPropertyValue('background-color');
    open(el, 'a');
    expect(fill().toUpperCase()).toBe('#0EA5E9');
    // The bar's own fill is the same paint
    expect(getEngine(el).graph.rowStyle.peek()(rowOf(el, 'a')).color).toBe('#0EA5E9');
    layerOf(el).hover(rowOf(el, 'b'), barOf(el, 'b'), 100);
    expect(fill().toUpperCase()).toBe('#22C55E');
    // The deprecated flat field still beats a kind style
    layerOf(el).hover(rowOf(el, 'c'), barOf(el, 'c'), 100);
    expect(fill().toUpperCase()).toBe('#FDE68A');

    el.options = { criticalPath: true, styles: { task: { color: '#0EA5E9' } } };
    flush(el);
    layerOf(el).hover(rowOf(el, 'b'), barOf(el, 'b'), 100);
    expect(fill()).toBe(themeVar('criticalColor'));
  });

  it('refresh(row) writes the content again only for a new task object, critical flag or i18n bundle', () => {
    const render = vi.fn((): unknown => null);
    el = mount({ tasks: PLAN(), options: { tooltip: { render } } });
    const layer = layerOf(el);
    const tip = open(el, 'a');
    const measure = vi.spyOn(tip, 'getBoundingClientRect');
    expect(render).toHaveBeenCalledTimes(1);
    const row = rowOf(el, 'a');

    // The same task (even in a new row object): nothing to write
    layer.refresh(row);
    layer.refresh({ ...row });
    expect(render).toHaveBeenCalledTimes(1);
    expect(measure).not.toHaveBeenCalled();
    // Another task's row, or while closed: ignored
    layer.refresh({ ...rowOf(el, 'b'), task: { ...rowOf(el, 'b').task, name: 'Other' } });
    expect(tip.querySelector('.gantt-tooltip-title')!.textContent).toBe('Task a');

    // A new task object: written again, measured again, still open on the same bar
    layer.refresh({ ...row, task: { ...row.task, name: 'Renamed', progress: 80 } });
    expect(render).toHaveBeenCalledTimes(2);
    expect(measure).toHaveBeenCalledTimes(1);
    expect(tip.hidden).toBe(false);
    expect(tip.querySelector('.gantt-tooltip-title')!.textContent).toBe('Renamed');
    expect(texts(tip, 'dd.gantt-tooltip-value')).toContain('80%');
    expect(barOf(el, 'a').getAttribute('aria-describedby')).toBe(tip.id);
    expect(layer.visibleId()).toBe('a');

    layer.hide();
    layer.refresh({ ...row, task: { ...row.task, name: 'Closed' } });
    expect(render).toHaveBeenCalledTimes(2);
    expect(tip.hidden).toBe(true);
  });

  it('sits by its bar (core placeTooltip): on the pointer while hovering, centred on focus; one measurement per opening', () => {
    el = mount({ tasks: PLAN() });
    const tip = tipOf(el);
    const measure = vi.spyOn(tip, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 100));
    const box = new DOMRect(300, 120, 240, 24);
    const anchor = vi.spyOn(barOf(el, 'a'), 'getBoundingClientRect').mockReturnValue(box);
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const size = { width: 200, height: 100 };

    open(el, 'a', 500);
    const hovered = placeTooltip({ anchor: box, pointerX: 500, size, viewport });
    expect(tip.style.getPropertyValue('translate')).toBe(`${hovered.x}px ${hovered.y}px`);
    expect(hovered.y).toBe(120 + 24 + 8); // below the bar
    // Moving over the same bar does not move it, nor measure again
    layerOf(el).hover(rowOf(el, 'a'), barOf(el, 'a'), 320);
    expect(tip.style.getPropertyValue('translate')).toBe(`${hovered.x}px ${hovered.y}px`);
    expect(measure).toHaveBeenCalledTimes(1);

    // Keyboard focus: centred on the bar, at once
    layerOf(el).hide();
    layerOf(el).focus(rowOf(el, 'a'), barOf(el, 'a'));
    const focused = placeTooltip({ anchor: box, size, viewport });
    expect(tip.style.getPropertyValue('translate')).toBe(`${focused.x}px ${focused.y}px`);
    expect(focused.x).toBe(300 + 120 - 100);
    expect(measure).toHaveBeenCalledTimes(2);

    // A scroll re-reads the bar only
    anchor.mockReturnValue(new DOMRect(300, 60, 240, 24));
    layerOf(el).reposition();
    expect(tip.style.getPropertyValue('translate')).toBe(`${focused.x}px ${60 + 24 + 8}px`);
    expect(measure).toHaveBeenCalledTimes(2);
    for (const prop of ['left', 'top', 'display']) expect(tip.style.getPropertyValue(prop)).toBe('');
  });

  it('describes its bar while it shows: aria-describedby follows the open tooltip', () => {
    el = mount({ tasks: PLAN() });
    const tip = tipOf(el);
    const [a, b] = [barOf(el, 'a'), barOf(el, 'b')];
    expect(a.hasAttribute('aria-describedby')).toBe(false);
    layerOf(el).hover(rowOf(el, 'a'), a, 100);
    expect(a.hasAttribute('aria-describedby')).toBe(false); // still waiting for the show delay
    vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY);
    expect(a.getAttribute('aria-describedby')).toBe(tip.id);
    layerOf(el).hover(rowOf(el, 'b'), b, 100);
    expect(a.hasAttribute('aria-describedby')).toBe(false);
    expect(b.getAttribute('aria-describedby')).toBe(tip.id);
    // Closing (after the hide delay) removes it
    layerOf(el).unhover();
    expect(b.getAttribute('aria-describedby')).toBe(tip.id);
    vi.advanceTimersByTime(TOOLTIP_HIDE_DELAY);
    expect(b.hasAttribute('aria-describedby')).toBe(false);
    // A child of the bar anchors to the bar itself
    layerOf(el).focus(rowOf(el, 'a'), a.firstElementChild!);
    expect(a.getAttribute('aria-describedby')).toBe(tip.id);
    expect(layerOf(el).visibleId()).toBe('a');
    layerOf(el).dismiss();
    expect(a.hasAttribute('aria-describedby')).toBe(false);
    expect(layerOf(el).visibleId()).toBeNull();
  });

  it('stays open while the pointer rests on it, and closes after the hide delay once it leaves', () => {
    el = mount({ tasks: PLAN() });
    const layer = layerOf(el);
    const tip = open(el, 'a');
    layer.unhover();
    vi.advanceTimersByTime(TOOLTIP_HIDE_DELAY - 1);
    layer.enterTooltip();
    vi.advanceTimersByTime(TOOLTIP_HIDE_DELAY * 5);
    expect(tip.hidden).toBe(false);
    layer.leaveTooltip();
    vi.advanceTimersByTime(TOOLTIP_HIDE_DELAY - 1);
    expect(tip.hidden).toBe(false);
    // Back on the bar before the deadline: it stays
    layer.hover(rowOf(el, 'a'), barOf(el, 'a'), 100);
    vi.advanceTimersByTime(TOOLTIP_HIDE_DELAY * 2);
    expect(tip.hidden).toBe(false);
    layer.unhover();
    layer.unhover(); // a second move off the bars keeps the first deadline
    vi.advanceTimersByTime(TOOLTIP_HIDE_DELAY);
    expect(tip.hidden).toBe(true);
    expect(TOOLTIP_CSS).toMatch(/\.gantt-tooltip \{[^}]*pointer-events: auto/);
  });

  it('follows options.tooltip.trigger: hover only, focus only, and taps only with auto', () => {
    const at = (trigger: NonNullable<GanttOptions['tooltip']>['trigger']) => {
      el?.remove();
      el = mount({ tasks: PLAN(), options: { tooltip: { trigger } } });
      return { layer: layerOf(el), tip: tipOf(el) };
    };
    let { layer, tip } = at('hover');
    layer.focus(rowOf(el, 'a'), barOf(el, 'a'));
    layer.tap(rowOf(el, 'a'), barOf(el, 'a'));
    expect(tip.hidden).toBe(true);
    open(el, 'a');
    expect(tip.hidden).toBe(false);

    ({ layer, tip } = at('focus'));
    open(el, 'a');
    layer.tap(rowOf(el, 'a'), barOf(el, 'a'));
    expect(tip.hidden).toBe(true);
    layer.focus(rowOf(el, 'a'), barOf(el, 'a'));
    expect(tip.hidden).toBe(false);

    ({ layer, tip } = at('auto'));
    layer.tap(rowOf(el, 'a'), barOf(el, 'a'));
    expect(tip.hidden).toBe(false);
    // A tapped tooltip stays until another tap
    vi.advanceTimersByTime(10_000);
    expect(tip.hidden).toBe(false);
    layer.tap(rowOf(el, 'a'), barOf(el, 'a'));
    expect(tip.hidden).toBe(true);
  });

  it('shows options.tooltip.render content instead of the title and rows: text or a DOM node', () => {
    const render = vi.fn((ctx: GanttTooltipRenderContext): unknown => {
      if (ctx.task.id === 'a') return `<b>${ctx.task.name}</b>`;
      if (ctx.task.id === 'b') {
        const node = document.createElement('strong');
        node.textContent = 'B!';
        return node;
      }
      return null; // the built-in content
    });
    el = mount({ tasks: PLAN(), options: { tooltip: { render } } });
    const tip = open(el, 'a');
    expect(children(tip)).toEqual(['div.gantt-tooltip-custom']);
    const custom = tip.querySelector('.gantt-tooltip-custom')!;
    expect(custom.textContent).toBe('<b>Task a</b>');
    expect(custom.querySelector('b')).toBeNull();
    const ctx = render.mock.calls[0][0];
    expect(ctx.model.title).toBe('Task a');
    expect(ctx.row).toBe(rowOf(el, 'a'));

    layerOf(el).hover(rowOf(el, 'b'), barOf(el, 'b'), 100);
    expect(custom.children).toHaveLength(1);
    expect(custom.firstElementChild!.tagName).toBe('STRONG');
    expect(custom.textContent).toBe('B!');

    layerOf(el).hover(rowOf(el, 'c'), barOf(el, 'c'), 100);
    expect(children(tip)).toEqual(['div.gantt-tooltip-title', 'dl.gantt-tooltip-rows']);
    expect(tip.querySelector('.gantt-tooltip-title')!.textContent).toBe('Task c');
  });

  it('falls back to the built-in content when render throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    el = mount({
      tasks: PLAN(),
      options: {
        tooltip: {
          render: () => {
            throw new Error('boom');
          },
        },
      },
    });
    const tip = open(el, 'a');
    expect(children(tip)).toEqual(['div.gantt-tooltip-title', 'dl.gantt-tooltip-rows']);
    expect(error).toHaveBeenCalledWith('[gantry] tooltip render error:', expect.any(Error));
  });

  it('keeps one timer, cleared on hide() and destroy()', () => {
    el = mount({ tasks: PLAN() });
    const layer = layerOf(el);
    const idle = vi.getTimerCount();

    layer.hover(rowOf(el, 'a'), barOf(el, 'a'), 10);
    layer.hover(rowOf(el, 'a'), barOf(el, 'a'), 20);
    expect(vi.getTimerCount()).toBe(idle + 1);
    layer.hide();
    expect(vi.getTimerCount()).toBe(idle);
    vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY);
    expect(tipOf(el).hidden).toBe(true);

    open(el, 'a');
    expect(vi.getTimerCount()).toBe(idle);
    layer.unhover();
    expect(vi.getTimerCount()).toBe(idle + 1);
    layer.hide();
    expect(vi.getTimerCount()).toBe(idle);
    expect(tipOf(el).hidden).toBe(true);

    open(el, 'a');
    layer.unhover();
    const tip = tipOf(el);
    layer.destroy();
    expect(vi.getTimerCount()).toBe(idle);
    expect(tip.isConnected).toBe(false);
    expect(tip.hidden).toBe(true);
    // A destroyed layer ignores the pointer
    layer.hover(rowOf(el, 'a'), barOf(el, 'a'), 10);
    layer.unhover();
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
    expect(barOf(el, 'a').hasAttribute('aria-describedby')).toBe(false);
    // Off: nothing opens
    layerOf(el).focus(rowOf(el, 'a'), barOf(el, 'a'));
    expect(tip.hidden).toBe(true);
    // Disabled while a show was pending: it never opens
    el.tooltipEnabled = true;
    layerOf(el).hover(rowOf(el, 'a'), barOf(el, 'a'), 10);
    el.tooltipEnabled = false;
    vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY);
    expect(tip.hidden).toBe(true);

    el.tooltipEnabled = true;
    open(el, 'a');
    const idle = vi.getTimerCount();
    layerOf(el).unhover();
    el.remove();
    expect(tip.hidden).toBe(true);
    expect(vi.getTimerCount()).toBe(idle);
  });

  it('opening reads the graph without subscribing: no region re-runs', () => {
    el = mount({ tasks: PLAN(), options: { criticalPath: true } });
    const { regionRuns } = getEngine(el);
    const before = { ...regionRuns };
    open(el, 'a');
    layerOf(el).reposition();
    layerOf(el).hover(rowOf(el, 'm'), barOf(el, 'm'), 300);
    layerOf(el).hide();
    flush(el);
    expect(regionRuns).toEqual(before);
  });
});
