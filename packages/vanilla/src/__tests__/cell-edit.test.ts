// Cell editing in <gantry-element> (Gantry 2 phase 11, step 4.3, D14–D16, §3d / §3e): F2, Enter,
// typing and double-click open a cell's editor (an input / select, or the column's own node),
// Enter / Tab / Shift+Tab / Escape / blur finish it, an invalid value keeps it open with
// `aria-invalid`, the message under the cell and in the alert region, and every commit is one
// `'cell'` change through the pipeline (undoable, vetoable). With `editing` off nothing changes.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ViewMode, type CellEditorContext, type GanttOptions, type GanttTask } from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import type { GantryEventDetailMap, VanillaColumnDef } from '../types';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();

const day = (d: number) => new Date(2026, 2, d);
const plan = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(6), progress: 20 },
  { id: 'b', name: 'Beta', start: day(8), end: day(12), progress: 50, dependency: 'a' },
  { id: 'c', name: 'Gamma', start: day(14), end: day(16), progress: 0 },
];
const BASE: GanttOptions = { viewMode: ViewMode.Day, initialScroll: false };

function mount(options: GanttOptions = { editing: true }, props: Partial<GantryElement> = {}): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks: plan(), options: { ...BASE, ...options }, ...props });
  document.body.appendChild(el);
  flush(el);
  return el;
}

const $ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => [
  ...el.shadowRoot!.querySelectorAll<T>(sel),
];
const cell = (el: GantryElement, id: string, key: string) => $(el, `[data-focus-key="cell:${id}:${key}"]`)!;
const row = (el: GantryElement, id: string) => $(el, `.gantt-tl-row[data-task-id="${id}"]`)!;
const editor = (el: GantryElement) => $<HTMLInputElement>(el, '.gantt-tl-editor');
const active = (el: GantryElement) => el.shadowRoot!.activeElement as HTMLElement | null;
const focusKey = (el: GantryElement) => active(el)?.getAttribute('data-focus-key') ?? null;
const taskOf = (el: GantryElement, id: string) => el.tasks.find(t => t.id === id)!;
const alert = (el: GantryElement) => $(el, '.gantt-sr-alert')!.textContent;

/** A real keydown (composed, cancelable) on what has focus; returns whether the chart used it. */
function press(el: GantryElement, key: string, init: KeyboardEventInit = {}): boolean {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init });
  (active(el) ?? el).dispatchEvent(e);
  return e.defaultPrevented;
}
/** Types `text` into the open built-in editor (its `input` event). */
function type(el: GantryElement, text: string): void {
  const input = editor(el)!;
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}
/** Focuses `id`'s `key` cell and opens its editor with F2. */
function edit(el: GantryElement, id: string, key: string): HTMLInputElement {
  cell(el, id, key).focus();
  expect(press(el, 'F2')).toBe(true);
  flush(el);
  return editor(el)!;
}

type EventName = keyof GantryEventDetailMap;
function record(el: GantryElement, ...names: EventName[]): { type: EventName; detail: unknown }[] {
  const log: { type: EventName; detail: unknown }[] = [];
  for (const name of names) el.addEventListener(name, e => log.push({ type: name, detail: (e as CustomEvent).detail }));
  return log;
}
const PIPELINE: EventName[] = [
  'before-change',
  'task-dragged',
  'task-resized',
  'task-progress-changed',
  'dependency-created',
  'dependency-deleted',
  'task-updated',
  'tasks-change',
  'history-change',
];

describe('<gantry-element> cell editing', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    // happy-dom keeps focus on a node of a removed shadow tree (browsers move it to the body)
    (el?.shadowRoot?.activeElement as HTMLElement | null | undefined)?.blur();
    el?.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('with editing off', () => {
    it('paints no aria-readonly and opens nothing: F2, typing and a double-click keep their old behaviour', () => {
      el = mount({});
      expect($$(el, '[aria-readonly]')).toHaveLength(0);
      const clicks = record(el, 'row-click', 'row-dblclick');
      cell(el, 'a', 'name').focus();
      expect(press(el, 'F2')).toBe(false);
      press(el, 'x');
      // Enter still activates the row
      expect(press(el, 'Enter')).toBe(true);
      cell(el, 'a', 'name').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
      flush(el);
      expect(editor(el)).toBeNull();
      expect($$(el, '.gantt-tl-row--editing, .gantt-tl-cell--editing')).toHaveLength(0);
      expect(clicks.map(e => e.type)).toEqual(['row-click', 'row-dblclick']);
      expect(el.editCell('a', 'name')).toBe(false);
      expect(getEngine(el).inputs.cellEdit.peek()).toBeNull();
    });
  });

  describe('aria-readonly', () => {
    it('marks editable cells false and the others true, per column and per row', () => {
      el = mount(
        { editing: true, view: 'table' },
        {
          tasks: [...plan(), { id: 'r', name: 'Locked', start: day(2), end: day(4), editable: false }],
        },
      );
      const ro = (id: string, key: string) => cell(el, id, key).getAttribute('aria-readonly');
      for (const key of ['name', 'start', 'end', 'duration', 'progress', 'predecessors'])
        expect(ro('a', key)).toBe('false');
      for (const key of ['type', 'status']) expect(ro('a', key)).toBe('true');
      for (const key of ['name', 'start', 'progress']) expect(ro('r', key)).toBe('true');
      // editing.cells: false removes the attribute again
      el.options = { ...BASE, view: 'table', editing: { cells: false } };
      flush(el);
      expect($$(el, '[aria-readonly]')).toHaveLength(0);
    });
  });

  describe('opening (D15)', () => {
    it('F2 opens the editor (§3d): the row and cell classes, a named input with the text, focused; the content detached', () => {
      el = mount();
      const input = edit(el, 'a', 'name');
      const r = row(el, 'a');
      expect(r.classList.contains('gantt-tl-row--editing')).toBe(true);
      const c = cell(el, 'a', 'name');
      expect(c.classList.contains('gantt-tl-cell--editing')).toBe(true);
      expect([...c.children]).toEqual([input]);
      expect(input.tagName).toBe('INPUT');
      expect(input.getAttribute('class')).toBe('gantt-tl-editor');
      expect(input.getAttribute('type')).toBe('text');
      expect(input.getAttribute('aria-label')).toBe('Task Name, Alpha');
      expect(input.hasAttribute('aria-invalid')).toBe(false);
      expect(input.value).toBe('Alpha');
      expect(active(el)).toBe(input);
      expect(c.querySelector('.gantt-tl-name')).toBeNull();
      expect(el.shadowRoot!.querySelectorAll('.gantt-tl-cell--editing')).toHaveLength(1);
      expect(getEngine(el).inputs.cellEdit.peek()).toMatchObject({ taskId: 'a', columnKey: 'name', value: 'Alpha' });
    });

    it('Enter opens an editable cell (no row activation); a non-editable one keeps Enter', () => {
      el = mount({ editing: true, view: 'table' });
      const clicks = record(el, 'row-click');
      cell(el, 'a', 'start').focus();
      expect(press(el, 'Enter')).toBe(true);
      flush(el);
      expect(editor(el)?.getAttribute('type')).toBe('date');
      expect(editor(el)?.value).toBe('2026-03-02');
      press(el, 'Escape');
      flush(el);
      cell(el, 'a', 'status').focus();
      expect(press(el, 'Enter')).toBe(true);
      flush(el);
      expect(editor(el)).toBeNull();
      expect(clicks).toHaveLength(1);
    });

    it('a printable key seeds a text editor (over the + - T F shortcuts), digits seed a number editor', () => {
      el = mount();
      const zoom = vi.spyOn(el, 'zoomIn');
      cell(el, 'a', 'name').focus();
      expect(press(el, '+')).toBe(true);
      flush(el);
      expect(editor(el)?.value).toBe('+');
      expect(zoom).not.toHaveBeenCalled();
      press(el, 'Escape');
      flush(el);
      cell(el, 'a', 'progress').focus();
      press(el, 'x');
      flush(el);
      expect(editor(el)).toBeNull();
      expect(press(el, '7')).toBe(true);
      flush(el);
      expect(editor(el)?.getAttribute('type')).toBe('number');
      expect(editor(el)?.getAttribute('min')).toBe('0');
      expect(editor(el)?.getAttribute('max')).toBe('100');
      expect(editor(el)?.value).toBe('7');
    });

    it('keys typed during an IME composition are left alone', () => {
      el = mount();
      cell(el, 'a', 'name').focus();
      expect(press(el, 'a', { isComposing: true })).toBe(false);
      flush(el);
      expect(editor(el)).toBeNull();
    });

    it('a double-click opens the editor (row-dblclick still fires); clicks inside the editor are its own', () => {
      el = mount();
      const log = record(el, 'row-click', 'row-dblclick');
      cell(el, 'b', 'name').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
      flush(el);
      expect(editor(el)?.value).toBe('Beta');
      expect(log.map(e => e.type)).toEqual(['row-dblclick']);
      editor(el)!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
      editor(el)!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
      expect(log).toHaveLength(1);
    });

    it('editCell(): opens a row beyond the virtual window (pinned), false for read-only cells, unknown ids and the chart view', () => {
      const many: GanttTask[] = Array.from({ length: 200 }, (_, i) => ({
        id: `t${i}`,
        name: `Task ${i}`,
        start: day(2),
        end: day(5),
      }));
      el = mount({ editing: true }, { tasks: many });
      expect(row(el, 't150')).toBeNull();
      expect(el.editCell('t150', 'name')).toBe(true);
      flush(el);
      expect(row(el, 't150').classList.contains('gantt-tl-row--pinned')).toBe(true);
      expect(editor(el)?.value).toBe('Task 150');
      expect(focusKey(el)).toBe('editor:t150:name');
      el.shadowRoot!.querySelector<HTMLElement>('.gantt-tl-editor')!.blur();
      expect(el.editCell('nope', 'name')).toBe(false);
      expect(el.editCell('t1', 'status')).toBe(false);
      el.setView('chart');
      flush(el);
      expect(el.editCell('t1', 'name')).toBe(false);
    });
  });

  describe('committing', () => {
    it('Enter commits one cell change through the pipeline, closes the editor and focuses the cell', () => {
      el = mount();
      const log = record(el, ...PIPELINE);
      edit(el, 'a', 'name');
      type(el, 'Alpha 2');
      expect(press(el, 'Enter')).toBe(true);
      flush(el);
      expect(log.map(e => e.type)).toEqual(['before-change', 'task-updated', 'tasks-change', 'history-change']);
      const change = (log[2].detail as GantryEventDetailMap['tasks-change']).change;
      expect(change).toMatchObject({ source: 'cell', column: 'name', coalesceKey: 'cell:a:name' });
      expect(change.updates).toEqual([{ taskId: 'a', before: { name: 'Alpha' }, after: { name: 'Alpha 2' } }]);
      expect(taskOf(el, 'a').name).toBe('Alpha 2');
      expect(editor(el)).toBeNull();
      expect(row(el, 'a').classList.contains('gantt-tl-row--editing')).toBe(false);
      expect(cell(el, 'a', 'name').classList.contains('gantt-tl-cell--editing')).toBe(false);
      expect(cell(el, 'a', 'name').textContent).toContain('Alpha 2');
      expect(focusKey(el)).toBe('cell:a:name');
      expect(el.canUndo).toBe(true);
      expect(el.undo()).toBe(true);
      expect(taskOf(el, 'a').name).toBe('Alpha');
    });

    it('the unchanged text closes the editor with no change', () => {
      el = mount();
      const log = record(el, ...PIPELINE);
      edit(el, 'a', 'name');
      press(el, 'Enter');
      flush(el);
      expect(log).toHaveLength(0);
      expect(editor(el)).toBeNull();
      expect(focusKey(el)).toBe('cell:a:name');
    });

    it('a new start keeps the duration: the bar moves (task-dragged)', () => {
      el = mount();
      const log = record(el, ...PIPELINE);
      edit(el, 'a', 'start');
      type(el, '2026-03-04');
      press(el, 'Enter');
      expect(log.map(e => e.type)).toEqual([
        'before-change',
        'task-dragged',
        'task-updated',
        'tasks-change',
        'history-change',
      ]);
      expect(taskOf(el, 'a')).toMatchObject({ start: day(4), end: day(8) });
    });

    it('Tab / Shift+Tab commit and edit the next / previous editable cell; at the row end the cell keeps focus', () => {
      el = mount();
      edit(el, 'a', 'name');
      type(el, 'Alpha 2');
      expect(press(el, 'Tab')).toBe(true);
      flush(el);
      expect(taskOf(el, 'a').name).toBe('Alpha 2');
      expect(focusKey(el)).toBe('editor:a:start');
      expect(press(el, 'Tab', { shiftKey: true })).toBe(true);
      flush(el);
      expect(focusKey(el)).toBe('editor:a:name');
      expect(editor(el)?.value).toBe('Alpha 2');
      press(el, 'Escape');
      flush(el);
      // progress is the panel's last column
      edit(el, 'a', 'progress');
      type(el, '30');
      press(el, 'Tab');
      flush(el);
      expect(taskOf(el, 'a').progress).toBe(30);
      expect(editor(el)).toBeNull();
      expect(focusKey(el)).toBe('cell:a:progress');
    });

    it('Escape cancels: nothing emitted, the text dropped, focus back on the cell', () => {
      el = mount();
      const log = record(el, ...PIPELINE);
      edit(el, 'a', 'name');
      type(el, 'Nope');
      expect(press(el, 'Escape')).toBe(true);
      flush(el);
      expect(log).toHaveLength(0);
      expect(taskOf(el, 'a').name).toBe('Alpha');
      expect(editor(el)).toBeNull();
      expect(focusKey(el)).toBe('cell:a:name');
      expect(cell(el, 'a', 'name').textContent).toContain('Alpha');
    });

    it('blur commits a valid text and cancels an invalid one', async () => {
      el = mount();
      edit(el, 'a', 'name');
      type(el, 'Alpha 2');
      row(el, 'b').focus();
      await Promise.resolve();
      expect(taskOf(el, 'a').name).toBe('Alpha 2');
      expect(getEngine(el).inputs.cellEdit.peek()).toBeNull();
      flush(el);
      expect(editor(el)).toBeNull();
      expect(focusKey(el)).toBe('row:b');

      edit(el, 'a', 'progress');
      type(el, '150');
      row(el, 'b').focus();
      await Promise.resolve();
      expect(taskOf(el, 'a').progress).toBe(20);
      expect(getEngine(el).inputs.cellEdit.peek()).toBeNull();
    });
  });

  describe('invalid values', () => {
    it('stay open with aria-invalid, aria-describedby → the message under the cell, and the alert region; typing clears it', () => {
      el = mount();
      const log = record(el, ...PIPELINE);
      const input = edit(el, 'a', 'progress');
      type(el, '150');
      expect(press(el, 'Enter')).toBe(true);
      flush(el);
      expect(log).toHaveLength(0);
      expect(editor(el)).toBe(input);
      expect(active(el)).toBe(input);
      const message = 'Enter a number from 0 to 100';
      expect(input.getAttribute('aria-invalid')).toBe('true');
      const error = cell(el, 'a', 'progress').lastElementChild!;
      expect(error.getAttribute('class')).toBe('gantt-tl-editor-error');
      expect(error.textContent).toBe(message);
      expect(input.getAttribute('aria-describedby')).toBe(error.id);
      expect(error.id).toMatch(/^gantry-\d+-editor-error$/);
      expect(alert(el)).toBe(message);
      type(el, '15');
      flush(el);
      expect(input.hasAttribute('aria-invalid')).toBe(false);
      expect(input.hasAttribute('aria-describedby')).toBe(false);
      expect($(el, '.gantt-tl-editor-error')).toBeNull();
      expect(alert(el)).toBe('');
      press(el, 'Enter');
      expect(taskOf(el, 'a').progress).toBe(15);
    });

    it('a pipeline rejection (a loop) and a veto keep the editor open with the reason', () => {
      el = mount({ editing: true, view: 'table' });
      const input = edit(el, 'a', 'predecessors');
      // b depends on a: a ← b makes a loop
      type(el, 'b');
      press(el, 'Enter');
      flush(el);
      expect(editor(el)).toBe(input);
      expect($(el, '.gantt-tl-editor-error')?.textContent).toBe('This link would make a loop');
      expect(taskOf(el, 'a').dependency).toBeUndefined();
      press(el, 'Escape');
      flush(el);

      el.addEventListener('before-change', e => e.preventDefault());
      edit(el, 'c', 'name');
      type(el, 'Vetoed');
      press(el, 'Enter');
      flush(el);
      expect(editor(el)).not.toBeNull();
      expect($(el, '.gantt-tl-editor-error')?.textContent).toBe('the change was not accepted');
      expect(taskOf(el, 'c').name).toBe('Gamma');
    });

    it('predecessors by name or id become links (dependency-created)', () => {
      el = mount({ editing: true, view: 'table' });
      const log = record(el, ...PIPELINE);
      edit(el, 'c', 'predecessors');
      type(el, 'Alpha FS+2d; b');
      press(el, 'Enter');
      expect(log.filter(e => e.type === 'dependency-created')).toHaveLength(2);
      expect(taskOf(el, 'c').dependency).toEqual([{ taskId: 'a', lag: 2 }, { taskId: 'b' }]);
    });
  });

  describe('a custom editor (D16)', () => {
    const colour: VanillaColumnDef = {
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

    it('is mounted with the class, its first focusable child focused and named; setValue + commit() apply it', () => {
      el = mount({ editing: true, panel: { columns: ['name', 'colour'] } }, { columns: [colour] });
      cell(el, 'a', 'colour').focus();
      expect(press(el, 'F2')).toBe(true);
      flush(el);
      const node = $(el, '.gantt-tl-cell--editing > .gantt-tl-editor')!;
      expect(node.tagName).toBe('DIV');
      const input = node.querySelector('input')!;
      expect(active(el)).toBe(input);
      expect(input.getAttribute('aria-label')).toBe('Colour, Alpha');
      input.value = 'teal';
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      expect(getEngine(el).inputs.cellEdit.peek()?.value).toBe('teal');
      node.querySelector('button')!.click();
      flush(el);
      expect(taskOf(el, 'a').data).toEqual({ colour: 'teal' });
      expect(editor(el)).toBeNull();
    });

    it('keeps the keys it prevents; Enter / Escape otherwise finish it', () => {
      el = mount({ editing: true, panel: { columns: ['name', 'colour'] } }, { columns: [colour] });
      el.editCell('a', 'colour');
      flush(el);
      const input = $(el, '.gantt-tl-editor input')!;
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') e.preventDefault();
      });
      press(el, 'Enter');
      expect(getEngine(el).inputs.cellEdit.peek()).not.toBeNull();
      expect(press(el, 'Escape')).toBe(true);
      expect(getEngine(el).inputs.cellEdit.peek()).toBeNull();
    });
  });

  describe('built-in kinds and history', () => {
    it("editor: 'select' renders the options; the choice is written to data[key]", () => {
      const priority: VanillaColumnDef = {
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
      el = mount({ editing: true, panel: { columns: ['name', 'priority'] } }, { columns: [priority] });
      expect(el.editCell('a', 'priority')).toBe(true);
      flush(el);
      const select = $<HTMLSelectElement>(el, 'select.gantt-tl-editor')!;
      expect([...select.options].map(o => [o.value, o.textContent])).toEqual([
        ['low', 'Low'],
        ['high', 'High'],
      ]);
      expect(active(el)).toBe(select);
      select.value = 'high';
      select.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      press(el, 'Enter');
      // happy-dom keeps focus on a removed select (browsers move it): blur it as they would
      select.blur();
      flush(el);
      expect(taskOf(el, 'a').data).toEqual({ priority: 'high' });
      expect(focusKey(el)).toBe('cell:a:priority');
    });

    it('two edits of one cell in a row are one undo step (coalesceKey cell:<id>:<column>)', () => {
      el = mount();
      edit(el, 'a', 'name');
      type(el, 'A1');
      press(el, 'Enter');
      flush(el);
      edit(el, 'a', 'name');
      type(el, 'A2');
      press(el, 'Enter');
      expect(getEngine(el).inputs.historyState.peek().undoCount).toBe(1);
      el.undo();
      expect(taskOf(el, 'a').name).toBe('Alpha');
    });

    it('a disconnect closes the editor without a change', () => {
      el = mount();
      edit(el, 'a', 'name');
      type(el, 'Gone');
      el.remove();
      expect(getEngine(el).inputs.cellEdit.peek()).toBeNull();
      expect(taskOf(el, 'a').name).toBe('Alpha');
    });
  });

  describe('a task change while editing', () => {
    it('keeps the editor and its focus; the untouched text commits nothing, a typed one applies to the new task', () => {
      el = mount();
      const input = edit(el, 'a', 'name');
      el.tasks = el.tasks.map(t => (t.id === 'a' ? { ...t, name: 'Renamed' } : t));
      flush(el);
      expect(editor(el)).toBe(input);
      expect(active(el)).toBe(input);
      const log = record(el, ...PIPELINE);
      press(el, 'Enter');
      expect(log).toHaveLength(0);
      expect(taskOf(el, 'a').name).toBe('Renamed');
      flush(el);

      edit(el, 'a', 'progress');
      el.tasks = el.tasks.map(t => (t.id === 'a' ? { ...t, progress: 60 } : t));
      flush(el);
      type(el, '70');
      press(el, 'Enter');
      expect((log.find(e => e.type === 'task-progress-changed')?.detail as { oldProgress: number }).oldProgress).toBe(
        60,
      );
      expect(taskOf(el, 'a').progress).toBe(70);
    });
  });
});
