// Phase 12 step 3.3 — the toolbar's Export menu (`toolbar.export`, D16, plan §3d/§3e): the export
// group and its menu button, the Export menu (the More menu's painter, right after its group,
// one menu at a time), its keys and focus (core `reduceMenu` / `toolbarMenuKey`), the formats
// as a More section once the group has moved, the items running `ctx.runExport(format,
// 'toolbar')` after focus is back on the button, the closing rules, and the print and
// forced-colours CSS (D17).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_LABELS, TOOLBAR_ICONS, ViewMode, type GanttOptions, type GanttTask } from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { BASE_CSS } from '../styles/base';
import { PRINT_CSS } from '../styles/print.css';
import { FORCED_COLORS_CSS } from '../styles/forced-colors.css';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();

function plan(n: number): GanttTask[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Task ${i}`,
    start: new Date(2026, 2, 2 + i),
    end: new Date(2026, 2, 9 + i),
    progress: 40,
  }));
}

// ── A ResizeObserver the test drives (the panes' width) ──
let observers: { cb: () => void; targets: Element[] }[] = [];
const widths = new WeakMap<Element, number>();

function resize(el: GantryElement, width: number): void {
  const { dom } = getEngine(el);
  widths.set(dom.main, width);
  for (const o of observers) if (o.targets.includes(dom.main)) o.cb();
  flush(el);
}

const EXPORT_ON: GanttOptions = { toolbar: { export: true } };

/** A chart `width` px wide (responsive off: the toolbar alone is under test). */
function mount(options: GanttOptions = EXPORT_ON, width = 1600): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  el.tasks = plan(3);
  el.options = { viewMode: ViewMode.Month, initialScroll: false, responsive: false, ...options };
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
const keys = (el: GantryElement) => $$(el, '.gantt-toolbar > .gantt-tb-group > button').map(b => b.dataset['focusKey']);
const groupClasses = (el: GantryElement) => $$(el, '.gantt-toolbar > .gantt-tb-group').map(g => g.className);
const menuKeys = (el: GantryElement) => $$(el, '.gantt-tb-menu-item').map(b => b.dataset['focusKey']);
const active = (el: GantryElement) => (el.shadowRoot!.activeElement as HTMLElement | null)?.dataset['focusKey'];
const tabStops = (el: GantryElement) => $$(el, '.gantt-toolbar button[tabindex="0"]').map(b => b.dataset['focusKey']);
const menu = (el: GantryElement) => $(el, '.gantt-tb-menu');
const open = (el: GantryElement) => {
  const { menuOpen, exportMenuOpen } = getEngine(el).inputs;
  return { more: menuOpen(), export: exportMenuOpen() };
};

function key(target: Element, k: string, init: KeyboardEventInit = {}): boolean {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e.defaultPrevented;
}
function press(target: EventTarget): void {
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, cancelable: true }));
}

/** Opens the Export menu with a click and runs the frame that paints it. */
function openExport(el: GantryElement): HTMLElement {
  button(el, 'export')!.click();
  flush(el);
  return menu(el)!;
}

/** Spies on the toolbar's export runner; records where focus was when it ran. */
function spyRun(el: GantryElement) {
  const at: (string | undefined)[] = [];
  const spy = vi.spyOn(getEngine(el).ctx, 'runExport').mockImplementation(() => {
    at.push(active(el));
    return Promise.resolve(true);
  });
  return { spy, at };
}

/** The narrowest width (in steps of 10 px) at which the export group still shows. */
function fitWidth(el: GantryElement): number {
  let lo = 300;
  let hi = 2000;
  while (hi - lo > 10) {
    const mid = Math.round((lo + hi) / 2);
    resize(el, mid);
    if (button(el, 'export')) hi = mid;
    else lo = mid;
  }
  resize(el, hi);
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

describe('toolbar Export menu (Phase 12 step 3.3)', () => {
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

  describe('off (the default)', () => {
    it('builds no export group: the toolbar is the one without the option', () => {
      el = mount({}, 1150);
      const before = $(el, '.gantry-toolbar-container')!.outerHTML;
      expect($(el, '.gantt-tb-export-group')).toBeNull();
      expect(button(el, 'export')).toBeNull();
      el.remove();
      el = mount({ toolbar: { export: false }, export: { formats: ['csv'] } }, 1150);
      expect($(el, '.gantry-toolbar-container')!.outerHTML).toBe(before);
      expect(open(el)).toEqual({ more: false, export: false });
    });

    it('builds no export group without a format', () => {
      el = mount({ toolbar: { export: true }, export: { formats: [] } });
      expect(button(el, 'export')).toBeNull();
      expect(groupClasses(el)).not.toContain('gantt-tb-group gantt-tb-export-group');
    });
  });

  describe('the export group', () => {
    it('comes last, after the views: one icon menu button named by labels.exportMenu', () => {
      el = mount();
      expect(groupClasses(el).at(-1)).toBe('gantt-tb-group gantt-tb-export-group');
      expect(groupClasses(el).at(-2)).toBe('gantt-tb-group gantt-tb-pills gantt-tb-views');
      expect(keys(el).slice(-2)).toEqual(['view:chart', 'export']);
      const group = $(el, '.gantt-tb-export-group')!;
      expect(group.getAttribute('role')).toBeNull();
      expect(group.getAttribute('aria-label')).toBeNull();
      const b = button(el, 'export')!;
      expect(b.parentElement).toBe(group);
      expect(group.children).toHaveLength(1);
      expect(b.className).toBe('gantt-tb-btn gantt-tb-export');
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
      expect(b.textContent).toBe('');
      expect(menu(el)).toBeNull();
    });

    it('is part of the roving set: ←/→ reach it and wrap', () => {
      el = mount();
      button(el, 'view:chart')!.focus();
      expect(key(button(el, 'view:chart')!, 'ArrowRight')).toBe(true);
      expect(active(el)).toBe('export');
      expect(key(button(el, 'export')!, 'ArrowRight')).toBe(true);
      expect(active(el)).toBe('zoom-out');
      expect(key(button(el, 'zoom-out')!, 'ArrowLeft')).toBe(true);
      expect(active(el)).toBe('export');
      flush(el);
      expect(tabStops(el)).toEqual(['export']);
    });
  });

  describe('the menu', () => {
    it('opens on a click right after the export group, named, on its first item', () => {
      el = mount();
      const b = button(el, 'export')!;
      b.focus();
      const m = openExport(el);
      expect(m.parentElement).toBe($(el, '.gantt-toolbar'));
      expect(m.previousElementSibling).toBe(b.parentElement);
      expect(m.getAttribute('role')).toBe('menu');
      expect(m.getAttribute('aria-label')).toBe(DEFAULT_LABELS.exportMenu);
      expect(m.id).toBeTruthy();
      expect(b.getAttribute('aria-expanded')).toBe('true');
      expect(b.getAttribute('aria-controls')).toBe(m.id);
      expect(open(el)).toEqual({ more: false, export: true });

      const sections = [...m.children] as HTMLElement[];
      expect(sections.map(s => [s.className, s.getAttribute('role'), s.hasAttribute('aria-label')])).toEqual([
        ['gantt-tb-menu-group', 'group', false],
      ]);
      expect(menuKeys(el)).toEqual(ITEM_KEYS);
      for (const item of $$(el, '.gantt-tb-menu-item')) {
        expect(item.parentElement).toBe(sections[0]);
        expect(item.getAttribute('type')).toBe('button');
        expect(item.getAttribute('role')).toBe('menuitem');
        expect(item.hasAttribute('aria-checked')).toBe(false);
        expect(item.getAttribute('tabindex')).toBe('-1');
        expect(item.querySelector('svg')).toBeNull();
        expect([...item.children].map(c => c.className)).toEqual(['gantt-tb-label']);
      }
      expect($$(el, '.gantt-tb-menu-item').map(i => i.textContent)).toEqual(FORMAT_LABELS);
      // Nothing is checked: the first item; Export stands for the menu in the roving set
      expect(active(el)).toBe('menu:export:svg');
      flush(el);
      expect(tabStops(el)).toEqual(['export']);
    });

    it('lists export.formats in their order', () => {
      el = mount({ toolbar: { export: true }, export: { formats: ['csv', 'print'] } });
      openExport(el);
      expect(menuKeys(el)).toEqual(['menu:export:csv', 'menu:export:print']);
      expect($$(el, '.gantt-tb-menu-item').map(i => i.textContent)).toEqual([
        DEFAULT_LABELS.exportCsv,
        DEFAULT_LABELS.exportPrint,
      ]);
    });

    it('a click on Export while open closes it back to Export', () => {
      el = mount();
      openExport(el);
      button(el, 'export')!.click();
      flush(el);
      expect(menu(el)).toBeNull();
      expect(active(el)).toBe('export');
      expect(button(el, 'export')!.getAttribute('aria-expanded')).toBe('false');
      expect(button(el, 'export')!.hasAttribute('aria-controls')).toBe(false);
    });

    it('an item closes the menu back to Export, then runs the export from the toolbar', () => {
      el = mount();
      const { spy, at } = spyRun(el);
      openExport(el);
      button(el, 'menu:export:png')!.click();
      expect(spy).toHaveBeenCalledExactlyOnceWith('png', 'toolbar');
      // Focus was back on Export when the export started
      expect(at).toEqual(['export']);
      expect(open(el)).toEqual({ more: false, export: false });
      flush(el);
      expect(menu(el)).toBeNull();

      openExport(el);
      button(el, 'menu:export:print')!.click();
      expect(spy).toHaveBeenLastCalledWith('print', 'toolbar');
      expect(at).toEqual(['export', 'export']);
    });

    it('keys on Export: ↓ opens on the first item, ↑ on the last; Enter / Space stay native', () => {
      el = mount();
      const b = button(el, 'export')!;
      b.focus();
      expect(key(b, 'ArrowDown')).toBe(true);
      flush(el);
      expect(active(el)).toBe('menu:export:svg');
      expect(key(button(el, 'menu:export:svg')!, 'Escape')).toBe(true);
      flush(el);
      expect(menu(el)).toBeNull();
      expect(active(el)).toBe('export');

      expect(key(b, 'ArrowUp')).toBe(true);
      flush(el);
      expect(active(el)).toBe('menu:export:print');
      key(button(el, 'menu:export:print')!, 'Escape');
      flush(el);

      expect(key(b, 'Enter')).toBe(false);
      expect(key(b, ' ')).toBe(false);
      expect(key(b, 'ArrowDown', { ctrlKey: true })).toBe(false);
      expect(menu(el)).toBeNull();
    });

    it('keys in the menu: ↓/↑ wrap, Home / End; a pointer focus moves the active item; End then a click prints', () => {
      el = mount();
      const { spy } = spyRun(el);
      const b = button(el, 'export')!;
      b.focus();
      key(b, 'ArrowDown');
      flush(el);
      const at = () => ITEM_KEYS.indexOf(active(el)!);
      const step = (k: string) => {
        expect(key(el.shadowRoot!.activeElement!, k), k).toBe(true);
        return at();
      };
      expect(at()).toBe(0);
      expect(step('ArrowDown')).toBe(1);
      expect(step('End')).toBe(3);
      expect(step('ArrowDown')).toBe(0);
      expect(step('ArrowUp')).toBe(3);
      expect(step('Home')).toBe(0);
      expect(key(el.shadowRoot!.activeElement!, 'ArrowRight')).toBe(false);
      button(el, 'menu:export:png')!.focus();
      expect(step('ArrowDown')).toBe(2);
      // Moving never runs an export
      expect(spy).not.toHaveBeenCalled();
      step('End');
      (el.shadowRoot!.activeElement as HTMLElement).click();
      expect(spy).toHaveBeenCalledExactlyOnceWith('print', 'toolbar');
      expect(active(el)).toBe('export');
    });

    it('Esc closes it back to Export without clearing the selection; Tab closes it and moves on', () => {
      el = mount();
      el.setSelectedTasks(['t0']);
      openExport(el);
      expect(key(el.shadowRoot!.activeElement!, 'Escape')).toBe(true);
      flush(el);
      expect(menu(el)).toBeNull();
      expect(active(el)).toBe('export');
      expect(el.getSelectedTasks().map(t => t.id)).toEqual(['t0']);

      openExport(el);
      expect(key(el.shadowRoot!.activeElement!, 'Tab')).toBe(false);
      expect(open(el).export).toBe(false);
      flush(el);
      expect(menu(el)).toBeNull();
      // Export itself, menu open: Esc closes it too
      openExport(el);
      button(el, 'export')!.focus();
      expect(key(button(el, 'export')!, 'Escape')).toBe(true);
      expect(open(el).export).toBe(false);
      expect(el.getSelectedTasks().map(t => t.id)).toEqual(['t0']);
    });

    it("toolbar.overflow: 'wrap' keeps the group at any width; the menu still follows it", () => {
      el = mount({ toolbar: { export: true, overflow: 'wrap' } }, 200);
      expect(button(el, 'more')).toBeNull();
      const m = openExport(el);
      expect(m.previousElementSibling).toBe(button(el, 'export')!.parentElement);
      expect(menuKeys(el)).toEqual(ITEM_KEYS);
    });
  });

  describe('narrow: the formats as a More section', () => {
    it('moves first into More, as a section named labels.exportMenu (never a nested menu)', () => {
      el = mount(EXPORT_ON, 600);
      expect(button(el, 'export')).toBeNull();
      expect($(el, '.gantt-tb-export-group')).toBeNull();
      expect(keys(el).at(-1)).toBe('more');
      button(el, 'more')!.click();
      flush(el);
      expect(open(el)).toEqual({ more: true, export: false });
      const m = menu(el)!;
      expect(m.getAttribute('aria-label')).toBe(DEFAULT_LABELS.more);
      expect(m.previousElementSibling).toBe(button(el, 'more')!.parentElement);
      const section = [...m.children].find(s => s.getAttribute('aria-label') === DEFAULT_LABELS.exportMenu)!;
      expect(section).toBeTruthy();
      expect(m.lastElementChild).toBe(section);
      expect([...section.children].map(i => (i as HTMLElement).dataset['focusKey'])).toEqual(ITEM_KEYS);
      expect([...section.children].map(i => i.getAttribute('role'))).toEqual(FORMATS.map(() => 'menuitem'));
      expect(menuKeys(el)).not.toContain('menu:export');
      expect($$(el, '.gantt-tb-menu')).toHaveLength(1);
    });

    it('a format chosen in More closes it back to More, then runs the export', () => {
      el = mount(EXPORT_ON, 600);
      const { spy, at } = spyRun(el);
      const more = button(el, 'more')!;
      more.focus();
      expect(key(more, 'ArrowUp')).toBe(true);
      flush(el);
      expect(active(el)).toBe('menu:export:print');
      key(el.shadowRoot!.activeElement!, 'ArrowUp');
      expect(active(el)).toBe('menu:export:csv');
      button(el, 'menu:export:csv')!.click();
      expect(spy).toHaveBeenCalledExactlyOnceWith('csv', 'toolbar');
      expect(at).toEqual(['more']);
      expect(open(el)).toEqual({ more: false, export: false });
    });

    it('an open Export menu closes after the flush once its group moves into More without a resize', async () => {
      el = mount();
      const w = fitWidth(el);
      expect(button(el, 'export')).not.toBeNull();
      openExport(el);
      expect(active(el)).toBe('menu:export:svg');
      // Larger controls at the same width: the export group moves into More
      el.options = { ...el.options, density: 'comfortable' };
      flush(el);
      expect(widths.get(getEngine(el).dom.main)).toBe(w);
      expect(button(el, 'export')).toBeNull();
      expect(menu(el)).toBeNull();
      // The focused item went away: focus on the toolbar's tab stop, not on the timeline
      expect(active(el)).toBe(tabStops(el)[0]);
      await Promise.resolve();
      expect(open(el)).toEqual({ more: false, export: false });
      expect(button(el, 'more')!.getAttribute('aria-expanded')).toBe('false');
      // Back to the normal density: the group comes back closed
      el.options = { ...el.options, density: 'normal' };
      flush(el);
      expect(button(el, 'export')!.getAttribute('aria-expanded')).toBe('false');
      expect(menu(el)).toBeNull();
    });
  });

  describe('closing rules', () => {
    it('a press outside the menu and Export closes it; a press inside does not', () => {
      el = mount();
      const add = vi.spyOn(document, 'addEventListener');
      const remove = vi.spyOn(document, 'removeEventListener');
      openExport(el);
      const added = add.mock.calls.filter(c => c[0] === 'pointerdown');
      expect(added).toHaveLength(1);
      expect((added[0][2] as AddEventListenerOptions).capture).toBe(true);
      press(button(el, 'menu:export:csv')!);
      press(button(el, 'export')!);
      expect(open(el).export).toBe(true);
      press(document.body);
      expect(open(el).export).toBe(false);
      expect(remove.mock.calls.some(c => c[0] === 'pointerdown' && c[1] === added[0][1])).toBe(true);
      flush(el);
      expect(menu(el)).toBeNull();
      expect(active(el)).toBe('export');
    });

    it('a width change closes it; focus on a removed item goes to the tab stop', () => {
      el = mount();
      openExport(el);
      resize(el, 1590);
      expect(open(el).export).toBe(false);
      expect(menu(el)).toBeNull();
      expect(active(el)).toBe('export');
      // Narrow: the Export button goes, its focus to the toolbar's tab stop
      resize(el, 600);
      expect(button(el, 'export')).toBeNull();
      expect(active(el)).toBe(tabStops(el)[0]);
      expect(active(el)).not.toBe('more');
    });

    it('closes with the toolbar and when the element disconnects; comes back closed', () => {
      el = mount();
      openExport(el);
      el.showToolbar = false;
      expect(open(el).export).toBe(false);
      flush(el);
      expect($(el, '.gantt-toolbar')).toBeNull();
      el.showToolbar = true;
      flush(el);
      expect(menu(el)).toBeNull();
      expect(button(el, 'export')!.getAttribute('aria-expanded')).toBe('false');

      openExport(el);
      el.options = { ...el.options, toolbar: false };
      expect(open(el).export).toBe(false);
      el.options = { ...el.options, toolbar: { export: true } };
      flush(el);
      expect(menu(el)).toBeNull();

      openExport(el);
      el.remove();
      expect(open(el).export).toBe(false);
      document.body.appendChild(el);
      flush(el);
      expect(menu(el)).toBeNull();
      expect(button(el, 'export')!.getAttribute('aria-expanded')).toBe('false');
    });

    it('options that keep the group keep the menu open', () => {
      el = mount();
      openExport(el);
      el.options = { ...el.options, criticalPath: true };
      flush(el);
      expect(menu(el)).not.toBeNull();
      expect(open(el).export).toBe(true);
    });
  });

  describe('styles', () => {
    const rule = (css: string, selector: string) => {
      const at = css.indexOf(`${selector} {`);
      return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
    };

    it('@media print: in the base sheet right before the forced colours, hiding the chrome', () => {
      expect(BASE_CSS.endsWith(PRINT_CSS + FORCED_COLORS_CSS)).toBe(true);
      expect(PRINT_CSS.trim().startsWith('@media print {')).toBe(true);
      const hidden = PRINT_CSS.slice(
        PRINT_CSS.indexOf('.gantry-toolbar-container'),
        PRINT_CSS.indexOf('{ display: none; }'),
      );
      expect(hidden.split(',').map(s => s.trim())).toEqual([
        '.gantry-toolbar-container',
        '.gantry-splitter',
        '.gantt-tl-load-more',
        '.gantt-sr-live',
        '.gantt-sr-alert',
        '.gantt-tooltip',
        '.gantt-drag-readout',
        '.gantt-bar-overlay',
        '.gantt-row-hover',
        '.gantt-drag-preview',
        '.gantt-link-preview',
      ]);
      expect(rule(PRINT_CSS, ':host, .gantry-wrapper')).toContain('print-color-adjust: exact;');
      const panes = rule(PRINT_CSS, '.gantry-panel, .gantry-canvas-viewport');
      expect(panes).toContain('overflow: hidden;');
      expect(panes).toContain('scrollbar-width: none;');
      expect(PRINT_CSS).not.toContain('`');
    });

    it('places Export at the far end; forced colours mark the open menu button', () => {
      expect(rule(BASE_CSS, '.gantt-tb-export-group')).toContain('margin-left: auto;');
      expect(rule(BASE_CSS, '.gantt-tb-views + .gantt-tb-export-group')).toContain('margin-left: 0;');
      expect(rule(BASE_CSS, '.gantt-tb-export-group ~ .gantt-legend--toolbar')).toContain('margin-left: 0;');
      const forced = rule(
        FORCED_COLORS_CSS,
        '.gantt-tb-more[aria-expanded="true"], .gantt-tb-export[aria-expanded="true"]',
      );
      expect(forced).toContain('border-color: Highlight !important;');
      expect(forced).toContain('color: Highlight !important;');
    });
  });
});
