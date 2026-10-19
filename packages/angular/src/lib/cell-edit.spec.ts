// Cell editing in <gantry> (Gantry 2 phase 11, step 4.7, D14–D16, §3d / §3e), the Web Component's
// `cell-edit.test.ts`: F2, Enter, typing and double-click open a cell's editor (an input / select,
// the column's function editor or its `<ng-template ganttCellEditor>`), Enter / Tab / Shift+Tab /
// Escape / blur finish it, an invalid value keeps it open with `aria-invalid`, the message under the
// cell and in the alert text, and every commit is one `'cell'` change through the pipeline
// (undoable, vetoable). With `editing` off nothing changes. Also: the `ganttColumn` editing inputs
// and the cell template that is not the editor's.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { Component, TemplateRef, provideZonelessChangeDetection, signal, viewChild, viewChildren } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  ViewMode,
  type CellEditorContext,
  type GanttBeforeChangeEvent,
  type GanttOptions,
  type GanttTask,
  type GanttTasksChangeEvent,
  type TaskProgressEvent,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttColumnDefDirective } from './columns/gantt-column.directive';
import { GanttCellEditorDirective } from './columns/gantt-cell-editor.directive';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttCellEditService } from './editing/cell-edit';
import { type ColumnDef } from './types';

const day = (d: number) => new Date(2026, 2, d);
const plan = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(6), progress: 20 },
  { id: 'b', name: 'Beta', start: day(8), end: day(12), progress: 50, dependency: 'a' },
  { id: 'c', name: 'Gamma', start: day(14), end: day(16), progress: 0 },
];
const BASE: GanttOptions = { viewMode: ViewMode.Day, initialScroll: false };

const PIPELINE = [
  'beforeChange',
  'taskDragged',
  'taskResized',
  'taskProgressChanged',
  'dependencyCreated',
  'dependencyDeleted',
  'taskUpdated',
  'tasksChange',
  'historyChange',
];

@Component({
  imports: [GantryComponent, GanttColumnDefDirective, GanttCellEditorDirective],
  template: `<gantry
    style="height: 400px"
    [(series)]="tasks"
    [options]="options()"
    [columns]="columns()"
    (beforeChange)="onBefore($event)"
    (taskDragged)="log('taskDragged', $event)"
    (taskResized)="log('taskResized', $event)"
    (taskProgressChanged)="log('taskProgressChanged', $event)"
    (dependencyCreated)="log('dependencyCreated', $event)"
    (dependencyDeleted)="log('dependencyDeleted', $event)"
    (taskUpdated)="log('taskUpdated', $event)"
    (tasksChange)="log('tasksChange', $event)"
    (historyChange)="log('historyChange', $event)"
    (rowClick)="clicks.push('rowClick')"
    (rowDblClick)="clicks.push('rowDblClick')"
  >
    @if (withTemplate()) {
      <ng-container ganttColumn="estimate" label="Estimate" editable [width]="120">
        <ng-template ganttCellEditor let-edit>
          <span class="estimate-editor"
            ><input
              class="estimate-input"
              [value]="edit.value"
              (input)="edit.setValue($any($event.target).value)"
            /><button type="button" (click)="edit.commit()">OK</button></span
          >
        </ng-template>
        <ng-template let-row
          ><span class="estimate-cell">{{ row.task.data?.estimate ?? '' }} h</span></ng-template
        >
      </ng-container>
    }
  </gantry>`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(plan());
  readonly options = signal<GanttOptions>({ ...BASE, editing: true });
  readonly columns = signal<ColumnDef[]>([]);
  readonly withTemplate = signal(false);
  readonly events: [string, unknown][] = [];
  readonly clicks: string[] = [];
  /** What `beforeChange` does besides being logged */
  before: (e: GanttBeforeChangeEvent) => void = () => undefined;
  readonly gantt = viewChild.required(GantryComponent);
  readonly defs = viewChildren(GanttColumnDefDirective);

  log(type: string, detail: unknown): void {
    this.events.push([type, detail]);
  }
  onBefore(e: GanttBeforeChangeEvent): void {
    this.log('beforeChange', e);
    this.before(e);
  }
}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  host: HTMLElement;
  gantt: GantryComponent;
  layout: GanttLayoutService;
  cells: GanttCellEditService;
  /** Runs `change`, then waits for the render (and its after-render work) */
  set(change?: () => void): Promise<void>;
}

async function mount(setup?: (h: Host) => void): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  setup?.(f.componentInstance);
  await f.whenStable();
  const debug = f.debugElement.query(By.directive(GantryComponent));
  return {
    f,
    h: f.componentInstance,
    host: debug.nativeElement as HTMLElement,
    gantt: f.componentInstance.gantt(),
    layout: debug.injector.get(GanttLayoutService),
    cells: debug.injector.get(GanttCellEditService),
    async set(change) {
      change?.();
      await f.whenStable();
    },
  };
}

const $ = <T extends Element = HTMLElement>(c: Chart, sel: string) => c.host.querySelector<T>(sel);
const $$ = (c: Chart, sel: string) => [...c.host.querySelectorAll<HTMLElement>(sel)];
const cell = (c: Chart, id: string, key: string) => $(c, `[data-focus-key="cell:${id}:${key}"]`)!;
const row = (c: Chart, id: string) => $(c, `.gantt-tl-row[data-task-id="${id}"]`);
const editor = (c: Chart) => $<HTMLInputElement>(c, '.gantt-tl-editor');
const active = () => document.activeElement as HTMLElement | null;
const focusKey = () => active()?.getAttribute('data-focus-key') ?? null;
const taskOf = (c: Chart, id: string) => c.h.tasks().find(t => t.id === id)!;
const names = (c: Chart) => c.h.events.map(([type]) => type).filter(t => PIPELINE.includes(t));

/** A real keydown (bubbling, cancelable) on what has focus; returns whether the chart used it. */
function press(key: string, init: KeyboardEventInit = {}): boolean {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init });
  (active() ?? document.body).dispatchEvent(e);
  return e.defaultPrevented;
}
/** Types `text` into the open built-in editor (its `input` event). */
function type(c: Chart, text: string): void {
  const input = editor(c)!;
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
/** Focuses `id`'s `key` cell and opens its editor with F2. */
async function edit(c: Chart, id: string, key: string): Promise<HTMLInputElement> {
  await c.set(() => cell(c, id, key).focus());
  expect(press('F2')).toBe(true);
  await c.set();
  return editor(c)!;
}
const dblclick = (el: Element) => el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

afterEach(() => {
  // happy-dom may keep focus on a removed node (browsers move it to the body)
  active()?.blur();
  vi.restoreAllMocks();
});

describe('<gantry> cell editing', () => {
  describe('with editing off', () => {
    it('paints no aria-readonly and opens nothing: F2, typing and a double-click keep their old behaviour', async () => {
      const c = await mount(h => h.options.set(BASE));
      expect($$(c, '[aria-readonly]')).toHaveLength(0);
      await c.set(() => cell(c, 'a', 'name').focus());
      expect(press('F2')).toBe(false);
      press('x');
      // Enter still activates the row
      expect(press('Enter')).toBe(true);
      dblclick(cell(c, 'a', 'name'));
      await c.set();
      expect(editor(c)).toBeNull();
      expect($$(c, '.gantt-tl-row--editing, .gantt-tl-cell--editing')).toHaveLength(0);
      expect(c.h.clicks).toEqual(['rowClick', 'rowDblClick']);
      expect(c.gantt.editCell('a', 'name')).toBe(false);
      expect(c.layout.cellEdit()).toBeNull();
    });
  });

  describe('aria-readonly', () => {
    it('marks editable cells false and the others true, per column and per row', async () => {
      const c = await mount(h => {
        h.options.set({ ...BASE, editing: true, view: 'table' });
        h.tasks.set([...plan(), { id: 'r', name: 'Locked', start: day(2), end: day(4), editable: false }]);
      });
      const ro = (id: string, key: string) => cell(c, id, key).getAttribute('aria-readonly');
      for (const key of ['name', 'start', 'end', 'duration', 'progress', 'predecessors'])
        expect(ro('a', key)).toBe('false');
      for (const key of ['type', 'status']) expect(ro('a', key)).toBe('true');
      for (const key of ['name', 'start', 'progress']) expect(ro('r', key)).toBe('true');
      // editing.cells: false removes the attribute again
      await c.set(() => c.h.options.set({ ...BASE, view: 'table', editing: { cells: false } }));
      expect($$(c, '[aria-readonly]')).toHaveLength(0);
    });
  });

  describe('opening (D15)', () => {
    it('F2 opens the editor (§3d): the row and cell classes, a named input with the text, focused; the content detached', async () => {
      const c = await mount();
      const input = await edit(c, 'a', 'name');
      expect(row(c, 'a')!.classList.contains('gantt-tl-row--editing')).toBe(true);
      const cl = cell(c, 'a', 'name');
      expect(cl.classList.contains('gantt-tl-cell--editing')).toBe(true);
      expect([...cl.children]).toEqual([input]);
      expect(input.tagName).toBe('INPUT');
      expect(input.getAttribute('class')).toBe('gantt-tl-editor');
      expect(input.getAttribute('type')).toBe('text');
      expect(input.getAttribute('autocomplete')).toBe('off');
      expect(input.getAttribute('aria-label')).toBe('Task Name, Alpha');
      expect(input.getAttribute('data-focus-key')).toBe('editor:a:name');
      expect(input.hasAttribute('aria-invalid')).toBe(false);
      expect(input.value).toBe('Alpha');
      expect(active()).toBe(input);
      expect(cl.querySelector('.gantt-tl-name')).toBeNull();
      expect(cl.hasAttribute('title')).toBe(false);
      expect($$(c, '.gantt-tl-cell--editing')).toHaveLength(1);
      expect(c.layout.cellEdit()).toMatchObject({ taskId: 'a', columnKey: 'name', value: 'Alpha' });
      // The row stays pinned while edited
      expect(c.layout.focusedRowId()).toBe('a');
    });

    it('Enter opens an editable cell (no row activation); a non-editable one keeps Enter', async () => {
      const c = await mount(h => h.options.set({ ...BASE, editing: true, view: 'table' }));
      await c.set(() => cell(c, 'a', 'start').focus());
      expect(press('Enter')).toBe(true);
      await c.set();
      expect(editor(c)?.getAttribute('type')).toBe('date');
      expect(editor(c)?.value).toBe('2026-03-02');
      press('Escape');
      await c.set();
      await c.set(() => cell(c, 'a', 'status').focus());
      expect(press('Enter')).toBe(true);
      await c.set();
      expect(editor(c)).toBeNull();
      expect(c.h.clicks).toEqual(['rowClick']);
    });

    it('a printable key seeds a text editor (over the + - T F shortcuts), digits seed a number editor', async () => {
      const c = await mount();
      const zoom = vi.spyOn(c.gantt, 'zoomIn');
      await c.set(() => cell(c, 'a', 'name').focus());
      expect(press('+')).toBe(true);
      await c.set();
      expect(editor(c)?.value).toBe('+');
      expect(zoom).not.toHaveBeenCalled();
      press('Escape');
      await c.set();
      await c.set(() => cell(c, 'a', 'progress').focus());
      press('x');
      await c.set();
      expect(editor(c)).toBeNull();
      expect(press('7')).toBe(true);
      await c.set();
      expect(editor(c)?.getAttribute('type')).toBe('number');
      expect(editor(c)?.getAttribute('min')).toBe('0');
      expect(editor(c)?.getAttribute('max')).toBe('100');
      expect(editor(c)?.value).toBe('7');
    });

    it('keys typed during an IME composition are left alone', async () => {
      const c = await mount();
      await c.set(() => cell(c, 'a', 'name').focus());
      expect(press('a', { isComposing: true })).toBe(false);
      await c.set();
      expect(editor(c)).toBeNull();
    });

    it('a double-click opens the editor (rowDblClick still emits); clicks inside the editor are its own', async () => {
      const c = await mount();
      dblclick(cell(c, 'b', 'name'));
      await c.set();
      expect(editor(c)?.value).toBe('Beta');
      expect(active()).toBe(editor(c));
      expect(c.h.clicks).toEqual(['rowDblClick']);
      editor(c)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      dblclick(editor(c)!);
      expect(c.h.clicks).toEqual(['rowDblClick']);
    });

    it('editCell(): opens a row beyond the virtual window (pinned), false for read-only cells, unknown ids and the chart view', async () => {
      const many: GanttTask[] = Array.from({ length: 200 }, (_, i) => ({
        id: `t${i}`,
        name: `Task ${i}`,
        start: day(2),
        end: day(5),
      }));
      const c = await mount(h => h.tasks.set(many));
      expect(row(c, 't150')).toBeNull();
      await c.set(() => expect(c.gantt.editCell('t150', 'name')).toBe(true));
      expect(row(c, 't150')!.classList.contains('gantt-tl-row--pinned')).toBe(true);
      expect(editor(c)?.value).toBe('Task 150');
      expect(focusKey()).toBe('editor:t150:name');
      editor(c)!.blur();
      expect(c.gantt.editCell('nope', 'name')).toBe(false);
      expect(c.gantt.editCell('t1', 'status')).toBe(false);
      await c.set(() => c.gantt.setView('chart'));
      expect(c.gantt.editCell('t1', 'name')).toBe(false);
    });
  });

  describe('committing', () => {
    it('Enter commits one cell change through the pipeline, closes the editor and focuses the cell', async () => {
      const c = await mount();
      await edit(c, 'a', 'name');
      type(c, 'Alpha 2');
      expect(press('Enter')).toBe(true);
      await c.set();
      expect(names(c)).toEqual(['beforeChange', 'taskUpdated', 'tasksChange', 'historyChange']);
      const change = (c.h.events.find(([t]) => t === 'tasksChange')![1] as GanttTasksChangeEvent).change;
      expect(change).toMatchObject({ source: 'cell', column: 'name', coalesceKey: 'cell:a:name' });
      expect(change.updates).toEqual([{ taskId: 'a', before: { name: 'Alpha' }, after: { name: 'Alpha 2' } }]);
      expect(taskOf(c, 'a').name).toBe('Alpha 2');
      expect(editor(c)).toBeNull();
      expect(row(c, 'a')!.classList.contains('gantt-tl-row--editing')).toBe(false);
      expect(cell(c, 'a', 'name').classList.contains('gantt-tl-cell--editing')).toBe(false);
      expect(cell(c, 'a', 'name').textContent).toContain('Alpha 2');
      expect(focusKey()).toBe('cell:a:name');
      expect(c.gantt.canUndo()).toBe(true);
      await c.set(() => expect(c.gantt.undo()).toBe(true));
      expect(taskOf(c, 'a').name).toBe('Alpha');
    });

    it('the unchanged text closes the editor with no change', async () => {
      const c = await mount();
      await edit(c, 'a', 'name');
      press('Enter');
      await c.set();
      expect(names(c)).toEqual([]);
      expect(editor(c)).toBeNull();
      expect(focusKey()).toBe('cell:a:name');
    });

    it('a new start keeps the duration: the bar moves (taskDragged)', async () => {
      const c = await mount();
      await edit(c, 'a', 'start');
      type(c, '2026-03-04');
      press('Enter');
      expect(names(c)).toEqual(['beforeChange', 'taskDragged', 'taskUpdated', 'tasksChange', 'historyChange']);
      expect(taskOf(c, 'a')).toMatchObject({ start: day(4), end: day(8) });
    });

    it('Tab / Shift+Tab commit and edit the next / previous editable cell; at the row end the cell keeps focus', async () => {
      const c = await mount();
      await edit(c, 'a', 'name');
      type(c, 'Alpha 2');
      expect(press('Tab')).toBe(true);
      await c.set();
      expect(taskOf(c, 'a').name).toBe('Alpha 2');
      expect(focusKey()).toBe('editor:a:start');
      expect(press('Tab', { shiftKey: true })).toBe(true);
      await c.set();
      expect(focusKey()).toBe('editor:a:name');
      expect(editor(c)?.value).toBe('Alpha 2');
      press('Escape');
      await c.set();
      // progress is the panel's last column
      await edit(c, 'a', 'progress');
      type(c, '30');
      press('Tab');
      await c.set();
      expect(taskOf(c, 'a').progress).toBe(30);
      expect(editor(c)).toBeNull();
      expect(focusKey()).toBe('cell:a:progress');
    });

    it('Escape cancels: nothing emitted, the text dropped, focus back on the cell', async () => {
      const c = await mount();
      await edit(c, 'a', 'name');
      type(c, 'Nope');
      expect(press('Escape')).toBe(true);
      await c.set();
      expect(names(c)).toEqual([]);
      expect(taskOf(c, 'a').name).toBe('Alpha');
      expect(editor(c)).toBeNull();
      expect(focusKey()).toBe('cell:a:name');
      expect(cell(c, 'a', 'name').textContent).toContain('Alpha');
      // Escape in the editor does not also clear the selection or reach the chart
      expect(c.layout.cellEdit()).toBeNull();
    });

    it('blur commits a valid text and cancels an invalid one (announced)', async () => {
      const c = await mount();
      await edit(c, 'a', 'name');
      type(c, 'Alpha 2');
      row(c, 'b')!.focus();
      await Promise.resolve();
      expect(taskOf(c, 'a').name).toBe('Alpha 2');
      expect(c.layout.cellEdit()).toBeNull();
      await c.set();
      expect(editor(c)).toBeNull();
      expect(focusKey()).toBe('row:b');

      await edit(c, 'a', 'progress');
      type(c, '150');
      row(c, 'b')!.focus();
      await Promise.resolve();
      expect(taskOf(c, 'a').progress).toBe(20);
      expect(c.layout.cellEdit()).toBeNull();
      expect(c.cells.alert()).toBe('');
    });
  });

  describe('invalid values', () => {
    it('stay open with aria-invalid, aria-describedby → the message under the cell, and the alert text; typing clears it', async () => {
      const c = await mount();
      const input = await edit(c, 'a', 'progress');
      type(c, '150');
      expect(press('Enter')).toBe(true);
      await c.set();
      expect(names(c)).toEqual([]);
      expect(editor(c)).toBe(input);
      expect(active()).toBe(input);
      const message = 'Enter a number from 0 to 100';
      expect(input.getAttribute('aria-invalid')).toBe('true');
      const error = cell(c, 'a', 'progress').lastElementChild!;
      expect(error.getAttribute('class')).toBe('gantt-tl-editor-error');
      expect(error.textContent).toBe(message);
      expect(input.getAttribute('aria-describedby')).toBe(error.id);
      expect(error.id).toMatch(/^gantry-\d+-editor-error$/);
      expect(c.cells.alert()).toBe(message);
      // The same message again changes the alert text (read again)
      press('Enter');
      await c.set();
      expect(c.cells.alert()).not.toBe(message);
      expect(c.cells.alert().trim()).toBe(message);
      type(c, '15');
      await c.set();
      expect(input.hasAttribute('aria-invalid')).toBe(false);
      expect(input.hasAttribute('aria-describedby')).toBe(false);
      expect($(c, '.gantt-tl-editor-error')).toBeNull();
      expect(c.cells.alert()).toBe('');
      press('Enter');
      expect(taskOf(c, 'a').progress).toBe(15);
    });

    it('a pipeline rejection (a loop) and a veto keep the editor open with the reason', async () => {
      const c = await mount(h => h.options.set({ ...BASE, editing: true, view: 'table' }));
      const input = await edit(c, 'a', 'predecessors');
      // b depends on a: a ← b makes a loop
      type(c, 'b');
      press('Enter');
      await c.set();
      expect(editor(c)).toBe(input);
      expect($(c, '.gantt-tl-editor-error')?.textContent).toBe('This link would make a loop');
      expect(taskOf(c, 'a').dependency).toBeUndefined();
      press('Escape');
      await c.set();

      c.h.before = e => e.preventDefault();
      await edit(c, 'c', 'name');
      type(c, 'Vetoed');
      press('Enter');
      await c.set();
      expect(editor(c)).not.toBeNull();
      expect($(c, '.gantt-tl-editor-error')?.textContent).toBe('the change was not accepted');
      expect(taskOf(c, 'c').name).toBe('Gamma');
    });

    it('predecessors by name or id become links (dependencyCreated)', async () => {
      const c = await mount(h => h.options.set({ ...BASE, editing: true, view: 'table' }));
      await edit(c, 'c', 'predecessors');
      type(c, 'Alpha FS+2d; b');
      press('Enter');
      expect(names(c).filter(t => t === 'dependencyCreated')).toHaveLength(2);
      expect(taskOf(c, 'c').dependency).toEqual([{ taskId: 'a', lag: 2 }, { taskId: 'b' }]);
    });
  });

  describe('a custom function editor (D16)', () => {
    const colour: ColumnDef = {
      key: 'colour',
      label: 'Colour',
      width: 120,
      editable: true,
      render: r => (r.task.data?.['colour'] as string | undefined) ?? '',
      editor: (ctx: CellEditorContext) => {
        const wrap = document.createElement('div');
        const input = document.createElement('input');
        input.value = ctx.value;
        input.addEventListener('input', () => ctx.setValue(input.value));
        const ok = document.createElement('button');
        ok.addEventListener('click', () => ctx.commit());
        wrap.append(input, ok);
        return wrap;
      },
    };
    const withColour = (h: Host) => {
      h.columns.set([colour]);
      h.options.set({ ...BASE, editing: true, panel: { columns: ['name', 'colour'] } });
    };

    it('is mounted with the class, its first focusable child focused and named; setValue + commit() apply it', async () => {
      const c = await mount(withColour);
      await c.set(() => cell(c, 'a', 'colour').focus());
      expect(press('F2')).toBe(true);
      await c.set();
      const node = $(c, '.gantt-tl-cell--editing > .gantt-tl-editor')!;
      expect(node.tagName).toBe('DIV');
      const input = node.querySelector('input')!;
      expect(active()).toBe(input);
      expect(input.getAttribute('aria-label')).toBe('Colour, Alpha');
      expect(input.getAttribute('data-focus-key')).toBe('editor:a:colour');
      input.value = 'teal';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(c.layout.cellEdit()?.value).toBe('teal');
      node.querySelector('button')!.click();
      await c.set();
      expect(taskOf(c, 'a').data).toEqual({ colour: 'teal' });
      expect(editor(c)).toBeNull();
      expect(node.isConnected).toBe(false);
    });

    it('keeps the keys it prevents; Enter / Escape otherwise finish it', async () => {
      const c = await mount(withColour);
      await c.set(() => c.gantt.editCell('a', 'colour'));
      const input = $(c, '.gantt-tl-editor input')!;
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') e.preventDefault();
      });
      press('Enter');
      expect(c.layout.cellEdit()).not.toBeNull();
      expect(press('Escape')).toBe(true);
      expect(c.layout.cellEdit()).toBeNull();
    });
  });

  describe('an <ng-template ganttCellEditor> (Angular)', () => {
    const withTemplate = (h: Host) => {
      h.withTemplate.set(true);
      h.options.set({ ...BASE, editing: true, panel: { columns: ['name', 'estimate'] } });
      h.tasks.set(plan().map(t => (t.id === 'a' ? { ...t, data: { estimate: '5' } } : t)));
    };

    it('the cell template is the other <ng-template>; the column carries the editor and the editing inputs', async () => {
      const c = await mount(withTemplate);
      expect(cell(c, 'a', 'estimate').querySelector('.estimate-cell')?.textContent).toBe('5 h');
      expect($(c, '.estimate-editor')).toBeNull();
      const def = c.h.defs()[0].def();
      // The bare `editable` attribute is true
      expect(def.editable).toBe(true);
      expect(def.editor).toBeInstanceOf(TemplateRef);
      expect(def.cellTemplate).toBeInstanceOf(TemplateRef);
      const anchor = (t: unknown) => (t as TemplateRef<unknown>).elementRef.nativeElement as unknown;
      expect(anchor(def.cellTemplate)).not.toBe(anchor(def.editor));
      expect(cell(c, 'a', 'estimate').getAttribute('aria-readonly')).toBe('false');
    });

    it('renders the template as the editor: the class, its input focused and named; setValue + commit() apply it', async () => {
      const c = await mount(withTemplate);
      const before = cell(c, 'a', 'estimate');
      dblclick(before);
      await c.set();
      const node = $(c, '.gantt-tl-cell--editing > .gantt-tl-editor')!;
      expect(node.classList.contains('estimate-editor')).toBe(true);
      expect(cell(c, 'a', 'estimate')).toBe(before);
      expect(before.querySelector('.estimate-cell')).toBeNull();
      const input = node.querySelector<HTMLInputElement>('.estimate-input')!;
      expect(input.value).toBe('5');
      expect(active()).toBe(input);
      expect(input.getAttribute('aria-label')).toBe('Estimate, Alpha');
      input.value = '8';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(c.layout.cellEdit()?.value).toBe('8');
      // The editor survives the re-render its own event causes
      await c.set();
      expect($(c, '.estimate-editor')).toBe(node);
      node.querySelector('button')!.click();
      await c.set();
      expect(taskOf(c, 'a').data).toEqual({ estimate: '8' });
      expect($(c, '.estimate-editor')).toBeNull();
      expect(cell(c, 'a', 'estimate').querySelector('.estimate-cell')?.textContent).toBe('8 h');
    });

    it('an invalid value marks the template node and its field', async () => {
      const c = await mount(h => {
        withTemplate(h);
        h.columns.set([
          {
            key: 'estimate',
            label: 'Estimate',
            width: 120,
            validate: patch => (Number(patch.data?.['estimate']) > 10 ? 'Too long' : null),
          },
        ]);
      });
      await c.set(() => c.gantt.editCell('a', 'estimate'));
      const input = $<HTMLInputElement>(c, '.estimate-input')!;
      input.value = '12';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      press('Enter');
      await c.set();
      const node = $(c, '.estimate-editor')!;
      expect(node.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe(cell(c, 'a', 'estimate').lastElementChild!.id);
      expect(cell(c, 'a', 'estimate').lastElementChild!.textContent).toBe('Too long');
    });
  });

  describe('built-in kinds and history', () => {
    it("editor: 'select' renders the options; the choice is written to data[key]", async () => {
      const priority: ColumnDef = {
        key: 'priority',
        label: 'Priority',
        width: 100,
        editable: true,
        editor: 'select',
        editorOptions: {
          options: [
            { value: 'low', label: 'Low' },
            { value: 'high', label: 'High' },
          ],
        },
      };
      const c = await mount(h => {
        h.columns.set([priority]);
        h.options.set({ ...BASE, editing: true, panel: { columns: ['name', 'priority'] } });
      });
      await c.set(() => expect(c.gantt.editCell('a', 'priority')).toBe(true));
      const select = $<HTMLSelectElement>(c, 'select.gantt-tl-editor')!;
      expect([...select.options].map(o => [o.value, o.textContent])).toEqual([
        ['low', 'Low'],
        ['high', 'High'],
      ]);
      expect(active()).toBe(select);
      select.value = 'high';
      select.dispatchEvent(new Event('input', { bubbles: true }));
      press('Enter');
      await c.set();
      expect(taskOf(c, 'a').data).toEqual({ priority: 'high' });
      expect(focusKey()).toBe('cell:a:priority');
    });

    it('two edits of one cell in a row are one undo step (coalesceKey cell:<id>:<column>)', async () => {
      const c = await mount();
      await edit(c, 'a', 'name');
      type(c, 'A1');
      press('Enter');
      await c.set();
      await edit(c, 'a', 'name');
      type(c, 'A2');
      press('Enter');
      expect(c.layout.historyState().undoCount).toBe(1);
      await c.set(() => c.gantt.undo());
      expect(taskOf(c, 'a').name).toBe('Alpha');
    });

    it('destroying the chart closes the editor without a change', async () => {
      const c = await mount();
      await edit(c, 'a', 'name');
      type(c, 'Gone');
      c.f.destroy();
      expect(c.h.tasks().find(t => t.id === 'a')?.name).toBe('Alpha');
      expect(names(c)).toEqual([]);
    });
  });

  describe('a task change while editing', () => {
    it('keeps the editor and its focus; the untouched text commits nothing, a typed one applies to the new task', async () => {
      const c = await mount();
      const input = await edit(c, 'a', 'name');
      await c.set(() => c.h.tasks.update(ts => ts.map(t => (t.id === 'a' ? { ...t, name: 'Renamed' } : t))));
      expect(editor(c)).toBe(input);
      expect(active()).toBe(input);
      press('Enter');
      expect(names(c)).toEqual([]);
      expect(taskOf(c, 'a').name).toBe('Renamed');
      await c.set();

      await edit(c, 'a', 'progress');
      await c.set(() => c.h.tasks.update(ts => ts.map(t => (t.id === 'a' ? { ...t, progress: 60 } : t))));
      type(c, '70');
      press('Enter');
      const progress = c.h.events.find(([t]) => t === 'taskProgressChanged')?.[1] as TaskProgressEvent;
      expect(progress.oldProgress).toBe(60);
      expect(taskOf(c, 'a').progress).toBe(70);
    });

    it('keeps the editor node across row re-renders (selection, hover)', async () => {
      const c = await mount();
      const input = await edit(c, 'a', 'name');
      type(c, 'Typed');
      await c.set(() => c.gantt.selectAll());
      await c.set(() => c.layout.hoveredRowId.set('a'));
      expect(editor(c)).toBe(input);
      expect(input.value).toBe('Typed');
      expect(active()).toBe(input);
    });
  });
});
