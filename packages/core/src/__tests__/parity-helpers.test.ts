// ─────────────────────────────────────────────────────────────
//  Tests — helpers both bindings share (Gantry 2 phase 7, step 0.2):
//  the task-list grid template, the virtual-window equality, the
//  horizontal window quantum, the tooltip delays, the load-state
//  announcement, the today-label contrast token and the progress
//  overlay token.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  CONTRAST_CSS_VARS,
  DEFAULT_LABELS,
  DarkTheme,
  HORIZONTAL_WINDOW_QUANTUM,
  LegacyDarkTheme,
  LegacyLightTheme,
  LightTheme,
  MIN_TEXT_CONTRAST,
  PAINTS,
  THEME_CSS_VARS,
  TOOLTIP_HIDE_DELAY,
  TOOLTIP_SHOW_DELAY,
  CLOCK_INTERVAL,
  SPLITTER_KEY_STEP,
  SPLITTER_TOGGLE_OFFSET,
  STATE_SAVE_DELAY,
  VIRTUAL_OVERSCAN_ROWS,
  COLUMN_MIN_WIDTH,
  COLUMN_MAX_WIDTH,
  announceLoadState,
  buildTimeline,
  columnsGridTemplate,
  computeBarVisual,
  computeHorizontalWindow,
  computeRowGeometries,
  computeVirtualWindow,
  contrastRatio,
  filterVisible,
  flattenTree,
  parseColor,
  readableOnTint,
  reindexVisible,
  resolveConfig,
  resolvePaint,
  resolveTheme,
  sameVirtualWindow,
  themeToCss,
  todayLabelColor,
  type GanttTask,
  type GanttTheme,
  type LoadStateSnapshot,
  type VirtualWindow,
} from '../index';

// ─── columnsGridTemplate ──────────────────────────────────────

/** The template both bindings computed before step 0.2 (WC `gridTemplate`, Angular `gridTemplate()`). */
function previousGridTemplate(cols: readonly { width: number; flex?: boolean | undefined }[]): string {
  const flexIdx = cols.some(c => c.flex) ? cols.findIndex(c => c.flex) : cols.length - 1;
  return cols.map((c, i) => (i === flexIdx ? `minmax(${c.width}px, 1fr)` : `${c.width}px`)).join(' ');
}

describe('columnsGridTemplate', () => {
  it('grows the last column when none is flex', () => {
    expect(columnsGridTemplate([{ width: 200 }, { width: 90 }, { width: 60 }])).toBe('200px 90px minmax(60px, 1fr)');
  });

  it('grows the flex column (the first one when several are)', () => {
    expect(columnsGridTemplate([{ width: 200, flex: true }, { width: 90 }, { width: 60 }])).toBe(
      'minmax(200px, 1fr) 90px 60px',
    );
    expect(columnsGridTemplate([{ width: 200 }, { width: 90, flex: true }, { width: 60, flex: true }])).toBe(
      '200px minmax(90px, 1fr) 60px',
    );
    expect(columnsGridTemplate([{ width: 200, flex: false }, { width: 90 }])).toBe('200px minmax(90px, 1fr)');
  });

  it('is empty without columns and a single growing track for one column', () => {
    expect(columnsGridTemplate([])).toBe('');
    expect(columnsGridTemplate([{ width: 140 }])).toBe('minmax(140px, 1fr)');
  });

  it('equals the template both bindings computed before', () => {
    const sets: { width: number; flex?: boolean | undefined }[][] = [
      [],
      [{ width: 1 }],
      [{ width: 220 }, { width: 96 }, { width: 96 }, { width: 70 }],
      [{ width: 220, flex: true }, { width: 96 }, { width: 96 }, { width: 70 }],
      [{ width: 220 }, { width: 96, flex: true }, { width: 96, flex: undefined }, { width: 70, flex: true }],
      [{ width: 12.5 }, { width: 0 }],
    ];
    for (const cols of sets) expect(columnsGridTemplate(cols)).toBe(previousGridTemplate(cols));
  });
});

// ─── sameVirtualWindow ────────────────────────────────────────

describe('sameVirtualWindow', () => {
  const base: VirtualWindow = {
    first: 6,
    last: 19,
    paddingTop: 240,
    paddingBottom: 3200,
    pinnedBefore: [1, 3],
    pinnedAfter: [50],
  };
  const copy = (over: Partial<VirtualWindow> = {}): VirtualWindow => ({
    ...base,
    pinnedBefore: [...base.pinnedBefore],
    pinnedAfter: [...base.pinnedAfter],
    ...over,
  });

  it('compares by value, pinned lists included', () => {
    expect(sameVirtualWindow(base, base)).toBe(true);
    expect(sameVirtualWindow(base, copy())).toBe(true);
  });

  it('tells apart every field', () => {
    expect(sameVirtualWindow(base, copy({ first: 5 }))).toBe(false);
    expect(sameVirtualWindow(base, copy({ last: 20 }))).toBe(false);
    expect(sameVirtualWindow(base, copy({ paddingTop: 200 }))).toBe(false);
    expect(sameVirtualWindow(base, copy({ paddingBottom: 3160 }))).toBe(false);
  });

  it('tells apart pinned lists by length and by content', () => {
    expect(sameVirtualWindow(base, copy({ pinnedBefore: [1] }))).toBe(false);
    expect(sameVirtualWindow(base, copy({ pinnedBefore: [1, 4] }))).toBe(false);
    expect(sameVirtualWindow(base, copy({ pinnedBefore: [] }))).toBe(false);
    expect(sameVirtualWindow(base, copy({ pinnedAfter: [50, 60] }))).toBe(false);
    expect(sameVirtualWindow(base, copy({ pinnedAfter: [51] }))).toBe(false);
    expect(
      sameVirtualWindow(copy({ pinnedBefore: [], pinnedAfter: [] }), copy({ pinnedBefore: [], pinnedAfter: [] })),
    ).toBe(true);
  });

  it('a scroll inside the overscan keeps the window; a pinned row changes it', () => {
    // rows 6..20 for any scrollTop in (400, 440)
    const a = computeVirtualWindow(410, 40, 200, 100, 4);
    expect(sameVirtualWindow(a, computeVirtualWindow(430, 40, 200, 100, 4))).toBe(true);
    expect(sameVirtualWindow(a, computeVirtualWindow(440, 40, 200, 100, 4))).toBe(false);
    const pinned = computeVirtualWindow(410, 40, 200, 100, 4, [2, 90]);
    expect(sameVirtualWindow(a, pinned)).toBe(false);
    expect(sameVirtualWindow(pinned, computeVirtualWindow(430, 40, 200, 100, 4, [90, 2]))).toBe(true);
    expect(sameVirtualWindow(pinned, computeVirtualWindow(410, 40, 200, 100, 4, [2, 91]))).toBe(false);
  });
});

// ─── HORIZONTAL_WINDOW_QUANTUM / tooltip delays ───────────────

describe('shared constants', () => {
  it('HORIZONTAL_WINDOW_QUANTUM snaps the horizontal window to 256px chunks', () => {
    expect(HORIZONTAL_WINDOW_QUANTUM).toBe(256);
    const at = (scrollLeft: number) =>
      computeHorizontalWindow({
        scrollLeft,
        viewportWidth: 800,
        totalWidth: 10_000,
        quantum: HORIZONTAL_WINDOW_QUANTUM,
      });
    expect(at(1000)).toEqual({ x0: 512, x1: 2304 });
    expect(at(1000 + 20)).toEqual(at(1000));
    expect(at(0)).toEqual({ x0: 0, x1: 1280 });
  });

  it('tooltip delays: 320 ms to open, 120 ms to close', () => {
    expect(TOOLTIP_SHOW_DELAY).toBe(320);
    expect(TOOLTIP_HIDE_DELAY).toBe(120);
  });

  it('the constants both bindings read from core (Phase 7 review)', () => {
    expect(VIRTUAL_OVERSCAN_ROWS).toBe(4);
    expect([COLUMN_MIN_WIDTH, COLUMN_MAX_WIDTH]).toEqual([40, 800]);
    expect(SPLITTER_KEY_STEP).toBe(24);
    expect(SPLITTER_TOGGLE_OFFSET).toBe(24);
    expect(STATE_SAVE_DELAY).toBe(150);
    expect(CLOCK_INTERVAL).toBe(60_000);
  });
});

// ─── announceLoadState ────────────────────────────────────────

describe('announceLoadState', () => {
  const s = (isLoading: boolean, hasMore: boolean, loadedCount: number, error?: unknown): LoadStateSnapshot =>
    error === undefined ? { isLoading, hasMore, loadedCount } : { isLoading, hasMore, loadedCount, error };

  const TABLE: [string, LoadStateSnapshot | null, LoadStateSnapshot | null, string | null][] = [
    ['no data source → none', null, null, null],
    ['data source set, idle', null, s(false, true, 0), null],
    ['data source set while loading', null, s(true, true, 0), 'Loading…'],
    ['idle → loading', s(false, true, 50), s(true, true, 50), 'Loading…'],
    ['loading → loaded, more remain', s(true, true, 50), s(false, true, 100), '100 tasks loaded'],
    ['loading → last page', s(true, true, 100), s(false, false, 120), 'All 120 tasks loaded'],
    ['loading → failed (true)', s(true, true, 50), s(false, true, 50, true), null],
    ['loading → failed (Error)', s(true, true, 50), s(false, true, 50, new Error('x')), null],
    ['loading → failed (0 thrown)', s(true, true, 50), s(false, true, 50, 0), null],
    ['loading → error false', s(true, true, 50), s(false, true, 100, false), '100 tasks loaded'],
    ['loading → error null (PagedLoader)', s(true, true, 50), s(false, false, 60, null), 'All 60 tasks loaded'],
    ['still loading', s(true, true, 50), s(true, true, 50), null],
    ['still idle, count changed', s(false, true, 50), s(false, true, 80), null],
    ['data source removed while loading', s(true, true, 50), null, null],
    ['failed → retrying', s(false, true, 50, true), s(true, true, 50), 'Loading…'],
  ];

  it.each(TABLE)('%s', (_, prev, next, expected) => {
    expect(announceLoadState(prev, next, DEFAULT_LABELS)).toBe(expected);
  });

  it('reads translated labels, defaults for the missing ones', () => {
    const labels = {
      loading: 'Caricamento…',
      announceLoaded: (n: number) => `${n} attività caricate`,
      allLoaded: (n: number) => `Tutte le ${n} attività caricate`,
    };
    expect(announceLoadState(null, s(true, true, 0), labels)).toBe('Caricamento…');
    expect(announceLoadState(s(true, true, 0), s(false, true, 50), labels)).toBe('50 attività caricate');
    expect(announceLoadState(s(true, true, 50), s(false, false, 70), labels)).toBe('Tutte le 70 attività caricate');
    expect(announceLoadState(s(true, true, 0), s(false, true, 50), { loading: 'x' })).toBe('50 tasks loaded');
    expect(announceLoadState(s(true, true, 0), s(false, false, 50))).toBe('All 50 tasks loaded');
  });
});

// ─── readableOnTint / --gantt-today-label ─────────────────────

const TODAY_TINT = 0.14;

/** The current-period cell background: `todayColor` at 14 % over the header background. */
function tintOf(fg: string, bg: string, alpha = TODAY_TINT): string {
  const f = parseColor(fg)!;
  const b = parseColor(bg)!;
  const [r, g, bl] = [0, 1, 2].map(i => f[i] * alpha + b[i] * (1 - alpha));
  return `rgb(${r}, ${g}, ${bl})`;
}

describe('readableOnTint', () => {
  it('light theme: #B45309 (3.97:1 on its tint) → #964B13 (80/20 towards the text colour, 5.01:1)', () => {
    const { todayColor, headerBackground, textPrimary } = LightTheme;
    const tint = tintOf(todayColor, headerBackground);
    expect(contrastRatio(todayColor, tint)).toBeCloseTo(3.97, 2);
    const label = readableOnTint(todayColor, headerBackground, TODAY_TINT, textPrimary);
    expect(label).toBe('#964B13');
    expect(contrastRatio(label, tint)).toBeCloseTo(5.01, 2);
    // The 90/10 step is not enough
    expect(contrastRatio('#A54F0E', tint)!).toBeLessThan(MIN_TEXT_CONTRAST);
  });

  it('dark theme: #FBBF24 already reads 6.47:1 and is kept as given', () => {
    const { todayColor, headerBackground, textPrimary } = DarkTheme;
    expect(contrastRatio(todayColor, tintOf(todayColor, headerBackground))).toBeCloseTo(6.47, 2);
    expect(readableOnTint(todayColor, headerBackground, TODAY_TINT, textPrimary)).toBe('#FBBF24');
    expect(readableOnTint('#fbbf24', headerBackground, TODAY_TINT, textPrimary)).toBe('#fbbf24');
  });

  it('legacy light theme: the amber #F59E0B is darkened until it reaches 4.5:1', () => {
    const { todayColor, headerBackground, textPrimary } = LegacyLightTheme;
    const tint = tintOf(todayColor, headerBackground);
    expect(contrastRatio(todayColor, tint)!).toBeLessThan(MIN_TEXT_CONTRAST);
    const label = readableOnTint(todayColor, headerBackground, TODAY_TINT, textPrimary);
    expect(label).toMatch(/^#[0-9A-F]{6}$/);
    expect(contrastRatio(label, tint)!).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it('takes the first 10 % step that reaches `min`', () => {
    const { todayColor, headerBackground, textPrimary } = LightTheme;
    const tint = tintOf(todayColor, headerBackground);
    const strict = readableOnTint(todayColor, headerBackground, TODAY_TINT, textPrimary, 7);
    expect(contrastRatio(strict, tint)!).toBeGreaterThanOrEqual(7);
    expect(readableOnTint(todayColor, headerBackground, TODAY_TINT, textPrimary, 3)).toBe(todayColor);
  });

  it('returns the most readable step when none reaches `min`, and fg for unparsable colours', () => {
    // Grey on grey towards a slightly different grey: never 4.5:1
    expect(readableOnTint('#777777', '#777777', 0.14, '#7A7A7A')).toBe('#7A7A7A');
    for (const [fg, bg, toward] of [
      ['var(--brand)', '#FFFFFF', '#000000'],
      ['#B45309', 'transparent', '#000000'],
      ['#B45309', '#FFFFFF', 'currentColor'],
    ] as const) {
      expect(readableOnTint(fg, bg, 0.14, toward)).toBe(fg);
    }
  });
});

describe('--gantt-today-label', () => {
  const PALETTES: [string, Required<GanttTheme>][] = [
    ['LightTheme', LightTheme],
    ['DarkTheme', DarkTheme],
    ['LegacyLightTheme', LegacyLightTheme],
    ['LegacyDarkTheme', LegacyDarkTheme],
    ['light, custom today colour', resolveTheme(false, { todayColor: '#FACC15' })],
    ['dark, custom header', resolveTheme(true, { todayColor: '#B45309', headerBackground: '#334155' })],
  ];

  it.each(PALETTES)('%s: ≥ 4.5:1 on the today tint over the header', (_, theme) => {
    const label = todayLabelColor(theme);
    expect(contrastRatio(label, tintOf(theme.todayColor, theme.headerBackground))!).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
    expect(new Map(themeToCss(theme)).get(CONTRAST_CSS_VARS.todayLabel)).toBe(label);
    expect(resolvePaint(`var(${CONTRAST_CSS_VARS.todayLabel})`, theme)).toBe(label);
  });

  it('light → #964B13, dark → #FBBF24 (unchanged)', () => {
    expect(todayLabelColor(LightTheme)).toBe('#964B13');
    expect(todayLabelColor(DarkTheme)).toBe('#FBBF24');
    expect(todayLabelColor(LegacyDarkTheme)).toBe(DarkTheme.todayColor);
  });

  it('themeToCss: 42 entries, the four contrast tokens last, the today label last of all', () => {
    for (const [, theme] of PALETTES) {
      const css = themeToCss(theme);
      expect(css).toHaveLength(42);
      expect(css.slice(THEME_CSS_VARS.length).map(([name]) => name)).toEqual([
        '--gantt-bar-text-on-bar',
        '--gantt-bar-text-on-milestone',
        '--gantt-bar-text-on-critical',
        '--gantt-today-label',
      ]);
    }
  });
});

// ─── progressOverlay / --gantt-progress-overlay ───────────────

describe('progress overlay token', () => {
  const task = (id: string, extra: Partial<GanttTask> = {}): GanttTask => ({
    id,
    name: id,
    start: new Date(2026, 0, 12),
    end: new Date(2026, 0, 20),
    progress: 40,
    ...extra,
  });

  function visual(t: GanttTask, options: Parameters<typeof resolveConfig>[0] = {}) {
    const cfg = resolveConfig(options);
    const timeline = buildTimeline({ tasks: [t], config: cfg, now: new Date(2026, 0, 14) });
    const [geo] = computeRowGeometries(reindexVisible(filterVisible(flattenTree([t], new Set()))), timeline, cfg);
    return computeBarVisual({ geo: geo, cfg, toX: timeline.toX });
  }

  it('is a theme key, #000000 in all four palettes, written as --gantt-progress-overlay', () => {
    for (const theme of [LightTheme, DarkTheme, LegacyLightTheme, LegacyDarkTheme]) {
      expect(theme.progressOverlay).toBe('#000000');
      expect(new Map(themeToCss(theme)).get('--gantt-progress-overlay')).toBe('#000000');
    }
    expect(THEME_CSS_VARS).toContainEqual(['progressOverlay', '--gantt-progress-overlay']);
    expect(PAINTS.progressOverlay).toBe('var(--gantt-progress-overlay)');
    expect(resolveTheme(false, { progressOverlay: '#FFFFFF' }).progressOverlay).toBe('#FFFFFF');
  });

  it('theme bars paint their progress with the token, no explicit colour', () => {
    const v = visual(task('a'));
    expect(v.progress).not.toBeNull();
    expect(v.paint.progress).toBe('var(--gantt-progress-overlay)');
    expect(v.progress?.opacity).toBe(0.25);
    for (const theme of [LightTheme, DarkTheme]) expect(resolvePaint(v.paint.progress, theme)).toBe('#000000');
    expect(resolvePaint(v.paint.progress, resolveTheme(false, { progressOverlay: '#123456' }))).toBe('#123456');
  });

  it('explicit progress colours still win, at full opacity', () => {
    const own = visual(task('b', { progressColor: '#00FFFF' }));
    expect(own.paint.progress).toBe('#00FFFF');
    expect(own.progress?.opacity).toBe(1);
    const opt = visual(task('c'), { bar: { progress: { color: '#FF00FF' } } });
    expect(opt.paint.progress).toBe('#FF00FF');
    expect(opt.progress?.opacity).toBe(1);
  });
});
