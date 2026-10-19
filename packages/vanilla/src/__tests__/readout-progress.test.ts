// Phase 11 step 4.4 — the readout chip during a progress-grip drag (D11, plan §3e): while
// `ctx.progress.active()` and `progressPreview` holds a value the chip says the progress (core
// `formatProgressReadout`, in the chart's locale), placed by core `placeDragReadout` over the
// bar's box. Move mode's ↑ / ↓ also write `progressPreview`, but the chip keeps the dates there.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ViewMode,
  dragReadoutWidth,
  formatDragReadout,
  formatProgressReadout,
  placeDragReadout,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();

const TASKS = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: new Date(2026, 2, 2), end: new Date(2026, 2, 9), progress: 20 },
  { id: 'b', name: 'Beta', start: new Date(2026, 2, 10), end: new Date(2026, 2, 16), progress: 0 },
];

let el: GantryElement;

/** Mounts with the timeline viewport measured 600 × 300 px (happy-dom has no layout). */
function mount(options: GanttOptions = {}): GantryElement {
  el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks: TASKS(), options: { viewMode: ViewMode.Day, initialScroll: false, ...options } });
  const { viewport } = getEngine(el).dom;
  Object.defineProperty(viewport, 'clientWidth', { configurable: true, get: () => 600 });
  Object.defineProperty(viewport, 'clientHeight', { configurable: true, get: () => 300 });
  document.body.appendChild(el);
  flush(el);
  return el;
}

const chip = () => getEngine(el).dom.readout;
/** A progress-grip drag is on (`ctx.progress.active()`, filled by step 4.1). */
const grip = (on: boolean) => vi.spyOn(getEngine(el).ctx.progress, 'active').mockReturnValue(on);
const preview = (taskId: string, progress: number | null) => {
  getEngine(el).inputs.progressPreview.set(progress === null ? null : { taskId, progress });
  flush(el);
};

/** What the region should write for `taskId`'s chip saying `text`: anchored on the bar's box. */
function expected(taskId: string, text: string) {
  const { graph: G, inputs: I } = getEngine(el);
  const { x, y, width, height } = G.barVisual.peek()(G.geoById.peek().get(taskId)!);
  return placeDragReadout(
    { x, y, width, height },
    {
      scrollLeft: I.scrollLeft.peek(),
      viewportWidth: 600,
      scrollTop: I.scrollTop.peek(),
      headerHeight: G.headerHeight.peek(),
      viewportHeight: 300,
      width: dragReadoutWidth(text),
    },
  );
}

describe('readout chip: progress', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    el?.remove();
    vi.restoreAllMocks();
  });

  it('shows the progress over the bar while the grip is dragged, patched in place, gone at the end', () => {
    mount({ editing: true });
    const { dom } = getEngine(el);
    grip(true);
    expect(chip().isConnected).toBe(false);

    preview('a', 45);
    expect(chip().parentNode).toBe(dom.viewport);
    expect(chip().previousElementSibling).toBe(dom.canvasContainer);
    expect(chip().getAttribute('aria-hidden')).toBe('true');
    expect(chip().textContent).toBe('45%');
    const place = expected('a', '45%');
    expect(chip().getAttribute('data-align')).toBe(place.align);
    expect(chip().style.getPropertyValue('--x')).toBe(`${place.x}px`);
    expect(chip().style.getPropertyValue('--y')).toBe(`${place.y}px`);

    const node = chip();
    preview('a', 100);
    expect(chip()).toBe(node);
    expect(chip().textContent).toBe('100%');

    preview('a', null);
    expect(chip().isConnected).toBe(false);
  });

  it("formats in the chart's locale", () => {
    mount({ editing: true, locale: 'de' });
    grip(true);
    preview('b', 30);
    expect(chip().textContent).toBe(formatProgressReadout(30, 'de'));
    expect(chip().textContent).not.toBe('30%');
  });

  it('a preview whose row is gone shows nothing', () => {
    mount({ editing: true });
    grip(true);
    preview('gone', 40);
    expect(chip().isConnected).toBe(false);
  });

  it('move mode (no grip drag): the chip keeps the dates, the progress preview changes nothing', () => {
    mount({ editing: true });
    const { inputs: I, graph: G } = getEngine(el);
    grip(false);
    // ↑ / ↓ alone: no dates preview, no chip
    preview('a', 30);
    expect(chip().isConnected).toBe(false);

    // A date step too: the dates
    const start = new Date(2026, 2, 3);
    const end = new Date(2026, 2, 10);
    I.dragPreview.set({
      taskId: 'a',
      x: 120,
      width: 160,
      y: 0,
      height: 20,
      delta: 1,
      unit: 'day',
      daysDelta: 1,
      start,
      end,
    });
    flush(el);
    const { labels, locale, formats } = G.i18n.peek();
    expect(chip().textContent).toBe(
      formatDragReadout(
        { start, end },
        { labels, locale, dates: G.config.peek(), unit: 'day', format: formats.readoutFormat },
      ),
    );
    preview('a', 60);
    expect(chip().textContent).not.toContain('%');
  });

  it('with editing off nothing reads the grip', () => {
    mount();
    const active = grip(true);
    getEngine(el).inputs.scrollLeft.set(40);
    flush(el);
    expect(active).not.toHaveBeenCalled();
    expect(chip().isConnected).toBe(false);
  });
});
