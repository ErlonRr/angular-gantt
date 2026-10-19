// Bars, rows and the tooltip painted from a resolved task style (Phase 10, D9/D10): fill,
// progress, label colour and position, height, radius, classes and rollup segments. Without a
// style the output is exactly what the deprecated flat fields gave before.
import { describe, it, expect } from 'vitest';
import {
  CONTRAST_CSS_VARS,
  DEFAULT_LABELS,
  EMPTY_TASK_STYLE,
  PAINTS,
  TaskType,
  buildTimeline,
  buildTooltipModel,
  computeBarVisual,
  computeRowGeometries,
  createStyleResolver,
  filterVisible,
  flattenTree,
  readableOn,
  reindexVisible,
  resolveBarHeight,
  resolveConfig,
  rowPaint,
  taskOwnStyle,
  themeVar,
  type BarSegment,
  type BarVisualInput,
  type GanttFlatRow,
  type GanttOptions,
  type GanttTask,
  type GanttTaskStyle,
  type RowGeometry,
} from '../index';
import { DEMO_TASKS } from '../demo';

const NOW = new Date(2026, 0, 14, 10);

const task = (id: string, extra: Partial<GanttTask> = {}): GanttTask => ({
  id,
  name: `Task ${id}`,
  start: new Date(2026, 0, 12),
  end: new Date(2026, 0, 20),
  progress: 40,
  ...extra,
});

const rowsOf = (tasks: GanttTask[]): GanttFlatRow[] => reindexVisible(filterVisible(flattenTree(tasks, new Set())));

function setup(tasks: GanttTask[], options: GanttOptions = {}) {
  const cfg = resolveConfig(options);
  const timeline = buildTimeline({ tasks, config: cfg, now: NOW, viewportWidth: 1200 });
  const geos = computeRowGeometries(rowsOf(tasks), timeline, cfg);
  const geo = (id: string): RowGeometry => geos.find(g => g.row.task.id === id)!;
  const bar = (id: string, extra: Partial<BarVisualInput> = {}) =>
    computeBarVisual({ geo: geo(id), cfg, toX: timeline.toX, resizable: true, ...extra });
  const styled = (id: string, style: GanttTaskStyle, extra: Partial<BarVisualInput> = {}) =>
    bar(id, { style, ...extra });
  return { cfg, timeline, geos, geo, bar, styled };
}

const MILESTONE = task('m', { type: TaskType.Milestone, start: new Date(2026, 0, 15), end: new Date(2026, 0, 15) });
const GROUP = task('g', { type: TaskType.Group });
const BASE = [task('a'), GROUP, MILESTONE];

describe('computeBarVisual — style colours', () => {
  it('the fill comes from style.color, the label is readable on it and the tone keeps the kind', () => {
    const { styled } = setup(BASE);
    const v = styled('a', { color: '#FDE68A' });
    expect(v.paint.body).toBe('#FDE68A');
    expect(v.tone).toBe('default');
    expect(v.label?.inside).toBe(true);
    expect(v.paint.label).toBe(readableOn('#FDE68A', '#FFFFFF'));
    expect(v.paint.label).toBe('#0F172A');
    const m = styled('m', { color: '#1E3A8A' });
    expect(m.paint.body).toBe('#1E3A8A');
    expect(m.tone).toBe('milestone');
    // An explicit barTextColor is preferred when readable
    expect(styled('a', { color: '#1E3A8A' }, { barTextColor: '#FFFF00' }).paint.label).toBe('#FFFF00');
  });

  it('the critical path still paints the critical colour and its contrast token over style.color', () => {
    const { styled } = setup(BASE);
    const v = styled('a', { color: '#FDE68A' }, { isCritical: true });
    expect(v.tone).toBe('critical');
    expect(v.paint.body).toBe('var(--gantt-critical)');
    expect(v.paint.label).toBe(`var(${CONTRAST_CSS_VARS.critical})`);
    // style.textColor still wins over the contrast token
    expect(styled('a', { color: '#FDE68A', textColor: '#ABCDEF' }, { isCritical: true }).paint.label).toBe('#ABCDEF');
  });

  it('progressColor fills the progress at full opacity; without it the overlay token at bar.progress.opacity', () => {
    const { styled, cfg } = setup(BASE);
    const own = styled('a', { progressColor: '#00FFFF' });
    expect(own.paint.progress).toBe('#00FFFF');
    expect(own.progress?.opacity).toBe(1);
    const theme = styled('a', {});
    expect(theme.paint.progress).toBe(PAINTS.progressOverlay);
    expect(theme.progress?.opacity).toBe(cfg.bar.progress.opacity);
  });

  it('textColor wins over bar.label.color and the computed contrast colour; outside labels keep their colour', () => {
    const { styled } = setup(BASE, { bar: { label: { color: '#222222' } } });
    expect(styled('a', { color: '#FDE68A' }).paint.label).toBe('#222222');
    expect(styled('a', { color: '#FDE68A', textColor: '#FF0000' }).paint.label).toBe('#FF0000');
    const outside = styled('a', { textColor: '#FF0000', label: 'right' });
    expect(outside.label?.inside).toBe(false);
    expect(outside.paint.label).toBe('#222222');
  });
});

describe('computeBarVisual — style geometry', () => {
  it('height: px or % of the row, clamped like bar.height; group bars too', () => {
    const { styled, bar, cfg } = setup(BASE);
    const rh = cfg.rowHeight;
    expect(styled('a', { height: 12 }).height).toBe(12);
    expect(styled('a', { height: '50%' }).height).toBe(rh / 2);
    expect(styled('a', { height: 999 }).height).toBe(rh - 2);
    expect(styled('a', { height: 1 }).height).toBe(4);
    expect(styled('g', { height: 10 }).height).toBe(10);
    expect(bar('a').height).toBe(resolveBarHeight(cfg.bar.height, rh));
    // The bar stays centred on the row
    const v = styled('a', { height: 12 });
    expect(v.y + v.height / 2).toBe(v.cy);
    expect(v.focusRect.height).toBe(12 + 6);
  });

  it('height sizes a milestone (default milestone.size or 45 % of the row)', () => {
    const { styled, bar, cfg } = setup(BASE);
    expect(bar('m').width).toBe(Math.round(cfg.rowHeight * 0.45));
    const m = styled('m', { height: 20 });
    expect(m.width).toBe(20);
    expect(m.height).toBe(20);
    expect(m.y).toBe(m.cy - 10);
  });

  it('radius replaces bar.radius; summary bars and milestones keep their caps on it', () => {
    const { styled, bar, cfg } = setup(BASE);
    expect(bar('a').rx).toBe(cfg.bar.radius);
    expect(styled('a', { radius: 9 }).rx).toBe(9);
    expect(styled('a', { radius: 0 }).rx).toBe(0);
    expect(styled('a', { radius: 0 }).path).not.toContain('A');
    // Summary group bars: at most 2 px
    expect(styled('g', { radius: 9 }).rx).toBe(2);
    expect(styled('g', { radius: 1 }).rx).toBe(1);
    const size = bar('m').width;
    expect(styled('m', { radius: 1 }).rx).toBe(1);
    expect(styled('m', { radius: 99 }).rx).toBe(size / 4);
    // Unreadable radii fall back to bar.radius
    expect(styled('a', { radius: -1 }).rx).toBe(cfg.bar.radius);
    expect(styled('a', { radius: Number.NaN }).rx).toBe(cfg.bar.radius);
    // The focus ring grows with the radius
    expect(styled('a', { radius: 9 }).focusRect.rx).toBe(9 + 3);
  });

  it('the bar.groupBar "bar" style uses the full style radius', () => {
    const { styled } = setup(BASE, { groupBar: { style: 'bar' } });
    expect(styled('g', { radius: 9 }).rx).toBe(9);
  });

  it('label: the position comes from style.label, else bar.label.position', () => {
    const { styled, bar } = setup(BASE);
    expect(bar('a').label?.inside).toBe(true);
    expect(styled('a', { label: 'none' }).label).toBeNull();
    const left = styled('a', { label: 'left' }).label!;
    expect(left.inside).toBe(false);
    expect(left.anchor).toBe('end');
    expect(styled('a', { label: 'right' }).label?.anchor).toBe('start');
    expect(styled('a', { label: 'bogus' as GanttTaskStyle['label'] }).label?.inside).toBe(true);
    // A milestone can't hold text: inside → right
    expect(styled('m', { label: 'inside' }).label?.anchor).toBe('start');
    const none = setup(BASE, { bar: { label: { position: 'none' } } });
    expect(none.bar('a').label).toBeNull();
    expect(none.styled('a', { label: 'inside' }).label?.inside).toBe(true);
  });

  it('className: the style classes, or null', () => {
    const { styled, bar } = setup(BASE);
    expect(bar('a').className).toBeNull();
    expect(styled('a', { className: 'hot  cold' }).className).toBe('hot  cold');
    expect(styled('a', { className: '' }).className).toBeNull();
  });
});

describe('computeBarVisual — segments', () => {
  const seg = (x: number, width: number, paint = '#111'): BarSegment => ({ x, width, paint });

  it('null without segments, with an empty list and for milestones', () => {
    const { bar } = setup(BASE);
    expect(bar('a').segments).toBeNull();
    expect(bar('a', { segments: null }).segments).toBeNull();
    expect(bar('a', { segments: [] }).segments).toBeNull();
    expect(bar('m', { segments: [seg(0, 1000)] }).segments).toBeNull();
  });

  it('keeps the segments in order with their paints, clipped to the bar; empty ones are dropped', () => {
    const { bar } = setup(BASE);
    const v = bar('g');
    const { x, width } = v;
    const out = bar('g', {
      segments: [seg(x - 10, 20, 'red'), seg(x + 30, 10, 'blue'), seg(x + width - 5, 50, 'green'), seg(x + 15, 0)],
    }).segments;
    expect(out).toEqual([seg(x, 10, 'red'), seg(x + 30, 10, 'blue'), seg(x + width - 5, 5, 'green')]);
    expect(bar('g', { segments: [seg(x - 50, 10), seg(x + width + 1, 10)] }).segments).toBeNull();
  });

  it('does not touch the input segments', () => {
    const { bar } = setup(BASE);
    const input = [seg(-1e6, 2e6)];
    bar('a', { segments: input });
    expect(input).toEqual([seg(-1e6, 2e6)]);
  });
});

describe('default output: unchanged without styles', () => {
  /** Tasks using every deprecated flat field, like the paint fixtures. */
  const FLAT: GanttTask[] = [
    task('g', { type: TaskType.Group, progress: 30, barColor: '#6366F1' }),
    task('a', { parentId: 'g', progress: 50 }),
    task('b', { parentId: 'g', progress: 20, barColor: '#FDE68A', rowColor: '#fafafa', className: 'x y' }),
    task('c', { progress: 100, barColor: '#1E3A8A', textColor: '#FFFF00', progressColor: '#00ffff' }),
    task('m', {
      type: TaskType.Milestone,
      start: new Date(2026, 0, 23),
      end: new Date(2026, 0, 23),
      barColor: '#ef4444',
    }),
    task('n', { type: TaskType.Milestone, start: new Date(2026, 0, 27), end: new Date(2026, 0, 27) }),
  ];

  it('no style = the task own style = the resolver without layers', () => {
    const { geos, cfg, timeline } = setup(FLAT);
    const resolve = createStyleResolver({ config: cfg, now: NOW });
    for (const geo of geos) {
      for (const isCritical of [false, true]) {
        const base = { geo, cfg, toX: timeline.toX, isCritical, resizable: true };
        const plain = computeBarVisual(base);
        expect(computeBarVisual({ ...base, style: taskOwnStyle(geo.row.task) })).toEqual(plain);
        expect(computeBarVisual({ ...base, style: resolve(geo.row) })).toEqual(plain);
      }
    }
  });

  it('the flat fields paint what they painted before (fill, label, progress, class, row)', () => {
    const { bar, geo } = setup(FLAT);
    expect(bar('b').paint.body).toBe('#FDE68A');
    expect(bar('b').paint.label).toBe(readableOn('#FDE68A', '#FFFFFF'));
    expect(bar('b').className).toBe('x y');
    expect(bar('c').paint.label).toBe('#FFFF00');
    expect(bar('c').paint.progress).toBe('#00ffff');
    expect(bar('c').progress?.opacity).toBe(1);
    expect(bar('m').paint.body).toBe('#ef4444');
    expect(bar('n').paint.body).toBe('var(--gantt-milestone)');
    expect(bar('n').paint.label).toBe(themeVar('textPrimary'));
    expect(bar('a').paint.body).toBe('var(--gantt-bar)');
    expect(bar('a').className).toBeNull();
    expect(rowPaint(geo('b'), false)).toBe('#fafafa');
  });

  it('task.style paints exactly like the same colours in the flat fields', () => {
    const toStyle = (t: GanttTask): GanttTask => {
      const { barColor, rowColor, textColor, progressColor, className, ...rest } = t;
      const style: GanttTaskStyle = {
        ...(barColor && { color: barColor }),
        ...(rowColor && { rowColor }),
        ...(textColor && { textColor }),
        ...(progressColor && { progressColor }),
        ...(className && { className }),
      };
      return { ...rest, style };
    };
    const flat = setup(FLAT);
    const styled = setup(FLAT.map(toStyle));
    for (const t of FLAT) {
      expect(styled.bar(t.id)).toEqual(flat.bar(t.id));
      expect(styled.bar(t.id, { isCritical: true })).toEqual(flat.bar(t.id, { isCritical: true }));
      expect(rowPaint(styled.geo(t.id), false)).toBe(rowPaint(flat.geo(t.id), false));
    }
  });

  it('the demo plan keeps its colours, now in task.style', () => {
    const colours = Object.fromEntries(DEMO_TASKS.filter(t => t.style?.color).map(t => [t.id, t.style!.color]));
    expect(colours).toEqual({ p1: '#6366F1', 'ms-p1': '#F59E0B', p2: '#10B981', 'ms-p2': '#10B981' });
    for (const t of DEMO_TASKS) {
      expect(t.barColor).toBeUndefined();
      expect(t.rowColor).toBeUndefined();
      expect(t.textColor).toBeUndefined();
      expect(t.progressColor).toBeUndefined();
      expect(t.className).toBeUndefined();
    }
    // Painted exactly like the former flat barColor
    const asFlat = DEMO_TASKS.map(({ style, ...t }) => (style?.color ? { ...t, barColor: style.color } : t));
    const now = setup(DEMO_TASKS);
    const before = setup(asFlat);
    for (const t of DEMO_TASKS) {
      expect(now.bar(t.id)).toEqual(before.bar(t.id));
      expect(rowPaint(now.geo(t.id), false)).toBe(rowPaint(before.geo(t.id), false));
    }
  });
});

describe('rowPaint with a style', () => {
  const TASKS = [
    task('a'),
    task('b', { rowColor: '#alias' }),
    task('c', { rowColor: '#alias', style: { rowColor: '#own' } }),
  ];

  it('selection > the style rowColor > zebra', () => {
    const { geo } = setup(TASKS);
    expect(rowPaint(geo('a'), true, { rowColor: '#123456' })).toBe(PAINTS.rowSelected);
    expect(rowPaint(geo('a'), false, { rowColor: '#123456' })).toBe('#123456');
    expect(rowPaint(geo('a'), false, EMPTY_TASK_STYLE)).toBe(PAINTS.rowBg);
    expect(rowPaint(geo('b'), false, {})).toBe(PAINTS.rowBgAlt);
  });

  it('without a style: task.style.rowColor > the flat rowColor > zebra', () => {
    const { geo } = setup(TASKS);
    expect(rowPaint(geo('a'), false)).toBe(PAINTS.rowBg);
    expect(rowPaint(geo('b'), false)).toBe('#alias');
    expect(rowPaint(geo('c'), false)).toBe('#own');
    expect(rowPaint(geo('c'), false, null)).toBe('#own');
  });

  it('the resolver feeds it the cascaded row colour', () => {
    const { geo, cfg } = setup(TASKS, { styles: { levels: [{ rowColor: '#level' }] } });
    const resolve = createStyleResolver({ config: cfg, now: NOW });
    expect(rowPaint(geo('a'), false, resolve(geo('a').row))).toBe('#level');
    expect(rowPaint(geo('b'), false, resolve(geo('b').row))).toBe('#alias');
    expect(rowPaint(geo('c'), false, resolve(geo('c').row))).toBe('#own');
  });
});

describe('resolver → bar visual', () => {
  it('styles, rollup colour and rule reach the bar; the critical path still wins the fill', () => {
    const tasks = [task('p'), task('k', { parentId: 'p' }), task('q', { parentId: 'p', className: 'flat' })];
    const { geo, cfg, timeline } = setup(tasks, {
      styles: {
        task: { height: 10, className: 'kind' },
        parent: { radius: 0, label: 'left' },
        levels: [null, { color: '#level' }],
        rule: (row, ctx) => (ctx.critical ? { className: 'crit' } : null),
      },
    });
    const critical = new Set(['k']);
    const rollups = new Map([
      ['p', { progress: 50, start: null, end: null, status: 'inProgress' as const, color: '#roll', children: [] }],
    ]);
    const resolve = createStyleResolver({ config: cfg, critical, rollups, now: NOW });
    const visual = (id: string) =>
      computeBarVisual({
        geo: geo(id),
        cfg,
        toX: timeline.toX,
        isCritical: critical.has(id),
        style: resolve(geo(id).row),
      });
    const p = visual('p');
    expect(p.paint.body).toBe('#roll');
    expect(p.rx).toBe(0);
    expect(p.height).toBe(10);
    expect(p.label?.anchor).toBe('end');
    expect(p.className).toBe('kind');
    const k = visual('k');
    expect(k.paint.body).toBe('var(--gantt-critical)');
    expect(k.className).toBe('kind crit');
    const q = visual('q');
    expect(q.paint.body).toBe('#level');
    expect(q.className).toBe('kind flat');
  });
});

describe('buildTooltipModel — style', () => {
  const input = (t: GanttTask, extra: Partial<Parameters<typeof buildTooltipModel>[0]> = {}) => ({
    task: t,
    config: { endDateMode: 'exclusive', normalizeDateOnly: true, baseline: false } as const,
    labels: DEFAULT_LABELS,
    dateFormat: 'YYYY-MM-DD',
    now: NOW,
    ...extra,
  });

  it('fills the progress with the style colour, like the bar body', () => {
    expect(buildTooltipModel(input(task('a'), { style: { color: '#123456' } })).paint.progress).toBe('#123456');
    expect(buildTooltipModel(input(task('a'), { style: EMPTY_TASK_STYLE })).paint.progress).toBe('var(--gantt-bar)');
    // The passed style replaces the task's own (it is the resolved one, aliases included)
    expect(buildTooltipModel(input(task('a', { barColor: '#ff0000' }), { style: {} })).paint.progress).toBe(
      'var(--gantt-bar)',
    );
  });

  it('without a style: task.style.color > barColor > the bar token; critical wins', () => {
    expect(buildTooltipModel(input(task('a'))).paint.progress).toBe('var(--gantt-bar)');
    expect(buildTooltipModel(input(task('a', { barColor: '#ff0000' }))).paint.progress).toBe('#ff0000');
    expect(
      buildTooltipModel(input(task('a', { barColor: '#ff0000', style: { color: '#00ff00' } }))).paint.progress,
    ).toBe('#00ff00');
    expect(
      buildTooltipModel(input(task('a', { style: { color: '#00ff00' } }), { criticalIds: new Set(['a']) })).paint
        .progress,
    ).toBe('var(--gantt-critical)');
  });
});
