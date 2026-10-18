// Phase 9 step 4.3 — the legend placed by core `legendPlacement()` (D9, §3c): an in-flow strip
// after `.gantry-main` by default, the toolbar's last child with `legend.position: 'toolbar'`
// (back to the strip while the toolbar is hidden), detached while there is nothing to show or in
// the table view (D27). Its item nodes are kept across moves and hides.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ViewMode, type GanttAnnotation, type GanttOptions, type GanttTask } from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { BASE_CSS } from '../styles/base';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();

/** `n` one-week tasks in March 2026. */
function plan(n: number): GanttTask[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Task ${i}`,
    start: new Date(2026, 2, 2 + (i % 20)),
    end: new Date(2026, 2, 9 + (i % 20)),
    progress: 40,
  }));
}

const FREEZE: GanttAnnotation[] = [{ x1: new Date(2026, 2, 5), label: { text: 'Freeze' } }];

function mount(options: GanttOptions = {}, showLegend = true): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  el.tasks = plan(3);
  el.options = { viewMode: ViewMode.Month, showToday: false, criticalPath: true, ...options };
  el.annotations = FREEZE;
  el.showLegend = showLegend;
  document.body.appendChild(el);
  flush(el);
  return el;
}

const $ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel);
const $$ = (el: GantryElement, sel: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(sel)];
const legendOf = (el: GantryElement) => getEngine(el).dom.legend;
const childClasses = (node: Element) => [...node.children].map(c => c.className);

describe('legend (Phase 9 step 4.3)', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    el?.remove();
  });

  it("is an in-flow strip after the panes by default ('bottom')", () => {
    el = mount();
    const { wrapper, main } = getEngine(el).dom;
    const legend = $(el, '.gantt-legend')!;
    expect(legend).toBe(legendOf(el));
    expect(legend.parentNode).toBe(wrapper);
    expect(legend.previousElementSibling).toBe(main);
    expect(legend.nextElementSibling).toBeNull();
    expect(legend.className).toBe('gantt-legend gantt-legend--bottom');
    expect(legend.getAttribute('part')).toBe('legend');
    expect(legend.hasAttribute('hidden')).toBe(false);
    expect(childClasses(legend)).toEqual(['gantt-legend-title', 'gantt-legend-item', 'gantt-legend-item']);
    expect(legend.firstElementChild!.textContent).toBe('Legend');
    expect($$(el, '.gantt-legend-item').map(i => i.textContent)).toEqual(['Freeze', 'Critical path']);
    // The live regions stay the shadow root's own children, after the wrapper
    expect([...el.shadowRoot!.children].map(c => c.className).slice(0, 3)).toEqual([
      'gantry-wrapper',
      'gantt-sr-alert',
      'gantt-sr-live',
    ]);
  });

  it('is detached while off, with nothing to explain and in the table view (D27), and comes back as is', () => {
    el = mount({}, false);
    const legend = legendOf(el);
    expect(legend.isConnected).toBe(false);
    expect($(el, '[part="legend"]')).toBeNull();

    el.showLegend = true;
    flush(el);
    expect(legend.isConnected).toBe(true);
    const items = $$(el, '.gantt-legend-item');

    el.setView('table');
    flush(el);
    expect(legend.isConnected).toBe(false);
    el.setView('chart');
    flush(el);
    expect(legend.isConnected).toBe(true);
    expect($$(el, '.gantt-legend-item')).toEqual(items);

    // No entry left: nothing to explain
    el.annotations = [];
    el.options = { viewMode: ViewMode.Month, showToday: false, criticalPath: false };
    flush(el);
    expect(legend.isConnected).toBe(false);
  });

  it("joins the end of the toolbar with legend.position 'toolbar', after the view switch", () => {
    el = mount({ legend: { position: 'toolbar' } });
    const legend = legendOf(el);
    const bar = $(el, '.gantt-toolbar')!;
    expect(legend.parentNode).toBe(bar);
    expect(bar.lastElementChild).toBe(legend);
    expect(legend.className).toBe('gantt-legend gantt-legend--toolbar');
    expect(childClasses(bar)).toEqual([
      'gantt-tb-group',
      'gantt-tb-group gantt-tb-pills',
      'gantt-tb-group',
      'gantt-tb-group gantt-tb-pills gantt-tb-views',
      'gantt-legend gantt-legend--toolbar',
    ]);
    // Not a toolbar control: outside the roving set, no tab stop of its own
    expect(legend.querySelector('button, [tabindex]')).toBeNull();
    const items = $$(el, '.gantt-legend-item');

    // A group turned on later still goes before the legend
    el.options = {
      viewMode: ViewMode.Month,
      showToday: false,
      criticalPath: true,
      legend: { position: 'toolbar' },
      toolbar: { viewToggle: false },
    };
    flush(el);
    el.options = { viewMode: ViewMode.Month, showToday: false, criticalPath: true, legend: { position: 'toolbar' } };
    flush(el);
    expect(bar.lastElementChild).toBe(legend);
    expect(childClasses(bar).at(-2)).toBe('gantt-tb-group gantt-tb-pills gantt-tb-views');

    // The toolbar hidden: back to the strip; shown again: back into the toolbar, same items
    el.showToolbar = false;
    flush(el);
    expect(legend.parentNode).toBe(getEngine(el).dom.wrapper);
    expect(legend.className).toBe('gantt-legend gantt-legend--bottom');
    el.showToolbar = true;
    flush(el);
    expect(bar.lastElementChild).toBe(legend);
    expect(legend.className).toBe('gantt-legend gantt-legend--toolbar');
    expect($$(el, '.gantt-legend-item')).toEqual(items);

    el.options = {
      viewMode: ViewMode.Month,
      showToday: false,
      criticalPath: true,
      legend: { position: 'toolbar' },
      toolbar: false,
    };
    flush(el);
    expect(legend.parentNode).toBe(getEngine(el).dom.wrapper);
  });

  it('moves between the placements without rebuilding its items', () => {
    el = mount();
    const items = $$(el, '.gantt-legend-item');
    el.options = { viewMode: ViewMode.Month, showToday: false, criticalPath: true, legend: { position: 'toolbar' } };
    flush(el);
    expect(legendOf(el).parentNode).toBe($(el, '.gantt-toolbar'));
    el.options = { viewMode: ViewMode.Month, showToday: false, criticalPath: true, legend: { position: 'bottom' } };
    flush(el);
    expect(legendOf(el).parentNode).toBe(getEngine(el).dom.wrapper);
    expect($$(el, '.gantt-legend-item')).toEqual(items);
  });

  it('a vertical scroll or a selection does not re-run it', () => {
    el = mount();
    const { regionRuns } = getEngine(el);
    const before = regionRuns['legend'];
    el.setSelectedTasks(['t1']);
    flush(el);
    expect(regionRuns['legend']).toBe(before);
  });

  it('styles the strip in flow: a top border, the header background, no shadow or absolute position', () => {
    const block = (selector: string) => {
      const at = BASE_CSS.indexOf(`${selector} {`);
      return at < 0 ? '' : BASE_CSS.slice(at, BASE_CSS.indexOf('}', at));
    };
    expect(block('.gantt-legend--bottom')).toContain('border-top: 1px solid var(--gantt-border)');
    expect(block('.gantt-legend--bottom')).toContain('background: var(--gantt-header-bg)');
    expect(block('.gantt-legend')).not.toContain('position');
    expect(block('.gantt-legend')).not.toContain('box-shadow');
  });
});
