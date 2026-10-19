// The Phase 11 review fixes in Angular (step 7.1), the Web Component's `editing-review-fixes.test.ts`:
// - R1 controlled mode and `beforeChange` carry the app's own tasks (raw), not the normalised ones;
// - R2 the predecessors cell is editable with links deleted only, and keeps to the link rights;
// - R3 a commit started from `editing.validate` is refused;
// - R4 Enter / F2 / L finishing a click-mode link links to the focused bar's start (FS);
// - R5 an undo / redo step that validation rejects is dropped (a vetoed one stays);
// - K1 keys typed right after the key that opens a cell editor reach its field;
// - K3 the selected link is deselected once it is gone (the app changed the tasks, a collapse);
// - K4 a press on the selected link keeps it selected (no flicker); a press elsewhere deselects;
// - K5 the link preview follows the bars (a zoom during a keyboard session);
// - K6 a custom editor's context acts only on its own edit;
// - K7 the selected link has a halo (`path.gantt-arrow-halo`, first child, only while selected);
// - K8 `focusTask()` shows the focus ring after a pointer input.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  ANNOUNCE_DEBOUNCE,
  DEFAULT_LABELS,
  DependencyType,
  ViewMode,
  computeArrowVisual,
  hitTestBar,
  linkPreviewPathOf,
  type BarVisual,
  type CellEditorContext,
  type GanttBeforeChangeEvent,
  type GanttOptions,
  type GanttTask,
  type GanttTasksChangeEvent,
  type LinkSide,
  type TaskUpdatedEvent,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttLinkService } from './editing/link';
import { GanttCellEditService } from './editing/cell-edit';
import { type ColumnDef } from './types';

const day = (d: number) => new Date(2026, 2, d);
const plan = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(6), progress: 20 },
  { id: 'b', name: 'Beta', start: day(8), end: day(12), progress: 50, dependency: 'a' },
  { id: 'c', name: 'Gamma', start: day(14), end: day(18), progress: 0 },
];
const BASE: GanttOptions = { viewMode: ViewMode.Day, initialScroll: false };

@Component({
  imports: [GantryComponent],
  template: `<gantry
    style="height: 400px"
    [(series)]="tasks"
    [options]="options()"
    [columns]="columns()"
    [tooltipEnabled]="false"
    (beforeChange)="onBefore($event)"
    (taskUpdated)="log('taskUpdated', $event)"
    (tasksChange)="log('tasksChange', $event)"
    (dependencyCreated)="log('dependencyCreated', $event)"
    (historyChange)="log('historyChange', $event)"
  />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(plan());
  readonly options = signal<GanttOptions>({ ...BASE, editing: true });
  readonly columns = signal<ColumnDef[]>([]);
  readonly events: [string, unknown][] = [];
  /** What `beforeChange` does besides being logged */
  before: (e: GanttBeforeChangeEvent) => void = () => undefined;
  readonly gantt = viewChild.required(GantryComponent);
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
  link: GanttLinkService;
  cells: GanttCellEditService;
  svg: SVGSVGElement;
  /** Runs `change`, then waits for the render (and its after-render work) */
  set(change?: () => void): Promise<void>;
}

async function mount(
  options: GanttOptions = { editing: true },
  tasks: GanttTask[] = plan(),
  columns: ColumnDef[] = [],
) {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  f.componentInstance.tasks.set(tasks);
  f.componentInstance.options.set({ ...BASE, ...options });
  f.componentInstance.columns.set(columns);
  await f.whenStable();
  const debug = f.debugElement.query(By.directive(GantryComponent));
  const host = debug.nativeElement as HTMLElement;
  const c: Chart = {
    f,
    h: f.componentInstance,
    host,
    gantt: f.componentInstance.gantt(),
    layout: debug.injector.get(GanttLayoutService),
    link: debug.injector.get(GanttLinkService),
    cells: debug.injector.get(GanttCellEditService),
    svg: host.querySelector<SVGSVGElement>('gantt-canvas svg')!,
    async set(change) {
      change?.();
      await f.whenStable();
    },
  };
  return c;
}

const $ = <T extends Element = HTMLElement>(c: Chart, sel: string) => c.host.querySelector<T>(sel);
const active = () => document.activeElement as HTMLElement | null;
const cell = (c: Chart, id: string, key: string) => $(c, `[data-focus-key="cell:${id}:${key}"]`)!;
const bar = (c: Chart, id: string) => $<SVGGElement>(c, `.gantt-bars-layer > [data-task-id="${id}"]`)!;
const editor = (c: Chart) => $<HTMLInputElement>(c, '.gantt-tl-editor');
const raw = (c: Chart, id: string) => c.h.tasks().find(t => t.id === id)!;
const ofType = <T>(c: Chart, type: string) => c.h.events.filter(([t]) => t === type).map(([, d]) => d as T);
const visual = (c: Chart, id: string): BarVisual => c.gantt.getBarVisual(id)!;

/** A real keydown (bubbling, cancelable) on `target` (default: the focused element); whether the chart used it. */
function press(key: string, target: Element | null = active()): boolean {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true });
  (target ?? document.body).dispatchEvent(e);
  return e.defaultPrevented;
}
/**
 * Types `text` as fast as a test runner does: one keydown per character on whatever has focus, no
 * render awaited in between; a key nobody used goes into a focused text field (the browser's own action).
 */
function typeFast(text: string): void {
  for (const ch of text) {
    const target = active();
    const used = press(ch, target);
    if (!used && target instanceof HTMLInputElement) {
      target.value += ch;
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}
const setText = (input: HTMLInputElement, text: string) => {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const send = (c: Chart, type: string, x: number, y: number, target: Element = c.svg): PointerEvent => {
  const e = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    clientX: x,
    clientY: y,
  });
  target.dispatchEvent(e);
  return e;
};
const click = (c: Chart, x: number, y: number) =>
  c.svg.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));

/** Lets a debounced announcement reach the live region; returns it. */
async function said(c: Chart): Promise<string | null> {
  await new Promise(resolve => setTimeout(resolve, ANNOUNCE_DEBOUNCE + 20));
  await c.f.whenStable();
  return $(c, '.gantt-sr-live')!.textContent;
}

/** A point on the arrow `from → to` off every bar (canvas px = client px in happy-dom) and its key. */
function arrowPoint(c: Chart, from: string, to: string): { key: string; x: number; y: number } {
  const { layout } = c;
  const geoById = layout.geometryById();
  const link = layout.arrowIndex().links.find(l => l.from === from && l.to === to)!;
  const a = geoById.get(from)!;
  const arrow = computeArrowVisual(
    visual(c, from),
    visual(c, to),
    { type: link.dep.type ?? DependencyType.FS, lag: link.dep.lag },
    layout.cfg(),
    { fromTop: a.y, fromBottom: a.y + a.height },
    false,
    layout.fontPx(),
  );
  const geos = layout.rowGeometries();
  const rowHeight = layout.cfg().rowHeight;
  const pts = arrow.points;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    for (let t = 0.1; t < 1; t += 0.1) {
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const geo = geos[Math.floor(y / rowHeight)];
      if (!geo || !hitTestBar(visual(c, geo.row.task.id), x, y, false)) return { key: link.key, x, y };
    }
  }
  throw new Error('no point off the bars');
}
const connector = (c: Chart, id: string, side: LinkSide) => {
  const k = visual(c, id).connectors![side];
  return { x: k.cx, y: k.cy };
};

afterEach(() => {
  // happy-dom may keep focus on a removed node (browsers move it to the body)
  active()?.blur();
  vi.restoreAllMocks();
});

describe('R1: the events carry the app’s own tasks', () => {
  const lazy = (): GanttTask[] => [
    { id: 'a', name: 'Alpha', start: day(2), end: day(6) },
    { id: 'kid', name: 'Kid', start: day(3), end: day(5), parentId: 'not-loaded' },
    // No end (the data may omit it: the chart reads the start)
    { id: 'm', name: 'Gate', start: day(9), type: 'milestone' } as GanttTask,
  ];

  it('controlled: beforeChange and tasksChange propose the raw tasks with the change', async () => {
    const tasks = lazy();
    const c = await mount({ editing: { controlled: true } }, tasks);
    expect(c.gantt.addDependency('a', 'kid')).toBe(true);
    const [before] = ofType<GanttBeforeChangeEvent>(c, 'beforeChange');
    const [after] = ofType<GanttTasksChangeEvent>(c, 'tasksChange');
    const [updated] = ofType<TaskUpdatedEvent>(c, 'taskUpdated');
    const proposed = before.tasks;
    expect(after.applied).toBe(false);
    expect(after.tasks).toBe(proposed);
    expect(proposed[0]).toBe(tasks[0]);
    expect(proposed[2]).toBe(tasks[2]);
    expect('end' in proposed[2]).toBe(false);
    expect(proposed[1]).toMatchObject({ parentId: 'not-loaded', dependency: [{ taskId: 'a', type: 'FS', lag: 0 }] });
    expect(updated.previous).toBe(tasks[1]);
    expect(updated.task).toBe(proposed[1]);
    // An app that sets them keeps its data
    await c.set(() => c.h.tasks.set(after.tasks));
    expect(raw(c, 'kid').parentId).toBe('not-loaded');
    expect('end' in raw(c, 'm')).toBe(false);
  });

  it('a series write during beforeChange: the unapplied tasksChange carries the raw tasks too', async () => {
    const tasks = lazy();
    const c = await mount({ editing: true }, tasks);
    c.h.before = () => c.gantt.series.set([...tasks]);
    c.gantt.addDependency('a', 'kid');
    const [after] = ofType<GanttTasksChangeEvent>(c, 'tasksChange');
    expect(after.applied).toBe(false);
    expect(after.tasks.find(t => t.id === 'kid')?.parentId).toBe('not-loaded');
    expect(after.tasks[0]).toBe(tasks[0]);
  });
});

describe('R2: the predecessors cell with links deleted only', () => {
  const COLS: GanttOptions = { panel: { width: 500, columns: ['name', 'predecessors'] } };
  const commitText = async (c: Chart, text: string) => {
    const input = editor(c)!;
    setText(input, text);
    press('Enter', input);
    await c.set();
  };

  it('is editable with create off; removing a link works, adding one is refused under the cell', async () => {
    const c = await mount({ ...COLS, editing: { dependencies: { create: false } } });
    expect(cell(c, 'b', 'predecessors').getAttribute('aria-readonly')).toBe('false');
    await c.set(() => c.gantt.editCell('b', 'predecessors'));
    await commitText(c, 'a; c');
    expect($(c, '.gantt-tl-editor-error')!.textContent).toBe(DEFAULT_LABELS.errorLinkCreate);
    expect(raw(c, 'b').dependency).toBe('a');
    await commitText(c, '');
    expect(editor(c)).toBeNull();
    expect(raw(c, 'b').dependency).toBeUndefined();
  });

  it('delete off: removing a link in the cell is refused (errorLinkDelete)', async () => {
    const c = await mount({ ...COLS, editing: { dependencies: { delete: false } } });
    await c.set(() => c.gantt.editCell('b', 'predecessors'));
    await commitText(c, 'c');
    expect($(c, '.gantt-tl-editor-error')!.textContent).toBe(DEFAULT_LABELS.errorLinkDelete);
    expect(raw(c, 'b').dependency).toBe('a');
  });

  it('both off: read-only', async () => {
    const c = await mount({ ...COLS, editing: { dependencies: { create: false, delete: false } } });
    expect(cell(c, 'b', 'predecessors').getAttribute('aria-readonly')).toBe('true');
    expect(c.gantt.editCell('b', 'predecessors')).toBe(false);
  });
});

describe('R3: one commit at a time, from validation on', () => {
  it('a commit started by editing.validate (addDependency, undo) is refused; the outer change runs', async () => {
    const nested: boolean[] = [];
    let calls = 0;
    let gantt: GantryComponent | null = null;
    const c = await mount({
      editing: {
        validate: () => {
          calls++;
          if (gantt) nested.push(gantt.addDependency('a', 'c'), gantt.undo(), gantt.removeDependency('a', 'b'));
          return true;
        },
      },
    });
    gantt = c.gantt;
    expect(c.gantt.addDependency('b', 'c')).toBe(true);
    expect(nested).toEqual([false, false, false]);
    expect(calls).toBe(1);
    expect(raw(c, 'c').dependency).toEqual([{ taskId: 'b', type: 'FS', lag: 0 }]);
  });
});

describe('R4: a click-mode link finished from the keys', () => {
  it('Enter on the focused bar links to its start (FS), whatever the pointer last hovered', async () => {
    const c = await mount();
    c.link.start('a', 'end', 'click', connector(c, 'a', 'end'));
    const end = connector(c, 'c', 'end');
    c.link.move(end.x, end.y);
    expect(c.layout.link()?.preview).toMatchObject({ targetId: 'c', targetSide: 'end', type: 'FF' });
    await c.set(() => bar(c, 'c').focus());
    expect(c.layout.link()?.mode).toBe('click');
    expect(press('Enter')).toBe(true);
    expect(ofType(c, 'dependencyCreated')).toEqual([{ fromId: 'a', toId: 'c', type: 'FS', lag: 0 }]);
  });
});

describe('R5: an undo / redo step validation rejects is dropped', () => {
  it('undo: rejected (announced), the step dropped; a veto keeps it', async () => {
    let refuse = false;
    const c = await mount({ editing: { validate: ch => !(refuse && ch.source === 'undo') || 'Locked by the plan' } });
    c.gantt.addDependency('a', 'c');
    expect(c.gantt.canUndo()).toBe(true);
    c.h.before = e => e.preventDefault();
    expect(c.gantt.undo()).toBe(false);
    expect(c.gantt.canUndo()).toBe(true);
    c.h.before = () => undefined;
    refuse = true;
    expect(c.gantt.undo()).toBe(false);
    expect(await said(c)).toBe(DEFAULT_LABELS.announceChangeRejected('Locked by the plan'));
    expect(c.gantt.canUndo()).toBe(false);
    expect(ofType<{ canUndo: boolean }>(c, 'historyChange').map(s => s.canUndo)).toEqual([true, false]);
  });

  it('redo: rejected, the step dropped from both stacks', async () => {
    let refuse = false;
    const c = await mount({ editing: { validate: ch => !(refuse && ch.source === 'redo') || 'No' } });
    c.gantt.addDependency('a', 'c');
    expect(c.gantt.undo()).toBe(true);
    expect(c.gantt.canRedo()).toBe(true);
    refuse = true;
    expect(c.gantt.redo()).toBe(false);
    expect(c.gantt.canRedo()).toBe(false);
    expect(c.gantt.canUndo()).toBe(false);
  });
});

describe('K1: keys typed right after the key that opens an editor', () => {
  it('a seeded editor is mounted and focused by its key: fast typing then Enter commits the whole text', async () => {
    const c = await mount();
    await c.set(() => cell(c, 'a', 'name').focus());
    typeFast('Public');
    expect(editor(c)).not.toBeNull();
    expect(active()).toBe(editor(c));
    expect(editor(c)!.value).toBe('Public');
    expect(press('Enter')).toBe(true);
    await c.set();
    expect(raw(c, 'a').name).toBe('Public');
  });

  it('F2 and a double-click mount the field at once too', async () => {
    const c = await mount();
    await c.set(() => cell(c, 'a', 'name').focus());
    expect(press('F2')).toBe(true);
    expect(active()).toBe(editor(c));
    press('Escape');
    await c.set();
    cell(c, 'b', 'name').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(active()?.getAttribute('data-focus-key')).toBe('editor:b:name');
  });

  it('Tab opens the next editor at once', async () => {
    const c = await mount({ editing: true, panel: { columns: ['name', 'start'] } });
    await c.set(() => cell(c, 'a', 'name').focus());
    press('F2');
    expect(press('Tab')).toBe(true);
    expect(active()?.getAttribute('data-focus-key')).toBe('editor:a:start');
  });
});

describe('K3: the selected link goes with the link', () => {
  it('the app removing the link deselects it: made again later, it is not selected', async () => {
    const c = await mount();
    const p = arrowPoint(c, 'a', 'b');
    expect(c.link.selectAt(p.x, p.y)).toBe(true);
    await c.set(() => c.h.tasks.set(plan().map(t => (t.id === 'b' ? { ...t, dependency: undefined } : t))));
    expect(c.layout.selectedLinkKey()).toBeNull();
    await c.set(() => c.h.tasks.set(plan()));
    expect(c.layout.selectedLinkKey()).toBeNull();
    expect(c.host.querySelectorAll('.gantt-arrow--selected')).toHaveLength(0);
  });

  it('a collapsed row hiding an end deselects it; other task changes keep it', async () => {
    const c = await mount({ editing: true }, [
      { id: 'p', name: 'Parent', start: day(2), end: day(20) },
      { id: 'k', name: 'Kid', start: day(3), end: day(6), parentId: 'p' },
      { id: 'o', name: 'Other', start: day(10), end: day(14), dependency: 'k' },
    ]);
    const p = arrowPoint(c, 'k', 'o');
    c.link.selectAt(p.x, p.y);
    await c.set(() => c.gantt.updateTask('o', { name: 'Renamed' }));
    expect(c.layout.selectedLinkKey()).toBe(p.key);
    await c.set(() => c.gantt.collapseAll());
    expect(c.layout.selectedLinkKey()).toBeNull();
  });
});

describe('K4: pressing the selected link keeps it selected', () => {
  it('no flicker: the press on it keeps it, its click selects it again; a press elsewhere deselects', async () => {
    const c = await mount();
    const p = arrowPoint(c, 'a', 'b');
    send(c, 'pointerdown', p.x, p.y);
    send(c, 'pointerup', p.x, p.y);
    click(c, p.x, p.y);
    expect(c.layout.selectedLinkKey()).toBe(p.key);
    const writes = vi.spyOn(c.layout.selectedLinkKey, 'set');
    send(c, 'pointerdown', p.x, p.y);
    expect(c.layout.selectedLinkKey()).toBe(p.key);
    send(c, 'pointerup', p.x, p.y);
    click(c, p.x, p.y);
    expect(writes.mock.calls.every(([key]) => key === p.key)).toBe(true);
    const v = visual(c, 'c');
    send(c, 'pointerdown', v.x + v.width / 2, v.cy);
    expect(c.layout.selectedLinkKey()).toBeNull();
  });

  it('a press outside the canvas (the task list) deselects', async () => {
    const c = await mount();
    const p = arrowPoint(c, 'a', 'b');
    c.link.selectAt(p.x, p.y);
    send(c, 'pointerdown', 1, 1, cell(c, 'a', 'name'));
    expect(c.layout.selectedLinkKey()).toBeNull();
  });
});

describe('K5: the link preview follows the bars', () => {
  it('a zoom during a keyboard session redraws the preview from the new bars', async () => {
    const c = await mount();
    await c.set(() => bar(c, 'a').focus());
    expect(press('l')).toBe(true);
    await c.set(() => bar(c, 'c').focus());
    const path = () => $(c, 'path.gantt-link-preview')!.getAttribute('d');
    const before = path();
    expect(before).toBe(linkPreviewPathOf(visual(c, 'a'), 'end', { visual: visual(c, 'c'), side: 'start' }));
    await c.set(() => c.gantt.zoomIn());
    expect(c.layout.link()?.mode).toBe('keyboard');
    expect(path()).not.toBe(before);
    expect(path()).toBe(linkPreviewPathOf(visual(c, 'a'), 'end', { visual: visual(c, 'c'), side: 'start' }));
  });
});

describe('K6: a custom editor’s context acts only on its own edit', () => {
  it('the first edit’s context does nothing to a later edit of the same cell', async () => {
    const contexts: CellEditorContext[] = [];
    const notes: ColumnDef = {
      key: 'notes',
      label: 'Notes',
      width: 120,
      editable: true,
      render: row => String((row.task.data as { notes?: string } | undefined)?.notes ?? ''),
      editor: (ctx: CellEditorContext) => {
        contexts.push(ctx);
        const input = document.createElement('input');
        input.value = ctx.value;
        return input;
      },
    };
    const c = await mount({ editing: true, panel: { columns: ['name', 'notes'] } }, plan(), [notes]);
    await c.set(() => c.gantt.editCell('a', 'notes'));
    await c.set(() => contexts[0].cancel());
    await c.set(() => c.gantt.editCell('a', 'notes'));
    expect(contexts).toHaveLength(2);
    const [first, second] = contexts as [CellEditorContext, CellEditorContext];
    first.setValue('stale');
    first.commit();
    first.cancel();
    expect(c.layout.cellEdit()).toMatchObject({ taskId: 'a', columnKey: 'notes', value: '' });
    second.setValue('fresh');
    second.commit();
    await c.set();
    expect(c.layout.cellEdit()).toBeNull();
    expect(raw(c, 'a').data).toEqual({ notes: 'fresh' });
  });
});

describe('K7: the selected link has a halo', () => {
  it('path.gantt-arrow-halo, first in its group, only while selected', async () => {
    const c = await mount();
    const p = arrowPoint(c, 'a', 'b');
    await c.set(() => c.link.selectAt(p.x, p.y));
    const g = $(c, '.gantt-arrows > g.gantt-arrow--selected')!;
    const halo = g.firstElementChild as SVGElement;
    expect(halo.getAttribute('class')).toBe('gantt-arrow-halo');
    const line = halo.nextElementSibling!;
    expect(Number(halo.getAttribute('stroke-width'))).toBe(Number(line.getAttribute('stroke-width')) - 1 + 6);
    expect(halo.getAttribute('stroke-opacity')).toBe('0.3');
    expect(halo.style.getPropertyValue('stroke')).toBe('var(--gantt-focus-ring)');
    expect(halo.getAttribute('d')).toBe(line.getAttribute('d'));
    await c.set(() => c.link.deselect());
    expect(c.host.querySelectorAll('.gantt-arrow-halo')).toHaveLength(0);
  });
});

describe('K8: focusTask() shows the focus ring after a pointer input', () => {
  it('the bar: focus({ focusVisible: true }) and its own ring, though a pointer was pressed last', async () => {
    const c = await mount();
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const focus = vi.spyOn(bar(c, 'b'), 'focus');
    expect(c.gantt.focusTask('b')).toBe(true);
    await c.set();
    expect(focus).toHaveBeenCalledWith(expect.objectContaining({ focusVisible: true }));
    expect(active()).toBe(bar(c, 'b'));
    expect(c.layout.focusVisibleBarId()).toBe('b');
  });

  it('a bar a pointer focused already shows its ring; a row is focused visibly too', async () => {
    const c = await mount();
    await c.set(() => bar(c, 'c').focus());
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(c.layout.focusVisibleBarId()).toBeNull();
    c.gantt.focusTask('c');
    expect(c.layout.focusVisibleBarId()).toBe('c');
    await c.set();
    const row = $(c, '.gantt-tl-row[data-task-id="a"]')!;
    const focus = vi.spyOn(row, 'focus');
    await c.set(() => c.gantt.focusTask('a', { area: 'row' }));
    expect(focus).toHaveBeenCalledWith(expect.objectContaining({ focusVisible: true }));
  });
});
