// Phase 9 step 4.3 — the toolbar painted from core `buildToolbar()` (§3c of the plan): groups and
// controls in order with the shared classes, radiogroups of radios (`aria-checked`, checked on
// activation only), inline SVG icons, the Today label, one roving tab stop with ←/→ (wrap) and
// Home/End, the Fit button, and in-place updates keyed by group and focus key.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TOOLBAR_ICON_VIEWBOX,
  TOOLBAR_ICONS,
  ViewMode,
  type GanttOptions,
  type GanttTask,
  type ToolbarIcon,
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

function mount(options: GanttOptions = { viewMode: ViewMode.Month }): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  el.tasks = plan(3);
  el.options = options;
  document.body.appendChild(el);
  flush(el);
  return el;
}

const $ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => [
  ...el.shadowRoot!.querySelectorAll<T>(sel),
];
const button = (el: GantryElement, key: string) => $<HTMLButtonElement>(el, `[data-focus-key="${key}"]`)!;
const keys = (el: GantryElement) => $$(el, '.gantt-toolbar button').map(b => b.dataset['focusKey']);
const active = (el: GantryElement) => (el.shadowRoot!.activeElement as HTMLElement | null)?.dataset['focusKey'];
const tabStops = (el: GantryElement) => $$(el, '.gantt-toolbar button[tabindex="0"]').map(b => b.dataset['focusKey']);

/** Dispatches a keydown on `target` the way a browser does (bubbling, cancelable); true when prevented. */
function key(target: Element, k: string, init: KeyboardEventInit = {}): boolean {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e.defaultPrevented;
}

/** The `d` of each path of a control's icon. */
const iconPaths = (b: Element) => [...b.querySelectorAll('svg.gantt-tb-icon > path')].map(p => p.getAttribute('d'));

describe('toolbar (Phase 9 step 4.3)', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    el?.remove();
    vi.restoreAllMocks();
  });

  describe('markup (§3c)', () => {
    it('paints the groups in order with their classes, roles and names', () => {
      el = mount();
      const bar = $(el, '.gantt-toolbar')!;
      expect(bar.getAttribute('role')).toBe('toolbar');
      expect(bar.getAttribute('aria-label')).toBe('Chart toolbar');
      const groups = [...bar.children] as HTMLElement[];
      expect(groups.map(g => g.className)).toEqual([
        'gantt-tb-group',
        'gantt-tb-group gantt-tb-pills',
        'gantt-tb-group',
        'gantt-tb-group gantt-tb-pills gantt-tb-views',
      ]);
      expect(groups.map(g => g.getAttribute('role'))).toEqual([null, 'radiogroup', null, 'radiogroup']);
      expect(groups.map(g => g.getAttribute('aria-label'))).toEqual([null, 'Zoom level', null, 'View']);
      expect(keys(el)).toEqual([
        'zoom-out',
        'zoom-in',
        'fit',
        'zoom:Hour',
        'zoom:Day',
        'zoom:Week',
        'zoom:Month',
        'zoom:Quarter',
        'zoom:Year',
        'today',
        'view:split',
        'view:table',
        'view:chart',
      ]);
      for (const b of $$(el, '.gantt-toolbar button')) expect(b.getAttribute('type')).toBe('button');
    });

    it('draws zoom out, zoom in and fit as named icon buttons', () => {
      el = mount();
      const expected: [string, ToolbarIcon, string][] = [
        ['zoom-out', 'zoomOut', 'Zoom out'],
        ['zoom-in', 'zoomIn', 'Zoom in'],
        ['fit', 'fit', 'Fit to screen'],
      ];
      for (const [k, icon, name] of expected) {
        const b = button(el, k);
        expect(b.className).toBe('gantt-tb-btn');
        expect(b.hasAttribute('role')).toBe(false);
        expect(b.hasAttribute('aria-checked')).toBe(false);
        expect(b.getAttribute('aria-label')).toBe(name);
        expect(b.getAttribute('title')).toBe(name);
        expect(b.children).toHaveLength(1);
        expect(b.textContent).toBe('');
        expect(iconPaths(b)).toEqual(TOOLBAR_ICONS[icon]);
        const svg = b.firstElementChild!;
        expect(svg.getAttribute('class')).toBe('gantt-tb-icon');
        expect(svg.getAttribute('viewBox')).toBe(TOOLBAR_ICON_VIEWBOX);
        expect(svg.getAttribute('aria-hidden')).toBe('true');
        expect(svg.getAttribute('focusable')).toBe('false');
        expect([svg.getAttribute('width'), svg.getAttribute('height')]).toEqual(['16', '16']);
      }
    });

    it('draws the zoom levels as text radios and the views as icon radios', () => {
      el = mount();
      const month = button(el, 'zoom:Month');
      expect(month.className).toBe('gantt-tb-pill');
      expect(month.getAttribute('role')).toBe('radio');
      expect(month.getAttribute('aria-checked')).toBe('true');
      expect(month.textContent).toBe('Month');
      expect(month.children).toHaveLength(0);
      // The visible text names it: no aria-label, no title
      expect(month.hasAttribute('aria-label')).toBe(false);
      expect(month.hasAttribute('title')).toBe(false);
      expect(button(el, 'zoom:Week').getAttribute('aria-checked')).toBe('false');

      const views: [string, ToolbarIcon, string, string][] = [
        ['view:split', 'viewSplit', 'Table and chart', 'true'],
        ['view:table', 'viewTable', 'Table only', 'false'],
        ['view:chart', 'viewChart', 'Chart only', 'false'],
      ];
      for (const [k, icon, name, checked] of views) {
        const b = button(el, k);
        expect(b.className).toBe('gantt-tb-pill');
        expect(b.getAttribute('role')).toBe('radio');
        expect(b.getAttribute('aria-checked')).toBe(checked);
        expect(b.getAttribute('aria-label')).toBe(name);
        expect(b.getAttribute('title')).toBe(name);
        expect(b.textContent).toBe('');
        expect(iconPaths(b)).toEqual(TOOLBAR_ICONS[icon]);
      }
    });

    it('draws Today as an icon followed by its label', () => {
      el = mount();
      const today = button(el, 'today');
      expect(today.className).toBe('gantt-tb-btn gantt-tb-today');
      expect([...today.children].map(c => c.getAttribute('class'))).toEqual(['gantt-tb-icon', 'gantt-tb-label']);
      expect(iconPaths(today)).toEqual(TOOLBAR_ICONS.today);
      expect(today.querySelector('.gantt-tb-label')!.textContent).toBe('Today');
      expect(today.hasAttribute('aria-label')).toBe(false);
      expect(today.hasAttribute('title')).toBe(false);
    });

    it('follows options.toolbar: fit, groups and the offered levels (each once)', () => {
      el = mount({
        viewMode: ViewMode.Month,
        toolbar: { fit: false, today: false, viewModes: ['Week', 'Week', 'Nope'] },
      });
      expect(keys(el)).toEqual(['zoom-out', 'zoom-in', 'zoom:Week', 'view:split', 'view:table', 'view:chart']);
      el.options = { viewMode: ViewMode.Month, toolbar: { zoom: false, viewModes: false, today: false } };
      flush(el);
      expect(keys(el)).toEqual(['fit', 'view:split', 'view:table', 'view:chart']);
      el.options = { viewMode: ViewMode.Month, toolbar: false };
      flush(el);
      expect($(el, '.gantt-toolbar')).toBeNull();
    });

    it('localises names and texts in place, without rebuilding the icons', () => {
      el = mount();
      const zoomIn = button(el, 'zoom-in');
      const icon = zoomIn.firstElementChild;
      const todayLabel = button(el, 'today').querySelector('.gantt-tb-label');
      el.options = {
        viewMode: ViewMode.Month,
        labels: {
          zoomIn: 'Ingrandisci',
          todayButton: 'Oggi',
          viewSplit: 'Tabella e grafico',
          ariaZoomLevels: 'Livello di zoom',
          viewModes: { Month: 'Mese' },
        },
      };
      flush(el);
      expect(button(el, 'zoom-in')).toBe(zoomIn);
      expect(zoomIn.firstElementChild).toBe(icon);
      expect(zoomIn.getAttribute('aria-label')).toBe('Ingrandisci');
      expect(zoomIn.title).toBe('Ingrandisci');
      expect(button(el, 'today').querySelector('.gantt-tb-label')).toBe(todayLabel);
      expect(todayLabel!.textContent).toBe('Oggi');
      expect(button(el, 'view:split').getAttribute('aria-label')).toBe('Tabella e grafico');
      expect(button(el, 'zoom:Month').textContent).toBe('Mese');
      expect($(el, '.gantt-tb-pills')!.getAttribute('aria-label')).toBe('Livello di zoom');
    });
  });

  describe('actions', () => {
    it('runs each control: zoom, fit, today, levels and views', () => {
      el = mount({ viewMode: ViewMode.Week });
      const fit = vi.spyOn(el, 'fitToScreen');
      const today = vi.spyOn(el, 'scrollToToday');
      button(el, 'zoom-out').click();
      expect(el.viewMode).toBe(ViewMode.Month);
      button(el, 'zoom-in').click();
      expect(el.viewMode).toBe(ViewMode.Week);
      button(el, 'fit').click();
      expect(fit).toHaveBeenCalledOnce();
      button(el, 'today').click();
      expect(today).toHaveBeenCalledOnce();
      button(el, 'zoom:Day').click();
      expect(el.viewMode).toBe(ViewMode.Day);
      // A click on the icon inside a control runs that control
      button(el, 'view:chart')
        .querySelector('path')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(el.view).toBe('chart');
      button(el, 'today')
        .querySelector('.gantt-tb-label')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(today).toHaveBeenCalledTimes(2);
    });

    it('checks a radio when it is activated, keeping every node', () => {
      el = mount();
      const before = $$(el, '.gantt-toolbar button');
      const week = button(el, 'zoom:Week');
      week.click();
      flush(el);
      expect(el.viewMode).toBe(ViewMode.Week);
      expect(week.getAttribute('aria-checked')).toBe('true');
      expect(button(el, 'zoom:Month').getAttribute('aria-checked')).toBe('false');
      const table = button(el, 'view:table');
      table.click();
      flush(el);
      expect(el.view).toBe('table');
      expect(table.getAttribute('aria-checked')).toBe('true');
      expect(button(el, 'view:split').getAttribute('aria-checked')).toBe('false');
      // The API checks the radios too
      el.setViewMode(ViewMode.Day);
      flush(el);
      expect(button(el, 'zoom:Day').getAttribute('aria-checked')).toBe('true');
      expect($$(el, '.gantt-toolbar button')).toEqual(before);
    });

    it('brings a group back as the same nodes after it was turned off', () => {
      el = mount();
      const today = button(el, 'today');
      const group = today.parentElement;
      el.options = { viewMode: ViewMode.Month, toolbar: { today: false } };
      flush(el);
      expect(today.isConnected).toBe(false);
      el.options = { viewMode: ViewMode.Month };
      flush(el);
      expect(button(el, 'today')).toBe(today);
      expect(today.parentElement).toBe(group);
      expect([...$(el, '.gantt-toolbar')!.children][2]).toBe(group);
    });
  });

  describe('keyboard: one roving tab stop (D7)', () => {
    it('has exactly one tab stop, the first control at first', () => {
      el = mount();
      expect(tabStops(el)).toEqual(['zoom-out']);
      expect($$(el, '.gantt-toolbar button[tabindex="-1"]')).toHaveLength(keys(el).length - 1);
    });

    it('moves focus with ←/→ (wrapping) and Home/End, and the tab stop follows the focus', () => {
      el = mount();
      const first = button(el, 'zoom-out');
      first.focus();
      expect(key(first, 'ArrowRight')).toBe(true);
      expect(active(el)).toBe('zoom-in');
      key(button(el, 'zoom-in'), 'ArrowRight');
      key(button(el, 'fit'), 'ArrowRight');
      // Into the zoom-level radios: focus moves, the zoom level does not change
      expect(active(el)).toBe('zoom:Hour');
      expect(el.viewMode).toBe(ViewMode.Month);
      expect(button(el, 'zoom:Hour').getAttribute('aria-checked')).toBe('false');
      flush(el);
      expect(tabStops(el)).toEqual(['zoom:Hour']);

      key(button(el, 'zoom:Hour'), 'End');
      expect(active(el)).toBe('view:chart');
      expect(el.view).toBe('split');
      key(button(el, 'view:chart'), 'ArrowRight');
      expect(active(el)).toBe('zoom-out');
      key(button(el, 'zoom-out'), 'ArrowLeft');
      expect(active(el)).toBe('view:chart');
      key(button(el, 'view:chart'), 'Home');
      expect(active(el)).toBe('zoom-out');
      flush(el);
      expect(tabStops(el)).toEqual(['zoom-out']);
    });

    it('leaves other keys to the element: Enter / Space activate natively, shortcuts still work', () => {
      el = mount();
      const month = button(el, 'zoom:Month');
      month.focus();
      expect(key(month, 'Enter')).toBe(false);
      expect(key(month, ' ')).toBe(false);
      expect(key(month, 'ArrowDown')).toBe(false);
      expect(key(month, 'ArrowRight', { shiftKey: true })).toBe(false);
      expect(active(el)).toBe('zoom:Month');
      // The element's "+" shortcut zooms in from the toolbar too
      key(month, '+');
      expect(el.viewMode).toBe(ViewMode.Week);
    });

    it('keeps the focused control as the tab stop across a zoom, and falls back to the first when it goes', () => {
      el = mount();
      const week = button(el, 'zoom:Week');
      week.focus();
      week.click();
      flush(el);
      expect(active(el)).toBe('zoom:Week');
      expect(tabStops(el)).toEqual(['zoom:Week']);
      el.options = { viewMode: ViewMode.Week, toolbar: { viewModes: ['Day', 'Month'] } };
      flush(el);
      expect(button(el, 'zoom:Week')).toBeNull();
      expect(tabStops(el)).toEqual(['zoom-out']);
    });

    it('keeps the tab stop when the toolbar is hidden and shown again', () => {
      el = mount();
      button(el, 'today').focus();
      flush(el);
      el.showToolbar = false;
      flush(el);
      expect($(el, '.gantt-toolbar')).toBeNull();
      el.showToolbar = true;
      flush(el);
      expect(tabStops(el)).toEqual(['today']);
    });
  });

  it('styles 32 px controls, 16 px stroked icons and checked radios in the bar colours', () => {
    const rule = (selector: string) => BASE_CSS.split('\n').find(l => l.trim().startsWith(selector)) ?? '';
    expect(BASE_CSS).toMatch(/\.gantt-tb-btn, \.gantt-tb-pill \{[^}]*min-width: 32px; min-height: 32px;/);
    expect(rule('.gantt-tb-pill[aria-checked="true"]')).toContain('background: var(--gantt-bar)');
    expect(rule('.gantt-tb-pill[aria-checked="true"]')).toContain('color: var(--gantt-bar-text-on-bar)');
    expect(rule('.gantt-tb-icon')).toContain('fill: none; stroke: currentColor;');
    expect(rule('.gantt-tb-btn:focus-visible')).toContain('var(--gantt-focus-ring)');
    expect(BASE_CSS).not.toContain('aria-pressed');
  });
});
