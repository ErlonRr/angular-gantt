// Header and static layers (Gantry 2 phase 6, step 2.1): horizontally windowed (D10) and keyed.
// Header cells, non-working bands and vertical grid lines are mounted only around the viewport
// (`graph.hWindow`: viewport ± half its width, snapped to 256px); a scroll inside one chunk
// changes nothing, a scroll across a chunk adds and removes elements at the window's ends and
// keeps every other node.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { headerCellBorder, ViewMode, type GanttOptions, type GanttTask } from '@gantry/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { HORIZONTAL_QUANTUM } from '../engine/graph/horizontal';
import { HEADER_CSS } from '../styles/header.css';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();
const $ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => [
  ...el.shadowRoot!.querySelectorAll<T>(sel),
];

/** Two short tasks `years` apart, both starting on 1 January: a long, mostly empty timeline. */
function span(years: number): GanttTask[] {
  return [
    { id: 'a', name: 'A', start: new Date(2024, 0, 1), end: new Date(2024, 0, 10) },
    { id: 'z', name: 'Z', start: new Date(2024 + years - 1, 11, 10), end: new Date(2024 + years - 1, 11, 20) },
  ];
}

const DAY: GanttOptions = { viewMode: ViewMode.Day, initialScroll: false };

/** Mounts with the timeline viewport measured `width` px wide (happy-dom has no layout). */
function mount(tasks: GanttTask[], options: GanttOptions = DAY, width = 1000): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks, options });
  Object.defineProperty(getEngine(el).dom.viewport, 'clientWidth', { configurable: true, get: () => width });
  document.body.appendChild(el);
  flush(el);
  return el;
}

function scrollTo(el: GantryElement, left: number, top = 0): void {
  const viewport = getEngine(el).dom.viewport;
  viewport.scrollLeft = left;
  viewport.scrollTop = top;
  viewport.dispatchEvent(new Event('scroll'));
  flush(el);
}

/** Zeroes the region counters; the reader treats "never ran" as 0. */
function regionCounter(el: GantryElement) {
  const { regionRuns } = getEngine(el);
  for (const k of Object.keys(regionRuns)) regionRuns[k] = 0;
  return (name: string) => regionRuns[name] ?? 0;
}

const px = (el: Element, prop: string) => parseFloat((el as HTMLElement).style.getPropertyValue(prop));
const attr = (el: Element, name: string) => Number(el.getAttribute(name));

/** Largest mounted window: viewport + overscan (half the viewport) on both sides + a chunk on both sides. */
const maxWindow = (width: number) => width + 2 * (width / 2) + 2 * HORIZONTAL_QUANTUM;

describe('header and static layers (horizontal window)', () => {
  let el: GantryElement;
  let other: GantryElement | undefined;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    el?.remove();
    other?.remove();
    other = undefined;
    vi.restoreAllMocks();
  });

  it('mounts a bounded number of header cells on a 3-year Day timeline, whatever its total width', () => {
    el = mount(span(3));
    const { graph } = getEngine(el);
    const tl = graph.timeline();
    const dayWidth = tl.tiers.at(-1)!.cells[0].width;
    expect(tl.totalWidth).toBeGreaterThan(1000 * dayWidth);
    const bound = 3 * (maxWindow(1000) / dayWidth + 2);
    // The header box keeps the full width; its rows only hold the window
    expect(px($(el, '.g-header')!, 'width')).toBe(tl.totalWidth);
    expect($$(el, '.g-tier')).toHaveLength(tl.tiers.length);

    other = mount(span(6));
    expect(getEngine(other).graph.timeline().totalWidth).toBeGreaterThan(1.9 * tl.totalWidth);

    // Positions where neither window is clamped by the end of its timeline
    for (const left of [0, 20_000, Math.floor(tl.totalWidth / 2)]) {
      scrollTo(el, left);
      scrollTo(other, left);
      const count = $$(el, '.g-cell').length;
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(bound);
      // Per tier: what intersects the window, nothing more
      const { x0, x1 } = graph.hWindow();
      expect(x1 - x0).toBeLessThanOrEqual(maxWindow(1000));
      for (const cell of $$(el, '.g-cell')) {
        expect(px(cell, '--x')).toBeLessThan(x1);
        expect(px(cell, '--x') + px(cell, '--w')).toBeGreaterThan(x0);
      }
      // Doubling the timeline's width does not change what is mounted
      expect($$(other, '.g-cell').length).toBe(count);
      expect($$(other, '.g-cell-label').map(l => l.textContent)).toEqual(
        $$(el, '.g-cell-label').map(l => l.textContent),
      );
    }
  });

  it('keeps every node when scrolling inside one chunk, and only swaps the ends across a chunk', () => {
    el = mount(span(3), { ...DAY, nonWorkingTime: { weekends: true } });
    const { graph } = getEngine(el);
    scrollTo(el, 3000);
    expect(graph.hWindow()).toEqual({ x0: 2304, x1: 4608 });
    const cells = $$(el, '.g-cell');
    const statics = $$(el, '.gantt-bands > rect, .gantt-grid-minor, .gantt-grid-major');
    expect(statics.length).toBeGreaterThan(0);

    // Inside the chunk: no region re-runs, every node stays
    let runs = regionCounter(el);
    scrollTo(el, 3050);
    expect(runs('header')).toBe(0);
    expect(runs('static')).toBe(0);
    expect($$(el, '.g-cell').every((c, i) => c === cells[i])).toBe(true);

    // Across a chunk: header and static re-run once; nodes inside both windows are kept
    runs = regionCounter(el);
    scrollTo(el, 3400);
    expect(graph.hWindow()).toEqual({ x0: 2816, x1: 5120 });
    expect(runs('header')).toBe(1);
    expect(runs('static')).toBe(1);
    for (const region of ['toolbar', 'legend', 'rows', 'bars', 'arrows', 'tasklist']) expect(runs(region)).toBe(0);
    const after = new Set($$(el, '.g-cell'));
    const kept = cells.filter(c => px(c, '--x') + px(c, '--w') > 2816 && c.closest('.g-tier--day'));
    expect(kept.length).toBeGreaterThan(0);
    for (const c of kept) expect(after.has(c)).toBe(true);
    for (const c of cells) if (!after.has(c)) expect(c.isConnected).toBe(false);
    const afterStatics = new Set($$(el, '.gantt-bands > rect, .gantt-grid-minor, .gantt-grid-major'));
    const keptStatics = statics.filter(n => (Number(n.getAttribute('x') ?? n.getAttribute('x1')) || 0) >= 2816 + 48);
    expect(keptStatics.length).toBeGreaterThan(0);
    for (const n of keptStatics) expect(afterStatics.has(n)).toBe(true);
  });

  it('mounts only the bands and grid lines inside the window, keyed, around the row separators', () => {
    el = mount(span(3), {
      ...DAY,
      nonWorkingTime: { weekends: true },
      gridLines: { horizontal: { width: 1 } },
    });
    const { graph, dom } = getEngine(el);
    const check = () => {
      const { x0, x1 } = graph.hWindow();
      const lines = graph.lineWindow();
      expect($$(el, '.gantt-grid-minor').map(l => attr(l, 'x1') - 0.5)).toEqual(lines.minor);
      expect($$(el, '.gantt-grid-major').map(l => attr(l, 'x1') - 0.5)).toEqual(lines.major);
      expect($$(el, '.gantt-bands > rect').map(r => attr(r, 'x'))).toEqual(graph.bandWindow().map(b => b.x));
      for (const r of $$(el, '.gantt-bands > rect')) {
        expect(attr(r, 'x')).toBeLessThan(x1);
        expect(attr(r, 'x') + attr(r, 'width')).toBeGreaterThan(x0);
        expect(attr(r, 'height')).toBe(graph.totalHeight());
      }
      // Grid marker contract: minor lines · <!--rows--> separators · <!--major--> delimiters
      const kinds = [...dom.grid.childNodes].map(n =>
        n.nodeType === Node.COMMENT_NODE ? `<!--${n.textContent}-->` : (n as Element).getAttribute('class'),
      );
      const collapsed = kinds.filter((k, i) => k !== kinds[i - 1]);
      expect(collapsed).toEqual([
        'gantt-grid-minor',
        '<!--rows-->',
        'gantt-grid-row',
        '<!--major-->',
        'gantt-grid-major',
      ]);
    };
    check();
    const all = graph.timeline();
    expect($$(el, '.gantt-grid-minor').length).toBeLessThan(all.minorLines.length / 10);
    expect($$(el, '.gantt-bands > rect').length).toBeLessThan(all.bands.length / 10);
    scrollTo(el, 30_000);
    check();
    scrollTo(el, 30_000 + 700, 36);
    check();
  });

  it('positions cells with --x / --w, borders from headerCellBorder, the current period on the finest tier', () => {
    const now = new Date();
    const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    el = mount([{ id: 'a', name: 'A', start: day(-3), end: day(3) }], DAY);
    const { graph } = getEngine(el);
    const tl = graph.timeline();
    const cfg = graph.config();
    $$(el, '.g-tier').forEach((row, i) => {
      const cells = graph.tierWindows()[i].cells;
      const els = [...row.querySelectorAll<HTMLElement>('.g-cell')];
      expect(els).toHaveLength(cells.length);
      els.forEach((c, k) => {
        const cell = cells[k];
        expect(c.style.getPropertyValue('--x')).toBe(`${cell.x}px`);
        expect(c.style.getPropertyValue('--w')).toBe(`${cell.width}px`);
        expect(c.style.getPropertyValue('left')).toBe('');
        const border = headerCellBorder(cfg, tl, i, cell);
        // happy-dom mangles the shorthand, but keeps the paint
        expect(c.style.getPropertyValue('border-left').includes('var(--gantt-'), `${i}:${k}`).toBe(border !== null);
        expect(c.querySelector('.g-cell-label')?.textContent).toBe(cell.label);
        expect(c.querySelector('.g-cell-label')?.getAttribute('title')).toBe(cell.label);
      });
    });
    // Only the finest tier marks the current period
    expect($$(el, '.g-tier--day .g-cell--current')).toHaveLength(1);
    expect($$(el, '.g-tier--month .g-cell--current')).toHaveLength(0);
    // The stylesheet reads the custom properties
    expect(HEADER_CSS).toMatch(/\.g-cell \{[^}]*left: var\(--x\); width: var\(--w\)/);
  });

  it('keeps the today pointer last, follows the tier count and detaches it when today is hidden', () => {
    const now = new Date();
    const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    el = mount([{ id: 'a', name: 'A', start: day(-3), end: day(3) }], DAY);
    const header = $(el, '.g-header')!;
    const pointer = $(el, '.g-today-pointer')!;
    const classes = () => [...header.children].map(c => c.classList[0]);
    expect(classes()).toEqual(['g-tier', 'g-tier', 'g-today-pointer']);
    expect(pointer.style.getPropertyValue('--x')).toBe(`${getEngine(el).graph.todayX()}px`);

    el.options = { ...DAY, scales: [{ unit: 'year' }, { unit: 'month' }, { unit: 'day' }] };
    flush(el);
    expect(classes()).toEqual(['g-tier', 'g-tier', 'g-tier', 'g-today-pointer']);
    expect($(el, '.g-tier:first-child')?.classList.contains('g-tier--year')).toBe(true);
    expect($(el, '.g-today-pointer')).toBe(pointer);

    el.options = { ...DAY, showToday: false };
    flush(el);
    expect(classes()).toEqual(['g-tier', 'g-tier']);
    expect(pointer.isConnected).toBe(false);
    expect($(el, '.g-header')).toBe(header);
  });

  it('tints the finest tier with the non-working bands of the window only', () => {
    el = mount(span(3), { ...DAY, nonWorkingTime: { weekends: true } });
    const { graph } = getEngine(el);
    scrollTo(el, 10_000);
    const tint = $$(el, '.g-tier--day .g-band');
    expect(tint.map(b => px(b, '--x'))).toEqual(graph.bandWindow().map(b => b.x));
    expect(tint.every(b => b.classList.contains('g-band--weekend'))).toBe(true);
    expect(tint[0]?.style.getPropertyValue('background-color')).toBe('var(--gantt-weekend-bg)');
    expect($$(el, '.g-tier--month .g-band')).toHaveLength(0);
    // Bands sit under the cells of their tier
    const row = $(el, '.g-tier--day')!;
    const firstCell = row.querySelector('.g-cell')!;
    for (const b of tint) expect(b.compareDocumentPosition(firstCell) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    el.options = { ...DAY, nonWorkingTime: { weekends: true, showInHeader: false } };
    flush(el);
    expect($$(el, '.g-band')).toHaveLength(0);
  });

  it('keys bands that start at the same x apart (a highlighted day and its off-hours), with hatch overlays', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const at = (hour: number) => new Date(2026, 2, 2, hour);
    const hour: GanttOptions = {
      viewMode: ViewMode.Hour,
      initialScroll: false,
      highlightTime: (start, unit) =>
        unit === 'day' && start.getMonth() === 2 && start.getDate() === 2 ? { label: 'Offsite' } : null,
    };
    el = mount([{ id: 'a', name: 'A', start: at(8), end: at(13) }], {
      ...hour,
      nonWorkingTime: { workingHours: { start: 9, end: 18 }, style: 'hatch' },
    });
    const { graph, dom } = getEngine(el);
    // The highlighted day starts with a custom band and an off-hours band at the same x
    const bands = graph.timeline().bands;
    const x = bands.find((b, i) => bands.findIndex(o => o.x === b.x) !== i)?.x;
    expect(x).toBeDefined();
    scrollTo(el, x! - 200);
    expect(graph.bandWindow().filter(b => b.x === x)).toHaveLength(2);
    const same = $$(el, '.gantt-bands > rect').filter(r => attr(r, 'x') === x);
    // Both bands are mounted, each followed by its hatch overlay
    expect(same.map(r => r.getAttribute('class')?.split(' ')[1] ?? 'hatch')).toEqual([
      'gantt-band--custom',
      'hatch',
      'gantt-band--off-hours',
      'hatch',
    ]);
    expect(same[1]?.getAttribute('fill')).toBe(`url(#${dom.hatchId})`);
    expect(dom.defs.isConnected).toBe(true);
    expect(errors).not.toHaveBeenCalled();

    el.options = { ...hour, nonWorkingTime: { workingHours: { start: 9, end: 18 } } };
    flush(el);
    expect($$(el, '.gantt-bands > rect:not(.gantt-band)')).toHaveLength(0);
    expect($$(el, '.gantt-bands > rect')).toHaveLength(graph.bandWindow().length);
    expect(dom.defs.isConnected).toBe(false);
  });

  it('mounts the whole timeline while the viewport is not measured', () => {
    el = mount(span(1), { ...DAY, nonWorkingTime: { weekends: true } }, 0);
    const tl = getEngine(el).graph.timeline();
    expect(getEngine(el).graph.hWindow()).toEqual({ x0: 0, x1: tl.totalWidth });
    expect($$(el, '.g-tier--day .g-cell')).toHaveLength(tl.tiers.at(-1)!.cells.length);
    expect($$(el, '.gantt-bands > rect')).toHaveLength(tl.bands.length);
  });
});
