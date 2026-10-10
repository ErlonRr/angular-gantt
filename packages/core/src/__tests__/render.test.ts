// Render model: scales, delimiters, non-working time, bars, arrows, dates.
import { describe, it, expect } from 'vitest';
import {
  ViewMode,
  DependencyType,
  GanttTask,
  GanttFlatRow,
  DEFAULT_LABELS,
  resolveConfig,
  resolveTheme,
  buildTimeline,
  computeRowGeometries,
  computeBarVisual,
  computeArrowVisual,
  buildTiers,
  WEEK_FORMATS,
  weekNumber,
  unitStart,
  taskSpan,
  dateToPixel,
  parseDate,
  toLocalDay,
  diffDays,
  addDays,
  fitText,
  flattenTree,
  filterVisible,
  reindexVisible,
} from '../index';
import type { GanttOptions } from '../index';

const theme = resolveTheme(false);
const cfg = (o: GanttOptions = {}) => resolveConfig(o, theme);
const t = (id: string, s: Date, e: Date, extra: Partial<GanttTask> = {}): GanttTask => ({
  id,
  name: `Task ${id}`,
  start: s,
  end: e,
  ...extra,
});
const rows = (tasks: GanttTask[]): GanttFlatRow[] => reindexVisible(filterVisible(flattenTree(tasks, new Set())));

describe('calendar time', () => {
  it('local midnights are exactly one day apart, DST included', () => {
    const origin = new Date(2026, 0, 1);
    for (let d = 0; d < 366; d++) {
      const a = dateToPixel(new Date(2026, 0, 1 + d), origin, 48);
      const b = dateToPixel(new Date(2026, 0, 2 + d), origin, 48);
      expect(b - a).toBe(48);
    }
  });

  it('reads ISO date-only values (UTC midnight) as local calendar days', () => {
    const d = toLocalDay(new Date('2026-03-05'));
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 5, 0]);
    expect(parseDate('2026-03-05').getTime()).toBe(new Date(2026, 2, 5).getTime());
  });

  it('addDays keeps date-only values date-only and diffDays counts calendar days', () => {
    expect(addDays(new Date('2026-03-27'), 5).toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(diffDays(new Date(2026, 2, 28), new Date(2026, 3, 1))).toBe(4);
    expect(diffDays(new Date('2026-03-01'), new Date('2026-04-01'))).toBe(31);
  });

  it('endDateMode inclusive extends a date-only end to the end of that day', () => {
    const task = { start: new Date(2026, 0, 5), end: new Date(2026, 0, 31) };
    expect(taskSpan(task, cfg()).end.getDate()).toBe(31);
    expect(taskSpan(task, cfg({ endDateMode: 'inclusive' })).end.getTime()).toBe(new Date(2026, 1, 1).getTime());
  });
});

describe('scales', () => {
  const labels = DEFAULT_LABELS;
  const ctx = { unit: 'week' as const, step: 1, labels, weekStart: 1 as const };
  const mon = new Date(2026, 0, 5),
    nextMon = new Date(2026, 0, 12);

  it('ships week formats: number, label, range, rangeMonth', () => {
    const f = (fmt: unknown) => (fmt as (s: Date, e: Date, c: typeof ctx) => string)(mon, nextMon, ctx);
    expect(f(WEEK_FORMATS.number)).toBe('W2');
    expect(f(WEEK_FORMATS.label)).toBe('Week 2');
    expect(f(WEEK_FORMATS.range)).toBe('5–11');
    expect(f(WEEK_FORMATS.rangeMonth)).toBe('5–11 Jan');
  });

  it('honours weekStart for week cells and numbering', () => {
    expect(unitStart(new Date(2026, 0, 7), 'week', 1, 1).getDate()).toBe(5); // Monday
    expect(unitStart(new Date(2026, 0, 7), 'week', 1, 0).getDate()).toBe(4); // Sunday
    expect(weekNumber(new Date(2026, 0, 1), 0)).toBe(1);
  });

  it('builds N tiers with steps (6-hour cells)', () => {
    const tiers = buildTiers({
      scales: [{ unit: 'day' }, { unit: 'hour', step: 6, format: 'HH' }],
      start: new Date(2026, 0, 5),
      end: new Date(2026, 0, 7),
      pxPerDay: 240,
    });
    expect(tiers).toHaveLength(2);
    expect(tiers[1].cells.map(c => c.label)).toEqual(['00', '06', '12', '18', '00', '06', '12', '18']);
    expect(tiers[1].y).toBe(tiers[0].height);
  });
});

describe('timeline model', () => {
  const tasks = [t('a', new Date(2026, 0, 10), new Date(2026, 2, 20))];

  it('draws month delimiters in Week view even when months start mid-week', () => {
    const tl = buildTimeline({ tasks, config: cfg({ viewMode: ViewMode.Week, showToday: false }) });
    const feb1 = tl.toX(new Date(2026, 1, 1));
    expect(tl.majorLines).toContain(feb1);
    expect(tl.minorLines).not.toContain(feb1);
  });

  it('uses the configured header heights', () => {
    const tl = buildTimeline({ tasks, config: cfg({ headerHeight: 40, subHeaderHeight: 24, showToday: false }) });
    expect(tl.headerHeight).toBe(64);
    expect(tl.tiers.map(x => x.height)).toEqual([40, 24]);
  });

  it('fills the viewport when fitToWidth', () => {
    const tl = buildTimeline({
      tasks,
      config: cfg({ viewMode: ViewMode.Year, showToday: false }),
      viewportWidth: 3000,
    });
    expect(tl.totalWidth).toBeGreaterThanOrEqual(3000);
  });

  it('has no partial cells at the edges', () => {
    const tl = buildTimeline({ tasks, config: cfg({ viewMode: ViewMode.Month, showToday: false }) });
    const bottom = tl.tiers[1].cells;
    expect(bottom[0].start.getDate()).toBe(1);
    expect(bottom.at(-1)!.x + bottom.at(-1)!.width).toBe(tl.totalWidth);
  });

  it('shades weekends and holidays, holidays winning', () => {
    const tl = buildTimeline({
      tasks,
      config: cfg({ viewMode: ViewMode.Day, showToday: false, nonWorkingTime: { holidays: [new Date(2026, 0, 17)] } }),
    });
    const sat = tl.toX(new Date(2026, 0, 17));
    const sun = tl.toX(new Date(2026, 0, 18));
    expect(tl.bands.find(b => b.x === sat)?.kind).toBe('holiday');
    expect(tl.bands.find(b => b.x === sun)?.kind).toBe('weekend');
    expect(tl.bands.find(b => b.x === tl.toX(new Date(2026, 0, 14)))).toBeUndefined();
  });

  it('shades off-hours and intensive hours in hour scales', () => {
    const tl = buildTimeline({
      tasks: [t('h', new Date(2026, 0, 14, 9), new Date(2026, 0, 14, 17))],
      config: cfg({
        viewMode: ViewMode.Hour,
        showToday: false,
        timelinePadding: 0,
        nonWorkingTime: { workingHours: { start: 9, end: 18 }, intensiveHours: [{ start: 10, end: 12 }] },
      }),
    });
    const kinds = new Set(tl.bands.map(b => b.kind));
    expect(kinds.has('off-hours')).toBe(true);
    expect(kinds.has('intensive')).toBe(true);
    const nine = tl.toX(new Date(2026, 0, 14, 9));
    expect(tl.bands.some(b => b.kind === 'off-hours' && b.x + b.width === nine)).toBe(true);
  });

  it('can turn non-working shading off', () => {
    const tl = buildTimeline({ tasks, config: cfg({ viewMode: ViewMode.Day, nonWorkingTime: false }) });
    expect(tl.bands).toHaveLength(0);
  });
});

describe('bars & arrows', () => {
  const c = cfg({ bar: { height: '50%', radius: 6 }, rowHeight: 40, showToday: false });
  const tasks = [
    t('a', new Date(2026, 0, 5), new Date(2026, 0, 20)),
    t('b', new Date(2026, 0, 10), new Date(2026, 0, 25), { dependency: 'a' }),
    t('m', new Date(2026, 0, 26), new Date(2026, 0, 26), { type: 'milestone' as never }),
  ];
  const tl = buildTimeline({ tasks, config: c });
  const geos = computeRowGeometries(rows(tasks), tl, c);

  it('sizes bars from options (height % of row, radius)', () => {
    const v = computeBarVisual({ geo: geos[0], cfg: c, toX: tl.toX });
    expect(v.height).toBe(20);
    expect(v.y).toBe(10);
    expect(v.rx).toBe(6);
  });

  it('places labels inside when they fit, beside when they do not', () => {
    const v = computeBarVisual({ geo: geos[0], cfg: c, toX: tl.toX });
    expect(v.label?.inside).toBe(true);
    const narrow = computeBarVisual({ geo: { ...geos[0], barWidth: 20 }, cfg: c, toX: tl.toX });
    expect(narrow.label?.inside).toBe(false);
    expect(fitText('A very long task name', 40, 12)).toMatch(/…$/);
  });

  it('routes an overlapping FS link with a U-turn into the left edge', () => {
    const from = computeBarVisual({ geo: geos[0], cfg: c, toX: tl.toX });
    const to = computeBarVisual({ geo: geos[1], cfg: c, toX: tl.toX });
    const a = computeArrowVisual(from, to, { type: DependencyType.FS }, c, {
      fromTop: geos[0].y,
      fromBottom: geos[0].y + 40,
    });
    expect(a.d.match(/[LQ]/g)!.length).toBeGreaterThan(4);
    expect(a.head.startsWith(`${to.x},`)).toBe(true);
    expect(a.color).toBe(theme.arrowColor);
  });

  it('enters milestones at the shape edge, critical arrows use criticalColor', () => {
    const from = computeBarVisual({ geo: geos[1], cfg: c, toX: tl.toX });
    const ms = computeBarVisual({ geo: geos[2], cfg: c, toX: tl.toX });
    const a = computeArrowVisual(from, ms, {}, c, { fromTop: 0, fromBottom: 0 }, true);
    expect(a.head.startsWith(`${ms.x},`)).toBe(true);
    expect(a.color).toBe(theme.criticalColor);
  });
});
