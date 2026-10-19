// Undo / redo keys of <gantry-element> (Gantry 2 phase 11, step 4.2, D18, plan §3e): Ctrl/⌘+Z
// undoes, Ctrl/⌘+Shift+Z and Ctrl+Y redo, from anywhere in the chart, only while it keeps a
// history (`editing.history`; never in controlled mode), outside text entry (an input, a cell
// editor) and not in move mode — otherwise the browser's own undo keeps the keys. Alt disables them.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ViewMode, type GanttEditingOptions, type GanttTask } from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();

const day = (d: number) => new Date(2026, 2, d);
const plan = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(6), progress: 20 },
  { id: 'b', name: 'Beta', start: day(8), end: day(12), progress: 50 },
];

function mount(editing: boolean | GanttEditingOptions = true): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, {
    tasks: plan(),
    options: { viewMode: ViewMode.Day, initialScroll: false, editing },
    tooltipEnabled: false,
  });
  document.body.appendChild(el);
  flush(el);
  return el;
}

const $ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel)!;
const bar = (el: GantryElement, id: string) => $<SVGGElement>(el, `.gantt-bars-layer > [data-task-id="${id}"]`);
const startOf = (el: GantryElement, id: string) => el.tasks.find(t => t.id === id)!.start;

/** A keydown on `target` (default: the focused element); returns whether the chart used it. */
function press(el: GantryElement, key: string, init: KeyboardEventInit = {}, target?: Element): boolean {
  const on = target ?? el.shadowRoot!.activeElement ?? el;
  const e = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init });
  on.dispatchEvent(e);
  return e.defaultPrevented;
}

/** Moves `id`'s bar `days` later through the engine's drag (one undo step). */
function dragBy(el: GantryElement, id: string, days: number): void {
  const { drag, graph: G } = getEngine(el);
  const geo = G.geoById.peek().get(id)!;
  const v = G.barVisual.peek()(geo);
  const x = v.x + v.width / 2;
  const to = x + days * G.timeline.peek().pxPerDay;
  drag.start(geo, 'bar', x);
  drag.move(to);
  drag.drop(to);
}

describe('<gantry-element> undo / redo keys', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });
  afterEach(() => {
    el?.remove();
    vi.useRealTimers();
  });

  it('Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo, ⌘ works too', () => {
    el = mount();
    dragBy(el, 'a', 2);
    expect(startOf(el, 'a')).toEqual(day(4));
    bar(el, 'a').focus();
    expect(press(el, 'z', { ctrlKey: true })).toBe(true);
    expect(startOf(el, 'a')).toEqual(day(2));
    expect(press(el, 'Z', { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(startOf(el, 'a')).toEqual(day(4));
    expect(press(el, 'z', { metaKey: true })).toBe(true);
    expect(startOf(el, 'a')).toEqual(day(2));
    expect(press(el, 'y', { ctrlKey: true })).toBe(true);
    expect(startOf(el, 'a')).toEqual(day(4));
    // Focus stays where it was
    expect(el.shadowRoot!.activeElement).toBe(bar(el, 'a'));
    // Nothing left to redo: still the chart's key (history on), nothing changes
    expect(press(el, 'y', { ctrlKey: true })).toBe(true);
    expect(el.canRedo).toBe(false);
  });

  it('works from the task list and from the timeline viewport', () => {
    el = mount();
    dragBy(el, 'a', 1);
    const row = $(el, '.gantt-tl-row[data-task-id="b"]');
    row.focus();
    expect(press(el, 'z', { ctrlKey: true })).toBe(true);
    expect(startOf(el, 'a')).toEqual(day(2));
    expect(press(el, 'y', { ctrlKey: true }, getEngine(el).dom.viewport)).toBe(true);
    expect(startOf(el, 'a')).toEqual(day(3));
  });

  it.each<[string, boolean | GanttEditingOptions]>([
    ['editing off', false],
    ['history: false', { history: false }],
    ['controlled', { controlled: true }],
  ])('%s: the keys keep their default action', (_, editing) => {
    el = mount(editing);
    dragBy(el, 'a', 2);
    const after = startOf(el, 'a');
    bar(el, 'a').focus();
    expect(press(el, 'z', { ctrlKey: true })).toBe(false);
    expect(press(el, 'y', { ctrlKey: true })).toBe(false);
    expect(startOf(el, 'a')).toEqual(after);
  });

  it('text entry keeps the browser undo: an input, anything inside a cell editor', () => {
    el = mount();
    dragBy(el, 'a', 2);
    const input = document.createElement('input');
    const editor = document.createElement('div');
    editor.className = 'gantt-tl-editor';
    const button = editor.appendChild(document.createElement('button'));
    el.shadowRoot!.append(input, editor);
    expect(press(el, 'z', { ctrlKey: true }, input)).toBe(false);
    expect(press(el, 'z', { ctrlKey: true }, button)).toBe(false);
    expect(startOf(el, 'a')).toEqual(day(4));
    input.remove();
    editor.remove();
  });

  it('move mode keeps them (modal), and Alt disables them', () => {
    el = mount();
    dragBy(el, 'a', 2);
    bar(el, 'a').focus();
    expect(press(el, 'Enter')).toBe(true);
    expect(press(el, 'z', { ctrlKey: true })).toBe(false);
    expect(startOf(el, 'a')).toEqual(day(4));
    press(el, 'Escape');
    expect(press(el, 'z', { ctrlKey: true, altKey: true })).toBe(false);
    expect(startOf(el, 'a')).toEqual(day(4));
    expect(el.canUndo).toBe(true);
  });
});
