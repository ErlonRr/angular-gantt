// Phase 11 step 4.8 — the Web Component's step 4.4 in Angular (toolbar-history.test.ts and
// readout-progress.test.ts):
// - the toolbar's history group (D17, plan §3d): with `toolbar.undo` (default on) and while the
//   chart keeps history (`editing.history`: editing on, not controlled) Undo and Redo icon buttons
//   sit after the panel group and before the zoom group, `aria-disabled` while there is nothing to
//   undo / redo (still focusable, in the roving set, inert), run the editor's undo / redo, keep
//   focus, and never move into the More menu. With editing off the toolbar is unchanged;
// - the readout chip during a progress-grip drag (D11, plan §3e): while the grip is dragged
//   (`GanttProgressService.active()`) and `layout.progressPreview` holds a value, the chip says the
//   progress (core `formatProgressReadout`, in the chart's locale), placed by core
//   `placeDragReadout` over the bar's box. Move mode's ↑ / ↓ also write `progressPreview`, but the
//   chip keeps the dates there.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  ANNOUNCE_DEBOUNCE,
  DEFAULT_LABELS,
  TOOLBAR_ICONS,
  ViewMode,
  dragReadoutWidth,
  formatDragReadout,
  formatProgressReadout,
  placeDragReadout,
  type DragPreview,
  type GanttOptions,
  type GanttTask,
  type GanttTasksChangeEvent,
  type ToolbarGroup,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttToolbarComponent } from './annotations/gantt-toolbar.component';
import { GanttCanvasComponent } from './layout/gantt-canvas.component';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttScrollService } from './scroll/gantt-scroll.service';
import { GanttDragService } from './drag/gantt-drag.service';
import { GanttI18nService } from './services/gantt-i18n.service';
import { GanttEditorService } from './editing/gantt-editor.service';
import { GanttProgressService } from './editing/progress';

const day = (d: number) => new Date(2026, 2, d);
const plan = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(6), progress: 20 },
  { id: 'b', name: 'Beta', start: day(8), end: day(12), progress: 50, dependency: 'a' },
];
const BASE: GanttOptions = { viewMode: ViewMode.Day, initialScroll: false, responsive: false };

@Component({
  imports: [GantryComponent],
  template: `<gantry
    style="height: 400px"
    [(series)]="tasks"
    [options]="options()"
    (beforeChange)="log.push('beforeChange')"
    (tasksChange)="onTasksChange($event)"
    (historyChange)="log.push('historyChange')"
  />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(plan());
  readonly options = signal<GanttOptions>(BASE);
  readonly log: string[] = [];
  /** `tasksChange.change.source`, in order */
  readonly sources: string[] = [];
  readonly gantt = viewChild.required(GantryComponent);

  onTasksChange(e: GanttTasksChangeEvent): void {
    this.log.push('tasksChange');
    this.sources.push(e.change.source);
  }
}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  host: HTMLElement;
  gantt: GantryComponent;
  layout: GanttLayoutService;
  editor: GanttEditorService;
  progress: GanttProgressService;
  drag: GanttDragService;
  scroll: GanttScrollService;
  i18n: GanttI18nService;
  canvas: GanttCanvasComponent;
  /** The toolbar's core groups (`buildToolbar`), while it shows */
  groups(): readonly ToolbarGroup[];
  set(change: () => void): Promise<void>;
  $<E extends Element = HTMLElement>(sel: string): E | null;
  $$<E extends Element = HTMLElement>(sel: string): E[];
}

async function mount(options: GanttOptions = {}, setup?: (h: Host) => void): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  f.componentInstance.options.set({ ...BASE, ...options });
  setup?.(f.componentInstance);
  await f.whenStable();
  const debug = f.debugElement.query(By.directive(GantryComponent));
  const host = debug.nativeElement as HTMLElement;
  return {
    f,
    h: f.componentInstance,
    host,
    gantt: f.componentInstance.gantt(),
    layout: debug.injector.get(GanttLayoutService),
    editor: debug.injector.get(GanttEditorService),
    progress: debug.injector.get(GanttProgressService),
    drag: debug.injector.get(GanttDragService),
    scroll: debug.injector.get(GanttScrollService),
    i18n: debug.injector.get(GanttI18nService),
    canvas: f.debugElement.query(By.directive(GanttCanvasComponent)).componentInstance as GanttCanvasComponent,
    groups: () =>
      (
        f.debugElement.query(By.directive(GanttToolbarComponent)).componentInstance as unknown as {
          groups(): readonly ToolbarGroup[];
        }
      ).groups(),
    async set(change) {
      change();
      await f.whenStable();
    },
    $: sel => host.querySelector(sel),
    $$: sel => [...host.querySelectorAll(sel)] as never[],
  };
}

const button = (c: Chart, key: string) => c.$<HTMLButtonElement>(`.gantt-toolbar [data-focus-key="${key}"]`);
/** The toolbar's built-in controls (the roving set), in order */
const keys = (c: Chart) =>
  c.$$('.gantt-toolbar > .gantt-tb-group:not(.gantt-tb-slot) > button').map(b => b.getAttribute('data-focus-key'));
/** The built-in groups (the `[ganttToolbar]` slot left out) */
const groupClasses = (c: Chart) =>
  c.$$('.gantt-toolbar > .gantt-tb-group:not(.gantt-tb-slot)').map(g => g.getAttribute('class'));
const active = () => document.activeElement?.getAttribute('data-focus-key');
const tabStops = (c: Chart) => c.$$('.gantt-toolbar button[tabindex="0"]').map(b => b.getAttribute('data-focus-key'));
const disabled = (c: Chart) => [
  button(c, 'undo')?.getAttribute('aria-disabled') ?? null,
  button(c, 'redo')?.getAttribute('aria-disabled') ?? null,
];
const live = (c: Chart) => c.$('.gantt-sr-live')!.textContent;
const task = (c: Chart, id: string) => c.h.tasks().find(t => t.id === id)!;

/** A pointer drop of `id`'s bar `days` later (what the canvas emits after a drag), then a render. */
async function dragBy(c: Chart, id: string, days: number): Promise<void> {
  const t = task(c, id);
  const shift = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  c.canvas.taskDragged.emit({
    taskId: id,
    oldStart: t.start,
    oldEnd: t.end,
    newStart: shift(t.start),
    newEnd: shift(t.end),
    daysMoved: days,
  });
  await c.f.whenStable();
}

/** A real keydown (bubbling, cancelable) on `target`; true when prevented. */
function key(target: Element, k: string, init: KeyboardEventInit = {}): boolean {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e.defaultPrevented;
}

/** Lets a debounced announcement reach the live region, then waits for the render. */
async function settle(c: Chart): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ANNOUNCE_DEBOUNCE + 20));
  await c.f.whenStable();
}

const PHASE9_HEAD = ['zoom-out', 'zoom-in', 'fit'];

afterEach(() => vi.restoreAllMocks());

describe('toolbar history group (Phase 11 step 4.8)', () => {
  describe('not built unless the chart keeps history', () => {
    it.each<[string, GanttOptions]>([
      ['editing off (default)', {}],
      ['editing: false', { editing: false }],
      ['history: false', { editing: { history: false } }],
      ['controlled', { editing: { controlled: true } }],
      ['toolbar.undo: false', { editing: true, toolbar: { undo: false } }],
    ])('%s: the toolbar has no history group and no aria-disabled', async (_, options) => {
      const c = await mount(options);
      expect(c.$('.gantt-tb-history')).toBeNull();
      expect(button(c, 'undo')).toBeNull();
      expect(button(c, 'redo')).toBeNull();
      expect(c.$$('.gantt-toolbar [aria-disabled]')).toEqual([]);
      expect(keys(c).slice(0, 3)).toEqual(PHASE9_HEAD);
    });

    it('with editing off a drop leaves the toolbar alone (the history state is not read)', async () => {
      const c = await mount();
      const before = c.groups();
      const zoomOut = button(c, 'zoom-out');
      await dragBy(c, 'a', 2);
      expect(task(c, 'a').start).toEqual(day(4));
      expect(c.groups()).toBe(before);
      expect(button(c, 'zoom-out')).toBe(zoomOut);
      expect(c.$('.gantt-tb-history')).toBeNull();
    });
  });

  describe('with editing on', () => {
    it('sits after the panel group and before the zoom group: icon buttons named and titled Undo / Redo', async () => {
      const c = await mount({ editing: true, toolbar: { panelToggle: true } });
      expect(groupClasses(c).slice(0, 3)).toEqual([
        'gantt-tb-group gantt-tb-panel-group',
        'gantt-tb-group gantt-tb-history',
        'gantt-tb-group',
      ]);
      expect(keys(c).slice(0, 6)).toEqual(['panel', 'undo', 'redo', ...PHASE9_HEAD]);
      const group = c.$('.gantt-tb-history')!;
      expect(group.getAttribute('role')).toBeNull();
      expect(group.getAttribute('aria-label')).toBeNull();
      for (const kind of ['undo', 'redo'] as const) {
        const b = button(c, kind)!;
        expect(b.parentElement).toBe(group);
        expect(b.getAttribute('class')).toBe(`gantt-tb-btn gantt-tb-${kind}`);
        expect(b.getAttribute('type')).toBe('button');
        expect(b.getAttribute('aria-label')).toBe(DEFAULT_LABELS[kind]);
        expect(b.getAttribute('title')).toBe(DEFAULT_LABELS[kind]);
        // An icon only: no text, no pressed / checked state
        for (const attr of ['role', 'aria-pressed', 'aria-checked', 'aria-haspopup', 'aria-expanded'])
          expect(b.hasAttribute(attr), attr).toBe(false);
        expect(b.querySelector('.gantt-tb-label')).toBeNull();
        expect(b.textContent?.trim()).toBe('');
        expect(b.children).toHaveLength(1);
        const svg = b.firstElementChild!;
        expect(svg.getAttribute('class')).toBe('gantt-tb-icon');
        expect(svg.getAttribute('aria-hidden')).toBe('true');
        expect([...svg.querySelectorAll('path')].map(p => p.getAttribute('d'))).toEqual(TOOLBAR_ICONS[kind]);
      }
      // aria-label, title, then aria-disabled (the §3d order)
      const names = [...button(c, 'undo')!.attributes].map(a => a.name);
      expect(names.indexOf('aria-disabled')).toBe(names.indexOf('title') + 1);
    });

    it('both disabled with an empty history; the tab stop skips them while nothing was focused', async () => {
      const c = await mount({ editing: true });
      expect(groupClasses(c)[0]).toBe('gantt-tb-group gantt-tb-history');
      expect(disabled(c)).toEqual(['true', 'true']);
      // Never natively disabled: focusable, in the roving set
      expect(button(c, 'undo')!.disabled).toBe(false);
      expect(tabStops(c)).toEqual(['zoom-out']);
      expect(button(c, 'undo')!.getAttribute('tabindex')).toBe('-1');
    });

    it('follows canUndo / canRedo: a drop enables Undo; Undo runs the pipeline and enables Redo', async () => {
      const c = await mount({ editing: true });
      const start = task(c, 'a').start;
      await dragBy(c, 'a', 2);
      expect(disabled(c)).toEqual([null, 'true']);
      expect(task(c, 'a').start).not.toBe(start);

      c.h.sources.length = 0;
      button(c, 'undo')!.click();
      await c.f.whenStable();
      expect(c.h.sources).toEqual(['undo']);
      expect(task(c, 'a').start).toBe(start);
      expect(disabled(c)).toEqual(['true', null]);
      await settle(c);
      expect(live(c)).toBe(DEFAULT_LABELS.announceUndo(DEFAULT_LABELS.announceMoved('Alpha', 2, 'day')));

      button(c, 'redo')!.click();
      await c.f.whenStable();
      expect(c.h.sources).toEqual(['undo', 'redo']);
      expect(task(c, 'a').start).not.toBe(start);
      expect(disabled(c)).toEqual([null, 'true']);
      expect([c.gantt.canUndo(), c.gantt.canRedo()]).toEqual([true, false]);
    });

    it('a disabled button is inert: a click runs nothing', async () => {
      const c = await mount({ editing: true });
      const undo = vi.spyOn(c.editor, 'undo');
      const redo = vi.spyOn(c.editor, 'redo');
      button(c, 'undo')!.click();
      button(c, 'redo')!.click();
      await c.f.whenStable();
      expect(undo).not.toHaveBeenCalled();
      expect(redo).not.toHaveBeenCalled();
      expect(c.h.log).toEqual([]);

      await dragBy(c, 'a', 1);
      c.h.log.length = 0;
      button(c, 'redo')!.click();
      expect(redo).not.toHaveBeenCalled();
      button(c, 'undo')!.click();
      expect(undo).toHaveBeenCalledTimes(1);
      expect(c.h.log).toEqual(['beforeChange', 'tasksChange', 'historyChange']);
    });

    it('keeps its nodes and focus across an undo; ←/→ rove over it, disabled or not', async () => {
      const c = await mount({ editing: true });
      await dragBy(c, 'a', 1);
      const undo = button(c, 'undo')!;
      undo.focus();
      expect(active()).toBe('undo');
      undo.click();
      await c.f.whenStable();
      // Disabled now, same node, still focused and the tab stop (the control focused last)
      expect(button(c, 'undo')).toBe(undo);
      expect(undo.getAttribute('aria-disabled')).toBe('true');
      expect(active()).toBe('undo');
      expect(tabStops(c)).toEqual(['undo']);

      expect(key(undo, 'ArrowRight')).toBe(true);
      expect(active()).toBe('redo');
      expect(key(button(c, 'redo')!, 'ArrowRight')).toBe(true);
      expect(active()).toBe('zoom-out');
      expect(key(button(c, 'zoom-out')!, 'ArrowLeft')).toBe(true);
      expect(active()).toBe('redo');
      expect(key(button(c, 'redo')!, 'Home')).toBe(true);
      expect(active()).toBe('undo');
    });

    it('re-builds the toolbar only when canUndo / canRedo change', async () => {
      const c = await mount({ editing: { history: { coalesceMs: 0 } } });
      const before = c.groups();
      await dragBy(c, 'a', 1);
      const after = c.groups();
      expect(after).not.toBe(before);
      // Another step: the state changes (count, label), the buttons do not
      await dragBy(c, 'b', 1);
      expect(c.layout.historyState().undoCount).toBe(2);
      expect(c.groups()).toBe(after);
    });

    it('turning history off removes the group; clearHistory() disables both', async () => {
      const c = await mount({ editing: true });
      await dragBy(c, 'a', 1);
      await c.set(() => c.gantt.undo());
      expect(disabled(c)).toEqual(['true', null]);
      await c.set(() => c.gantt.clearHistory());
      expect(disabled(c)).toEqual(['true', 'true']);
      await c.set(() => c.h.options.set({ ...BASE, editing: { history: false } }));
      expect(c.$('.gantt-tb-history')).toBeNull();
      await c.set(() => c.h.options.set({ ...BASE, editing: true }));
      expect(groupClasses(c)[0]).toBe('gantt-tb-group gantt-tb-history');
    });

    it('never moves into the More menu, however narrow', async () => {
      const c = await mount({ editing: true, toolbar: { panelToggle: true } });
      await c.set(() => c.layout.mainWidth.set(240));
      expect(button(c, 'more')).not.toBeNull();
      expect(keys(c).slice(0, 3)).toEqual(['panel', 'undo', 'redo']);
      button(c, 'more')!.click();
      await c.f.whenStable();
      const items = c.$$('.gantt-tb-menu-item').map(b => b.getAttribute('data-focus-key'));
      expect(items.length).toBeGreaterThan(0);
      expect(items.some(k => /undo|redo/.test(k ?? ''))).toBe(false);
      expect(c.$('.gantt-tb-menu .gantt-tb-undo')).toBeNull();
    });
  });
});

describe('readout chip: progress (Phase 11 step 4.8)', () => {
  /** Mounts with the timeline viewport measured 600 × 300 px (happy-dom has no layout). */
  async function mountMeasured(options: GanttOptions): Promise<Chart> {
    const c = await mount(options, h =>
      h.tasks.set([
        { id: 'a', name: 'Alpha', start: day(2), end: day(9), progress: 20 },
        { id: 'b', name: 'Beta', start: day(10), end: day(16), progress: 0 },
      ]),
    );
    await c.set(() => {
      c.layout.viewportWidth.set(600);
      c.layout.viewportHeight.set(300);
    });
    return c;
  }

  const chip = (c: Chart) => c.$('.gantt-drag-readout');
  /** A progress-grip drag is on (`GanttProgressService.active()`, filled by step 4.5). */
  const grip = (c: Chart, on: boolean) => vi.spyOn(c.progress, 'active').mockReturnValue(on);
  const preview = (c: Chart, taskId: string, progress: number | null) =>
    c.set(() => c.layout.progressPreview.set(progress === null ? null : { taskId, progress }));

  /** Where the chip saying `text` goes for `taskId`: anchored on the box of the bar the chart paints. */
  function expected(c: Chart, taskId: string, text: string) {
    const { x, y, width, height } = c.gantt.getBarVisual(taskId)!;
    return placeDragReadout(
      { x, y, width, height },
      {
        scrollLeft: c.scroll.scrollLeft(),
        viewportWidth: 600,
        scrollTop: c.scroll.scrollTop(),
        headerHeight: c.layout.headerHeight(),
        viewportHeight: 300,
        width: dragReadoutWidth(text),
      },
    );
  }

  it('shows the progress over the bar while the grip is dragged, patched in place, gone at the end', async () => {
    const c = await mountMeasured({ editing: true });
    const viewport = c.$('.gantry-canvas-viewport')!;
    grip(c, true);
    expect(chip(c)).toBeNull();

    await preview(c, 'a', 45);
    const node = chip(c)!;
    expect(node.parentElement).toBe(viewport);
    expect(node.previousElementSibling?.localName).toBe('gantt-canvas');
    expect(node.getAttribute('aria-hidden')).toBe('true');
    expect(node.textContent).toBe('45%');
    const place = expected(c, 'a', '45%');
    expect(node.getAttribute('data-align')).toBe(place.align);
    expect(node.style.getPropertyValue('--x')).toBe(`${place.x}px`);
    expect(node.style.getPropertyValue('--y')).toBe(`${place.y}px`);

    await preview(c, 'a', 100);
    expect(chip(c)).toBe(node);
    expect(node.textContent).toBe('100%');

    await preview(c, 'a', null);
    expect(chip(c)).toBeNull();
  });

  it("formats in the chart's locale", async () => {
    const c = await mountMeasured({ editing: true, locale: 'de' });
    grip(c, true);
    await preview(c, 'b', 30);
    expect(chip(c)!.textContent).toBe(formatProgressReadout(30, 'de'));
    expect(chip(c)!.textContent).not.toBe('30%');
  });

  it('a preview whose row is gone shows nothing', async () => {
    const c = await mountMeasured({ editing: true });
    grip(c, true);
    await preview(c, 'gone', 40);
    expect(chip(c)).toBeNull();
  });

  it('move mode (no grip drag): the chip keeps the dates, the progress preview changes nothing', async () => {
    const c = await mountMeasured({ editing: true });
    grip(c, false);
    // ↑ / ↓ alone: no dates preview, no chip
    await preview(c, 'a', 30);
    expect(chip(c)).toBeNull();

    // A date step too: the dates
    const start = day(3);
    const end = day(10);
    const dates: DragPreview = {
      taskId: 'a',
      x: 120,
      width: 160,
      y: 0,
      height: 20,
      delta: 1,
      unit: 'day',
      daysDelta: 1,
      start,
      end,
    };
    await c.set(() => {
      c.drag.startExternal('a');
      c.drag.setExternalPreview(dates);
    });
    expect(chip(c)!.textContent).toBe(
      formatDragReadout(
        { start, end },
        {
          labels: c.i18n.labels(),
          locale: c.i18n.locale(),
          dates: c.layout.cfg(),
          unit: 'day',
          format: c.i18n.formats().readoutFormat,
        },
      ),
    );
    await preview(c, 'a', 60);
    expect(chip(c)!.textContent).not.toContain('%');
    await c.set(() => c.drag.endExternal());
  });

  it('with editing off nothing reads the grip', async () => {
    const c = await mountMeasured({});
    const read = grip(c, true);
    await c.set(() => c.scroll.scrollLeft.set(40));
    expect(read).not.toHaveBeenCalled();
    expect(chip(c)).toBeNull();
  });
});
