// The drag readout chip (Phase 9 step 4.4, `layers/readout.ts`): `div.gantt-drag-readout`, attached
// at the end of the timeline viewport only while `dragPreview` carries the new dates (pointer drag
// or keyboard move mode), with core `formatDragReadout` as its text (dates in
// `formats.readoutFormat` when set, Phase 10 step 4.4) and core `placeDragReadout` written as
// `--x` / `--y` + `data-align`. The scroll offsets are read only while it shows.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DRAG_READOUT_HEIGHT,
  TaskType,
  ViewMode,
  dragReadoutWidth,
  formatDragReadout,
  placeDragReadout,
  type DragPreview,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { READOUT_CSS } from '../styles/readout.css';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();

const TASKS = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: new Date(2026, 2, 2), end: new Date(2026, 2, 9) },
  { id: 'm', name: 'Gate', start: new Date(2026, 2, 16), end: new Date(2026, 2, 16), type: TaskType.Milestone },
];

let el: GantryElement;

/** Mounts with the timeline viewport measured 600 × 300 px (happy-dom has no layout). */
function mount(options: GanttOptions = { viewMode: ViewMode.Day, initialScroll: false }): GantryElement {
  el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks: TASKS(), options });
  const { viewport } = getEngine(el).dom;
  Object.defineProperty(viewport, 'clientWidth', { configurable: true, get: () => 600 });
  Object.defineProperty(viewport, 'clientHeight', { configurable: true, get: () => 300 });
  document.body.appendChild(el);
  flush(el);
  return el;
}

/** A preview of `taskId` moved to `start` → `end`, drawn at `x` (what the drag sessions write). */
function preview(taskId: string, start: Date, end: Date, x = 120, unit: 'day' | 'hour' = 'day'): DragPreview {
  return { taskId, x, width: 160, y: 0, height: 20, delta: 1, unit, daysDelta: 1, start, end };
}

const chip = () => getEngine(el).dom.readout;
const move = (p: DragPreview | null) => {
  getEngine(el).inputs.dragPreview.set(p);
  flush(el);
};

/** What the region should write for the current preview. */
function expected(p: DragPreview, milestone = false) {
  const { graph: G, inputs: I } = getEngine(el);
  const { labels, locale, formats } = G.i18n();
  const text = formatDragReadout(p, {
    labels,
    locale,
    dates: G.config(),
    unit: p.unit,
    format: formats.readoutFormat,
    milestone,
  });
  const place = placeDragReadout(G.ghostVisual()!, {
    scrollLeft: I.scrollLeft(),
    viewportWidth: 600,
    scrollTop: I.scrollTop(),
    headerHeight: G.headerHeight(),
    viewportHeight: 300,
    width: dragReadoutWidth(text),
  });
  return { text, place };
}

describe('drag readout', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => el?.remove());

  it('is attached at the end of the viewport only while a preview with dates shows', () => {
    mount();
    const { dom } = getEngine(el);
    expect(chip().isConnected).toBe(false);

    const p = preview('a', new Date(2026, 2, 3), new Date(2026, 2, 10));
    move(p);
    expect(chip().parentNode).toBe(dom.viewport);
    expect(chip().previousElementSibling).toBe(dom.canvasContainer);
    expect(chip().nextSibling).toBeNull();
    expect(chip().getAttribute('aria-hidden')).toBe('true');
    const { text, place } = expected(p);
    expect(text).toMatch(/^3 Mar – 10 Mar · /);
    expect(chip().textContent).toBe(text);
    expect(chip().getAttribute('data-align')).toBe(place.align);
    expect(chip().style.getPropertyValue('--x')).toBe(`${place.x}px`);
    expect(chip().style.getPropertyValue('--y')).toBe(`${place.y}px`);
    // Never a layout property written inline
    for (const prop of ['left', 'top', 'translate']) expect(chip().style.getPropertyValue(prop)).toBe('');

    // The preview moves: patched in place
    const node = chip();
    const next = preview('a', new Date(2026, 2, 5), new Date(2026, 2, 12), 160);
    move(next);
    expect(chip()).toBe(node);
    expect(chip().textContent).toBe(expected(next).text);

    move(null);
    expect(chip().isConnected).toBe(false);
    // A preview without the new dates (or whose row is gone) shows nothing
    move({ ...p, start: undefined, end: undefined });
    expect(chip().isConnected).toBe(false);
    move(preview('gone', new Date(2026, 2, 3), new Date(2026, 2, 10)));
    expect(chip().isConnected).toBe(false);
  });

  it('shows only the date of a milestone, and the time on hour scales', () => {
    mount();
    const gate = preview('m', new Date(2026, 2, 17), new Date(2026, 2, 17));
    move(gate);
    expect(chip().textContent).toBe(expected(gate, true).text);
    expect(chip().textContent).toBe('17 Mar');

    el.options = { viewMode: ViewMode.Hour, initialScroll: false };
    flush(el);
    const hours = preview('a', new Date(2026, 2, 3, 9), new Date(2026, 2, 3, 17), 120, 'hour');
    move(hours);
    expect(chip().textContent).toBe(expected(hours).text);
    expect(chip().textContent).toMatch(/^3 Mar 09:00 – 17:00 · /);
  });

  it('writes its dates in formats.readoutFormat, on every scale, and the default again once it is unset', () => {
    mount({ viewMode: ViewMode.Day, initialScroll: false, formats: { readoutFormat: 'YYYY-MM-DD' } });
    const p = preview('a', new Date(2026, 2, 3), new Date(2026, 2, 10));
    move(p);
    expect(chip().textContent).toBe(expected(p).text);
    expect(chip().textContent).toMatch(/^2026-03-03 – 2026-03-10 · /);
    // A milestone: its date alone, in the same format
    move(preview('m', new Date(2026, 2, 17), new Date(2026, 2, 17)));
    expect(chip().textContent).toBe('2026-03-17');

    // Hour scales: the format wins over the time-only end of the default
    el.options = { viewMode: ViewMode.Hour, initialScroll: false, formats: { readoutFormat: 'D/M HH:mm' } };
    flush(el);
    const hours = preview('a', new Date(2026, 2, 3, 9), new Date(2026, 2, 3, 17), 120, 'hour');
    move(hours);
    expect(chip().textContent).toBe(expected(hours).text);
    expect(chip().textContent).toMatch(/^3\/3 09:00 – 3\/3 17:00 · /);

    // Unset: core's default for the scale unit again
    el.options = { viewMode: ViewMode.Hour, initialScroll: false };
    flush(el);
    move({ ...hours, x: 140 });
    expect(chip().textContent).toMatch(/^3 Mar 09:00 – 17:00 · /);
  });

  it('reads the scroll only while it shows: idle scrolls re-run nothing, a scroll while dragging keeps it in view', () => {
    mount();
    const { dom, regionRuns } = getEngine(el);
    const scroll = (left: number) => {
      dom.viewport.scrollLeft = left;
      dom.viewport.dispatchEvent(new Event('scroll'));
      flush(el);
    };
    const before = regionRuns['readout'];
    scroll(40);
    expect(regionRuns['readout']).toBe(before);

    const p = preview('a', new Date(2026, 2, 3), new Date(2026, 2, 10), 100);
    move(p);
    const runs = regionRuns['readout'];
    // The ghost scrolls out on the left: the chip stays at the visible start edge
    scroll(500);
    expect(regionRuns['readout']).toBe(runs + 1);
    const { place } = expected(p);
    expect(place.align).toBe('start');
    expect(chip().getAttribute('data-align')).toBe('start');
    expect(chip().style.getPropertyValue('--x')).toBe(`${place.x}px`);
  });

  it('draws the ghost at its bar’s styled height and radius (styles.levels) and places the chip by it', () => {
    mount({ viewMode: ViewMode.Day, initialScroll: false, styles: { levels: [{ height: '70%', radius: 9 }] } });
    const { graph: G } = getEngine(el);
    const geo = G.geoById().get('a')!;
    const p = { ...preview('a', new Date(2026, 2, 3), new Date(2026, 2, 10)), y: geo.y, height: geo.height };
    move(p);
    const bar = el.getBarVisual('a')!;
    const ghost = G.ghostVisual()!;
    expect(bar.height).toBeCloseTo(geo.height * 0.7);
    expect([ghost.y, ghost.height, ghost.rx]).toEqual([bar.y, bar.height, 9]);
    const rect = el.shadowRoot!.querySelector('.gantt-drag-preview')!;
    expect(rect.getAttribute('height')).toBe(String(bar.height));
    expect(rect.getAttribute('rx')).toBe('9');
    // The chip is placed by that ghost, not by one at the default 60 %
    const { place } = expected(p);
    expect(chip().style.getPropertyValue('--y')).toBe(`${place.y}px`);
    const unstyled = placeDragReadout(
      { ...ghost, y: geo.y + (geo.height - geo.height * 0.6) / 2, height: geo.height * 0.6 },
      {
        scrollLeft: 0,
        viewportWidth: 600,
        scrollTop: 0,
        headerHeight: G.headerHeight(),
        viewportHeight: 300,
        width: dragReadoutWidth(chip().textContent),
      },
    );
    expect(place.y).not.toBe(unstyled.y);
  });

  it('styles the chip from core’s look: 20 px tall, translated by its alignment, no pointer', () => {
    expect(DRAG_READOUT_HEIGHT).toBe(20);
    expect(READOUT_CSS).toMatch(/\.gantt-drag-readout \{[^}]*left: var\(--x, 0px\); top: var\(--y, 0px\)/);
    expect(READOUT_CSS).toMatch(/\.gantt-drag-readout \{[^}]*height: 20px; padding: 0 6px/);
    expect(READOUT_CSS).toMatch(/\.gantt-drag-readout \{[^}]*font-size: 11px; font-weight: 600/);
    expect(READOUT_CSS).toMatch(/\.gantt-drag-readout \{[^}]*pointer-events: none/);
    expect(READOUT_CSS).toContain('.gantt-drag-readout[data-align="center"] { translate: -50% 0; }');
    expect(READOUT_CSS).toContain('.gantt-drag-readout[data-align="end"] { translate: -100% 0; }');
  });
});
