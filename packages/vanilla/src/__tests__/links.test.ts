// Drawing, selecting and deleting dependency links in <gantry-element> (Gantry 2 phase 11, step
// 4.2, D12 / D13, plan §3e): `ctx.link` (interaction/link.ts) drives core `LinkSession` from a
// connector (drag or click → click) or with L on a bar; the type follows the ends (FS / SS / FF /
// SF); invalid targets (self, duplicate, loop, parent ↔ child) show `--invalid` and create nothing;
// `path.gantt-link-preview` is the SVG's last child only while a session draws one. An arrow is hit
// by geometry and selected (`gantt-arrow--selected`), Delete removes it, undo restores the app's own
// `dependency` value. The pointer routing that calls `ctx.link` is canvas-pointer's (step 4.1).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ANNOUNCE_DEBOUNCE,
  DEFAULT_LABELS,
  hitTestBar,
  ViewMode,
  type DependencyType,
  type GanttEditingOptions,
  type GanttOptions,
  type GanttTask,
  type LinkSide,
} from '@gantryjs/core';
import { GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import type { GantryEventDetailMap } from '../types';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();

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
const BASE: GanttOptions = { viewMode: ViewMode.Day, initialScroll: false };

function mount(editing: boolean | GanttEditingOptions = true, tasks: GanttTask[] = plan()): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  // No focus tooltip: its Escape would close it first (D24)
  Object.assign(el, { tasks, options: { ...BASE, editing }, tooltipEnabled: false });
  document.body.appendChild(el);
  flush(el);
  return el;
}

const $ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel);
const bar = (el: GantryElement, id: string) => $<SVGGElement>(el, `.gantt-bars-layer > [data-task-id="${id}"]`)!;
const svg = (el: GantryElement) => $<SVGSVGElement>(el, '.gantry-canvas-container svg')!;
const preview = (el: GantryElement) => $<SVGPathElement>(el, 'path.gantt-link-preview');
const live = (el: GantryElement) => $(el, '.gantt-sr-live')!.textContent;
const said = (el: GantryElement) => {
  vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE);
  return live(el);
};
const raw = (el: GantryElement, id: string) =>
  getEngine(el)
    .inputs.tasksIn.peek()
    .find(t => t.id === id)!;
const linkApi = (el: GantryElement) => getEngine(el).ctx.link;
const linkState = (el: GantryElement) => getEngine(el).inputs.link.peek();

/** The centre of `id`'s `side` connector (content px). */
function connector(el: GantryElement, id: string, side: LinkSide): { x: number; y: number } {
  const { graph: G } = getEngine(el);
  const c = G.barVisual.peek()(G.geoById.peek().get(id)!).connectors![side];
  return { x: c.cx, y: c.cy };
}

/** Drags a link from `from`'s `fromSide` connector to `to`'s `toSide` connector; returns `finish()`. */
function drawLink(el: GantryElement, from: string, fromSide: LinkSide, to: string, toSide: LinkSide): boolean {
  const link = linkApi(el);
  link.start(from, fromSide, 'drag', connector(el, from, fromSide));
  const at = connector(el, to, toSide);
  link.move(at.x, at.y);
  return link.finish();
}

function press(el: GantryElement, key: string, init: KeyboardEventInit = {}): boolean {
  const target = el.shadowRoot!.activeElement ?? el;
  const e = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e.defaultPrevented;
}

type Logged = { type: keyof GantryEventDetailMap; detail: unknown };
function record(el: GantryElement): Logged[] {
  const log: Logged[] = [];
  const types = [
    'before-change',
    'dependency-created',
    'dependency-deleted',
    'task-updated',
    'tasks-change',
    'history-change',
  ] as const;
  for (const type of types) el.addEventListener(type, e => log.push({ type, detail: e.detail }));
  return log;
}

/** The key of the arrow `from → to` and a content point on its route that is off every bar. */
function arrowPoint(el: GantryElement, from: string, to: string): { key: string; x: number; y: number } {
  const { graph: G } = getEngine(el);
  const link = G.arrowIndex.peek().links.find(l => l.from === from && l.to === to)!;
  const pts = G.arrowVisual.peek()(link)!.points;
  const rowHeight = G.config.peek().rowHeight;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    for (let t = 0.1; t < 1; t += 0.1) {
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const geo = G.geometries.peek()[Math.floor(y / rowHeight)];
      if (!geo || !hitTestBar(G.barVisual.peek()(geo), x, y, false)) return { key: link.key, x, y };
    }
  }
  throw new Error('no point off the bars');
}

describe('<gantry-element> links', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });
  afterEach(() => {
    el?.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('drawing from a connector (drag)', () => {
    it.each<[LinkSide, LinkSide, DependencyType]>([
      ['end', 'start', 'FS'],
      ['start', 'start', 'SS'],
      ['end', 'end', 'FF'],
      ['start', 'end', 'SF'],
    ])('%s → %s creates an %s link through the pipeline', (fromSide, toSide, type) => {
      el = mount();
      const log = record(el);
      expect(drawLink(el, 'a', fromSide, 'c', toSide)).toBe(true);
      expect(log.map(e => e.type)).toEqual([
        'before-change',
        'dependency-created',
        'task-updated',
        'tasks-change',
        'history-change',
      ]);
      expect(log[1].detail).toEqual({ fromId: 'a', toId: 'c', type, lag: 0 });
      expect(raw(el, 'c').dependency).toEqual([{ taskId: 'a', type, lag: 0 }]);
      expect((log[3].detail as GantryEventDetailMap['tasks-change']).change.source).toBe('link');
      expect(said(el)).toBe(DEFAULT_LABELS.announceLinkCreated('Alpha', 'Gamma'));
      expect(linkState(el)).toBeNull();
    });

    it('shows the preview as the last SVG child while drawing, and the session state', () => {
      el = mount();
      const link = linkApi(el);
      expect(preview(el)).toBeNull();
      link.start('a', 'end', 'drag', connector(el, 'a', 'end'));
      expect(link.active()).toBe(true);
      expect(linkState(el)).toMatchObject({ sourceId: 'a', side: 'end', mode: 'drag' });
      // Off the bars: towards the pointer, not invalid
      link.move(300, 200);
      flush(el);
      expect(svg(el).lastElementChild).toBe(preview(el));
      expect(preview(el)!.getAttribute('pointer-events')).toBe('none');
      expect(preview(el)!.getAttribute('d')).toMatch(/^M/);
      expect(preview(el)!.classList.contains('gantt-link-preview--invalid')).toBe(false);
      expect(linkState(el)!.preview).toMatchObject({ targetId: null, valid: false });
      // Over Gamma's body near its start: the target side is the nearer connector
      const v = getEngine(el).graph.barVisual.peek()(getEngine(el).graph.geoById.peek().get('c')!);
      link.move(v.x + 4, v.cy);
      expect(linkState(el)!.preview).toMatchObject({ targetId: 'c', targetSide: 'start', type: 'FS', valid: true });
      link.cancel();
      flush(el);
      expect(preview(el)).toBeNull();
      expect(linkState(el)).toBeNull();
      expect(said(el)).toBe(DEFAULT_LABELS.announceLinkCancel);
    });

    it('a drag start is not announced, a drop on nothing ends quietly', () => {
      el = mount();
      const link = linkApi(el);
      link.start('a', 'end', 'drag', connector(el, 'a', 'end'));
      link.move(5, 300);
      const log = record(el);
      expect(link.finish()).toBe(false);
      expect(log).toEqual([]);
      expect(said(el)).toBe('');
    });

    it('the source bar is no target: nothing is created', () => {
      el = mount();
      const log = record(el);
      expect(drawLink(el, 'a', 'end', 'a', 'start')).toBe(false);
      expect(log).toEqual([]);
      expect(raw(el, 'a').dependency).toBeUndefined();
    });

    it('a loop and a duplicate are invalid targets: `--invalid`, the reason announced, nothing created', () => {
      el = mount();
      const log = record(el);
      const link = linkApi(el);
      // b depends on a: a link b → a would close a loop
      link.start('b', 'end', 'drag', connector(el, 'b', 'end'));
      const at = connector(el, 'a', 'start');
      link.move(at.x, at.y);
      flush(el);
      expect(preview(el)!.classList.contains('gantt-link-preview--invalid')).toBe(true);
      expect(linkState(el)!.preview).toMatchObject({ targetId: 'a', valid: false, reason: DEFAULT_LABELS.errorCycle });
      expect(link.finish()).toBe(false);
      expect(said(el)).toBe(DEFAULT_LABELS.announceChangeRejected(DEFAULT_LABELS.errorCycle));
      // a → b exists already
      expect(drawLink(el, 'a', 'end', 'b', 'start')).toBe(false);
      expect(said(el)).toBe(DEFAULT_LABELS.announceChangeRejected(DEFAULT_LABELS.errorDuplicateLink));
      expect(log).toEqual([]);
      expect(raw(el, 'b').dependency).toBe('a');
    });

    it('parent ↔ child links are invalid unless `dependencies.parentChild`', () => {
      el = mount(true, family());
      expect(drawLink(el, 'p', 'start', 'k', 'start')).toBe(false);
      expect(said(el)).toBe(DEFAULT_LABELS.announceChangeRejected(DEFAULT_LABELS.errorParentChild));
      expect(drawLink(el, 'k', 'end', 'o', 'start')).toBe(true);
      el.remove();
      el = mount({ dependencies: { parentChild: true } }, family());
      expect(drawLink(el, 'p', 'start', 'k', 'start')).toBe(true);
      expect(raw(el, 'k').dependency).toEqual([{ taskId: 'p', type: 'SS', lag: 0 }]);
    });

    it('a read-only task starts no link and is no valid target', () => {
      el = mount(
        true,
        plan().map(t => (t.id === 'c' ? { ...t, editable: false } : t)),
      );
      const link = linkApi(el);
      link.start('c', 'end', 'drag', { x: 0, y: 0 });
      expect(link.active()).toBe(false);
      link.start('a', 'end', 'drag', connector(el, 'a', 'end'));
      const v = getEngine(el).graph.barVisual.peek()(getEngine(el).graph.geoById.peek().get('c')!);
      link.move(v.x + v.width / 2, v.cy);
      expect(linkState(el)!.preview).toMatchObject({
        targetId: 'c',
        valid: false,
        reason: DEFAULT_LABELS.errorReadOnly,
      });
      expect(link.finish()).toBe(false);
    });

    it('builds the change on the current tasks when they changed during the session', () => {
      el = mount();
      const link = linkApi(el);
      link.start('a', 'end', 'drag', connector(el, 'a', 'end'));
      const at = connector(el, 'c', 'start');
      link.move(at.x, at.y);
      // The app replaces the tasks meanwhile: Gamma now depends on Beta
      el.tasks = plan().map(t => (t.id === 'c' ? { ...t, dependency: 'b' } : t));
      expect(link.finish()).toBe(true);
      expect(raw(el, 'c').dependency).toEqual([{ taskId: 'b' }, { taskId: 'a', type: 'FS', lag: 0 }]);
    });
  });

  describe('click, then click (WCAG 2.5.7)', () => {
    it('arms from a connector, follows the pointer, creates on the target', () => {
      el = mount();
      const link = linkApi(el);
      link.start('a', 'start', 'click', connector(el, 'a', 'start'));
      expect(said(el)).toBe(DEFAULT_LABELS.announceLinkStart('Alpha'));
      const at = connector(el, 'c', 'end');
      link.move(at.x, at.y);
      expect(linkState(el)!.preview).toMatchObject({ targetId: 'c', targetSide: 'end', type: 'SF' });
      expect(link.finish()).toBe(true);
      expect(raw(el, 'c').dependency).toEqual([{ taskId: 'a', type: 'SF', lag: 0 }]);
    });

    it('a click on nothing cancels, announced', () => {
      el = mount();
      const link = linkApi(el);
      link.start('a', 'end', 'click', connector(el, 'a', 'end'));
      link.move(5, 300);
      expect(link.finish()).toBe(false);
      expect(said(el)).toBe(DEFAULT_LABELS.announceLinkCancel);
    });
  });

  describe('keyboard (L)', () => {
    it('L on a bar, arrows to another, Enter creates an FS link; focus stays', () => {
      el = mount();
      bar(el, 'a').focus();
      expect(press(el, 'l')).toBe(true);
      expect(linkState(el)).toMatchObject({ sourceId: 'a', side: 'end', mode: 'keyboard', preview: null });
      expect(said(el)).toBe(DEFAULT_LABELS.announceLinkStart('Alpha'));
      flush(el);
      // No target yet: no preview
      expect(preview(el)).toBeNull();
      // Beta already depends on Alpha: invalid
      press(el, 'ArrowDown');
      expect(el.shadowRoot!.activeElement).toBe(bar(el, 'b'));
      flush(el);
      expect(linkState(el)!.preview).toMatchObject({ targetId: 'b', valid: false });
      expect(preview(el)!.classList.contains('gantt-link-preview--invalid')).toBe(true);
      press(el, 'ArrowDown');
      expect(linkState(el)!.preview).toMatchObject({ targetId: 'c', targetSide: 'start', type: 'FS', valid: true });
      const log = record(el);
      expect(press(el, 'Enter')).toBe(true);
      expect(log.map(e => e.type)).toContain('dependency-created');
      expect(raw(el, 'c').dependency).toEqual([{ taskId: 'a', type: 'FS', lag: 0 }]);
      expect(el.shadowRoot!.activeElement).toBe(bar(el, 'c'));
      expect(linkState(el)).toBeNull();
      expect(said(el)).toBe(DEFAULT_LABELS.announceLinkCreated('Alpha', 'Gamma'));
      // Enter now activates as before (no move mode: back to the row click)
      flush(el);
      expect(preview(el)).toBeNull();
    });

    it('L on another bar creates it too; L or Enter on the source cancels', () => {
      el = mount();
      bar(el, 'a').focus();
      press(el, 'l');
      press(el, 'Enter');
      expect(linkState(el)).toBeNull();
      expect(said(el)).toBe(DEFAULT_LABELS.announceLinkCancel);
      press(el, 'l');
      press(el, 'ArrowDown');
      press(el, 'ArrowDown');
      expect(press(el, 'L')).toBe(true);
      expect(raw(el, 'c').dependency).toEqual([{ taskId: 'a', type: 'FS', lag: 0 }]);
    });

    it('Escape cancels (announced) and keeps the selection', () => {
      el = mount();
      el.setSelectedTasks(['b']);
      bar(el, 'a').focus();
      press(el, 'l');
      expect(press(el, 'Escape')).toBe(true);
      expect(linkState(el)).toBeNull();
      expect(said(el)).toBe(DEFAULT_LABELS.announceLinkCancel);
      expect(el.getSelectedTasks().map(t => t.id)).toEqual(['b']);
    });

    it('Tab out of the bars and a pointer press cancel', () => {
      el = mount();
      const { dom } = getEngine(el);
      bar(el, 'a').focus();
      press(el, 'l');
      dom.splitterHandle.focus();
      expect(linkState(el)).toBeNull();
      bar(el, 'a').focus();
      press(el, 'l');
      expect(linkState(el)).not.toBeNull();
      dom.viewport.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, button: 0 }));
      expect(linkState(el)).toBeNull();
      expect(said(el)).toBe(DEFAULT_LABELS.announceLinkCancel);
    });

    it('a bar that cannot link, or editing off, leaves L alone', () => {
      el = mount(
        true,
        plan().map(t => (t.id === 'a' ? { ...t, editable: false } : t)),
      );
      bar(el, 'a').focus();
      expect(press(el, 'l')).toBe(false);
      expect(linkState(el)).toBeNull();
      el.remove();
      el = mount(false);
      bar(el, 'a').focus();
      expect(press(el, 'l')).toBe(false);
      expect(linkState(el)).toBeNull();
      el.remove();
      el = mount({ dependencies: { create: false } });
      bar(el, 'a').focus();
      expect(press(el, 'l')).toBe(false);
    });

    it('the element shows `:state(linking)` while a session is on', () => {
      const states = new Set<string>();
      Object.defineProperty(GantryElement.prototype, 'attachInternals', {
        configurable: true,
        value: () => ({ role: null, ariaLabel: null, states }),
      });
      try {
        el = mount();
      } finally {
        Reflect.deleteProperty(GantryElement.prototype, 'attachInternals');
      }
      bar(el, 'a').focus();
      press(el, 'l');
      expect(states.has('linking')).toBe(true);
      press(el, 'Escape');
      expect(states.has('linking')).toBe(false);
    });
  });

  describe('selecting and deleting (D13)', () => {
    it('a click on the arrow selects it (announced, `--selected`), Delete removes it, undo restores the string', () => {
      el = mount();
      const { key, x, y } = arrowPoint(el, 'a', 'b');
      expect(linkApi(el).selectAt(x, y)).toBe(true);
      expect(getEngine(el).inputs.selectedLinkKey.peek()).toBe(key);
      expect(said(el)).toBe(DEFAULT_LABELS.announceLinkSelected('Alpha', 'Beta'));
      flush(el);
      const selected = el.shadowRoot!.querySelectorAll('.gantt-arrows > g.gantt-arrow--selected');
      expect(selected).toHaveLength(1);
      expect(selected[0].querySelector('path')!.style.getPropertyValue('stroke')).toBe('var(--gantt-focus-ring)');

      const log = record(el);
      bar(el, 'c').focus();
      expect(press(el, 'Delete')).toBe(true);
      expect(log.map(e => e.type)).toEqual([
        'before-change',
        'dependency-deleted',
        'task-updated',
        'tasks-change',
        'history-change',
      ]);
      expect(log[1].detail).toEqual({ fromId: 'a', toId: 'b', type: 'FS', lag: 0 });
      expect(raw(el, 'b').dependency).toBeUndefined();
      expect(getEngine(el).inputs.selectedLinkKey.peek()).toBeNull();
      expect(said(el)).toBe(DEFAULT_LABELS.announceLinkDeleted('Alpha', 'Beta'));
      flush(el);
      expect(el.shadowRoot!.querySelectorAll('.gantt-arrow--selected')).toHaveLength(0);

      expect(el.undo()).toBe(true);
      expect(raw(el, 'b').dependency).toBe('a');
    });

    it('undo of a drawn link restores the original `dependency` value', () => {
      el = mount();
      expect(drawLink(el, 'a', 'end', 'd', 'start')).toBe(true);
      expect(raw(el, 'd').dependency).toEqual([{ taskId: 'b' }, { taskId: 'a', type: 'FS', lag: 0 }]);
      expect(el.undo()).toBe(true);
      expect(raw(el, 'd').dependency).toBe('b');
      expect(el.redo()).toBe(true);
      expect(raw(el, 'd').dependency).toHaveLength(2);
    });

    it('Delete works from the task list and the viewport too; Backspace as well', () => {
      el = mount();
      const { x, y } = arrowPoint(el, 'b', 'd');
      linkApi(el).selectAt(x, y);
      const cell = el.shadowRoot!.querySelector<HTMLElement>('.gantt-tl-row[data-task-id="a"]')!;
      cell.focus();
      expect(press(el, 'Backspace')).toBe(true);
      expect(raw(el, 'd').dependency).toBeUndefined();
    });

    it('nothing there, a bar there or `dependencies.delete: false`: nothing is selected', () => {
      el = mount();
      const link = linkApi(el);
      const { x, y } = arrowPoint(el, 'a', 'b');
      expect(link.selectAt(x, y)).toBe(true);
      // Empty space deselects
      expect(link.selectAt(2, 3)).toBe(false);
      expect(getEngine(el).inputs.selectedLinkKey.peek()).toBeNull();
      // A bar wins over the arrows
      const v = getEngine(el).graph.barVisual.peek()(getEngine(el).graph.geoById.peek().get('b')!);
      expect(link.selectAt(v.x + v.width / 2, v.cy)).toBe(false);
      // Without a selection Delete keeps its default action
      bar(el, 'a').focus();
      expect(press(el, 'Delete')).toBe(false);
      expect(link.deleteSelected()).toBe(false);
      el.remove();
      el = mount({ dependencies: { delete: false } });
      expect(linkApi(el).selectAt(x, y)).toBe(false);
      el.remove();
      el = mount(false);
      expect(linkApi(el).selectAt(x, y)).toBe(false);
    });

    it('Escape deselects the link only; a press anywhere deselects', () => {
      el = mount();
      el.setSelectedTasks(['c']);
      const { x, y } = arrowPoint(el, 'a', 'b');
      const { inputs, dom } = getEngine(el);
      linkApi(el).selectAt(x, y);
      bar(el, 'a').focus();
      expect(press(el, 'Escape')).toBe(true);
      expect(inputs.selectedLinkKey.peek()).toBeNull();
      expect(el.getSelectedTasks().map(t => t.id)).toEqual(['c']);
      linkApi(el).selectAt(x, y);
      dom.tasklistContainer.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
      expect(inputs.selectedLinkKey.peek()).toBeNull();
    });

    it('a vetoed delete keeps the link and its selection', () => {
      el = mount();
      const { x, y } = arrowPoint(el, 'a', 'b');
      linkApi(el).selectAt(x, y);
      el.addEventListener('before-change', e => e.preventDefault());
      expect(linkApi(el).deleteSelected()).toBe(false);
      expect(raw(el, 'b').dependency).toBe('a');
      expect(getEngine(el).inputs.selectedLinkKey.peek()).not.toBeNull();
    });
  });

  it('editing off: no session, no selection, no preview node, arrows painted as before', () => {
    el = mount(false);
    const link = linkApi(el);
    link.start('a', 'end', 'drag', { x: 0, y: 0 });
    expect(link.active()).toBe(false);
    flush(el);
    expect(preview(el)).toBeNull();
    expect([...el.shadowRoot!.querySelectorAll('.gantt-arrows > g')].map(g => g.getAttribute('class'))).toEqual([
      'gantt-arrow',
      'gantt-arrow',
    ]);
  });
});
