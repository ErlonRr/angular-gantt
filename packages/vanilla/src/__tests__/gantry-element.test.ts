import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ViewMode, TaskType, type GanttTask, type TaskDragEvent, type SelectionChangeEvent } from '@gantryjs/core';
import { DEMO_TASKS } from '@gantryjs/core/demo';
import { GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import '../index';

// Node ≥ 22 defines its own (empty) global `localStorage`, which hides happy-dom's
if (!window.localStorage) {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: k => store.get(k) ?? null,
    key: i => [...store.keys()][i] ?? null,
    removeItem: k => {
      store.delete(k);
    },
    setItem: (k, v) => {
      store.set(k, String(v));
    },
  };
  Object.defineProperty(window, 'localStorage', { value: memoryStorage, configurable: true });
}

const frame = () => new Promise<void>(r => requestAnimationFrame(() => r()));

function task(id: string, start: string, end: string, extra: Partial<GanttTask> = {}): GanttTask {
  return { id, name: `Task ${id}`, start: new Date(start), end: new Date(end), progress: 50, ...extra };
}

async function mount(props: Partial<Pick<GantryElement, 'tasks' | 'options'>> = {}): Promise<GantryElement> {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, props);
  document.body.appendChild(el);
  await frame();
  return el;
}

const $ = (el: GantryElement, sel: string) => el.shadowRoot!.querySelector(sel);
const $$ = (el: GantryElement, sel: string) => [...el.shadowRoot!.querySelectorAll(sel)];

describe('<gantry-element>', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    el?.remove();
  });

  it('is registered and can be created with document.createElement', () => {
    expect(customElements.get('gantry-element')).toBe(GantryElement);
    expect(() => document.createElement('gantry-element')).not.toThrow();
  });

  it('renders a row and a bar per task', async () => {
    el = await mount({ tasks: [task('a', '2026-01-01', '2026-01-10'), task('b', '2026-01-05', '2026-01-20')] });
    expect($$(el, '.gantt-tl-row')).toHaveLength(2);
    expect($$(el, '.gantt-bars-layer [data-task-id]').map(b => b.getAttribute('data-task-id'))).toContain('b');
    expect($(el, '[role="treegrid"]')?.getAttribute('aria-rowcount')).toBe('3');
  });

  it('applies every option, not just viewMode', async () => {
    el = await mount({ tasks: DEMO_TASKS });
    el.options = { viewMode: ViewMode.Week, rowHeight: 44, criticalPath: true, baseline: true };
    await frame();
    expect(el.viewMode).toBe(ViewMode.Week);
    expect(getEngine(el).graph.config().rowHeight).toBe(44);
    expect(getEngine(el).graph.config().baseline).toBe(true);
    expect(el.criticalIds.size).toBeGreaterThan(0);
    expect(($(el, '.gantt-tl-row') as HTMLElement).style.height).toBe('44px');
  });

  it('localises labels through options.labels', async () => {
    el = await mount({ tasks: [task('a', '2026-01-01', '2026-01-10')] });
    el.options = { labels: { colName: 'Attività' } };
    await frame();
    expect($(el, '.gantt-tl-col-header')?.textContent).toContain('Attività');
  });

  it('round-trips darkMode, including "auto"', async () => {
    el = await mount();
    el.darkMode = 'auto';
    expect(el.darkMode).toBe('auto');
    el.setAttribute('dark-mode', 'true');
    expect(el.darkMode).toBe(true);
    expect(getEngine(el).graph.isDark()).toBe(true);
    expect(el.hasAttribute('data-theme')).toBe(false); // `:state(dark)` instead (a11y.test.ts)
  });

  it('virtualises rows: DOM size stays bounded for large data sets', async () => {
    const many = Array.from({ length: 2000 }, (_, i) => task(`t${i}`, '2026-01-01', '2026-01-05'));
    el = await mount({ tasks: many });
    const rendered = $$(el, '.gantt-tl-row').length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(100);
    expect($$(el, '.gantt-bars-layer > [data-task-id]').length).toBe(rendered);
  });

  it('drags a bar and emits task-dragged with the snapped day delta', async () => {
    el = await mount({ tasks: [task('a', '2026-03-01', '2026-03-10')] });
    const onDragged = vi.fn<(e: CustomEvent<TaskDragEvent>) => void>();
    el.addEventListener('task-dragged', onDragged);

    const bar = $(el, '.gantt-bars-layer [data-task-id="a"]')!;
    const canvas = $(el, '.gantry-canvas-container')!;
    const px = getEngine(el).graph.timeline().pxPerDay;
    // Bars are hit by geometry: press the middle of the body (the canvas box is at 0,0 in happy-dom)
    const v = el.getBarVisual('a')!;
    const x = v.x + v.width / 2;
    bar.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: x, clientY: v.cy, pointerId: 1 }),
    );
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: x + 3 * px, pointerId: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: x + 3 * px, pointerId: 1 }));

    expect(onDragged).toHaveBeenCalledOnce();
    const detail = onDragged.mock.calls[0][0].detail;
    expect(detail).toMatchObject({ taskId: 'a', daysMoved: 3 });
    expect(el.tasks[0].start).toEqual(new Date('2026-03-04'));
  });

  it('does not drag when enableDrag is false', async () => {
    el = await mount({ tasks: [task('a', '2026-03-01', '2026-03-10')] });
    el.enableDrag = false;
    await frame();
    const onDragged = vi.fn();
    el.addEventListener('task-dragged', onDragged);
    const bar = $(el, '.gantt-bars-layer [data-task-id="a"]')!;
    bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 0 }));
    $(el, '.gantry-canvas-container')!.dispatchEvent(new PointerEvent('pointerup', { clientX: 200 }));
    expect(onDragged).not.toHaveBeenCalled();
  });

  it('selects rows on click and emits selection-change', async () => {
    el = await mount({ tasks: [task('a', '2026-01-01', '2026-01-10'), task('b', '2026-01-01', '2026-01-10')] });
    const onSel = vi.fn<(e: CustomEvent<SelectionChangeEvent>) => void>();
    el.addEventListener('selection-change', onSel);
    ($$(el, '.gantt-tl-row')[1] as HTMLElement).click();
    expect(onSel.mock.calls[0][0].detail.selectedIds).toEqual(['b']);
    expect(el.getSelectedTasks().map(t => t.id)).toEqual(['b']);
  });

  it('handles keyboard shortcuts', async () => {
    el = await mount({ tasks: [task('a', '2026-01-01', '2026-01-10'), task('b', '2026-01-01', '2026-01-10')] });
    const onView = vi.fn();
    el.addEventListener('view-mode-change', onView);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }));
    expect(el.viewMode).toBe(ViewMode.Week);
    expect(onView).toHaveBeenCalledOnce();

    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }));
    expect(el.getSelectedTasks()).toHaveLength(2);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(el.getSelectedTasks()).toHaveLength(0);
  });

  it('leaves keys it does not handle (and Alt combinations) to the browser', async () => {
    el = await mount({ tasks: [task('a', '2026-01-01', '2026-01-10')] });
    const zoom = el.viewMode;
    const other = new KeyboardEvent('keydown', { key: 'q', cancelable: true });
    el.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    // L (link) acts only on a bar or a row (grid / timeline areas), not on the host
    const link = new KeyboardEvent('keydown', { key: 'l', cancelable: true });
    el.dispatchEvent(link);
    expect(link.defaultPrevented).toBe(false);
    const altPlus = new KeyboardEvent('keydown', { key: '+', altKey: true, cancelable: true });
    el.dispatchEvent(altPlus);
    expect(altPlus.defaultPrevented).toBe(false);
    expect(el.viewMode).toBe(zoom);
    const selectAll = new KeyboardEvent('keydown', { key: 'A', ctrlKey: true, shiftKey: true, cancelable: true });
    el.dispatchEvent(selectAll);
    expect(selectAll.defaultPrevented).toBe(true);
    expect(el.getSelectedTasks()).toHaveLength(1);
  });

  it('selects through the core reducer: single-select ignores modifiers, clearing nothing emits nothing', async () => {
    el = await mount({
      tasks: [task('a', '2026-01-01', '2026-01-10'), task('b', '2026-01-01', '2026-01-10')],
      options: { multiSelect: false },
    });
    const onSel = vi.fn<(e: CustomEvent<SelectionChangeEvent>) => void>();
    el.addEventListener('selection-change', onSel);
    const rows = () => $$(el, '.gantt-tl-row') as HTMLElement[];
    rows()[0].click();
    rows()[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(el.getSelectedTasks().map(t => t.id)).toEqual(['b']);
    el.selectAll();
    expect(el.getSelectedTasks().map(t => t.id)).toEqual(['b']);
    el.clearSelection();
    el.clearSelection();
    expect(onSel.mock.calls.map(c => c[0].detail.selectedIds)).toEqual([['a'], ['b'], []]);
    await frame();
    expect($$(el, '.gantt-tl-row--selected')).toHaveLength(0);
  });

  it('sorts root rows by a column header click (asc → desc → original)', async () => {
    el = await mount({
      tasks: [
        task('a', '2026-01-01', '2026-01-10', { name: 'Bravo' }),
        task('b', '2026-01-01', '2026-01-10', { name: 'Alpha' }),
      ],
    });
    const names = () => $$(el, '.gantt-tl-row').map(r => (r.textContent?.includes('Alpha') ? 'Alpha' : 'Bravo'));
    const header = $(el, '.gantt-tl-col-header') as HTMLElement;
    header.click();
    await frame();
    expect(names()).toEqual(['Alpha', 'Bravo']);
    ($(el, '.gantt-tl-col-header') as HTMLElement).click();
    await frame();
    expect(names()).toEqual(['Bravo', 'Alpha']);
    ($(el, '.gantt-tl-col-header') as HTMLElement).click();
    await frame();
    expect(names()).toEqual(['Bravo', 'Alpha']);
    expect(getEngine(el).graph.sort()).toBeNull();
  });

  it('collapses and expands groups', async () => {
    el = await mount({
      tasks: [
        task('g', '2026-01-01', '2026-02-01', { type: TaskType.Group }),
        task('c', '2026-01-01', '2026-01-10', { parentId: 'g' }),
      ],
    });
    expect($$(el, '.gantt-tl-row')).toHaveLength(2);
    el.collapseAll();
    await frame();
    expect($$(el, '.gantt-tl-row')).toHaveLength(1);
    el.expandAll();
    await frame();
    expect($$(el, '.gantt-tl-row')).toHaveLength(2);
  });

  it('loads pages lazily from a dataSource', async () => {
    const fetcher = vi.fn(async (page: number, size: number) =>
      page > 2 ? [] : Array.from({ length: size }, (_, i) => task(`p${page}-${i}`, '2026-01-01', '2026-01-05')),
    );
    el = await mount();
    el.dataSource = { fetcher, pageSize: 5 };
    await vi.waitFor(() => expect(el.tasks.length).toBeGreaterThanOrEqual(5));
    expect(fetcher).toHaveBeenCalledWith(1, 5);
  });

  it('stops at a failed page: one load-error, a Retry button, no request storm', async () => {
    let fail = true;
    // The first page loads; the second (asked for by the lazy-load region) fails until retried
    const fetcher = vi.fn(async (page: number, size: number) => {
      if (page === 2 && fail) throw new Error('offline');
      return page > 2 ? [] : Array.from({ length: size }, (_, i) => task(`p${page}-${i}`, '2026-01-01', '2026-01-05'));
    });
    const errors: unknown[] = [];
    el = await mount();
    el.addEventListener('load-error', e => errors.push((e as CustomEvent).detail));
    el.dataSource = { fetcher, pageSize: 5, retries: 0 };
    await vi.waitFor(() => expect(el.dataSource?.error).not.toBeNull());
    for (let i = 0; i < 5; i++) await frame();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(errors).toEqual([{ error: expect.any(Error), page: 2 }]);

    // Announced once through the persistent alert region, not by the rebuilt footer
    expect($(el, '.gantt-sr-alert')?.textContent).toBe('Couldn’t load tasks');
    expect($(el, '[role="alert"]')).toBe($(el, '.gantt-sr-alert'));
    const retry = $(el, '.gantt-load-error .gantt-load-more-btn') as HTMLButtonElement;
    expect(retry.textContent).toBe('Retry');
    fail = false;
    retry.focus();
    retry.click();
    await vi.waitFor(() => expect(el.tasks.length).toBeGreaterThanOrEqual(10));
    expect(el.tasks[0].id).toBe('p1-0');
    expect(el.dataSource?.error).toBeNull();
    expect($(el, '.gantt-sr-alert')?.textContent).toBe('');
    // Focus stayed in the footer while Retry turned into "Loading…" and back
    expect((el.shadowRoot!.activeElement as HTMLElement | null)?.dataset['focusKey']).toBe('load-more');
  });

  it('leaves a failed first page to the chart state: no footer, one load-error, a data-source Retry', async () => {
    const fetcher = vi.fn(() => Promise.reject(new Error('offline')));
    const errors: unknown[] = [];
    el = await mount();
    el.addEventListener('load-error', e => errors.push((e as CustomEvent).detail));
    el.dataSource = { fetcher, pageSize: 5, retries: 0 };
    await vi.waitFor(() => expect(el.dataSource?.error).not.toBeNull());
    for (let i = 0; i < 3; i++) await frame();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([{ error: expect.any(Error), page: 1 }]);
    expect(getEngine(el).graph.chartState()).toMatchObject({ kind: 'error', retry: 'dataSource', footer: false });
    expect($(el, '.gantt-tl-load-more')).toBeNull();
    // The error box is the alert (the assertive region stays empty, as in Angular)
    expect($(el, '.gantt-state--error [role="alert"]')).not.toBeNull();
    expect($(el, '.gantt-sr-alert')?.textContent).toBe('');
  });

  it('reports a failure that happened while disconnected once reconnected', async () => {
    let reject!: (e: Error) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<GanttTask[]>((_, r) => {
          reject = r;
        }),
    );
    const errors: unknown[] = [];
    el = await mount();
    el.addEventListener('load-error', e => errors.push((e as CustomEvent).detail));
    el.dataSource = { fetcher, retries: 0 };
    el.remove();
    reject(new Error('offline'));
    await vi.waitFor(() => expect(el.dataSource?.error).not.toBeNull());
    expect(errors).toHaveLength(0);
    document.body.appendChild(el);
    await frame();
    expect(errors).toHaveLength(1);
  });

  it('repairs appended tasks like set ones, inside the chart (`tasks` returns them as given)', async () => {
    el = await mount({ tasks: [task('a', '2026-01-01', '2026-01-05')] });
    const appended = { id: 'b', name: 'B', start: new Date(2026, 0, 2), parentId: null } as unknown as GanttTask;
    el.appendTasks([appended]);
    await frame();
    // The chart draws the repaired task…
    const drawn = getEngine(el)
      .graph.tasks.peek()
      .find(t => t.id === 'b')!;
    expect(drawn.end).toEqual(new Date(2026, 0, 2));
    expect('parentId' in drawn).toBe(false);
    // …and gives back what it was given
    expect(el.tasks.find(t => t.id === 'b')).toBe(appended);
  });

  it('initialPage: 0 waits for an explicit loadNext()', async () => {
    const fetcher = vi.fn(async () => [task('a', '2026-01-01', '2026-01-05')]);
    el = await mount();
    el.dataSource = { fetcher, initialPage: 0 };
    for (let i = 0; i < 3; i++) await frame();
    expect(fetcher).not.toHaveBeenCalled();
    await el.dataSource?.loadNext();
    expect(fetcher).toHaveBeenCalledWith(1, 30);
  });

  it('uses a custom bar renderer when provided', async () => {
    el = await mount({ tasks: [task('a', '2026-01-01', '2026-01-10')] });
    el.renderBar = (ctx, renderDefault) => {
      const g = renderDefault();
      g.classList.add('my-bar');
      return ctx.row.task.id === 'a' ? g : null;
    };
    await frame();
    expect($(el, '.my-bar')?.getAttribute('data-task-id')).toBe('a');
  });

  it('writes task names into the tooltip as text, never as markup', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const name = '<img src=x onerror=alert(1)>';
      el = await mount({ tasks: [task('x', '2026-01-01', '2026-01-10', { name })] });
      const bar = $(el, '.gantt-bars-layer [data-task-id="x"]')!;
      bar.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }));
      vi.advanceTimersByTime(500);
      const tip = $(el, '.gantt-tooltip')!;
      expect(tip.querySelector('img, [onerror]')).toBeNull();
      // textContent, not escaped markup: the title reads exactly the name (no `&lt;` entities)
      expect(tip.querySelector('.gantt-tooltip-title')!.textContent).toBe(name);
    } finally {
      vi.useRealTimers();
    }
  });

  it('collapses the panel with the splitter toggle and restores the last width', async () => {
    el = await mount({ tasks: [task('a', '2026-01-01', '2026-01-10')] });
    const panel = $(el, '.gantry-panel') as HTMLElement;
    el.setState({ panelWidth: 280 });
    await frame();
    expect(panel.style.width).toBe('280px');
    ($(el, '.gantry-splitter-toggle') as HTMLButtonElement).click();
    await frame();
    expect(el.view).toBe('chart');
    expect(panel.style.width).toBe('0px');
    ($(el, '.gantry-splitter-toggle') as HTMLButtonElement).click();
    await frame();
    expect(panel.style.width).toBe('280px');
  });

  it('switches to the table view, showing tableOnly columns', async () => {
    el = await mount({ tasks: [task('a', '2026-01-01', '2026-01-10')] });
    el.columns = [
      { key: 'name', label: 'Name', width: 200 },
      { key: 'owner', label: 'Owner', width: 120, tableOnly: true, render: () => 'Ann' },
    ];
    await frame();
    expect($$(el, '.gantt-tl-col-header')).toHaveLength(1);
    el.setView('table');
    await frame();
    expect($$(el, '.gantt-tl-col-header')).toHaveLength(2);
    expect(($(el, '.gantry-wrapper') as HTMLElement).dataset['view']).toBe('table');
  });

  describe('panel vs table-view columns', () => {
    const headers = (e: GantryElement) =>
      $$(e, '.gantt-tl-col-header').map(h => h.textContent?.replace(/[⇅▲▼]/g, '').trim());
    const plan = () => [
      task('a', '2020-01-01', '2020-01-10', { name: 'Design', progress: 100 }),
      task('b', '2020-01-10', '2020-01-20', { name: 'Build', progress: 20, dependency: 'a' }),
    ];

    it('shows a lean panel in split view and every useful field in table view', async () => {
      el = await mount({ tasks: plan() });
      expect(headers(el)).toEqual(['Task Name', 'Start', 'End', '%']);
      el.setView('table');
      await frame();
      expect(headers(el)).toEqual(['Task Name', 'Type', 'Status', 'Start', 'End', 'Duration', '%', 'Predecessors']);
      el.options = { baseline: true };
      await frame();
      expect(headers(el)).toHaveLength(11);
      expect($(el, '[role="treegrid"]')?.getAttribute('aria-label')).toBe('Tasks');
    });

    it('derives statuses from progress, dates and now, with a dot and data-status', async () => {
      el = await mount({ tasks: plan() });
      el.setView('table');
      await frame();
      const statusCells = $$(el, '.gantt-tl-row [data-status]');
      expect(statusCells.map(c => c.getAttribute('data-status'))).toEqual(['done', 'overdue']);
      expect(statusCells[1].textContent).toBe('Overdue');
      expect(statusCells[1].querySelector('.gantt-tl-status-dot')?.getAttribute('aria-hidden')).toBe('true');
      expect($$(el, '.gantt-tl-row .gantt-tl-cell')[15].textContent).toBe('Design');
    });

    it('sorts by status rank from the header', async () => {
      el = await mount({ tasks: [...plan(), task('c', '2099-01-01', '2099-01-05', { name: 'Later', progress: 0 })] });
      el.setView('table');
      await frame();
      ($$(el, '.gantt-tl-col-header')[2] as HTMLElement).click();
      await frame();
      expect($$(el, '.gantt-tl-row').map(r => (r as HTMLElement).dataset['taskId'])).toEqual(['c', 'b', 'a']);
    });

    it('honours panel.columns, table.columns and per-view visibility', async () => {
      el = await mount({
        tasks: plan(),
        options: { panel: { columns: ['name', 'status'] }, table: { columns: ['id', 'name'] } },
      });
      expect(headers(el)).toEqual(['Task Name', 'Status']);
      el.setColumnVisible('progress', true, 'split');
      await frame();
      expect(headers(el)).toEqual(['Task Name', 'Status', '%']);
      el.setView('table');
      await frame();
      expect(headers(el)).toEqual(['ID', 'Task Name']);
      el.toggleColumnVisible('status', 'table'); // hidden by the table list → shown at the first call
      await frame();
      expect(headers(el)).toEqual(['ID', 'Task Name', 'Status']);
    });

    it('takes the hidden timeline and the legend out of the table view', async () => {
      el = await mount({ tasks: plan() });
      el.showLegend = true;
      el.setView('table');
      await frame();
      expect(($(el, '.gantry-canvas-viewport') as HTMLElement).inert).toBe(true);
      // Detached in the table view (D27)
      expect($(el, '.gantt-legend')).toBeNull();
      el.setView('split');
      await frame();
      expect(($(el, '.gantry-canvas-viewport') as HTMLElement).inert).toBe(false);
    });

    it('keeps keyboard focus on a row selected with Enter, then on the chart once the row is gone', async () => {
      el = await mount({ tasks: plan() });
      const row = $(el, '.gantt-tl-row[data-task-id="b"]') as HTMLElement;
      row.focus();
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await frame();
      expect(el.getSelectedTasks().map(t => t.id)).toEqual(['b']);
      expect((el.shadowRoot!.activeElement as HTMLElement | null)?.dataset['focusKey']).toBe('row:b');
      el.tasks = [task('a', '2020-01-01', '2020-01-10')];
      await frame();
      expect(document.activeElement).toBe(el);
      // The timeline's tab stop: its one bar
      expect(el.shadowRoot!.activeElement).toBe($(el, '.gantt-bars-layer > [data-task-id="a"]'));
    });

    it('sorts by a built-in column listed next to custom columns', async () => {
      el = await mount({
        tasks: [task('long', '2020-01-01', '2020-03-01'), task('short', '2020-01-01', '2020-01-03')],
        options: { table: { columns: ['name', 'owner', 'duration'] } },
      });
      el.columns = [
        { key: 'name', label: 'Name', width: 200 },
        { key: 'owner', label: 'Owner', width: 100, render: () => 'Ann' },
      ];
      el.setView('table');
      await frame();
      ($$(el, '.gantt-tl-col-header')[2] as HTMLElement).click();
      await frame();
      expect($$(el, '.gantt-tl-row').map(r => (r as HTMLElement).dataset['taskId'])).toEqual(['short', 'long']);
    });

    it('falls back to the columns property, then the built-ins, when options.columns goes away', async () => {
      el = await mount({ tasks: plan() });
      el.columns = [{ key: 'name', label: 'Own name', width: 200 }];
      el.options = { columns: [{ key: 'name', label: 'From options', width: 200 }] };
      await frame();
      expect(headers(el)).toEqual(['From options']);
      el.options = {};
      await frame();
      expect(headers(el)).toEqual(['Own name']);
      el.columns = [];
      await frame();
      expect(headers(el)).toEqual(['Task Name', 'Start', 'End', '%']);
    });

    it('translates column headers and statuses', async () => {
      el = await mount({ tasks: plan(), options: { labels: { colStatus: 'Stato', statusOverdue: 'In ritardo' } } });
      el.setView('table');
      await frame();
      expect(headers(el)).toContain('Stato');
      expect($$(el, '.gantt-tl-row [data-status="overdue"]')[0].textContent).toBe('In ritardo');
    });
  });

  it('persists UI state under stateKey and emits state-change', async () => {
    window.localStorage.clear();
    el = await mount({ tasks: [task('a', '2026-01-01', '2026-01-10')] });
    const onState = vi.fn();
    el.addEventListener('state-change', onState);
    el.options = { stateKey: 'proj-1' };
    el.setView('chart');
    el.setViewMode(ViewMode.Week);
    await vi.waitFor(() => expect(onState).toHaveBeenCalled());
    const saved = JSON.parse(window.localStorage.getItem('gantry:proj-1')!);
    expect(saved).toMatchObject({ view: 'chart', viewMode: 'Week', panelCollapsed: true });

    const other = document.createElement('gantry-element');
    other.options = { stateKey: 'proj-1' };
    expect(other.view).toBe('chart');
    expect(other.viewMode).toBe('Week');
  });

  it('applies bar options (height % of row, radius) from the render model', async () => {
    el = await mount({ tasks: [task('a', '2026-03-01', '2026-03-20')] });
    el.options = { rowHeight: 40, bar: { height: '50%', radius: 10 } };
    await frame();
    const body = $(el, '.gantt-bars-layer [data-task-id="a"] .gantt-bar-body')!;
    expect(body.getAttribute('d')).toContain('A10,10');
    expect(el.getBarVisual('a')?.height).toBe(20);
  });

  it('renders configurable header tiers (three tiers, week ranges)', async () => {
    el = await mount({ tasks: [task('a', '2026-03-02', '2026-03-20')] });
    el.options = {
      scales: [
        { unit: 'year' },
        { unit: 'month', format: 'MMMM' },
        { unit: 'week', format: (s, e) => `${s.getDate()}-${new Date(e.getTime() - 1).getDate()}` },
      ],
    };
    await frame();
    expect($$(el, '.g-tier')).toHaveLength(3);
    expect($$(el, '.g-tier--week .g-cell-label').map(c => c.textContent)).toContain('2-8');
  });

  describe('core models', () => {
    const planned = () => [
      task('a', '2026-03-01', '2026-03-10', {
        baseline: { start: new Date('2026-03-01'), end: new Date('2026-03-08') },
      }),
      task('b', '2026-03-10', '2026-03-20', { dependency: 'a' }),
      task('m', '2026-03-20', '2026-03-20', {
        type: TaskType.Milestone,
        baseline: { start: new Date('2026-03-18'), end: new Date('2026-03-18') },
      }),
    ];
    const label = (id: string) => $(el, `.gantt-bars-layer [data-task-id="${id}"]`)?.getAttribute('aria-label');

    it('names bars with taskAccessibleName: type, dates, progress, critical, baseline', async () => {
      el = await mount({ tasks: planned(), options: { criticalPath: true, baseline: true } });
      expect(label('a')).toBe('Task a, Task, 1 Mar – 10 Mar 2026, 50% complete, critical, planned baseline shown');
      expect(label('b')).toBe('Task b, Task, 10 Mar – 20 Mar 2026, 50% complete, critical');
      // Milestones have no progress and never mention the baseline
      expect(label('m')).toBe('Task m, Milestone, 20 Mar 2026');
    });

    it('lists critical-path and baseline entries in the legend, each with its swatch shape', async () => {
      el = await mount({ tasks: planned(), options: { criticalPath: true, baseline: true, showToday: false } });
      el.annotations = [{ x1: new Date('2026-03-05'), label: { text: 'Freeze' } }];
      el.showLegend = true;
      await frame();
      const legend = $(el, '.gantt-legend') as HTMLElement;
      expect(legend.hidden).toBe(false);
      const items = [...legend.querySelectorAll('.gantt-legend-item')];
      expect(items.map(i => i.textContent)).toEqual(['Freeze', 'Critical path', 'Baseline']);
      expect(items.map(i => i.querySelector('svg')?.getAttribute('class'))).toEqual([
        'gantt-legend-swatch gantt-legend-swatch--dashed',
        'gantt-legend-swatch gantt-legend-swatch--bar',
        'gantt-legend-swatch gantt-legend-swatch--strip',
      ]);
      expect(items[2].querySelector('rect')?.getAttribute('height')).toBe('3');
    });

    it('fills the tooltip from buildTooltipModel (critical, baseline, successors)', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        el = await mount({ tasks: planned(), options: { criticalPath: true, baseline: true } });
        const hover = (id: string) => {
          const bar = $(el, `.gantt-bars-layer [data-task-id="${id}"]`)!;
          bar.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }));
          vi.advanceTimersByTime(500);
          return $(el, '.gantt-tooltip')!.textContent.replace(/\s+/g, ' ');
        };
        const a = hover('a');
        expect(a).toContain('Critical pathYes');
        expect(a).toContain('Baseline start');
        expect(a).toContain('SuccessorsTask b');
        const tip = $(el, '.gantt-tooltip') as HTMLElement;
        expect(tip.getAttribute('role')).toBe('tooltip');
        el.tooltipEnabled = false;
        el.tooltipEnabled = true;
        const m = hover('m');
        expect(m).toContain('Milestone');
        expect(m).not.toContain('Progress');
      } finally {
        vi.useRealTimers();
      }
    });

    it('stores a versioned snapshot and validates restored state', async () => {
      window.localStorage.clear();
      el = await mount({ tasks: [task('a', '2026-01-01', '2026-01-10')], options: { stateKey: 'v2-test' } });
      el.setState({ panelWidth: 0, view: 'table' });
      await vi.waitFor(() => expect(window.localStorage.getItem('gantry:v2-test')).not.toBeNull());
      const saved = JSON.parse(window.localStorage.getItem('gantry:v2-test')!) as Record<string, unknown>;
      expect(saved).toMatchObject({ v: 2, view: 'table' });
      // panelWidth 0 is invalid: dropped instead of applied
      expect(getEngine(el).graph.panelW()).toBeNull();
    });

    it('opens in the chart view for the legacy panelVisible: false', async () => {
      el = await mount({ tasks: [task('a', '2026-01-01', '2026-01-10')], options: { panelVisible: false } });
      expect(el.view).toBe('chart');
    });
  });

  describe('re-render robustness', () => {
    const active = (e: GantryElement) => e.shadowRoot!.activeElement as HTMLElement | null;

    it('keeps focus on the toolbar button, sort header and collapse toggle it was on', async () => {
      el = await mount({
        tasks: [
          task('g', '2026-01-01', '2026-02-01', { type: TaskType.Group }),
          task('c', '2026-01-01', '2026-01-10', { parentId: 'g' }),
        ],
      });
      const zoomIn = $(el, '[data-focus-key="zoom-in"]') as HTMLButtonElement;
      zoomIn.focus();
      zoomIn.click();
      await frame();
      expect(active(el)?.dataset['focusKey']).toBe('zoom-in');
      expect(active(el)).toBe(zoomIn); // patched in place: the same button keeps focus

      const header = $(el, '[data-focus-key^="head:"][aria-sort]') as HTMLElement;
      header.focus();
      header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await frame();
      expect(active(el)?.dataset['focusKey']).toBe(header.dataset['focusKey']);

      const toggle = $(el, '[data-focus-key="collapse:g"]') as HTMLButtonElement;
      toggle.focus();
      toggle.click();
      await frame();
      expect(active(el)?.dataset['focusKey']).toBe('collapse:g');
      expect(active(el)?.getAttribute('aria-expanded')).toBe('false');
    });

    it('builds bands and vertical grid once per timeline or horizontal window, not on every scroll', async () => {
      el = await mount({ tasks: DEMO_TASKS, options: { nonWorkingTime: { weekends: true } } });
      const { regionRuns } = getEngine(el);
      const bands = $(el, '.gantt-bands');
      const grid = $(el, '.gantt-grid');
      const nodes = () => $$(el, '.gantt-bands > rect, .gantt-grid-minor, .gantt-grid-major');
      const before = nodes();
      const xs = () => $$(el, '.gantt-bands > rect').map(r => r.getAttribute('x'));
      const bandXs = xs();
      expect(before.length).toBeGreaterThan(0);
      const runs = regionRuns['static'];
      ($(el, '.gantry-canvas-viewport') as HTMLElement).scrollTop = 200;
      ($(el, '.gantry-canvas-viewport') as HTMLElement).dispatchEvent(new Event('scroll'));
      await frame();
      await frame();
      expect(regionRuns['static']).toBe(runs);
      expect(nodes().length).toBe(before.length);
      expect(nodes().every((n, i) => n === before[i])).toBe(true);
      el.setViewMode(ViewMode.Day);
      await frame();
      expect(regionRuns['static']).toBe(runs + 1);
      // The groups are persistent; their keyed children follow the new timeline
      expect($(el, '.gantt-bands')).toBe(bands);
      expect($(el, '.gantt-grid')).toBe(grid);
      expect(xs()).not.toEqual(bandXs);
    });

    it('writes a pending state change when disconnected', async () => {
      el = await mount({ tasks: [task('a', '2026-01-01', '2026-01-10')], options: { stateKey: 'disconnect-test' } });
      const onState = vi.fn();
      el.addEventListener('state-change', onState);
      el.setView('chart');
      el.remove();
      expect(onState).toHaveBeenCalledOnce();
      expect(JSON.parse(localStorage.getItem('gantry:disconnect-test')!).view).toBe('chart');
    });

    it('re-syncs the data source after a reconnect', async () => {
      let release!: () => void;
      const gate = new Promise<void>(r => {
        release = r;
      });
      const fetcher = vi.fn(async (page: number) => {
        await gate;
        return page === 1 ? [task('x', '2026-01-01', '2026-01-05')] : [];
      });
      el = await mount();
      el.dataSource = { fetcher, pageSize: 5 };
      el.remove();
      release();
      await vi.waitFor(() => expect(el.dataSource?.loadedCount).toBe(1));
      expect(el.tasks).toHaveLength(0); // detached: not mirrored
      document.body.appendChild(el);
      await frame();
      expect(el.tasks.map(t => t.id)).toEqual(['x']);
      expect(fetcher).toHaveBeenCalledOnce();
    });
  });

  describe('horizontal scroll', () => {
    const viewport = (e: GantryElement) => $(e, '.gantry-canvas-viewport') as HTMLElement;
    // Tasks far from "today" (the suite runs in 2026+): 'auto' must show them, not today
    const past = [task('a', '2020-03-02', '2020-03-20'), task('b', '2020-04-01', '2020-04-30')];

    it("initialScroll 'auto' brings the first task into view when today is far away", async () => {
      el = await mount({ tasks: past });
      const tl = getEngine(el).graph.timeline();
      expect(viewport(el).scrollLeft).toBe(tl.toX(new Date(2020, 2, 2)));
    });

    it('initialScroll false leaves the timeline at its start', async () => {
      el = await mount({ tasks: past, options: { initialScroll: false } });
      expect(viewport(el).scrollLeft).toBe(0);
    });

    it('re-applies initialScroll when the consumer changes it', async () => {
      el = await mount({ tasks: past, options: { initialScroll: false } });
      el.options = { initialScroll: 'start' };
      await frame();
      expect(viewport(el).scrollLeft).toBe(
        getEngine(el)
          .graph.timeline()
          .toX(new Date(2020, 2, 2)),
      );
    });

    it('keeps the anchor date in place when zooming', async () => {
      el = await mount({ tasks: past, options: { viewMode: ViewMode.Week, initialScroll: false } });
      viewport(el).scrollLeft = 200;
      const before = getEngine(el).graph.timeline().toDate(200);
      el.setViewMode(ViewMode.Day);
      await frame();
      const after = getEngine(el).graph.timeline().toDate(viewport(el).scrollLeft);
      expect(Math.abs(after.getTime() - before.getTime())).toBeLessThan(86_400_000);
      expect(viewport(el).scrollLeft).toBeGreaterThan(200);
    });
  });
});

// `task.collapsed` seeds the ids the element has never seen (core `seedCollapsed`, shared with Angular)
describe('<gantry-element> task.collapsed seeding', () => {
  let el: GantryElement;
  const tree = (): GanttTask[] => [
    task('g', '2026-01-01', '2026-02-01', { type: TaskType.Group, collapsed: true }),
    task('c', '2026-01-02', '2026-01-10', { parentId: 'g' }),
    task('x', '2026-01-05', '2026-01-20'),
  ];
  const rowIds = (e: GantryElement) => $$(e, '.gantt-tl-row').map(r => r.getAttribute('data-task-id'));
  const expand = async (e: GantryElement) => {
    ($(e, '[data-focus-key="collapse:g"]') as HTMLButtonElement).click();
    await frame();
  };

  afterEach(() => el?.remove());

  it('keeps the user expand state through an empty task list; a new id starts collapsed', async () => {
    el = await mount({ tasks: tree() });
    expect(rowIds(el)).toEqual(['g', 'x']);
    await expand(el);
    expect(rowIds(el)).toEqual(['g', 'c', 'x']);

    el.tasks = [];
    await frame();
    el.tasks = tree();
    await frame();
    expect(rowIds(el)).toEqual(['g', 'c', 'x']);

    el.tasks = [
      ...tree(),
      task('h', '2026-01-03', '2026-01-12', { type: TaskType.Group, collapsed: true }),
      task('h1', '2026-01-03', '2026-01-06', { parentId: 'h' }),
    ];
    await frame();
    expect(rowIds(el)).toContain('h');
    expect(rowIds(el)).not.toContain('h1');
    expect(rowIds(el)).toContain('c');
  });

  it('keeps the user expand state across a data-source reset', async () => {
    const fetcher = vi.fn(async (page: number) => (page === 1 ? tree() : []));
    el = await mount();
    el.dataSource = { fetcher, pageSize: 50 };
    await vi.waitFor(() => expect(rowIds(el)).toEqual(['g', 'x']));
    await expand(el);
    expect(rowIds(el)).toEqual(['g', 'c', 'x']);

    await el.dataSource!.reset();
    await frame();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(rowIds(el)).toEqual(['g', 'c', 'x']);
  });
});
