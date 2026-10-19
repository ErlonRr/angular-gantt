// Forced colours (Gantry 2 phase 9, step 5.1, D25) and the focus-ring sweep: the forced-colors
// sheet is one `@media (forced-colors: active)` block, last in the base sheet, made of system
// colours with `!important` (the paints are inline CSSOM styles); it implements the wave-5
// mapping; its selectors match the element's real DOM; the normal sheet is left alone, and every
// focus ring of the element uses `--gantt-focus-ring` (Highlight in forced colours). What the
// browser draws under forced colours is checked in e2e/forced-colors.spec.ts.
import { describe, it, expect, afterEach } from 'vitest';
import { ViewMode, type GanttAnnotation, type GanttTask } from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { BASE_CSS } from '../styles/base';
import { FORCED_COLORS_CSS } from '../styles/forced-colors.css';
import { SPLITTER_CSS } from '../styles/splitter.css';
import '../index';

const FORCED = '(forced-colors: active)';
const SYSTEM = new Set(['Canvas', 'CanvasText', 'Highlight', 'HighlightText', 'GrayText', 'ButtonFace', 'ButtonText']);
/** Properties that take a colour (the `outline` / `border` shorthands too) */
const COLOR_PROP = /^(fill|stroke|color|background-color|outline|outline-color|border|border(-[a-z]+)?-color)$/;

interface Rule {
  /** The enclosing `@media` condition, `null` at the top level */
  readonly media: string | null;
  readonly selectors: readonly string[];
  readonly decls: ReadonlyMap<string, string>;
}

/** The style rules of `css` (comments dropped, `@keyframes` skipped), with their `@media` condition. */
function parse(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  let media: string | null = null;
  let pos = 0;
  for (;;) {
    const open = src.indexOf('{', pos);
    const close = src.indexOf('}', pos);
    if (close >= 0 && (open < 0 || close < open)) {
      // The end of the enclosing @media block
      media = null;
      pos = close + 1;
      continue;
    }
    if (open < 0) break;
    const prelude = src.slice(pos, open).trim();
    if (prelude.startsWith('@media')) {
      media = prelude.slice('@media'.length).trim();
      pos = open + 1;
      continue;
    }
    if (prelude.startsWith('@keyframes')) {
      let depth = 1;
      let j = open + 1;
      for (; depth > 0; j++) depth += src[j] === '{' ? 1 : src[j] === '}' ? -1 : 0;
      pos = j;
      continue;
    }
    const end = src.indexOf('}', open);
    const decls = new Map<string, string>();
    for (const d of src.slice(open + 1, end).split(';')) {
      const colon = d.indexOf(':');
      if (colon > 0) decls.set(d.slice(0, colon).trim(), d.slice(colon + 1).trim());
    }
    const selectors = prelude.split(',').map(s => s.trim().replace(/\s+/g, ' '));
    rules.push({ media, selectors, decls });
    pos = end + 1;
  }
  return rules;
}

const ALL = parse(BASE_CSS);
const FORCED_RULES = ALL.filter(r => r.media === FORCED);
const NORMAL_RULES = ALL.filter(r => r.media !== FORCED);

/** The declarations the forced-colors rules give `selector` (exact selector, later rules win). */
function forced(selector: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of FORCED_RULES) if (r.selectors.includes(selector)) for (const [k, v] of r.decls) out.set(k, v);
  return out;
}

const value = (v: string | undefined) => v?.replace(/\s*!important$/, '');

describe('forced-colors sheet', () => {
  it('is one @media (forced-colors: active) block, last in the base sheet, and nothing else', () => {
    const text = FORCED_COLORS_CSS.trim();
    expect(text.startsWith(`@media ${FORCED} {`)).toBe(true);
    expect(text.endsWith('}')).toBe(true);
    expect(BASE_CSS.endsWith(FORCED_COLORS_CSS)).toBe(true);
    // Every rule of the module is inside the block; the block is the only forced-colors query
    expect(parse(FORCED_COLORS_CSS).every(r => r.media === FORCED)).toBe(true);
    expect(BASE_CSS.split('forced-colors: active').length).toBe(2);
    expect(FORCED_RULES.length).toBeGreaterThan(30);
  });

  it('uses system colours only, each with !important (the paints are inline styles)', () => {
    expect(FORCED_COLORS_CSS).not.toContain('var(');
    const colours: string[] = [];
    for (const r of FORCED_RULES) {
      for (const [prop, v] of r.decls) {
        if (!COLOR_PROP.test(prop)) continue;
        colours.push(`${r.selectors[0]} ${prop}`);
        expect(v, `${r.selectors[0]} { ${prop} }`).toMatch(/ !important$/);
        // The colour is the last word of a shorthand (outline: 1px solid CanvasText)
        const colour = value(v)!.split(' ').at(-1)!;
        expect(SYSTEM.has(colour) || colour === 'transparent', `${r.selectors[0]} { ${prop}: ${v} }`).toBe(true);
      }
    }
    expect(colours.length).toBeGreaterThan(50);
  });

  it.each([
    // Bars
    ['.gantt-bar-body', { fill: 'ButtonFace', stroke: 'ButtonText', 'stroke-width': '1.5px' }],
    ['.gantt-bar-progress', { fill: 'ButtonText', 'fill-opacity': '0.45' }],
    ['.gantt-bar-caps', { fill: 'ButtonText' }],
    ['.gantt-bar[aria-selected="true"] > .gantt-bar-body', { stroke: 'Highlight', 'stroke-width': '2.5px' }],
    ['.gantt-bar--critical > .gantt-bar-body', { 'stroke-dasharray': '4 2', 'stroke-width': '2px' }],
    ['.gantt-bar-label', { fill: 'ButtonText' }],
    ['.gantt-bar-label--outside', { fill: 'CanvasText' }],
    ['.gantt-bar-baseline', { stroke: 'GrayText' }],
    // Lines, bands, annotations, today
    ['.gantt-arrow path', { stroke: 'CanvasText' }],
    ['.gantt-arrow polygon', { fill: 'CanvasText' }],
    ['.gantt-today', { stroke: 'Highlight' }],
    ['.gantt-annotations rect', { fill: 'GrayText' }],
    ['.gantt-annotations line', { stroke: 'GrayText' }],
    ['.gantt-grid line', { stroke: 'GrayText' }],
    ['.gantt-band', { fill: 'GrayText', 'fill-opacity': '0.15' }],
    ['.g-band', { 'background-color': 'GrayText', opacity: '0.15' }],
    ['.gantt-rows > rect', { fill: 'Canvas' }],
    // Current header cell, selected row, today in the header
    ['.g-cell--current', { 'background-color': 'Highlight', color: 'HighlightText' }],
    ['.g-cell--current .g-cell-label', { color: 'HighlightText' }],
    ['.gantt-tl-row--selected', { 'background-color': 'Highlight', color: 'HighlightText', 'box-shadow': 'none' }],
    ['.gantt-tl-row--selected *', { color: 'HighlightText' }],
    ['.g-marker--today::before', { 'background-color': 'Highlight' }],
    ['.g-marker--today .g-marker-label', { 'background-color': 'Highlight', color: 'HighlightText' }],
    ['.g-today-pointer', { color: 'Highlight', 'border-color': 'transparent', 'border-top-color': 'Highlight' }],
    // Focus rings, the bar overlay, the checked radio
    ['.gantt-bar-focus-ring', { stroke: 'Highlight' }],
    ['.gantt-bar-grip', { fill: 'Canvas', stroke: 'Highlight' }],
    ['.gantry-splitter-handle:focus-visible::before', { 'background-color': 'Highlight', width: '3px' }],
    ['.gantt-tb-pill[aria-checked="true"]', { 'background-color': 'Highlight', color: 'HighlightText' }],
    ['.gantt-tb-menu-item[aria-checked="true"]', { 'background-color': 'Highlight', color: 'HighlightText' }],
    ['.gantt-tb-btn[aria-pressed="true"]', { color: 'Highlight', 'border-color': 'Highlight' }],
    ['.gantt-tb-menu', { 'background-color': 'Canvas', color: 'CanvasText', 'border-color': 'CanvasText' }],
    // Tooltip, readout chip, state box, skeleton
    ['.gantt-tooltip', { 'background-color': 'Canvas', color: 'CanvasText', 'border-color': 'CanvasText' }],
    ['.gantt-drag-readout', { 'background-color': 'Canvas', color: 'CanvasText', 'border-color': 'CanvasText' }],
    ['.gantt-state-box', { 'background-color': 'Canvas', 'border-color': 'CanvasText', 'border-style': 'solid' }],
    ['.gantt-skeleton-bar', { 'background-color': 'GrayText' }],
    // Legend swatches: as the canvas draws them
    ['.gantt-legend-swatch--line > line', { stroke: 'Highlight' }],
    ['.gantt-legend-swatch--dashed > line', { stroke: 'GrayText' }],
    ['.gantt-legend-swatch--bar > rect', { fill: 'ButtonFace', stroke: 'ButtonText', 'stroke-dasharray': '4 2' }],
  ] as const)('maps %s', (selector, expected) => {
    const decls = forced(selector);
    for (const [prop, v] of Object.entries(expected)) expect(value(decls.get(prop)), prop).toBe(v);
  });

  it('opts what has a Highlight background out of the text backplate, with every colour of its subtree set', () => {
    for (const selector of [
      '.g-cell--current',
      '.g-marker--today .g-marker-label',
      '.gantt-tl-row--selected',
      '.gantt-tb-pill[aria-checked="true"]',
      '.gantt-tb-menu-item[aria-checked="true"]',
      '.g-today-pointer',
    ])
      expect(forced(selector).get('forced-color-adjust'), selector).toBe('none');
    // forced-color-adjust none is inherited: the selected row's descendants get their text and borders back
    expect(value(forced('.gantt-tl-row--selected *').get('border-color'))).toBe('CanvasText');
    expect(value(forced('.g-cell--current').get('border-color'))).toBe('CanvasText');
    // Nothing else opts out
    const optedOut = FORCED_RULES.filter(r => r.decls.has('forced-color-adjust')).flatMap(r => r.selectors);
    expect(optedOut.sort()).toEqual(
      [
        '.g-cell--current',
        '.g-marker--today .g-marker-label',
        '.g-today-pointer',
        '.gantt-tb-pill[aria-checked="true"]',
        '.gantt-tb-menu-item[aria-checked="true"]',
        '.gantt-tl-row--selected',
      ].sort(),
    );
  });
});

describe('focus rings', () => {
  /** The normal-mode rules for keyboard focus, with what they draw. */
  const focusRules = NORMAL_RULES.filter(r => r.selectors.some(s => s.includes(':focus-visible')));

  it('every focus ring of the element uses --gantt-focus-ring, never --gantt-sel-border', () => {
    expect(focusRules.length).toBeGreaterThan(5);
    for (const r of focusRules) {
      const drawn = [...r.decls].filter(([prop]) => prop === 'outline' || prop === 'background');
      for (const [prop, v] of drawn) {
        if (v === 'none') continue;
        expect(v, `${r.selectors.join(', ')} { ${prop} }`).toContain('var(--gantt-focus-ring)');
        expect(v).not.toContain('--gantt-sel-border');
      }
    }
    // The splitter: the separator's focus line and the toggle's ring (hover keeps the selection colour)
    expect(SPLITTER_CSS).toContain(
      '.gantry-splitter-toggle:focus-visible { opacity: 1; outline: 2px solid var(--gantt-focus-ring); outline-offset: 1px; }',
    );
    expect(SPLITTER_CSS).toMatch(
      /\.gantry-splitter-handle:focus-visible \{\s*background: linear-gradient\([^)]*var\(--gantt-focus-ring\)/,
    );
    expect(SPLITTER_CSS).toMatch(
      /\.gantry-splitter:hover, \.gantry-main\.is-resizing \.gantry-splitter \{\s*background: linear-gradient\([^)]*var\(--gantt-sel-border\)/,
    );
    // The bar overlay
    expect(BASE_CSS).toContain(
      '.gantt-bar-focus-ring { fill: none; stroke: var(--gantt-focus-ring); stroke-width: 2px; }',
    );
  });

  it('every outline ring turns Highlight under forced colours (HighlightText inside the selected row)', () => {
    const rings = focusRules
      .filter(r => r.decls.has('outline') && r.decls.get('outline') !== 'none')
      .flatMap(r => r.selectors);
    expect(rings).toEqual(
      expect.arrayContaining([
        '.gantt-tb-btn:focus-visible',
        '.gantt-tl-row:focus-visible',
        '.gantry-splitter-toggle:focus-visible',
      ]),
    );
    for (const selector of rings) expect(value(forced(selector).get('outline-color')), selector).toBe('Highlight');
    for (const selector of [
      '.gantt-tl-row--selected:focus-visible',
      '.gantt-tl-row--selected .gantt-tl-cell:focus-visible',
    ])
      expect(value(forced(selector).get('outline-color')), selector).toBe('HighlightText');
  });
});

describe('normal mode', () => {
  it('has no system colour, no forced-color-adjust and no new !important outside the forced block', () => {
    const normal = BASE_CSS.slice(0, BASE_CSS.length - FORCED_COLORS_CSS.length);
    for (const name of SYSTEM) expect(normal, name).not.toMatch(new RegExp(`:\\s*${name}\\b`));
    expect(normal).not.toContain('forced-color-adjust');
    // The toolbar's view group is the only one (it was before forced colours)
    expect(normal.match(/!important/g)).toEqual(['!important']);
    expect(normal).toContain('.gantt-tb-views { margin-left: auto; border-left: none !important; }');
  });
});

describe('forced-colors selectors match the element', () => {
  const now = new Date();
  const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const TASKS = (): GanttTask[] => [
    { id: 'g', name: 'Group', type: 'group', start: day(-4), end: day(8), progress: 40 },
    {
      id: 'a',
      name: 'Alpha',
      parentId: 'g',
      start: day(-4),
      end: day(2),
      progress: 50,
      status: 'inProgress',
      baseline: { start: day(-5), end: day(1) },
    },
    { id: 'b', name: 'Beta', parentId: 'g', start: day(2), end: day(8), dependency: 'a' },
    { id: 'c', name: 'Side', start: day(-2), end: day(0) },
    { id: 'm', name: 'Launch', type: 'milestone', start: day(9), end: day(9), dependency: 'b' },
  ];
  const ANNOTATIONS = (): GanttAnnotation[] => [
    { x1: day(-3), label: { text: 'Kickoff' } },
    { x1: day(4), x2: day(5), opacity: 0.15 },
  ];
  let el: GantryElement | undefined;
  afterEach(() => el?.remove());

  it('the canvas, header, task list, toolbar and legend rules reach their nodes', () => {
    el = document.createElement('gantry-element');
    el.style.height = '400px';
    Object.assign(el, {
      tasks: TASKS(),
      annotations: ANNOTATIONS(),
      showToolbar: true,
      showLegend: true,
      options: {
        viewMode: ViewMode.Day,
        initialScroll: false,
        criticalPath: true,
        baseline: true,
        showToday: true,
        nonWorkingTime: { weekends: true },
        panel: { columns: ['name', 'status'] },
      },
    });
    document.body.appendChild(el);
    el.setSelectedTasks(['c']);
    getEngine(el).flushSync();
    const root = el.shadowRoot!;
    const missing = [
      '.gantt-rows > rect',
      '.gantt-band',
      '.gantt-grid line',
      '.gantt-annotations rect',
      '.gantt-annotations line',
      '.gantt-today',
      '.gantt-arrow path',
      '.gantt-arrow polygon',
      '.gantt-bar-body',
      '.gantt-bar-progress',
      '.gantt-bar-baseline',
      '.gantt-bar-label',
      '.gantt-bar--critical > .gantt-bar-body',
      '.gantt-bar[aria-selected="true"] > .gantt-bar-body',
      '.g-cell--current .g-cell-label',
      '.g-band',
      '.g-marker--today .g-marker-label',
      '.g-marker--annotation',
      '.g-today-pointer',
      '.gantt-tl-row--selected',
      '.gantt-tl-status-dot',
      '.gantt-tb-pill[aria-checked="true"]',
      '.gantry-splitter-handle',
      '.gantt-legend-swatch--line > line',
      '.gantt-legend-swatch--dashed > line',
      '.gantt-legend-swatch--bar > rect',
      '.gantt-legend-swatch--strip > rect',
    ].filter(selector => !root.querySelector(selector));
    expect(missing).toEqual([]);
    // The selected bar is not on the critical path; the critical bars are built-in bars
    expect(root.querySelector('.gantt-bar[aria-selected="true"]')?.getAttribute('data-task-id')).toBe('c');
    expect(root.querySelectorAll('.gantt-bar--critical > .gantt-bar-body').length).toBeGreaterThan(1);
  });
});
