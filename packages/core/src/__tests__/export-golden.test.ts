// ─────────────────────────────────────────────────────────────
//  Tests — SVG export end to end (`exportChartSvg(createExportSource(…))`,
//  Phase 12 D2, D19, D28): the three golden files in __goldens__/, the
//  invariants every export keeps, the call options, the views, custom
//  markup, printed pages, and 10 000 rows in Node.
//
//  The goldens are reviewed by eye (open them in a browser). A missing
//  golden fails instead of being written: generate and review them with
//    GANTRY_GOLDENS=1 npx vitest run --project core export-golden
//  and update a reviewed change with `-u`.
// ─────────────────────────────────────────────────────────────

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createExportSource, type GanttHeadlessInput } from '../export/source';
import { exportChartSvg, renderExportSvg } from '../export/svg';
import { buildExportModel } from '../export/model';
import { resolveExportCall } from '../export/files';
import { paginateChart } from '../export/paginate';
import { DarkTheme, LightTheme } from '../render/theme';
import type { GanttTask } from '../types';
import { customFixture, FIXTURE_NOW, longDecimals, planFixture, richFixture, xmlErrors } from './export-fixtures';

const GOLDENS = new URL('./__goldens__/', import.meta.url);

/** `svg` equals the reviewed golden `name` (never written by a plain run: see the header). */
async function matchGolden(name: string, svg: string): Promise<void> {
  const file = fileURLToPath(new URL(name, GOLDENS));
  if (!existsSync(file) && process.env['GANTRY_GOLDENS'] !== '1')
    throw new Error(
      `The golden ${name} is missing: generate it with GANTRY_GOLDENS=1 npx vitest run --project core export-golden, then review it`,
    );
  await expect(svg).toMatchFileSnapshot(file);
}

/** What every export keeps (D4, D19, D28). */
function invariants(svg: string, prefix: string): void {
  expect(xmlErrors(svg)).toEqual([]);
  expect(svg).not.toContain('var(');
  expect(svg).not.toMatch(/<style|foreignObject|<script|\son\w+=/i);
  expect(longDecimals(svg)).toEqual([]);
  expect(svg).toMatch(new RegExp(`^<svg [^>]*role="img" aria-labelledby="${prefix}-title ${prefix}-desc" lang="`));
  for (const [, id] of svg.matchAll(/\sid="([^"]*)"/g)) expect(id.startsWith(`${prefix}-`)).toBe(true);
}

const svgOf = (input: GanttHeadlessInput, idPrefix: string, extra = {}) =>
  exportChartSvg(createExportSource(input), { idPrefix, ...extra });

const rowIds = (svg: string, cls: string) =>
  [...svg.matchAll(new RegExp(`<g class="${cls}" data-task-id="([^"]*)"`, 'g'))].map(m => m[1]);

describe('exportChartSvg: goldens (D28)', () => {
  it.each([
    ['export-plan.svg', planFixture],
    ['export-rich.svg', richFixture],
    ['export-custom.svg', customFixture],
  ] as const)('%s', async (name, fixture) => {
    const prefix = name.replace('.svg', '');
    const svg = svgOf(fixture(), prefix);
    invariants(svg, prefix);
    // The same chart, the same bytes
    expect(svgOf(fixture(), prefix)).toBe(svg);
    await matchGolden(name, svg);
  });
});

describe('exportChartSvg: the chart drawn', () => {
  it('every shown row in display order, in the table and the timeline; collapsed children left out', () => {
    const svg = svgOf(planFixture(), 'p');
    const shown = ['design', 'research', 'wire', 'visual', 'build', 'launch'];
    expect(rowIds(svg, 'gantt-tl-row')).toEqual(shown);
    expect(rowIds(svg, 'gantt-bar[^"]*')).toEqual(shown);
    expect(svg).not.toContain('data-task-id="api"');
  });

  it('title and description: the chart’s labels, or the call’s', () => {
    const svg = svgOf(planFixture(), 'p');
    expect(svg).toContain('<title id="p-title">Gantt chart timeline</title>');
    expect(svg).toMatch(/<desc id="p-desc">6 tasks from Mar 2, 2026 to [^<]+<\/desc>/);
    const own = svgOf(planFixture(), 'p', { title: 'Q1 <plan>', description: 'For the board' });
    expect(own).toContain('<title id="p-title">Q1 &lt;plan&gt;</title>');
    expect(own).toContain('<desc id="p-desc">For the board</desc>');
  });

  it('call options: theme, background, today, legend, scale', () => {
    const bg = (svg: string) => /<rect class="gantry-export-bg" [^>]*fill="([^"]*)"/.exec(svg)?.[1];
    const light = svgOf(richFixture(), 'r');
    expect(bg(light)).toBe(LightTheme.backgroundColor);
    expect(light).toContain('class="gantt-today"');
    expect(light).toContain('<g class="gantt-legend"');

    const dark = svgOf(richFixture(), 'r', { theme: 'dark' });
    expect(bg(dark)).toBe(DarkTheme.backgroundColor);
    expect(dark).toContain(`fill="${DarkTheme.headerBackground}"`);
    expect(bg(svgOf(richFixture(), 'r', { background: '#FAFAF0' }))).toBe('#FAFAF0');

    const bare = svgOf(richFixture(), 'r', { background: 'transparent', today: false, legend: false, scale: 2 });
    expect(bare).not.toContain('gantry-export-bg');
    expect(bare).not.toContain('class="gantt-today"');
    expect(bare).not.toContain('g-today-pointer');
    expect(bare).not.toContain('<g class="gantt-legend"');
    const [, w, h, vw, vh] = /^<svg [^>]*width="([\d.]+)" height="([\d.]+)" viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(
      bare,
    )!;
    expect(Number(w)).toBe(2 * Number(vw));
    expect(Number(h)).toBe(2 * Number(vh));
    invariants(bare, 'r');
  });

  it('views: the table view draws the task list alone, the chart view the timeline alone', () => {
    const table = svgOf(planFixture(), 't', { view: 'table' });
    expect(table).toContain('<g class="gantry-export-table">');
    expect(table).not.toContain('gantry-export-timeline');
    invariants(table, 't');
    const chart = svgOf(planFixture(), 'c', { view: 'chart' });
    expect(chart).not.toContain('gantry-export-table');
    expect(chart).toContain(
      '<g class="gantry-export-timeline" clip-path="url(#c-timeline)" transform="translate(0,0)">',
    );
    invariants(chart, 'c');
  });

  it('custom markup replaces the built-in shapes of its bars, with the export theme inlined', () => {
    const svg = svgOf(customFixture(), 'x');
    const api = svg.slice(svg.indexOf('<g class="gantt-bar gantt-bar--task" data-task-id="api">'));
    const group = api.slice(0, api.indexOf('\n     </g>'));
    expect(group).toContain('<g class="my-bar">');
    expect(group).toContain(`fill="${DarkTheme.milestoneColor}" stroke="#F59E0B"`);
    expect(group).not.toContain('gantt-bar-body');
    expect(svg).toContain(`r="7" fill="${DarkTheme.criticalColor}"`);
    // The other bars stay built in
    expect(svg).toContain('<g class="gantt-bar gantt-bar--task" data-task-id="ui">');
    expect(svg.slice(svg.indexOf('gantt-bar--task" data-task-id="ui"'))).toMatch(
      /^[^\n]*\n\s*<path class="gantt-bar-body"/,
    );
  });

  it('ids: the call’s prefix, else a new gantry-export-<n> per image', () => {
    const source = createExportSource(planFixture());
    const a = exportChartSvg(source);
    const b = exportChartSvg(source);
    const n = Number(/id="gantry-export-(\d+)-title"/.exec(a)![1]);
    expect(b).toContain(`id="gantry-export-${n + 1}-title"`);
    expect(a.replaceAll(`gantry-export-${n}-`, 'P-')).toBe(b.replaceAll(`gantry-export-${n + 1}-`, 'P-'));
  });

  it('an empty chart: the header and the empty state', () => {
    const svg = exportChartSvg(createExportSource({ tasks: [], now: FIXTURE_NOW }), { idPrefix: 'e' });
    expect(svg).toMatch(
      /<text class="gantry-export-empty" [^>]*>No tasks[^<]*<\/text>|<text class="gantry-export-empty"/,
    );
    invariants(svg, 'e');
  });

  it('printed pages: every page well formed, the rows split between the pages of a column', () => {
    const source = createExportSource(richFixture());
    const opts = resolveExportCall(source.config, 'print', { paper: 'a4', fit: 'none' });
    const model = buildExportModel(source, opts);
    const plan = paginateChart(model, opts);
    expect(plan.pages.length).toBeGreaterThan(1);
    const firstColumn: string[] = [];
    plan.pages.forEach((page, i) => {
      const svg = renderExportSvg(model, page, { idPrefix: `page-${i}`, scale: plan.scale, prolog: false });
      invariants(svg, `page-${i}`);
      expect(svg).toMatch(new RegExp(`viewBox="0 0 [\\d.]+ [\\d.]+"`));
      if (page.column === 0) firstColumn.push(...rowIds(svg, 'gantt-tl-row').map(String));
    });
    expect(firstColumn).toEqual(model.rows.map(r => r.id));
  });
});

describe('exportChartSvg: large charts', () => {
  it('10 000 rows in Node in under a second', () => {
    const d = (day: number) => new Date(2026, 0, 1 + (day % 300));
    const tasks: GanttTask[] = Array.from({ length: 10_000 }, (_, i) => ({
      id: `t${i}`,
      name: `Task ${i}`,
      start: d(i),
      end: d(i + 5),
      progress: i % 100,
      ...(i > 0 && i % 10 !== 0 ? { dependency: `t${i - 1}` } : {}),
    }));
    const source = createExportSource({ tasks, now: FIXTURE_NOW, options: { viewMode: 'Week' } });
    // Warm the code up on a small chart first, then take the best of three runs: the budget is
    // for the work, not for the JIT or the other test files running beside this one
    exportChartSvg(createExportSource({ tasks: tasks.slice(0, 500), now: FIXTURE_NOW }), { idPrefix: 'warm' });
    let best = Infinity;
    let svg = '';
    for (let run = 0; run < 3 && best >= 1000; run++) {
      const t0 = performance.now();
      svg = exportChartSvg(source, { idPrefix: 'big' });
      best = Math.min(best, performance.now() - t0);
    }
    expect(svg.match(/class="gantt-tl-row"/g)).toHaveLength(10_000);
    expect(best).toBeLessThan(1000);
  });
});
