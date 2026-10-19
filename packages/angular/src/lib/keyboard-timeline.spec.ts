// Keys on the timeline's bars (Gantry 2 phase 9, step 4.5, contract §3d), the Web Component's
// `keyboard-timeline.test.ts` and `keyboard-edit.test.ts` in Angular:
// - the bars are one roving tab stop (D5; the viewport only without bars), a flat listbox
//   (aria-posinset / -setsize over the visible rows); ↑/↓ PgUp/PgDn Home/End move focus bar to bar
//   (mounting rows beyond the window), ←/→ pan one bottom-tier cell, Space selects, Enter activates a
//   bar that can't move; the global shortcuts (F fits, + − T, Ctrl+A, `characterShortcuts: false`);
// - move mode (Enter / F2 on a movable bar): core `KeyboardEditSession` through the drag service's
//   external preview (ghost, dimmed bar, pinned row), a commit emits what a drop emits and is
//   announced; Esc, Tab, blur and a pointer press cancel (D24: before clearing the selection); the
//   session is modal, a zoom or the chart's destruction ends it.
// happy-dom focuses SVG elements but lays nothing out: the scroll offsets are read from the services.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  ANNOUNCE_DEBOUNCE,
  DEFAULT_LABELS,
  TaskType,
  ViewMode,
  addDays,
  panScrollLeft,
  type GanttOptions,
  type GanttTask,
  type TaskDragEvent,
  type TaskResizeEvent,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttScrollService } from './scroll/gantt-scroll.service';
import { GanttDragService } from './drag/gantt-drag.service';
import { GanttBarBase, provideGanttBar } from './bar-registry';

const day = (d: number) => new Date(2026, 2, d);

/** `n` one-week tasks in March 2026. */
const plan = (n: number): GanttTask[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Task ${i}`,
    start: new Date(2026, 2, 2 + (i % 20)),
    end: new Date(2026, 2, 9 + (i % 20)),
    progress: 40,
  }));

/** Two tasks and a milestone (move mode). */
const editTasks = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(6), progress: 20 },
  { id: 'b', name: 'Beta', start: day(4), end: day(10), progress: 50 },
  { id: 'm', name: 'Launch', type: TaskType.Milestone, start: day(12), end: day(12) },
];

/** A custom bar type (`barType: 'epic'`) */
@Component({
  selector: 'g[epicBar]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<svg:rect class="epic-rect" [attr.x]="ctx().visual.x" [attr.width]="ctx().visual.width" />',
})
class EpicBar extends GanttBarBase {}

@Component({
  imports: [GantryComponent],
  providers: [provideGanttBar({ type: 'epic', component: EpicBar })],
  template: `<gantry
    style="height: 400px"
    [series]="tasks()"
    [options]="options()"
    [enableDrag]="drag()"
    [enableResize]="resize()"
    (rowClick)="clicks.push($event.task.id)"
    (taskDragged)="dragged.push($event)"
    (taskResized)="resized.push($event)"
  />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(plan(5));
  readonly options = signal<GanttOptions>({ initialScroll: false });
  readonly drag = signal(true);
  readonly resize = signal(true);
  readonly clicks: string[] = [];
  readonly dragged: TaskDragEvent[] = [];
  readonly resized: TaskResizeEvent[] = [];
  readonly gantt = viewChild.required(GantryComponent);
}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  host: HTMLElement;
  gantt: GantryComponent;
  layout: GanttLayoutService;
  scroll: GanttScrollService;
  drag: GanttDragService;
  set(change: () => void): Promise<void>;
  $(sel: string): HTMLElement;
  $$(sel: string): HTMLElement[];
}

async function mount(setup?: (h: Host) => void): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  setup?.(f.componentInstance);
  await f.whenStable();
  const debug = f.debugElement.query(By.directive(GantryComponent));
  const host = debug.nativeElement as HTMLElement;
  const $$ = (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)];
  return {
    f,
    h: f.componentInstance,
    host,
    gantt: f.componentInstance.gantt(),
    layout: debug.injector.get(GanttLayoutService),
    scroll: debug.injector.get(GanttScrollService),
    drag: debug.injector.get(GanttDragService),
    async set(change) {
      change();
      await f.whenStable();
    },
    $(sel) {
      const el = $$(sel)[0];
      if (!el) throw new Error(`no element for ${sel}`);
      return el;
    },
    $$,
  };
}

const bar = (c: Chart, id: string) => c.$(`.gantt-bars-layer > [data-task-id="${id}"]`);
const tabStops = (c: Chart) => c.$$('.gantt-bars-layer > [tabindex="0"]').map(b => b.getAttribute('data-task-id'));
const active = () => document.activeElement;
/** Id of the task shown at visible row `i`. */
const idAt = (c: Chart, i: number) => c.layout.visibleRows()[i].task.id;
const live = (c: Chart) => c.$('.gantt-sr-live').textContent;

/** A real keydown (bubbling, cancelable) on `target`; returns whether the chart used it. */
function press(target: Element | null, key: string, init: KeyboardEventInit = {}): boolean {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init });
  (target ?? document.body).dispatchEvent(e);
  return e.defaultPrevented;
}

/** Rows of one page: the vertical window's height (happy-dom measures 0: the fallback 500 px). */
const pageRows = (c: Chart) => Math.floor((500 - c.layout.headerHeight()) / c.layout.rowHeight());

/** Lets a debounced announcement reach the live region, then waits for the render. */
async function settle(c: Chart): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ANNOUNCE_DEBOUNCE + 20));
  await c.f.whenStable();
}

afterEach(() => vi.restoreAllMocks());

describe('<gantry> timeline keys', () => {
  describe('roving tab stop (D5)', () => {
    it('makes every bar focusable and one of them the tab stop: the first in view, then the focused one', async () => {
      const c = await mount(h => h.tasks.set(plan(60)));
      const bars = c.$$('.gantt-bars-layer > [data-task-id]');
      expect(bars.every(b => ['0', '-1'].includes(b.getAttribute('tabindex')!))).toBe(true);
      expect(bars.map(b => b.getAttribute('data-focus-key'))).toEqual(
        bars.map(b => `bar:${b.getAttribute('data-task-id')}`),
      );
      expect(tabStops(c)).toEqual(['t0']);
      expect(c.$('.gantry-canvas-viewport').getAttribute('tabindex')).toBe('-1');

      // Scrolled: the first bar in view (not an overscan bar above it)
      await c.set(() => c.scroll.scrollTop.set(10 * c.layout.rowHeight()));
      expect(tabStops(c)).toEqual([idAt(c, 10)]);

      // The focused bar takes it, and keeps it once focus leaves the chart
      const id = idAt(c, 12);
      await c.set(() => bar(c, id).focus());
      expect(tabStops(c)).toEqual([id]);
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      try {
        await c.set(() => outside.focus());
        expect(tabStops(c)).toEqual([id]);
      } finally {
        outside.remove();
      }
    });

    it('shares the active row with the task list: a focused row moves the bar tab stop, and back', async () => {
      const c = await mount(h => h.tasks.set(plan(10)));
      await c.set(() => c.$('.gantt-tl-row[data-task-id="t4"]').focus());
      expect(tabStops(c)).toEqual(['t4']);
      await c.set(() => bar(c, 't6').focus());
      expect(c.$$('.gantt-tl-row[tabindex="0"]').map(r => r.getAttribute('data-task-id'))).toEqual(['t6']);
    });

    it('is a flat listbox: aria-posinset / aria-setsize count the visible rows (the task list keeps the tree)', async () => {
      const c = await mount(h =>
        h.tasks.set([
          { id: 'g', name: 'G', type: TaskType.Group, start: day(2), end: day(20) },
          { id: 'a', name: 'A', parentId: 'g', start: day(2), end: day(9) },
          { id: 'b', name: 'B', parentId: 'g', start: day(9), end: day(20) },
          { id: 'r', name: 'R', start: day(3), end: day(6) },
        ]),
      );
      for (const r of c.layout.visibleRows()) {
        expect(bar(c, r.task.id).getAttribute('aria-posinset'), r.task.id).toBe(String(r.visibleIndex + 1));
        expect(bar(c, r.task.id).getAttribute('aria-setsize'), r.task.id).toBe('4');
      }
      // The task-list rows tell the tree: siblings
      expect(c.$('.gantt-tl-row[data-task-id="b"]').getAttribute('aria-setsize')).toBe('2');
      await c.set(() => c.gantt.collapseAll());
      expect(bar(c, 'r').getAttribute('aria-setsize')).toBe('2');
      expect(bar(c, 'r').getAttribute('aria-posinset')).toBe(
        String(c.layout.geometryById().get('r')!.row.visibleIndex + 1),
      );
    });

    it('stamps the tab stop and focus key on custom bars too, and keeps focus on a bar whose component is replaced', async () => {
      const c = await mount(h => h.tasks.set(plan(3).map(t => ({ ...t, barType: 'epic' }))));
      expect(bar(c, 't0').querySelector('.epic-rect')).not.toBeNull();
      expect(tabStops(c)).toEqual(['t0']);
      expect(bar(c, 't1').getAttribute('tabindex')).toBe('-1');
      expect(bar(c, 't1').getAttribute('data-focus-key')).toBe('bar:t1');

      const node = bar(c, 't1');
      await c.set(() => node.focus());
      // A new bar type: a new component, a new host — focus follows the focus key
      await c.set(() => c.h.tasks.update(ts => ts.map(t => (t.id === 't1' ? { ...t, barType: 'task' } : t))));
      expect(bar(c, 't1')).not.toBe(node);
      expect(active()).toBe(bar(c, 't1'));
    });
  });

  describe('moves', () => {
    it('↑/↓ focus the bar of the previous / next row, at the ends nothing (the key is still used)', async () => {
      const c = await mount();
      bar(c, idAt(c, 0)).focus();
      expect(press(bar(c, idAt(c, 0)), 'ArrowDown')).toBe(true);
      expect(active()).toBe(bar(c, idAt(c, 1)));
      press(active(), 'ArrowDown');
      press(active(), 'ArrowUp');
      expect(active()).toBe(bar(c, idAt(c, 1)));
      press(active(), 'ArrowUp');
      expect(press(active(), 'ArrowUp')).toBe(true);
      expect(active()).toBe(bar(c, idAt(c, 0)));
      await c.f.whenStable();
      expect(c.layout.focusedRowId()).toBe(idAt(c, 0));
    });

    it('End, Home and PageDown reach bars outside the virtual window: pinned, focused after the render', async () => {
      const c = await mount(h => h.tasks.set(plan(200)));
      const last = idAt(c, 199);
      expect(c.$$(`.gantt-bars-layer > [data-task-id="${last}"]`)).toHaveLength(0);
      bar(c, idAt(c, 0)).focus();
      press(bar(c, idAt(c, 0)), 'End');
      expect(c.layout.focusedRowId()).toBe(last);
      await c.f.whenStable();
      expect(active()).toBe(bar(c, last));
      expect(tabStops(c)).toEqual([last]);

      press(active(), 'Home', { ctrlKey: true });
      await c.f.whenStable();
      expect(active()).toBe(bar(c, idAt(c, 0)));

      press(active(), 'PageDown');
      await c.f.whenStable();
      expect(active()).toBe(bar(c, idAt(c, pageRows(c))));
      press(active(), 'PageUp');
      await c.f.whenStable();
      expect(active()).toBe(bar(c, idAt(c, 0)));
    });

    it('scrolls the bar it moves to into view by the least amount (not centred), below the sticky header', async () => {
      const c = await mount(h => h.tasks.set(plan(200)));
      const layer = c.$('.gantt-bars-layer');
      const scrolled: (ScrollIntoViewOptions | boolean | undefined)[] = [];
      const proto = Element.prototype as Element & { scrollIntoView(o?: ScrollIntoViewOptions | boolean): void };
      proto.scrollIntoView ??= () => undefined;
      vi.spyOn(proto, 'scrollIntoView').mockImplementation(function (this: Element, o) {
        if (this.parentNode === layer) scrolled.push(o);
      });
      bar(c, idAt(c, 0)).focus();
      press(bar(c, idAt(c, 0)), 'ArrowDown');
      press(active(), 'End');
      await c.f.whenStable();
      expect(active()).toBe(bar(c, idAt(c, 199)));
      expect(scrolled).toEqual([
        { block: 'nearest', inline: 'nearest' },
        { block: 'nearest', inline: 'nearest' },
      ]);
    });

    it('←/→ pan the timeline by one bottom-tier header cell', async () => {
      const c = await mount(h => h.options.set({ viewMode: ViewMode.Day, initialScroll: false }));
      const tl = c.layout.timeline();
      const viewport = c.$('.gantry-canvas-viewport');
      bar(c, 't0').focus();
      expect(press(bar(c, 't0'), 'ArrowRight')).toBe(true);
      const right = panScrollLeft(tl, 0, 0, 1);
      expect(right).toBeGreaterThan(0);
      expect(viewport.scrollLeft).toBe(right);
      expect(c.scroll.scrollLeft()).toBe(right);
      // Focus stays on the bar
      expect(active()).toBe(bar(c, 't0'));
      press(bar(c, 't0'), 'ArrowLeft');
      expect(viewport.scrollLeft).toBe(0);
      expect(c.scroll.scrollLeft()).toBe(0);
    });
  });

  describe('selection and activation', () => {
    it('Space toggles (multiple selection), Shift+Space extends the range, Ctrl+Space toggles', async () => {
      const c = await mount(h => h.tasks.set(plan(6)));
      const ids = () => c.gantt.getSelectedTasks().map(t => t.id);
      bar(c, idAt(c, 1)).focus();
      expect(press(bar(c, idAt(c, 1)), ' ')).toBe(true);
      expect(ids()).toEqual([idAt(c, 1)]);
      press(bar(c, idAt(c, 3)), ' ', { shiftKey: true });
      const sorted = (...rows: number[]) => rows.map(i => idAt(c, i)).sort();
      expect(ids().sort()).toEqual(sorted(1, 2, 3));
      press(bar(c, idAt(c, 2)), ' ', { ctrlKey: true });
      expect(ids().sort()).toEqual(sorted(1, 3));
      press(bar(c, idAt(c, 2)), ' ');
      expect(ids().sort()).toEqual(sorted(1, 2, 3));
    });

    it('single selection: Space selects the bar alone', async () => {
      const c = await mount(h => h.options.set({ initialScroll: false, multiSelect: false }));
      press(bar(c, 't1'), ' ');
      press(bar(c, 't2'), ' ');
      expect(c.gantt.getSelectedTasks().map(t => t.id)).toEqual(['t2']);
    });

    it('Enter / F2 on a bar that cannot move activate it: only this row, and rowClick', async () => {
      const c = await mount(h => h.drag.set(false));
      await c.set(() => c.gantt.setSelectedTasks(['t0', 't3']));
      expect(press(bar(c, 't1'), 'Enter')).toBe(true);
      expect(c.gantt.getSelectedTasks().map(t => t.id)).toEqual(['t1']);
      press(bar(c, 't2'), 'F2');
      expect(c.h.clicks).toEqual(['t1', 't2']);
      expect(c.drag.preview()).toBeNull();
      expect(c.drag.isActive()).toBe(false);
    });

    it('a task with draggable: false activates too', async () => {
      const c = await mount(h => h.tasks.set(plan(3).map(t => (t.id === 't1' ? { ...t, draggable: false } : t))));
      press(bar(c, 't1'), 'Enter');
      expect(c.h.clicks).toEqual(['t1']);
      expect(c.drag.isActive()).toBe(false);
    });
  });

  describe('global shortcuts', () => {
    it('F fits, + / − zoom, T scrolls to today and Ctrl+A selects all from a bar; Esc clears', async () => {
      const c = await mount(h => h.options.set({ viewMode: ViewMode.Week, initialScroll: false }));
      const fit = vi.spyOn(c.gantt, 'fitToScreen');
      const today = vi.spyOn(c.gantt, 'scrollToToday');
      expect(press(bar(c, 't0'), 'f')).toBe(true);
      expect(fit).toHaveBeenCalledOnce();
      press(bar(c, 't0'), '+');
      expect(c.layout.level()).toBe(ViewMode.Day);
      await c.f.whenStable();
      press(bar(c, 't0'), '-');
      expect(c.layout.level()).toBe(ViewMode.Week);
      await c.f.whenStable();
      press(bar(c, 't0'), 'T');
      expect(today).toHaveBeenCalledOnce();
      press(bar(c, 't0'), 'a', { ctrlKey: true });
      expect(c.gantt.getSelectedTasks()).toHaveLength(5);
      press(bar(c, 't0'), 'Escape');
      expect(c.gantt.getSelectedTasks()).toHaveLength(0);
    });

    it('F works from the task list as well', async () => {
      const c = await mount();
      const fit = vi.spyOn(c.gantt, 'fitToScreen');
      press(c.$('.gantt-tl-row'), 'F');
      press(c.$('.gantt-tl-col-header'), 'f');
      expect(fit).toHaveBeenCalledTimes(2);
    });

    it('characterShortcuts: false leaves + − T F to the page (Ctrl+A and Esc stay)', async () => {
      const c = await mount(h =>
        h.options.set({ viewMode: ViewMode.Week, initialScroll: false, keyboard: { characterShortcuts: false } }),
      );
      const fit = vi.spyOn(c.gantt, 'fitToScreen');
      for (const key of ['f', '+', '-', 't']) expect(press(bar(c, 't0'), key), key).toBe(false);
      expect(fit).not.toHaveBeenCalled();
      expect(c.layout.level()).toBe(ViewMode.Week);
      expect(press(bar(c, 't0'), 'a', { ctrlKey: true })).toBe(true);
      expect(c.gantt.getSelectedTasks()).toHaveLength(5);
    });

    it('leaves the arrow keys of the viewport alone while no bar is mounted (native scroll)', async () => {
      const c = await mount(h => h.tasks.set([]));
      const viewport = c.$('.gantry-canvas-viewport');
      expect(viewport.getAttribute('tabindex')).toBe('0');
      expect(press(viewport, 'ArrowRight')).toBe(false);
      expect(press(viewport, 'ArrowDown')).toBe(false);
    });
  });
});

describe('<gantry> keyboard move mode', () => {
  const mountEdit = (setup?: (h: Host) => void) =>
    mount(h => {
      h.tasks.set(editTasks());
      h.options.set({ viewMode: ViewMode.Day, initialScroll: false });
      setup?.(h);
    });

  /** Focus `id`'s bar and press Enter on it, with a render after each (as between real key presses). */
  async function startEdit(c: Chart, id: string): Promise<void> {
    await c.set(() => bar(c, id).focus());
    expect(press(active(), 'Enter')).toBe(true);
    await c.f.whenStable();
  }

  it('starts on Enter / F2: the drag preview (ghost, dimmed bar) and the instructions', async () => {
    const c = await mountEdit();
    await startEdit(c, 'a');
    expect(c.drag.state()).toEqual({ kind: 'external', taskId: 'a' });
    expect(c.drag.preview()).toMatchObject({ taskId: 'a', delta: 0, unit: 'day' });
    await c.f.whenStable();
    expect(c.$$('.gantt-drag-preview')).toHaveLength(1);
    expect(bar(c, 'a').style.getPropertyValue('opacity')).toBe('0.35');
    expect(active()).toBe(bar(c, 'a'));
    await settle(c);
    expect(live(c)).toBe(DEFAULT_LABELS.announceEditStart('Alpha'));

    press(active(), 'Escape');
    bar(c, 'b').focus();
    expect(press(active(), 'F2')).toBe(true);
    expect(c.drag.preview()?.taskId).toBe('b');
  });

  it('←/→ move by a snap unit, each step read out; Enter commits like a drop (taskDragged, announced)', async () => {
    const c = await mountEdit();
    await startEdit(c, 'a');
    expect(press(active(), 'ArrowRight')).toBe(true);
    press(active(), 'ArrowRight');
    expect(c.drag.preview()).toMatchObject({ taskId: 'a', delta: 2 });
    expect(c.drag.preview()?.start).toEqual(day(4));
    await settle(c);
    // The readout chip's words (dates and duration)
    expect(live(c)).toContain('4 Mar');
    expect(c.h.dragged).toHaveLength(0);

    expect(press(active(), 'Enter')).toBe(true);
    expect(c.drag.preview()).toBeNull();
    expect(c.drag.isActive()).toBe(false);
    expect(c.h.dragged).toEqual([
      { taskId: 'a', oldStart: day(2), oldEnd: day(6), newStart: day(4), newEnd: day(8), daysMoved: 2 },
    ]);
    expect(c.layout.tasks().find(t => t.id === 'a')).toMatchObject({ start: day(4), end: day(8) });
    await settle(c);
    expect(live(c)).toBe(DEFAULT_LABELS.announceMoved('Alpha', 2, 'day'));
    // Focus stays on the bar, out of move mode
    expect(active()).toBe(bar(c, 'a'));
  });

  it('Shift+←/→ resize the end, Alt+←/→ the start (taskResized); committing nothing says so', async () => {
    const c = await mountEdit();
    await startEdit(c, 'b');
    press(active(), 'ArrowRight', { shiftKey: true });
    press(active(), 'Enter');
    expect(c.h.resized).toEqual([
      {
        taskId: 'b',
        edge: 'end',
        handle: 'right',
        oldStart: day(4),
        oldEnd: day(10),
        newStart: day(4),
        newEnd: day(11),
        daysDelta: 1,
      },
    ]);
    await c.f.whenStable();

    await startEdit(c, 'b');
    press(active(), 'ArrowLeft', { altKey: true });
    press(active(), 'Enter');
    expect(c.h.resized[1]).toMatchObject({ handle: 'left', newStart: day(3), newEnd: day(11), daysDelta: -1 });
    await c.f.whenStable();

    await startEdit(c, 'b');
    press(active(), 'Enter');
    expect(c.h.resized).toHaveLength(2);
    await settle(c);
    expect(live(c)).toBe(DEFAULT_LABELS.announceEditNoChange('Beta'));
  });

  it('only moves milestones and bars with enableResize off', async () => {
    const c = await mountEdit();
    await startEdit(c, 'm');
    press(active(), 'ArrowRight', { shiftKey: true });
    expect(c.drag.preview()).toMatchObject({ taskId: 'm', delta: 0 });
    press(active(), 'ArrowRight');
    expect(c.drag.preview()?.start).toEqual(addDays(day(12), 1));
    press(active(), 'Escape');

    await c.set(() => c.h.resize.set(false));
    await startEdit(c, 'a');
    press(active(), 'ArrowLeft', { altKey: true });
    expect(c.drag.preview()?.start).toEqual(day(2));
  });

  it('Esc cancels first (announced, nothing emitted), the next Esc clears the selection (D24)', async () => {
    const c = await mountEdit();
    await c.set(() => c.gantt.setSelectedTasks(['a', 'b']));
    await startEdit(c, 'a');
    press(active(), 'ArrowRight');
    expect(press(active(), 'Escape')).toBe(true);
    expect(c.drag.preview()).toBeNull();
    expect(c.drag.isActive()).toBe(false);
    expect(c.h.dragged).toHaveLength(0);
    expect(c.layout.tasks().find(t => t.id === 'a')?.start).toEqual(day(2));
    expect(c.gantt.getSelectedTasks()).toHaveLength(2);
    await settle(c);
    expect(live(c)).toBe(DEFAULT_LABELS.announceEditCancel('Alpha'));
    press(active(), 'Escape');
    expect(c.gantt.getSelectedTasks()).toHaveLength(0);
  });

  it('Tab, blur and a pointer press cancel it', async () => {
    const c = await mountEdit();
    await startEdit(c, 'a');
    press(active(), 'ArrowRight');
    // Tab is not prevented: focus moves on
    expect(press(active(), 'Tab')).toBe(false);
    expect(c.drag.isActive()).toBe(false);

    await startEdit(c, 'a');
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    try {
      outside.focus();
      expect(c.drag.isActive()).toBe(false);
    } finally {
      outside.remove();
    }

    await startEdit(c, 'a');
    c.$('.gantt-tl-row').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    expect(c.drag.isActive()).toBe(false);
  });

  it('is modal: other plain keys do nothing, shortcuts with a modifier stay with the browser', async () => {
    const c = await mountEdit();
    const fit = vi.spyOn(c.gantt, 'fitToScreen');
    await startEdit(c, 'a');
    expect(press(active(), 'f')).toBe(true);
    expect(press(active(), '+')).toBe(true);
    expect(press(active(), ' ')).toBe(true);
    // ↑/↓ change the progress only with `editing.progress` (scaffold-p11.spec.ts): used, nothing changes
    expect(press(active(), 'ArrowDown')).toBe(true);
    expect(fit).not.toHaveBeenCalled();
    expect(c.layout.level()).toBe(ViewMode.Day);
    expect(c.gantt.getSelectedTasks()).toHaveLength(0);
    expect(press(active(), 'c', { ctrlKey: true })).toBe(false);
    expect(c.drag.preview()).toMatchObject({ taskId: 'a', delta: 0 });
    expect(active()).toBe(bar(c, 'a'));
  });

  it('a zoom during move mode cancels it at the next key; destroying the chart ends it', async () => {
    const c = await mountEdit();
    await startEdit(c, 'a');
    press(active(), 'ArrowRight');
    await c.set(() => c.gantt.zoomOut());
    expect(press(active(), 'Enter')).toBe(true);
    expect(c.drag.isActive()).toBe(false);
    expect(c.h.dragged).toHaveLength(0);

    await c.f.whenStable();
    await startEdit(c, 'a');
    expect(c.drag.isActive()).toBe(true);
    const end = vi.spyOn(c.drag, 'endExternal');
    c.f.destroy();
    expect(end).toHaveBeenCalled();
    expect(c.drag.isActive()).toBe(false);
  });

  it('does not start on a bar that cannot move (activates it instead)', async () => {
    const c = await mountEdit(h => h.tasks.set(editTasks().map(t => (t.id === 'b' ? { ...t, draggable: false } : t))));
    bar(c, 'b').focus();
    press(active(), 'Enter');
    expect(c.drag.isActive()).toBe(false);
    expect(c.h.clicks).toEqual(['b']);
  });
});
