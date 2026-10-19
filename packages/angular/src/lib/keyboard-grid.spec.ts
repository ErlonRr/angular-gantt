// Keys in the task list (Gantry 2 phase 9, step 4.5, contract §3d and D6), the Web Component's
// `keyboard-grid.test.ts` in Angular: a row-first treegrid with one tab stop (rows, cells and header
// cells rove; collapse toggles are out of the tab order), ↑/↓ PgUp/PgDn Home/End between rows
// (mounting rows beyond the virtual window), →/← to expand / collapse or to move into the cells and
// back, the header row above row 1 (Enter / Space sort), Enter / Space selection, and the
// expand / collapse announcements. happy-dom measures nothing: the viewport is the 500 px fallback.
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  Component,
  computed,
  provideZonelessChangeDetection,
  signal,
  viewChild,
  type TemplateRef,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  ANNOUNCE_DEBOUNCE,
  TaskType,
  type ColumnCellContext,
  type ColumnDef,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttLayoutService } from './layout/gantt-layout.service';

/** `n` one-week tasks in March 2026. */
const plan = (n: number): GanttTask[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Task ${i}`,
    start: new Date(2026, 2, 2 + (i % 20)),
    end: new Date(2026, 2, 9 + (i % 20)),
    progress: 40,
  }));

/** A group `g` with children `a` and `b`, then a root task `r`. */
const tree = (): GanttTask[] => [
  { id: 'g', name: 'Group', type: TaskType.Group, start: new Date(2026, 2, 2), end: new Date(2026, 2, 20) },
  { id: 'a', name: 'Alpha', parentId: 'g', start: new Date(2026, 2, 2), end: new Date(2026, 2, 9) },
  { id: 'b', name: 'Beta', parentId: 'g', start: new Date(2026, 2, 9), end: new Date(2026, 2, 20) },
  { id: 'r', name: 'Root', start: new Date(2026, 2, 21), end: new Date(2026, 2, 25) },
];

@Component({
  imports: [GantryComponent],
  template: `
    <gantry
      style="height: 400px"
      [series]="tasks()"
      [options]="options()"
      [columns]="columns()"
      (rowClick)="clicks.push($event.task.id)"
    />
    <ng-template #noteCell><input class="note-input" /></ng-template>
  `,
})
class Host {
  readonly tasks = signal<GanttTask[]>(tree());
  readonly options = signal<GanttOptions>({ initialScroll: false });
  readonly withNote = signal(false);
  readonly clicks: string[] = [];
  readonly gantt = viewChild.required(GantryComponent);
  private readonly noteCell = viewChild<TemplateRef<ColumnCellContext>>('noteCell');
  readonly columns = computed<ColumnDef[]>(() =>
    this.withNote()
      ? [
          { key: 'name', label: 'Name', width: 200 },
          { key: 'note', label: 'Note', width: 120, cellTemplate: this.noteCell() },
        ]
      : [],
  );
}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  gantt: GantryComponent;
  layout: GanttLayoutService;
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
    gantt: f.componentInstance.gantt(),
    layout: debug.injector.get(GanttLayoutService),
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

const row = (c: Chart, id: string) => c.$(`.gantt-tl-row[data-task-id="${id}"]`);
const byKey = (c: Chart, key: string) => {
  const el = c.$$('[data-focus-key]').find(e => e.getAttribute('data-focus-key') === key);
  if (!el) throw new Error(`no element with focus key ${key}`);
  return el;
};
const focusKey = () => document.activeElement?.getAttribute('data-focus-key') ?? null;
/** Id of the task shown at visible row `i`. */
const idAt = (c: Chart, i: number) => c.layout.visibleRows()[i].task.id;
/** Keys of the task list's columns in the current view. */
const colKeys = (c: Chart) => c.$$('.gantt-tl-col-header').map(h => h.getAttribute('data-focus-key')!.slice(5));
/** Every element of the task list that is a tab stop. */
const stops = (c: Chart) => c.$$('gantt-tasklist [tabindex="0"]').map(n => n.getAttribute('data-focus-key'));
const live = (c: Chart) => c.$('.gantt-sr-live').textContent;

/** A real keydown (bubbling, cancelable) on what has focus; returns whether the chart used it. */
function press(key: string, init: KeyboardEventInit = {}): boolean {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init });
  (document.activeElement ?? document.body).dispatchEvent(e);
  return e.defaultPrevented;
}

/** Lets a debounced announcement reach the live region, then waits for the render. */
async function settle(c: Chart): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ANNOUNCE_DEBOUNCE + 20));
  await c.f.whenStable();
}

afterEach(() => vi.restoreAllMocks());

describe('<gantry> task-list keys', () => {
  describe('one tab stop (D6)', () => {
    it('has header cells and cells in the navigation at tabindex -1, collapse toggles out of the tab order', async () => {
      const c = await mount();
      const keys = colKeys(c);
      const heads = c.$$('.gantt-tl-col-header');
      expect(heads.map(h => h.getAttribute('data-focus-key'))).toEqual(keys.map(k => `head:${k}`));
      expect(heads.every(h => h.getAttribute('tabindex') === '-1')).toBe(true);
      const cells = c.$$('.gantt-tl-row[data-task-id="a"] > .gantt-tl-cell');
      expect(cells.map(el => el.getAttribute('data-focus-key'))).toEqual(keys.map(k => `cell:a:${k}`));
      expect(cells.every(el => el.getAttribute('tabindex') === '-1')).toBe(true);
      expect(c.$('.gantt-collapse-btn').getAttribute('tabindex')).toBe('-1');
      // The one stop: the first row in view
      expect(stops(c)).toEqual([`row:${idAt(c, 0)}`]);
    });

    it('moves the tab stop to the cell or header cell focused last, and back to a row', async () => {
      const c = await mount();
      const [first, second] = colKeys(c);
      await c.set(() => byKey(c, `cell:b:${second}`).focus());
      expect(stops(c)).toEqual([`cell:b:${second}`]);
      // Focus leaves the chart: the cell keeps it
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      try {
        await c.set(() => outside.focus());
        expect(stops(c)).toEqual([`cell:b:${second}`]);
      } finally {
        outside.remove();
      }

      await c.set(() => byKey(c, `head:${first}`).focus());
      expect(stops(c)).toEqual([`head:${first}`]);
      await c.set(() => row(c, 'r').focus());
      expect(stops(c)).toEqual(['row:r']);
    });

    it('follows the bar focused in the timeline (the shared active row)', async () => {
      const c = await mount();
      await c.set(() => byKey(c, `cell:a:${colKeys(c)[0]}`).focus());
      await c.set(() => c.$('.gantt-bars-layer > [data-task-id="r"]').focus());
      expect(stops(c)).toEqual(['row:r']);
    });
  });

  describe('rows', () => {
    it('↑/↓ move between rows, without wrapping (the key is still used at the ends)', async () => {
      const c = await mount(h => h.tasks.set(plan(5)));
      row(c, idAt(c, 0)).focus();
      expect(press('ArrowDown')).toBe(true);
      expect(focusKey()).toBe(`row:${idAt(c, 1)}`);
      press('ArrowDown');
      press('ArrowUp');
      expect(focusKey()).toBe(`row:${idAt(c, 1)}`);
      press('End');
      expect(focusKey()).toBe(`row:${idAt(c, 4)}`);
      expect(press('ArrowDown')).toBe(true);
      expect(focusKey()).toBe(`row:${idAt(c, 4)}`);
      press('Home');
      expect(focusKey()).toBe(`row:${idAt(c, 0)}`);
      await c.f.whenStable();
      expect(stops(c)).toEqual([`row:${idAt(c, 0)}`]);
    });

    it('PageDown / End reach rows outside the virtual window: pinned, then focused after the render', async () => {
      const c = await mount(h => h.tasks.set(plan(200)));
      const last = idAt(c, 199);
      expect(c.$$(`.gantt-tl-row[data-task-id="${last}"]`)).toHaveLength(0);
      row(c, idAt(c, 0)).focus();
      press('End');
      expect(c.layout.focusedRowId()).toBe(last);
      await c.f.whenStable();
      expect(focusKey()).toBe(`row:${last}`);
      expect(row(c, last).classList.contains('gantt-tl-row--pinned')).toBe(true);

      press('Home');
      await c.f.whenStable();
      const page = Math.floor((500 - c.layout.headerHeight()) / c.layout.rowHeight());
      press('PageDown');
      await c.f.whenStable();
      expect(focusKey()).toBe(`row:${idAt(c, page)}`);
      press('PageUp');
      await c.f.whenStable();
      expect(focusKey()).toBe(`row:${idAt(c, 0)}`);
    });

    it('→ expands a collapsed group, then enters its first cell; ← collapses, else goes to the parent row', async () => {
      const c = await mount();
      await c.set(() => c.gantt.collapseAll());
      row(c, 'g').focus();
      expect(press('ArrowRight')).toBe(true);
      await c.f.whenStable();
      expect(row(c, 'g').getAttribute('aria-expanded')).toBe('true');
      expect(focusKey()).toBe('row:g');
      await settle(c);
      expect(live(c)).toBe('Group expanded');

      press('ArrowRight');
      expect(focusKey()).toBe(`cell:g:${colKeys(c)[0]}`);
      press('ArrowLeft');
      expect(focusKey()).toBe('row:g');

      // A child: ← goes to its parent; on the expanded parent ← collapses
      press('ArrowDown');
      expect(focusKey()).toBe(`row:${idAt(c, 1)}`);
      press('ArrowLeft');
      expect(focusKey()).toBe('row:g');
      press('ArrowLeft');
      await c.f.whenStable();
      expect(row(c, 'g').getAttribute('aria-expanded')).toBe('false');
      expect(c.$$('.gantt-tl-row[data-task-id="a"]')).toHaveLength(0);
      await settle(c);
      expect(live(c)).toBe('Group collapsed');
      // A root row without children: ← does nothing (but uses the key)
      row(c, 'r').focus();
      expect(press('ArrowLeft')).toBe(true);
      expect(focusKey()).toBe('row:r');
    });

    it('Enter activates the row (only this row + rowClick); Space toggles, Shift+Space extends, Ctrl+Space toggles', async () => {
      const c = await mount(h => h.tasks.set(plan(5)));
      const ids = () =>
        c.gantt
          .getSelectedTasks()
          .map(t => t.id)
          .sort();
      const sorted = (...rows: number[]) => rows.map(i => idAt(c, i)).sort();
      row(c, idAt(c, 1)).focus();
      expect(press('Enter')).toBe(true);
      expect(ids()).toEqual(sorted(1));
      expect(c.h.clicks).toEqual([idAt(c, 1)]);
      press('ArrowDown');
      press('ArrowDown');
      expect(press(' ', { shiftKey: true })).toBe(true);
      expect(ids()).toEqual(sorted(1, 2, 3));
      press('ArrowUp');
      press(' ', { ctrlKey: true });
      expect(ids()).toEqual(sorted(1, 3));
      press(' ');
      expect(ids()).toEqual(sorted(1, 2, 3));
      expect(c.h.clicks).toHaveLength(1);
    });
  });

  describe('cells', () => {
    it('←/→ move between cells, ← on the first cell returns to the row; ↑/↓ keep the column; Home/End, Ctrl+Home/End', async () => {
      const c = await mount(h => h.tasks.set(plan(4)));
      const keys = colKeys(c);
      const last = keys.length - 1;
      row(c, idAt(c, 1)).focus();
      press('ArrowRight');
      expect(focusKey()).toBe(`cell:${idAt(c, 1)}:${keys[0]}`);
      press('ArrowRight');
      expect(focusKey()).toBe(`cell:${idAt(c, 1)}:${keys[1]}`);
      press('ArrowDown');
      expect(focusKey()).toBe(`cell:${idAt(c, 2)}:${keys[1]}`);
      press('End');
      expect(focusKey()).toBe(`cell:${idAt(c, 2)}:${keys[last]}`);
      press('Home');
      expect(focusKey()).toBe(`cell:${idAt(c, 2)}:${keys[0]}`);
      press('End', { ctrlKey: true });
      expect(focusKey()).toBe(`cell:${idAt(c, 3)}:${keys[0]}`);
      press('Home', { ctrlKey: true });
      expect(focusKey()).toBe(`cell:${idAt(c, 0)}:${keys[0]}`);
      press('ArrowLeft');
      expect(focusKey()).toBe(`row:${idAt(c, 0)}`);
    });

    it('Enter on a cell activates its row; a button inside a cell keeps Enter and Space', async () => {
      const c = await mount();
      byKey(c, `cell:r:${colKeys(c)[0]}`).focus();
      press('Enter');
      expect(c.h.clicks).toEqual(['r']);
      const toggle = byKey(c, 'collapse:g');
      toggle.focus();
      expect(press('Enter')).toBe(false);
      expect(press(' ')).toBe(false);
      expect(c.h.clicks).toEqual(['r']);
      // Arrow keys still move from the cell the button is in
      expect(press('ArrowDown')).toBe(true);
      expect(focusKey()).toBe(`cell:${idAt(c, 1)}:${colKeys(c)[0]}`);
    });

    it('leaves the keys of a text field in a custom cell alone', async () => {
      const c = await mount(h => {
        h.tasks.set(plan(2));
        h.withNote.set(true);
        h.options.set({ initialScroll: false, panel: { columns: ['name', 'note'] } });
      });
      const input = c.$('.gantt-tl-cell input');
      input.focus();
      expect(press('ArrowDown')).toBe(false);
      expect(press(' ')).toBe(false);
      expect(press('f')).toBe(false);
    });
  });

  describe('header row', () => {
    it('↑ from the first row enters the header row, ↓ comes back in the same column; Enter / Space sort', async () => {
      const c = await mount(h => h.tasks.set(plan(3)));
      const keys = colKeys(c);
      row(c, idAt(c, 0)).focus();
      press('ArrowUp');
      expect(focusKey()).toBe(`head:${keys[0]}`);
      press('ArrowRight');
      expect(focusKey()).toBe(`head:${keys[1]}`);
      // Up and page / edge jumps stay in the header or stop at row 1
      expect(press('ArrowUp')).toBe(true);
      expect(focusKey()).toBe(`head:${keys[1]}`);
      press('ArrowDown');
      expect(focusKey()).toBe(`cell:${idAt(c, 0)}:${keys[1]}`);
      press('ArrowUp');

      press('ArrowLeft');
      expect(focusKey()).toBe('head:name');
      expect(press('Enter')).toBe(true);
      await c.f.whenStable();
      expect(c.layout.sort()).toEqual({ key: 'name', dir: 'asc' });
      expect(focusKey()).toBe('head:name');
      press(' ');
      await c.f.whenStable();
      expect(c.layout.sort()).toEqual({ key: 'name', dir: 'desc' });
      expect(byKey(c, 'head:name').getAttribute('aria-sort')).toBe('descending');
    });
  });
});
