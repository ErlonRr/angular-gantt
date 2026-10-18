// Task list, toolbar and legend patched in place (Gantry 2 phase 6, step 2.3): rows keyed by task
// id (pooled), cells keyed by column key, delegated listeners, column resize through pointer
// capture (no `window` listeners), a toolbar built once, a legend keyed by item.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskType, ViewMode, type GanttFlatRow, type GanttState, type GanttTask } from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import '../index';

/** Runs the element's queued frame work now. */
const flush = (el: GantryElement) => getEngine(el).flushSync();

/** `n` one-week tasks in March 2026. */
function plan(n: number): GanttTask[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Task ${i}`,
    start: new Date(2026, 2, 2 + (i % 20)),
    end: new Date(2026, 2, 9 + (i % 20)),
    progress: (i * 7) % 100,
  }));
}

function mount(props: Partial<Pick<GantryElement, 'tasks' | 'options' | 'columns'>>): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, props);
  document.body.appendChild(el);
  flush(el);
  return el;
}

const $ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => [
  ...el.shadowRoot!.querySelectorAll<T>(sel),
];
const row = (el: GantryElement, id: string) => $(el, `.gantt-tl-row[data-task-id="${id}"]`);
const rowIds = (el: GantryElement) => $$(el, '.gantt-tl-row').map(r => r.dataset['taskId']);
/** Id of the task shown at visible row `i`. */
const idAt = (el: GantryElement, i: number) => getEngine(el).graph.visibleRows()[i].task.id;

function scrollTo(el: GantryElement, top: number): void {
  const viewport = $(el, '.gantry-canvas-viewport')!;
  viewport.scrollTop = top;
  viewport.dispatchEvent(new Event('scroll'));
  flush(el);
}

const pointer = (type: string, init: PointerEventInit) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 7, ...init });

const nextTask = () => new Promise<void>(r => setTimeout(r, 0));

describe('task-list layer', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    el?.remove();
    vi.restoreAllMocks();
  });

  it('keeps the container first class gantt-tasklist (paint keys) and the skeleton class', () => {
    el = mount({ tasks: plan(3) });
    const list = $(el, '.gantry-panel > *')!;
    expect([...list.classList]).toEqual(['gantt-tasklist', 'gantry-tasklist-container']);
    expect(list.getAttribute('role')).toBe('treegrid');
    expect(list.getAttribute('aria-rowcount')).toBe('4');
    expect(list.getAttribute('aria-colcount')).toBe('4');
    // Header row, rows group between two spacers, in that order
    expect([...list.children].map(c => c.className)).toEqual(['gantt-tl-col-headers', 'gantt-tl-rows']);
    const body = $(el, '.gantt-tl-rows')!;
    expect(body.firstElementChild?.className).toBe('');
    expect(body.lastElementChild?.className).toBe('');
    expect(rowIds(el)).toEqual(['t0', 't1', 't2']);
  });

  it('keeps a focused row (same node, still focused) across a 10-row scroll', () => {
    el = mount({ tasks: plan(300), options: { initialScroll: false } });
    const [id, other] = [idAt(el, 3), idAt(el, 12)];
    const focused = row(el, id)!;
    const inBoth = row(el, other)!;
    focused.focus();
    scrollTo(el, 36 * 10);
    expect(row(el, id)).toBe(focused);
    expect(el.shadowRoot!.activeElement).toBe(focused);
    expect(focused.classList.contains('gantt-tl-row--pinned')).toBe(true);
    expect(focused.style.getPropertyValue('top')).toBe(`${3 * 36}px`);
    // A row inside both windows keeps its node too
    expect(row(el, other)).toBe(inBoth);

    // Back in the window: in the flow again, same node
    scrollTo(el, 0);
    expect(row(el, id)).toBe(focused);
    expect(focused.classList.contains('gantt-tl-row--pinned')).toBe(false);
    expect(focused.style.getPropertyValue('top')).toBe('');
    expect(el.shadowRoot!.activeElement).toBe(focused);
  });

  it('recycles the rows that leave the window through the pool', () => {
    el = mount({ tasks: plan(300), options: { initialScroll: false } });
    const first = new Set($$(el, '.gantt-tl-row'));
    scrollTo(el, 36 * 10);
    scrollTo(el, 36 * 20);
    const rows = $$(el, '.gantt-tl-row');
    const { graph } = getEngine(el);
    expect(rows).toHaveLength(graph.vWindow().last - graph.vWindow().first + 1);
    // Rows that left at the first scroll came back for the second one
    expect(rows.filter(r => first.has(r)).length).toBeGreaterThan(0);
    expect(rows[0]?.dataset['taskId']).toBe(graph.visibleRows()[graph.vWindow().first]?.task.id);
    // A recycled row shows its new task in every cell
    for (const r of rows) {
      const id = r.dataset['taskId']!;
      expect(r.getAttribute('data-focus-key')).toBe(`row:${id}`);
      expect(r.querySelector('.gantt-tl-cell > span > span:last-child')?.textContent).toBe(`Task ${id.slice(1)}`);
    }
  });

  it('patches rows and cells in place on selection and sort', () => {
    el = mount({ tasks: plan(3) });
    const before = rowIds(el).map(id => row(el, id!)!);
    const cell = row(el, 't1')!.querySelector('.gantt-tl-cell');
    el.setSelectedTasks(['t1']);
    flush(el);
    expect(row(el, 't1')).toBe(before[1]);
    expect(row(el, 't1')!.querySelector('.gantt-tl-cell')).toBe(cell);
    expect(row(el, 't1')!.classList.contains('gantt-tl-row--selected')).toBe(true);
    expect(row(el, 't1')!.getAttribute('aria-selected')).toBe('true');

    // Descending by name: the same nodes, reordered
    const nameHeader = $(el, '.gantt-tl-col-header')!;
    nameHeader.click();
    flush(el);
    nameHeader.click();
    flush(el);
    expect(rowIds(el)).toEqual(['t2', 't1', 't0']);
    expect($$(el, '.gantt-tl-row')).toEqual([before[2], before[1], before[0]]);
    expect(nameHeader.getAttribute('aria-sort')).toBe('descending');
    expect($(el, '.gantt-tl-col-header')).toBe(nameHeader);
  });

  it('renders cell templates again only when the row or the columns change', () => {
    const template = vi.fn((r: GanttFlatRow) => `owner of ${r.task.id}`);
    el = mount({
      tasks: plan(300),
      options: { initialScroll: false, panel: { columns: ['name', 'owner'] } },
      columns: [
        { key: 'name', label: 'Name', width: 200 },
        { key: 'owner', label: 'Owner', width: 120, cellTemplate: template },
      ],
    });
    const mounted = $$(el, '.gantt-tl-row').length;
    expect(template).toHaveBeenCalledTimes(mounted);
    expect(row(el, 't0')!.querySelectorAll('.gantt-tl-cell')[1]?.textContent).toBe('owner of t0');
    template.mockClear();
    el.setSelectedTasks(['t1']);
    flush(el);
    expect(template).not.toHaveBeenCalled();
    // Ten rows enter the window: ten new rows rendered, the others untouched
    scrollTo(el, 36 * 10);
    expect(template).toHaveBeenCalledTimes(10);
  });

  it('sets aria-multiselectable from the selection mode', () => {
    el = mount({ tasks: plan(2), options: { multiSelect: false } });
    expect($(el, '.gantt-tasklist')?.getAttribute('aria-multiselectable')).toBe('false');
    el.options = {};
    flush(el);
    expect($(el, '.gantt-tasklist')?.getAttribute('aria-multiselectable')).toBe('true');
    el.options = { enableSelection: false };
    flush(el);
    expect($(el, '.gantt-tasklist')?.getAttribute('aria-multiselectable')).toBe('false');
  });

  describe('delegated listeners', () => {
    it('selects on click and on Enter / Space on the row itself, emits row-dblclick', () => {
      el = mount({ tasks: plan(3) });
      const clicks: string[] = [];
      const dbl: string[] = [];
      el.addEventListener('row-click', e => clicks.push(e.detail.task.id));
      el.addEventListener('row-dblclick', e => dbl.push(e.detail.task.id));

      row(el, 't1')!
        .querySelector('.gantt-tl-cell span')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(el.getSelectedTasks().map(t => t.id)).toEqual(['t1']);

      const enter = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      row(el, 't2')!.dispatchEvent(enter);
      expect(enter.defaultPrevented).toBe(true);
      expect(el.getSelectedTasks().map(t => t.id)).toEqual(['t2']);

      // A key on something inside the row is not a row activation
      row(el, 't0')!
        .querySelector('.gantt-tl-cell')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(el.getSelectedTasks().map(t => t.id)).toEqual(['t2']);

      row(el, 't0')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(clicks).toEqual(['t1', 't2']);
      expect(dbl).toEqual(['t0']);
    });

    it('toggles a group from its collapse button without selecting the row', () => {
      el = mount({
        tasks: [
          { ...plan(1)[0], id: 'g', type: TaskType.Group },
          { ...plan(1)[0], id: 'c', parentId: 'g' },
        ],
      });
      const onClick = vi.fn();
      el.addEventListener('row-click', onClick);
      const toggle = $<HTMLButtonElement>(el, '[data-focus-key="collapse:g"]')!;
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      toggle.click();
      flush(el);
      expect(rowIds(el)).toEqual(['g']);
      expect($(el, '[data-focus-key="collapse:g"]')).toBe(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(toggle.textContent).toBe('▶');
      expect(row(el, 'g')!.getAttribute('aria-expanded')).toBe('false');
      expect(onClick).not.toHaveBeenCalled();
      expect(el.getSelectedTasks()).toHaveLength(0);
    });

    it('sorts from a header click or Enter, cycling asc → desc → original', () => {
      el = mount({ tasks: plan(3) });
      const header = $(el, '[data-focus-key="sort:name"]')!;
      header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      flush(el);
      expect(getEngine(el).graph.sort()).toEqual({ key: 'name', dir: 'asc' });
      header.click();
      flush(el);
      expect(getEngine(el).graph.sort()).toEqual({ key: 'name', dir: 'desc' });
      expect(header.lastElementChild?.previousElementSibling?.textContent).toBe('▼');
      header.click();
      flush(el);
      expect(getEngine(el).graph.sort()).toBeNull();
      expect(header.getAttribute('aria-sort')).toBe('none');
    });
  });

  describe('column resize', () => {
    const nameWidth = (e: GantryElement) => getEngine(e).columns.widths()['name'];

    it('resizes live through pointer capture on the handle, saves once, and the trailing click does not sort', async () => {
      el = mount({ tasks: plan(3) });
      const states: GanttState[] = [];
      el.addEventListener('state-change', e => states.push(e.detail));
      const start = nameWidth(el);
      const handle = $(el, '.gantt-tl-col-header .gantt-col-resize')!;
      handle.dispatchEvent(pointer('pointerdown', { clientX: 100 }));
      expect(handle.hasPointerCapture(7)).toBe(true);
      handle.dispatchEvent(pointer('pointermove', { clientX: 150 }));
      flush(el);
      expect(nameWidth(el)).toBe(start + 50);
      expect($(el, '.gantt-tl-col-headers')!.style.getPropertyValue('grid-template-columns')).toContain(
        `${start + 50}px`,
      );
      expect($(el, '.gantt-tl-col-header .gantt-col-resize')).toBe(handle);
      // Clamped to the column's bounds
      handle.dispatchEvent(pointer('pointermove', { clientX: -1000 }));
      const nameCol = getEngine(el).graph.tlColumns()[0];
      expect(nameWidth(el)).toBe(nameCol.minWidth ?? 40);
      handle.dispatchEvent(pointer('pointermove', { clientX: 120 }));
      handle.dispatchEvent(pointer('pointerup', { clientX: 120 }));
      expect(handle.hasPointerCapture(7)).toBe(false);
      handle.click();
      $(el, '.gantt-tl-col-header')!.click();
      flush(el);
      expect(getEngine(el).graph.sort()).toBeNull();
      await vi.waitFor(() => expect(states).toHaveLength(1));
      expect(states[0]?.columnWidths?.['name']).toBe(start + 20);

      // Once the click is past, the header sorts again
      await nextTask();
      $(el, '.gantt-tl-col-header')!.click();
      expect(getEngine(el).graph.sort()).toEqual({ key: 'name', dir: 'asc' });
    });

    it('leaves no listener behind when the element is removed mid-resize (none ever on window)', () => {
      el = mount({ tasks: plan(3) });
      const onState = vi.fn<(e: CustomEvent<GanttState>) => void>();
      el.addEventListener('state-change', onState);
      const winAdd = vi.spyOn(window, 'addEventListener');
      const docAdd = vi.spyOn(document, 'addEventListener');
      const start = nameWidth(el);
      const handle = $(el, '.gantt-tl-col-header .gantt-col-resize')!;
      const added = vi.spyOn(handle, 'addEventListener');
      const removed = vi.spyOn(handle, 'removeEventListener');

      handle.dispatchEvent(pointer('pointerdown', { clientX: 100 }));
      handle.dispatchEvent(pointer('pointermove', { clientX: 130 }));
      expect(added.mock.calls.length).toBeGreaterThan(0);
      el.remove();

      const pointerTypes = (calls: readonly unknown[][]) => calls.map(c => String(c[0])).filter(t => /pointer/.test(t));
      expect(pointerTypes(winAdd.mock.calls)).toEqual([]);
      expect(pointerTypes(docAdd.mock.calls)).toEqual([]);
      // Every listener the gesture added to the handle is gone again, with the capture
      expect(removed.mock.calls.map(c => [c[0], c[1]])).toEqual(added.mock.calls.map(c => [c[0], c[1]]));
      expect(handle.hasPointerCapture(7)).toBe(false);
      handle.dispatchEvent(pointer('pointermove', { clientX: 400 }));
      expect(nameWidth(el)).toBe(start + 30);
      // The width reached is kept and saved
      expect(onState).toHaveBeenCalledOnce();
      expect(onState.mock.calls[0][0].detail.columnWidths?.['name']).toBe(start + 30);
    });
  });

  describe('data-source footer', () => {
    it('patches the footer in place through Loading, Load more, error, Retry and all loaded', async () => {
      // Pages of 40 rows: the window stays far from the end, so nothing loads by itself
      let fail = false;
      let last = false;
      const gates: (() => void)[] = [];
      const fetcher = vi.fn(async (page: number, size: number) => {
        await new Promise<void>(r => gates.push(r));
        if (fail) throw new Error('offline');
        return last ? [] : Array.from({ length: size }, (_, i) => ({ ...plan(1)[0], id: `p${page}-${i}` }));
      });
      const release = async () => {
        await vi.waitFor(() => expect(gates).toHaveLength(1));
        gates.shift()!();
      };
      /** Waits until the footer shows `text` (flushing the frames the data source schedules). */
      const settled = (node: Node, text: string) =>
        vi.waitFor(() => {
          flush(el);
          expect(node.textContent).toBe(text);
        });
      el = mount({});
      el.dataSource = { fetcher, pageSize: 40, retries: 0 };
      await vi.waitFor(() => expect(gates).toHaveLength(1));
      flush(el);
      const footer = $(el, '.gantt-tl-load-more')!;
      const button = $<HTMLButtonElement>(el, '.gantt-load-more-btn')!;
      expect(footer.getAttribute('aria-busy')).toBe('true');
      expect(button.textContent).toBe('Loading…');
      expect(button.getAttribute('aria-disabled')).toBe('true');

      await release();
      await settled(button, 'Load more');
      expect(el.tasks).toHaveLength(40);
      expect($(el, '.gantt-load-more-btn')).toBe(button);
      expect(button.hasAttribute('aria-disabled')).toBe(false);
      expect(footer.hasAttribute('aria-busy')).toBe(false);

      fail = true;
      button.click();
      await release();
      await settled(button, 'Retry');
      expect($(el, '.gantt-load-error .gantt-load-more-btn')).toBe(button);
      expect($(el, '.gantt-load-error span')?.textContent).toBe('Couldn’t load tasks');
      expect($(el, '.gantt-tl-load-more')).toBe(footer);

      fail = false;
      button.click();
      expect(fetcher).toHaveBeenLastCalledWith(2, 40);
      await release();
      await settled(button, 'Load more');
      expect(footer.firstElementChild).toBe(button);
      expect(el.tasks).toHaveLength(80);

      last = true;
      button.click();
      await release();
      await settled(footer, getEngine(el).graph.i18n().labels.allLoaded(80));
      expect(footer.children).toHaveLength(0);
      expect(footer.getAttribute('tabindex')).toBe('-1');
      expect(footer.dataset['focusKey']).toBe('load-more');

      el.dataSource = null;
      flush(el);
      expect($(el, '.gantt-tl-load-more')).toBeNull();
    });
  });
});

describe('toolbar layer', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    el?.remove();
  });

  it('keeps its nodes across option changes, zooms, view switches and hiding', () => {
    el = mount({ tasks: plan(3), options: { viewMode: ViewMode.Month } });
    const bar = $(el, '.gantt-toolbar')!;
    const zoomIn = $(el, '[data-focus-key="zoom-in"]')!;
    const today = $(el, '[data-focus-key="today"]')!;
    const week = $(el, '[data-focus-key="zoom:Week"]')!;
    expect(bar.getAttribute('role')).toBe('toolbar');
    expect(bar.getAttribute('aria-label')).toBe('Chart toolbar');

    el.options = { viewMode: ViewMode.Month, rowHeight: 40, toolbar: { today: false } };
    flush(el);
    expect($(el, '.gantt-toolbar')).toBe(bar);
    expect($(el, '[data-focus-key="zoom-in"]')).toBe(zoomIn);
    expect($(el, '[data-focus-key="today"]')).toBeNull();
    expect($$(el, '.gantt-toolbar > .gantt-tb-group')).toHaveLength(3);

    el.options = { viewMode: ViewMode.Month, rowHeight: 40 };
    flush(el);
    expect($(el, '[data-focus-key="today"]')).toBe(today);
    expect($$(el, '.gantt-toolbar > *').map(g => g.className)).toEqual([
      'gantt-tb-group',
      'gantt-tb-group gantt-tb-pills',
      'gantt-tb-group',
      'gantt-tb-group gantt-tb-pills gantt-tb-views',
    ]);

    // Clicking a pill zooms; the pills stay, aria-pressed follows
    week.click();
    flush(el);
    expect(el.viewMode).toBe(ViewMode.Week);
    expect($(el, '[data-focus-key="zoom:Week"]')).toBe(week);
    expect(week.getAttribute('aria-pressed')).toBe('true');
    expect($(el, '[data-focus-key="zoom:Month"]')?.getAttribute('aria-pressed')).toBe('false');

    const table = $(el, '[data-focus-key="view:table"]')!;
    table.click();
    flush(el);
    expect(el.view).toBe('table');
    expect(table.getAttribute('aria-pressed')).toBe('true');

    el.showToolbar = false;
    flush(el);
    expect($(el, '.gantt-toolbar')).toBeNull();
    el.showToolbar = true;
    flush(el);
    expect($(el, '.gantt-toolbar')).toBe(bar);
    expect(bar.querySelector('[data-focus-key="zoom-in"]')).toBe(zoomIn);
  });

  it('runs each button action and localises the texts in place', () => {
    el = mount({ tasks: plan(3), options: { viewMode: ViewMode.Week } });
    const zoomIn = $<HTMLButtonElement>(el, '[data-focus-key="zoom-in"]')!;
    const zoomOut = $<HTMLButtonElement>(el, '[data-focus-key="zoom-out"]')!;
    zoomOut.click();
    expect(el.viewMode).toBe(ViewMode.Month);
    zoomIn.click();
    expect(el.viewMode).toBe(ViewMode.Week);
    el.options = { viewMode: ViewMode.Week, labels: { zoomIn: 'Ingrandisci', todayButton: 'Oggi' } };
    flush(el);
    expect(zoomIn.getAttribute('aria-label')).toBe('Ingrandisci');
    expect(zoomIn.title).toBe('Ingrandisci');
    expect($(el, '[data-focus-key="today"]')?.textContent).toBe('◎ Oggi');
  });
});

describe('legend layer', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    el?.remove();
  });

  it('patches the items in place and holds no children while hidden', () => {
    el = mount({ tasks: plan(3), options: { showToday: false, criticalPath: true } });
    el.annotations = [{ x1: new Date(2026, 2, 5), label: { text: 'Freeze' } }];
    el.showLegend = true;
    flush(el);
    const legend = $(el, '.gantt-legend')!;
    expect(legend.hidden).toBe(false);
    expect([...legend.children].map(c => c.className)).toEqual([
      'gantt-legend-title',
      'gantt-legend-item',
      'gantt-legend-item',
    ]);
    const [freeze, critical] = $$(el, '.gantt-legend-item');
    const swatch = freeze.querySelector('line')!;
    expect(swatch.getAttribute('stroke-dasharray')).toBe('3 2');

    el.annotations = [{ x1: new Date(2026, 2, 5), color: '#8B5CF6', label: { text: 'Code freeze' } }];
    flush(el);
    expect($$(el, '.gantt-legend-item')).toEqual([freeze, critical]);
    expect(freeze.textContent).toBe('Code freeze');
    expect(freeze.querySelector('line')).toBe(swatch);
    expect(swatch.style.getPropertyValue('stroke')).toBe('#8B5CF6');

    el.setView('table');
    flush(el);
    expect(legend.hidden).toBe(true);
    expect(legend.children).toHaveLength(0);
    el.setView('split');
    flush(el);
    expect(legend.hidden).toBe(false);
    expect(legend.firstElementChild?.className).toBe('gantt-legend-title');
    expect(legend.firstElementChild?.textContent).toBe('Legend');
    expect($$(el, '.gantt-legend-item').map(i => i.textContent)).toEqual(['Code freeze', 'Critical path']);
  });
});
