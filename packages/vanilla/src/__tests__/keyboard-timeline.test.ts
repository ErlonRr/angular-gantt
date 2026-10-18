// Keys on the timeline's bars (Gantry 2 phase 9, step 4.1, contract §3d): the bars are one roving
// tab stop (D5; the viewport only without bars), a flat listbox (aria-posinset / -setsize over the
// visible rows), ↑/↓ PgUp/PgDn Home/End move focus bar to bar (mounting rows beyond the window),
// ←/→ pan one bottom-tier cell, Space selects, Enter activates a bar that can't move, and the
// global shortcuts (F fits, + − T, Ctrl+A, `characterShortcuts: false`). happy-dom focuses SVG
// elements but scrolls nothing: the scroll offsets are checked through the engine's inputs.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { panScrollLeft, TaskType, ViewMode, type GanttTask } from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
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

function mount(props: Partial<Pick<GantryElement, 'tasks' | 'options' | 'enableDrag'>>): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, props);
  document.body.appendChild(el);
  flush(el);
  return el;
}

const $ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel)!;
const $$ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => [
  ...el.shadowRoot!.querySelectorAll<T>(sel),
];
const bar = (el: GantryElement, id: string) => $<SVGGElement>(el, `.gantt-bars-layer > [data-task-id="${id}"]`);
const tabStops = (el: GantryElement) =>
  $$(el, '.gantt-bars-layer > [tabindex="0"]').map(b => b.getAttribute('data-task-id'));
const active = (el: GantryElement) => el.shadowRoot!.activeElement;
/** Id of the task shown at visible row `i`. */
const idAt = (el: GantryElement, i: number) => getEngine(el).graph.visibleRows()[i].task.id;

/** A real keydown (composed, cancelable) on `target`; returns whether the chart used it. */
function press(target: Element, key: string, init: KeyboardEventInit = {}): boolean {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e.defaultPrevented;
}

/** Rows of one page: the vertical window's height (happy-dom measures 0: the fallback 500 px). */
const pageRows = (el: GantryElement) => {
  const { inputs, graph } = getEngine(el);
  return Math.floor((500 - inputs.headerH()) / graph.config().rowHeight);
};

describe('<gantry-element> timeline keys', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    el?.remove();
    vi.restoreAllMocks();
  });

  describe('roving tab stop (D5)', () => {
    it('makes every bar focusable and one of them the tab stop: the first in view, then the focused one', () => {
      el = mount({ tasks: plan(60), options: { initialScroll: false } });
      const bars = $$(el, '.gantt-bars-layer > [data-task-id]');
      expect(bars.every(b => ['0', '-1'].includes(b.getAttribute('tabindex')!))).toBe(true);
      expect(bars.map(b => b.getAttribute('data-focus-key'))).toEqual(
        bars.map(b => `bar:${b.getAttribute('data-task-id')}`),
      );
      expect(tabStops(el)).toEqual(['t0']);
      expect($(el, '.gantry-canvas-viewport').getAttribute('tabindex')).toBe('-1');

      // Scrolled: the first bar in view (not an overscan bar above it)
      const rh = getEngine(el).graph.config().rowHeight;
      const viewport = $(el, '.gantry-canvas-viewport');
      viewport.scrollTop = 10 * rh;
      viewport.dispatchEvent(new Event('scroll'));
      flush(el);
      expect(tabStops(el)).toEqual([idAt(el, 10)]);

      // The focused bar takes it, and keeps it once focus leaves the chart
      const id = idAt(el, 12);
      bar(el, id).focus();
      flush(el);
      expect(tabStops(el)).toEqual([id]);
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      outside.focus();
      flush(el);
      expect(tabStops(el)).toEqual([id]);
    });

    it('shares the active row with the task list: a focused row moves the bar tab stop, and back', () => {
      el = mount({ tasks: plan(10) });
      $(el, '.gantt-tl-row[data-task-id="t4"]').focus();
      flush(el);
      expect(tabStops(el)).toEqual(['t4']);
      bar(el, 't6').focus();
      flush(el);
      expect($$(el, '.gantt-tl-row[tabindex="0"]').map(r => r.dataset['taskId'])).toEqual(['t6']);
    });

    it('is a flat listbox: aria-posinset / aria-setsize count the visible rows (the task list keeps the tree)', () => {
      el = mount({
        tasks: [
          { id: 'g', name: 'G', type: TaskType.Group, start: new Date(2026, 2, 2), end: new Date(2026, 2, 20) },
          { id: 'a', name: 'A', parentId: 'g', start: new Date(2026, 2, 2), end: new Date(2026, 2, 9) },
          { id: 'b', name: 'B', parentId: 'g', start: new Date(2026, 2, 9), end: new Date(2026, 2, 20) },
          { id: 'r', name: 'R', start: new Date(2026, 2, 3), end: new Date(2026, 2, 6) },
        ],
      });
      const rows = getEngine(el).graph.visibleRows();
      for (const r of rows) {
        expect(bar(el, r.task.id).getAttribute('aria-posinset'), r.task.id).toBe(String(r.visibleIndex + 1));
        expect(bar(el, r.task.id).getAttribute('aria-setsize'), r.task.id).toBe('4');
      }
      // The task-list rows tell the tree: siblings
      expect($(el, '.gantt-tl-row[data-task-id="b"]').getAttribute('aria-setsize')).toBe('2');
      el.collapseAll();
      flush(el);
      expect(bar(el, 'r').getAttribute('aria-setsize')).toBe('2');
      expect(bar(el, 'r').getAttribute('aria-posinset')).toBe(
        String(getEngine(el).graph.geoById().get('r')!.row.visibleIndex + 1),
      );
    });

    it('stamps the tab stop and focus key on custom bars too', () => {
      el = mount({ tasks: plan(3) });
      el.renderBar = () => document.createElementNS('http://www.w3.org/2000/svg', 'g');
      flush(el);
      expect(tabStops(el)).toEqual(['t0']);
      expect(bar(el, 't1').getAttribute('tabindex')).toBe('-1');
      expect(bar(el, 't1').getAttribute('data-focus-key')).toBe('bar:t1');
    });

    it('keeps focus on a custom bar its renderer replaces', () => {
      el = mount({ tasks: plan(3) });
      el.renderBar = () => document.createElementNS('http://www.w3.org/2000/svg', 'g');
      flush(el);
      const node = bar(el, 't1');
      node.focus();
      // Selection is part of the custom bar's context: a new node
      press(node, ' ');
      flush(el);
      expect(bar(el, 't1')).not.toBe(node);
      expect(active(el)).toBe(bar(el, 't1'));
    });
  });

  describe('moves', () => {
    it('↑/↓ focus the bar of the previous / next row, at the ends nothing (the key is still used)', () => {
      el = mount({ tasks: plan(5) });
      bar(el, idAt(el, 0)).focus();
      expect(press(bar(el, idAt(el, 0)), 'ArrowDown')).toBe(true);
      expect(active(el)).toBe(bar(el, idAt(el, 1)));
      press(active(el)!, 'ArrowDown');
      press(active(el)!, 'ArrowUp');
      expect(active(el)).toBe(bar(el, idAt(el, 1)));
      press(active(el)!, 'ArrowUp');
      expect(press(active(el)!, 'ArrowUp')).toBe(true);
      expect(active(el)).toBe(bar(el, idAt(el, 0)));
      flush(el);
      expect(getEngine(el).inputs.focusedRowId()).toBe(idAt(el, 0));
    });

    it('End, Home and PageDown reach bars outside the virtual window: pinned, focused after the flush', () => {
      el = mount({ tasks: plan(200), options: { initialScroll: false } });
      const last = idAt(el, 199);
      expect($$(el, `.gantt-bars-layer > [data-task-id="${last}"]`)).toHaveLength(0);
      bar(el, idAt(el, 0)).focus();
      press(bar(el, idAt(el, 0)), 'End');
      expect(getEngine(el).inputs.focusedRowId()).toBe(last);
      flush(el);
      expect(active(el)).toBe(bar(el, last));
      expect(tabStops(el)).toEqual([last]);

      press(active(el)!, 'Home', { ctrlKey: true });
      flush(el);
      expect(active(el)).toBe(bar(el, idAt(el, 0)));

      press(active(el)!, 'PageDown');
      flush(el);
      expect(active(el)).toBe(bar(el, idAt(el, pageRows(el))));
      press(active(el)!, 'PageUp');
      flush(el);
      expect(active(el)).toBe(bar(el, idAt(el, 0)));
    });

    it('scrolls the bar it moves to into view by the least amount (not centred), below the sticky header', () => {
      el = mount({ tasks: plan(200), options: { initialScroll: false } });
      const scrolled: (ScrollIntoViewOptions | boolean | undefined)[] = [];
      const into = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element, o) {
        if (this.parentNode === $(el, '.gantt-bars-layer')) scrolled.push(o);
      });
      bar(el, idAt(el, 0)).focus();
      press(bar(el, idAt(el, 0)), 'ArrowDown');
      press(active(el)!, 'End');
      flush(el);
      expect(active(el)).toBe(bar(el, idAt(el, 199)));
      expect(scrolled).toEqual([
        { block: 'nearest', inline: 'nearest' },
        { block: 'nearest', inline: 'nearest' },
      ]);
      into.mockRestore();
    });

    it('←/→ pan the timeline by one bottom-tier header cell', () => {
      el = mount({ tasks: plan(5), options: { viewMode: ViewMode.Day, initialScroll: false } });
      const { inputs, graph } = getEngine(el);
      const tl = graph.timeline();
      bar(el, 't0').focus();
      expect(press(bar(el, 't0'), 'ArrowRight')).toBe(true);
      const right = panScrollLeft(tl, 0, 0, 1);
      expect(right).toBeGreaterThan(0);
      expect(inputs.scrollLeft()).toBe(right);
      // Focus stays on the bar
      expect(active(el)).toBe(bar(el, 't0'));
      $(el, '.gantry-canvas-viewport').scrollLeft = right;
      press(bar(el, 't0'), 'ArrowLeft');
      expect(inputs.scrollLeft()).toBe(0);
    });
  });

  describe('selection and activation', () => {
    it('Space toggles (multiple selection), Shift+Space extends the range, Ctrl+Space toggles', () => {
      el = mount({ tasks: plan(6) });
      const ids = () => el.getSelectedTasks().map(t => t.id);
      bar(el, idAt(el, 1)).focus();
      expect(press(bar(el, idAt(el, 1)), ' ')).toBe(true);
      expect(ids()).toEqual([idAt(el, 1)]);
      press(bar(el, idAt(el, 3)), ' ', { shiftKey: true });
      const sorted = (...rows: number[]) => rows.map(i => idAt(el, i)).sort();
      expect(ids().sort()).toEqual(sorted(1, 2, 3));
      press(bar(el, idAt(el, 2)), ' ', { ctrlKey: true });
      expect(ids().sort()).toEqual(sorted(1, 3));
      press(bar(el, idAt(el, 2)), ' ');
      expect(ids().sort()).toEqual(sorted(1, 2, 3));
    });

    it('single selection: Space selects the bar alone', () => {
      el = mount({ tasks: plan(4), options: { multiSelect: false } });
      press(bar(el, 't1'), ' ');
      press(bar(el, 't2'), ' ');
      expect(el.getSelectedTasks().map(t => t.id)).toEqual(['t2']);
    });

    it('Enter / F2 on a bar that cannot move activate it: only this row, and row-click', () => {
      el = mount({ tasks: plan(4), enableDrag: false });
      const clicks: string[] = [];
      el.addEventListener('row-click', e => clicks.push(e.detail.task.id));
      el.setSelectedTasks(['t0', 't3']);
      expect(press(bar(el, 't1'), 'Enter')).toBe(true);
      expect(el.getSelectedTasks().map(t => t.id)).toEqual(['t1']);
      press(bar(el, 't2'), 'F2');
      expect(clicks).toEqual(['t1', 't2']);
      expect(getEngine(el).inputs.dragPreview()).toBeNull();
    });

    it('a task with draggable: false activates too', () => {
      el = mount({ tasks: plan(3).map(t => (t.id === 't1' ? { ...t, draggable: false } : t)) });
      const onClick = vi.fn();
      el.addEventListener('row-click', onClick);
      press(bar(el, 't1'), 'Enter');
      expect(onClick).toHaveBeenCalledOnce();
      expect(getEngine(el).inputs.dragPreview()).toBeNull();
    });
  });

  describe('global shortcuts', () => {
    it('F fits, + / − zoom, T scrolls to today and Ctrl+A selects all from a bar; Esc clears', () => {
      el = mount({ tasks: plan(4), options: { viewMode: ViewMode.Week } });
      const fit = vi.spyOn(el, 'fitToScreen');
      const today = vi.spyOn(el, 'scrollToToday');
      expect(press(bar(el, 't0'), 'f')).toBe(true);
      expect(fit).toHaveBeenCalledOnce();
      press(bar(el, 't0'), '+');
      expect(el.viewMode).toBe(ViewMode.Day);
      press(bar(el, 't0'), '-');
      expect(el.viewMode).toBe(ViewMode.Week);
      press(bar(el, 't0'), 'T');
      expect(today).toHaveBeenCalledOnce();
      press(bar(el, 't0'), 'a', { ctrlKey: true });
      expect(el.getSelectedTasks()).toHaveLength(4);
      press(bar(el, 't0'), 'Escape');
      expect(el.getSelectedTasks()).toHaveLength(0);
    });

    it('F works from the task list and the toolbar as well', () => {
      el = mount({ tasks: plan(2) });
      const fit = vi.spyOn(el, 'fitToScreen');
      press($(el, '.gantt-tl-row'), 'F');
      press($(el, '.gantt-toolbar button'), 'f');
      expect(fit).toHaveBeenCalledTimes(2);
    });

    it('characterShortcuts: false leaves + − T F to the page (Ctrl+A and Esc stay)', () => {
      el = mount({ tasks: plan(3), options: { viewMode: ViewMode.Week, keyboard: { characterShortcuts: false } } });
      const fit = vi.spyOn(el, 'fitToScreen');
      for (const key of ['f', '+', '-', 't']) expect(press(bar(el, 't0'), key), key).toBe(false);
      expect(fit).not.toHaveBeenCalled();
      expect(el.viewMode).toBe(ViewMode.Week);
      expect(press(bar(el, 't0'), 'a', { ctrlKey: true })).toBe(true);
      expect(el.getSelectedTasks()).toHaveLength(3);
    });

    it('leaves the arrow keys of the viewport alone while no bar is mounted (native scroll)', () => {
      el = mount({ tasks: [] });
      const viewport = $(el, '.gantry-canvas-viewport');
      expect(viewport.getAttribute('tabindex')).toBe('0');
      expect(press(viewport, 'ArrowRight')).toBe(false);
      expect(press(viewport, 'ArrowDown')).toBe(false);
    });
  });
});
