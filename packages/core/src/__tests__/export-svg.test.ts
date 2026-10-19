// ─────────────────────────────────────────────────────────────
//  Tests — the SVG serializer (`renderExportSvg`, Phase 12 D2–D4, D19,
//  D28) on hand-built models: document order (plan §3d), ids under the
//  prefix, role / title / desc / lang, no `var(` / `<style>` /
//  `foreignObject` / scripts (custom markup included), numbers to 2
//  decimals, escaping, background, scale, prolog, hatch, the table,
//  the views, the empty state, and slices (printed pages)
// ─────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { renderExportSvg, type ExportSlice, type RenderSvgOptions } from '../export/svg';
import type { ExportModel, ExportRow } from '../export/model';
import type { ExportBar, ExportTimeline } from '../export/timeline';
import type { ExportTable, ExportCell } from '../export/table';
import type { ExportLegend } from '../export/legend';
import { roundedRectPath, type BarVisual } from '../render/bars';
import { LightTheme, todayLabelColor } from '../render/theme';
import { HATCH_PATTERN } from '../render/paint';
import { longDecimals, xmlErrors } from './export-fixtures';

const theme = LightTheme;
const OPTS: RenderSvgOptions = { idPrefix: 'gx', scale: 1, prolog: false };

const bar = (over: Partial<BarVisual> = {}): BarVisual => ({
  kind: 'task',
  x: 110.123,
  y: 6,
  width: 100.456,
  height: 24,
  cy: 18,
  rx: 4,
  path: roundedRectPath(110.123, 6, 100.456, 24, 4),
  tone: 'default',
  paint: { body: 'var(--gantt-bar)', progress: '#0F172A', label: 'var(--gantt-bar-text-on-bar)' },
  progress: { path: 'M110.123,6H150.5V30H110.123Z', opacity: 0.35 },
  label: { text: 'Build & <ship>', x: 160.333, y: 18, anchor: 'middle', inside: true },
  baseline: { x: 108, width: 90, y: 32 },
  caps: null,
  handles: null,
  progressGrip: null,
  connectors: null,
  focusRect: { x: 0, y: 0, width: 0, height: 0, rx: 0 },
  hitBox: { x: 0, y: 0, width: 0, height: 0 },
  className: null,
  segments: null,
  ...over,
});

const ROW_IDS = ['a', 'b"<&', 'c'];
const rows = (): ExportRow[] =>
  ROW_IDS.map((id, i) => ({
    id,
    y: i * 36,
    height: 36,
    fill: i % 2 ? theme.rowBgAlt : theme.rowBg,
    separator: { stroke: theme.gridLine, width: 1, dash: null },
  }));

const cell = (over: Partial<ExportCell>): ExportCell => ({
  text: '',
  title: '',
  x: 0,
  anchor: 'start',
  fill: theme.textSecondary,
  indent: 0,
  chevron: null,
  icon: null,
  dot: null,
  ...over,
});

const table = (): ExportTable => ({
  width: 200,
  header: {
    fill: theme.headerBackground,
    cells: [
      { key: 'name', x: 0, width: 140, label: { text: 'Task Name', x: 8, anchor: 'start' } },
      { key: 'status', x: 140, width: 60, label: { text: 'Status', x: 169.5, anchor: 'middle' } },
    ],
    border: { stroke: theme.borderColor, width: 1, dash: null },
  },
  rows: [
    {
      id: 'a',
      cells: [
        cell({ text: 'Group', title: 'Group', x: 58, chevron: 'open', icon: { kind: 'group', fill: theme.textMuted } }),
        cell({ text: 'Done', title: 'Done', x: 158, dot: { cx: 152, r: 4, fill: 'var(--gantt-status-done)' } }),
      ],
    },
    {
      id: 'b"<&',
      cells: [
        cell({
          text: 'A very lo…',
          title: 'A very long name',
          x: 74,
          indent: 16,
          icon: { kind: 'task', fill: '#123456' },
        }),
        cell({ text: '', title: '', x: 148 }),
      ],
    },
    {
      id: 'c',
      cells: [
        cell({
          text: 'Ship',
          title: 'Ship',
          x: 58,
          chevron: 'closed',
          icon: { kind: 'milestone', fill: theme.textMuted },
        }),
        cell({ text: '–', title: '–', x: 191, anchor: 'end' }),
      ],
    },
  ],
  border: { stroke: theme.borderColor, width: 1, dash: null },
});

const CUSTOM =
  '<?xml version="1.0"?><g class="mine" onclick="steal()"><script>alert(1)</script>' +
  '<rect x="300" y="78" width="40" height="24" fill="var(--gantt-milestone)" style="stroke: var(--app-x, #F59E0B)"/>' +
  '<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject>' +
  '<style>rect { fill: red }</style><a href="javascript:alert(2)"><text x="1" y="2">x</text></a></g>';

const timeline = (): ExportTimeline => ({
  x: 200,
  x0: 100,
  x1: 500,
  width: 400,
  tiers: [
    {
      y: 0,
      height: 28,
      unit: 'month',
      cells: [
        { x: 0, width: 300, label: { text: 'February 2026', x: 106, anchor: 'start' }, current: false, border: null },
        {
          x: 300,
          width: 300,
          label: { text: 'March 2026', x: 306, anchor: 'start' },
          current: false,
          border: { stroke: theme.borderColor, width: 1, dash: null },
        },
      ],
      bands: [],
    },
    {
      y: 28,
      height: 28,
      unit: 'day',
      cells: [100, 150, 200, 250, 300, 350, 400, 450].map(x => ({
        x,
        width: 50,
        label: { text: String(x / 50), x: x + 25, anchor: 'middle' as const },
        current: x === 250,
        border: { stroke: theme.gridLine, width: 1, dash: null },
      })),
      bands: [{ x: 150, y: 28, width: 50, height: 28, fill: '#EEEEEE' }],
    },
  ],
  lane: {
    y: 56,
    height: 18,
    markers: [
      { x: 260, stroke: theme.todayColor, label: { text: 'Today', x: 264, width: 40, fill: '#990000' }, kind: 'today' },
      { x: 320, stroke: '#7C3AED', label: null, kind: 'annotation' },
    ],
  },
  todayPointer: 260,
  bands: [
    { x: 150, width: 50, fill: '#EEEEEE', hatch: true },
    { x: 400, width: 50, fill: '#EEEEEE', hatch: false },
    { x: 900, width: 50, fill: '#EEEEEE', hatch: false },
  ],
  minor: { stroke: theme.gridLine, width: 1, dash: null, xs: [100, 150, 200, 250, 350, 400, 450, 950] },
  major: { stroke: theme.borderColor, width: 1, dash: '4 2', xs: [300] },
  todayX: 260,
  annotations: [
    {
      key: '0',
      paint: '#7C3AED',
      region: { x: 320, y: 0, width: 60, height: 108, opacity: 0.1 },
      line: { x: 320, y1: 0, y2: 108, strokeWidth: 1, dash: '4 3', opacity: 0.8 },
      label: { text: 'Freeze', x: 326, y: 14, fontSize: 11, fontWeight: 600, paint: '#7C3AED' },
    },
  ],
  arrows: [
    {
      d: 'M210.579,18H230.25V54H250',
      head: '250,54 244,51 244,57',
      paint: 'var(--gantt-arrow)',
      width: 1.5,
      dashed: true,
      dash: '5 3',
      critical: true,
      lagLabel: { text: '+2d', x: 234, y: 36, fontPx: 10 },
      points: [
        [210.579, 18],
        [230.25, 18],
        [230.25, 54],
        [250, 54],
      ],
      selected: false,
      halo: null,
    },
  ],
  bars: [
    { id: 'a', kind: 'task', visual: bar(), critical: false, markup: null },
    {
      id: 'b"<&',
      kind: 'group',
      visual: bar({
        kind: 'group',
        y: 42,
        cy: 54,
        path: 'M250,42H450V54H250Z',
        caps: 'M250,54l6,6v-6ZM450,54l-6,6v-6Z',
        segments: [{ x: 260, width: 40, paint: '#0EA5E9' }],
        progress: null,
        baseline: null,
        label: { text: 'Group', x: 456, y: 54, anchor: 'start', inside: false },
        className: 'my-style',
      }),
      critical: true,
      markup: null,
    },
    { id: 'c', kind: 'milestone', visual: bar({ kind: 'milestone', y: 78, cy: 90 }), critical: false, markup: CUSTOM },
  ],
});

const legend = (): ExportLegend => ({
  y: 182,
  height: 29,
  title: { text: 'LEGEND', x: 12, y: 7 },
  items: [
    {
      x: 70,
      y: 7,
      swatch: { kind: 'line', x: 9, y1: 0, y2: 12, strokeWidth: 2, dash: '3 2', fill: theme.todayColor },
      label: { text: 'Today', x: 93 },
    },
    {
      x: 150,
      y: 7,
      swatch: { kind: 'rect', x: 1, y: 3, width: 16, height: 6, rx: 2, fill: theme.criticalColor, dash: null },
      label: { text: 'Critical path', x: 173 },
    },
  ],
});

const model = (over: Partial<ExportModel> = {}): ExportModel => ({
  width: 600,
  height: 211,
  theme,
  background: theme.backgroundColor,
  fontFamily: "'Inter', system-ui, sans-serif",
  fontPx: 12,
  title: 'Plan <Q1>',
  description: 'Three tasks & a milestone',
  lang: 'en-US',
  headerHeight: 74,
  bodyHeight: 108,
  rows: rows(),
  table: table(),
  timeline: timeline(),
  legend: legend(),
  empty: null,
  ...over,
});

/** The elements one level under the root: `tag.class`. */
const topLevel = (svg: string): string[] =>
  [...svg.matchAll(/^ <([\w]+)(?=[\s/>])(?:[^>]*?\bclass="([^"]*)")?/gm)].map(m => (m[2] ? `${m[1]}.${m[2]}` : m[1]));

/** The groups directly inside `g.gantt-body`, in order. */
const bodyGroups = (svg: string): string[] => {
  const body = svg.slice(svg.indexOf('class="gantt-body"'));
  const indent = /\n( +)</.exec(body)![1];
  return [...body.matchAll(new RegExp(`^${indent}<(\\w+)[^>]*?class="([^"]*)"`, 'gm'))].map(m => `${m[1]}.${m[2]}`);
};

/** Every `id="…"` of a document. */
const ids = (svg: string) => [...svg.matchAll(/\sid="([^"]*)"/g)].map(m => m[1]);

const contentInvariants = (svg: string) => {
  expect(xmlErrors(svg)).toEqual([]);
  expect(svg).not.toContain('var(');
  expect(svg).not.toMatch(/<style|foreignObject|<script|\son\w+=|javascript:/i);
  expect(longDecimals(svg)).toEqual([]);
};

describe('renderExportSvg: the document', () => {
  const svg = renderExportSvg(model(), null, OPTS);

  it('is a well-formed image with no var(, <style>, foreignObject or script, numbers to 2 decimals', () => {
    contentInvariants(svg);
  });

  it('the root: size, viewBox, role img labelled by title and desc, lang, font, class', () => {
    const root = svg.slice(0, svg.indexOf('>') + 1);
    expect(root).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="211" viewBox="0 0 600 211" role="img" ' +
        'aria-labelledby="gx-title gx-desc" lang="en-US" font-family="&apos;Inter&apos;, system-ui, sans-serif" ' +
        'font-size="12" class="gantry-export">',
    );
    expect(svg).toContain('<title id="gx-title">Plan &lt;Q1&gt;</title>');
    expect(svg).toContain('<desc id="gx-desc">Three tasks &amp; a milestone</desc>');
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('draws its parts in the §3d order', () => {
    expect(topLevel(svg)).toEqual([
      'title',
      'desc',
      'defs',
      'rect.gantry-export-bg',
      'g.gantry-export-table',
      'g.gantry-export-timeline',
      'g.gantt-legend',
    ]);
    expect(bodyGroups(svg)).toEqual([
      'g.gantt-rows',
      'g.gantt-bands',
      'g.gantt-grid',
      'g.gantt-annotations',
      'line.gantt-today',
      'g.gantt-arrows',
      'g.gantt-bars-layer',
      'g.gantt-annotation-labels',
    ]);
  });

  it('every id is under the prefix, unique, and every reference points at one', () => {
    const all = ids(svg);
    expect(all).toEqual(['gx-title', 'gx-desc', 'gx-timeline', 'gx-hatch']);
    for (const [, ref] of svg.matchAll(/url\(#([^)]*)\)/g)) expect(all).toContain(ref);
  });

  it('the timeline is clipped to x0…x1 and moved to its left edge, then by −x0', () => {
    expect(svg).toContain('<clipPath id="gx-timeline">\n   <rect x="0" y="0" width="400" height="182"/>');
    expect(svg).toContain(
      '<g class="gantry-export-timeline" clip-path="url(#gx-timeline)" transform="translate(200,0)">\n  <g transform="translate(-100,0)">',
    );
    expect(svg).toContain('<g class="gantt-body" transform="translate(0,74)">');
  });

  it('the hatch pattern is core’s, referenced by the hatched bands only', () => {
    const h = HATCH_PATTERN;
    expect(svg).toContain(
      `<pattern id="gx-hatch" width="${h.size}" height="${h.size}" patternUnits="userSpaceOnUse" patternTransform="rotate(${h.rotate})">`,
    );
    expect(svg).toContain(
      `stroke="${theme.textMuted}" stroke-width="${h.strokeWidth}" stroke-opacity="${h.strokeOpacity}"`,
    );
    expect(svg.match(/fill="url\(#gx-hatch\)"/g)).toHaveLength(1);
    // Off the drawn range: the band at 900 and the minor line at 950 are left out
    expect(svg).not.toContain('x="900"');
    expect(svg).not.toContain('x1="950.5"');
    const plain = renderExportSvg(
      model({ timeline: { ...timeline(), bands: [{ x: 150, width: 50, fill: '#EEEEEE', hatch: false }] } }),
      null,
      OPTS,
    );
    expect(plain).not.toContain('<pattern');
    expect(ids(plain)).not.toContain('gx-hatch');
  });

  it('rows, separators, grid lines and the today line span the body', () => {
    expect(svg).toContain(
      `<rect x="100" y="36" width="400" height="36" fill="${theme.rowBgAlt}" data-task-id="b&quot;&lt;&amp;"/>`,
    );
    expect(svg).toContain(
      `<g class="gantt-grid-rows" stroke="${theme.gridLine}" stroke-width="1">\n      <line x1="100" y1="35.5" x2="500" y2="35.5"/>`,
    );
    expect(svg).toContain(
      `<g class="gantt-grid-major" stroke="${theme.borderColor}" stroke-width="1" stroke-dasharray="4 2">\n      <line x1="300.5" y1="0" x2="300.5" y2="108"/>`,
    );
    const grid = svg.slice(svg.indexOf('<g class="gantt-grid"'), svg.indexOf('<g class="gantt-annotations"'));
    expect([...grid.matchAll(/<g class="([^"]*)"/g)].map(m => m[1])).toEqual([
      'gantt-grid',
      'gantt-grid-minor',
      'gantt-grid-rows',
      'gantt-grid-major',
    ]);
    expect(svg).toContain(
      `<line class="gantt-today" x1="260" y1="0" x2="260" y2="108" stroke="${theme.todayColor}" stroke-width="2"/>`,
    );
  });

  it('a row separator unlike the first one keeps its own stroke', () => {
    const own = rows().map((r, i) => (i === 2 ? { ...r, separator: { stroke: '#FF0000', width: 2, dash: '2 2' } } : r));
    const out = renderExportSvg(model({ rows: own }), null, OPTS);
    expect(out).toContain('<line x1="100" y1="35.5" x2="500" y2="35.5"/>');
    expect(out).toContain(
      '<line x1="100" y1="107.5" x2="500" y2="107.5" stroke="#FF0000" stroke-width="2" stroke-dasharray="2 2"/>',
    );
    const none = renderExportSvg(model({ rows: rows().map(r => ({ ...r, separator: null })) }), null, OPTS);
    expect(none).not.toContain('gantt-grid-rows');
  });

  it('a bar: body, segments, caps, progress, baseline, label — paints concrete, numbers rounded', () => {
    const a = svg.slice(svg.indexOf('<g class="gantt-bar gantt-bar--task" data-task-id="a">'));
    const parts = [...a.slice(0, a.indexOf('</g>')).matchAll(/<(\w+) class="([^"]*)"/g)].map(m => m[2]);
    expect(parts).toEqual([
      'gantt-bar gantt-bar--task',
      'gantt-bar-body',
      'gantt-bar-progress',
      'gantt-bar-baseline',
      'gantt-bar-label',
    ]);
    expect(a).toContain(
      `<path class="gantt-bar-body" d="M114.12,6H206.58A4,4 0 0 1 210.58,10V26A4,4 0 0 1 206.58,30H114.12A4,4 0 0 1 110.12,26V10A4,4 0 0 1 114.12,6Z" fill="${theme.barColor}"/>`,
    );
    expect(a).toContain(
      '<path class="gantt-bar-progress" d="M110.12,6H150.5V30H110.12Z" fill="#0F172A" fill-opacity="0.35"/>',
    );
    expect(a).toContain(
      `stroke="${theme.baselineColor}" stroke-width="2" stroke-dasharray="5 3" stroke-linecap="round"`,
    );
    expect(a).toContain('<text class="gantt-bar-label" x="160.33" y="22.2" font-size="12" text-anchor="middle"');
    expect(a).toContain('>Build &amp; &lt;ship&gt;</text>');

    const g = svg.slice(
      svg.indexOf(
        '<g class="gantt-bar gantt-bar--group gantt-bar--critical my-style" data-task-id="b&quot;&lt;&amp;">',
      ),
    );
    const gParts = [...g.slice(0, g.indexOf('</g>')).matchAll(/<(\w+) class="([^"]*)"/g)].map(m => m[2]);
    expect(gParts).toEqual([
      'gantt-bar gantt-bar--group gantt-bar--critical my-style',
      'gantt-bar-body',
      'gantt-bar-segment',
      'gantt-bar-caps',
      'gantt-bar-label gantt-bar-label--outside',
    ]);
    expect(g).toContain(
      '<rect class="gantt-bar-segment" x="260" y="42" width="40" height="24" rx="4" fill="#0EA5E9"/>',
    );
    expect(g).toContain('font-weight="500"');
  });

  it('custom markup: theme inlined, scripts, foreignObject, styles, handlers and javascript: links dropped', () => {
    const c = svg.slice(svg.indexOf('gantt-bar--milestone" data-task-id="c"'));
    const markup = c.slice(c.indexOf('\n') + 1, c.indexOf('</g>\n'));
    expect(markup).toContain(
      `<rect x="300" y="78" width="40" height="24" fill="${theme.milestoneColor}" style="stroke: #F59E0B"/>`,
    );
    expect(markup).toContain('<g class="mine">');
    expect(markup).toContain('<a><text x="1" y="2">x</text></a>');
    expect(markup).not.toMatch(/script|foreignObject|style>|onclick|<\?xml|javascript/);
  });

  it('custom markup: only whole attributes are dropped, values are never read as names', () => {
    const markup =
      '<g class="a onx" data-x="1 onload=2" ONCLICK="x()" onmouseover=y>' +
      '<a xlink:href=" javascript:void(0)" href="https://example.com/?a=1&amp;b=2"><rect width="1" height="1"/></a></g>';
    const bars = timeline().bars.map(b => (b.id === 'c' ? { ...b, markup } : b));
    const out = renderExportSvg(model({ timeline: { ...timeline(), bars } }), null, OPTS);
    expect(out).toContain(
      // A remote link goes too (nothing in an export points outside it)
      '<g class="a onx" data-x="1 onload=2"><a><rect width="1" height="1"/></a></g>',
    );
    expect(xmlErrors(out)).toEqual([]);
  });

  it('a link: path, head and lag label in its paint, dashed', () => {
    expect(svg).toContain(`<g class="gantt-arrow gantt-arrow--critical">`);
    expect(svg).toContain(
      `<path d="M210.58,18H230.25V54H250" fill="none" stroke="${theme.arrowColor}" stroke-width="1.5" stroke-dasharray="5 3" stroke-linejoin="round" stroke-linecap="round"/>`,
    );
    expect(svg).toContain(`<polygon points="250,54 244,51 244,57" fill="${theme.arrowColor}"/>`);
    expect(svg).toContain(`<text x="234" y="39.5" font-size="10" opacity="0.85" fill="${theme.arrowColor}">+2d</text>`);
  });

  it('annotations: region and line under the bars, the label above them', () => {
    expect(svg).toContain('<rect x="320" y="0" width="60" height="108" opacity="0.1" fill="#7C3AED"/>');
    expect(svg).toContain(
      '<line x1="320" y1="0" x2="320" y2="108" stroke="#7C3AED" stroke-width="1" stroke-dasharray="4 3" opacity="0.8"/>',
    );
    expect(svg).toContain('<text x="326" y="14" font-size="11" font-weight="600" fill="#7C3AED">Freeze</text>');
  });

  it('the header: tiers with bands, the current tint, borders, labels; the marker lane; the today pointer', () => {
    expect(svg).toContain(
      `<rect class="g-header-bg" x="100" y="0" width="400" height="74" fill="${theme.headerBackground}"/>`,
    );
    expect(svg).toContain('<g class="g-tier g-tier--month">');
    expect(svg).toContain('<rect class="g-band" x="150" y="28" width="50" height="28" fill="#EEEEEE"/>');
    expect(svg).toContain(
      `<rect class="g-cell--current" x="250" y="28" width="50" height="28" fill="${theme.todayColor}" fill-opacity="0.14"/>`,
    );
    // First tier: the theme font size (13 px), bold, primary text; the others 1 px smaller, secondary
    expect(svg).toContain(
      `<text class="g-cell-label" x="106" y="18.55" font-size="13" font-weight="600" fill="${theme.textPrimary}">February 2026</text>`,
    );
    expect(svg).toContain(
      `<text class="g-cell-label" x="125" y="46.2" text-anchor="middle" font-size="12" fill="${theme.textSecondary}">2</text>`,
    );
    expect(svg).toContain(`font-size="12" font-weight="600" fill="${todayLabelColor(theme)}">5</text>`);
    expect(svg).toContain('<g class="g-marker g-marker--today">');
    expect(svg).toContain(
      `<rect x="264" y="58" width="40" height="14" rx="3" fill="${theme.todayColor}" fill-opacity="0.14"/>`,
    );
    expect(svg).toContain(
      '<text class="g-marker-label" x="268" y="68.85" font-size="11" font-weight="600" fill="#990000">Today</text>',
    );
    expect(svg).toContain('<line x1="320" y1="56" x2="320" y2="74" stroke="#7C3AED" stroke-width="2" opacity="0.8"/>');
    expect(svg).toContain(`<path class="g-today-pointer" d="M255,68H265L260,74Z" fill="${theme.todayColor}"/>`);
  });

  it('the table: header, rows with chevron, icons, status dot, fitted text with its full title', () => {
    expect(svg).toContain(
      `<text class="gantt-tl-col-header" x="169.5" y="41.2" text-anchor="middle" font-weight="600" fill="${theme.textPrimary}">Status</text>`,
    );
    expect(svg).toContain('<g class="gantt-tl-rows" transform="translate(0,74)">');
    expect(svg).toContain('<g class="gantt-tl-row" data-task-id="b&quot;&lt;&amp;">');
    // Name cell: toggle box at x + 8 + indent (24 wide), the icon 4 px after it
    expect(svg).toContain(
      `<path class="gantt-collapse-btn" d="M16,14.5L24,14.5L20,21.5Z" fill="${theme.textSecondary}"/>`,
    );
    expect(svg).toContain(
      `<path class="gantt-collapse-btn" d="M16.5,86L23.5,90L16.5,94Z" fill="${theme.textSecondary}"/>`,
    );
    expect(svg).toContain('<rect class="gantt-tl-icon" x="52" y="52" width="10" height="4" rx="1" fill="#123456"/>');
    expect(svg).toContain(`<path class="gantt-tl-icon" d="M41,86L45,90L41,94L37,90Z" fill="${theme.textMuted}"/>`);
    expect(svg).toMatch(/<path class="gantt-tl-icon" d="[^"]*" fill="none" stroke="#64748B" stroke-width="1"\/>/);
    expect(svg).toContain(`<circle class="gantt-tl-status-dot" cx="152" cy="18" r="4" fill="${theme.statusDone}"/>`);
    expect(svg).toContain(
      `<text class="gantt-tl-cell" x="58" y="22.2" font-weight="600" fill="${theme.textSecondary}">Group</text>`,
    );
    expect(svg).toContain('<title>A very long name</title>A very lo…</text>');
    // No text element for an empty cell
    expect(svg).not.toContain('x="148"');
    // Cell borders: the columns across the body, a line under each row
    expect(svg).toContain(
      `<g class="gantt-tl-grid" transform="translate(0,74)" shape-rendering="crispEdges" stroke="${theme.borderColor}" stroke-width="1">`,
    );
    expect(svg).toContain('<line x1="139.5" y1="0" x2="139.5" y2="108"/>');
    expect(svg).toContain('<line x1="0" y1="71.5" x2="200" y2="71.5"/>');
  });

  it('the legend: strip, top border, title, swatches and labels', () => {
    expect(svg).toContain('<g class="gantt-legend" transform="translate(0,182)">');
    expect(svg).toContain(`<rect x="0" y="0" width="600" height="29" fill="${theme.headerBackground}"/>`);
    expect(svg).toContain(`<line x1="0" y1="0.5" x2="600" y2="0.5" stroke="${theme.borderColor}" stroke-width="1"`);
    expect(svg).toContain(
      `<text class="gantt-legend-title" x="12" y="18.33" font-size="9.5" font-weight="700" letter-spacing="0.4" fill="${theme.textMuted}">LEGEND</text>`,
    );
    expect(svg).toContain(
      `<line class="gantt-legend-swatch" x1="79" y1="9" x2="79" y2="21" stroke="${theme.todayColor}" stroke-width="2" stroke-dasharray="3 2"/>`,
    );
    expect(svg).toContain(
      `<rect class="gantt-legend-swatch" x="151" y="12" width="16" height="6" rx="2" fill="${theme.criticalColor}"/>`,
    );
    expect(svg).toContain(`<text x="173" y="18.85" font-size="11" fill="${theme.textPrimary}">Critical path</text>`);
  });

  it('is deterministic', () => {
    expect(renderExportSvg(model(), null, OPTS)).toBe(svg);
  });
});

describe('renderExportSvg: options', () => {
  it('scale multiplies width and height, not the viewBox', () => {
    const svg = renderExportSvg(model(), null, { ...OPTS, scale: 2 });
    expect(svg).toMatch(/^<svg [^>]*width="1200" height="422" viewBox="0 0 600 211"/);
    expect(renderExportSvg(model(), null, { ...OPTS, scale: 0 })).toMatch(/width="600" height="211"/);
    expect(renderExportSvg(model(), null, { ...OPTS, scale: Number.NaN })).toMatch(/width="600" height="211"/);
  });

  it('prolog: the XML declaration first (files), else the <svg> element only', () => {
    expect(renderExportSvg(model(), null, { ...OPTS, prolog: true })).toMatch(
      /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<svg /,
    );
    expect(renderExportSvg(model(), null, OPTS)).toMatch(/^<svg /);
    expect(xmlErrors(renderExportSvg(model(), null, { ...OPTS, prolog: true }))).toEqual([]);
  });

  it('a transparent image has no background rect; a colour is used as is', () => {
    expect(renderExportSvg(model({ background: null }), null, OPTS)).not.toContain('gantry-export-bg');
    expect(renderExportSvg(model({ background: '#123' }), null, OPTS)).toContain(
      '<rect class="gantry-export-bg" x="0" y="0" width="600" height="211" fill="#123"/>',
    );
  });

  it.each([
    ['my export #1', 'my-export--1'],
    ['', 'gantry-export'],
    ['1x', 'g1x'],
    ['_ok.v2-a', '_ok.v2-a'],
    ['"><x', 'g---x'],
  ])('idPrefix %j → %j', (prefix, out) => {
    const svg = renderExportSvg(model(), null, { ...OPTS, idPrefix: prefix });
    expect(ids(svg)[0]).toBe(`${out}-title`);
    expect(svg).toContain(`aria-labelledby="${out}-title ${out}-desc"`);
    expect(xmlErrors(svg)).toEqual([]);
  });

  it('user text is stripped of what XML can’t hold, then escaped', () => {
    const svg = renderExportSvg(model({ title: 'A\u0000B￾ "q" \uD800', lang: 'it"' }), null, OPTS);
    expect(svg).toContain('<title id="gx-title">AB &quot;q&quot; </title>');
    expect(svg).toContain('lang="it&quot;"');
    expect(xmlErrors(svg)).toEqual([]);
  });

  it('paints the model left as tokens are resolved anyway (no var( ever)', () => {
    const svg = renderExportSvg(
      model({ background: 'var(--gantt-bg)', rows: rows().map(r => ({ ...r, fill: 'var(--gantt-row-bg)' })) }),
      null,
      OPTS,
    );
    expect(svg).not.toContain('var(');
    expect(svg).toContain(`fill="${theme.rowBg}" data-task-id="a"`);
  });
});

describe('renderExportSvg: views and states', () => {
  it('table view: the task list alone, no timeline, no defs', () => {
    const svg = renderExportSvg(model({ timeline: null, legend: null, width: 200, height: 182 }), null, OPTS);
    expect(topLevel(svg)).toEqual(['title', 'desc', 'rect.gantry-export-bg', 'g.gantry-export-table']);
    contentInvariants(svg);
  });

  it('chart view: the timeline at x 0, no table', () => {
    const svg = renderExportSvg(model({ table: null, timeline: { ...timeline(), x: 0 }, width: 400 }), null, OPTS);
    expect(topLevel(svg)).toEqual([
      'title',
      'desc',
      'defs',
      'rect.gantry-export-bg',
      'g.gantry-export-timeline',
      'g.gantt-legend',
    ]);
    expect(svg).toContain('transform="translate(0,0)"');
    contentInvariants(svg);
  });

  it('an empty chart: the header and the empty-state text in the middle of the body', () => {
    const empty = model({
      rows: [],
      table: { ...table(), rows: [] },
      timeline: { ...timeline(), bars: [], arrows: [], annotations: [] },
      legend: null,
      bodyHeight: 108,
      height: 182,
      empty: { text: 'No tasks <yet>', x: 300, y: 128 },
    });
    const svg = renderExportSvg(empty, null, OPTS);
    expect(svg).toContain(
      `<text class="gantry-export-empty" x="300" y="132.9" text-anchor="middle" font-size="14" font-weight="600" fill="${theme.textPrimary}">No tasks &lt;yet&gt;</text>`,
    );
    expect(svg).toContain('<g class="gantt-tl-rows" transform="translate(0,74)"/>');
    expect(svg).toContain('<g class="gantt-bars-layer"/>');
    contentInvariants(svg);
  });
});

describe('renderExportSvg: slices (printed pages)', () => {
  const slice = (over: Partial<ExportSlice> = {}): ExportSlice => ({
    x0: 100,
    x1: 500,
    rowStart: 0,
    rowEnd: 3,
    table: true,
    header: true,
    legend: true,
    footer: null,
    width: 600,
    height: 211,
    ...over,
  });
  const rowIds = (svg: string, cls: string) =>
    [...svg.matchAll(new RegExp(`<g class="${cls}" data-task-id="([^"]*)"`, 'g'))].map(m => m[1]);

  it('the whole range as a slice draws what the whole drawing draws, the body clipped', () => {
    const svg = renderExportSvg(model(), slice(), OPTS);
    expect(ids(svg)).toEqual(['gx-title', 'gx-desc', 'gx-timeline', 'gx-body', 'gx-hatch']);
    expect(svg).toContain('<clipPath id="gx-body">\n   <rect x="100" y="0" width="400" height="108"/>');
    expect(svg).toContain('<g class="gantt-body" transform="translate(0,74)" clip-path="url(#gx-body)">');
    contentInvariants(svg);
  });

  it('rows rowStart…rowEnd only, shifted up by the first one’s y; size from the slice', () => {
    const svg = renderExportSvg(model(), slice({ rowStart: 1, rowEnd: 2, height: 74 + 36 + 29 }), OPTS);
    expect(svg).toMatch(/^<svg [^>]*width="600" height="139" viewBox="0 0 600 139"/);
    expect(rowIds(svg, 'gantt-tl-row')).toEqual(['b&quot;&lt;&amp;']);
    expect(svg.match(/<rect x="100" y="\d+" width="400" height="36" fill=/g)).toHaveLength(1);
    expect(svg).toContain('<g class="gantt-tl-rows" transform="translate(0,38)">');
    expect(svg).toContain('<g class="gantt-body" transform="translate(0,38)" clip-path="url(#gx-body)">');
    expect(svg).toContain('<rect x="100" y="36" width="400" height="36"/>');
    // Bars of other rows are left out; the today line spans the page's rows
    expect(rowIds(svg, 'gantt-bar[^"]*')).toEqual(['b&quot;&lt;&amp;']);
    expect(svg).toContain('x1="260" y1="36" x2="260" y2="72"');
    // The legend sits at the bottom of the page; annotation labels at the top of its body
    expect(svg).toContain('<g class="gantt-legend" transform="translate(0,110)">');
    expect(svg).toContain('<text x="326" y="50" font-size="11"');
    contentInvariants(svg);
  });

  it('header, table and legend flags', () => {
    const svg = renderExportSvg(
      model(),
      slice({ header: false, table: false, legend: false, width: 400, height: 108 }),
      OPTS,
    );
    expect(topLevel(svg)).toEqual(['title', 'desc', 'defs', 'rect.gantry-export-bg', 'g.gantry-export-timeline']);
    expect(svg).not.toContain('g-header');
    expect(svg).toContain('transform="translate(0,0)"');
    expect(svg).toContain('<g class="gantt-body" transform="translate(0,0)" clip-path="url(#gx-body)">');
    expect(svg).toContain('<rect x="0" y="0" width="400" height="108"/>');
    contentInvariants(svg);
  });

  it('a column of pages: only what meets x0…x1; a cut header cell gets its label back on the page', () => {
    const svg = renderExportSvg(model(), slice({ x0: 350, x1: 500, table: false, width: 150 }), OPTS);
    expect(svg).toContain('<rect x="0" y="0" width="150" height="182"/>');
    expect(svg).toContain('<g transform="translate(-350,0)">');
    // "March 2026" (cell 300…600) starts 6 px into the page; "February 2026" (0…300) is off it
    expect(svg).toContain('x="356" y="18.55" font-size="13" font-weight="600"');
    expect(svg).toContain('>March 2026</text>');
    expect(svg).not.toContain('February');
    // Bar a (110…211) and the link (210…250) are far off the page; the group bar (250…450) is on it
    expect(rowIds(svg, 'gantt-bar[^"]*')).toEqual(['b&quot;&lt;&amp;', 'c']);
    expect(svg).toContain('<g class="gantt-arrows"/>');
    contentInvariants(svg);
  });

  it('a legend-only page (no rows, no header) renders the legend alone', () => {
    const svg = renderExportSvg(model(), slice({ rowStart: 3, rowEnd: 3, header: false, height: 29 }), OPTS);
    expect(svg).toContain('<g class="gantt-legend" transform="translate(0,0)">');
    expect(rowIds(svg, 'gantt-tl-row')).toEqual([]);
    expect(svg).toContain('<g class="gantt-bars-layer"/>');
    expect(svg).toContain('<rect x="0" y="0" width="400" height="0"/>');
    contentInvariants(svg);
  });

  it('an empty chart’s page keeps the body and the empty text', () => {
    const empty = model({
      rows: [],
      table: { ...table(), rows: [] },
      legend: null,
      height: 182,
      empty: { text: 'Nothing', x: 300, y: 128 },
    });
    const svg = renderExportSvg(empty, slice({ rowStart: 0, rowEnd: 0, legend: false, height: 182 }), OPTS);
    expect(svg).toContain('<rect x="100" y="0" width="400" height="108"/>');
    expect(svg).toContain('<text class="gantry-export-empty" x="300" y="132.9"');
    contentInvariants(svg);
  });

  it('out-of-range rows are clamped', () => {
    const svg = renderExportSvg(model(), slice({ rowStart: -4, rowEnd: 99 }), OPTS);
    expect(rowIds(svg, 'gantt-tl-row')).toEqual(['a', 'b&quot;&lt;&amp;', 'c']);
  });
});

/** A model with `n` rows, a bar each, and a link between neighbours (the 10 000-row budget). */
function bigModel(n: number): ExportModel {
  const base = model();
  const allRows: ExportRow[] = Array.from({ length: n }, (_, i) => ({ ...rows()[0], id: `t${i}`, y: i * 36 }));
  const tableRows = allRows.map(r => ({ id: r.id, cells: table().rows[1].cells }));
  const bars: ExportBar[] = allRows.map(r => ({
    id: r.id,
    kind: 'task',
    visual: bar({ y: r.y + 6, cy: r.y + 18 }),
    critical: false,
    markup: null,
  }));
  return {
    ...base,
    rows: allRows,
    bodyHeight: n * 36,
    height: 74 + n * 36 + 29,
    table: { ...table(), rows: tableRows },
    timeline: { ...timeline(), bars, arrows: timeline().arrows },
    legend: { ...legend(), y: 74 + n * 36 },
  };
}

describe('renderExportSvg: large charts', () => {
  it('10 000 rows in well under a second', () => {
    const m = bigModel(10_000);
    const t0 = performance.now();
    const svg = renderExportSvg(m, null, OPTS);
    const ms = performance.now() - t0;
    expect(svg.match(/class="gantt-tl-row"/g)).toHaveLength(10_000);
    expect(ms).toBeLessThan(1000);
  });
});
