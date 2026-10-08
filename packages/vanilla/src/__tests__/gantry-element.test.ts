import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ViewMode, TaskType, GanttTask, PX_PER_DAY, TaskDragEvent, SelectionChangeEvent } from '@gantry/core';
import { DEMO_TASKS } from '@gantry/core/demo';
import { GantryElement } from '../gantry.element';
import '../index';

// Node ≥ 22 defines its own (empty) global `localStorage`, which hides happy-dom's
if (!window.localStorage) {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: k => store.get(k) ?? null,
    key: i => [...store.keys()][i] ?? null,
    removeItem: k => { store.delete(k); },
    setItem: (k, v) => { store.set(k, String(v)); },
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

  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { el?.remove(); });

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
    expect(el.layout.rowHeight).toBe(44);
    expect(el.layout.cfg.baseline).toBe(true);
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
    expect(el.dataset['theme']).toBe('dark');
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
    const px = PX_PER_DAY[ViewMode.Month];
    bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, pointerId: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 100 + 3 * px, pointerId: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 100 + 3 * px, pointerId: 1 }));

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

  it('sorts root rows by a column header click (asc → desc → original)', async () => {
    el = await mount({ tasks: [
      task('a', '2026-01-01', '2026-01-10', { name: 'Bravo' }),
      task('b', '2026-01-01', '2026-01-10', { name: 'Alpha' }),
    ] });
    const names = () => $$(el, '.gantt-tl-row').map(r => r.textContent?.includes('Alpha') ? 'Alpha' : 'Bravo');
    const header = $(el, '.gantt-tl-col-header') as HTMLElement;
    header.click(); await frame();
    expect(names()).toEqual(['Alpha', 'Bravo']);
    (($(el, '.gantt-tl-col-header')) as HTMLElement).click(); await frame();
    expect(names()).toEqual(['Bravo', 'Alpha']);
    (($(el, '.gantt-tl-col-header')) as HTMLElement).click(); await frame();
    expect(names()).toEqual(['Bravo', 'Alpha']);
    expect(el.layout.sort()).toBeNull();
  });

  it('collapses and expands groups', async () => {
    el = await mount({ tasks: [
      task('g', '2026-01-01', '2026-02-01', { type: TaskType.Group }),
      task('c', '2026-01-01', '2026-01-10', { parentId: 'g' }),
    ] });
    expect($$(el, '.gantt-tl-row')).toHaveLength(2);
    el.collapseAll(); await frame();
    expect($$(el, '.gantt-tl-row')).toHaveLength(1);
    el.expandAll(); await frame();
    expect($$(el, '.gantt-tl-row')).toHaveLength(2);
  });

  it('loads pages lazily from a dataSource', async () => {
    const fetcher = vi.fn(async (page: number, size: number) =>
      page > 2 ? [] : Array.from({ length: size }, (_, i) => task(`p${page}-${i}`, '2026-01-01', '2026-01-05')));
    el = await mount();
    el.dataSource = { fetcher, pageSize: 5 };
    await vi.waitFor(() => expect(el.tasks.length).toBeGreaterThanOrEqual(5));
    expect(fetcher).toHaveBeenCalledWith(1, 5);
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

  it('escapes task names in the tooltip', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      el = await mount({ tasks: [task('x', '2026-01-01', '2026-01-10', { name: '<img src=x onerror=alert(1)>' })] });
      const bar = $(el, '.gantt-bars-layer [data-task-id="x"]')!;
      bar.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }));
      vi.advanceTimersByTime(500);
      const tip = $(el, '.gantt-tooltip')!;
      expect(tip.querySelector('img')).toBeNull();
      expect(tip.textContent).toContain('<img src=x');
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
});
