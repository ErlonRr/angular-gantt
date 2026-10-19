// ─────────────────────────────────────────────────────────────
//  Tests — Phase 10 contract: the new options and their resolved
//  defaults (density, responsive, week numbering, styles, rollup,
//  arrow routing, toolbar panel toggle and overflow, collapsed groups),
//  the row-hover theme token, the "More" label, the week rules and
//  the bar-height helper. Unset options keep the 1.x output.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, expectTypeOf } from 'vitest';
import * as core from '../index';
import {
  DEFAULT_FORMATS,
  DEFAULT_LABELS,
  DENSITY_METRICS,
  DarkTheme,
  ISO_WEEK,
  LegacyDarkTheme,
  LegacyLightTheme,
  LightTheme,
  THEME_CSS_VARS,
  US_WEEK,
  buildTimeline,
  computeBarVisual,
  computeRowGeometries,
  localeWeekRule,
  resolveBarHeight,
  resolveConfig,
  resolveTheme,
  resolveWeek,
  themeToCss,
  themeVar,
  type GanttBarContext,
  type GanttFlatRow,
  type GanttOptions,
  type GanttScale,
  type GanttTask,
  type GanttTaskStyle,
  type ResolvedTaskStyle,
  type ResolvedToolbar,
  type ScaleFormatContext,
  type WeekRule,
  type WeekStart,
} from '../index';

const task = (id: string, extra: Partial<GanttTask> = {}): GanttTask => ({
  id,
  name: id,
  start: new Date(2026, 0, 12),
  end: new Date(2026, 0, 20),
  ...extra,
});

const toolbar = (o: GanttOptions = {}) => resolveConfig(o).toolbar as ResolvedToolbar;

describe('resolveConfig: Phase 10 defaults keep the 1.x geometry', () => {
  const cfg = resolveConfig();

  it('normal density: rows 36, tiers 32 / 28, 32 px controls', () => {
    expect(cfg.density).toBe('normal');
    expect(cfg.rowHeight).toBe(36);
    expect(cfg.tierHeights).toEqual([32, 28]);
    expect(cfg.controlSize).toBe(32);
  });

  it('responsive on: below 640 px the chart view', () => {
    expect(cfg.responsive).toEqual({ breakpoint: 640, view: 'chart' });
  });

  it('weeks start on Monday and follow ISO-8601', () => {
    expect(cfg.weekStart).toBe(1);
    expect(cfg.week).toEqual({ firstDay: 1, minimalDays: 4 });
  });

  it('styles: every layer empty, no levels, no rule', () => {
    expect(cfg.styles).toEqual({ task: {}, group: {}, milestone: {}, parent: {}, levels: [], rule: null });
  });

  it('no rollup, orthogonal arrows, groups start expanded', () => {
    expect(cfg.rollup).toBe(false);
    expect(cfg.arrows.routing).toBe('orthogonal');
    expect(cfg.groupBar.collapsed).toBe(false);
  });

  it('toolbar: no panel toggle, overflow into the More menu', () => {
    expect(toolbar()).toMatchObject({ panelToggle: false, overflow: 'menu' });
    expect(toolbar({ toolbar: {} })).toMatchObject({ panelToggle: false, overflow: 'menu' });
    expect(resolveConfig({ toolbar: false }).toolbar).toBe(false);
  });

  it('explicit undefined keeps the defaults', () => {
    const c = resolveConfig({
      density: undefined,
      responsive: undefined,
      weekStart: undefined,
      weekNumbering: undefined,
      styles: undefined,
      rollup: undefined,
      arrows: { routing: undefined },
      groupBar: { collapsed: undefined },
      toolbar: { panelToggle: undefined, overflow: undefined },
    });
    for (const key of [
      'density',
      'controlSize',
      'rowHeight',
      'tierHeights',
      'responsive',
      'weekStart',
      'week',
      'styles',
      'rollup',
      'arrows',
      'groupBar',
      'toolbar',
    ] as const) {
      expect(c[key], key).toEqual(cfg[key]);
    }
  });

  it('the formats leave the readout format unset (core picks it by unit)', () => {
    expect(DEFAULT_FORMATS.readoutFormat).toBeUndefined();
  });
});

describe('resolveConfig: density', () => {
  it('follows the density table', () => {
    expect(DENSITY_METRICS).toEqual({
      compact: { rowHeight: 28, tierHeights: [28, 24], controlSize: 28 },
      normal: { rowHeight: 36, tierHeights: [32, 28], controlSize: 32 },
      comfortable: { rowHeight: 44, tierHeights: [36, 32], controlSize: 36 },
    });
    for (const density of ['compact', 'normal', 'comfortable'] as const) {
      const c = resolveConfig({ density });
      const m = DENSITY_METRICS[density];
      expect(c.density).toBe(density);
      expect(c.rowHeight).toBe(m.rowHeight);
      expect(c.tierHeights).toEqual(m.tierHeights);
      expect(c.controlSize).toBe(m.controlSize);
    }
  });

  it.each(['compact', 'normal', 'comfortable'] as const)(
    '%s: an explicit rowHeight, headerHeight or subHeaderHeight wins',
    density => {
      const m = DENSITY_METRICS[density];
      expect(resolveConfig({ density, rowHeight: 50 }).rowHeight).toBe(50);
      expect(resolveConfig({ density, rowHeight: 50 }).tierHeights).toEqual(m.tierHeights);
      expect(resolveConfig({ density, headerHeight: 40 }).tierHeights).toEqual([40, m.tierHeights[1]]);
      expect(resolveConfig({ density, subHeaderHeight: 20 }).tierHeights).toEqual([m.tierHeights[0], 20]);
      expect(resolveConfig({ density, rowHeight: 50, headerHeight: 40 }).controlSize).toBe(m.controlSize);
    },
  );

  it('an unknown density reads as normal', () => {
    const c = resolveConfig({ density: 'huge' as GanttOptions['density'] });
    expect(c.density).toBe('normal');
    expect(c.rowHeight).toBe(36);
  });

  it('rows follow the density through the timeline model', () => {
    const tasks = [task('a'), task('b')];
    const config = resolveConfig({ density: 'compact', showToday: false });
    const tl = buildTimeline({ tasks, config, now: new Date(2026, 0, 15) });
    expect(tl.headerHeight).toBe(28 + 24);
    const rows: GanttFlatRow[] = tasks.map((t, i) => ({
      task: t,
      level: 0,
      visibleIndex: i,
      hasChildren: false,
      isCollapsed: false,
      hidden: false,
      barType: 'task',
    }));
    expect(computeRowGeometries(rows, tl, config).map(g => [g.y, g.height])).toEqual([
      [0, 28],
      [28, 28],
    ]);
  });
});

describe('resolveConfig: responsive', () => {
  it('false turns it off', () => {
    expect(resolveConfig({ responsive: false }).responsive).toBe(false);
  });

  it('fills in the missing fields', () => {
    expect(resolveConfig({ responsive: {} }).responsive).toEqual({ breakpoint: 640, view: 'chart' });
    expect(resolveConfig({ responsive: { breakpoint: 900 } }).responsive).toEqual({ breakpoint: 900, view: 'chart' });
    expect(resolveConfig({ responsive: { view: 'table' } }).responsive).toEqual({ breakpoint: 640, view: 'table' });
  });
});

describe('week start and numbering', () => {
  it('ISO and US rules', () => {
    expect(ISO_WEEK).toEqual({ firstDay: 1, minimalDays: 4 });
    expect(US_WEEK).toEqual({ firstDay: 0, minimalDays: 1 });
    expect(Object.isFrozen(ISO_WEEK) && Object.isFrozen(US_WEEK)).toBe(true);
  });

  it('weekStart 0 → US numbering, unset → ISO, 6 → the ISO rule starting on Saturday', () => {
    const sun = resolveConfig({ weekStart: 0 });
    expect(sun.weekStart).toBe(0);
    expect(sun.week).toEqual(US_WEEK);
    const unset = resolveConfig();
    expect(unset.weekStart).toBe(1);
    expect(unset.week).toEqual(ISO_WEEK);
    const mon = resolveConfig({ weekStart: 1 });
    expect(mon.weekStart).toBe(1);
    expect(mon.week).toEqual(ISO_WEEK);
    const sat = resolveConfig({ weekStart: 6 });
    expect(sat.weekStart).toBe(6);
    expect(sat.week).toEqual({ firstDay: 6, minimalDays: 4 });
  });

  it('weekNumbering gives the rule and, without weekStart, the first day', () => {
    expect(resolveWeek('us', undefined)).toEqual({ start: 0, rule: US_WEEK });
    expect(resolveWeek('iso', undefined)).toEqual({ start: 1, rule: ISO_WEEK });
    expect(resolveWeek(undefined, undefined)).toEqual({ start: 1, rule: ISO_WEEK });
    expect(resolveWeek(undefined, 0)).toEqual({ start: 0, rule: US_WEEK });
    expect(resolveWeek(undefined, 6)).toEqual({ start: 6, rule: { firstDay: 6, minimalDays: 4 } });
  });

  it('weekStart overrides the rule’s first day, keeping its minimal days', () => {
    expect(resolveWeek('iso', 0)).toEqual({ start: 0, rule: { firstDay: 0, minimalDays: 4 } });
    expect(resolveWeek('us', 1)).toEqual({ start: 1, rule: { firstDay: 1, minimalDays: 1 } });
    expect(resolveWeek('us', 6)).toEqual({ start: 6, rule: { firstDay: 6, minimalDays: 1 } });
    const c = resolveConfig({ weekNumbering: 'us', weekStart: 1 });
    expect([c.weekStart, c.week]).toEqual([1, { firstDay: 1, minimalDays: 1 }]);
  });

  it('locale numbering reads Intl week data when the runtime has it, else ISO', () => {
    const hasWeekInfo = (() => {
      const loc = new Intl.Locale('de') as Intl.Locale & { getWeekInfo?: unknown; weekInfo?: unknown };
      return typeof loc.getWeekInfo === 'function' || loc.weekInfo !== undefined;
    })();
    if (hasWeekInfo) {
      expect(localeWeekRule('de')).toEqual(ISO_WEEK);
      expect(localeWeekRule('en-US')).toEqual(US_WEEK);
      expect(resolveWeek('locale', undefined, 'en-US')).toEqual({ start: 0, rule: US_WEEK });
      expect(resolveConfig({ weekNumbering: 'locale', locale: 'de' }).week).toEqual(ISO_WEEK);
    } else {
      expect(localeWeekRule('en-US')).toEqual(ISO_WEEK);
    }
    // Missing or malformed tags read as the default locale ('en'), never the host's
    expect(localeWeekRule('not a tag!')).toEqual(localeWeekRule('en'));
    expect(localeWeekRule()).toEqual(localeWeekRule('en'));
    for (const tag of ['de', 'en-US', 'ar-EG', 'fa-IR', 'mv']) {
      const { start, rule } = resolveWeek('locale', undefined, tag);
      expect([0, 1, 6]).toContain(start);
      expect(rule.firstDay).toBe(start);
      expect(rule.minimalDays).toBeGreaterThanOrEqual(1);
      expect(rule.minimalDays).toBeLessThanOrEqual(7);
    }
  });

  it('header formats receive the week rule; the default header is unchanged', () => {
    const seen: ScaleFormatContext[] = [];
    const scales: GanttScale[] = [
      {
        unit: 'week',
        format: (_s, _e, ctx) => {
          seen.push(ctx);
          return '';
        },
      },
    ];
    const tasks = [task('a')];
    const now = new Date(2026, 0, 15);
    for (const weekStart of [undefined, 0, 6] as const) {
      seen.length = 0;
      buildTimeline({ tasks, config: resolveConfig({ scales, weekStart, showToday: false }), now });
      const expected = resolveWeek(undefined, weekStart);
      expect(seen.length).toBeGreaterThan(0);
      for (const ctx of seen) {
        expect(ctx.weekStart).toBe(expected.start);
        expect(ctx.week).toEqual(expected.rule);
      }
    }
    const labels = (o: GanttOptions) =>
      buildTimeline({ tasks, config: resolveConfig({ viewMode: 'Week', showToday: false, ...o }), now }).tiers.map(t =>
        t.cells.map(c => [c.start.getTime(), c.label]),
      );
    expect(labels({})).toEqual(labels({ weekStart: 1 }));
    expect(labels({})).toEqual(labels({ weekNumbering: 'iso' }));
  });

  it('weekStart 6 starts the week cells on Saturday', () => {
    const tl = buildTimeline({
      tasks: [task('a')],
      config: resolveConfig({ viewMode: 'Week', weekStart: 6, showToday: false }),
      now: new Date(2026, 0, 15),
    });
    const weeks = tl.tiers.at(-1)!.cells.filter(c => !c.partial);
    expect(weeks.length).toBeGreaterThan(0);
    for (const cell of weeks) expect(cell.start.getDay()).toBe(6);
  });

  it('types', () => {
    expectTypeOf<WeekStart>().toEqualTypeOf<0 | 1 | 6>();
    expectTypeOf<ScaleFormatContext['week']>().toEqualTypeOf<WeekRule>();
    expectTypeOf<NonNullable<GanttOptions['weekStart']>>().toEqualTypeOf<WeekStart>();
  });
});

describe('resolveConfig: styles and rollup', () => {
  it('passes the style layers through', () => {
    const rule = () => ({ color: 'red' });
    const styles = {
      task: { color: '#111111' },
      group: { height: 10 },
      milestone: { radius: 2 },
      parent: { className: 'parent' },
      // eslint-disable-next-line no-sparse-arrays
      levels: [{ color: '#222222' }, , null, undefined, { label: 'none' as const }],
      rule,
    };
    const c = resolveConfig({ styles });
    expect(c.styles.task).toBe(styles.task);
    expect(c.styles.group).toBe(styles.group);
    expect(c.styles.milestone).toBe(styles.milestone);
    expect(c.styles.parent).toBe(styles.parent);
    expect(c.styles.levels).toEqual([{ color: '#222222' }, null, null, null, { label: 'none' }]);
    expect(c.styles.rule).toBe(rule);
    expect(resolveConfig({ styles: { task: { color: '#111111' } } }).styles).toEqual({
      task: { color: '#111111' },
      group: {},
      milestone: {},
      parent: {},
      levels: [],
      rule: null,
    });
  });

  it('rollup: true expands to the defaults', () => {
    expect(resolveConfig({ rollup: true }).rollup).toEqual({
      progress: 'duration',
      dates: true,
      color: false,
      segments: false,
    });
    expect(resolveConfig({ rollup: {} }).rollup).toEqual(resolveConfig({ rollup: true }).rollup);
  });

  it('rollup: false or unset is off; partial options keep the other defaults', () => {
    expect(resolveConfig({ rollup: false }).rollup).toBe(false);
    expect(resolveConfig({}).rollup).toBe(false);
    expect(resolveConfig({ rollup: { progress: false } }).rollup).toEqual({
      progress: false,
      dates: true,
      color: false,
      segments: false,
    });
    const color = (children: readonly GanttTask[]) => (children.length ? '#123456' : null);
    expect(resolveConfig({ rollup: { progress: 'count', dates: false, color, segments: true } }).rollup).toEqual({
      progress: 'count',
      dates: false,
      color,
      segments: true,
    });
    expect(resolveConfig({ rollup: { color: 'status' } }).rollup).toMatchObject({ color: 'status' });
  });

  it('passes routing, panel toggle, overflow and collapsed groups through', () => {
    expect(resolveConfig({ arrows: { routing: 'straight' } }).arrows.routing).toBe('straight');
    expect(toolbar({ toolbar: { panelToggle: true, overflow: 'wrap' } })).toMatchObject({
      panelToggle: true,
      overflow: 'wrap',
    });
    expect(resolveConfig({ groupBar: { collapsed: true } }).groupBar.collapsed).toBe(true);
  });
});

describe('theme: row hover token', () => {
  it('rowHoverBg is the last theme token, --gantt-row-hover-bg', () => {
    expect(THEME_CSS_VARS).toHaveLength(40);
    expect(THEME_CSS_VARS.at(-1)).toEqual(['rowHoverBg', '--gantt-row-hover-bg']);
    expect(themeVar('rowHoverBg')).toBe('var(--gantt-row-hover-bg)');
  });

  it('a light and a dark tint, kept by the legacy palettes', () => {
    expect(LightTheme.rowHoverBg).toBe('rgba(15, 23, 42, 0.04)');
    expect(DarkTheme.rowHoverBg).toBe('rgba(148, 163, 184, 0.08)');
    expect(LegacyLightTheme.rowHoverBg).toBe(LightTheme.rowHoverBg);
    expect(LegacyDarkTheme.rowHoverBg).toBe(DarkTheme.rowHoverBg);
    expect(new Map(themeToCss(LightTheme)).get('--gantt-row-hover-bg')).toBe('rgba(15, 23, 42, 0.04)');
  });

  it('can be overridden, and an undefined override keeps the palette value', () => {
    expect(resolveTheme(false, { rowHoverBg: 'transparent' }).rowHoverBg).toBe('transparent');
    expect(resolveTheme(true, { rowHoverBg: undefined }).rowHoverBg).toBe(DarkTheme.rowHoverBg);
  });
});

describe('labels', () => {
  it('names the toolbar menu button "More"', () => {
    expect(DEFAULT_LABELS.more).toBe('More');
  });
});

describe('bars: resolveBarHeight, className and segments', () => {
  it('resolves a length against the row, within 4 px and the row height − 2', () => {
    expect(resolveBarHeight('60%', 36)).toBeCloseTo(21.6);
    expect(resolveBarHeight('40%', 36)).toBeCloseTo(14.4);
    expect(resolveBarHeight(20, 36)).toBe(20);
    expect(resolveBarHeight(100, 36)).toBe(34);
    expect(resolveBarHeight(1, 36)).toBe(4);
    expect(resolveBarHeight(undefined, 36)).toBeCloseTo(21.6);
    expect(resolveBarHeight('wide' as `${number}%`, 30)).toBeCloseTo(18);
  });

  it('the bar visual uses it, and carries className and no segments', () => {
    const cfg = resolveConfig();
    const tl = buildTimeline({ tasks: [task('a')], config: cfg, now: new Date(2026, 0, 15) });
    const geo = (t: GanttTask) =>
      computeRowGeometries(
        [
          {
            task: t,
            level: 0,
            visibleIndex: 0,
            hasChildren: false,
            isCollapsed: false,
            hidden: false,
            barType: 'task',
          },
        ],
        tl,
        cfg,
      )[0];
    const plain = computeBarVisual({ geo: geo(task('a')), cfg, toX: tl.toX });
    expect(plain.height).toBe(resolveBarHeight(cfg.bar.height, cfg.rowHeight));
    expect(plain.className).toBeNull();
    expect(plain.segments).toBeNull();
    const classed = computeBarVisual({ geo: geo(task('a', { className: 'mine' })), cfg, toX: tl.toX });
    expect(classed.className).toBe('mine');
  });
});

describe('types and exports', () => {
  it('GanttTask.style and GanttBarContext.style', () => {
    expectTypeOf<GanttTask['style']>().toEqualTypeOf<GanttTaskStyle | undefined>();
    expectTypeOf<GanttBarContext['style']>().toEqualTypeOf<ResolvedTaskStyle>();
  });

  it('the index exports the Phase 10 modules', () => {
    for (const name of [
      'resolveWeek',
      'localeWeekRule',
      'resolveBarHeight',
      'mergeTaskStyles',
      'taskAliasStyle',
      'createStyleResolver',
      'computeRollups',
      'applyRollups',
      'summaryStatus',
      'createGanttSyncGroup',
      'createEchoGuard',
      'isNarrow',
      'reduceResponsive',
      'persistedView',
      'reduceMenu',
      'layoutCssVars',
      'rowIndexAtY',
    ] as const) {
      expect(typeof (core as Record<string, unknown>)[name], name).toBe('function');
    }
  });
});
