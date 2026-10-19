// Phase 10 step 4.2 — the toolbar fitted to the chart's width (core `layoutToolbar`, D3): the
// panel toggle (D7), the More button and its menu (§3c: DOM, roles, names, focus, keys through
// core `reduceMenu` / `toolbarMenuKey`, outside press, resize), `toolbar.overflow: 'wrap'`, the
// density control size (D5) and the legend sitting in the toolbar. A toolbar that fits is the
// Phase 9 toolbar.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_LABELS,
  TOOLBAR_ICONS,
  ViewMode,
  type GanttAnnotation,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { BASE_CSS } from '../styles/base';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();

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

// ── A ResizeObserver the test drives: the element's (the panes) and the toolbar's (the legend) ──
interface FakeObserver {
  readonly cb: () => void;
  readonly targets: Element[];
}
let observers: FakeObserver[] = [];
/** `clientWidth` of each chart's `.gantry-main` */
const widths = new WeakMap<Element, number>();

/** Runs the observers watching `target`, as the browser does after a layout. */
function observe(target: Element): void {
  for (const o of observers) if (o.targets.includes(target)) o.cb();
}

/** The chart's width becomes `width` (the ResizeObserver fires), then a frame. */
function resize(el: GantryElement, width: number): void {
  const { dom } = getEngine(el);
  widths.set(dom.main, width);
  observe(dom.main);
  flush(el);
}

/** A chart `width` px wide (responsive off unless asked: the toolbar alone is under test). */
function mount(options: GanttOptions = {}, width = 1150, init?: (el: GantryElement) => void): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  el.tasks = plan(3);
  el.options = { viewMode: ViewMode.Month, initialScroll: false, responsive: false, ...options };
  init?.(el);
  const { dom } = getEngine(el);
  widths.set(dom.main, width);
  Object.defineProperty(dom.main, 'clientWidth', { configurable: true, get: () => widths.get(dom.main) ?? 0 });
  document.body.appendChild(el);
  flush(el);
  return el;
}

const $ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => [
  ...el.shadowRoot!.querySelectorAll<T>(sel),
];
const button = (el: GantryElement, key: string) => $<HTMLButtonElement>(el, `[data-focus-key="${key}"]`);
/** The toolbar's built-in controls (the roving set), in order */
const keys = (el: GantryElement) => $$(el, '.gantt-toolbar > .gantt-tb-group > button').map(b => b.dataset['focusKey']);
const groupClasses = (el: GantryElement) => $$(el, '.gantt-toolbar > .gantt-tb-group').map(g => g.className);
const menuKeys = (el: GantryElement) => $$(el, '.gantt-tb-menu-item').map(b => b.dataset['focusKey']);
const active = (el: GantryElement) => (el.shadowRoot!.activeElement as HTMLElement | null)?.dataset['focusKey'];
const tabStops = (el: GantryElement) => $$(el, '.gantt-toolbar button[tabindex="0"]').map(b => b.dataset['focusKey']);
const menu = (el: GantryElement) => $(el, '.gantt-tb-menu');

/** Dispatches a keydown on `target` the way a browser does (bubbling, cancelable); true when prevented. */
function key(target: Element, k: string, init: KeyboardEventInit = {}): boolean {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e.defaultPrevented;
}

/** A pointer press on `target` (composed: it crosses the shadow root). */
function press(target: EventTarget): void {
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, cancelable: true }));
}

/**
 * Opens the More menu and finds the document `pointerdown` listener it registered (capture
 * phase, only while open): `removed()` tells whether it was taken off again.
 */
function outsideListener(el: GantryElement): { added: boolean; removed: () => boolean } {
  const add = vi.spyOn(document, 'addEventListener');
  const remove = vi.spyOn(document, 'removeEventListener');
  openMenu(el);
  const calls = add.mock.calls.filter(c => c[0] === 'pointerdown');
  add.mockRestore();
  const fn = calls.at(-1)?.[1];
  return {
    added: calls.length === 1 && (calls[0][2] as AddEventListenerOptions | undefined)?.capture === true,
    removed: () => remove.mock.calls.some(c => c[0] === 'pointerdown' && c[1] === fn),
  };
}

/** Opens the More menu with a click and runs the frame that paints it. */
function openMenu(el: GantryElement): HTMLElement {
  button(el, 'more')!.click();
  flush(el);
  return menu(el)!;
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

describe('toolbar overflow, More menu and panel toggle (Phase 10 step 4.2)', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
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
        unobserve() {}
        disconnect() {
          observers = observers.filter(o => o !== this);
        }
      },
    );
  });
  afterEach(() => {
    el?.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('a toolbar that fits is the Phase 9 toolbar', () => {
    it.each([0, 1100, 1150])('at %i px: same groups, controls and attributes, no More, no menu', width => {
      el = mount({}, width);
      expect(groupClasses(el)).toEqual(PHASE9_GROUPS);
      expect(keys(el)).toEqual(PHASE9_KEYS);
      expect([...$(el, '.gantt-toolbar')!.children].map(c => c.className)).toEqual(PHASE9_GROUPS);
      expect(menu(el)).toBeNull();
      for (const attr of ['aria-pressed', 'aria-haspopup', 'aria-expanded', 'aria-controls'])
        expect($$(el, `.gantt-toolbar [${attr}]`), attr).toEqual([]);
      expect(getEngine(el).inputs.menuOpen()).toBe(false);
    });

    it("never builds a menu with toolbar.overflow: 'wrap' (the groups wrap)", () => {
      el = mount({ toolbar: { overflow: 'wrap' } }, 200);
      expect(keys(el)).toEqual(PHASE9_KEYS);
      expect(button(el, 'more')).toBeNull();
    });

    it('re-paints the toolbar on a resize only when its controls change', () => {
      el = mount({}, 1150);
      const runs = getEngine(el).regionRuns;
      const before = runs['toolbar'];
      resize(el, 1000);
      resize(el, 900);
      expect(runs['toolbar']).toBe(before);
      resize(el, 600);
      expect(runs['toolbar']).toBe(before + 1);
    });
  });

  describe('panel toggle (toolbar.panelToggle)', () => {
    it('is the first group: an aria-pressed icon button named by ariaTaskList, titled hide / show', () => {
      el = mount({ toolbar: { panelToggle: true } });
      const group = $(el, '.gantt-toolbar > .gantt-tb-group')!;
      expect(group.className).toBe('gantt-tb-group gantt-tb-panel-group');
      expect(group.getAttribute('role')).toBeNull();
      const b = button(el, 'panel')!;
      expect(b.parentElement).toBe(group);
      expect(b.className).toBe('gantt-tb-btn gantt-tb-panel');
      expect(b.getAttribute('type')).toBe('button');
      expect(b.getAttribute('aria-pressed')).toBe('true');
      expect(b.getAttribute('aria-label')).toBe(DEFAULT_LABELS.ariaTaskList);
      expect(b.getAttribute('title')).toBe(DEFAULT_LABELS.hidePanel);
      expect(b.hasAttribute('role')).toBe(false);
      expect(b.hasAttribute('aria-haspopup')).toBe(false);
      expect([...b.querySelectorAll('svg.gantt-tb-icon > path')].map(p => p.getAttribute('d'))).toEqual(
        TOOLBAR_ICONS.panel,
      );
      // The roving set starts with it
      expect(keys(el)).toEqual(['panel', ...PHASE9_KEYS]);
      expect(tabStops(el)).toEqual(['panel']);
    });

    it('runs togglePanel(): hides and shows the task list, pressed while it shows', () => {
      el = mount({ toolbar: { panelToggle: true } });
      const toggle = vi.spyOn(el, 'togglePanel');
      button(el, 'panel')!.click();
      flush(el);
      expect(toggle).toHaveBeenCalledOnce();
      expect(el.view).toBe('chart');
      const b = button(el, 'panel')!;
      expect(b.getAttribute('aria-pressed')).toBe('false');
      expect(b.getAttribute('title')).toBe(DEFAULT_LABELS.showPanel);
      b.click();
      flush(el);
      expect(el.view).toBe('split');
      expect(b.getAttribute('aria-pressed')).toBe('true');
    });

    it('in the table view it is pressed ("Hide task list"), and a press hides the task list: the chart view', () => {
      el = mount({ toolbar: { panelToggle: true }, view: 'table' });
      const b = button(el, 'panel')!;
      expect(b.getAttribute('aria-pressed')).toBe('true');
      expect(b.getAttribute('title')).toBe(DEFAULT_LABELS.hidePanel);
      b.click();
      flush(el);
      expect(el.view).toBe('chart');
      expect(b.getAttribute('aria-pressed')).toBe('false');
      expect(b.getAttribute('title')).toBe(DEFAULT_LABELS.showPanel);
      // togglePanel() follows the same rule (core togglePanelView)
      el.setView('table');
      el.togglePanel();
      expect(el.view).toBe('chart');
      el.togglePanel();
      expect(el.view).toBe('split');
    });

    it('stays in the toolbar however narrow, and keeps its node', () => {
      el = mount({ toolbar: { panelToggle: true } });
      const b = button(el, 'panel');
      resize(el, 150);
      expect(button(el, 'panel')).toBe(b);
      expect(keys(el)).toEqual(['panel', 'zoom-out', 'zoom-in', 'fit', 'more']);
    });
  });

  describe('More button (§3c)', () => {
    it('replaces the zoom levels, then the views, then today, as the chart narrows', () => {
      el = mount({}, 600);
      expect(groupClasses(el)).toEqual([
        'gantt-tb-group',
        'gantt-tb-group',
        'gantt-tb-group gantt-tb-pills gantt-tb-views',
        'gantt-tb-group gantt-tb-more-group',
      ]);
      expect(keys(el)).toEqual([
        'zoom-out',
        'zoom-in',
        'fit',
        'today',
        'view:split',
        'view:table',
        'view:chart',
        'more',
      ]);
      resize(el, 350);
      expect(keys(el)).toEqual(['zoom-out', 'zoom-in', 'fit', 'today', 'more']);
      resize(el, 200);
      expect(keys(el)).toEqual(['zoom-out', 'zoom-in', 'fit', 'more']);
      // Back: the controls come back as the same nodes
      const fit = button(el, 'fit');
      resize(el, 1150);
      expect(keys(el)).toEqual(PHASE9_KEYS);
      expect(button(el, 'fit')).toBe(fit);
      expect(button(el, 'more')).toBeNull();
    });

    it('is a collapsed menu button named More, in the roving set, with no aria-controls while closed', () => {
      el = mount({}, 600);
      const more = button(el, 'more')!;
      expect(more.className).toBe('gantt-tb-btn gantt-tb-more');
      expect(more.getAttribute('type')).toBe('button');
      expect(more.getAttribute('aria-haspopup')).toBe('menu');
      expect(more.getAttribute('aria-expanded')).toBe('false');
      expect(more.hasAttribute('aria-controls')).toBe(false);
      expect(more.hasAttribute('aria-pressed')).toBe(false);
      expect(more.getAttribute('aria-label')).toBe(DEFAULT_LABELS.more);
      expect(more.getAttribute('title')).toBe(DEFAULT_LABELS.more);
      expect([...more.querySelectorAll('svg.gantt-tb-icon > path')].map(p => p.getAttribute('d'))).toEqual(
        TOOLBAR_ICONS.more,
      );
      expect(menu(el)).toBeNull();
      // ←/→ reach it and wrap
      button(el, 'zoom-out')!.focus();
      expect(key(button(el, 'zoom-out')!, 'ArrowLeft')).toBe(true);
      expect(active(el)).toBe('more');
      flush(el);
      expect(tabStops(el)).toEqual(['more']);
    });

    it('follows the density: comfortable controls need more room than normal ones', () => {
      el = mount({}, 670);
      expect(button(el, 'more')).toBeNull();
      el.options = { ...el.options, density: 'comfortable' };
      flush(el);
      expect(button(el, 'more')).not.toBeNull();
      expect($(el, '.gantry-wrapper')!.style.getPropertyValue('--gantry-control-size')).toBe('36px');
    });
  });

  describe('the menu', () => {
    it('opens on a click as the toolbar child after More, focused on the checked item', () => {
      el = mount({}, 600);
      const more = button(el, 'more')!;
      more.focus();
      const m = openMenu(el);
      const bar = $(el, '.gantt-toolbar')!;
      expect(m.parentElement).toBe(bar);
      expect(m.previousElementSibling).toBe(more.parentElement);
      expect(m.getAttribute('role')).toBe('menu');
      expect(m.getAttribute('aria-label')).toBe(DEFAULT_LABELS.more);
      expect(m.id).toBeTruthy();
      expect(more.getAttribute('aria-expanded')).toBe('true');
      expect(more.getAttribute('aria-controls')).toBe(m.id);
      expect(getEngine(el).inputs.menuOpen()).toBe(true);

      const groups = [...m.children] as HTMLElement[];
      expect(groups.map(g => [g.className, g.getAttribute('role'), g.getAttribute('aria-label')])).toEqual([
        ['gantt-tb-menu-group', 'group', DEFAULT_LABELS.ariaZoomLevels],
      ]);
      expect(menuKeys(el)).toEqual(LEVELS.map(k => `menu:${k}`));
      for (const item of $$(el, '.gantt-tb-menu-item')) {
        expect(item.parentElement).toBe(groups[0]);
        expect(item.tagName).toBe('BUTTON');
        expect(item.getAttribute('type')).toBe('button');
        expect(item.getAttribute('role')).toBe('menuitemradio');
        expect(item.getAttribute('tabindex')).toBe('-1');
        expect(item.querySelector('svg')).toBeNull();
        expect(item.children).toHaveLength(1);
        expect(item.firstElementChild!.className).toBe('gantt-tb-label');
      }
      const checked = $$(el, '.gantt-tb-menu-item').map(b => b.getAttribute('aria-checked'));
      expect(checked).toEqual(['false', 'false', 'false', 'true', 'false', 'false']);
      expect(button(el, 'menu:zoom:Month')!.textContent).toBe(DEFAULT_LABELS.viewModes.Month);
      // Focus on the checked item; More stands for the menu in the roving set
      expect(active(el)).toBe('menu:zoom:Month');
      flush(el);
      expect(tabStops(el)).toEqual(['more']);
    });

    it('a click on More while open closes it back to More', () => {
      el = mount({}, 600);
      openMenu(el);
      button(el, 'more')!.click();
      flush(el);
      expect(menu(el)).toBeNull();
      expect(active(el)).toBe('more');
      expect(button(el, 'more')!.getAttribute('aria-expanded')).toBe('false');
      expect(button(el, 'more')!.hasAttribute('aria-controls')).toBe(false);
    });

    it('lists the moved groups in toolbar order: levels, today (a menuitem), views (icons and names)', () => {
      el = mount({}, 200);
      const m = openMenu(el);
      expect([...m.children].map(g => g.getAttribute('aria-label'))).toEqual([
        DEFAULT_LABELS.ariaZoomLevels,
        null,
        DEFAULT_LABELS.ariaViews,
      ]);
      expect(menuKeys(el)).toEqual([
        ...LEVELS.map(k => `menu:${k}`),
        'menu:today',
        'menu:view:split',
        'menu:view:table',
        'menu:view:chart',
      ]);
      const today = button(el, 'menu:today')!;
      expect(today.getAttribute('role')).toBe('menuitem');
      expect(today.hasAttribute('aria-checked')).toBe(false);
      expect(today.textContent).toBe(DEFAULT_LABELS.todayButton);
      const table = button(el, 'menu:view:table')!;
      expect(table.getAttribute('role')).toBe('menuitemradio');
      expect(table.getAttribute('aria-checked')).toBe('false');
      expect(button(el, 'menu:view:split')!.getAttribute('aria-checked')).toBe('true');
      expect([...table.children].map(c => c.getAttribute('class'))).toEqual(['gantt-tb-icon', 'gantt-tb-label']);
      expect([...table.querySelectorAll('path')].map(p => p.getAttribute('d'))).toEqual(TOOLBAR_ICONS.viewTable);
      expect(table.textContent).toBe(DEFAULT_LABELS.viewTable);
    });

    it('a click on an item runs its action and closes back to More', () => {
      el = mount({}, 200);
      openMenu(el);
      button(el, 'menu:zoom:Week')!.click();
      flush(el);
      expect(el.viewMode).toBe('Week');
      expect(menu(el)).toBeNull();
      expect(active(el)).toBe('more');

      openMenu(el);
      expect(active(el)).toBe('menu:zoom:Week');
      expect(button(el, 'menu:zoom:Week')!.getAttribute('aria-checked')).toBe('true');
      button(el, 'menu:view:table')!.click();
      flush(el);
      expect(el.view).toBe('table');
      expect(menu(el)).toBeNull();

      const today = vi.spyOn(el, 'scrollToToday');
      openMenu(el);
      button(el, 'menu:today')!.click();
      expect(today).toHaveBeenCalledOnce();
    });

    it('keys on More: ↓ opens on the checked item, ↑ on the last; Enter / Space stay native', () => {
      el = mount({}, 200);
      const more = button(el, 'more')!;
      more.focus();
      expect(key(more, 'ArrowDown')).toBe(true);
      flush(el);
      expect(active(el)).toBe('menu:zoom:Month');
      expect(key(button(el, 'menu:zoom:Month')!, 'Escape')).toBe(true);
      flush(el);
      expect(menu(el)).toBeNull();
      expect(active(el)).toBe('more');

      expect(key(more, 'ArrowUp')).toBe(true);
      flush(el);
      expect(active(el)).toBe('menu:view:chart');
      key(button(el, 'menu:view:chart')!, 'Escape');
      flush(el);

      // Enter / Space activate the button natively (a click): not handled as keys
      expect(key(more, 'Enter')).toBe(false);
      expect(key(more, ' ')).toBe(false);
      expect(key(more, 'ArrowDown', { shiftKey: true })).toBe(false);
      expect(menu(el)).toBeNull();
    });

    it('keys in the menu: ↓/↑ wrap, Home / End, ←/→ do nothing', () => {
      el = mount({}, 350);
      const more = button(el, 'more')!;
      more.focus();
      key(more, 'ArrowDown');
      flush(el);
      const order = menuKeys(el);
      expect(order).toEqual([...LEVELS.map(k => `menu:${k}`), 'menu:view:split', 'menu:view:table', 'menu:view:chart']);
      const at = () => order.indexOf(active(el));
      expect(at()).toBe(3);
      const step = (k: string) => {
        expect(key(el.shadowRoot!.activeElement!, k), k).toBe(true);
        return at();
      };
      expect(step('ArrowDown')).toBe(4);
      expect(step('End')).toBe(order.length - 1);
      expect(step('ArrowDown')).toBe(0);
      expect(step('ArrowUp')).toBe(order.length - 1);
      expect(step('Home')).toBe(0);
      expect(key(el.shadowRoot!.activeElement!, 'ArrowRight')).toBe(false);
      expect(key(el.shadowRoot!.activeElement!, 'ArrowLeft')).toBe(false);
      expect(at()).toBe(0);
      // A pointer focus makes an item the active one: arrows move from there
      button(el, 'menu:view:split')!.focus();
      expect(step('ArrowDown')).toBe(order.indexOf('menu:view:table'));
      // Moving never activates
      expect(el.viewMode).toBe('Month');
      expect(el.view).toBe('split');
    });

    it('Esc closes it back to More and does not clear the selection; Tab closes it and moves on', () => {
      el = mount({}, 600);
      el.setSelectedTasks(['t0']);
      openMenu(el);
      expect(key(el.shadowRoot!.activeElement!, 'Escape')).toBe(true);
      flush(el);
      expect(menu(el)).toBeNull();
      expect(active(el)).toBe('more');
      expect(el.getSelectedTasks().map(t => t.id)).toEqual(['t0']);

      openMenu(el);
      // Tab is not prevented: the browser moves focus on
      expect(key(el.shadowRoot!.activeElement!, 'Tab')).toBe(false);
      expect(getEngine(el).inputs.menuOpen()).toBe(false);
      flush(el);
      expect(menu(el)).toBeNull();
      // More itself, menu open: Esc closes it too
      openMenu(el);
      button(el, 'more')!.focus();
      expect(key(button(el, 'more')!, 'Escape')).toBe(true);
      expect(getEngine(el).inputs.menuOpen()).toBe(false);
      expect(el.getSelectedTasks().map(t => t.id)).toEqual(['t0']);
    });

    it('a press outside the menu and More closes it; a press inside does not', () => {
      el = mount({}, 600);
      const listener = outsideListener(el);
      expect(listener.added).toBe(true);
      press(button(el, 'menu:zoom:Day')!);
      press(button(el, 'more')!);
      expect(getEngine(el).inputs.menuOpen()).toBe(true);
      press(document.body);
      expect(getEngine(el).inputs.menuOpen()).toBe(false);
      expect(listener.removed()).toBe(true);
      flush(el);
      expect(menu(el)).toBeNull();
      // A browser moves focus where the press lands; a press that leaves it on the removed item
      // (happy-dom moves none) hands it to the toolbar's tab stop, More
      expect(active(el)).toBe('more');
    });

    it('a resize closes it; a focused item that goes away hands focus to the toolbar tab stop', () => {
      el = mount({}, 600);
      openMenu(el);
      expect(active(el)).toBe('menu:zoom:Month');
      // Still too narrow: closed, focus back on More (the tab stop)
      resize(el, 580);
      expect(menu(el)).toBeNull();
      expect(getEngine(el).inputs.menuOpen()).toBe(false);
      expect(active(el)).toBe('more');

      // Wide again: More goes too, focus moves to the toolbar's first control
      openMenu(el);
      resize(el, 1150);
      expect(button(el, 'more')).toBeNull();
      expect(active(el)).toBe('zoom-out');
      expect(tabStops(el)).toEqual(['zoom-out']);
      // A height-only measurement keeps it open
      resize(el, 600);
      openMenu(el);
      observe(getEngine(el).dom.main);
      flush(el);
      expect(menu(el)).not.toBeNull();
    });

    it('closes when the element disconnects and opens closed when it comes back', () => {
      el = mount({}, 600);
      const listener = outsideListener(el);
      el.remove();
      expect(getEngine(el).inputs.menuOpen()).toBe(false);
      expect(listener.removed()).toBe(true);
      document.body.appendChild(el);
      flush(el);
      expect(menu(el)).toBeNull();
      expect(button(el, 'more')!.getAttribute('aria-expanded')).toBe('false');
    });

    it('hides the menu with the toolbar', () => {
      el = mount({}, 600);
      openMenu(el);
      el.showToolbar = false;
      flush(el);
      expect($(el, '.gantt-toolbar')).toBeNull();
      expect(menu(el)).toBeNull();
    });

    it('closes when the toolbar goes away (showToolbar, toolbar: false) and comes back closed', () => {
      el = mount({}, 600);
      const { inputs } = getEngine(el);
      // showToolbar = false: closed at once, its document listener gone
      let listener = outsideListener(el);
      el.showToolbar = false;
      expect(inputs.menuOpen()).toBe(false);
      expect(listener.removed()).toBe(true);
      el.showToolbar = true;
      flush(el);
      expect($(el, '.gantt-toolbar')).not.toBeNull();
      expect(menu(el)).toBeNull();
      expect(button(el, 'more')!.getAttribute('aria-expanded')).toBe('false');

      // toolbar: false in the options, the same
      listener = outsideListener(el);
      const options = el.options;
      el.options = { ...options, toolbar: false };
      expect(inputs.menuOpen()).toBe(false);
      expect(listener.removed()).toBe(true);
      el.options = options;
      flush(el);
      expect(menu(el)).toBeNull();
      expect(button(el, 'more')!.getAttribute('aria-expanded')).toBe('false');

      // Options that keep the toolbar keep the menu open
      openMenu(el);
      el.options = { ...options, criticalPath: true };
      flush(el);
      expect(menu(el)).not.toBeNull();
    });
  });

  describe('the legend in the toolbar', () => {
    const annotations: GanttAnnotation[] = [{ x1: new Date(2026, 2, 5), label: { text: 'Kickoff' } }];

    /** A chart with the legend in its toolbar, `legendWidth` px wide once observed. */
    function withLegend(width: number, legendWidth: number): GantryElement {
      const chart = mount({ legend: { position: 'toolbar' } }, width, c => {
        c.annotations = annotations;
        c.showLegend = true;
      });
      const { dom } = getEngine(chart);
      Object.defineProperty(dom.legend, 'offsetWidth', { configurable: true, get: () => legendWidth });
      expect(dom.legend.parentElement).toBe($(chart, '.gantt-toolbar'));
      observe(dom.legend);
      flush(chart);
      return chart;
    }

    it('takes its width (and the gap before it) from the groups', () => {
      el = withLegend(1150, 300);
      expect(button(el, 'more')).toBeNull();
      el.remove();
      el = withLegend(1150, 600);
      expect(keys(el).at(-1)).toBe('more');
      expect(keys(el)).not.toContain('zoom:Month');
      // The legend stays the toolbar's last child, after the menu
      openMenu(el);
      const bar = $(el, '.gantt-toolbar')!;
      expect(bar.lastElementChild).toBe(getEngine(el).dom.legend);
      expect(getEngine(el).dom.legend.previousElementSibling).toBe(menu(el));
    });

    it('takes nothing when it is too wide to share a line even with the shortest toolbar (it wraps)', () => {
      el = withLegend(1150, 1100);
      expect(keys(el)).toEqual(PHASE9_KEYS);
    });

    it('is observed only while it may sit in the toolbar', () => {
      el = mount({}, 1150);
      const { dom } = getEngine(el);
      expect(observers.some(o => o.targets.includes(dom.legend))).toBe(false);
      el.options = { ...el.options, legend: { position: 'toolbar' } };
      flush(el);
      expect(observers.some(o => o.targets.includes(dom.legend))).toBe(true);
      el.options = { ...el.options, legend: { position: 'bottom' } };
      flush(el);
      expect(observers.some(o => o.targets.includes(dom.legend))).toBe(false);
    });
  });

  it('styles: menu under the toolbar end, control size variable, checked items and the pressed toggle', () => {
    const rule = (selector: string) => {
      const at = BASE_CSS.indexOf(`${selector} {`);
      return at < 0 ? '' : BASE_CSS.slice(at, BASE_CSS.indexOf('}', at));
    };
    expect(rule('.gantt-toolbar')).toContain('position: relative;');
    const menuRule = rule('.gantt-tb-menu');
    for (const decl of ['position: absolute;', 'top: 100%;', 'inset-inline-end: 8px;', 'z-index: 14;'])
      expect(menuRule).toContain(decl);
    expect(rule('.gantt-tb-menu-item')).toContain('min-height: var(--gantry-control-size, 32px);');
    expect(rule('.gantt-tb-menu-item:focus-visible')).toContain('var(--gantt-focus-ring)');
    expect(rule('.gantt-tb-menu-item[aria-checked="true"]')).toContain('background: var(--gantt-bar);');
    expect(rule('.gantt-tb-btn[aria-pressed="true"]')).toContain('border-color: var(--gantt-bar);');
  });
});
