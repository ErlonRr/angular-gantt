import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ViewMode, TaskType, GanttTask, PX_PER_DAY, TaskDragEvent, SelectionChangeEvent } from '@gantry/core';
import { DEMO_TASKS } from '@gantry/core/demo';
import { GantryElement } from '../gantry.element';
import '../index';

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
    expect(el.layout.rowHeight()).toBe(44);
    expect(el.layout.showBaseline()).toBe(true);
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
});
