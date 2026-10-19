// Drawing, selecting and deleting dependency links in Angular (Gantry 2 phase 11, step 4.6, D12 /
// D13, plan §3e), the Web Component's `links.test.ts`: `GanttLinkService` (editing/link.ts) drives
// core `LinkSession` from a connector (drag or click → click) or with L on a bar; the type follows
// the ends (FS / SS / FF / SF); invalid targets (self, duplicate, loop, parent ↔ child, read-only)
// create nothing and are announced; `layout.link` carries the session and the preview (the canvas
// draws `path.gantt-link-preview` from it, step 4.5). An arrow is hit by geometry and selected
// (`layout.selectedLinkKey`, `gantt-arrow--selected`), Delete removes it, undo restores the app's
// own `dependency` value. The pointer routing that calls the service is the canvas' (step 4.5).
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  Component,
  provideZonelessChangeDetection,
  signal,
  viewChild,
  ɵgetComponentDef as getComponentDef,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  ANNOUNCE_DEBOUNCE,
  DEFAULT_LABELS,
  DependencyType,
  ViewMode,
  buildArrowIndex,
  computeArrowVisual,
  editTiming,
  hitTestBar,
  resolveConfig,
  selectedArrowVisual,
  type ArrowVisual,
  type GanttEditingOptions,
  type GanttOptions,
  type GanttTask,
  type LinkSide,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttLinkService } from './editing/link';
import { GanttDragService } from './drag/gantt-drag.service';
import { GanttArrowComponent } from './arrows/gantt-arrow.component';

const day = (d: number) => new Date(2026, 2, d);
const plan = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(6), progress: 20 },
  { id: 'b', name: 'Beta', start: day(8), end: day(12), progress: 50, dependency: 'a' },
  { id: 'c', name: 'Gamma', start: day(14), end: day(18), progress: 0 },
  { id: 'd', name: 'Delta', start: day(20), end: day(24), progress: 0, dependency: 'b' },
];
const family = (): GanttTask[] => [
  { id: 'p', name: 'Parent', start: day(2), end: day(20) },
  { id: 'k', name: 'Kid', start: day(4), end: day(10), parentId: 'p' },
  { id: 'o', name: 'Other', start: day(12), end: day(16) },
];

@Component({
  imports: [GantryComponent],
  template: `<gantry
    style="height: 400px"
    [(series)]="tasks"
    [options]="options()"
    [tooltipEnabled]="false"
    (beforeChange)="log('beforeChange', $event)"
    (dependencyCreated)="log('dependencyCreated', $event)"
    (dependencyDeleted)="log('dependencyDeleted', $event)"
    (taskUpdated)="log('taskUpdated', $event)"
    (tasksChange)="log('tasksChange', $event)"
    (historyChange)="log('historyChange', $event)"
  />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(plan());
  readonly options = signal<GanttOptions>({ viewMode: ViewMode.Day, initialScroll: false, editing: true });
  readonly events: [string, unknown][] = [];
  readonly gantt = viewChild.required(GantryComponent);
  log(type: string, detail: unknown): void {
    this.events.push([type, detail]);
  }
}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  host: HTMLElement;
  gantt: GantryComponent;
  layout: GanttLayoutService;
  link: GanttLinkService;
  set(change: () => void): Promise<void>;
  $(sel: string): HTMLElement;
}

async function mount(editing: boolean | GanttEditingOptions = true, tasks: GanttTask[] = plan()): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  f.componentInstance.tasks.set(tasks);
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
    link: debug.injector.get(GanttLinkService),
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

const names = (c: Chart) => c.h.events.map(([type]) => type);
const raw = (c: Chart, id: string) => c.h.tasks().find(t => t.id === id)!;
const bar = (c: Chart, id: string) => c.$(`.gantt-bars-layer > [data-task-id="${id}"]`);
const active = () => document.activeElement;
const live = (c: Chart) => c.$('.gantt-sr-live').textContent;

/** Lets a debounced announcement reach the live region; returns it. */
async function said(c: Chart): Promise<string | null> {
  await new Promise(resolve => setTimeout(resolve, ANNOUNCE_DEBOUNCE + 20));
  await c.f.whenStable();
  return live(c);
}

/** A real keydown (bubbling, cancelable) on `target` (default: the focused element); whether the chart used it. */
function press(key: string, init: KeyboardEventInit = {}, target: Element | null = active()): boolean {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init });
  (target ?? document.body).dispatchEvent(e);
  return e.defaultPrevented;
}

/** The centre of `id`'s `side` connector (canvas px). */
function connector(c: Chart, id: string, side: LinkSide): { x: number; y: number } {
  const k = c.gantt.getBarVisual(id)!.connectors![side];
  return { x: k.cx, y: k.cy };
}

/** Drags a link from `from`'s `fromSide` connector to `to`'s `toSide` connector; returns `finish()`. */
function drawLink(c: Chart, from: string, fromSide: LinkSide, to: string, toSide: LinkSide): boolean {
  c.link.start(from, fromSide, 'drag', connector(c, from, fromSide));
  const at = connector(c, to, toSide);
  c.link.move(at.x, at.y);
  return c.link.finish();
}

/** The key of the arrow `from → to` and a canvas point on its route that is off every bar. */
function arrowPoint(c: Chart, from: string, to: string): { key: string; x: number; y: number } {
  const { layout, gantt } = c;
  const geoById = layout.geometryById();
  const link = buildArrowIndex(layout.tasks(), geoById).links.find(l => l.from === from && l.to === to)!;
  const a = geoById.get(from)!;
  const visual = computeArrowVisual(
    gantt.getBarVisual(from)!,
    gantt.getBarVisual(to)!,
    { type: link.dep.type ?? DependencyType.FS, lag: link.dep.lag },
    layout.cfg(),
    { fromTop: a.y, fromBottom: a.y + a.height },
    false,
    layout.fontPx(),
  );
  const geos = layout.rowGeometries();
  const rowHeight = layout.cfg().rowHeight;
  const pts = visual.points;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    for (let t = 0.1; t < 1; t += 0.1) {
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const geo = geos[Math.floor(y / rowHeight)];
      if (!geo || !hitTestBar(gantt.getBarVisual(geo.row.task.id)!, x, y, false)) return { key: link.key, x, y };
    }
  }
  throw new Error('no point off the bars');
}

afterEach(() => vi.restoreAllMocks());

describe('<gantry> links: drawing from a connector (drag)', () => {
  it.each<[LinkSide, LinkSide, DependencyType]>([
    ['end', 'start', DependencyType.FS],
    ['start', 'start', DependencyType.SS],
    ['end', 'end', DependencyType.FF],
    ['start', 'end', DependencyType.SF],
  ])('%s → %s creates an %s link through the pipeline', async (fromSide, toSide, type) => {
    const c = await mount();
    expect(drawLink(c, 'a', fromSide, 'c', toSide)).toBe(true);
    expect(names(c)).toEqual(['beforeChange', 'dependencyCreated', 'taskUpdated', 'tasksChange', 'historyChange']);
    expect(c.h.events[1][1]).toEqual({ fromId: 'a', toId: 'c', type, lag: 0 });
    expect((c.h.events[3][1] as { change: { source: string } }).change.source).toBe('link');
    expect(raw(c, 'c').dependency).toEqual([{ taskId: 'a', type, lag: 0 }]);
    expect(c.layout.link()).toBeNull();
    expect(await said(c)).toBe(DEFAULT_LABELS.announceLinkCreated('Alpha', 'Gamma'));
  });

  it('publishes the session and its preview in `layout.link`; the host is `.gantry-linking`', async () => {
    const c = await mount();
    expect(c.host.classList.contains('gantry-linking')).toBe(false);
    c.link.start('a', 'end', 'drag', connector(c, 'a', 'end'));
    expect(c.link.active()).toBe(true);
    expect(c.layout.link()).toMatchObject({ sourceId: 'a', side: 'end', mode: 'drag' });
    // Off the bars: towards the pointer, no target
    c.link.move(300, 200);
    expect(c.layout.link()!.preview).toMatchObject({ targetId: null, valid: false });
    expect(c.layout.link()!.preview!.d).toMatch(/^M/);
    await c.f.whenStable();
    expect(c.host.classList.contains('gantry-linking')).toBe(true);
    // Over Gamma's body near its start: the target side is the nearer connector
    const v = c.gantt.getBarVisual('c')!;
    c.link.move(v.x + 4, v.cy);
    expect(c.layout.link()!.preview).toMatchObject({ targetId: 'c', targetSide: 'start', type: 'FS', valid: true });
    c.link.cancel();
    expect(c.layout.link()).toBeNull();
    expect(await said(c)).toBe(DEFAULT_LABELS.announceLinkCancel);
    expect(c.host.classList.contains('gantry-linking')).toBe(false);
  });

  it('a drag start is not announced, a drop on nothing ends quietly', async () => {
    const c = await mount();
    c.link.start('a', 'end', 'drag', connector(c, 'a', 'end'));
    c.link.move(5, 300);
    expect(c.link.finish()).toBe(false);
    expect(c.h.events).toEqual([]);
    expect(await said(c)).toBe('');
  });

  it('the source bar is no target: nothing is created', async () => {
    const c = await mount();
    expect(drawLink(c, 'a', 'end', 'a', 'start')).toBe(false);
    expect(c.h.events).toEqual([]);
    expect(raw(c, 'a').dependency).toBeUndefined();
  });

  it('a loop and a duplicate are invalid targets: the reason announced, nothing created', async () => {
    const c = await mount();
    // b depends on a: a link b → a would close a loop
    c.link.start('b', 'end', 'drag', connector(c, 'b', 'end'));
    const at = connector(c, 'a', 'start');
    c.link.move(at.x, at.y);
    expect(c.layout.link()!.preview).toMatchObject({ targetId: 'a', valid: false, reason: DEFAULT_LABELS.errorCycle });
    expect(c.link.finish()).toBe(false);
    expect(await said(c)).toBe(DEFAULT_LABELS.announceChangeRejected(DEFAULT_LABELS.errorCycle));
    // a → b exists already
    expect(drawLink(c, 'a', 'end', 'b', 'start')).toBe(false);
    expect(await said(c)).toBe(DEFAULT_LABELS.announceChangeRejected(DEFAULT_LABELS.errorDuplicateLink));
    expect(c.h.events).toEqual([]);
    expect(raw(c, 'b').dependency).toBe('a');
  });

  it('parent ↔ child links are invalid unless `dependencies.parentChild`', async () => {
    let c = await mount(true, family());
    expect(drawLink(c, 'p', 'start', 'k', 'start')).toBe(false);
    expect(await said(c)).toBe(DEFAULT_LABELS.announceChangeRejected(DEFAULT_LABELS.errorParentChild));
    expect(drawLink(c, 'k', 'end', 'o', 'start')).toBe(true);
    TestBed.resetTestingModule();
    c = await mount({ dependencies: { parentChild: true } }, family());
    expect(drawLink(c, 'p', 'start', 'k', 'start')).toBe(true);
    expect(raw(c, 'k').dependency).toEqual([{ taskId: 'p', type: 'SS', lag: 0 }]);
  });

  it('a read-only task starts no link and is no valid target', async () => {
    const c = await mount(
      true,
      plan().map(t => (t.id === 'c' ? { ...t, editable: false } : t)),
    );
    c.link.start('c', 'end', 'drag', { x: 0, y: 0 });
    expect(c.link.active()).toBe(false);
    c.link.start('a', 'end', 'drag', connector(c, 'a', 'end'));
    const v = c.gantt.getBarVisual('c')!;
    c.link.move(v.x + v.width / 2, v.cy);
    expect(c.layout.link()!.preview).toMatchObject({
      targetId: 'c',
      valid: false,
      reason: DEFAULT_LABELS.errorReadOnly,
    });
    expect(c.link.finish()).toBe(false);
  });

  it('builds the change on the current tasks when they changed during the session', async () => {
    const c = await mount();
    c.link.start('a', 'end', 'drag', connector(c, 'a', 'end'));
    const at = connector(c, 'c', 'start');
    c.link.move(at.x, at.y);
    // The app replaces the tasks meanwhile (the binding reaches the chart): Gamma now depends on Beta
    await c.set(() => c.h.tasks.set(plan().map(t => (t.id === 'c' ? { ...t, dependency: 'b' } : t))));
    expect(c.link.active()).toBe(true);
    expect(c.link.finish()).toBe(true);
    expect(raw(c, 'c').dependency).toEqual([{ taskId: 'b' }, { taskId: 'a', type: 'FS', lag: 0 }]);
  });

  it('no session during a bar drag', async () => {
    const c = await mount();
    const dragSvc = c.f.debugElement.query(By.directive(GantryComponent)).injector.get(GanttDragService);
    const v = c.gantt.getBarVisual('a')!;
    dragSvc.start(c.layout.geometryById().get('a')!, 'bar', v.x + 2, editTiming(c.layout.timeline(), c.layout.cfg()));
    c.link.start('c', 'end', 'drag', connector(c, 'c', 'end'));
    expect(c.link.active()).toBe(false);
    dragSvc.cancel();
  });
});

describe('<gantry> links: click, then click (WCAG 2.5.7)', () => {
  it('arms from a connector, follows the pointer, creates on the target', async () => {
    const c = await mount();
    c.link.start('a', 'start', 'click', connector(c, 'a', 'start'));
    expect(await said(c)).toBe(DEFAULT_LABELS.announceLinkStart('Alpha'));
    const at = connector(c, 'c', 'end');
    c.link.move(at.x, at.y);
    expect(c.layout.link()!.preview).toMatchObject({ targetId: 'c', targetSide: 'end', type: 'SF' });
    expect(c.link.finish()).toBe(true);
    expect(raw(c, 'c').dependency).toEqual([{ taskId: 'a', type: 'SF', lag: 0 }]);
  });

  it('a click on nothing cancels, announced', async () => {
    const c = await mount();
    c.link.start('a', 'end', 'click', connector(c, 'a', 'end'));
    c.link.move(5, 300);
    expect(c.link.finish()).toBe(false);
    expect(await said(c)).toBe(DEFAULT_LABELS.announceLinkCancel);
  });
});

describe('<gantry> links: keyboard (L)', () => {
  it('L on a bar, arrows to another, Enter creates an FS link; focus stays', async () => {
    const c = await mount();
    await c.set(() => bar(c, 'a').focus());
    expect(press('l')).toBe(true);
    expect(c.layout.link()).toMatchObject({ sourceId: 'a', side: 'end', mode: 'keyboard', preview: null });
    expect(await said(c)).toBe(DEFAULT_LABELS.announceLinkStart('Alpha'));
    // Beta already depends on Alpha: invalid
    press('ArrowDown');
    expect(active()).toBe(bar(c, 'b'));
    expect(c.layout.link()!.preview).toMatchObject({ targetId: 'b', valid: false });
    press('ArrowDown');
    expect(c.layout.link()!.preview).toMatchObject({ targetId: 'c', targetSide: 'start', type: 'FS', valid: true });
    expect(press('Enter')).toBe(true);
    expect(names(c)).toContain('dependencyCreated');
    expect(raw(c, 'c').dependency).toEqual([{ taskId: 'a', type: 'FS', lag: 0 }]);
    await c.f.whenStable();
    expect(active()).toBe(bar(c, 'c'));
    expect(c.layout.link()).toBeNull();
    expect(await said(c)).toBe(DEFAULT_LABELS.announceLinkCreated('Alpha', 'Gamma'));
  });

  it('L on another bar creates it too; L or Enter on the source cancels', async () => {
    const c = await mount();
    await c.set(() => bar(c, 'a').focus());
    press('l');
    press('Enter');
    expect(c.layout.link()).toBeNull();
    expect(await said(c)).toBe(DEFAULT_LABELS.announceLinkCancel);
    press('l');
    press('ArrowDown');
    press('ArrowDown');
    expect(press('L')).toBe(true);
    expect(raw(c, 'c').dependency).toEqual([{ taskId: 'a', type: 'FS', lag: 0 }]);
  });

  it('Escape cancels (announced) and keeps the selection', async () => {
    const c = await mount();
    await c.set(() => c.gantt.setSelectedTasks(['b']));
    await c.set(() => bar(c, 'a').focus());
    press('l');
    expect(press('Escape')).toBe(true);
    expect(c.layout.link()).toBeNull();
    expect(await said(c)).toBe(DEFAULT_LABELS.announceLinkCancel);
    expect(c.gantt.getSelectedTasks().map(t => t.id)).toEqual(['b']);
  });

  it('Tab out of the bars and a pointer press cancel', async () => {
    const c = await mount();
    await c.set(() => bar(c, 'a').focus());
    press('l');
    c.$('.gantry-splitter-handle').focus();
    expect(c.layout.link()).toBeNull();
    await c.set(() => bar(c, 'a').focus());
    press('l');
    expect(c.layout.link()).not.toBeNull();
    c.$('.gantry-canvas-viewport').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(c.layout.link()).toBeNull();
    expect(await said(c)).toBe(DEFAULT_LABELS.announceLinkCancel);
  });

  it('a bar that cannot link, or editing off, leaves L alone', async () => {
    let c = await mount(
      true,
      plan().map(t => (t.id === 'a' ? { ...t, editable: false } : t)),
    );
    await c.set(() => bar(c, 'a').focus());
    expect(press('l')).toBe(false);
    expect(c.layout.link()).toBeNull();
    for (const editing of [false, { dependencies: { create: false } }] as const) {
      TestBed.resetTestingModule();
      c = await mount(editing);
      await c.set(() => bar(c, 'a').focus());
      expect(press('l')).toBe(false);
      expect(c.layout.link()).toBeNull();
    }
  });
});

describe('<gantry> links: selecting and deleting (D13)', () => {
  it('a click on the arrow selects it (announced, `--selected`), Delete removes it, undo restores the string', async () => {
    const c = await mount();
    const { key, x, y } = arrowPoint(c, 'a', 'b');
    expect(c.link.selectAt(x, y)).toBe(true);
    expect(c.layout.selectedLinkKey()).toBe(key);
    expect(await said(c)).toBe(DEFAULT_LABELS.announceLinkSelected('Alpha', 'Beta'));
    const selected = c.host.querySelectorAll('.gantt-arrows > g.gantt-arrow--selected');
    expect(selected).toHaveLength(1);
    expect(selected[0].querySelector('path')!.style.getPropertyValue('stroke')).toBe('var(--gantt-focus-ring)');

    await c.set(() => bar(c, 'c').focus());
    expect(press('Delete')).toBe(true);
    expect(names(c)).toEqual(['beforeChange', 'dependencyDeleted', 'taskUpdated', 'tasksChange', 'historyChange']);
    expect(c.h.events[1][1]).toEqual({ fromId: 'a', toId: 'b', type: 'FS', lag: 0 });
    expect(raw(c, 'b').dependency).toBeUndefined();
    expect(c.layout.selectedLinkKey()).toBeNull();
    expect(await said(c)).toBe(DEFAULT_LABELS.announceLinkDeleted('Alpha', 'Beta'));
    expect(c.host.querySelectorAll('.gantt-arrow--selected')).toHaveLength(0);

    expect(c.gantt.undo()).toBe(true);
    expect(raw(c, 'b').dependency).toBe('a');
  });

  it('undo of a drawn link restores the original `dependency` value', async () => {
    const c = await mount();
    expect(drawLink(c, 'a', 'end', 'd', 'start')).toBe(true);
    expect(raw(c, 'd').dependency).toEqual([{ taskId: 'b' }, { taskId: 'a', type: 'FS', lag: 0 }]);
    expect(c.gantt.undo()).toBe(true);
    expect(raw(c, 'd').dependency).toBe('b');
    expect(c.gantt.redo()).toBe(true);
    expect(raw(c, 'd').dependency).toHaveLength(2);
  });

  it('Delete works from the task list and the viewport too; Backspace as well', async () => {
    const c = await mount();
    const { x, y } = arrowPoint(c, 'b', 'd');
    c.link.selectAt(x, y);
    const row = c.$('.gantt-tl-row[data-task-id="a"]');
    await c.set(() => row.focus());
    expect(press('Backspace')).toBe(true);
    expect(raw(c, 'd').dependency).toBeUndefined();
    const again = arrowPoint(c, 'a', 'b');
    c.link.selectAt(again.x, again.y);
    expect(press('Delete', {}, c.$('.gantry-canvas-viewport'))).toBe(true);
    expect(raw(c, 'b').dependency).toBeUndefined();
  });

  it('nothing there, a bar there or `dependencies.delete: false`: nothing is selected', async () => {
    let c = await mount();
    const { x, y } = arrowPoint(c, 'a', 'b');
    expect(c.link.selectAt(x, y)).toBe(true);
    // Empty space deselects
    expect(c.link.selectAt(2, 3)).toBe(false);
    expect(c.layout.selectedLinkKey()).toBeNull();
    // A bar wins over the arrows
    const v = c.gantt.getBarVisual('b')!;
    expect(c.link.selectAt(v.x + v.width / 2, v.cy)).toBe(false);
    // Without a selection Delete keeps its default action
    await c.set(() => bar(c, 'a').focus());
    expect(press('Delete')).toBe(false);
    expect(c.link.deleteSelected()).toBe(false);
    for (const editing of [{ dependencies: { delete: false } }, false] as const) {
      TestBed.resetTestingModule();
      c = await mount(editing);
      expect(c.link.selectAt(x, y)).toBe(false);
    }
  });

  it('Escape deselects the link only; a press anywhere deselects', async () => {
    const c = await mount();
    await c.set(() => c.gantt.setSelectedTasks(['c']));
    const { x, y } = arrowPoint(c, 'a', 'b');
    c.link.selectAt(x, y);
    await c.set(() => bar(c, 'a').focus());
    expect(press('Escape')).toBe(true);
    expect(c.layout.selectedLinkKey()).toBeNull();
    expect(c.gantt.getSelectedTasks().map(t => t.id)).toEqual(['c']);
    c.link.selectAt(x, y);
    c.$('gantt-tasklist').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(c.layout.selectedLinkKey()).toBeNull();
  });

  it('a vetoed delete keeps the link and its selection', async () => {
    const c = await mount();
    const { x, y } = arrowPoint(c, 'a', 'b');
    c.link.selectAt(x, y);
    const sub = c.gantt.beforeChange.subscribe(e => e.preventDefault());
    expect(c.link.deleteSelected()).toBe(false);
    sub.unsubscribe();
    expect(raw(c, 'b').dependency).toBe('a');
    expect(c.layout.selectedLinkKey()).not.toBeNull();
  });
});

describe('<gantry> links: editing off', () => {
  it('no session, no selection, arrows painted as before', async () => {
    const c = await mount(false);
    c.link.start('a', 'end', 'drag', { x: 0, y: 0 });
    expect(c.link.active()).toBe(false);
    await c.f.whenStable();
    expect(c.host.querySelector('path.gantt-link-preview')).toBeNull();
    expect([...c.host.querySelectorAll('.gantt-arrows > g')].map(g => g.getAttribute('class'))).toEqual([
      'gantt-arrow',
      'gantt-arrow',
    ]);
  });
});

/** A link's visual between two bars a row apart (core, as the canvas computes it) */
function arrowVisual(critical = false): ArrowVisual {
  const cfg = resolveConfig({ viewMode: ViewMode.Day });
  // The arrow reads the bars' edges and centre lines only
  const bar = (x: number, y: number) =>
    ({ x, y, width: 60, height: 20, cy: y + 10 }) as unknown as Parameters<typeof computeArrowVisual>[0];
  return computeArrowVisual(
    bar(10, 8),
    bar(120, 44),
    { type: DependencyType.FS },
    cfg,
    { fromTop: 0, fromBottom: 36 },
    critical,
  );
}

@Component({
  imports: [GanttArrowComponent],
  template: `<svg><g ganttArrow [arrow]="arrow()"></g></svg>`,
})
class ArrowHost {
  readonly arrow = signal<ArrowVisual>(arrowVisual());
}

describe('g[ganttArrow] (phase 11)', () => {
  it('the selected link is `gantt-arrow--selected`, painted with the focus ring one px wider', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(ArrowHost);
    await f.whenStable();
    const g = (f.nativeElement as HTMLElement).querySelector('g')!;
    expect(g.getAttribute('class')).toBe('gantt-arrow');
    const critical = arrowVisual(true);
    f.componentInstance.arrow.set(selectedArrowVisual(critical));
    await f.whenStable();
    expect(g.getAttribute('class')).toBe('gantt-arrow gantt-arrow--critical gantt-arrow--selected');
    // The line (after its halo: the selected link's first child)
    const line = g.querySelector<SVGPathElement>('path:not(.gantt-arrow-halo)')!;
    expect(line.style.getPropertyValue('stroke')).toBe('var(--gantt-focus-ring)');
    expect(line.getAttribute('stroke-width')).toBe(String(critical.width + 1));
    expect(g.firstElementChild!.getAttribute('class')).toBe('gantt-arrow-halo');
    expect(g.getAttribute('pointer-events')).toBe('none');
  });

  it('forced colours: the selected link Highlight, after the CanvasText rules', () => {
    const css = (getComponentDef(GanttArrowComponent)?.styles ?? []).join('\n');
    const forced = css.slice(css.indexOf('@media (forced-colors: active)'));
    const norm = forced.replace(/\[_ngcontent-[^\]]+\]/g, '').replace(/\[_nghost-[^\]]+\]/g, ':host');
    expect(norm).toMatch(/\.gantt-arrow--selected:host\s+path\s*\{\s*stroke:\s*Highlight !important/);
    expect(norm).toMatch(/\.gantt-arrow--selected:host\s+polygon\s*\{\s*fill:\s*Highlight !important/);
    expect(norm.indexOf('Highlight')).toBeGreaterThan(norm.indexOf('CanvasText'));
  });
});
