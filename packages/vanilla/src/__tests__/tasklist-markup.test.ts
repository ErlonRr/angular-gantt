// Task-list markup shared with Angular (Gantry 2 phase 7, step 1.2): every inner span has a class
// (the paint-snapshot keys of both bindings), text colours come from the stylesheet (only a task's
// `barColor` is an inline paint), the collapse target and the leaf indent are 24 px, the column
// resize handle lies inside its header cell. happy-dom does not cascade adopted sheets, so the
// declared values are read from the matching rules of the base sheet (`cascaded`).
import { describe, it, expect, afterEach } from 'vitest';
import type { GanttTask } from '@gantry/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { getBaseSheet } from '../styles/base';
import '../index';

const day = (d: number) => new Date(2026, 2, d);
const TASKS: GanttTask[] = [
  { id: 'g', name: 'Group', start: day(2), end: day(20) },
  { id: 'a', name: 'Alpha', start: day(2), end: day(9), parentId: 'g', progress: 100, barColor: '#0F766E' },
  { id: 'b', name: 'Beta', start: day(9), end: day(16), parentId: 'g', progress: 30 },
  { id: 'm', name: 'Launch', start: day(20), end: day(20), type: 'milestone' },
];

function mount(tasks: GanttTask[] = TASKS): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  el.tasks = tasks;
  el.options = { initialScroll: false, panel: { columns: ['name', 'status', 'start'] } };
  document.body.appendChild(el);
  getEngine(el).flushSync();
  return el;
}

const $ = (el: GantryElement, sel: string): HTMLElement => {
  const node = el.shadowRoot!.querySelector<HTMLElement>(sel);
  if (!node) throw new Error(`no element for ${sel}`);
  return node;
};
const $$ = (el: GantryElement, sel: string) => [...el.shadowRoot!.querySelectorAll<HTMLElement>(sel)];
const classes = (node: Element) => [...node.children].map(c => c.getAttribute('class') ?? '');
const nameCell = (el: GantryElement, id: string) => $(el, `.gantt-tl-row[data-task-id="${id}"] .gantt-tl-name`);

/** CSS specificity of one compound selector, as one comparable number. */
function specificity(sel: string): number {
  const ids = (sel.match(/#[\w-]+/g) ?? []).length;
  const cls = (sel.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length;
  const types = (sel.match(/(?:^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return ids * 10_000 + cls * 100 + types;
}

/** The value of `prop` the cascade gives `node`: its inline style, else the most specific (then last) base-sheet rule. */
function cascaded(node: HTMLElement, prop: string): string {
  const inline = node.style.getPropertyValue(prop);
  if (inline) return inline.trim();
  let best = { spec: -1, value: '' };
  for (const rule of getBaseSheet(document)!.cssRules) {
    if (!(rule instanceof CSSStyleRule)) continue;
    const value = rule.style.getPropertyValue(prop);
    if (!value) continue;
    for (const part of rule.selectorText.split(',')) {
      let hit = false;
      try {
        hit = node.matches(part.trim());
      } catch {
        // :host(), ::part() and :state() selectors never match an inner node
      }
      const spec = specificity(part.trim());
      if (hit && spec >= best.spec) best = { spec, value: value.trim() };
    }
  }
  return best.value;
}

describe('task-list markup (shared with Angular)', () => {
  let el: GantryElement;
  afterEach(() => el?.remove());

  it('gives every inner span a class: header label, sort icon, name parts, cell texts', () => {
    el = mount();
    expect($$(el, '.gantt-tasklist span:not([class])')).toEqual([]);

    const head = $$(el, '.gantt-tl-col-header');
    expect(head.map(classes)).toEqual([
      ['gantt-tl-ellipsis', 'gantt-tl-sort-icon', 'gantt-col-resize'],
      ['gantt-tl-ellipsis', 'gantt-tl-sort-icon', 'gantt-col-resize'],
      ['gantt-tl-ellipsis', 'gantt-tl-sort-icon', 'gantt-col-resize'],
    ]);
    expect(head[0].querySelector('.gantt-tl-sort-icon')!.getAttribute('aria-hidden')).toBe('true');

    // Name cells: toggle (group) or indent (leaf) · icon · text, inside span.gantt-tl-name
    expect(classes(nameCell(el, 'g'))).toEqual(['gantt-collapse-btn', 'gantt-tl-icon', 'gantt-tl-ellipsis']);
    expect(classes(nameCell(el, 'b'))).toEqual(['gantt-tl-indent', 'gantt-tl-icon', 'gantt-tl-ellipsis']);
    expect(nameCell(el, 'b').querySelector('.gantt-tl-icon')!.getAttribute('aria-hidden')).toBe('true');
    expect(nameCell(el, 'm').querySelector('.gantt-tl-icon')!.textContent).toBe('◆');

    // Other cells: status dot? · text
    const cells = $$(el, '.gantt-tl-row[data-task-id="b"] .gantt-tl-cell');
    expect(cells.map(classes)).toEqual([
      ['gantt-tl-name'],
      ['gantt-tl-status-dot', 'gantt-tl-ellipsis'],
      ['gantt-tl-ellipsis'],
    ]);
    expect($(el, '.gantt-tl-row[data-task-id="g"]').classList.contains('gantt-tl-row--group')).toBe(true);
    expect($(el, '.gantt-tl-row[data-task-id="b"]').classList.contains('gantt-tl-row--group')).toBe(false);
  });

  it('takes the text colours from the stylesheet: primary labels and group names, secondary texts, muted icons', () => {
    el = mount();
    const label = $(el, '.gantt-tl-col-header .gantt-tl-ellipsis');
    expect(cascaded(label, 'color')).toBe('');
    expect(cascaded($(el, '.gantt-tl-col-header'), 'color')).toBe('var(--gantt-text)');

    const groupText = nameCell(el, 'g').querySelector<HTMLElement>('.gantt-tl-ellipsis')!;
    const leafText = nameCell(el, 'b').querySelector<HTMLElement>('.gantt-tl-ellipsis')!;
    expect(cascaded(groupText, 'color')).toBe('var(--gantt-text)');
    expect(cascaded(groupText, 'font-weight')).toBe('600');
    expect(cascaded(leafText, 'color')).toBe('var(--gantt-text-sec)');
    expect(cascaded(leafText, 'font-weight')).toBe('');
    const dataText = $(el, '.gantt-tl-row[data-task-id="b"] .gantt-tl-cell:nth-child(3) .gantt-tl-ellipsis');
    expect(cascaded(dataText, 'color')).toBe('var(--gantt-text-sec)');

    // No text colour or weight is an inline style any more
    for (const span of $$(el, '.gantt-tl-ellipsis, .gantt-tl-sort-icon, .gantt-tl-indent, .gantt-tl-name')) {
      expect(span.style.getPropertyValue('color')).toBe('');
      expect(span.style.getPropertyValue('font-weight')).toBe('');
      expect(span.style.getPropertyValue('font-size')).toBe('');
    }
  });

  it("marks the sorted column's icon --active (primary text); the others stay muted", () => {
    el = mount();
    const icon = (i: number) => $$(el, '.gantt-tl-col-header .gantt-tl-sort-icon')[i];
    expect(icon(0).classList.contains('gantt-tl-sort-icon--active')).toBe(false);
    expect(cascaded(icon(0), 'color')).toBe('var(--gantt-text-muted)');
    expect(cascaded(icon(0), 'font-size')).toBe('9px');

    $$(el, '.gantt-tl-col-header')[2].click();
    getEngine(el).flushSync();
    expect(icon(2).classList.contains('gantt-tl-sort-icon--active')).toBe(true);
    expect(icon(2).textContent).toBe('▲');
    expect(cascaded(icon(2), 'color')).toBe('var(--gantt-text)');
    expect(icon(0).classList.contains('gantt-tl-sort-icon--active')).toBe(false);

    // Third click: back to the original order, no active icon
    $$(el, '.gantt-tl-col-header')[2].click();
    getEngine(el).flushSync();
    $$(el, '.gantt-tl-col-header')[2].click();
    getEngine(el).flushSync();
    expect($$(el, '.gantt-tl-sort-icon--active')).toEqual([]);
  });

  it('keeps the explicit colour of a task icon with barColor; the others take the muted token', () => {
    el = mount();
    const icon = (id: string) => nameCell(el, id).querySelector<HTMLElement>('.gantt-tl-icon')!;
    expect(icon('a').style.getPropertyValue('color').toUpperCase()).toBe('#0F766E');
    expect(icon('b').style.getPropertyValue('color')).toBe('');
    expect(cascaded(icon('b'), 'color')).toBe('var(--gantt-text-muted)');
    expect(cascaded(icon('b'), 'font-size')).toBe('10px');

    // Dropping the colour removes the inline paint
    el.tasks = TASKS.map(t => (t.id === 'a' ? { ...t, barColor: undefined } : t));
    getEngine(el).flushSync();
    expect(icon('a').style.getPropertyValue('color')).toBe('');
    expect(cascaded(icon('a'), 'color')).toBe('var(--gantt-text-muted)');
  });

  it('ellipsizes the header label', () => {
    el = mount();
    const label = $(el, '.gantt-tl-col-header .gantt-tl-ellipsis');
    expect(cascaded(label, 'overflow')).toBe('hidden');
    expect(cascaded(label, 'text-overflow')).toBe('ellipsis');
    expect(cascaded(label, 'white-space')).toBe('nowrap');
    expect(cascaded($(el, '.gantt-tl-col-header'), 'overflow')).toBe('hidden');
  });

  it('puts the whole 6 px resize handle inside its header cell (right: 0)', () => {
    el = mount();
    const handle = $(el, '.gantt-tl-col-header .gantt-col-resize');
    expect(cascaded(handle.parentElement!, 'position')).toBe('relative');
    expect(cascaded(handle, 'position')).toBe('absolute');
    expect(['0', '0px']).toContain(cascaded(handle, 'right'));
    expect(cascaded(handle, 'width')).toBe('6px');
  });

  it('gives the collapse toggle a 24 × 24 px target and the leaf indent the same width', () => {
    el = mount();
    const toggle = $(el, '.gantt-collapse-btn');
    expect(cascaded(toggle, 'min-width')).toBe('24px');
    expect(cascaded(toggle, 'min-height')).toBe('24px');
    expect(cascaded(nameCell(el, 'b').querySelector<HTMLElement>('.gantt-tl-indent')!, 'width')).toBe('24px');
    // The level indent (level × indentSize) is the one geometry the name wrapper takes inline
    const indent = getEngine(el).graph.config().indentSize;
    expect(nameCell(el, 'b').style.getPropertyValue('padding-left')).toBe(`${indent}px`);
    expect(nameCell(el, 'g').style.getPropertyValue('padding-left')).toBe('0px');
  });
});
