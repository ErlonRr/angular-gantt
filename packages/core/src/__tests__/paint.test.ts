// Paints: theme tokens (`var(--gantt-*)`) or explicit colours in the render model, and
// `resolvePaint` mapping them back to exactly the colours the model resolved before paints.
import { describe, it, expect } from 'vitest';
import {
  CONTRAST_CSS_VARS,
  DEFAULT_LABELS,
  DarkTheme,
  DependencyType,
  LegacyDarkTheme,
  LegacyLightTheme,
  LightTheme,
  PAINTS,
  THEME_CSS_VARS,
  TaskType,
  ViewMode,
  annotationPaint,
  buildBuiltinColumns,
  buildColumnContext,
  buildLegend,
  buildTimeline,
  buildTooltipModel,
  computeArrowVisual,
  computeBarVisual,
  computeCellVisual,
  computeRowGeometries,
  filterVisible,
  flattenTree,
  headerCellBorder,
  isThemeVar,
  reindexVisible,
  resolveConfig,
  resolvePaint,
  resolveTheme,
  readableOn,
  rowPaint,
  statusPaint,
  themeMetrics,
  themeToCss,
  themeVar,
  type GanttAnnotation,
  type GanttFlatRow,
  type GanttLineStyle,
  type GanttOptions,
  type GanttTask,
  type GanttTheme,
  type GanttBarContext,
  type ThemeColorKey,
  type TimeBand,
  type TimeBandKind,
} from '../index';

const NOW = new Date(2026, 0, 14, 10);

const PALETTES: [string, Required<GanttTheme>][] = [
  ['LightTheme', LightTheme],
  ['DarkTheme', DarkTheme],
  ['LegacyLightTheme', LegacyLightTheme],
  ['LegacyDarkTheme', LegacyDarkTheme],
  [
    'light overrides',
    resolveTheme(false, {
      barColor: '#FDE68A',
      milestoneColor: '#FEF3C7',
      criticalColor: '#FCA5A5',
      barTextColor: '#F8FAFC',
      weekendBg: '#eeeeee',
      holidayBg: '#ffeeee',
      gridLineMajor: '#999999',
    }),
  ],
  ['dark overrides', resolveTheme(true, { barColor: 'rgb(250, 250, 250)', barTextColor: '#000000' })],
];

const OPTION_SETS: [string, GanttOptions][] = [
  ['defaults', {}],
  [
    'day view, non-working time, explicit colours',
    {
      viewMode: ViewMode.Day,
      criticalPath: true,
      baseline: true,
      nonWorkingTime: {
        holidays: [
          new Date(2026, 0, 16),
          { start: new Date(2026, 0, 21), end: new Date(2026, 0, 22), color: '#ff000022' },
        ],
      },
      highlightTime: d => (d.getDate() === 13 ? { color: '#00ff0022' } : d.getDate() === 15 ? {} : null),
      gridLines: { major: { color: '#abcdef', dash: '4 2', width: 2 }, horizontal: { width: 2 } },
      arrows: { color: '#00aa00' },
      bar: { progress: { color: '#ff00ff' } },
    },
  ],
  [
    'hour view, off-hours and intensive hours',
    {
      viewMode: ViewMode.Hour,
      timelinePadding: 0,
      nonWorkingTime: {
        workingHours: { start: 9, end: 18 },
        intensiveHours: [
          { start: 10, end: 12 },
          { start: 14, end: 15, color: '#ffaa0033' },
        ],
      },
      highlightTime: (d, unit) => (unit === 'hour' && d.getHours() === 16 ? { label: 'Standup' } : null),
    },
  ],
  [
    'outside labels in an explicit colour, bar group bars, no grid',
    {
      bar: { label: { position: 'right', color: '#334455' } },
      groupBar: { style: 'bar' },
      gridLines: { minor: false, major: false, horizontal: false },
    },
  ],
  ['inside labels', { bar: { label: { position: 'inside' } }, viewMode: ViewMode.Day }],
];

const task = (id: string, s: Date, e: Date, extra: Partial<GanttTask> = {}): GanttTask => ({
  id,
  name: `Task ${id}`,
  start: s,
  end: e,
  ...extra,
});

const TASKS: GanttTask[] = [
  task('g', new Date(2026, 0, 12), new Date(2026, 0, 30), { type: TaskType.Group, progress: 30 }),
  task('a', new Date(2026, 0, 12), new Date(2026, 0, 20), { parentId: 'g', progress: 50 }),
  task('b', new Date(2026, 0, 20), new Date(2026, 0, 27), {
    parentId: 'g',
    progress: 20,
    barColor: '#FDE68A',
    rowColor: '#fafafa',
    dependency: 'a',
  }),
  task('c', new Date(2026, 0, 14), new Date(2026, 0, 22), {
    progress: 100,
    barColor: '#1E3A8A',
    textColor: '#FFFF00',
    progressColor: '#00ffff',
    baseline: { start: new Date(2026, 0, 13), end: new Date(2026, 0, 21) },
    dependency: [{ taskId: 'a', type: DependencyType.SS, lag: 1 }],
  }),
  task('m', new Date(2026, 0, 27), new Date(2026, 0, 27), { type: TaskType.Milestone, dependency: 'b' }),
  task('n', new Date(2026, 0, 23), new Date(2026, 0, 23), { type: TaskType.Milestone, barColor: '#ef4444' }),
  task('x', new Date(2026, 0, 14), new Date(2026, 0, 14, 23), { status: 'blocked', name: 'A long task name' }),
];
const CRITICAL = new Set(['a', 'b', 'm']);

const flatRows = (tasks: GanttTask[]): GanttFlatRow[] => reindexVisible(filterVisible(flattenTree(tasks, new Set())));

/** Replace every `var(--gantt-*)` inside a CSS value with its theme value. */
const resolveVars = (css: string, theme: Required<GanttTheme>) =>
  css.replace(/var\(--[\w-]+\)/g, v => resolvePaint(v, theme));

function fixture(theme: Required<GanttTheme>, options: GanttOptions) {
  const metrics = themeMetrics(theme);
  const cfg = resolveConfig(options, undefined, metrics);
  const timeline = buildTimeline({ tasks: TASKS, config: cfg, now: NOW, viewportWidth: 1200 });
  const geos = computeRowGeometries(flatRows(TASKS), timeline, cfg);
  const visuals = new Map(
    geos.map(geo => [
      geo.row.task.id,
      computeBarVisual({
        geo,
        cfg,
        toX: timeline.toX,
        isCritical: cfg.criticalPath && CRITICAL.has(geo.row.task.id),
        resizable: true,
        fontPx: metrics.fontPx,
        barTextColor: metrics.barTextColor,
      }),
    ]),
  );
  return { cfg, timeline, geos, visuals };
}

describe('themeVar / isThemeVar / PAINTS', () => {
  it('maps every colour key to its THEME_CSS_VARS property', () => {
    for (const [key, cssVar] of THEME_CSS_VARS) {
      if (key === 'barRadius' || key === 'fontSize' || key === 'fontFamily') continue;
      expect(themeVar(key)).toBe(`var(${cssVar})`);
    }
    expect(themeVar('barColor')).toBe('var(--gantt-bar)');
  });

  it('tells theme tokens from explicit colours', () => {
    expect(isThemeVar('var(--gantt-bar)')).toBe(true);
    expect(isThemeVar(statusPaint('done'))).toBe(true);
    expect(isThemeVar(`var(${CONTRAST_CSS_VARS.bar})`)).toBe(true);
    for (const explicit of ['#FDE68A', 'red', 'rgb(1, 2, 3)', 'var(--my-brand)', 'transparent']) {
      expect(isThemeVar(explicit)).toBe(false);
    }
  });

  it('every PAINTS entry is a theme token resolving to its theme colour', () => {
    const expected: Record<keyof typeof PAINTS, ThemeColorKey> = {
      today: 'todayColor',
      hatch: 'textMuted',
      selectionStroke: 'selectionBorder',
      baseline: 'baselineColor',
      ghost: 'barColor',
      rowBg: 'rowBg',
      rowBgAlt: 'rowBgAlt',
      rowSelected: 'selectionBg',
      progressOverlay: 'progressOverlay',
    };
    for (const [name, key] of Object.entries(expected) as [keyof typeof PAINTS, ThemeColorKey][]) {
      expect(PAINTS[name].startsWith('var(--gantt-')).toBe(true);
      for (const [, theme] of PALETTES) expect(resolvePaint(PAINTS[name], theme)).toBe(theme[key]);
    }
    expect(Object.isFrozen(PAINTS)).toBe(true);
  });
});

describe('resolvePaint', () => {
  it('returns explicit colours unchanged', () => {
    for (const c of ['#123456', 'red', 'rgba(0, 0, 0, 0.5)', 'var(--not-a-gantt-token)']) {
      expect(resolvePaint(c, LightTheme)).toBe(c);
    }
  });

  it.each(PALETTES)('%s: resolves tokens and contrast tokens like themeToCss writes them', (_, theme) => {
    for (const [cssVar, value] of themeToCss(theme)) expect(resolvePaint(`var(${cssVar})`, theme)).toBe(value);
  });

  it('uses the var() fallback for an unknown token', () => {
    expect(resolvePaint('var(--gantt-nope, var(--gantt-text-muted))', LightTheme)).toBe(LightTheme.textMuted);
    expect(resolvePaint('var(--gantt-nope, #abc)', LightTheme)).toBe('#abc');
    expect(resolvePaint('var(--gantt-nope)', LightTheme)).toBe('var(--gantt-nope)');
  });
});

describe('bar paints', () => {
  const cfg = resolveConfig({ bar: { label: { position: 'inside' } } });
  const timeline = buildTimeline({ tasks: TASKS, config: cfg, now: NOW });
  const geos = computeRowGeometries(flatRows(TASKS), timeline, cfg);
  const geo = (id: string) => geos.find(g => g.row.task.id === id)!;
  const bar = (id: string, extra: { isCritical?: boolean; barTextColor?: string } = {}) =>
    computeBarVisual({ geo: geo(id), cfg, toX: timeline.toX, fontPx: 12, ...extra });

  it('palette bars use the theme tokens and the on-bar contrast token', () => {
    const v = bar('a');
    expect(v.tone).toBe('default');
    expect(v.paint.body).toBe('var(--gantt-bar)');
    expect(v.label?.inside).toBe(true);
    expect(v.paint.label).toBe('var(--gantt-bar-text-on-bar)');
    expect(v.paint.progress).toBe('var(--gantt-progress-overlay)');
    expect(v.paint.progress).toBe(PAINTS.progressOverlay);
  });

  it('a light custom barColor gets a concrete readable label colour', () => {
    const v = bar('b');
    expect(v.paint.body).toBe('#FDE68A');
    expect(v.label?.inside).toBe(true);
    expect(v.paint.label).toBe('#0F172A');
    expect(bar('b', { barTextColor: '#111111' }).paint.label).toBe('#111111');
  });

  it('critical bars use the critical tokens, even over an explicit barColor', () => {
    const v = bar('b', { isCritical: true });
    expect(v.tone).toBe('critical');
    expect(v.paint.body).toBe('var(--gantt-critical)');
    expect(v.paint.label).toBe('var(--gantt-bar-text-on-critical)');
  });

  it('task.textColor always wins', () => {
    expect(bar('c').paint.label).toBe('#FFFF00');
    expect(bar('c', { isCritical: true }).paint.label).toBe('#FFFF00');
    expect(bar('c').paint.progress).toBe('#00ffff');
  });

  it('milestones use the milestone tokens; their labels sit outside in the text token', () => {
    const v = bar('m');
    expect(v.tone).toBe('milestone');
    expect(v.paint.body).toBe('var(--gantt-milestone)');
    expect(v.label?.inside).toBe(false);
    expect(v.paint.label).toBe('var(--gantt-text)');
    expect(bar('n').paint.body).toBe('#ef4444');
  });

  it('the inside-label paint of a bar without a label follows the same rules', () => {
    const none = resolveConfig({ bar: { label: { position: 'none' } } });
    const v = computeBarVisual({ geo: geo('a'), cfg: none, toX: timeline.toX });
    expect(v.label).toBeNull();
    expect(v.paint.label).toBe('var(--gantt-bar-text-on-bar)');
  });
});

describe('row, annotation and status paints', () => {
  const geos = computeRowGeometries(
    flatRows(TASKS),
    buildTimeline({ tasks: TASKS, config: resolveConfig({}), now: NOW }),
    resolveConfig({}),
  );

  it('rowPaint: selection > task.rowColor > zebra', () => {
    const b = geos.find(g => g.row.task.id === 'b')!;
    expect(rowPaint(b, true)).toBe('var(--gantt-sel-bg)');
    expect(rowPaint(b, false)).toBe('#fafafa');
    const plain = geos.filter(g => !g.row.task.rowColor);
    expect(plain.some(g => g.row.visibleIndex % 2 === 0)).toBe(true);
    expect(plain.some(g => g.row.visibleIndex % 2 === 1)).toBe(true);
    for (const g of plain) {
      expect(rowPaint(g, false)).toBe(g.row.visibleIndex % 2 === 0 ? 'var(--gantt-row-bg)' : 'var(--gantt-row-bg-alt)');
    }
  });

  it('annotationPaint: its own colour, else the arrow token', () => {
    expect(annotationPaint({ color: '#ff0000' })).toBe('#ff0000');
    expect(annotationPaint({})).toBe('var(--gantt-arrow)');
  });

  it('statusPaint: the status token with the muted-text fallback; custom statuses are muted', () => {
    expect(statusPaint('done')).toBe('var(--gantt-status-done, var(--gantt-text-muted))');
    expect(statusPaint('notStarted')).toBe('var(--gantt-status-not-started, var(--gantt-text-muted))');
    expect(statusPaint('blocked')).toBe('var(--gantt-text-muted)');
    expect(statusPaint(undefined)).toBe('var(--gantt-text-muted)');
  });
});

// ─── The colours the model resolved before paints (1.x / phase 5), as the oracle ──

/** Theme fills of the bands per kind (a `custom` band uses the weekend fill by day, the intensive fill by hour). */
const BAND_TOKENS: Record<TimeBandKind, ThemeColorKey[]> = {
  weekend: ['weekendBg'],
  holiday: ['holidayBg'],
  'off-hours': ['offHoursBg'],
  intensive: ['intensiveBg'],
  custom: ['weekendBg', 'intensiveBg'],
};

const LEGACY_STATUS: Record<string, ThemeColorKey> = {
  notStarted: 'statusNotStarted',
  inProgress: 'statusInProgress',
  overdue: 'statusOverdue',
  done: 'statusDone',
};

describe('resolvePaint(model paint) equals the colour the model resolved before paints', () => {
  const STATUSES = ['notStarted', 'inProgress', 'overdue', 'done', 'blocked'];
  const ANNOTATIONS: GanttAnnotation[] = [
    { x1: new Date(2026, 0, 15), color: '#ff0000' },
    { x1: new Date(2026, 0, 16), x2: new Date(2026, 0, 18) },
  ];

  for (const [themeName, theme] of PALETTES) {
    for (const [optName, options] of OPTION_SETS) {
      it(`${themeName} · ${optName}`, () => {
        const { cfg, timeline, geos, visuals } = fixture(theme, options);
        const r = (p: string) => resolvePaint(p, theme);

        // Bars: explicit task colours pass through untouched; theme defaults are tokens
        for (const geo of geos) {
          const t = geo.row.task;
          const v = visuals.get(t.id)!;
          const critical = v.tone === 'critical';
          const fill = critical
            ? theme.criticalColor
            : (t.barColor ?? (v.kind === 'milestone' ? theme.milestoneColor : theme.barColor));
          expect(r(v.paint.body)).toBe(fill);
          if (t.barColor && !critical) expect(v.paint.body).toBe(t.barColor);
          else expect(v.paint.body.startsWith('var(--gantt-')).toBe(true);
          if (v.progress) expect(r(v.paint.progress)).toBe(t.progressColor ?? cfg.bar.progress.color ?? '#000000');
          if (v.label) {
            const opt = cfg.bar.label;
            const legacy = v.label.inside
              ? (t.textColor ?? opt.color ?? readableOn(fill, theme.barTextColor))
              : (opt.color ?? theme.textPrimary);
            expect(r(v.paint.label)).toBe(legacy);
          }
          for (const selected of [false, true]) {
            const old = selected
              ? theme.selectionBg
              : (t.rowColor ?? (geo.row.visibleIndex % 2 === 0 ? theme.rowBg : theme.rowBgAlt));
            expect(r(rowPaint(geo, selected))).toBe(old);
          }
        }

        // Arrows
        let arrows = 0;
        for (const geo of geos) {
          const deps = geo.row.task.dependency;
          if (!deps) continue;
          const list = typeof deps === 'string' ? [{ taskId: deps }] : Array.isArray(deps) ? deps : [deps];
          for (const dep of list) {
            const from = visuals.get(dep.taskId);
            const to = visuals.get(geo.row.task.id);
            if (!from || !to) continue;
            const critical = cfg.criticalPath && CRITICAL.has(dep.taskId) && CRITICAL.has(geo.row.task.id);
            const a = computeArrowVisual(from, to, dep, cfg, { fromTop: 0, fromBottom: 36 }, critical);
            expect(r(a.paint)).toBe(critical ? theme.criticalColor : (cfg.arrows.color ?? theme.arrowColor));
            if (!critical && cfg.arrows.color) expect(a.paint).toBe(cfg.arrows.color);
            arrows++;
          }
        }
        expect(arrows).toBeGreaterThan(0);

        // Bands (explicit colours pass through) and grid lines
        for (const band of timeline.bands) {
          if (isThemeVar(band.paint)) {
            expect(BAND_TOKENS[band.kind].map(k => themeVar(k))).toContain(band.paint);
          } else expect(r(band.paint)).toBe(band.paint);
        }
        const legacyLine = (style: GanttLineStyle | false | undefined, key: ThemeColorKey) =>
          style === false ? null : (style?.color ?? theme[key]);
        const lines = cfg.gridLines;
        expect(lines.minor && r(lines.minor.paint)).toBe(legacyLine(options.gridLines?.minor, 'gridLine'));
        expect(lines.major && r(lines.major.paint)).toBe(legacyLine(options.gridLines?.major, 'gridLineMajor'));
        expect(lines.horizontal && r(lines.horizontal.paint)).toBe(
          legacyLine(options.gridLines?.horizontal, 'borderColor'),
        );

        // Legend
        const legend = buildLegend({
          showToday: true,
          todayVisible: true,
          annotations: ANNOTATIONS,
          labels: DEFAULT_LABELS,
          criticalPath: true,
          baseline: true,
        });
        expect(legend.map(item => r(item.paint))).toEqual([
          theme.todayColor,
          ...ANNOTATIONS.map(ann => ann.color ?? theme.arrowColor),
          theme.criticalColor,
          theme.baselineColor,
        ]);

        // Tooltip
        const tasksById = new Map(TASKS.map(t => [t.id, t]));
        for (const t of TASKS) {
          const m = buildTooltipModel({
            task: t,
            config: { endDateMode: cfg.endDateMode, normalizeDateOnly: cfg.normalizeDateOnly, baseline: true },
            labels: DEFAULT_LABELS,
            dateFormat: 'MMM D, YYYY',
            now: NOW,
            criticalIds: CRITICAL,
            tasksById,
          });
          expect(m.critical).toBe(CRITICAL.has(t.id));
          expect(r(m.paint.progress)).toBe(m.critical ? theme.criticalColor : (t.barColor ?? theme.barColor));
        }

        // Status dots
        const statusCol = buildBuiltinColumns(DEFAULT_LABELS).find(c => c.key === 'status')!;
        const ctx = buildColumnContext({ tasks: TASKS, config: cfg, now: NOW });
        for (const row of geos.map(g => g.row)) {
          const cell = computeCellVisual(statusCol, row, ctx);
          expect(cell.dotPaint).toBe(statusPaint(cell.status));
        }
        for (const s of STATUSES) {
          const key = LEGACY_STATUS[s];
          expect(r(statusPaint(s))).toBe(key ? theme[key] : theme.textMuted);
        }
      });
    }
  }
});

describe('headerCellBorder', () => {
  /** The Web Component header before paints (gantt-header.component.ts, border-left per cell). */
  function legacyBorder(
    theme: Required<GanttTheme>,
    cfg: ReturnType<typeof resolveConfig>,
    timeline: ReturnType<typeof buildTimeline>,
    i: number,
    x: number,
  ): string {
    const major = cfg.gridLines.major;
    const majorSet = new Set(timeline.majorLines);
    const isMajor = x > 0 && (i < timeline.tiers.length - 1 || majorSet.has(x));
    const border =
      isMajor && major
        ? `${major.width}px ${major.dash ? 'dashed' : 'solid'} ${resolvePaint(major.paint, theme)}`
        : `1px solid ${theme.borderColor}`;
    return x > 0 ? border : 'none';
  }

  const headerOptions: GanttOptions[] = [
    {},
    { viewMode: ViewMode.Day },
    { viewMode: ViewMode.Month, gridLines: { major: { color: '#abcdef', dash: '4 2', width: 2 } } },
    { viewMode: ViewMode.Week, gridLines: { major: false } },
    { viewMode: ViewMode.Hour, timelinePadding: 0 },
    { viewMode: ViewMode.Day, gridLines: { majorUnit: 'week' } },
  ];

  for (const [themeName, theme] of PALETTES) {
    it(`${themeName}: reproduces the Web Component header borders`, () => {
      let majors = 0;
      for (const options of headerOptions) {
        const cfg = resolveConfig(options);
        const timeline = buildTimeline({ tasks: TASKS, config: cfg, now: NOW, viewportWidth: 1500 });
        timeline.tiers.forEach((tier, i) => {
          for (const cell of tier.cells) {
            const border = headerCellBorder(cfg, timeline, i, cell);
            expect(border === null ? 'none' : resolveVars(border, theme)).toBe(
              legacyBorder(theme, cfg, timeline, i, cell.x),
            );
            if (border && cfg.gridLines.major && border.includes(cfg.gridLines.major.paint)) majors++;
          }
        });
      }
      expect(majors).toBeGreaterThan(0);
    });
  }

  it('uses the border token for plain cells, the major paint for delimiters and null for the first cell', () => {
    const cfg = resolveConfig({ viewMode: ViewMode.Day });
    const timeline = buildTimeline({ tasks: TASKS, config: cfg, now: NOW });
    const bottom = timeline.tiers.length - 1;
    const cells = timeline.tiers[bottom].cells;
    expect(headerCellBorder(cfg, timeline, bottom, { x: 0 })).toBeNull();
    const plain = cells.find(c => c.x > 0 && !timeline.majorLines.includes(c.x))!;
    expect(headerCellBorder(cfg, timeline, bottom, plain)).toBe('1px solid var(--gantt-border)');
    const major = cells.find(c => timeline.majorLines.includes(c.x))!;
    expect(headerCellBorder(cfg, timeline, bottom, major)).toBe('1px solid var(--gantt-grid-line-major)');
  });
});

describe('band merging with paints', () => {
  /** True when the colour-only merge (before paints) would have merged two neighbouring bands. */
  const mergeableByColour = (a: TimeBand, b: TimeBand, theme: Required<GanttTheme>) =>
    a.kind === b.kind &&
    resolvePaint(a.paint, theme) === resolvePaint(b.paint, theme) &&
    a.className === b.className &&
    a.label === b.label &&
    a.x + a.width === b.x;

  for (const [themeName, theme] of PALETTES) {
    for (const [optName, options] of OPTION_SETS) {
      it(`${themeName} · ${optName}: same bands as merging by colour`, () => {
        const { timeline } = fixture(theme, options);
        timeline.bands.forEach((band, i) => {
          const next = timeline.bands[i + 1];
          if (next) expect(mergeableByColour(band, next, theme)).toBe(false);
        });
      });
    }
  }

  it('theme bands carry tokens, explicit colours pass through', () => {
    const { timeline } = fixture(LightTheme, OPTION_SETS[1][1]);
    const byKind = (kind: string) => timeline.bands.filter(b => b.kind === kind);
    expect(byKind('weekend').every(b => b.paint === 'var(--gantt-weekend-bg)')).toBe(true);
    expect(byKind('holiday').map(b => b.paint)).toEqual(
      expect.arrayContaining(['var(--gantt-holiday-bg)', '#ff000022']),
    );
    expect(byKind('custom').map(b => b.paint)).toEqual(
      expect.arrayContaining(['#00ff0022', 'var(--gantt-weekend-bg)']),
    );

    const hours = fixture(LightTheme, OPTION_SETS[2][1]).timeline.bands;
    const paintsOf = (kind: string) => new Set(hours.filter(b => b.kind === kind).map(b => b.paint));
    expect(paintsOf('off-hours')).toEqual(new Set(['var(--gantt-off-hours-bg)']));
    expect(paintsOf('intensive')).toEqual(new Set(['var(--gantt-intensive-bg)', '#ffaa0033']));
    expect(paintsOf('custom')).toEqual(new Set(['var(--gantt-intensive-bg)']));
  });
});

describe("nonWorkingTime.style 'disabled'", () => {
  it('greys out weekends, holidays without a colour and off-hours alike; intensive and explicit colours stay', () => {
    const base = OPTION_SETS[1][1];
    const disabled = (o: GanttOptions): GanttOptions => ({
      ...o,
      nonWorkingTime: { ...o.nonWorkingTime, style: 'disabled' },
    });
    const days = fixture(LightTheme, disabled(base)).timeline.bands;
    const kinds = (bands: TimeBand[], kind: string) => new Set(bands.filter(b => b.kind === kind).map(b => b.paint));
    expect(kinds(days, 'weekend')).toEqual(new Set(['var(--gantt-border)']));
    expect(kinds(days, 'holiday')).toEqual(new Set(['var(--gantt-border)', '#ff000022']));
    expect(kinds(days, 'custom')).toEqual(new Set(['#00ff0022', 'var(--gantt-weekend-bg)']));

    const hours = fixture(LightTheme, disabled(OPTION_SETS[2][1])).timeline.bands;
    expect(kinds(hours, 'off-hours')).toEqual(new Set(['var(--gantt-border)']));
    expect(kinds(hours, 'intensive')).toEqual(new Set(['var(--gantt-intensive-bg)', '#ffaa0033']));
  });
});

describe('custom renderer helpers', () => {
  it('resolvePaint accepts the bar context theme (a GanttTheme, as custom renderers get it)', () => {
    const ctxTheme: GanttBarContext['theme'] = { ...DarkTheme };
    expect(resolvePaint(PAINTS.today, ctxTheme)).toBe(DarkTheme.todayColor);
    expect(resolvePaint(`var(${CONTRAST_CSS_VARS.bar})`, ctxTheme)).toMatch(/^#/);
    // Optional tokens missing from a partial theme fall back to the var() fallback, else stay a var()
    const { statusDone: _omitted, ...rest } = LightTheme;
    const partial: GanttTheme = rest;
    expect(resolvePaint('var(--gantt-status-done, #123456)', partial)).toBe('#123456');
  });

  it('annotationPaint gives isToday annotations the today colour, whatever their own colour', () => {
    expect(annotationPaint({ isToday: true, color: '#ff0000' })).toBe(PAINTS.today);
    expect(annotationPaint({ color: '#ff0000' })).toBe('#ff0000');
    expect(annotationPaint({})).toBe('var(--gantt-arrow)');
  });
});
