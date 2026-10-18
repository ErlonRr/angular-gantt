// Keys in the task list (Gantry 2 phase 9, step 4.1, contract §3d and D6): a row-first treegrid
// with one tab stop (rows, cells and header cells rove; collapse toggles are out of the tab
// order), ↑/↓ PgUp/PgDn Home/End between rows (mounting rows beyond the virtual window), →/← to
// expand / collapse or to move into the cells and back, the header row above row 1 (Enter / Space
// sort), Enter / Space selection, and the expand / collapse announcements.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ANNOUNCE_DEBOUNCE, TaskType, type GanttTask } from '@gantryjs/core';
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

/** A group `g` with children `a` and `b`, then a root task `r`. */
const tree = (): GanttTask[] => [
  { id: 'g', name: 'Group', type: TaskType.Group, start: new Date(2026, 2, 2), end: new Date(2026, 2, 20) },
  { id: 'a', name: 'Alpha', parentId: 'g', start: new Date(2026, 2, 2), end: new Date(2026, 2, 9) },
  { id: 'b', name: 'Beta', parentId: 'g', start: new Date(2026, 2, 9), end: new Date(2026, 2, 20) },
  { id: 'r', name: 'Root', start: new Date(2026, 2, 21), end: new Date(2026, 2, 25) },
];

function mount(props: Partial<Pick<GantryElement, 'tasks' | 'options' | 'columns'>>): GantryElement {
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
const row = (el: GantryElement, id: string) => $(el, `.gantt-tl-row[data-task-id="${id}"]`);
const cell = (el: GantryElement, id: string, key: string) => {
  for (const c of $$(el, '.gantt-tl-cell')) if (c.getAttribute('data-focus-key') === `cell:${id}:${key}`) return c;
  throw new Error(`no cell ${id}:${key}`);
};
const head = (el: GantryElement, key: string) => $(el, `[data-focus-key="head:${key}"]`);
const active = (el: GantryElement) => el.shadowRoot!.activeElement as HTMLElement | null;
const focusKey = (el: GantryElement) => active(el)?.getAttribute('data-focus-key') ?? null;
/** Id of the task shown at visible row `i`. */
const idAt = (el: GantryElement, i: number) => getEngine(el).graph.visibleRows()[i].task.id;
const colKeys = (el: GantryElement) =>
  getEngine(el)
    .graph.tlColumns()
    .map(c => c.key);
/** Every element of the task list that is a tab stop. */
const stops = (el: GantryElement) =>
  $$(el, '.gantt-tasklist [tabindex="0"]').map(n => n.getAttribute('data-focus-key'));

/** A real keydown (composed, cancelable) on what has focus; returns whether the chart used it. */
function press(el: GantryElement, key: string, init: KeyboardEventInit = {}): boolean {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init });
  (active(el) ?? el).dispatchEvent(e);
  return e.defaultPrevented;
}

describe('<gantry-element> task-list keys', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    el?.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('one tab stop (D6)', () => {
    it('has header cells and cells in the navigation at tabindex -1, collapse toggles out of the tab order', () => {
      el = mount({ tasks: tree() });
      const keys = colKeys(el);
      const heads = $$(el, '.gantt-tl-col-header');
      expect(heads.map(h => h.getAttribute('data-focus-key'))).toEqual(keys.map(k => `head:${k}`));
      expect(heads.every(h => h.getAttribute('tabindex') === '-1')).toBe(true);
      const cells = $$(el, `.gantt-tl-row[data-task-id="a"] > .gantt-tl-cell`);
      expect(cells.map(c => c.getAttribute('data-focus-key'))).toEqual(keys.map(k => `cell:a:${k}`));
      expect(cells.every(c => c.getAttribute('tabindex') === '-1')).toBe(true);
      expect($(el, '.gantt-collapse-btn').getAttribute('tabindex')).toBe('-1');
      // The one stop: the first row in view
      expect(stops(el)).toEqual([`row:${idAt(el, 0)}`]);
    });

    it('moves the tab stop to the cell or header cell focused last, and back to a row', () => {
      el = mount({ tasks: tree() });
      const [first, second] = colKeys(el);
      cell(el, 'b', second).focus();
      flush(el);
      expect(stops(el)).toEqual([`cell:b:${second}`]);
      // Focus leaves the chart: the cell keeps it
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      outside.focus();
      flush(el);
      expect(stops(el)).toEqual([`cell:b:${second}`]);

      head(el, first).focus();
      flush(el);
      expect(stops(el)).toEqual([`head:${first}`]);
      row(el, 'r').focus();
      flush(el);
      expect(stops(el)).toEqual(['row:r']);
    });

    it('follows the bar focused in the timeline (the shared active row)', () => {
      el = mount({ tasks: tree() });
      cell(el, 'a', colKeys(el)[0]).focus();
      $<SVGElement>(el, '.gantt-bars-layer > [data-task-id="r"]').focus();
      flush(el);
      expect(stops(el)).toEqual(['row:r']);
    });
  });

  describe('rows', () => {
    it('↑/↓ move between rows, without wrapping (the key is still used at the ends)', () => {
      el = mount({ tasks: plan(5) });
      row(el, idAt(el, 0)).focus();
      expect(press(el, 'ArrowDown')).toBe(true);
      expect(focusKey(el)).toBe(`row:${idAt(el, 1)}`);
      press(el, 'ArrowDown');
      press(el, 'ArrowUp');
      expect(focusKey(el)).toBe(`row:${idAt(el, 1)}`);
      press(el, 'End');
      expect(focusKey(el)).toBe(`row:${idAt(el, 4)}`);
      expect(press(el, 'ArrowDown')).toBe(true);
      expect(focusKey(el)).toBe(`row:${idAt(el, 4)}`);
      press(el, 'Home');
      expect(focusKey(el)).toBe(`row:${idAt(el, 0)}`);
      flush(el);
      expect(stops(el)).toEqual([`row:${idAt(el, 0)}`]);
    });

    it('PageDown / End reach rows outside the virtual window: pinned, then focused after the flush', () => {
      el = mount({ tasks: plan(200), options: { initialScroll: false } });
      const last = idAt(el, 199);
      expect($$(el, `.gantt-tl-row[data-task-id="${last}"]`)).toHaveLength(0);
      row(el, idAt(el, 0)).focus();
      press(el, 'End');
      expect(getEngine(el).inputs.focusedRowId()).toBe(last);
      flush(el);
      expect(focusKey(el)).toBe(`row:${last}`);
      expect(row(el, last).classList.contains('gantt-tl-row--pinned')).toBe(true);

      press(el, 'Home');
      flush(el);
      const { inputs, graph } = getEngine(el);
      const page = Math.floor((500 - inputs.headerH()) / graph.config().rowHeight);
      press(el, 'PageDown');
      flush(el);
      expect(focusKey(el)).toBe(`row:${idAt(el, page)}`);
      press(el, 'PageUp');
      flush(el);
      expect(focusKey(el)).toBe(`row:${idAt(el, 0)}`);
    });

    it('→ expands a collapsed group, then enters its first cell; ← collapses, else goes to the parent row', () => {
      vi.useFakeTimers();
      el = mount({ tasks: tree() });
      const live = $(el, '.gantt-sr-live');
      el.collapseAll();
      flush(el);
      row(el, 'g').focus();
      expect(press(el, 'ArrowRight')).toBe(true);
      flush(el);
      expect(row(el, 'g').getAttribute('aria-expanded')).toBe('true');
      expect(focusKey(el)).toBe('row:g');
      vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
      expect(live.textContent).toBe('Group expanded');

      press(el, 'ArrowRight');
      expect(focusKey(el)).toBe(`cell:g:${colKeys(el)[0]}`);
      press(el, 'ArrowLeft');
      expect(focusKey(el)).toBe('row:g');

      // A child: ← goes to its parent; on the expanded parent ← collapses
      press(el, 'ArrowDown');
      expect(focusKey(el)).toBe(`row:${idAt(el, 1)}`);
      press(el, 'ArrowLeft');
      expect(focusKey(el)).toBe('row:g');
      press(el, 'ArrowLeft');
      flush(el);
      expect(row(el, 'g').getAttribute('aria-expanded')).toBe('false');
      expect($$(el, '.gantt-tl-row[data-task-id="a"]')).toHaveLength(0);
      vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
      expect(live.textContent).toBe('Group collapsed');
      // A root row without children: ← does nothing (but uses the key)
      row(el, 'r').focus();
      expect(press(el, 'ArrowLeft')).toBe(true);
      expect(focusKey(el)).toBe('row:r');
    });

    it('Enter activates the row (only this row + row-click); Space toggles, Shift+Space extends, Ctrl+Space toggles', () => {
      el = mount({ tasks: plan(5) });
      const clicks: string[] = [];
      el.addEventListener('row-click', e => clicks.push(e.detail.task.id));
      const ids = () =>
        el
          .getSelectedTasks()
          .map(t => t.id)
          .sort();
      const sorted = (...rows: number[]) => rows.map(i => idAt(el, i)).sort();
      row(el, idAt(el, 1)).focus();
      expect(press(el, 'Enter')).toBe(true);
      expect(ids()).toEqual(sorted(1));
      expect(clicks).toEqual([idAt(el, 1)]);
      press(el, 'ArrowDown');
      press(el, 'ArrowDown');
      expect(press(el, ' ', { shiftKey: true })).toBe(true);
      expect(ids()).toEqual(sorted(1, 2, 3));
      press(el, 'ArrowUp');
      press(el, ' ', { ctrlKey: true });
      expect(ids()).toEqual(sorted(1, 3));
      press(el, ' ');
      expect(ids()).toEqual(sorted(1, 2, 3));
      expect(clicks).toHaveLength(1);
    });
  });

  describe('cells', () => {
    it('←/→ move between cells, ← on the first cell returns to the row; ↑/↓ keep the column; Home/End, Ctrl+Home/End', () => {
      el = mount({ tasks: plan(4) });
      const keys = colKeys(el);
      const last = keys.length - 1;
      row(el, idAt(el, 1)).focus();
      press(el, 'ArrowRight');
      expect(focusKey(el)).toBe(`cell:${idAt(el, 1)}:${keys[0]}`);
      press(el, 'ArrowRight');
      expect(focusKey(el)).toBe(`cell:${idAt(el, 1)}:${keys[1]}`);
      press(el, 'ArrowDown');
      expect(focusKey(el)).toBe(`cell:${idAt(el, 2)}:${keys[1]}`);
      press(el, 'End');
      expect(focusKey(el)).toBe(`cell:${idAt(el, 2)}:${keys[last]}`);
      press(el, 'Home');
      expect(focusKey(el)).toBe(`cell:${idAt(el, 2)}:${keys[0]}`);
      press(el, 'End', { ctrlKey: true });
      expect(focusKey(el)).toBe(`cell:${idAt(el, 3)}:${keys[0]}`);
      press(el, 'Home', { ctrlKey: true });
      expect(focusKey(el)).toBe(`cell:${idAt(el, 0)}:${keys[0]}`);
      press(el, 'ArrowLeft');
      expect(focusKey(el)).toBe(`row:${idAt(el, 0)}`);
    });

    it('Enter on a cell activates its row; a button inside a cell keeps Enter and Space', () => {
      el = mount({ tasks: tree() });
      const onClick = vi.fn();
      el.addEventListener('row-click', onClick);
      cell(el, 'r', colKeys(el)[0]).focus();
      press(el, 'Enter');
      expect(onClick).toHaveBeenCalledOnce();
      const toggle = $<HTMLButtonElement>(el, '[data-focus-key="collapse:g"]');
      toggle.focus();
      expect(press(el, 'Enter')).toBe(false);
      expect(press(el, ' ')).toBe(false);
      expect(onClick).toHaveBeenCalledOnce();
      // Arrow keys still move from the cell the button is in
      expect(press(el, 'ArrowDown')).toBe(true);
      expect(focusKey(el)).toBe(`cell:${idAt(el, 1)}:${colKeys(el)[0]}`);
    });

    it('leaves the keys of a text field in a custom cell alone', () => {
      el = mount({
        tasks: plan(2),
        options: { panel: { columns: ['name', 'note'] } },
        columns: [
          { key: 'name', label: 'Name', width: 200 },
          { key: 'note', label: 'Note', width: 120, cellTemplate: () => document.createElement('input') },
        ],
      });
      const input = $(el, '.gantt-tl-cell input');
      input.focus();
      expect(press(el, 'ArrowDown')).toBe(false);
      expect(press(el, ' ')).toBe(false);
      expect(press(el, 'f')).toBe(false);
    });
  });

  describe('header row', () => {
    it('↑ from the first row enters the header row, ↓ comes back in the same column; Enter / Space sort', () => {
      el = mount({ tasks: plan(3) });
      const keys = colKeys(el);
      row(el, idAt(el, 0)).focus();
      press(el, 'ArrowUp');
      expect(focusKey(el)).toBe(`head:${keys[0]}`);
      press(el, 'ArrowRight');
      expect(focusKey(el)).toBe(`head:${keys[1]}`);
      // Up and page / edge jumps stay in the header or stop at row 1
      expect(press(el, 'ArrowUp')).toBe(true);
      expect(focusKey(el)).toBe(`head:${keys[1]}`);
      press(el, 'ArrowDown');
      expect(focusKey(el)).toBe(`cell:${idAt(el, 0)}:${keys[1]}`);
      press(el, 'ArrowUp');

      press(el, 'ArrowLeft');
      expect(focusKey(el)).toBe('head:name');
      expect(press(el, 'Enter')).toBe(true);
      flush(el);
      expect(getEngine(el).graph.sort()).toEqual({ key: 'name', dir: 'asc' });
      expect(focusKey(el)).toBe('head:name');
      press(el, ' ');
      flush(el);
      expect(getEngine(el).graph.sort()).toEqual({ key: 'name', dir: 'desc' });
      expect(head(el, 'name').getAttribute('aria-sort')).toBe('descending');
    });
  });
});
