// Phase 10 step 4.8 — the toolbar fitted to the chart's width (core `layoutToolbar`, D3), the Web
// Component's step 4.2 (`packages/vanilla/src/__tests__/toolbar-p10.test.ts`) in Angular: the panel
// toggle (D7), the More button and its menu (§3c: DOM, roles, names, focus, keys through core
// `reduceMenu` / `toolbarMenuKey`, outside press, resize), `toolbar.overflow: 'wrap'`, the density
// control size (D5), the legend and the `[ganttToolbar]` slot sharing the toolbar's line. A toolbar
// that fits is the Phase 9 toolbar.
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
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
  DEFAULT_LABELS,
  TOOLBAR_ICONS,
  ViewMode,
  type GanttAnnotation,
  type GanttOptions,
  type GanttTask,
  type ToolbarLayout,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttToolbarComponent } from './annotations/gantt-toolbar.component';

/** `n` one-week tasks in March 2026. */
function plan(n: number): GanttTask[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Task ${i}`,
    start: new Date(2026, 2, 2 + (i % 20)),
    end: new Date(2026, 2, 9 + (i % 20)),
    progress: 40,
  }));
}

@Component({
  imports: [GantryComponent],
  template: `<gantry
    style="height: 400px"
    [series]="tasks"
    [options]="options()"
    [showToolbar]="showToolbar()"
    [showLegend]="showLegend()"
    [annotations]="annotations()"
  >
    @if (slot()) {
      <button ganttToolbar type="button" class="consumer">Export</button>
    }
  </gantry>`,
})
class Host {
  readonly tasks = plan(3);
  readonly options = signal<GanttOptions>({});
  readonly showToolbar = signal(true);
  readonly showLegend = signal(false);
  readonly annotations = signal<GanttAnnotation[]>([]);
  readonly slot = signal(false);
  readonly gantt = viewChild.required(GantryComponent);
}

// ── A ResizeObserver the test drives: the chart's (the panes) and the toolbar's (slot, legend) ──
interface FakeObserver {
  readonly cb: () => void;
  readonly targets: Element[];
}
let observers: FakeObserver[] = [];

/** Runs the observers watching `target`, as the browser does after a layout. */
function observe(target: Element): void {
  for (const o of [...observers]) if (o.targets.includes(target)) o.cb();
}

/** What the tests read of the toolbar component beyond its DOM */
interface ToolbarInternals {
  open(): boolean;
  fitted(): ToolbarLayout;
}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  host: HTMLElement;
  gantt: GantryComponent;
  /** The chart's `.gantry-main` */
  main: HTMLElement;
  /** The toolbar component, while shown */
  toolbar(): ToolbarInternals;
  set(change: () => void): Promise<void>;
  /** The chart's width becomes `width` (the ResizeObserver fires), then a render. */
  resize(width: number): Promise<void>;
  $<E extends Element = HTMLElement>(sel: string): E | null;
  $$<E extends Element = HTMLElement>(sel: string): E[];
}

/** A chart `width` px wide (responsive off unless asked: the toolbar alone is under test). */
async function mount(options: GanttOptions = {}, width = 1150, setup?: (h: Host) => void): Promise<Chart> {
  // A test may mount a second chart: the first one goes
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  f.componentInstance.options.set({ viewMode: ViewMode.Month, initialScroll: false, responsive: false, ...options });
  setup?.(f.componentInstance);
  await f.whenStable();
  const host = f.debugElement.query(By.directive(GantryComponent)).nativeElement as HTMLElement;
  const main = host.querySelector<HTMLElement>('.gantry-main')!;
  let mainWidth = 0;
  Object.defineProperty(main, 'clientWidth', { configurable: true, get: () => mainWidth });
  const c: Chart = {
    f,
    h: f.componentInstance,
    host,
    gantt: f.componentInstance.gantt(),
    main,
    toolbar: () => f.debugElement.query(By.directive(GanttToolbarComponent)).componentInstance,
    async set(change) {
      change();
      await f.whenStable();
    },
    async resize(px) {
      mainWidth = px;
      observe(main);
      await f.whenStable();
    },
    $: sel => host.querySelector(sel),
    $$: sel => [...host.querySelectorAll(sel)] as never[],
  };
  await c.resize(width);
  return c;
}

const button = (c: Chart, key: string) => c.$<HTMLButtonElement>(`.gantt-toolbar [data-focus-key="${key}"]`);
/** The toolbar's built-in controls (the roving set), in order */
const keys = (c: Chart) =>
  c.$$('.gantt-toolbar > .gantt-tb-group:not(.gantt-tb-slot) > button').map(b => b.getAttribute('data-focus-key'));
/** The built-in groups (the `[ganttToolbar]` slot left out) */
const groupClasses = (c: Chart) =>
  c.$$('.gantt-toolbar > .gantt-tb-group:not(.gantt-tb-slot)').map(g => g.getAttribute('class'));
const menuKeys = (c: Chart) => c.$$('.gantt-tb-menu-item').map(b => b.getAttribute('data-focus-key'));
const active = () => document.activeElement?.getAttribute('data-focus-key');
const tabStops = (c: Chart) => c.$$('.gantt-toolbar button[tabindex="0"]').map(b => b.getAttribute('data-focus-key'));
const menu = (c: Chart) => c.$('.gantt-tb-menu');
const iconPaths = (b: Element) => [...b.querySelectorAll('svg.gantt-tb-icon > path')].map(p => p.getAttribute('d'));

/** Dispatches a keydown on `target` the way a browser does (bubbling, cancelable); true when prevented. */
function key(target: Element, k: string, init: KeyboardEventInit = {}): boolean {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e.defaultPrevented;
}

/** A pointer press on `target`. */
function press(target: EventTarget): void {
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, cancelable: true }));
}

/** Opens the More menu with a click and runs the render that paints it (and focuses its item). */
async function openMenu(c: Chart): Promise<HTMLElement> {
  button(c, 'more')!.click();
  await c.f.whenStable();
  return menu(c)!;
}

/**
 * Opens the More menu and finds the document `pointerdown` listener it registered (capture
 * phase, only while open): `removed()` tells whether it was taken off again.
 */
async function outsideListener(c: Chart): Promise<{ added: boolean; removed: () => boolean }> {
  const add = vi.spyOn(document, 'addEventListener');
  const remove = vi.spyOn(document, 'removeEventListener');
  await openMenu(c);
  const calls = add.mock.calls.filter(call => call[0] === 'pointerdown');
  add.mockRestore();
  const fn = calls.at(-1)?.[1];
  return {
    added: calls.length === 1 && (calls[0][2] as AddEventListenerOptions | undefined)?.capture === true,
    removed: () => remove.mock.calls.some(call => call[0] === 'pointerdown' && call[1] === fn),
  };
}

/** The Phase 9 toolbar: groups and controls */
const PHASE9_GROUPS = [
  'gantt-tb-group',
  'gantt-tb-group gantt-tb-pills',
  'gantt-tb-group',
  'gantt-tb-group gantt-tb-pills gantt-tb-views',
];
const LEVELS = ['zoom:Hour', 'zoom:Day', 'zoom:Week', 'zoom:Month', 'zoom:Quarter', 'zoom:Year'];
const PHASE9_KEYS = ['zoom-out', 'zoom-in', 'fit', ...LEVELS, 'today', 'view:split', 'view:table', 'view:chart'];

describe('toolbar overflow, More menu and panel toggle (Phase 10 step 4.8)', () => {
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

  describe('a toolbar that fits is the Phase 9 toolbar', () => {
    it.each([0, 1100, 1150])('at %i px: same groups, controls and attributes, no More, no menu', async width => {
      const c = await mount({}, width);
      expect(groupClasses(c)).toEqual(PHASE9_GROUPS);
      expect(keys(c)).toEqual(PHASE9_KEYS);
      // The slot stays between Today and the view switch
      expect(c.$$('.gantt-toolbar > *').map(g => g.getAttribute('class'))).toEqual([
        ...PHASE9_GROUPS.slice(0, 3),
        'gantt-tb-slot gantt-tb-group',
        PHASE9_GROUPS[3],
      ]);
      expect(menu(c)).toBeNull();
      for (const attr of ['aria-pressed', 'aria-haspopup', 'aria-expanded', 'aria-controls'])
        expect(c.$$(`.gantt-toolbar [${attr}]`), attr).toEqual([]);
      expect(c.toolbar().open()).toBe(false);
    });

    it("never builds a menu with toolbar.overflow: 'wrap' (the groups wrap)", async () => {
      const c = await mount({ toolbar: { overflow: 'wrap' } }, 200);
      expect(keys(c)).toEqual(PHASE9_KEYS);
      expect(button(c, 'more')).toBeNull();
    });

    it('re-renders the toolbar on a resize only when its controls change', async () => {
      const c = await mount({}, 1150);
      const before = c.toolbar().fitted();
      const fit = button(c, 'fit');
      await c.resize(1000);
      await c.resize(900);
      expect(c.toolbar().fitted()).toBe(before);
      expect(button(c, 'fit')).toBe(fit);
      await c.resize(600);
      expect(c.toolbar().fitted()).not.toBe(before);
      expect(button(c, 'fit')).toBe(fit);
    });
  });

  describe('panel toggle (toolbar.panelToggle)', () => {
    it('is the first group: an aria-pressed icon button named by ariaTaskList, titled hide / show', async () => {
      const c = await mount({ toolbar: { panelToggle: true } });
      const group = c.$('.gantt-toolbar > .gantt-tb-group')!;
      expect(group.getAttribute('class')).toBe('gantt-tb-group gantt-tb-panel-group');
      expect(group.getAttribute('role')).toBeNull();
      const b = button(c, 'panel')!;
      expect(b.parentElement).toBe(group);
      expect(b.getAttribute('class')).toBe('gantt-tb-btn gantt-tb-panel');
      expect(b.getAttribute('type')).toBe('button');
      expect(b.getAttribute('aria-pressed')).toBe('true');
      expect(b.getAttribute('aria-label')).toBe(DEFAULT_LABELS.ariaTaskList);
      expect(b.getAttribute('title')).toBe(DEFAULT_LABELS.hidePanel);
      expect(b.hasAttribute('role')).toBe(false);
      expect(b.hasAttribute('aria-haspopup')).toBe(false);
      expect(iconPaths(b)).toEqual(TOOLBAR_ICONS.panel);
      // The roving set starts with it
      expect(keys(c)).toEqual(['panel', ...PHASE9_KEYS]);
      expect(tabStops(c)).toEqual(['panel']);
    });

    it('runs togglePanel(): hides and shows the task list, pressed while it shows', async () => {
      const c = await mount({ toolbar: { panelToggle: true } });
      const toggle = vi.spyOn(c.gantt, 'togglePanel');
      await c.set(() => button(c, 'panel')!.click());
      expect(toggle).toHaveBeenCalledOnce();
      expect(c.gantt.view()).toBe('chart');
      const b = button(c, 'panel')!;
      expect(b.getAttribute('aria-pressed')).toBe('false');
      expect(b.getAttribute('title')).toBe(DEFAULT_LABELS.showPanel);
      await c.set(() => b.click());
      expect(c.gantt.view()).toBe('split');
      expect(b.getAttribute('aria-pressed')).toBe('true');
    });

    it('stays in the toolbar however narrow, and keeps its node', async () => {
      const c = await mount({ toolbar: { panelToggle: true } });
      const b = button(c, 'panel');
      await c.resize(150);
      expect(button(c, 'panel')).toBe(b);
      expect(keys(c)).toEqual(['panel', 'zoom-out', 'zoom-in', 'fit', 'more']);
    });
  });

  describe('More button (§3c)', () => {
    it('replaces the zoom levels, then the views, then today, as the chart narrows', async () => {
      const c = await mount({}, 600);
      expect(groupClasses(c)).toEqual([
        'gantt-tb-group',
        'gantt-tb-group',
        'gantt-tb-group gantt-tb-pills gantt-tb-views',
        'gantt-tb-group gantt-tb-more-group',
      ]);
      expect(keys(c)).toEqual([
        'zoom-out',
        'zoom-in',
        'fit',
        'today',
        'view:split',
        'view:table',
        'view:chart',
        'more',
      ]);
      // After the slot, with the views
      expect(c.$('.gantt-tb-slot')!.nextElementSibling?.classList.contains('gantt-tb-views')).toBe(true);
      await c.resize(350);
      expect(keys(c)).toEqual(['zoom-out', 'zoom-in', 'fit', 'today', 'more']);
      await c.resize(200);
      expect(keys(c)).toEqual(['zoom-out', 'zoom-in', 'fit', 'more']);
      expect(c.$('.gantt-tb-slot')!.nextElementSibling?.classList.contains('gantt-tb-more-group')).toBe(true);
      // Back: the controls come back as the same nodes
      const fit = button(c, 'fit');
      await c.resize(1150);
      expect(keys(c)).toEqual(PHASE9_KEYS);
      expect(button(c, 'fit')).toBe(fit);
      expect(button(c, 'more')).toBeNull();
    });

    it('is a collapsed menu button named More, in the roving set, with no aria-controls while closed', async () => {
      const c = await mount({}, 600);
      const more = button(c, 'more')!;
      expect(more.getAttribute('class')).toBe('gantt-tb-btn gantt-tb-more');
      expect(more.getAttribute('type')).toBe('button');
      expect(more.getAttribute('aria-haspopup')).toBe('menu');
      expect(more.getAttribute('aria-expanded')).toBe('false');
      expect(more.hasAttribute('aria-controls')).toBe(false);
      expect(more.hasAttribute('aria-pressed')).toBe(false);
      expect(more.getAttribute('aria-label')).toBe(DEFAULT_LABELS.more);
      expect(more.getAttribute('title')).toBe(DEFAULT_LABELS.more);
      expect(iconPaths(more)).toEqual(TOOLBAR_ICONS.more);
      expect(menu(c)).toBeNull();
      // ←/→ reach it and wrap
      button(c, 'zoom-out')!.focus();
      expect(key(button(c, 'zoom-out')!, 'ArrowLeft')).toBe(true);
      expect(active()).toBe('more');
      await c.f.whenStable();
      expect(tabStops(c)).toEqual(['more']);
    });

    it('follows the density: comfortable controls need more room than normal ones', async () => {
      const c = await mount({}, 670);
      expect(button(c, 'more')).toBeNull();
      await c.set(() => c.h.options.update(o => ({ ...o, density: 'comfortable' })));
      expect(button(c, 'more')).not.toBeNull();
      expect(c.host.style.getPropertyValue('--gantry-control-size')).toBe('36px');
    });
  });

  describe('the menu', () => {
    it('opens on a click as the toolbar child after More, focused on the checked item', async () => {
      const c = await mount({}, 600);
      const more = button(c, 'more')!;
      more.focus();
      const m = await openMenu(c);
      expect(m.parentElement).toBe(c.$('.gantt-toolbar'));
      expect(m.previousElementSibling).toBe(more.parentElement);
      expect(m.getAttribute('role')).toBe('menu');
      expect(m.getAttribute('aria-label')).toBe(DEFAULT_LABELS.more);
      expect(m.id).toMatch(/^gantry-\d+-tb-menu$/);
      expect(more.getAttribute('aria-expanded')).toBe('true');
      expect(more.getAttribute('aria-controls')).toBe(m.id);
      expect(c.toolbar().open()).toBe(true);

      const groups = [...m.children] as HTMLElement[];
      expect(groups.map(g => [g.getAttribute('class'), g.getAttribute('role'), g.getAttribute('aria-label')])).toEqual([
        ['gantt-tb-menu-group', 'group', DEFAULT_LABELS.ariaZoomLevels],
      ]);
      expect(menuKeys(c)).toEqual(LEVELS.map(k => `menu:${k}`));
      for (const item of c.$$('.gantt-tb-menu-item')) {
        expect(item.parentElement).toBe(groups[0]);
        expect(item.tagName).toBe('BUTTON');
        expect(item.getAttribute('type')).toBe('button');
        expect(item.getAttribute('role')).toBe('menuitemradio');
        expect(item.getAttribute('tabindex')).toBe('-1');
        expect(item.querySelector('svg')).toBeNull();
        expect(item.children).toHaveLength(1);
        expect(item.firstElementChild!.getAttribute('class')).toBe('gantt-tb-label');
      }
      const checked = c.$$('.gantt-tb-menu-item').map(b => b.getAttribute('aria-checked'));
      expect(checked).toEqual(['false', 'false', 'false', 'true', 'false', 'false']);
      expect(button(c, 'menu:zoom:Month')!.textContent).toBe(DEFAULT_LABELS.viewModes.Month);
      // Focus on the checked item; More stands for the menu in the roving set
      expect(active()).toBe('menu:zoom:Month');
      await c.f.whenStable();
      expect(tabStops(c)).toEqual(['more']);
    });

    it('a click on More while open closes it back to More', async () => {
      const c = await mount({}, 600);
      await openMenu(c);
      await c.set(() => button(c, 'more')!.click());
      expect(menu(c)).toBeNull();
      expect(active()).toBe('more');
      expect(button(c, 'more')!.getAttribute('aria-expanded')).toBe('false');
      expect(button(c, 'more')!.hasAttribute('aria-controls')).toBe(false);
    });

    it('lists the moved groups in toolbar order: levels, today (a menuitem), views (icons and names)', async () => {
      const c = await mount({}, 200);
      const m = await openMenu(c);
      expect([...m.children].map(g => g.getAttribute('aria-label'))).toEqual([
        DEFAULT_LABELS.ariaZoomLevels,
        null,
        DEFAULT_LABELS.ariaViews,
      ]);
      expect(menuKeys(c)).toEqual([
        ...LEVELS.map(k => `menu:${k}`),
        'menu:today',
        'menu:view:split',
        'menu:view:table',
        'menu:view:chart',
      ]);
      const today = button(c, 'menu:today')!;
      expect(today.getAttribute('role')).toBe('menuitem');
      expect(today.hasAttribute('aria-checked')).toBe(false);
      expect(today.textContent).toBe(DEFAULT_LABELS.todayButton);
      const table = button(c, 'menu:view:table')!;
      expect(table.getAttribute('role')).toBe('menuitemradio');
      expect(table.getAttribute('aria-checked')).toBe('false');
      expect(button(c, 'menu:view:split')!.getAttribute('aria-checked')).toBe('true');
      expect([...table.children].map(e => e.getAttribute('class'))).toEqual(['gantt-tb-icon', 'gantt-tb-label']);
      expect(iconPaths(table)).toEqual(TOOLBAR_ICONS.viewTable);
      expect(table.textContent).toBe(DEFAULT_LABELS.viewTable);
    });

    it('a click on an item runs its action and closes back to More', async () => {
      const c = await mount({}, 200);
      await openMenu(c);
      await c.set(() => button(c, 'menu:zoom:Week')!.click());
      expect(c.gantt.viewMode()).toBe('Week');
      expect(menu(c)).toBeNull();
      expect(active()).toBe('more');

      await openMenu(c);
      expect(active()).toBe('menu:zoom:Week');
      expect(button(c, 'menu:zoom:Week')!.getAttribute('aria-checked')).toBe('true');
      await c.set(() => button(c, 'menu:view:table')!.click());
      expect(c.gantt.view()).toBe('table');
      expect(menu(c)).toBeNull();

      const today = vi.spyOn(c.gantt, 'scrollToToday').mockImplementation(() => undefined);
      await openMenu(c);
      button(c, 'menu:today')!.click();
      expect(today).toHaveBeenCalledOnce();
    });

    it('keys on More: ↓ opens on the checked item, ↑ on the last; Enter / Space stay native', async () => {
      const c = await mount({}, 200);
      const more = button(c, 'more')!;
      more.focus();
      expect(key(more, 'ArrowDown')).toBe(true);
      await c.f.whenStable();
      expect(active()).toBe('menu:zoom:Month');
      expect(key(button(c, 'menu:zoom:Month')!, 'Escape')).toBe(true);
      await c.f.whenStable();
      expect(menu(c)).toBeNull();
      expect(active()).toBe('more');

      expect(key(more, 'ArrowUp')).toBe(true);
      await c.f.whenStable();
      expect(active()).toBe('menu:view:chart');
      key(button(c, 'menu:view:chart')!, 'Escape');
      await c.f.whenStable();

      // Enter / Space activate the button natively (a click): not handled as keys
      expect(key(more, 'Enter')).toBe(false);
      expect(key(more, ' ')).toBe(false);
      expect(key(more, 'ArrowDown', { shiftKey: true })).toBe(false);
      await c.f.whenStable();
      expect(menu(c)).toBeNull();
    });

    it('keys in the menu: ↓/↑ wrap, Home / End, ←/→ do nothing', async () => {
      const c = await mount({}, 350);
      const more = button(c, 'more')!;
      more.focus();
      key(more, 'ArrowDown');
      await c.f.whenStable();
      const order = menuKeys(c);
      expect(order).toEqual([...LEVELS.map(k => `menu:${k}`), 'menu:view:split', 'menu:view:table', 'menu:view:chart']);
      const at = () => order.indexOf(active() ?? null);
      expect(at()).toBe(3);
      const step = (k: string) => {
        expect(key(document.activeElement!, k), k).toBe(true);
        return at();
      };
      expect(step('ArrowDown')).toBe(4);
      expect(step('End')).toBe(order.length - 1);
      expect(step('ArrowDown')).toBe(0);
      expect(step('ArrowUp')).toBe(order.length - 1);
      expect(step('Home')).toBe(0);
      expect(key(document.activeElement!, 'ArrowRight')).toBe(false);
      expect(key(document.activeElement!, 'ArrowLeft')).toBe(false);
      expect(at()).toBe(0);
      // A pointer focus makes an item the active one: arrows move from there
      button(c, 'menu:view:split')!.focus();
      expect(step('ArrowDown')).toBe(order.indexOf('menu:view:table'));
      // Moving never activates
      await c.f.whenStable();
      expect(c.gantt.viewMode()).toBeUndefined();
      expect(c.gantt.view()).toBe('split');
    });

    it('Esc closes it back to More and does not clear the selection; Tab closes it and moves on', async () => {
      const c = await mount({}, 600);
      await c.set(() => c.gantt.setSelectedTasks(['t0']));
      await openMenu(c);
      expect(key(document.activeElement!, 'Escape')).toBe(true);
      await c.f.whenStable();
      expect(menu(c)).toBeNull();
      expect(active()).toBe('more');
      expect(c.gantt.getSelectedTasks().map(t => t.id)).toEqual(['t0']);

      await openMenu(c);
      // Tab is not prevented: the browser moves focus on
      expect(key(document.activeElement!, 'Tab')).toBe(false);
      expect(c.toolbar().open()).toBe(false);
      await c.f.whenStable();
      expect(menu(c)).toBeNull();
      // More itself, menu open: Esc closes it too
      await openMenu(c);
      button(c, 'more')!.focus();
      expect(key(button(c, 'more')!, 'Escape')).toBe(true);
      expect(c.toolbar().open()).toBe(false);
      await c.f.whenStable();
      expect(c.gantt.getSelectedTasks().map(t => t.id)).toEqual(['t0']);
    });

    it('a press outside the menu and More closes it; a press inside does not', async () => {
      const c = await mount({}, 600);
      const listener = await outsideListener(c);
      expect(listener.added).toBe(true);
      press(button(c, 'menu:zoom:Day')!);
      press(button(c, 'more')!);
      expect(c.toolbar().open()).toBe(true);
      press(document.body);
      expect(c.toolbar().open()).toBe(false);
      await c.f.whenStable();
      expect(listener.removed()).toBe(true);
      expect(menu(c)).toBeNull();
      // A browser moves focus where the press lands; a press that leaves it on the removed item
      // (happy-dom moves none) hands it to the toolbar's tab stop, More
      expect(active()).toBe('more');
    });

    it('a resize closes it; a focused item that goes away hands focus to the toolbar tab stop', async () => {
      const c = await mount({}, 600);
      await openMenu(c);
      expect(active()).toBe('menu:zoom:Month');
      // Still too narrow: closed, focus back on More (the tab stop)
      await c.resize(580);
      expect(menu(c)).toBeNull();
      expect(c.toolbar().open()).toBe(false);
      expect(active()).toBe('more');

      // Wide again: More goes too, focus moves to the toolbar's first control
      await openMenu(c);
      await c.resize(1150);
      expect(button(c, 'more')).toBeNull();
      expect(active()).toBe('zoom-out');
      expect(tabStops(c)).toEqual(['zoom-out']);
      // A height-only measurement keeps it open
      await c.resize(600);
      await openMenu(c);
      observe(c.main);
      await c.f.whenStable();
      expect(menu(c)).not.toBeNull();
    });

    it('closes with the chart: the document listener goes when it is destroyed', async () => {
      const c = await mount({}, 600);
      const listener = await outsideListener(c);
      expect(listener.added).toBe(true);
      c.f.destroy();
      expect(listener.removed()).toBe(true);
    });

    it('hides the menu with the toolbar; shown again, it starts closed', async () => {
      const c = await mount({}, 600);
      const listener = await outsideListener(c);
      await c.set(() => c.h.showToolbar.set(false));
      expect(c.$('.gantt-toolbar')).toBeNull();
      expect(menu(c)).toBeNull();
      expect(listener.removed()).toBe(true);
      await c.set(() => c.h.showToolbar.set(true));
      expect(menu(c)).toBeNull();
      expect(button(c, 'more')!.getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('the legend in the toolbar', () => {
    const annotations: GanttAnnotation[] = [{ x1: new Date(2026, 2, 5), label: { text: 'Kickoff' } }];
    const legendOf = (c: Chart) => c.$('.gantt-toolbar > .gantt-legend--toolbar');

    /** A chart with the legend in its toolbar, `legendWidth` px wide once observed. */
    async function withLegend(width: number, legendWidth: number): Promise<Chart> {
      const c = await mount({ legend: { position: 'toolbar' } }, width, h => {
        h.annotations.set(annotations);
        h.showLegend.set(true);
      });
      const legend = legendOf(c)!;
      Object.defineProperty(legend, 'offsetWidth', { configurable: true, get: () => legendWidth });
      observe(legend);
      await c.f.whenStable();
      return c;
    }

    it('takes its width (and the gap before it) from the groups', async () => {
      let c = await withLegend(1150, 300);
      expect(button(c, 'more')).toBeNull();
      c = await withLegend(1150, 600);
      expect(keys(c).at(-1)).toBe('more');
      expect(keys(c)).not.toContain('zoom:Month');
      // The legend stays the toolbar's last child, after the menu
      await openMenu(c);
      const legend = legendOf(c)!;
      expect(c.$('.gantt-toolbar')!.lastElementChild).toBe(legend);
      expect(legend.previousElementSibling).toBe(menu(c));
    });

    it('takes nothing when it is too wide to share a line even with the shortest toolbar (it wraps)', async () => {
      const c = await withLegend(1150, 1100);
      expect(keys(c)).toEqual(PHASE9_KEYS);
    });

    it('is observed only while it sits in the toolbar', async () => {
      const c = await mount({}, 1150, h => {
        h.annotations.set(annotations);
        h.showLegend.set(true);
      });
      const watched = (el: Element | null) => el !== null && observers.some(o => o.targets.includes(el));
      expect(legendOf(c)).toBeNull();
      await c.set(() => c.h.options.update(o => ({ ...o, legend: { position: 'toolbar' } })));
      const legend = legendOf(c);
      expect(watched(legend)).toBe(true);
      await c.set(() => c.h.options.update(o => ({ ...o, legend: { position: 'bottom' } })));
      expect(legendOf(c)).toBeNull();
      expect(watched(legend)).toBe(false);
    });
  });

  describe('the [ganttToolbar] slot (Angular only)', () => {
    it('takes its border box (separator included) and the gap after it from the groups', async () => {
      const c = await mount({}, 1150, h => h.slot.set(true));
      const slot = c.$('.gantt-tb-slot')!;
      let slotWidth = 300;
      Object.defineProperty(slot, 'offsetWidth', { configurable: true, get: () => slotWidth });
      observe(slot);
      await c.f.whenStable();
      expect(button(c, 'more')).toBeNull();
      slotWidth = 600;
      observe(slot);
      await c.f.whenStable();
      expect(keys(c).at(-1)).toBe('more');
      expect(keys(c)).not.toContain('zoom:Month');
      // The slot stays outside the roving set and the menu, before the trailing groups
      expect(slot.nextElementSibling?.classList.contains('gantt-tb-views')).toBe(true);
      const m = await openMenu(c);
      expect(m.querySelector('.consumer')).toBeNull();
      expect(slot.querySelector('.consumer')).not.toBeNull();
    });

    it('is measured only once the chart has a width, and never with overflow: wrap', async () => {
      const slotWatched = (c: Chart) => observers.some(o => o.targets.includes(c.$('.gantt-tb-slot')!));
      let c = await mount({}, 0);
      expect(slotWatched(c)).toBe(false);
      await c.resize(800);
      expect(slotWatched(c)).toBe(true);
      await c.resize(0);
      expect(slotWatched(c)).toBe(false);
      c = await mount({ toolbar: { overflow: 'wrap' } }, 800);
      expect(slotWatched(c)).toBe(false);
    });
  });

  it('styles: menu under the toolbar end, control size variable, checked items and the pressed toggle', () => {
    const css = (getComponentDef(GanttToolbarComponent)?.styles ?? [])
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Forced colours apart
      .replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    const norm = (sel: string) =>
      sel
        .replace(/\[_ng(content|host)-[^\]]+\]/g, '')
        .replace(/=["']([^"'\]]*)["']\]/g, '=$1]')
        .replace(/\s+/g, ' ')
        .trim();
    const rule = (selector: string) =>
      [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, sel]) => sel.split(',').map(norm).includes(selector))
        // The compiler namespaces custom properties (`--%NS%gantt-bar`)
        .map(([, , body]) => body.replace(/\s+/g, '').replace(/%NS%/g, ''))
        .join(';');
    expect(rule('.gantt-toolbar')).toContain('position:relative;');
    const menuRule = rule('.gantt-tb-menu');
    for (const decl of ['position:absolute;', 'top:100%;', 'inset-inline-end:8px;', 'z-index:14;'])
      expect(menuRule).toContain(decl);
    expect(rule('.gantt-tb-menu-item')).toContain('min-height:var(--gantry-control-size,32px);');
    expect(rule('.gantt-tb-btn')).toContain('min-width:var(--gantry-control-size,32px);');
    expect(rule('.gantt-tb-menu-item:focus-visible')).toContain('var(--gantt-focus-ring)');
    expect(rule('.gantt-tb-menu-item[aria-checked=true]')).toContain('background:var(--gantt-bar);');
    expect(rule('.gantt-tb-btn[aria-pressed=true]')).toContain('border-color:var(--gantt-bar);');
    expect(rule('.gantt-tb-views + .gantt-tb-more-group')).toContain('margin-left:0;');
    expect(rule('.gantt-tb-more-group ~ .gantt-legend--toolbar')).toContain('margin-left:0;');
  });
});
