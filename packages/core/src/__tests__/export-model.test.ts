// ─────────────────────────────────────────────────────────────
//  Tests — the export model (`buildExportModel`, Phase 12 D2–D4) and
//  its timeline part (`buildTimelinePart`): sizes and layout per view,
//  every paint concrete (no `var(`), range all / visible / dates, today
//  on and off, critical path, baselines, rollup segments, arrows, the
//  header labels, the marker lane, the legend, the empty chart,
//  custom bar markup, title / description / background
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { buildExportModel, type ExportModel } from '../export/model';
import { barReaches } from '../export/extent';
import { createExportSource, exportTimeline, type ChartExportSource, type GanttHeadlessInput } from '../export/source';
import { buildTimelinePart, EXPORT_EMPTY_ROWS, exportBodyHeight } from '../export/timeline';
import { resolveExportFormat, type ResolvedImageExport } from '../render/config';
import { DarkTheme, LightTheme, todayLabelColor } from '../render/theme';
import { resolvePaint } from '../render/paint';
import { MARKER_LANE_HEIGHT } from '../render/markers';
import { HEADER_LABEL_PADDING } from '../render/scales';
import { formatDate } from '../gantt-math';
import type { GanttBarContext, GanttOptions, GanttTask } from '../types';

const NOW = new Date(2026, 2, 4, 10, 30);
const d = (m: number, day: number) => new Date(2026, m, day);

const TASKS: GanttTask[] = [
  { id: 'g', name: 'Design', start: d(2, 2), end: d(2, 20), type: 'group' },
  { id: 'a', name: 'Sketches', start: d(2, 2), end: d(2, 9), parentId: 'g', progress: 100 },
  {
    id: 'b',
    name: 'Mockups',
    start: d(2, 9),
    end: d(2, 20),
    parentId: 'g',
    progress: 40,
    dependency: 'a',
    baseline: { start: d(2, 8), end: d(2, 18) },
  },
  { id: 'h', name: 'Build', start: d(2, 16), end: d(3, 10), type: 'group', collapsed: true },
  { id: 'c', name: 'Backend', start: d(2, 16), end: d(3, 3), parentId: 'h', style: { color: '#123456' } },
  { id: 'e', name: 'Frontend', start: d(2, 23), end: d(3, 10), parentId: 'h' },
  { id: 'm', name: 'Launch', start: d(3, 10), end: d(3, 10), type: 'milestone', dependency: { taskId: 'h', lag: 2 } },
  { id: 'z', name: 'Audit', start: d(2, 5), end: d(2, 12), rowColor: 'var(--gantt-bar-text-on-critical)' },
];

/** Everything that has a paint: critical path, baselines, segments, lane, hatch in the header, legend. */
const RICH: GanttOptions = {
  viewMode: 'Day',
  criticalPath: true,
  baseline: true,
  rollup: { segments: true, color: 'status' },
  nonWorkingTime: { style: 'hatch', showInHeader: true, holidays: [{ start: d(2, 17), label: 'Holiday' }] },
  annotations: [
    { x1: d(2, 12), label: { text: 'Review' } },
    { x1: d(2, 24), x2: d(2, 27), color: 'var(--gantt-milestone)', label: { text: 'Freeze' } },
  ],
};

const source = (options: GanttOptions = {}, extra: Partial<GanttHeadlessInput> = {}) =>
  createExportSource({ tasks: TASKS, options, now: NOW, ...extra });

const opts = (o: Partial<ResolvedImageExport> = {}): ResolvedImageExport => ({
  ...resolveExportFormat('svg', undefined),
  ...o,
});

const model = (s: ChartExportSource, o: Partial<ResolvedImageExport> = {}): ExportModel => buildExportModel(s, opts(o));

/** Every string of the model (functions and the theme left out). */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) if (k !== 'theme') strings(v, out);
  return out;
}

describe('buildExportModel — paints', () => {
  for (const [name, options, extra] of [
    ['light', RICH, {}],
    ['dark', { ...RICH, darkMode: true }, {}],
    ['split view, legend', RICH, { showLegend: true, view: 'split' }],
    ['chart view, no lane', { ...RICH, markers: { lane: false } }, { view: 'chart' }],
    ['table view', RICH, { view: 'table' }],
  ] as const) {
    it(`${name}: no var( anywhere in the model`, () => {
      const m = model(source(options, extra));
      const all = strings(m);
      expect(all.length).toBeGreaterThan(50);
      expect(all.filter(s => s.includes('var('))).toEqual([]);
    });
  }

  it('resolves against the export theme, not the theme shown', () => {
    const s = source({ ...RICH, darkMode: true });
    const dark = model(s);
    const light = model(s, { theme: 'light' });
    expect(dark.theme).toEqual(DarkTheme);
    expect(light.theme).toEqual(LightTheme);
    expect(light.rows[0].fill).toBe(LightTheme.rowBg);
    expect(dark.rows[0].fill).toBe(DarkTheme.rowBg);
    // A theme token in a task colour resolves too (the contrast token on the critical fill)
    const z = light.rows.find(r => r.id === 'z')!;
    expect(z.fill).toBe(resolvePaint('var(--gantt-bar-text-on-critical)', LightTheme));
    expect(light.background).toBe(LightTheme.backgroundColor);
    expect(light.fontFamily).toBe(LightTheme.fontFamily);
    expect(light.fontPx).toBe(12);
  });

  it('background: the theme, transparent (null) or a colour', () => {
    const s = source();
    expect(model(s, { background: 'transparent' }).background).toBeNull();
    expect(model(s, { background: '#fafafa' }).background).toBe('#fafafa');
    expect(model(s, { background: 'theme' }).background).toBe('#FFFFFF');
  });
});

describe('buildExportModel — layout', () => {
  it('split view: the table from x 0, the timeline at its width; header, body, legend', () => {
    const s = source(RICH, { showLegend: true });
    const m = model(s);
    const tl = m.timeline!;
    const { timeline } = exportTimeline(s, 'all');
    expect(m.table).not.toBeNull();
    expect(m.table!.width).toBeGreaterThanOrEqual(s.panelWidth);
    expect(tl.x).toBe(m.table!.width);
    expect(m.width).toBe(m.table!.width + tl.width);
    expect([tl.x0, tl.x1, tl.width]).toEqual([0, timeline.totalWidth, timeline.totalWidth]);
    // The lane shows (labelled annotations): tiers + 18 px
    expect(m.headerHeight).toBe(timeline.headerHeight + MARKER_LANE_HEIGHT);
    expect(tl.lane).toMatchObject({ y: timeline.headerHeight, height: MARKER_LANE_HEIGHT });
    expect(m.bodyHeight).toBe(s.rows.length * s.config.rowHeight);
    expect(m.legend!.y).toBe(m.headerHeight + m.bodyHeight);
    expect(m.height).toBe(m.headerHeight + m.bodyHeight + m.legend!.height);
    expect(m.rows.map(r => [r.id, r.y])).toEqual(s.rows.map(r => [r.task.id, r.visibleIndex * s.config.rowHeight]));
  });

  it('chart view: no table, the timeline at x 0', () => {
    const m = model(source(RICH, { view: 'split' }), { view: 'chart' });
    expect(m.table).toBeNull();
    expect(m.timeline!.x).toBe(0);
    expect(m.width).toBe(m.timeline!.width);
  });

  it('table view: no timeline, no lane, no legend; the header keeps the tiers height', () => {
    const s = source(RICH, { showLegend: true, view: 'table' });
    const m = model(s);
    expect(m.timeline).toBeNull();
    expect(m.legend).toBeNull();
    expect(m.headerHeight).toBe(exportTimeline(s, 'all').timeline.headerHeight);
    expect(m.table!.header.cells.map(c => c.key)).toEqual(s.columns.table.map(c => c.key));
    expect(m.width).toBe(m.table!.width);
    // The pane's width when known (the binding's chart width)
    expect(model({ ...s, tableWidth: 2400 }).width).toBe(2400);
  });

  it("view 'auto' draws the view shown, else the one asked for", () => {
    const s = source({}, { view: 'chart' });
    expect(model(s).table).toBeNull();
    expect(model(s, { view: 'split' }).table).not.toBeNull();
  });

  it('draws every shown row with its zebra or row colour and the row separators', () => {
    const s = source({ gridLines: { horizontal: { color: '#cccccc', width: 1, dash: '2 2' } } });
    const m = model(s);
    expect(m.rows.map(r => r.fill)).toEqual(
      s.rows.map(r =>
        r.task.id === 'z' ? resolvePaint(r.task.rowColor!, LightTheme) : r.visibleIndex % 2 ? '#F8FAFC' : '#FFFFFF',
      ),
    );
    expect(m.rows[0].separator).toEqual({ stroke: '#cccccc', width: 1, dash: '2 2' });
    expect(model(source({ gridLines: { horizontal: false } })).rows[0].separator).toBeNull();
  });

  it('an empty chart draws the header, an empty body and labels.emptyState', () => {
    const s = createExportSource({ tasks: [], now: NOW, options: { labels: { emptyState: 'Nothing yet' } } });
    const m = model(s);
    expect(m.rows).toEqual([]);
    expect(m.bodyHeight).toBe(EXPORT_EMPTY_ROWS * s.config.rowHeight);
    expect(m.bodyHeight).toBe(exportBodyHeight(0, s.config.rowHeight));
    expect(m.empty).toEqual({ text: 'Nothing yet', x: m.width / 2, y: m.headerHeight + m.bodyHeight / 2 });
    expect(m.description).toBe('Nothing yet');
    expect(m.timeline!.bars).toEqual([]);
    expect(model(source()).empty).toBeNull();
  });

  it('is deterministic', () => {
    const s = source(RICH, { showLegend: true });
    expect(model(s)).toEqual(model(s));
    expect(model(source(RICH, { showLegend: true }))).toEqual(model(s));
  });
});

describe('buildExportModel — range (D6)', () => {
  it("'visible' draws the viewport; the header keeps only the cells in it", () => {
    const base = source({ viewMode: 'Day' });
    const s = { ...base, viewport: { x0: 300, x1: 700 } };
    const tl = model(s, { range: 'visible' }).timeline!;
    expect([tl.x0, tl.x1, tl.width]).toEqual([300, 700, 400]);
    for (const tier of tl.tiers) for (const c of tier.cells) expect(c.x < 700 && c.x + c.width > 300).toBe(true);
    for (const x of [...tl.minor!.xs, ...tl.major!.xs]) expect(x >= 300 && x < 700).toBe(true);
    // Bars that reach the viewport stay whole (the serializer clips them); the others are left out
    expect(tl.bars.length).toBeGreaterThan(0);
    expect(tl.bars.length).toBeLessThan(base.rows.length);
    for (const b of tl.bars) expect(barReaches(b.visual, 12, 300, 700)).toBe(true);
  });

  it('dates draw that span; the today line only inside it', () => {
    const s = source({ viewMode: 'Day' });
    const inside = model(s, { range: { start: d(2, 2), end: d(2, 9) } }).timeline!;
    expect(inside.width).toBe(7 * s.config.pxPerDay);
    expect(inside.todayX).not.toBeNull();
    const after = model(s, { range: { start: d(2, 10), end: d(2, 20) } }).timeline!;
    expect(after.todayX).toBeNull();
    expect(after.todayPointer).toBeNull();
  });

  it('describes the drawn tasks, their dates kept inside the range', () => {
    const s = source({ viewMode: 'Day' });
    const fmt = (date: Date) => formatDate(date, 'MMM D, YYYY');
    expect(model(s).description).toBe(`6 tasks from ${fmt(d(2, 2))} to ${fmt(d(3, 10))}`);
    expect(model(s, { range: { start: d(2, 5), end: d(2, 9) } }).description).toBe(
      `6 tasks from ${fmt(d(2, 5))} to ${fmt(d(2, 8))}`,
    );
    expect(model(s, { description: 'Mine' }).description).toBe('Mine');
    const it = source({ viewMode: 'Day', locale: 'it', formats: { dateFormat: 'D MMM YYYY' } });
    expect(model(it).description).toBe(
      `6 tasks from ${formatDate(d(2, 2), 'D MMM YYYY', 'it')} to ${formatDate(d(3, 10), 'D MMM YYYY', 'it')}`,
    );
    expect(model(it).lang).toBe('it');
    expect(model(s).lang).toBe('en');
  });

  it('title: the call, else labels.ariaChart', () => {
    expect(model(source()).title).toBe('Gantt chart timeline');
    expect(model(source({ labels: { ariaChart: 'Plan' } })).title).toBe('Plan');
    expect(model(source(), { title: 'Mine' }).title).toBe('Mine');
  });
});

describe('buildTimelinePart — header', () => {
  const s = source({ viewMode: 'Day' });
  const part = (x0?: number, x1?: number) => {
    const t = exportTimeline(s, 'all');
    return buildTimelinePart({
      source: s,
      timeline: t.timeline,
      x0: x0 ?? t.x0,
      x1: x1 ?? t.x1,
      x: 0,
      theme: LightTheme,
      today: true,
      fontPx: 12,
    });
  };

  it('labels: first tier bold at the font size + 1, start-aligned 6 px in; bottom tier centred', () => {
    const tl = part();
    const [top, bottom] = tl.tiers;
    const first = top.cells.find(c => c.label)!;
    expect(first.label).toMatchObject({ anchor: 'start', x: first.x + 6, fontPx: 13, fontWeight: 600 });
    expect(first.label!.fill).toBe(LightTheme.textPrimary);
    const cell = bottom.cells.find(c => c.label && !c.current)!;
    expect(cell.label).toMatchObject({ anchor: 'middle', x: cell.x + cell.width / 2, fontPx: 12, fontWeight: 400 });
    expect(cell.label!.fill).toBe(LightTheme.textSecondary);
  });

  it('marks the current period on the bottom tier only, in the today-label colour', () => {
    const tl = part();
    expect(tl.tiers[0].cells.some(c => c.current)).toBe(false);
    const current = tl.tiers[1].cells.filter(c => c.current);
    expect(current).toHaveLength(1);
    expect(current[0].label).toMatchObject({ fill: todayLabelColor(LightTheme), fontWeight: 600 });
  });

  it('borders: the major line on delimiters, the border colour elsewhere, none on the first cell', () => {
    const tl = part();
    expect(tl.tiers[1].cells[0].border).toBeNull();
    const strokes = new Set(tl.tiers[1].cells.slice(1).map(c => c.border!.stroke));
    expect(strokes).toEqual(new Set([LightTheme.borderColor, LightTheme.gridLineMajor]));
    expect(tl.tiers[0].cells.slice(1).every(c => c.border!.stroke === LightTheme.gridLineMajor)).toBe(true);
  });

  it('a cell the range cuts keeps a fitted label inside the drawn part, or none when too narrow', () => {
    const t = exportTimeline(s, 'all').timeline;
    const month = t.tiers[0].cells[1];
    const tl = part(month.x + 40, month.x + month.width);
    const cut = tl.tiers[0].cells[0];
    expect(cut.x).toBe(month.x);
    expect(cut.label!.x).toBe(month.x + 40 + HEADER_LABEL_PADDING / 2);
    // A sliver: the partial-label rule hides it
    const sliver = part(month.x + month.width - 10).tiers[0].cells[0];
    expect(sliver.label).toBeNull();
    // A cut bottom cell is centred in its drawn part
    const day = t.tiers[1].cells[10];
    const c = part(day.x + 10).tiers[1].cells[0];
    if (c.label) expect(c.label.x).toBe(day.x + 10 + (day.width - 10) / 2);
  });

  it('fits a long label with an ellipsis', () => {
    const long = source({
      viewMode: 'Day',
      scales: [{ unit: 'day', format: () => 'An extraordinarily long day label' }],
    });
    const t = exportTimeline(long, 'all');
    const tl = buildTimelinePart({
      source: long,
      timeline: t.timeline,
      x0: 0,
      x1: t.x1,
      x: 0,
      theme: LightTheme,
      today: true,
      fontPx: 12,
    });
    const label = tl.tiers[0].cells[3].label!;
    expect(label.text.endsWith('…')).toBe(true);
  });

  it('header bands on the bottom tier with nonWorkingTime.showInHeader; hatch on body bands', () => {
    const r = source(RICH);
    const t = exportTimeline(r, 'all');
    const tl = buildTimelinePart({
      source: r,
      timeline: t.timeline,
      x0: 0,
      x1: t.x1,
      x: 0,
      theme: LightTheme,
      today: true,
      fontPx: 12,
    });
    expect(tl.tiers[0].bands).toEqual([]);
    const bottom = tl.tiers.at(-1)!;
    expect(bottom.bands.length).toBeGreaterThan(0);
    expect(bottom.bands[0]).toMatchObject({ y: bottom.y, height: bottom.height });
    expect(tl.bands.length).toBe(t.timeline.bands.length);
    expect(tl.bands.every(b => b.hatch)).toBe(true);
    expect(tl.bands.some(b => b.fill === LightTheme.holidayBg)).toBe(true);
    expect(source({ ...RICH, nonWorkingTime: { style: 'shade' } }).config.nonWorking!.style).toBe('shade');
  });
});

describe('buildExportModel — today, lane and legend', () => {
  it('today on: the line, the pointer, the lane marker and the legend entry', () => {
    const s = source(RICH, { showLegend: true });
    const m = model(s);
    const tl = m.timeline!;
    expect(tl.todayX).not.toBeNull();
    expect(tl.todayPointer).toBe(tl.todayX);
    const today = tl.lane!.markers.find(k => k.kind === 'today')!;
    expect(today).toMatchObject({ x: tl.todayX, stroke: LightTheme.todayColor });
    expect(today.label!.fill).toBe(todayLabelColor(LightTheme));
    const review = tl.lane!.markers.find(k => k.label?.text === 'Review')!;
    expect(review).toMatchObject({ kind: 'annotation', stroke: LightTheme.arrowColor });
    expect(review.label!.fill).toBe(LightTheme.textPrimary);
    expect(m.legend!.items.length).toBe(5);
    expect(m.legend!.title!.text).toBe('LEGEND');
  });

  it('today off: none of them', () => {
    const m = model(source(RICH, { showLegend: true }), { today: false });
    const tl = m.timeline!;
    expect([tl.todayX, tl.todayPointer]).toEqual([null, null]);
    expect(tl.lane!.markers.some(k => k.kind === 'today')).toBe(false);
    expect(m.legend!.items.length).toBe(4);
    // showToday: false is the default for the call
    expect(model(source({ ...RICH, showToday: false })).timeline!.todayX).toBeNull();
  });

  it('the legend follows showLegend unless the call says; localized title', () => {
    expect(model(source(RICH)).legend).toBeNull();
    expect(model(source(RICH), { legend: true }).legend).not.toBeNull();
    expect(model(source(RICH, { showLegend: true }), { legend: false }).legend).toBeNull();
    // No entry, no strip
    expect(model(source({}), { legend: true, today: false }).legend).toBeNull();
    const it = model(source({ ...RICH, locale: 'it', labels: { legend: 'Legenda' } }), { legend: true });
    expect(it.legend!.title!.text).toBe('LEGENDA');
  });

  it('annotations: regions and lines across the body, labels in the canvas when the lane is off', () => {
    const m = model(source({ ...RICH, markers: { lane: false } }));
    const tl = m.timeline!;
    expect(tl.lane).toBeNull();
    expect(m.headerHeight).toBe(exportTimeline(source(RICH), 'all').timeline.headerHeight);
    expect(tl.annotations).toHaveLength(2);
    expect(tl.annotations[1]).toMatchObject({ paint: LightTheme.milestoneColor });
    expect(tl.annotations[1].region).toMatchObject({ y: 0, height: m.bodyHeight });
    expect(tl.annotations[0].line).toMatchObject({ y1: 0, y2: m.bodyHeight });
    expect(tl.annotations[0].label).toMatchObject({ text: 'Review', paint: LightTheme.arrowColor });
    expect(model(source(RICH)).timeline!.annotations[0].label).toBeNull();
  });
});

describe('buildExportModel — bars and arrows', () => {
  it('bars in row order with resolved paints, never editable', () => {
    const s = source(RICH);
    const tl = model(s).timeline!;
    expect(tl.bars.map(b => b.id)).toEqual(s.rows.map(r => r.task.id));
    for (const b of tl.bars) {
      expect(b.visual.handles).toBeNull();
      expect(b.visual.progressGrip).toBeNull();
      expect(b.visual.connectors).toBeNull();
      expect(b.markup).toBeNull();
    }
    expect(tl.bars.find(b => b.id === 'm')!.kind).toBe('milestone');
    expect(tl.bars.find(b => b.id === 'g')!.kind).toBe('group');
  });

  it('critical bars and arrows in the critical colour', () => {
    const s = source(RICH);
    const tl = model(s).timeline!;
    const critical = tl.bars.filter(b => b.critical);
    expect(critical.length).toBeGreaterThan(0);
    for (const b of critical) expect(b.visual.paint.body).toBe(LightTheme.criticalColor);
    expect(tl.arrows.some(a => a.critical && a.paint === LightTheme.criticalColor)).toBe(true);
    expect(tl.arrows.every(a => a.selected === false && a.halo === null)).toBe(true);
  });

  it('arrows between shown rows only, lag dashed', () => {
    const tl = model(source({ viewMode: 'Day' })).timeline!;
    // a → b and h → m (c and e are collapsed: no link of theirs)
    expect(tl.arrows).toHaveLength(2);
    expect(tl.arrows.map(a => a.dashed)).toEqual([false, true]);
    expect(tl.arrows[1].lagLabel!.text).toBe('+2d');
    expect(tl.arrows.every(a => a.paint === LightTheme.arrowColor)).toBe(true);
  });

  it('baselines with baseline, rollup segments in their colours', () => {
    const tl = model(source(RICH)).timeline!;
    expect(tl.bars.find(b => b.id === 'b')!.visual.baseline).not.toBeNull();
    const segments = tl.bars.find(b => b.id === 'h')!.visual.segments!;
    expect(segments.map(x => x.paint)).toEqual(['#123456', LightTheme.barColor]);
    expect(model(source({ viewMode: 'Day' })).timeline!.bars.find(b => b.id === 'b')!.visual.baseline).toBeNull();
  });

  it('segments follow a range that moves the timeline start', () => {
    const s = source(RICH);
    const all = model(s).timeline!;
    const early = model(s, { range: { start: d(1, 1), end: d(3, 20) } }).timeline!;
    const shift = early.bars[0].visual.x - all.bars[0].visual.x;
    expect(shift).toBeGreaterThan(0);
    const seg = (tl: typeof all) => tl.bars.find(b => b.id === 'h')!.visual.segments!.map(x => x.x);
    expect(seg(early)).toEqual(seg(all).map(x => x + shift));
  });
});

describe('buildExportModel — custom bars (D5)', () => {
  it('a custom bar gives markup with the theme inlined; null keeps the built-in bar', () => {
    const seen: GanttBarContext[] = [];
    const customBar = (ctx: GanttBarContext) => {
      seen.push(ctx);
      return ctx.row.task.id === 'z' ? '<rect fill="var(--gantt-bar)" stroke="var(--gantt-nope, #abc)"/>' : null;
    };
    const s = source({ viewMode: 'Day', darkMode: true }, { customBar });
    const m = model(s, { theme: 'light' });
    const z = m.timeline!.bars.find(b => b.id === 'z')!;
    expect(z.markup).toBe(`<rect fill="${LightTheme.barColor}" stroke="#abc"/>`);
    expect(m.timeline!.bars.filter(b => b.markup === null)).toHaveLength(s.rows.length - 1);
    // The context is the export's: its theme, its resolved visual, nothing selected or editable
    const ctx = seen.find(c => c.row.task.id === 'z')!;
    expect(ctx.theme).toEqual(LightTheme);
    expect(ctx.visual).toBe(z.visual);
    expect(ctx.visual.paint.body).toBe(LightTheme.barColor);
    expect([ctx.isSelected, ctx.enableResize, ctx.draggable]).toEqual([false, false, false]);
    expect(ctx.layoutParams).toEqual({
      origin: exportTimeline(s, 'all').timeline.start,
      pxPerDay: s.config.pxPerDay,
      rowHeight: s.config.rowHeight,
    });
    expect(seen).toHaveLength(s.rows.length);
  });
});
