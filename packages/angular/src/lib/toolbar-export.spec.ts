// Phase 12 step 4.3 — the Web Component's step 3.3 (toolbar-export.test.ts) in Angular: the
// toolbar's Export menu (`toolbar.export`, D16, plan §3d/§3e): the export group and its menu button,
// the Export menu (the More menu's block, right after its group, one menu at a time), its keys and
// focus (core `reduceMenu` / `toolbarMenuKey`), the formats as a More section once the group has
// moved, the items running `GanttExportService.run(format, 'toolbar')` after focus is back on the
// button, the closing rules; the print rules (D17) in the components that paint each node, and the
// forced-colours rule for an open menu button.
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  Component,
  provideZonelessChangeDetection,
  signal,
  viewChild,
  ɵgetComponentDef as getComponentDef,
  type Type,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DEFAULT_LABELS, TOOLBAR_ICONS, ViewMode, type GanttOptions, type GanttTask } from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttToolbarComponent } from './annotations/gantt-toolbar.component';
import { GanttExportService } from './export/gantt-export.service';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttCanvasComponent } from './layout/gantt-canvas.component';
import { GanttTooltipComponent } from './tooltip/gantt-tooltip.component';
import { GanttDragReadoutComponent } from './drag/gantt-drag-readout.component';
import { GanttDragPreviewComponent } from './drag/gantt-drag-preview.component';
import { GanttBarOverlayComponent } from './bars/bar-overlay.component';
import { GanttLoadMoreComponent } from './datasource/gantt-load-more.component';
import { PRINT_CSS } from './styles/print.css';

function plan(n: number): GanttTask[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Task ${i}`,
    start: new Date(2026, 2, 2 + i),
    end: new Date(2026, 2, 9 + i),
    progress: 40,
  }));
}

@Component({
  imports: [GantryComponent],
  template: `<gantry style="height: 400px" [series]="tasks" [options]="options()" [showToolbar]="showToolbar()" />`,
})
class Host {
  readonly tasks = plan(3);
  readonly options = signal<GanttOptions>({});
  readonly showToolbar = signal(true);
  readonly gantt = viewChild.required(GantryComponent);
}

// ── A ResizeObserver the test drives (the panes' width) ──
interface FakeObserver {
  readonly cb: () => void;
  readonly targets: Element[];
}
let observers: FakeObserver[] = [];

/** What the tests read of the toolbar component beyond its DOM */
interface ToolbarInternals {
  open(): boolean;
  exportOpen(): boolean;
}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  host: HTMLElement;
  gantt: GantryComponent;
  main: HTMLElement;
  layout: GanttLayoutService;
  /** The toolbar component, while shown */
  toolbar(): ToolbarInternals;
  /** Which menu is open: `{ more, export }` */
  open(): { more: boolean; export: boolean };
  set(change: () => void): Promise<void>;
  resize(width: number): Promise<void>;
  $<E extends Element = HTMLElement>(sel: string): E | null;
  $$<E extends Element = HTMLElement>(sel: string): E[];
}

const EXPORT_ON: GanttOptions = { toolbar: { export: true } };

/** A chart `width` px wide (responsive off: the toolbar alone is under test). */
async function mount(options: GanttOptions = EXPORT_ON, width = 1600): Promise<Chart> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  f.componentInstance.options.set({ viewMode: ViewMode.Month, initialScroll: false, responsive: false, ...options });
  await f.whenStable();
  const debug = f.debugElement.query(By.directive(GantryComponent));
  const host = debug.nativeElement as HTMLElement;
  const main = host.querySelector<HTMLElement>('.gantry-main')!;
  let mainWidth = 0;
  Object.defineProperty(main, 'clientWidth', { configurable: true, get: () => mainWidth });
  const toolbar = () =>
    f.debugElement.query(By.directive(GanttToolbarComponent)).componentInstance as unknown as ToolbarInternals;
  const c: Chart = {
    f,
    h: f.componentInstance,
    host,
    gantt: f.componentInstance.gantt(),
    main,
    layout: debug.injector.get(GanttLayoutService),
    toolbar,
    open: () => ({ more: toolbar().open(), export: toolbar().exportOpen() }),
    async set(change) {
      change();
      await f.whenStable();
    },
    async resize(px) {
      mainWidth = px;
      for (const o of [...observers]) if (o.targets.includes(main)) o.cb();
      await f.whenStable();
    },
    $: sel => host.querySelector(sel),
    $$: sel => [...host.querySelectorAll(sel)] as never[],
  };
  await c.resize(width);
  return c;
}

const button = (c: Chart, key: string) => c.$<HTMLButtonElement>(`.gantt-toolbar [data-focus-key="${key}"]`);
const keys = (c: Chart) =>
  c.$$('.gantt-toolbar > .gantt-tb-group:not(.gantt-tb-slot) > button').map(b => b.getAttribute('data-focus-key'));
const groupClasses = (c: Chart) =>
  c.$$('.gantt-toolbar > .gantt-tb-group:not(.gantt-tb-slot)').map(g => g.getAttribute('class'));
const menuKeys = (c: Chart) => c.$$('.gantt-tb-menu-item').map(b => b.getAttribute('data-focus-key'));
const active = () => document.activeElement?.getAttribute('data-focus-key');
const tabStops = (c: Chart) => c.$$('.gantt-toolbar button[tabindex="0"]').map(b => b.getAttribute('data-focus-key'));
const menu = (c: Chart) => c.$('.gantt-tb-menu');

/** The toolbar's markup, without the per-build encapsulation attribute names. */
const toolbarHtml = (c: Chart) => c.$('gantt-toolbar')!.outerHTML.replace(/_ng(content|host)-[\w-]+/g, '_ng$1');

function key(target: Element, k: string, init: KeyboardEventInit = {}): boolean {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e.defaultPrevented;
}
function press(target: EventTarget): void {
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, cancelable: true }));
}

/** Opens the Export menu with a click and runs the render that paints it (and focuses its item). */
async function openExport(c: Chart): Promise<HTMLElement> {
  button(c, 'export')!.click();
  await c.f.whenStable();
  return menu(c)!;
}

/** Spies on the chart's export run; records where focus was when it ran. */
function spyRun(c: Chart) {
  const service = c.f.debugElement.query(By.directive(GanttToolbarComponent)).injector.get(GanttExportService);
  const at: (string | null | undefined)[] = [];
  const spy = vi.spyOn(service, 'run').mockImplementation(() => {
    at.push(active());
    return Promise.resolve(true);
  });
  return { spy, at };
}

/** The narrowest width (in steps of 10 px) at which the export group still shows. */
async function fitWidth(c: Chart): Promise<number> {
  let lo = 300;
  let hi = 2000;
  while (hi - lo > 10) {
    const mid = Math.round((lo + hi) / 2);
    await c.resize(mid);
    if (button(c, 'export')) hi = mid;
    else lo = mid;
  }
  await c.resize(hi);
  return hi;
}

const FORMATS = ['svg', 'png', 'csv', 'print'] as const;
const FORMAT_LABELS = [
  DEFAULT_LABELS.exportSvg,
  DEFAULT_LABELS.exportPng,
  DEFAULT_LABELS.exportCsv,
  DEFAULT_LABELS.exportPrint,
];
const ITEM_KEYS = FORMATS.map(f => `menu:export:${f}`);

describe('toolbar Export menu (Phase 12 step 4.3)', () => {
  beforeEach(() => {
    observers = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        readonly targets: Element[] = [];
        readonly cb: () => void;
        constructor(cb: () => void) {
          this.cb = cb;
          observers.push(this);
        }
        observe(target: Element) {
          this.targets.push(target);
        }
        unobserve(target: Element) {
          this.targets.splice(this.targets.indexOf(target), 1);
        }
        disconnect() {
          observers = observers.filter(o => o !== this);
        }
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('off (the default)', () => {
    it.each([1150, 600])('at %i px: no export group, the same toolbar markup as without the option', async width => {
      const c = await mount({}, width);
      const before = toolbarHtml(c);
      expect(c.$('.gantt-tb-export-group')).toBeNull();
      expect(button(c, 'export')).toBeNull();
      const off = await mount({ toolbar: { export: false }, export: { formats: ['csv'] } }, width);
      expect(toolbarHtml(off)).toBe(before);
      expect(off.open()).toEqual({ more: false, export: false });
    });

    it('builds no export group without a format', async () => {
      const c = await mount({ toolbar: { export: true }, export: { formats: [] } });
      expect(button(c, 'export')).toBeNull();
      expect(groupClasses(c)).not.toContain('gantt-tb-group gantt-tb-export-group');
    });
  });

  describe('the export group', () => {
    it('comes last, after the views and the slot: one icon menu button named by labels.exportMenu', async () => {
      const c = await mount();
      expect(groupClasses(c).at(-1)).toBe('gantt-tb-group gantt-tb-export-group');
      expect(groupClasses(c).at(-2)).toBe('gantt-tb-group gantt-tb-pills gantt-tb-views');
      expect(keys(c).slice(-2)).toEqual(['view:chart', 'export']);
      const group = c.$('.gantt-tb-export-group')!;
      expect(c.$('.gantt-tb-slot')!.nextElementSibling?.classList.contains('gantt-tb-views')).toBe(true);
      expect(group.previousElementSibling?.classList.contains('gantt-tb-views')).toBe(true);
      expect(group.getAttribute('role')).toBeNull();
      expect(group.getAttribute('aria-label')).toBeNull();
      const b = button(c, 'export')!;
      expect(b.parentElement).toBe(group);
      expect(group.children).toHaveLength(1);
      expect(b.getAttribute('class')).toBe('gantt-tb-btn gantt-tb-export');
      expect(b.getAttribute('type')).toBe('button');
      expect(b.getAttribute('aria-label')).toBe(DEFAULT_LABELS.exportMenu);
      expect(b.getAttribute('title')).toBe(DEFAULT_LABELS.exportMenu);
      expect(b.getAttribute('aria-haspopup')).toBe('menu');
      expect(b.getAttribute('aria-expanded')).toBe('false');
      expect(b.hasAttribute('aria-controls')).toBe(false);
      expect(b.hasAttribute('role')).toBe(false);
      expect(b.getAttribute('tabindex')).toBe('-1');
      const svg = b.firstElementChild!;
      expect(svg.getAttribute('class')).toBe('gantt-tb-icon');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect([...svg.querySelectorAll('path')].map(p => p.getAttribute('d'))).toEqual(TOOLBAR_ICONS.export);
      expect(b.textContent.trim()).toBe('');
      expect(menu(c)).toBeNull();
    });

    it('is part of the roving set: ←/→ reach it and wrap', async () => {
      const c = await mount();
      button(c, 'view:chart')!.focus();
      expect(key(button(c, 'view:chart')!, 'ArrowRight')).toBe(true);
      expect(active()).toBe('export');
      expect(key(button(c, 'export')!, 'ArrowRight')).toBe(true);
      expect(active()).toBe('zoom-out');
      expect(key(button(c, 'zoom-out')!, 'ArrowLeft')).toBe(true);
      expect(active()).toBe('export');
      await c.f.whenStable();
      expect(tabStops(c)).toEqual(['export']);
    });
  });

  describe('the menu', () => {
    it('opens on a click right after the export group, named, on its first item', async () => {
      const c = await mount();
      const b = button(c, 'export')!;
      b.focus();
      const m = await openExport(c);
      expect(m.parentElement).toBe(c.$('.gantt-toolbar'));
      expect(m.previousElementSibling).toBe(b.parentElement);
      expect(m.getAttribute('role')).toBe('menu');
      expect(m.getAttribute('aria-label')).toBe(DEFAULT_LABELS.exportMenu);
      expect(m.id).toMatch(/^gantry-\d+-tb-menu$/);
      expect(b.getAttribute('aria-expanded')).toBe('true');
      expect(b.getAttribute('aria-controls')).toBe(m.id);
      expect(c.open()).toEqual({ more: false, export: true });

      const sections = [...m.children] as HTMLElement[];
      expect(
        sections.map(s => [s.getAttribute('class'), s.getAttribute('role'), s.hasAttribute('aria-label')]),
      ).toEqual([['gantt-tb-menu-group', 'group', false]]);
      expect(menuKeys(c)).toEqual(ITEM_KEYS);
      for (const item of c.$$('.gantt-tb-menu-item')) {
        expect(item.parentElement).toBe(sections[0]);
        expect(item.getAttribute('type')).toBe('button');
        expect(item.getAttribute('role')).toBe('menuitem');
        expect(item.hasAttribute('aria-checked')).toBe(false);
        expect(item.getAttribute('tabindex')).toBe('-1');
        expect(item.querySelector('svg')).toBeNull();
        expect([...item.children].map(e => e.getAttribute('class'))).toEqual(['gantt-tb-label']);
      }
      expect(c.$$('.gantt-tb-menu-item').map(i => i.textContent.trim())).toEqual(FORMAT_LABELS);
      // Nothing is checked: the first item; Export stands for the menu in the roving set
      expect(active()).toBe('menu:export:svg');
      await c.f.whenStable();
      expect(tabStops(c)).toEqual(['export']);
      expect(c.$$('.gantt-tb-menu')).toHaveLength(1);
    });

    it('lists export.formats in their order', async () => {
      const c = await mount({ toolbar: { export: true }, export: { formats: ['csv', 'print'] } });
      await openExport(c);
      expect(menuKeys(c)).toEqual(['menu:export:csv', 'menu:export:print']);
      expect(c.$$('.gantt-tb-menu-item').map(i => i.textContent.trim())).toEqual([
        DEFAULT_LABELS.exportCsv,
        DEFAULT_LABELS.exportPrint,
      ]);
    });

    it('a click on Export while open closes it back to Export', async () => {
      const c = await mount();
      await openExport(c);
      await c.set(() => button(c, 'export')!.click());
      expect(menu(c)).toBeNull();
      expect(active()).toBe('export');
      expect(button(c, 'export')!.getAttribute('aria-expanded')).toBe('false');
      expect(button(c, 'export')!.hasAttribute('aria-controls')).toBe(false);
    });

    it('an item closes the menu back to Export, then runs the export from the toolbar', async () => {
      const c = await mount();
      const { spy, at } = spyRun(c);
      await openExport(c);
      button(c, 'menu:export:png')!.click();
      expect(spy).toHaveBeenCalledExactlyOnceWith('png', 'toolbar');
      // Focus was back on Export when the export started
      expect(at).toEqual(['export']);
      expect(c.open()).toEqual({ more: false, export: false });
      await c.f.whenStable();
      expect(menu(c)).toBeNull();

      await openExport(c);
      button(c, 'menu:export:print')!.click();
      expect(spy).toHaveBeenLastCalledWith('print', 'toolbar');
      expect(at).toEqual(['export', 'export']);
    });

    it('keys on Export: ↓ opens on the first item, ↑ on the last; Enter / Space stay native', async () => {
      const c = await mount();
      const b = button(c, 'export')!;
      b.focus();
      expect(key(b, 'ArrowDown')).toBe(true);
      await c.f.whenStable();
      expect(active()).toBe('menu:export:svg');
      expect(key(button(c, 'menu:export:svg')!, 'Escape')).toBe(true);
      await c.f.whenStable();
      expect(menu(c)).toBeNull();
      expect(active()).toBe('export');

      expect(key(b, 'ArrowUp')).toBe(true);
      await c.f.whenStable();
      expect(active()).toBe('menu:export:print');
      key(button(c, 'menu:export:print')!, 'Escape');
      await c.f.whenStable();

      expect(key(b, 'Enter')).toBe(false);
      expect(key(b, ' ')).toBe(false);
      expect(key(b, 'ArrowDown', { ctrlKey: true })).toBe(false);
      await c.f.whenStable();
      expect(menu(c)).toBeNull();
    });

    it('keys in the menu: ↓/↑ wrap, Home / End; a pointer focus moves the active item; End then a click prints', async () => {
      const c = await mount();
      const { spy } = spyRun(c);
      const b = button(c, 'export')!;
      b.focus();
      key(b, 'ArrowDown');
      await c.f.whenStable();
      const at = () => ITEM_KEYS.indexOf(active() ?? '');
      const step = (k: string) => {
        expect(key(document.activeElement!, k), k).toBe(true);
        return at();
      };
      expect(at()).toBe(0);
      expect(step('ArrowDown')).toBe(1);
      expect(step('End')).toBe(3);
      expect(step('ArrowDown')).toBe(0);
      expect(step('ArrowUp')).toBe(3);
      expect(step('Home')).toBe(0);
      expect(key(document.activeElement!, 'ArrowRight')).toBe(false);
      button(c, 'menu:export:png')!.focus();
      expect(step('ArrowDown')).toBe(2);
      // Moving never runs an export
      expect(spy).not.toHaveBeenCalled();
      step('End');
      (document.activeElement as HTMLElement).click();
      expect(spy).toHaveBeenCalledExactlyOnceWith('print', 'toolbar');
      expect(active()).toBe('export');
    });

    it('Esc closes it back to Export without clearing the selection; Tab closes it and moves on', async () => {
      const c = await mount();
      await c.set(() => c.gantt.setSelectedTasks(['t0']));
      await openExport(c);
      expect(key(document.activeElement!, 'Escape')).toBe(true);
      await c.f.whenStable();
      expect(menu(c)).toBeNull();
      expect(active()).toBe('export');
      expect(c.gantt.getSelectedTasks().map(t => t.id)).toEqual(['t0']);

      await openExport(c);
      expect(key(document.activeElement!, 'Tab')).toBe(false);
      expect(c.open().export).toBe(false);
      await c.f.whenStable();
      expect(menu(c)).toBeNull();
      // Export itself, menu open: Esc closes it too
      await openExport(c);
      button(c, 'export')!.focus();
      expect(key(button(c, 'export')!, 'Escape')).toBe(true);
      expect(c.open().export).toBe(false);
      await c.f.whenStable();
      expect(c.gantt.getSelectedTasks().map(t => t.id)).toEqual(['t0']);
    });

    it("toolbar.overflow: 'wrap' keeps the group at any width; the menu still follows it", async () => {
      const c = await mount({ toolbar: { export: true, overflow: 'wrap' } }, 200);
      expect(button(c, 'more')).toBeNull();
      const m = await openExport(c);
      expect(m.previousElementSibling).toBe(button(c, 'export')!.parentElement);
      expect(menuKeys(c)).toEqual(ITEM_KEYS);
    });
  });

  describe('narrow: the formats as a More section', () => {
    it('moves first into More, as a section named labels.exportMenu (never a nested menu)', async () => {
      const c = await mount(EXPORT_ON, 600);
      expect(button(c, 'export')).toBeNull();
      expect(c.$('.gantt-tb-export-group')).toBeNull();
      expect(keys(c).at(-1)).toBe('more');
      await c.set(() => button(c, 'more')!.click());
      expect(c.open()).toEqual({ more: true, export: false });
      const m = menu(c)!;
      expect(m.getAttribute('aria-label')).toBe(DEFAULT_LABELS.more);
      expect(m.previousElementSibling).toBe(button(c, 'more')!.parentElement);
      const section = [...m.children].find(s => s.getAttribute('aria-label') === DEFAULT_LABELS.exportMenu)!;
      expect(section).toBeTruthy();
      expect(m.lastElementChild).toBe(section);
      expect([...section.children].map(i => i.getAttribute('data-focus-key'))).toEqual(ITEM_KEYS);
      expect([...section.children].map(i => i.getAttribute('role'))).toEqual(FORMATS.map(() => 'menuitem'));
      expect(menuKeys(c)).not.toContain('menu:export');
      expect(c.$$('.gantt-tb-menu')).toHaveLength(1);
    });

    it('a format chosen in More closes it back to More, then runs the export', async () => {
      const c = await mount(EXPORT_ON, 600);
      const { spy, at } = spyRun(c);
      const more = button(c, 'more')!;
      more.focus();
      expect(key(more, 'ArrowUp')).toBe(true);
      await c.f.whenStable();
      expect(active()).toBe('menu:export:print');
      key(document.activeElement!, 'ArrowUp');
      expect(active()).toBe('menu:export:csv');
      button(c, 'menu:export:csv')!.click();
      expect(spy).toHaveBeenCalledExactlyOnceWith('csv', 'toolbar');
      expect(at).toEqual(['more']);
      expect(c.open()).toEqual({ more: false, export: false });
    });

    it('an open Export menu closes after the render once its group moves into More without a resize', async () => {
      const c = await mount();
      const w = await fitWidth(c);
      expect(button(c, 'export')).not.toBeNull();
      await openExport(c);
      expect(active()).toBe('menu:export:svg');
      // Larger controls at the same width: the export group moves into More
      await c.set(() => c.h.options.update(o => ({ ...o, density: 'comfortable' })));
      expect(c.main.clientWidth).toBe(w);
      expect(button(c, 'export')).toBeNull();
      expect(menu(c)).toBeNull();
      // The focused item went away: focus on the toolbar's tab stop, not on the timeline
      expect(active()).toBe(tabStops(c)[0]);
      expect(c.open()).toEqual({ more: false, export: false });
      expect(button(c, 'more')!.getAttribute('aria-expanded')).toBe('false');
      // Back to the normal density: the group comes back closed
      await c.set(() => c.h.options.update(o => ({ ...o, density: 'normal' })));
      expect(button(c, 'export')!.getAttribute('aria-expanded')).toBe('false');
      expect(menu(c)).toBeNull();
    });
  });

  describe('closing rules', () => {
    it('a press outside the menu and Export closes it; a press inside does not', async () => {
      const c = await mount();
      const add = vi.spyOn(document, 'addEventListener');
      const remove = vi.spyOn(document, 'removeEventListener');
      await openExport(c);
      const added = add.mock.calls.filter(call => call[0] === 'pointerdown');
      expect(added).toHaveLength(1);
      expect((added[0][2] as AddEventListenerOptions).capture).toBe(true);
      press(button(c, 'menu:export:csv')!);
      press(button(c, 'export')!);
      expect(c.open().export).toBe(true);
      press(document.body);
      expect(c.open().export).toBe(false);
      await c.f.whenStable();
      expect(remove.mock.calls.some(call => call[0] === 'pointerdown' && call[1] === added[0][1])).toBe(true);
      expect(menu(c)).toBeNull();
      // A press that leaves focus on the removed item (happy-dom moves none) hands it to Export
      expect(active()).toBe('export');
    });

    it('a width change closes it; focus on a removed item goes to the tab stop', async () => {
      const c = await mount();
      await openExport(c);
      await c.resize(1590);
      expect(c.open().export).toBe(false);
      expect(menu(c)).toBeNull();
      expect(active()).toBe('export');
      // Narrow: the Export button goes, its focus to the toolbar's tab stop
      await c.resize(600);
      expect(button(c, 'export')).toBeNull();
      expect(active()).toBe(tabStops(c)[0]);
      expect(active()).not.toBe('more');
    });

    it('closes with the toolbar and with the chart; comes back closed', async () => {
      const c = await mount();
      await openExport(c);
      await c.set(() => c.h.showToolbar.set(false));
      expect(c.$('.gantt-toolbar')).toBeNull();
      await c.set(() => c.h.showToolbar.set(true));
      expect(menu(c)).toBeNull();
      expect(button(c, 'export')!.getAttribute('aria-expanded')).toBe('false');

      await openExport(c);
      await c.set(() => c.h.options.update(o => ({ ...o, toolbar: false })));
      await c.set(() => c.h.options.update(o => ({ ...o, toolbar: { export: true } })));
      expect(menu(c)).toBeNull();
      expect(button(c, 'export')!.getAttribute('aria-expanded')).toBe('false');

      const add = vi.spyOn(document, 'addEventListener');
      const remove = vi.spyOn(document, 'removeEventListener');
      await openExport(c);
      const fn = add.mock.calls.filter(call => call[0] === 'pointerdown').at(-1)?.[1];
      expect(fn).toBeTypeOf('function');
      c.f.destroy();
      expect(remove.mock.calls.some(call => call[0] === 'pointerdown' && call[1] === fn)).toBe(true);
    });

    it('options that keep the group keep the menu open', async () => {
      const c = await mount();
      await openExport(c);
      await c.set(() => c.h.options.update(o => ({ ...o, criticalPath: true })));
      expect(menu(c)).not.toBeNull();
      expect(c.open().export).toBe(true);
    });

    it('turning toolbar.export off closes the open menu', async () => {
      const c = await mount();
      await openExport(c);
      await c.set(() => c.h.options.update(o => ({ ...o, toolbar: { export: false } })));
      expect(button(c, 'export')).toBeNull();
      expect(menu(c)).toBeNull();
      expect(c.open()).toEqual({ more: false, export: false });
      await c.set(() => c.h.options.update(o => ({ ...o, toolbar: { export: true } })));
      expect(button(c, 'export')!.getAttribute('aria-expanded')).toBe('false');
      expect(menu(c)).toBeNull();
    });
  });
});

// ── Styles: the export group, forced colours and @media print (D17) ────────────────────────────

/** The compiled styles of a component: comments dropped, encapsulation attributes folded into `:host`. */
function cssOf(type: Type<unknown>): string {
  return (getComponentDef(type)?.styles ?? [])
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\[_ngcontent-[^\]]+\]/g, '')
    .replace(/\[_nghost-[^\]]+\]/g, ':host')
    .replace(/%NS%/g, '');
}

/** The bodies of the `@media <condition>` blocks of `css`, in order. */
function mediaBlocks(css: string, condition: string): string[] {
  const out: string[] = [];
  const at = (from: number) => css.indexOf(`@media ${condition}`, from);
  for (let i = at(0); i !== -1; i = at(i + 1)) {
    const open = css.indexOf('{', i);
    let depth = 0;
    let end = open;
    for (; end < css.length; end++) {
      if (css[end] === '{') depth++;
      else if (css[end] === '}' && --depth === 0) break;
    }
    out.push(css.slice(open + 1, end));
  }
  return out;
}

/** `selector → declarations` (whitespace-free) of the rules of `css`. */
function rulesOf(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const s of sel.split(',')) {
      const norm = s
        .replace(/=["']([^"'\]]*)["']\]/g, '=$1]')
        .replace(/\s+/g, ' ')
        .trim();
      out.set(norm, (out.get(norm) ?? '') + body.replace(/\s+/g, ''));
    }
  }
  return out;
}

const PRINT = 'print';
/** The selectors each component hides under `@media print`, as the Web Component's PRINT_CSS lists them */
const HIDDEN: readonly [string, Type<unknown>, readonly string[]][] = [
  ['toolbar (the Web Component’s .gantry-toolbar-container)', GanttToolbarComponent, [':host']],
  ['load-more footer', GanttLoadMoreComponent, [':host']],
  ['tooltip', GanttTooltipComponent, [':host']],
  ['drag readout', GanttDragReadoutComponent, [':host']],
  ['bar overlay', GanttBarOverlayComponent, [':host']],
  ['canvas', GanttCanvasComponent, ['.gantt-row-hover', '.gantt-link-preview']],
  ['drag preview', GanttDragPreviewComponent, ['.gantt-drag-preview']],
  ['chart', GantryComponent, ['.gantry-splitter', '.gantt-sr-live', '.gantt-sr-alert']],
];

describe('toolbar export styles (Phase 12 step 4.3)', () => {
  it('places Export at the far end, right after the views (the Web Component’s four rules)', () => {
    const top = rulesOf(cssOf(GanttToolbarComponent).replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, ''));
    expect(top.get('.gantt-tb-export-group')).toBe('margin-left:auto;');
    expect(top.get('.gantt-tb-group + .gantt-tb-export-group')).toBe('border-left:none;');
    expect(top.get('.gantt-tb-views + .gantt-tb-export-group')).toBe(
      'margin-left:0;border-left:1pxsolidvar(--gantt-border);',
    );
    expect(top.get('.gantt-tb-export-group ~ .gantt-legend--toolbar')).toBe('margin-left:0;');
  });

  it('forced colours: the open menu button (More, Export) Highlight', () => {
    const [forced] = mediaBlocks(cssOf(GanttToolbarComponent), '(forced-colors: active)');
    const rules = rulesOf(forced);
    for (const sel of ['.gantt-tb-more[aria-expanded=true]', '.gantt-tb-export[aria-expanded=true]'])
      expect(rules.get(sel), sel).toBe('color:Highlight;border-color:Highlight;');
  });

  describe('@media print: each node hidden by the component that paints it', () => {
    it.each(HIDDEN)('%s', (_, type, selectors) => {
      const css = cssOf(type);
      const blocks = mediaBlocks(css, PRINT);
      expect(blocks).toHaveLength(1);
      const rules = rulesOf(blocks[0]);
      for (const sel of selectors) expect(rules.get(sel), sel).toBe('display:none;');
      // No !important (nothing inline or later to win over), and before the forced colours
      expect(blocks[0]).not.toContain('!important');
      const forced = css.indexOf('@media (forced-colors: active)');
      if (type !== GantryComponent && forced !== -1) expect(css.indexOf(`@media ${PRINT}`)).toBeLessThan(forced);
    });

    it('the chart: exact colours on the host, the panes clip without scrollbars, after its own rules', () => {
      const css = cssOf(GantryComponent);
      // PRINT_CSS is GantryComponent's last style: the later rule wins over its pane rules
      // (`.gantry-canvas-viewport { overflow: auto }`, `scrollbar-width: thin`)
      expect(getComponentDef(GantryComponent)?.styles.at(-1)).toContain('@media print');
      expect(css.lastIndexOf('@media')).toBe(css.indexOf(`@media ${PRINT}`));
      expect(PRINT_CSS.trim().startsWith('@media print {')).toBe(true);
      const rules = rulesOf(mediaBlocks(css, PRINT)[0]);
      expect(rules.get(':host')).toBe('-webkit-print-color-adjust:exact;print-color-adjust:exact;');
      for (const pane of ['.gantry-panel', '.gantry-canvas-viewport']) {
        expect(rules.get(pane), pane).toBe('overflow:hidden;scrollbar-width:none;');
        expect(rules.get(`${pane}::-webkit-scrollbar`), pane).toBe('display:none;');
      }
    });

    it('reach the rendered nodes: toolbar, splitter, live regions, row hover and bar overlay', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      const f = TestBed.createComponent(Host);
      f.componentInstance.options.set({ viewMode: ViewMode.Month, initialScroll: false, ...EXPORT_ON });
      await f.whenStable();
      const debug = f.debugElement.query(By.directive(GantryComponent));
      const layout = debug.injector.get(GanttLayoutService);
      layout.hoveredRowId.set('t0');
      layout.hoveredBarId.set('t0');
      await f.whenStable();
      const chart = debug.nativeElement as HTMLElement;
      // The `display: none` selectors of every print block the chart injected, as injected
      const selectors: string[] = [];
      for (const style of document.querySelectorAll('style')) {
        const css = (style.textContent ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const block of mediaBlocks(css, PRINT)) {
          for (const [, sel, body] of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            if (/display:\s*none/.test(body) && !sel.includes('::'))
              selectors.push(...sel.split(',').map(s => s.trim()));
          }
        }
      }
      const hidden = new Set(selectors.flatMap(sel => [...chart.querySelectorAll(sel)]));
      for (const node of [
        chart.querySelector('gantt-toolbar'),
        chart.querySelector('.gantry-splitter'),
        chart.querySelector('.gantt-sr-live'),
        chart.querySelector('.gantt-sr-alert'),
        chart.querySelector('.gantt-row-hover'),
        chart.querySelector('.gantt-bar-overlay'),
      ]) {
        expect(node).not.toBeNull();
        expect(hidden.has(node!), node!.getAttribute('class') ?? node!.tagName).toBe(true);
      }
      // Nothing the printed chart needs
      for (const sel of [
        '.gantry-panel',
        '.gantry-canvas-viewport',
        'gantt-canvas',
        '.gantt-bars-layer',
        'gantt-header',
      ])
        expect(hidden.has(chart.querySelector(sel)!), sel).toBe(false);
    });
  });
});
