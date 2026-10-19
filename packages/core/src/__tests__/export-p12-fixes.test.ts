// ─────────────────────────────────────────────────────────────
//  Phase 12 review fixes (7.1): the custom-markup sanitiser (prefixed,
//  unclosed and SMIL elements, character references, remote URLs, the
//  bindings' matrix), escaped theme values, bars a range leaves out,
//  the print margin, the bounded fileName cache, the legend wrapped per
//  print page, CSV raw task fields, `ExportMarker.kind`.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, expectTypeOf } from 'vitest';
import { createExportSource, type GanttHeadlessInput } from '../export/source';
import { exportChartSvg, renderExportSvg } from '../export/svg';
import { exportChartCsv } from '../export/csv';
import { exportChartPages, paginateChart } from '../export/paginate';
import { buildExportModel } from '../export/model';
import { resolveExportCall } from '../export/files';
import { inlineThemeVars } from '../export/xml';
import { sanitizeSvgAttribute, sanitizeSvgMarkup } from '../export/sanitize';
import type { ExportMarker } from '../export/timeline';
import { resolveConfig, resolveExportFormat } from '../render/config';
import { resolveTheme } from '../render/theme';
import { PAPER_SIZES_MM } from '../export/paginate';
import type { GanttBarContext, GanttTask } from '../types';
import { FIXTURE_NOW, planFixture, richFixture, xmlErrors } from './export-fixtures';

const d = (m: number, day: number) => new Date(2026, m, day);
const TASKS: GanttTask[] = [{ id: 'a', name: 'A', start: new Date(2026, 0, 5), end: new Date(2026, 0, 9) }];
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** The `<g>` of bar `a` in an export whose custom bar returns `markup`, and the whole SVG. */
function exportWith(markup: string, input: Partial<GanttHeadlessInput> = {}): { bar: string; svg: string } {
  const svg = exportChartSvg(
    createExportSource({ tasks: TASKS, now: new Date(2026, 0, 6), customBar: () => markup, ...input }),
    { idPrefix: 't' },
  );
  const at = svg.indexOf('data-task-id="a">', svg.indexOf('gantt-bars-layer'));
  const bar = svg.slice(svg.indexOf('\n', at) + 1, svg.indexOf('\n', svg.indexOf('\n', at) + 1));
  return { bar: bar.trim(), svg };
}

// ─── 1 · the sanitiser ───────────────────────────────────────

describe('custom markup sanitiser: the review payloads (headless, through exportChartSvg)', () => {
  it.each([
    ['a prefixed script', '<g><svg:script xmlns:svg="http://www.w3.org/2000/svg">alert(1)</svg:script><rect/></g>'],
    ['a script URL as character references', '<g><a href="&#106;avascript:alert(1)"><rect/></a></g>'],
    ['a hex reference', '<g><a href="&#x6A;avascript&#x3a;alert(1)"><rect/></a></g>'],
    ['a named reference (HTML)', '<g><a href="javascript&colon;alert(1)"><rect/></a></g>'],
    ['a SMIL set', '<g><a><set attributeName="href" to="javascript:alert(2)"/><rect/></a></g>'],
    ['an unclosed script', '<g><rect/><script>alert(3)</g>'],
    ['a remote image', '<g><image href="https://evil.example/x.png"/><rect/></g>'],
    ['a data: HTML link', '<g><a href="data:text/html,x"><rect/></a></g>'],
  ])('%s', (_, markup) => {
    const { bar, svg } = exportWith(markup);
    expect(bar).not.toMatch(/script|alert|evil|data:|<set|href=/i);
    expect(bar).toContain('<rect/>');
    expect(xmlErrors(svg)).toEqual([]);
  });
});

describe('sanitizeSvgMarkup: elements', () => {
  it('keeps SVG drawing markup as it is (canonical input is unchanged)', () => {
    const markup =
      '<g class="my-bar"><rect x="1" y="2" width="30" height="10" rx="2" fill="#A78BFA" stroke="#F59E0B"/>' +
      '<text x="4" y="7" dominant-baseline="central" style="fill: #0F172A">API</text></g>';
    expect(sanitizeSvgMarkup(markup)).toBe(markup);
  });

  it.each([
    'script',
    'style',
    'foreignObject',
    'set',
    'animate',
    'animateMotion',
    'animateTransform',
    'animateColor',
    'metadata',
    'iframe',
    'img',
    'div',
    'meta',
  ])('drops <%s> with its content, keeping its siblings', tag => {
    const out = sanitizeSvgMarkup(`<g><${tag} a="1"><rect id="in"/>secret</${tag}><circle r="2"/></g>`);
    expect(out).toBe('<g><circle r="2"/></g>');
    // Upper case and a prefix change nothing
    expect(sanitizeSvgMarkup(`<g><x:${tag.toUpperCase()} xmlns:x="http://www.w3.org/2000/svg">s</x:${tag}></g>`)).toBe(
      '<g></g>',
    );
  });

  it('drops an unclosed element up to the end of the markup, and closes what is left open', () => {
    expect(sanitizeSvgMarkup('<g><rect/><script>alert(1)<circle/></g>')).toBe('<g><rect/></g>');
    expect(sanitizeSvgMarkup('<g><rect/><style>')).toBe('<g><rect/></g>');
    expect(sanitizeSvgMarkup('<g><text>a')).toBe('<g><text>a</text></g>');
    expect(sanitizeSvgMarkup('<g><rect x="1" y="2"')).toBe('<g></g>');
  });

  it('drops elements outside the SVG namespace, or of an undeclared prefix', () => {
    const html = 'http://www.w3.org/1999/xhtml';
    expect(sanitizeSvgMarkup(`<g><a xmlns="${html}" href="#x">x</a><rect/></g>`)).toBe('<g><rect/></g>');
    expect(sanitizeSvgMarkup(`<g xmlns:h="${html}"><h:rect/><rect/></g>`)).toBe(`<g xmlns:h="${html}"><rect/></g>`);
    expect(sanitizeSvgMarkup('<g><q:rect/><rect/></g>')).toBe('<g><rect/></g>');
    expect(sanitizeSvgMarkup(`<div xmlns="${html}"><rect/></div>`)).toBe('');
  });

  it('drops comments, processing instructions and doctypes; a CDATA section stays as text', () => {
    expect(
      sanitizeSvgMarkup(
        '<?xml version="1.0"?><!DOCTYPE x><g><!--<script>x</script>--><text><![CDATA[a<b&c]]></text></g>',
      ),
    ).toBe('<g><text>a&lt;b&amp;c</text></g>');
  });

  it('rebuilds tags: attributes double-quoted and escaped, the first of a name, stray end tags dropped', () => {
    expect(sanitizeSvgMarkup(`<g a='1"2' b=3 a="4" c><rect x="1>2"/></text></g>`)).toBe(
      '<g a="1&quot;2" b="3" c=""><rect x="1&gt;2"/></g>',
    );
    // An attribute glued to the previous one (the HTML parser reads it) is still read and checked
    expect(sanitizeSvgMarkup('<g x="1"onclick="alert(1)"/onload="x"><rect/></g>')).toBe('<g x="1"><rect/></g>');
    expect(sanitizeSvgMarkup('a < b & c <rect/>')).toBe('a &lt; b &amp; c <rect/>');
  });

  it('declares xlink: when an xlink attribute is kept without its declaration', () => {
    expect(sanitizeSvgMarkup('<use xlink:href="#a"/>')).toBe(`<use xlink:href="#a" xmlns:xlink="${XLINK_NS}"/>`);
    expect(sanitizeSvgMarkup(`<g xmlns:xlink="${XLINK_NS}"><use xlink:href="#a"/></g>`)).toBe(
      `<g xmlns:xlink="${XLINK_NS}"><use xlink:href="#a"/></g>`,
    );
    // Another undeclared prefix: the attribute goes (it would make the file unreadable)
    expect(sanitizeSvgMarkup('<rect q:x="1" y="2"/>')).toBe('<rect y="2"/>');
  });

  it('gives the empty string when the root is dropped, and output every XML reader accepts', () => {
    expect(sanitizeSvgMarkup('<script>alert(1)</script>')).toBe('');
    const messy = "<g a=1 b='2'><text>x &nbsp; &copy; &#8212; &#0;</text><rect></g>";
    expect(xmlErrors(`<svg xmlns="http://www.w3.org/2000/svg">${sanitizeSvgMarkup(messy)}</svg>`)).toEqual([]);
  });
});

// The bindings' `serializeSvg` matrix, run through core (the bindings call `sanitizeSvgMarkup`)
describe('sanitizeSvgMarkup: the bindings’ attribute matrix', () => {
  it.each([['onclick'], ['ONMOUSEOVER'], ['onload'], ['onbegin']])('removes the %s handler', name => {
    const out = sanitizeSvgMarkup(`<g ${name}="alert(1)" fill="red"><rect ${name}="alert(2)"/></g>`);
    expect(out).toBe('<g fill="red"><rect/></g>');
  });

  it.each([
    ['javascript:alert(1)'],
    ['  JaVaScRiPt:alert(1)'],
    ['java\tscript:alert(1)'],
    ['java&#9;script:alert(1)'],
    ['&#1;javascript:alert(1)'],
    ['vbscript:msgbox(1)'],
    ['data:text/html,x'],
    ['data:image/svg+xml,&lt;svg/&gt;'],
    ['https://example.com/a'],
    ['//example.com/a'],
    ['a.svg#x'],
  ])('removes the link %j (href and xlink:href)', url => {
    const out = sanitizeSvgMarkup(
      `<g xmlns:xlink="${XLINK_NS}"><a href="${url}"><text>x</text></a><use xlink:href="${url}"/></g>`,
    );
    expect(out).toBe(`<g xmlns:xlink="${XLINK_NS}"><a><text>x</text></a><use/></g>`);
  });

  it.each([
    ['#bar-1'],
    [' #bar-1'],
    ['data:image/png;base64,AAAA'],
    ['data:image/webp,x'],
    ['DATA:image/JPEG;base64,A'],
  ])('keeps the link %j', url => {
    expect(sanitizeSvgMarkup(`<image href="${url}"/>`)).toBe(`<image href="${url}"/>`);
  });

  it('keeps text attributes that merely look like a scheme', () => {
    expect(sanitizeSvgAttribute('aria-label', 'Data: 12 tasks')).toBe('Data: 12 tasks');
    expect(sanitizeSvgAttribute('aria-label', 'Notes; data: none')).toBe('Notes; data: none');
    expect(sanitizeSvgMarkup('<g aria-label="Data: 12 tasks"><rect/></g>')).toBe(
      '<g aria-label="Data: 12 tasks"><rect/></g>',
    );
  });

  it('drops script and data URLs from URL attributes, alone or in a `;` list', () => {
    expect(sanitizeSvgAttribute('values', '#a; javascript:alert(1)')).toBeNull();
    expect(sanitizeSvgAttribute('values', 'a;data:text/html,x')).toBeNull();
    expect(sanitizeSvgAttribute('values', '0;1')).toBe('0;1');
    expect(sanitizeSvgAttribute('data-x', '1 onload=2')).toBe('1 onload=2');
    expect(sanitizeSvgAttribute('aria-label', 'Metadata: none')).toBe('Metadata: none');
  });

  it('removes tabindex and autofocus; keeps aria, data and inline style', () => {
    const out = sanitizeSvgMarkup(
      '<g tabindex="0" autofocus="" role="option" aria-label="Design" data-task-id="t1" style="fill: var(--gantt-bar)"/>',
    );
    expect(out).toBe('<g role="option" aria-label="Design" data-task-id="t1" style="fill: var(--gantt-bar)"/>');
  });
});

describe('sanitizeSvgMarkup: remote resources in CSS', () => {
  it.each([
    ['fill', 'url(https://x.example/p#a)'],
    ['fill', "url( '//x.example/p' )"],
    ['filter', "url('a.svg#f')"],
    ['mask', '\\75 rl(https://x.example/m)'],
    ['clip-path', 'URL(data:image/png;base64,AA)'],
  ])('drops the %s attribute %j', (name, value) => {
    expect(sanitizeSvgMarkup(`<rect ${name}="${value}" x="1"/>`)).toBe('<rect x="1"/>');
  });

  it('keeps url(#…) in attributes and styles', () => {
    expect(sanitizeSvgMarkup('<rect fill="url(#grad)" style="filter: url( \'#f\' )"/>')).toBe(
      '<rect fill="url(#grad)" style="filter: url( &apos;#f&apos; )"/>',
    );
  });

  it('drops only the remote declarations of a style (the attribute when none is left)', () => {
    expect(
      sanitizeSvgAttribute(
        'style',
        'fill: red; background-image: url("https://x.example/a;b.png"); stroke: url(#s); mask: image-set("m.png" 1x)',
      ),
    ).toBe('fill: red; stroke: url(#s)');
    expect(sanitizeSvgAttribute('style', 'cursor: url(https://x.example/c.cur), auto')).toBeNull();
    expect(sanitizeSvgAttribute('style', 'fill: src(https://x.example)')).toBeNull();
  });
});

// ─── 2 · theme values are escaped ───────────────────────────

describe('inlineThemeVars escapes the values it inlines', () => {
  const FONT = '"Inter", system-ui, sans-serif';

  it('a quoted fontFamily keeps an attribute well-formed', () => {
    const theme = resolveTheme(false, { fontFamily: FONT });
    expect(inlineThemeVars('<text style="font-family: var(--gantt-font)">x</text>', theme)).toBe(
      '<text style="font-family: &quot;Inter&quot;, system-ui, sans-serif">x</text>',
    );
  });

  it('a custom bar using it gives a well-formed SVG (the review probe)', () => {
    const { bar, svg } = exportWith('<g><text style="font-family: var(--gantt-font)">x</text></g>', {
      options: { theme: { fontFamily: FONT } },
    });
    expect(bar).toBe('<g><text style="font-family: &quot;Inter&quot;, system-ui, sans-serif">x</text></g>');
    expect(xmlErrors(svg)).toEqual([]);
    // The root's font-family is escaped once, not twice
    expect(svg).toContain('font-family="&quot;Inter&quot;, system-ui, sans-serif"');
  });
});

// ─── 5 · bars a range leaves out ────────────────────────────

describe('bars outside the drawn range', () => {
  const plan = planFixture();

  it('render no custom bar and are left out; arrows to them are still drawn', () => {
    const calls: string[] = [];
    const customBar = (ctx: GanttBarContext) => {
      calls.push(ctx.row.task.id);
      return `<rect width="${ctx.visual.width}" height="4"/>`;
    };
    const source = createExportSource({ ...plan, customBar });
    const all = buildExportModel(source, resolveExportCall(source.config, 'svg', {}));
    expect(calls).toHaveLength(source.rows.length);
    calls.length = 0;
    const range = { start: d(2, 23), end: d(3, 7) };
    const part = buildExportModel(source, resolveExportCall(source.config, 'svg', { range })).timeline!;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.length).toBeLessThan(source.rows.length);
    expect(part.bars.map(b => b.id)).toEqual(calls);
    expect(calls).not.toContain('research');
    expect(part.arrows).toHaveLength(all.timeline!.arrows.length);
  });

  it("with range 'visible': only the bars near the viewport", () => {
    let count = 0;
    const source = createExportSource({ ...plan, customBar: () => (count++, null) });
    const visible = { ...source, viewport: { x0: 0, x1: 120 } };
    const model = buildExportModel(visible, resolveExportCall(source.config, 'svg', { range: 'visible' }));
    expect(count).toBe(model.timeline!.bars.length);
    expect(count).toBeLessThan(source.rows.length);
  });
});

// ─── 7 · the print margin ───────────────────────────────────

describe('print margin', () => {
  const source = () => createExportSource(planFixture());

  it('paginateChart throws a RangeError when the margin leaves no room on the page', () => {
    const s = source();
    const opts = resolveExportCall(s.config, 'print', {});
    const model = buildExportModel(s, opts);
    // A4: 210 mm is the shorter side, whatever the orientation
    for (const orientation of ['landscape', 'portrait'] as const) {
      expect(() => paginateChart(model, { ...opts, orientation, margin: 105 })).toThrow(RangeError);
      expect(() => paginateChart(model, { ...opts, orientation, margin: 105 })).toThrow(
        /The print margin leaves no room on the page/,
      );
      expect(paginateChart(model, { ...opts, orientation, margin: 104 }).pages.length).toBeGreaterThan(0);
    }
    // A margin that isn't a number is the default one
    expect(paginateChart(model, { ...opts, margin: NaN }).content).toEqual(paginateChart(model, opts).content);
  });

  it('a paper too small for the margin rejects the print', () => {
    expect(() => exportChartPages(source(), { paper: { width: 15, height: 40, unit: 'mm' } })).toThrow(RangeError);
  });

  it('resolveConfig and a call keep the base margin for a negative, non-finite or too large one', () => {
    for (const margin of [-1, NaN, Infinity, 105, 500]) {
      expect(resolveConfig({ export: { print: { margin } } }).export.print.margin).toBe(10);
      expect(resolveExportFormat('print', { margin }, resolveExportFormat('print', { margin: 20 })).margin).toBe(20);
    }
    // Room is measured on the paper the same options choose
    expect(resolveExportFormat('print', { margin: 120 }).margin).toBe(10);
    expect(resolveExportFormat('print', { margin: 120, paper: 'a3' }).margin).toBe(120);
    expect(resolveExportFormat('print', { margin: 2, paper: { width: 1, height: 2, unit: 'in' } }).margin).toBe(2);
    expect(resolveExportFormat('print', { margin: 13, paper: { width: 1, height: 2, unit: 'in' } }).margin).toBe(10);
    // The call's margin is checked; a call margin of 500 prints with the chart's
    expect(exportChartPages(source(), { margin: 500 }).css).toContain('margin:10mm');
  });

  it("config's paper sizes are paginate's", () => {
    for (const [paper, size] of Object.entries(PAPER_SIZES_MM)) {
      const short = Math.min(size.width, size.height);
      const named = paper as keyof typeof PAPER_SIZES_MM;
      expect(resolveExportFormat('print', { margin: short / 2 - 0.01, paper: named }).margin).toBe(short / 2 - 0.01);
      expect(resolveExportFormat('print', { margin: short / 2, paper: named }).margin).toBe(10);
    }
  });
});

// ─── 8 · the fileName cache ─────────────────────────────────

describe('export.fileName functions', () => {
  const fn = (fileName?: string) =>
    resolveConfig(fileName === undefined ? {} : { export: { fileName } }).export.fileName;

  it('keep their identity for recent names and the default, and are bounded (oldest names go)', () => {
    const first = fn('name-0');
    for (let i = 1; i < 100; i++) fn(`name-${i}`);
    // The last 32 names keep their function, the default one too
    for (let i = 68; i < 100; i++) expect(fn(`name-${i}`)).toBe(fn(`name-${i}`));
    expect(fn()).toBe(fn('gantt'));
    // The first name was evicted long ago: a new (equal) function
    const again = fn('name-0');
    expect(again).not.toBe(first);
    expect(again('svg')).toBe('name-0');
    // Using a name keeps it: 40 other names later it is still cached
    const kept = fn('kept');
    for (let i = 0; i < 40; i++) {
      fn(`other-${i}`);
      if (i % 10 === 0) fn('kept');
    }
    expect(fn('kept')).toBe(kept);
  });
});

// ─── 10 · the legend on print pages ─────────────────────────

describe('the legend on a print page narrower than the drawing', () => {
  const input = (): GanttHeadlessInput => {
    const rich = richFixture();
    const labels = Array.from({ length: 14 }, (_, i) => ({
      x1: d(2, 3 + i),
      label: { text: `Annotation number ${i + 1}` },
    }));
    return { ...rich, options: { ...rich.options, annotations: labels } };
  };

  it('wraps the legend at the page width, and the page grows with its lines', () => {
    const source = createExportSource(input());
    const opts = resolveExportCall(source.config, 'print', { paper: 'a4', orientation: 'portrait', fit: 'none' });
    const model = buildExportModel(source, opts);
    const plan = paginateChart(model, opts);
    expect(plan.across).toBeGreaterThan(1);
    const page = plan.pages.find(p => p.legend)!;
    expect(page.column).toBe(0);
    expect(page.width).toBeLessThan(model.width);
    const svg = renderExportSvg(model, page, { idPrefix: 'p', scale: 1, prolog: false });
    const legend = svg.slice(svg.indexOf('<g class="gantt-legend"'));
    // Every item starts inside the page
    const xs = [...legend.matchAll(/<text x="([\d.]+)"/g)].map(m => Number(m[1]));
    expect(xs.length).toBeGreaterThan(14);
    for (const x of xs) expect(x).toBeLessThan(page.width);
    // More lines than at the drawing's width: a taller strip, and the page's height has it
    const strip = Number(/<rect x="0" y="0" width="[\d.]+" height="([\d.]+)"/.exec(legend)![1]);
    expect(strip).toBeGreaterThan(model.legend!.height);
    const bodyAbove = page.height - strip;
    expect(bodyAbove).toBeGreaterThan(0);
    expect(xmlErrors(svg)).toEqual([]);
  });

  it("a page as wide as the drawing keeps the model's legend", () => {
    const source = createExportSource(input());
    const opts = resolveExportCall(source.config, 'print', { fit: 'page' });
    const model = buildExportModel(source, opts);
    const page = paginateChart(model, opts).pages[0];
    expect(page.legend).toBe(true);
    expect(page.height).toBeCloseTo(model.height, 1);
  });
});

// ─── 11 · CSV raw task fields ───────────────────────────────

describe('CSV: keys that are raw task fields', () => {
  const tasks: GanttTask[] = [
    { id: 'p', name: 'Parent', start: d(2, 2), end: d(2, 9), type: 'group', collapsed: true },
    {
      id: 'c',
      name: 'Child',
      start: d(2, 2),
      end: d(2, 5),
      parentId: 'p',
      dependency: [{ taskId: 'x', type: 'SS', lag: 2 }],
      barType: '=flag',
      editable: false,
    },
    { id: 'x', name: 'X', start: new Date(2026, 2, 3, 9, 30), end: d(2, 6), dependency: 'p' },
  ];
  const source = () => createExportSource({ tasks, now: FIXTURE_NOW });

  it('export the field as stored, under the key, in both modes; unknown keys still drop', () => {
    const columns = ['id', 'parentId', 'dependency', 'collapsed', 'barType', 'editable', 'nope', 'start'];
    const data = exportChartCsv(source(), { columns }).split('\r\n');
    expect(data).toEqual([
      'ID,parentId,dependency,collapsed,barType,editable,Start',
      'p,,,true,,,2026-03-02',
      "c,p,x SS+2d,,'=flag,false,2026-03-02",
      'x,,p,,,,2026-03-03T09:30',
    ]);
    expect(
      exportChartCsv(source(), { columns, values: 'display' })
        .split('\r\n')
        .map(l => l.split(',').slice(1, 6)),
    ).toEqual(data.map(l => l.split(',').slice(1, 6)));
  });

  it('round-trips the tree: id, name and parentId of every loaded task, collapsed children included', () => {
    const csv = exportChartCsv(source(), { columns: ['id', 'name', 'parentId'], header: false });
    expect(csv).toBe('p,Parent,\r\nc,Child,p\r\nx,X,');
  });

  it('a column with the same key wins over the field', () => {
    const s = createExportSource({
      tasks,
      now: FIXTURE_NOW,
      columns: [{ key: 'parentId', label: 'Parent', width: 80, render: row => `#${row.task.parentId ?? ''}` }],
    });
    expect(exportChartCsv(s, { columns: ['parentId'] }).split('\r\n')).toEqual(['Parent', '#', '#p', '#']);
  });
});

// ─── 12 · ExportMarker.kind ─────────────────────────────────

describe('ExportMarker.kind', () => {
  it('is required, and the lane draws by it (not by colour)', () => {
    expectTypeOf<ExportMarker['kind']>().toEqualTypeOf<'today' | 'annotation'>();
    const source = createExportSource({
      ...planFixture(),
      options: { viewMode: 'Day', locale: 'en-US', markers: { lane: true } },
      annotations: [{ x1: d(2, 12), label: { text: 'Review' } }],
    });
    const model = buildExportModel(source, resolveExportCall(source.config, 'svg', {}));
    const lane = model.timeline!.lane!;
    expect(lane.markers.map(m => m.kind).sort()).toEqual(['annotation', 'today']);
    // An annotation painted in the today colour stays an annotation
    const today = lane.markers.find(m => m.kind === 'today')!;
    const markers = lane.markers.map(m => (m.kind === 'annotation' ? { ...m, stroke: today.stroke } : m));
    const svg = renderExportSvg({ ...model, timeline: { ...model.timeline!, lane: { ...lane, markers } } }, null, {
      idPrefix: 'k',
      scale: 1,
      prolog: false,
    });
    expect(svg.match(/g-marker--annotation/g)).toHaveLength(1);
    expect(svg.match(/g-marker--today/g)).toHaveLength(1);
  });
});
