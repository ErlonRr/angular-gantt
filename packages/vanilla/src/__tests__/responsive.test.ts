// Phase 10 step 4.2 — the narrow-width view switch (`options.responsive`, D2; core
// `reduceResponsive`) in the Web Component: the measured chart width forces `responsive.view` below
// the breakpoint (`data-narrow` on the wrapper), a view the user picks while narrow wins until the
// width crosses back, which restores the wide view; the forced view is never saved
// (`getState().view` keeps the wide view, no `state-change`), and a view the options apply while
// narrow becomes the wide view.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { type GanttOptions, type GanttTask } from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();

function plan(n: number): GanttTask[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Task ${i}`,
    start: new Date(2026, 2, 2 + i),
    end: new Date(2026, 2, 9 + i),
  }));
}

/** The element's ResizeObserver callback (the panes), driven by the test */
let measure: (() => void) | undefined;
const widths = new WeakMap<Element, number>();

/** The chart's width becomes `width` (the ResizeObserver fires), then a frame. */
function resize(el: GantryElement, width: number): void {
  widths.set(getEngine(el).dom.main, width);
  measure?.();
  flush(el);
}

function create(options: GanttOptions, width: number): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  el.tasks = plan(3);
  // The default zoom level: no `view-mode-change` save when the element starts
  el.options = { initialScroll: false, ...options };
  const { dom } = getEngine(el);
  widths.set(dom.main, width);
  Object.defineProperty(dom.main, 'clientWidth', { configurable: true, get: () => widths.get(dom.main) ?? 0 });
  return el;
}

function mount(options: GanttOptions = {}, width = 1150): GantryElement {
  const el = create(options, width);
  document.body.appendChild(el);
  flush(el);
  return el;
}

const wrapper = (el: GantryElement) => el.shadowRoot!.querySelector<HTMLElement>('.gantry-wrapper')!;
const narrow = (el: GantryElement) => wrapper(el).hasAttribute('data-narrow');

describe('responsive view (Phase 10 step 4.2)', () => {
  let el: GantryElement;
  let stateChanges: number;
  let listening: AbortController;

  beforeEach(() => {
    document.body.innerHTML = '';
    measure = undefined;
    stateChanges = 0;
    vi.useFakeTimers();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          measure = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    listening = new AbortController();
    document.addEventListener('state-change', () => stateChanges++, { signal: listening.signal });
  });
  afterEach(() => {
    el?.remove();
    listening.abort();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Runs the debounced state saves; returns how many `state-change` events fired so far. */
  const saved = () => {
    vi.runOnlyPendingTimers();
    return stateChanges;
  };

  it('a chart narrower than 640 px shows the chart view from its first frame; the wide view is kept', () => {
    el = mount({}, 500);
    expect(el.view).toBe('chart');
    expect(narrow(el)).toBe(true);
    expect(wrapper(el).getAttribute('data-view')).toBe('chart');
    expect(getEngine(el).inputs.narrow()).toBe(true);
    // The forced view is never persisted
    expect(el.getState()).toMatchObject({ view: 'split', panelCollapsed: false });
    expect(saved()).toBe(0);
  });

  it('crossing the breakpoint switches and restores the view, without saving state', () => {
    el = mount({}, 1150);
    expect(narrow(el)).toBe(false);
    resize(el, 640);
    expect(el.view).toBe('split');
    resize(el, 639);
    expect(el.view).toBe('chart');
    expect(narrow(el)).toBe(true);
    resize(el, 400);
    expect(el.view).toBe('chart');
    resize(el, 900);
    expect(el.view).toBe('split');
    expect(narrow(el)).toBe(false);
    expect(wrapper(el).getAttribute('data-view')).toBe('split');
    expect(saved()).toBe(0);
  });

  it('restores the view shown before the chart became narrow', () => {
    el = mount({ view: 'table' }, 1150);
    resize(el, 500);
    expect(el.view).toBe('chart');
    expect(el.getState().view).toBe('table');
    resize(el, 1000);
    expect(el.view).toBe('table');
  });

  it('a view the user picks while narrow wins until the width crosses back', () => {
    el = mount({}, 500);
    el.setView('table');
    expect(el.view).toBe('table');
    resize(el, 450);
    expect(el.view).toBe('table');
    // Persisted: the wide view, still
    expect(el.getState().view).toBe('split');
    resize(el, 1000);
    expect(el.view).toBe('split');
    // Narrow again: forced again, the earlier pick is forgotten
    resize(el, 500);
    expect(el.view).toBe('chart');
  });

  it('togglePanel() and the toolbar are user picks too', () => {
    el = mount({ toolbar: { panelToggle: true } }, 500);
    el.togglePanel();
    expect(el.view).toBe('split');
    resize(el, 480);
    expect(el.view).toBe('split');
    resize(el, 1000);
    resize(el, 500);
    expect(el.view).toBe('chart');
    // The task-list toggle of the toolbar (it fits next to the More button)
    el.shadowRoot!.querySelector<HTMLButtonElement>('[data-focus-key="panel"]')!.click();
    expect(el.view).toBe('split');
    resize(el, 470);
    expect(el.view).toBe('split');
  });

  it('follows responsive.breakpoint and responsive.view; false turns it off', () => {
    el = mount({ responsive: { breakpoint: 900, view: 'table' } }, 800);
    expect(el.view).toBe('table');
    expect(narrow(el)).toBe(true);
    // The options change: the switch looks again at the last width
    el.options = { ...el.options, responsive: { breakpoint: 900, view: 'chart' } };
    expect(el.view).toBe('chart');
    el.options = { ...el.options, responsive: false };
    expect(el.view).toBe('split');
    expect(getEngine(el).inputs.narrow()).toBe(false);
    resize(el, 300);
    expect(el.view).toBe('split');
    expect(narrow(el)).toBe(false);
  });

  it('an options view applied while narrow is the view restored once wide', () => {
    el = mount({ view: 'split' }, 500);
    expect(el.view).toBe('chart');
    el.options = { ...el.options, view: 'table' };
    expect(el.view).toBe('chart');
    expect(el.getState().view).toBe('table');
    resize(el, 1000);
    expect(el.view).toBe('table');
  });

  it('setState() applies a restored view at once: while narrow it becomes the wide view', () => {
    el = mount({}, 500);
    el.setState({ view: 'table' }, false);
    // Before any frame or resize: forced again, the restored view kept as the wide one
    expect(el.view).toBe('chart');
    expect(el.getState().view).toBe('table');
    resize(el, 1000);
    expect(el.view).toBe('table');
    expect(saved()).toBe(0);
  });

  it('setView() with the view shown is no pick: a new responsive.view is still forced', () => {
    el = mount({}, 500);
    expect(el.view).toBe('chart');
    el.setView('chart');
    el.options = { ...el.options, responsive: { breakpoint: 640, view: 'table' } };
    expect(el.view).toBe('table');
    // A real pick wins over it
    el.setView('split');
    el.options = { ...el.options, responsive: { breakpoint: 640, view: 'chart' } };
    expect(el.view).toBe('split');
  });

  it('ignores an unmeasured width (0: hidden, not laid out)', () => {
    el = mount({}, 0);
    expect(el.view).toBe('split');
    expect(narrow(el)).toBe(false);
    resize(el, 500);
    expect(el.view).toBe('chart');
    resize(el, 0);
    expect(el.view).toBe('chart');
    expect(narrow(el)).toBe(true);
  });

  it('decides before the first frame paints the panes, also when options arrive after connecting', () => {
    el = create({}, 500);
    document.body.appendChild(el);
    expect(el.view).toBe('chart');
    el.remove();
    el = document.createElement('gantry-element');
    el.style.height = '400px';
    const { dom } = getEngine(el);
    Object.defineProperty(dom.main, 'clientWidth', { configurable: true, get: () => 500 });
    document.body.appendChild(el);
    expect(el.view).toBe('chart');
    el.tasks = plan(2);
    el.options = { view: 'table' };
    expect(el.view).toBe('chart');
    expect(el.getState().view).toBe('table');
  });
});
