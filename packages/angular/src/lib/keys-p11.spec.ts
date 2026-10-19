// Undo / redo keys and the editing keyboard rules of <gantry> (Gantry 2 phase 11, step 4.6, D18,
// plan §3e), the Web Component's `keys-p11.test.ts`: Ctrl/⌘+Z undoes, Ctrl/⌘+Shift+Z and Ctrl+Y
// redo, from anywhere in the chart, only while it keeps a history (`editing.history`; never in
// controlled mode), outside text entry (an input, a cell editor) and not in move mode — otherwise
// the browser's own undo keeps the keys. Alt disables them. Nothing inside an open cell editor
// (`.gantt-tl-cell--editing`) reaches the chart's shortcuts: a custom editor made of buttons keeps
// its keys.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ViewMode, type GanttEditingOptions, type GanttOptions, type GanttTask } from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttCanvasComponent } from './layout/gantt-canvas.component';
import { GanttLayoutService } from './layout/gantt-layout.service';

const day = (d: number) => new Date(2026, 2, d);
const plan = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(6), progress: 20 },
  { id: 'b', name: 'Beta', start: day(8), end: day(12), progress: 50 },
];

@Component({
  imports: [GantryComponent],
  template: `<gantry style="height: 400px" [(series)]="tasks" [options]="options()" [tooltipEnabled]="false" />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(plan());
  readonly options = signal<GanttOptions>({ viewMode: ViewMode.Day, initialScroll: false, editing: true });
  readonly gantt = viewChild.required(GantryComponent);
}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  host: HTMLElement;
  gantt: GantryComponent;
  layout: GanttLayoutService;
  canvas: GanttCanvasComponent;
  set(change: () => void): Promise<void>;
  $(sel: string): HTMLElement;
}

async function mount(editing: boolean | GanttEditingOptions = true): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  f.componentInstance.options.set({ viewMode: ViewMode.Day, initialScroll: false, editing });
  await f.whenStable();
  const debug = f.debugElement.query(By.directive(GantryComponent));
  const host = debug.nativeElement as HTMLElement;
  return {
    f,
    h: f.componentInstance,
    host,
    gantt: f.componentInstance.gantt(),
    layout: debug.injector.get(GanttLayoutService),
    canvas: f.debugElement.query(By.directive(GanttCanvasComponent)).componentInstance as GanttCanvasComponent,
    async set(change) {
      change();
      await f.whenStable();
    },
    $(sel) {
      const el = host.querySelector<HTMLElement>(sel);
      if (!el) throw new Error(`no element for ${sel}`);
      return el;
    },
  };
}

const bar = (c: Chart, id: string) => c.$(`.gantt-bars-layer > [data-task-id="${id}"]`);
const startOf = (c: Chart, id: string) => c.h.tasks().find(t => t.id === id)!.start;
const active = () => document.activeElement;

/** A real keydown on `target` (default: the focused element); returns whether the chart used it. */
function press(key: string, init: KeyboardEventInit = {}, target: Element | null = active()): boolean {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init });
  (target ?? document.body).dispatchEvent(e);
  return e.defaultPrevented;
}

/** A pointer drop of `id` `days` later (what the canvas emits after a drag: one undo step). */
function dragBy(c: Chart, id: string, days: number): void {
  const t = c.h.tasks().find(x => x.id === id)!;
  const shift = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  c.canvas.taskDragged.emit({
    taskId: id,
    oldStart: t.start,
    oldEnd: t.end,
    newStart: shift(t.start),
    newEnd: shift(t.end),
    daysMoved: days,
  });
}

afterEach(() => vi.restoreAllMocks());

describe('<gantry> undo / redo keys', () => {
  it('Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo, ⌘ works too', async () => {
    const c = await mount();
    dragBy(c, 'a', 2);
    expect(startOf(c, 'a')).toEqual(day(4));
    await c.set(() => bar(c, 'a').focus());
    expect(press('z', { ctrlKey: true })).toBe(true);
    expect(startOf(c, 'a')).toEqual(day(2));
    expect(press('Z', { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(startOf(c, 'a')).toEqual(day(4));
    expect(press('z', { metaKey: true })).toBe(true);
    expect(startOf(c, 'a')).toEqual(day(2));
    expect(press('y', { ctrlKey: true })).toBe(true);
    expect(startOf(c, 'a')).toEqual(day(4));
    // Focus stays where it was
    await c.f.whenStable();
    expect(active()).toBe(bar(c, 'a'));
    // Nothing left to redo: still the chart's key (history on), nothing changes
    expect(press('y', { ctrlKey: true })).toBe(true);
    expect(c.gantt.canRedo()).toBe(false);
  });

  it('works from the task list and from the timeline viewport', async () => {
    const c = await mount();
    dragBy(c, 'a', 1);
    await c.set(() => c.$('.gantt-tl-row[data-task-id="b"]').focus());
    expect(press('z', { ctrlKey: true })).toBe(true);
    expect(startOf(c, 'a')).toEqual(day(2));
    expect(press('y', { ctrlKey: true }, c.$('.gantry-canvas-viewport'))).toBe(true);
    expect(startOf(c, 'a')).toEqual(day(3));
  });

  it.each<[string, boolean | GanttEditingOptions]>([
    ['editing off', false],
    ['history: false', { history: false }],
    ['controlled', { controlled: true }],
  ])('%s: the keys keep their default action', async (_, editing) => {
    const c = await mount(editing);
    dragBy(c, 'a', 2);
    const after = startOf(c, 'a');
    await c.set(() => bar(c, 'a').focus());
    expect(press('z', { ctrlKey: true })).toBe(false);
    expect(press('y', { ctrlKey: true })).toBe(false);
    expect(startOf(c, 'a')).toEqual(after);
  });

  it('text entry keeps the browser undo: an input, anything inside a cell editor', async () => {
    const c = await mount();
    dragBy(c, 'a', 2);
    const input = document.createElement('input');
    const editor = document.createElement('div');
    editor.className = 'gantt-tl-editor';
    const button = editor.appendChild(document.createElement('button'));
    c.host.append(input, editor);
    expect(press('z', { ctrlKey: true }, input)).toBe(false);
    expect(press('z', { ctrlKey: true }, button)).toBe(false);
    expect(startOf(c, 'a')).toEqual(day(4));
    input.remove();
    editor.remove();
  });

  it('move mode keeps them (modal), and Alt disables them', async () => {
    const c = await mount();
    dragBy(c, 'a', 2);
    await c.set(() => bar(c, 'a').focus());
    expect(press('Enter')).toBe(true);
    expect(press('z', { ctrlKey: true })).toBe(false);
    expect(startOf(c, 'a')).toEqual(day(4));
    press('Escape');
    expect(press('z', { ctrlKey: true, altKey: true })).toBe(false);
    expect(startOf(c, 'a')).toEqual(day(4));
    expect(c.gantt.canUndo()).toBe(true);
  });
});

describe('<gantry> keys inside an open cell editor', () => {
  it('reach none of the chart’s shortcuts (+ − T F, Ctrl+A, Ctrl+Z, Delete, Escape)', async () => {
    const c = await mount();
    dragBy(c, 'a', 2);
    // A custom editor made of buttons, in the cell being edited
    const cell = document.createElement('div');
    cell.className = 'gantt-tl-cell gantt-tl-cell--editing';
    const button = cell.appendChild(document.createElement('button'));
    c.$('gantt-tasklist').append(cell);
    const level = c.layout.level();
    for (const [key, init] of [
      ['+', {}],
      ['f', {}],
      ['a', { ctrlKey: true }],
      ['z', { ctrlKey: true }],
      ['Delete', {}],
      ['Escape', {}],
    ] as const) {
      expect(press(key, init, button), key).toBe(false);
    }
    expect(press('z', { ctrlKey: true }, cell)).toBe(false);
    expect(startOf(c, 'a')).toEqual(day(4));
    expect(c.layout.level()).toBe(level);
    expect(c.gantt.getSelectedTasks()).toEqual([]);
    cell.remove();
    // Outside it the chart has them again
    expect(press('+', {}, c.$('.gantry-canvas-viewport'))).toBe(true);
  });
});
