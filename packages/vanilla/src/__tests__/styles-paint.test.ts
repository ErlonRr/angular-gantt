// Task styles in the painters (Gantry 2 phase 10, step 4.1, D9/D10, §3c of its plan): the bar's
// classes come from the visual (`visual.className`: `options.styles`, `task.style.className`, the
// deprecated `task.className`), on built-in bars and, added next to their own classes, on custom
// `renderBar` nodes; a collapsed rolled-up parent paints its children as `rect.gantt-bar-segment`
// after the body (attached only while the visual has segments); the row backgrounds of both panes
// are core `rowPaint` with the row's resolved style, and the task-list icon takes the style's colour.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PAINTS,
  ViewMode,
  rowPaint,
  type BarVisual,
  type GanttFlatRow,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { createBar, patchBar } from '../paint/bars';
import { FORCED_COLORS_CSS } from '../styles/forced-colors.css';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();

/** A parent with two children, a root task and a milestone (March 2026). */
function tree(): GanttTask[] {
  return [
    { id: 'p', name: 'Parent', start: new Date(2026, 2, 2), end: new Date(2026, 2, 23), progress: 40 },
    { id: 'a', name: 'A', start: new Date(2026, 2, 2), end: new Date(2026, 2, 9), parentId: 'p', progress: 0 },
    { id: 'b', name: 'B', start: new Date(2026, 2, 12), end: new Date(2026, 2, 23), parentId: 'p', progress: 100 },
    { id: 'r', name: 'Root', start: new Date(2026, 2, 3), end: new Date(2026, 2, 6), progress: 10 },
    { id: 'm', name: 'Launch', type: 'milestone', start: new Date(2026, 2, 24), end: new Date(2026, 2, 24) },
  ];
}

const BASE: GanttOptions = { viewMode: ViewMode.Day, initialScroll: false };

function mount(props: Partial<Pick<GantryElement, 'tasks' | 'options' | 'renderBar'>>): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks: tree(), options: BASE }, props);
  document.body.appendChild(el);
  flush(el);
  return el;
}

const $ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => [
  ...el.shadowRoot!.querySelectorAll<T>(sel),
];
const bar = (el: GantryElement, id: string) => $<SVGGElement>(el, `.gantt-bars-layer > [data-task-id="${id}"]`)!;
const tlRow = (el: GantryElement, id: string) => $(el, `.gantt-tl-row[data-task-id="${id}"]`)!;
const icon = (el: GantryElement, id: string) => tlRow(el, id).querySelector<HTMLElement>('.gantt-tl-icon')!;
const rowOf = (el: GantryElement, id: string): GanttFlatRow =>
  getEngine(el)
    .graph.visibleRows.peek()
    .find(r => r.task.id === id)!;
/** The timeline row background of `id` (rows keyed by task id, in row order) */
const rowRect = (el: GantryElement, id: string) =>
  $$<SVGRectElement>(el, '.gantt-rows > rect')[rowOf(el, id).visibleIndex];
const parts = (g: Element) => [...g.children].map(c => c.getAttribute('class'));

describe('task styles in the Web Component painters', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    el?.remove();
    vi.restoreAllMocks();
  });

  describe('bar classes', () => {
    it('take the visual className: every layer once (styles, task.style, the deprecated task.className)', () => {
      el = mount({
        tasks: tree().map(t => (t.id === 'a' ? { ...t, className: 'legacy', style: { className: 'own shared' } } : t)),
        options: {
          ...BASE,
          styles: {
            task: { className: 'kind' },
            parent: { className: 'is-parent' },
            levels: [null, { className: 'shared' }],
          },
        },
      });
      const v = el.getBarVisual('a')!;
      expect(v.className).not.toBeNull();
      expect(bar(el, 'a').getAttribute('class')).toBe(`gantt-bar gantt-bar--task ${v.className} gantt-bar-draggable`);
      const classes = [...bar(el, 'a').classList];
      for (const c of ['kind', 'shared', 'legacy', 'own']) expect(classes.filter(x => x === c)).toHaveLength(1);
      expect(bar(el, 'p').classList.contains('is-parent')).toBe(true);
      expect(bar(el, 'r').classList.contains('is-parent')).toBe(false);

      // Styles gone: the classes go with them
      el.options = BASE;
      flush(el);
      expect(bar(el, 'p').classList.contains('is-parent')).toBe(false);
      expect(bar(el, 'r').getAttribute('class')).toBe('gantt-bar gantt-bar--task gantt-bar-draggable');
    });

    it('a task.className alone still reaches the bar (through the visual, not the task)', () => {
      el = mount({ tasks: tree().map(t => (t.id === 'r' ? { ...t, className: 'legacy' } : t)) });
      expect(el.getBarVisual('r')!.className).toBe('legacy');
      expect(bar(el, 'r').getAttribute('class')).toBe('gantt-bar gantt-bar--task legacy gantt-bar-draggable');
    });

    it('a custom renderBar node gets the style classes next to its own, added and removed one by one', () => {
      // A renderer that keeps one node per task: a new context reuses the node, so stale classes must go
      const nodes = new Map<string, SVGGElement>();
      const renderBar: GantryElement['renderBar'] = ctx => {
        let g = nodes.get(ctx.row.task.id);
        if (!g) {
          g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          g.classList.add('mine');
          nodes.set(ctx.row.task.id, g);
        }
        return g;
      };
      // The layer's own classes on a custom node (`gantt-bar-draggable`) are left out here
      const classes = (id: string) => [...bar(el, id).classList].filter(c => c !== 'gantt-bar-draggable');
      el = mount({ renderBar, options: { ...BASE, styles: { parent: { className: 'is-parent first' } } } });
      expect(classes('p')).toEqual(['mine', 'is-parent', 'first']);
      expect(classes('r')).toEqual(['mine']);

      el.options = { ...BASE, styles: { parent: { className: 'is-parent second' } } };
      flush(el);
      expect(bar(el, 'p')).toBe(nodes.get('p'));
      expect(classes('p')).toEqual(['mine', 'is-parent', 'second']);

      el.options = BASE;
      flush(el);
      expect(classes('p')).toEqual(['mine']);
    });

    it("a custom renderer returning the default bar keeps the default bar's classes", () => {
      el = mount({
        renderBar: (_ctx, renderDefault) => renderDefault(),
        options: { ...BASE, styles: { task: { className: 'styled' } } },
      });
      const cls = bar(el, 'r').getAttribute('class')!.split(' ');
      expect(cls.filter(c => c === 'styled')).toHaveLength(1);
      expect(cls[0]).toBe('gantt-bar');
    });
  });

  describe('rolled-up segments', () => {
    const SEGMENTS: GanttOptions = { ...BASE, rollup: { segments: true }, groupBar: { collapsed: true } };

    it('paints rect.gantt-bar-segment after the body: x / width from the segment, the bar y / height / rx, the fill', () => {
      el = mount({
        tasks: tree().map(t => (t.id === 'b' ? { ...t, style: { color: '#AA0000' } } : t)),
        options: SEGMENTS,
      });
      const v = el.getBarVisual('p')!;
      expect(v.segments).toHaveLength(2);
      const g = bar(el, 'p');
      const segs = [...g.querySelectorAll<SVGRectElement>(':scope > rect.gantt-bar-segment')];
      expect(segs).toHaveLength(2);
      // Right after the body, before the other parts
      expect(parts(g).slice(0, 3)).toEqual(['gantt-bar-body', 'gantt-bar-segment', 'gantt-bar-segment']);
      v.segments!.forEach((seg, i) => {
        const r = segs[i];
        expect(Number(r.getAttribute('x'))).toBe(seg.x);
        expect(Number(r.getAttribute('width'))).toBe(seg.width);
        expect(Number(r.getAttribute('y'))).toBe(v.y);
        expect(Number(r.getAttribute('height'))).toBe(v.height);
        expect(Number(r.getAttribute('rx'))).toBe(v.rx);
        expect(r.style.getPropertyValue('fill')).toBe(seg.paint);
        expect(r.getAttribute('pointer-events')).toBe('none');
        // Colours go through the CSSOM, never presentation attributes
        expect(r.hasAttribute('fill')).toBe(false);
      });
      expect(segs[1].style.getPropertyValue('fill')).toBe('#AA0000');

      // Expanded: no segments, and no node left behind
      el.expandAll();
      flush(el);
      expect(el.getBarVisual('p')!.segments).toBeNull();
      expect(bar(el, 'p').querySelector('.gantt-bar-segment')).toBeNull();
      // Collapsed again: back
      el.collapseAll();
      flush(el);
      expect(bar(el, 'p').querySelectorAll('.gantt-bar-segment')).toHaveLength(2);
    });

    it('attaches no segment without rollup.segments, nor on milestones or expanded parents', () => {
      el = mount({ options: { ...BASE, rollup: true, groupBar: { collapsed: true } } });
      expect($(el, '.gantt-bar-segment')).toBeNull();
      el.options = { ...SEGMENTS };
      flush(el);
      expect($$(el, '.gantt-bar-segment').length).toBeGreaterThan(0);
      expect(bar(el, 'm').querySelector('.gantt-bar-segment')).toBeNull();
      expect(bar(el, 'r').querySelector('.gantt-bar-segment')).toBeNull();
    });

    it('patchBar keeps the segments in order right after the body as their count changes', () => {
      const visual = (over: Partial<BarVisual> = {}): BarVisual => ({
        kind: 'group',
        x: 10,
        y: 5,
        width: 100,
        height: 20,
        cy: 15,
        rx: 2,
        path: 'M10,5H110V25H10Z',
        tone: 'default',
        paint: { body: 'var(--gantt-group)', progress: 'var(--gantt-progress)', label: 'var(--gantt-text)' },
        progress: { path: 'M10,5H60V25H10Z', opacity: 0.35 },
        label: { text: 'Build', x: 120, y: 15, anchor: 'start', inside: false },
        baseline: null,
        caps: 'M0,0',
        handles: null,
        focusRect: { x: 7, y: 2, width: 106, height: 26, rx: 5 },
        hitBox: { x: 10, y: 5, width: 100, height: 20 },
        className: null,
        segments: null,
        ...over,
      });
      const seg = (x: number, paint: string) => ({ x, width: 10, paint });
      const LABEL = 'gantt-bar-label gantt-bar-label--outside';
      const g = createBar(visual(), { fontPx: 12, selected: false });
      expect(parts(g)).toEqual(['gantt-bar-body', 'gantt-bar-caps', 'gantt-bar-progress', LABEL]);

      patchBar(g, visual({ segments: [seg(10, '#111111'), seg(30, '#222222')] }), { fontPx: 12, selected: false });
      expect(parts(g)).toEqual([
        'gantt-bar-body',
        'gantt-bar-segment',
        'gantt-bar-segment',
        'gantt-bar-caps',
        'gantt-bar-progress',
        LABEL,
      ]);
      const first = g.children[1];

      patchBar(g, visual({ segments: [seg(12, '#333333'), seg(30, '#222222'), seg(60, '#444444')] }), {
        fontPx: 12,
        selected: false,
      });
      expect(parts(g).filter(c => c === 'gantt-bar-segment')).toHaveLength(3);
      expect(g.children[1]).toBe(first);
      expect(first.getAttribute('x')).toBe('12');
      expect((g.children[3] as SVGRectElement).style.getPropertyValue('fill')).toBe('#444444');
      expect(g.children[4].getAttribute('class')).toBe('gantt-bar-caps');

      patchBar(g, visual({ segments: [seg(12, '#333333')] }), { fontPx: 12, selected: false });
      expect(parts(g)).toEqual(['gantt-bar-body', 'gantt-bar-segment', 'gantt-bar-caps', 'gantt-bar-progress', LABEL]);
      patchBar(g, visual(), { fontPx: 12, selected: false });
      expect(g.querySelector('.gantt-bar-segment')).toBeNull();
    });

    it('has a forced-colors rule (each child outlined in system colours)', () => {
      expect(FORCED_COLORS_CSS).toContain(
        '.gantt-bar-segment { fill: ButtonFace !important; stroke: ButtonText !important; stroke-width: 1px; }',
      );
    });
  });

  describe('row backgrounds and the task-list icon', () => {
    it('paint rowPaint with the resolved style in both panes: selection > rowColor > zebra', () => {
      el = mount({
        tasks: tree().map(t => (t.id === 'r' ? { ...t, style: { rowColor: '#FFF7ED' } } : t)),
        options: { ...BASE, styles: { parent: { rowColor: '#ECFEFF' }, levels: [null, { rowColor: '#F0FDF4' }] } },
      });
      const styleOf = getEngine(el).graph.rowStyle.peek();
      for (const [id, expected] of [
        ['p', '#ECFEFF'],
        ['a', '#F0FDF4'],
        ['r', '#FFF7ED'],
      ] as const) {
        expect(rowPaint({ row: rowOf(el, id) }, false, styleOf(rowOf(el, id)))).toBe(expected);
        expect(rowRect(el, id).style.getPropertyValue('fill')).toBe(expected);
        expect(tlRow(el, id).style.getPropertyValue('background-color')).toBe(expected);
      }
      // The milestone has no row colour: the zebra
      const zebra = rowOf(el, 'm').visibleIndex % 2 === 0 ? PAINTS.rowBg : PAINTS.rowBgAlt;
      expect(rowRect(el, 'm').style.getPropertyValue('fill')).toBe(zebra);
      expect(tlRow(el, 'm').style.getPropertyValue('background-color')).toBe(zebra);

      // Selection wins over the row colour
      el.setSelectedTasks(['p']);
      flush(el);
      expect(rowRect(el, 'p').style.getPropertyValue('fill')).toBe(PAINTS.rowSelected);
      expect(tlRow(el, 'p').style.getPropertyValue('background-color')).toBe(PAINTS.rowSelected);

      // Styles changed without new tasks: both panes follow
      el.options = BASE;
      flush(el);
      expect(rowRect(el, 'a').style.getPropertyValue('fill')).not.toBe('#F0FDF4');
      expect(tlRow(el, 'a').style.getPropertyValue('background-color')).not.toBe('#F0FDF4');
      expect(tlRow(el, 'r').style.getPropertyValue('background-color')).toBe('#FFF7ED');
    });

    it('colours the icon with the style colour (styles, task.style, the deprecated barColor), else the stylesheet', () => {
      el = mount({
        tasks: tree().map(t =>
          t.id === 'r' ? { ...t, barColor: '#1E3A8A' } : t.id === 'b' ? { ...t, style: { color: '#AA0000' } } : t,
        ),
        options: { ...BASE, styles: { parent: { color: '#0F766E' } } },
      });
      expect(icon(el, 'p').style.getPropertyValue('color')).toBe('#0F766E');
      expect(icon(el, 'b').style.getPropertyValue('color')).toBe('#AA0000');
      expect(icon(el, 'r').style.getPropertyValue('color')).toBe('#1E3A8A');
      expect(icon(el, 'a').style.getPropertyValue('color')).toBe('');

      // A new style without new tasks: the icon follows, the cells are not rendered again
      const name = tlRow(el, 'p').querySelector('.gantt-tl-ellipsis')!;
      el.options = { ...BASE, styles: { parent: { color: '#7C3AED' } } };
      flush(el);
      expect(icon(el, 'p').style.getPropertyValue('color')).toBe('#7C3AED');
      expect(tlRow(el, 'p').querySelector('.gantt-tl-ellipsis')).toBe(name);
      el.options = BASE;
      flush(el);
      expect(icon(el, 'p').style.getPropertyValue('color')).toBe('');
    });

    it('a rolled-up status colour reaches the bar and the icon alike', () => {
      el = mount({ options: { ...BASE, rollup: { color: 'status' } } });
      const style = getEngine(el).graph.rowStyle.peek()(rowOf(el, 'p'));
      expect(style.color).toBeTruthy();
      expect(icon(el, 'p').style.getPropertyValue('color')).toBe(style.color);
      expect(el.getBarVisual('p')!.paint.body).toBe(style.color);
    });
  });
});
