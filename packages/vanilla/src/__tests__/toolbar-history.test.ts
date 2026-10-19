// Phase 11 step 4.4 — the toolbar's history group (D17, plan §3d): with `toolbar.undo` (default on)
// and while the chart keeps history (`editing.history`: editing on, not controlled) Undo and Redo
// icon buttons sit after the panel group and before the zoom group, `aria-disabled` while there is
// nothing to undo / redo (still focusable, in the roving set, inert), run the pipeline's undo /
// redo, keep focus, and never move into the More menu. With editing off the toolbar is unchanged.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ANNOUNCE_DEBOUNCE,
  DEFAULT_LABELS,
  TOOLBAR_ICONS,
  ViewMode,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();

const day = (d: number) => new Date(2026, 2, d);
const plan = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(6), progress: 20 },
  { id: 'b', name: 'Beta', start: day(8), end: day(12), progress: 50, dependency: 'a' },
];
const BASE: GanttOptions = { viewMode: ViewMode.Day, initialScroll: false, responsive: false };

function mount(options: GanttOptions = {}): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks: plan(), options: { ...BASE, ...options } });
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
const active = (el: GantryElement) => (el.shadowRoot!.activeElement as HTMLElement | null)?.dataset['focusKey'];
const tabStops = (el: GantryElement) => $$(el, '.gantt-toolbar button[tabindex="0"]').map(b => b.dataset['focusKey']);
const disabled = (el: GantryElement) => [
  button(el, 'undo')?.getAttribute('aria-disabled') ?? null,
  button(el, 'redo')?.getAttribute('aria-disabled') ?? null,
];
const live = (el: GantryElement) => $(el, '.gantt-sr-live')!.textContent;

/** A pointer drag of `id`'s bar by `days` (whole days at the Day scale), through the engine's drag. */
function dragBy(el: GantryElement, id: string, days: number): void {
  const { drag, graph: G } = getEngine(el);
  const geo = G.geoById.peek().get(id)!;
  const v = G.barVisual.peek()(geo);
  const x = v.x + v.width / 2;
  const to = x + days * G.timeline.peek().pxPerDay;
  drag.start(geo, 'bar', x);
  drag.move(to);
  drag.drop(to);
  flush(el);
}

function key(target: Element, k: string, init: KeyboardEventInit = {}): boolean {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e.defaultPrevented;
}

const PHASE9_HEAD = ['zoom-out', 'zoom-in', 'fit'];

describe('toolbar history group (Phase 11 step 4.4)', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    el?.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('not built unless the chart keeps history', () => {
    it.each<[string, GanttOptions]>([
      ['editing off (default)', {}],
      ['editing: false', { editing: false }],
      ['history: false', { editing: { history: false } }],
      ['controlled', { editing: { controlled: true } }],
      ['toolbar.undo: false', { editing: true, toolbar: { undo: false } }],
    ])('%s: the toolbar has no history group and no aria-disabled', (_, options) => {
      el = mount(options);
      expect($(el, '.gantt-tb-history')).toBeNull();
      expect(button(el, 'undo')).toBeNull();
      expect(button(el, 'redo')).toBeNull();
      expect($$(el, '.gantt-toolbar [aria-disabled]')).toEqual([]);
      expect(keys(el).slice(0, 3)).toEqual(PHASE9_HEAD);
    });

    it('with editing off a drop leaves the toolbar alone (the history state is not read)', () => {
      el = mount();
      const runs = getEngine(el).regionRuns;
      const before = runs['toolbar'];
      dragBy(el, 'a', 2);
      expect(runs['toolbar']).toBe(before);
      expect($(el, '.gantt-tb-history')).toBeNull();
    });
  });

  describe('with editing on', () => {
    it('sits after the panel group and before the zoom group: icon buttons named and titled Undo / Redo', () => {
      el = mount({ editing: true, toolbar: { panelToggle: true } });
      expect(groupClasses(el).slice(0, 3)).toEqual([
        'gantt-tb-group gantt-tb-panel-group',
        'gantt-tb-group gantt-tb-history',
        'gantt-tb-group',
      ]);
      expect(keys(el).slice(0, 6)).toEqual(['panel', 'undo', 'redo', ...PHASE9_HEAD]);
      const group = $(el, '.gantt-tb-history')!;
      expect(group.getAttribute('role')).toBeNull();
      expect(group.getAttribute('aria-label')).toBeNull();
      for (const kind of ['undo', 'redo'] as const) {
        const b = button(el, kind)!;
        expect(b.parentElement).toBe(group);
        expect(b.className).toBe(`gantt-tb-btn gantt-tb-${kind}`);
        expect(b.getAttribute('type')).toBe('button');
        expect(b.getAttribute('aria-label')).toBe(DEFAULT_LABELS[kind]);
        expect(b.getAttribute('title')).toBe(DEFAULT_LABELS[kind]);
        // An icon only: no text, no pressed / checked state
        for (const attr of ['role', 'aria-pressed', 'aria-checked', 'aria-haspopup', 'aria-expanded'])
          expect(b.hasAttribute(attr), attr).toBe(false);
        expect(b.querySelector('.gantt-tb-label')).toBeNull();
        const svg = b.firstElementChild!;
        expect(svg.getAttribute('class')).toBe('gantt-tb-icon');
        expect(svg.getAttribute('aria-hidden')).toBe('true');
        expect([...svg.querySelectorAll('path')].map(p => p.getAttribute('d'))).toEqual(TOOLBAR_ICONS[kind]);
        expect(b.childNodes.length).toBe(1);
      }
      // aria-label, title, then aria-disabled (the §3d order)
      const names = [...button(el, 'undo')!.attributes].map(a => a.name);
      expect(names.indexOf('aria-disabled')).toBe(names.indexOf('title') + 1);
    });

    it('both disabled with an empty history; the tab stop skips them while nothing was focused', () => {
      el = mount({ editing: true });
      expect(groupClasses(el)[0]).toBe('gantt-tb-group gantt-tb-history');
      expect(disabled(el)).toEqual(['true', 'true']);
      // Never natively disabled: focusable, in the roving set
      expect(button(el, 'undo')!.disabled).toBe(false);
      expect(tabStops(el)).toEqual(['zoom-out']);
      expect(button(el, 'undo')!.getAttribute('tabindex')).toBe('-1');
    });

    it('follows canUndo / canRedo: a drop enables Undo; Undo runs the pipeline and enables Redo', () => {
      vi.useFakeTimers();
      el = mount({ editing: true });
      const start = el.tasks[0].start;
      dragBy(el, 'a', 2);
      expect(disabled(el)).toEqual([null, 'true']);
      expect(el.tasks[0].start).not.toBe(start);

      const changes: string[] = [];
      el.addEventListener('tasks-change', e => changes.push(e.detail.change.source));
      button(el, 'undo')!.click();
      flush(el);
      expect(changes).toEqual(['undo']);
      expect(el.tasks[0].start).toBe(start);
      expect(disabled(el)).toEqual(['true', null]);
      vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
      expect(live(el)).toBe(DEFAULT_LABELS.announceUndo(DEFAULT_LABELS.announceMoved('Alpha', 2, 'day')));

      button(el, 'redo')!.click();
      flush(el);
      expect(changes).toEqual(['undo', 'redo']);
      expect(el.tasks[0].start).not.toBe(start);
      expect(disabled(el)).toEqual([null, 'true']);
      expect([el.canUndo, el.canRedo]).toEqual([true, false]);
    });

    it('a disabled button is inert: a click runs nothing', () => {
      el = mount({ editing: true });
      const { edit } = getEngine(el);
      const undo = vi.spyOn(edit, 'undo');
      const redo = vi.spyOn(edit, 'redo');
      const log: string[] = [];
      for (const type of ['before-change', 'tasks-change', 'history-change'] as const)
        el.addEventListener(type, () => log.push(type));
      button(el, 'undo')!.click();
      button(el, 'redo')!.click();
      expect(undo).not.toHaveBeenCalled();
      expect(redo).not.toHaveBeenCalled();
      expect(log).toEqual([]);

      dragBy(el, 'a', 1);
      log.length = 0;
      button(el, 'redo')!.click();
      expect(redo).not.toHaveBeenCalled();
      button(el, 'undo')!.click();
      expect(undo).toHaveBeenCalledTimes(1);
      expect(log).toEqual(['before-change', 'tasks-change', 'history-change']);
    });

    it('keeps its nodes and focus across an undo; ←/→ rove over it, disabled or not', () => {
      el = mount({ editing: true });
      dragBy(el, 'a', 1);
      const undo = button(el, 'undo')!;
      undo.focus();
      expect(active(el)).toBe('undo');
      undo.click();
      flush(el);
      // Disabled now, same node, still focused and the tab stop (the control focused last)
      expect(button(el, 'undo')).toBe(undo);
      expect(undo.getAttribute('aria-disabled')).toBe('true');
      expect(active(el)).toBe('undo');
      expect(tabStops(el)).toEqual(['undo']);

      expect(key(undo, 'ArrowRight')).toBe(true);
      expect(active(el)).toBe('redo');
      expect(key(button(el, 'redo')!, 'ArrowRight')).toBe(true);
      expect(active(el)).toBe('zoom-out');
      expect(key(button(el, 'zoom-out')!, 'ArrowLeft')).toBe(true);
      expect(active(el)).toBe('redo');
      expect(key(button(el, 'redo')!, 'Home')).toBe(true);
      expect(active(el)).toBe('undo');
    });

    it('re-paints the toolbar only when canUndo / canRedo change', () => {
      el = mount({ editing: { history: { coalesceMs: 0 } } });
      const runs = getEngine(el).regionRuns;
      dragBy(el, 'a', 1);
      const after = runs['toolbar'];
      // Another step: the state changes (count, label), the buttons do not
      dragBy(el, 'b', 1);
      expect(getEngine(el).inputs.historyState.peek().undoCount).toBe(2);
      expect(runs['toolbar']).toBe(after);
    });

    it('turning history off removes the group; clearHistory() disables both', () => {
      el = mount({ editing: true });
      dragBy(el, 'a', 1);
      el.undo();
      flush(el);
      expect(disabled(el)).toEqual(['true', null]);
      el.clearHistory();
      flush(el);
      expect(disabled(el)).toEqual(['true', 'true']);
      el.options = { ...BASE, editing: { history: false } };
      flush(el);
      expect($(el, '.gantt-tb-history')).toBeNull();
      el.options = { ...BASE, editing: true };
      flush(el);
      expect(groupClasses(el)[0]).toBe('gantt-tb-group gantt-tb-history');
    });

    it('never moves into the More menu, however narrow', () => {
      el = mount({ editing: true, toolbar: { panelToggle: true } });
      getEngine(el).inputs.mainW.set(240);
      flush(el);
      expect(button(el, 'more')).not.toBeNull();
      expect(keys(el).slice(0, 3)).toEqual(['panel', 'undo', 'redo']);
      button(el, 'more')!.click();
      flush(el);
      const items = $$(el, '.gantt-tb-menu-item').map(b => b.dataset['focusKey']);
      expect(items.length).toBeGreaterThan(0);
      expect(items.some(k => /undo|redo/.test(k ?? ''))).toBe(false);
      expect($(el, '.gantt-tb-menu .gantt-tb-undo')).toBeNull();
    });
  });
});
