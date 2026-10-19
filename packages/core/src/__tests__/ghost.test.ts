// ─────────────────────────────────────────────────────────────
//  Tests — drag ghost: `computeDragGhostVisual` draws what @gantryjs/angular's
//  `GanttDragPreviewComponent` drew (rect, dash, opacity), for move and
//  resize previews from a real `DragSession`. Since 2.0 (phase 10) it has
//  no movement label: the drag readout chip shows the movement, and it
//  takes the height and radius of the row's resolved style, as its bar.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FORMATS,
  DEFAULT_LABELS,
  type GanttI18n,
  type GanttOptions,
  type GanttTask,
  type GanttTheme,
  type RowGeometry,
} from '../types';
import { resolveConfig, type ResolvedGanttConfig } from '../render/config';
import { resolveTheme, themeMetrics } from '../render/theme';
import { buildTimeline, computeRowGeometries, taskSpan, type TimelineModel } from '../render/timeline';
import { computeBarVisual } from '../render/bars';
import { DragSession, type DragHandle, type DragPreview } from '../render/drag';
import { PAINTS, resolvePaint } from '../render/paint';
import { computeDragGhostVisual } from '../render/ghost';
import { createStyleResolver } from '../render/styles';
import { flattenTree, filterVisible, reindexVisible } from '../gantt-data';

const i18n: GanttI18n = { labels: DEFAULT_LABELS, formats: DEFAULT_FORMATS };
const FONT_PX = 12;

const day = (m: number, d: number, h = 0) => new Date(2026, m, d, h);
const tasks: GanttTask[] = [
  { id: 'a', name: 'Design', start: day(2, 10), end: day(2, 14), progress: 40 },
  { id: 'm', name: 'Review', start: day(2, 16), end: day(2, 16), type: 'milestone' },
  { id: 'b', name: 'Build', start: day(2, 12, 9), end: day(2, 13, 15), barColor: '#FDE68A' },
];

interface Chart {
  cfg: ResolvedGanttConfig;
  tl: TimelineModel;
  geo: (id: string) => RowGeometry;
}

function chart(options: GanttOptions = {}, theme: Required<GanttTheme> = resolveTheme(false)): Chart {
  const cfg = resolveConfig(options, i18n, themeMetrics(theme));
  const tl = buildTimeline({ tasks, config: cfg, now: day(2, 11, 10) });
  const rows = reindexVisible(filterVisible(flattenTree(tasks, new Set())));
  const geos = computeRowGeometries(rows, tl, cfg);
  return {
    cfg,
    tl,
    geo: id => {
      const g = geos.find(x => x.row.task.id === id);
      if (!g) throw new Error(`no row ${id}`);
      return g;
    },
  };
}

/** The preview a pointer drag of `units` snap units produces (same timing as the painters). */
function drag(c: Chart, id: string, handle: DragHandle, units: number): DragPreview {
  const geo = c.geo(id);
  const task = geo.row.task;
  const snap = c.cfg.scales.at(-1)?.unit === 'hour' ? 'hour' : 'day';
  const session = new DragSession(
    id,
    handle,
    task.start,
    task.end ?? task.start,
    100,
    { y: geo.y, height: geo.height },
    {
      pxPerDay: c.cfg.pxPerDay,
      toX: c.tl.toX,
      span: (start, end) => taskSpan({ start, end }, c.cfg),
      snap,
    },
  );
  const pxPerUnit = snap === 'hour' ? c.cfg.pxPerDay / 24 : c.cfg.pxPerDay;
  return session.preview(100 + units * pxPerUnit + 0.3 * Math.sign(units) * pxPerUnit);
}

/**
 * @gantryjs/angular's drag preview rect, transcribed from `gantt-drag-preview.component.ts` and the
 * inputs `gantt-canvas.component.ts` binds: barHeight = the dragged bar's visual height, radius =
 * `config().bar.radius`, colours from the theme.
 */
function angularPreview(p: DragPreview, c: Chart, theme: Required<GanttTheme>) {
  const barHeight: number | null = computeBarVisual({
    geo: c.geo(p.taskId),
    cfg: c.cfg,
    toX: c.tl.toX,
    isCritical: true,
    resizable: true,
    fontPx: FONT_PX,
  }).height;
  const ghostHeight = barHeight ?? p.height * 0.6;
  return {
    rect: {
      x: p.x,
      y: p.y + (p.height - ghostHeight) / 2,
      width: p.width,
      height: ghostHeight,
      rx: c.cfg.bar.radius,
      fill: theme.barColor,
      stroke: theme.barColor,
      opacity: 0.35,
      dash: '4 2',
      strokeWidth: 1.5,
    },
    label: null,
  };
}

/** The ghost in the same shape, paints resolved against `theme`. */
function corePreview(p: DragPreview, c: Chart, theme: Required<GanttTheme>) {
  const g = computeDragGhostVisual(p, c.geo(p.taskId), c.cfg, c.tl.toX, i18n, FONT_PX);
  return {
    rect: {
      x: g.x,
      y: g.y,
      width: g.width,
      height: g.height,
      rx: g.rx,
      fill: resolvePaint(g.paint, theme),
      stroke: resolvePaint(g.paint, theme),
      opacity: g.opacity,
      dash: g.dash,
      strokeWidth: g.strokeWidth,
    },
    label: g.label,
  };
}

describe('computeDragGhostVisual — the Angular drag preview', () => {
  const fixtures: [name: string, options: GanttOptions, id: string, handle: DragHandle, units: number][] = [
    ['move +3 days', { viewMode: 'Day' }, 'a', 'bar', 3],
    ['move -2 days', { viewMode: 'Day' }, 'a', 'bar', -2],
    ['resize right +4 days', { viewMode: 'Day' }, 'a', 'right', 4],
    ['resize right -2 days', { viewMode: 'Day' }, 'a', 'right', -2],
    ['resize left +1 day', { viewMode: 'Day' }, 'a', 'left', 1],
    ['resize left -3 days', { viewMode: 'Day' }, 'a', 'left', -3],
    ['move a milestone', { viewMode: 'Day' }, 'm', 'bar', 2],
    ['move an explicit-colour bar (Week)', { viewMode: 'Week' }, 'b', 'bar', 5],
    ['move by hours', { viewMode: 'Hour' }, 'b', 'bar', 5],
    ['resize by hours', { viewMode: 'Hour' }, 'b', 'right', -2],
    ['custom bar height, radius, row height', { bar: { height: 10, radius: 7 }, rowHeight: 50 }, 'a', 'bar', 1],
    ['percentage bar height', { bar: { height: '80%' }, rowHeight: 30 }, 'a', 'left', -1],
  ];

  it.each(fixtures)('%s', (_name, options, id, handle, units) => {
    for (const theme of [resolveTheme(false), resolveTheme(true)]) {
      const c = chart(options, theme);
      const p = drag(c, id, handle, units);
      expect(p.delta).toBe(units);
      expect(corePreview(p, c, theme)).toEqual(angularPreview(p, c, theme));
    }
  });

  it('move +3 days in Day view: the numbers', () => {
    // 48 px/day, 36 px rows, bar height 60 % of the row, timeline from Mar 3 (7 days of padding)
    const c = chart({ viewMode: 'Day' });
    const g = computeDragGhostVisual(drag(c, 'a', 'bar', 3), c.geo('a'), c.cfg, c.tl.toX, i18n, FONT_PX);
    expect(g).toEqual({
      x: 480,
      y: (36 - 21.6) / 2,
      width: 192,
      height: 21.6,
      rx: 4,
      paint: 'var(--gantt-bar)',
      opacity: 0.35,
      dash: '4 2',
      strokeWidth: 1.5,
      label: null,
    });
  });

  it('never draws a movement label: the drag readout chip shows the movement', () => {
    for (const viewMode of ['Day', 'Hour'] as const) {
      const c = chart({ viewMode });
      for (const [id, handle, units] of [
        ['a', 'bar', 0],
        ['a', 'bar', 3],
        ['b', 'bar', -4],
        ['b', 'right', 2],
        ['m', 'bar', 1],
      ] as const) {
        const p = drag(c, id, handle, units);
        expect(p.delta).toBe(units);
        expect(computeDragGhostVisual(p, c.geo(id), c.cfg, c.tl.toX, i18n, FONT_PX).label).toBeNull();
      }
    }
  });

  it('uses the ghost theme token for the body, not an explicit bar colour', () => {
    const c = chart({ viewMode: 'Day' });
    const g = computeDragGhostVisual(drag(c, 'b', 'bar', 2), c.geo('b'), c.cfg, c.tl.toX, i18n, FONT_PX);
    expect(g.paint).toBe(PAINTS.ghost);
    expect(g.paint).toBe('var(--gantt-bar)');
    // An explicit bar colour does not reach the ghost (Angular paints it with the theme bar colour)
    expect(g.paint).not.toContain('#FDE68A');
  });

  it('no longer reads labels.dragDelta (the i18n argument stays for callers)', () => {
    const c = chart();
    let calls = 0;
    const it: GanttI18n = {
      ...i18n,
      labels: {
        ...DEFAULT_LABELS,
        dragDelta: (n, unit) => {
          calls++;
          return `${n > 0 ? '+' : ''}${n} ${unit === 'hour' ? 'ore' : 'gg'}`;
        },
      },
    };
    const p = drag(c, 'b', 'bar', 2);
    const g = computeDragGhostVisual(p, c.geo('b'), c.cfg, c.tl.toX, it, FONT_PX);
    expect(g.label).toBeNull();
    expect(calls).toBe(0);
    expect(g).toEqual(computeDragGhostVisual(p, c.geo('b'), c.cfg, c.tl.toX, i18n, FONT_PX));
  });
});

describe('computeDragGhostVisual — the row style (phase 10)', () => {
  /** The ghost and the bar of `id` with the chart's resolved row styles. */
  function styled(options: GanttOptions, id: string) {
    const c = chart({ viewMode: 'Day', ...options });
    const geo = c.geo(id);
    const style = createStyleResolver({ config: c.cfg, now: day(2, 11) })(geo.row);
    const bar = computeBarVisual({ geo, cfg: c.cfg, toX: c.tl.toX, fontPx: FONT_PX, style });
    const p = drag(c, id, 'bar', 2);
    return { c, p, style, bar, ghost: computeDragGhostVisual(p, geo, c.cfg, c.tl.toX, i18n, FONT_PX, style) };
  }

  it('is as tall as the bar styled by styles.levels, centred in the row, with its radius', () => {
    const { p, bar, ghost } = styled({ styles: { levels: [{ height: '70%', radius: 9 }] } }, 'a');
    expect(bar.height).toBeCloseTo(36 * 0.7);
    expect(ghost.height).toBe(bar.height);
    expect(ghost.rx).toBe(9);
    expect(ghost.rx).toBe(bar.rx);
    expect(ghost.y).toBe(p.y + (p.height - bar.height) / 2);
    expect(ghost.y).toBe(bar.y);
  });

  it('follows task.style and a kind style the same way; the radius falls back to bar.radius', () => {
    const own = styled({ bar: { radius: 3 } }, 'b');
    expect([own.ghost.height, own.ghost.rx]).toEqual([own.bar.height, 3]);
    const kind = styled({ styles: { task: { height: 12 } } }, 'a');
    expect([kind.ghost.height, kind.ghost.rx]).toEqual([12, kind.c.cfg.bar.radius]);
  });

  it('without a style, the task’s own (the flat fields and task.style), as before', () => {
    const c = chart({ viewMode: 'Day', styles: { levels: [{ height: '70%' }] } });
    const p = drag(c, 'a', 'bar', 1);
    const plain = computeDragGhostVisual(p, c.geo('a'), c.cfg, c.tl.toX, i18n, FONT_PX);
    // The level style is the resolver's: not applied without it (the default bar height, 60 %)
    expect(plain.height).toBeCloseTo(36 * 0.6);
    expect(plain).toEqual(computeDragGhostVisual(p, c.geo('a'), c.cfg, c.tl.toX, i18n, FONT_PX, undefined));
  });

  it('a summary group ghost takes the summary bar corners', () => {
    const groups: GanttTask[] = [
      { id: 'g', name: 'Group', start: day(2, 10), end: day(2, 20), type: 'group' },
      { id: 'k', name: 'Kid', start: day(2, 10), end: day(2, 12), parentId: 'g' },
    ];
    const cfg = resolveConfig({ viewMode: 'Day', bar: { radius: 8 } }, i18n);
    const tl = buildTimeline({ tasks: groups, config: cfg, now: day(2, 11) });
    const geo = computeRowGeometries(reindexVisible(filterVisible(flattenTree(groups, new Set()))), tl, cfg)[0];
    const p: DragPreview = { ...drag(chart({ viewMode: 'Day' }), 'a', 'bar', 0), taskId: 'g', y: geo.y };
    const bar = computeBarVisual({ geo, cfg, toX: tl.toX, fontPx: FONT_PX });
    const ghost = computeDragGhostVisual(p, geo, cfg, tl.toX, i18n, FONT_PX);
    expect(ghost.rx).toBe(bar.rx);
    expect(ghost.rx).toBe(2);
  });
});
