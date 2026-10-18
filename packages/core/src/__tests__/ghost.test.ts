// ─────────────────────────────────────────────────────────────
//  Tests — drag ghost: `computeDragGhostVisual` draws what ngx-gantry's
//  `GanttDragPreviewComponent` draws today (rect, dash, opacity, delta
//  label), for move and resize previews from a real `DragSession`.
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
 * ngx-gantry's drag preview, transcribed from `gantt-drag-preview.component.ts` and the inputs
 * `gantt-canvas.component.ts` binds: barHeight = the dragged bar's visual height, radius =
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
  const deltaLabel = p.delta === 0 ? '' : `${p.delta > 0 ? '+' : ''}${p.delta}${p.unit === 'hour' ? 'h' : 'd'}`;
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
    text: { x: p.x + p.width / 2, y: p.y, fill: theme.textPrimary, fontPx: 11, text: deltaLabel },
  };
}

/** The ghost in the same shape, paints resolved against `theme`. */
function corePreview(p: DragPreview, c: Chart, theme: Required<GanttTheme>) {
  const g = computeDragGhostVisual(p, c.geo(p.taskId), c.cfg, c.tl.toX, i18n, FONT_PX);
  const label = g.label;
  if (!label) throw new Error('a non-zero move has a label');
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
    text: { x: label.x, y: label.y, fill: resolvePaint(label.paint, theme), fontPx: label.fontPx, text: label.text },
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
      label: { text: '+3d', x: 576, y: 0, paint: 'var(--gantt-text)', fontPx: 11 },
    });
  });

  it('hides the label while the snapped movement is zero (Angular draws an empty text)', () => {
    const c = chart({ viewMode: 'Day' });
    const p = drag(c, 'a', 'bar', 0);
    expect(p.delta).toBe(0);
    const g = computeDragGhostVisual(p, c.geo('a'), c.cfg, c.tl.toX, i18n, FONT_PX);
    expect(g.label).toBeNull();
    expect(angularPreview(p, c, resolveTheme(false)).text.text).toBe('');
  });

  it('uses theme paints: the ghost token for the body, the primary text token for the label', () => {
    const c = chart({ viewMode: 'Day' });
    const g = computeDragGhostVisual(drag(c, 'b', 'bar', 2), c.geo('b'), c.cfg, c.tl.toX, i18n, FONT_PX);
    expect(g.paint).toBe(PAINTS.ghost);
    expect(g.paint).toBe('var(--gantt-bar)');
    expect(g.label).toEqual({
      text: '+2d',
      x: g.x + g.width / 2,
      y: c.geo('b').y,
      paint: 'var(--gantt-text)',
      fontPx: 11,
    });
    // An explicit bar colour does not reach the ghost (Angular paints it with the theme bar colour)
    expect(g.paint).not.toContain('#FDE68A');
  });

  it('labels hours with an h and negative moves with a minus sign', () => {
    const c = chart({ viewMode: 'Hour' });
    const labelOf = (units: number) =>
      computeDragGhostVisual(drag(c, 'b', 'bar', units), c.geo('b'), c.cfg, c.tl.toX, i18n, FONT_PX).label?.text;
    expect(labelOf(3)).toBe('+3h');
    expect(labelOf(-4)).toBe('-4h');
  });

  it('takes the movement label from labels.dragDelta (translatable)', () => {
    const c = chart();
    const it: GanttI18n = {
      ...i18n,
      labels: {
        ...DEFAULT_LABELS,
        dragDelta: (n, unit) => `${n > 0 ? '+' : ''}${n} ${unit === 'hour' ? 'ore' : 'gg'}`,
      },
    };
    const g = computeDragGhostVisual(drag(c, 'b', 'bar', 2), c.geo('b'), c.cfg, c.tl.toX, it, FONT_PX);
    expect(g.label?.text).toBe('+2 gg');
  });
});
