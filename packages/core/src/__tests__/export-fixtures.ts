// ─────────────────────────────────────────────────────────────
//  Fixtures of the SVG goldens (export-golden.test.ts, Phase 12 D28):
//  three headless charts (`createExportSource`) with a fixed clock, in
//  local dates, so the drawing is the same in every time zone.
//    plan     — a small plan: groups, tasks, a milestone, dependencies,
//               progress, a collapsed group, the today line
//    rich     — critical path, baselines, annotations (line, region,
//               marker lane), hatched non-working time in the header,
//               rollup segments, the legend
//    custom   — custom bar markup (`customBar`) beside built-in bars
// ─────────────────────────────────────────────────────────────

import type { GanttHeadlessInput } from '../export/source';
import type { GanttTask } from '../types';

/** The clock of every fixture: Wednesday 11 March 2026, 10:00 local. */
export const FIXTURE_NOW = new Date(2026, 2, 11, 10, 0);

const d = (m: number, day: number) => new Date(2026, m, day);

const PLAN: GanttTask[] = [
  { id: 'design', name: 'Design', start: d(2, 2), end: d(2, 20), type: 'group' },
  { id: 'research', name: 'User research', start: d(2, 2), end: d(2, 7), parentId: 'design', progress: 100 },
  {
    id: 'wire',
    name: 'Wireframes & flows',
    start: d(2, 9),
    end: d(2, 14),
    parentId: 'design',
    progress: 60,
    dependency: 'research',
    status: 'inProgress',
  },
  {
    id: 'visual',
    name: 'Visual design with a long name that the cell fits',
    start: d(2, 14),
    end: d(2, 20),
    parentId: 'design',
    progress: 10,
    dependency: 'wire',
  },
  { id: 'build', name: 'Build', start: d(2, 16), end: d(3, 3), type: 'group', collapsed: true },
  { id: 'api', name: 'API', start: d(2, 16), end: d(2, 27), parentId: 'build' },
  { id: 'ui', name: 'UI', start: d(2, 23), end: d(3, 3), parentId: 'build', dependency: 'api' },
  {
    id: 'launch',
    name: 'Launch <beta> "1.0"',
    start: d(3, 6),
    end: d(3, 6),
    type: 'milestone',
    dependency: { taskId: 'build', lag: 2 },
  },
];

/** A small plan in the default split view, week by day. */
export function planFixture(): GanttHeadlessInput {
  return {
    tasks: PLAN,
    now: FIXTURE_NOW,
    options: { viewMode: 'Day', locale: 'en-US' },
    panelWidth: 360,
  };
}

/** Everything that has a paint: critical path, baselines, annotations, hatch, segments, legend. */
export function richFixture(): GanttHeadlessInput {
  const changes: Readonly<Record<string, Partial<GanttTask>>> = {
    wire: { baseline: { start: d(2, 8), end: d(2, 12) } },
    visual: { baseline: { start: d(2, 13), end: d(2, 18) } },
    // Rolled up into the collapsed Build bar as segments in their own colours, off the critical path
    build: { end: d(2, 21) },
    api: { end: d(2, 19), style: { color: '#0EA5E9' } },
    ui: { start: d(2, 18), end: d(2, 21), dependency: undefined, style: { color: '#14B8A6' } },
    // The visible chain wire → visual → launch is the critical path
    launch: { dependency: { taskId: 'visual', lag: 2 }, start: d(2, 22), end: d(2, 22) },
  };
  const tasks: GanttTask[] = PLAN.map(t => ({ ...t, ...changes[t.id] }));
  return {
    tasks,
    now: FIXTURE_NOW,
    showLegend: true,
    panelWidth: 300,
    options: {
      viewMode: 'Day',
      locale: 'en-US',
      criticalPath: true,
      baseline: true,
      rollup: { segments: true },
      nonWorkingTime: { style: 'hatch', showInHeader: true, holidays: [{ start: d(2, 17), label: 'Holiday' }] },
      annotations: [
        { x1: d(2, 13), label: { text: 'Design review' } },
        { x1: d(2, 24), x2: d(2, 27), color: '#7C3AED', label: { text: 'Code freeze' } },
      ],
    },
  };
}

/** Custom markup for the API and Launch bars (theme variables inlined), built-in bars elsewhere. */
export function customFixture(): GanttHeadlessInput {
  return {
    tasks: PLAN.map(t => (t.id === 'build' ? { ...t, collapsed: false } : t)),
    now: FIXTURE_NOW,
    view: 'chart',
    options: { viewMode: 'Day', locale: 'en-US', darkMode: true },
    customBar: ctx => {
      const v = ctx.visual;
      if (ctx.row.task.id === 'api')
        return (
          `<g class="my-bar"><rect x="${v.x}" y="${v.y}" width="${v.width}" height="${v.height}" rx="2" ` +
          `fill="var(--gantt-milestone)" stroke="var(--app-outline, #F59E0B)"/>` +
          `<text x="${v.x + 4}" y="${v.cy}" dominant-baseline="central" style="fill: var(--gantt-bar-text-on-milestone)">API</text></g>`
        );
      if (ctx.row.task.id === 'launch')
        return `<circle cx="${v.x + v.width / 2}" cy="${v.cy}" r="7" fill="var(--gantt-critical)"/>`;
      return null;
    },
  };
}

// ─── Checks every exported SVG passes ───────────────────────

const TAG_SYNTAX = /^<([A-Za-z][\w:.-]*)(?:\s+[\w:.-]+="[^"<>]*")*\s*\/?>$/;
const ENTITY = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;

/**
 * Why `xml` is not a well-formed document with one root (empty: it is): tag syntax, double-quoted
 * attributes, balanced tags, entity references, no stray `>` or `<` in text.
 */
export function xmlErrors(xml: string): string[] {
  const errors: string[] = [];
  const stack: string[] = [];
  let roots = 0;
  let last = 0;
  const text = (s: string) => {
    if (ENTITY.test(s)) errors.push(`bad entity in ${JSON.stringify(s.slice(0, 40))}`);
    if (s.includes('>')) errors.push(`stray > in ${JSON.stringify(s.slice(0, 40))}`);
    if (stack.length === 0 && s.trim()) errors.push(`text outside the root: ${JSON.stringify(s.slice(0, 40))}`);
  };
  for (const m of xml.matchAll(/<[^>]*>/g)) {
    const tag = m[0];
    text(xml.slice(last, m.index));
    last = m.index + tag.length;
    if (tag.startsWith('<?')) {
      if (m.index !== 0) errors.push('XML declaration not first');
      continue;
    }
    if (tag.startsWith('</')) {
      const name = tag.slice(2, -1).trim();
      const open = stack.pop();
      if (open !== name) errors.push(`</${name}> closes <${open ?? 'nothing'}>`);
      continue;
    }
    const syntax = TAG_SYNTAX.exec(tag);
    if (!syntax) {
      errors.push(`bad tag ${tag.slice(0, 80)}`);
      continue;
    }
    if (ENTITY.test(tag)) errors.push(`bad entity in ${tag.slice(0, 80)}`);
    if (stack.length === 0) roots++;
    if (!tag.endsWith('/>')) stack.push(syntax[1]);
  }
  text(xml.slice(last));
  if (stack.length) errors.push(`unclosed ${stack.join(' > ')}`);
  if (roots !== 1) errors.push(`${roots} root elements`);
  return errors;
}

/** Numbers written with more than 2 decimals in the tags of `svg` (D28). */
export function longDecimals(svg: string): string[] {
  const out: string[] = [];
  for (const [tag] of svg.matchAll(/<[^>]*>/g))
    for (const [n] of tag.matchAll(/\d*\.\d{3,}/g)) out.push(`${n} in ${tag}`);
  return out;
}
