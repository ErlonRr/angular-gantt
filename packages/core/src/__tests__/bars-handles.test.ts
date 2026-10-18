// Bar handles, focus ring, hit box and hit-testing (D14, D15).
import { describe, it, expect } from 'vitest';
import {
  FOCUS_RING_OFFSET,
  HANDLE_MIN_BAR_WIDTH,
  MILESTONE_HIT_PAD,
  buildTimeline,
  computeBarVisual,
  computeRowGeometries,
  filterVisible,
  flattenTree,
  hitTestBar,
  reindexVisible,
  resolveConfig,
  ViewMode,
  type BarVisual,
  type GanttOptions,
  type GanttTask,
  type Rect,
  type RowGeometry,
} from '../index';

const t = (id: string, s: Date, e: Date, extra: Partial<GanttTask> = {}): GanttTask => ({
  id,
  name: `Task ${id}`,
  start: s,
  end: e,
  ...extra,
});

const TASKS: GanttTask[] = [
  t('a', new Date(2026, 0, 5), new Date(2026, 0, 20)),
  t('g', new Date(2026, 0, 5), new Date(2026, 0, 25), { type: 'group' as never }),
  t('c', new Date(2026, 0, 6), new Date(2026, 0, 9), { parentId: 'g' }),
  t('m', new Date(2026, 0, 26), new Date(2026, 0, 26), { type: 'milestone' as never }),
];

/** Visuals of every row (resizable unless told otherwise), by task id. */
function visuals(options: GanttOptions = {}, resizable = true) {
  const cfg = resolveConfig({ viewMode: ViewMode.Day, showToday: false, ...options });
  const rows = reindexVisible(filterVisible(flattenTree(TASKS, new Set())));
  const tl = buildTimeline({ tasks: TASKS, config: cfg });
  const geos = computeRowGeometries(rows, tl, cfg);
  const at = (id: string) => geos.find(g => g.row.task.id === id)!;
  const of = (geo: RowGeometry) => computeBarVisual({ geo, cfg, toX: tl.toX, resizable });
  return { cfg, at, of, v: (id: string) => of(at(id)) };
}

/** The same geometry with another bar width (the timeline doesn't matter for the box). */
const withWidth = (geo: RowGeometry, barWidth: number): RowGeometry => ({ ...geo, barWidth });

const right = (r: Rect) => r.x + r.width;
const bottom = (r: Rect) => r.y + r.height;
const insideRow = (r: Rect, geo: RowGeometry) => r.y >= geo.y && bottom(r) <= geo.y + geo.height;
const disjoint = (a: Rect, b: Rect) => right(a) < b.x || right(b) < a.x || bottom(a) < b.y || bottom(b) < a.y;

describe('BarVisual.handles', () => {
  it('exist only for resizable task bars at least HANDLE_MIN_BAR_WIDTH wide', () => {
    const s = visuals();
    expect(s.v('a').handles).not.toBeNull();
    expect(s.v('g').handles).toBeNull();
    expect(s.v('m').handles).toBeNull();
    expect(visuals({}, false).v('a').handles).toBeNull();
    expect(HANDLE_MIN_BAR_WIDTH).toBe(12);
    expect(s.of(withWidth(s.at('a'), 12)).handles).not.toBeNull();
    expect(s.of(withWidth(s.at('a'), 11.5)).handles).toBeNull();
  });

  it('are hitSize (default 24) wide, centred on the edges of a wide bar, and at least hitSize tall', () => {
    const s = visuals();
    const v = s.v('a');
    expect(s.cfg.bar.handles.hitSize).toBe(24);
    const { left, right: r } = v.handles!;
    expect(left.hit.width).toBe(24);
    expect(r.hit.width).toBe(24);
    expect(left.hit.x).toBe(v.x - 12);
    expect(r.hit.x).toBe(v.x + v.width - 12);
    expect(left.hit.height).toBeGreaterThanOrEqual(24);
    expect(r.hit.height).toBe(left.hit.height);
    // Centred on the bar vertically
    expect(left.hit.y + left.hit.height / 2).toBeCloseTo(v.cy);
  });

  it('honour bar.handles.hitSize', () => {
    const s = visuals({ bar: { handles: { hitSize: 32 } } });
    const v = s.v('a');
    expect(v.handles!.left.hit.width).toBe(32);
    expect(v.handles!.left.hit.x).toBe(v.x - 16);
    expect(v.handles!.left.hit.height).toBe(32);
  });

  it('reach at most a third of the bar inward and keep their width by growing outward', () => {
    const s = visuals();
    for (const w of [12, 18, 24, 30, 36, 48, 72]) {
      const v = s.of(withWidth(s.at('a'), w));
      const { left, right: r } = v.handles!;
      const inward = Math.min(12, w / 3);
      expect(right(left.hit) - v.x).toBeCloseTo(inward);
      expect(v.x + v.width - r.hit.x).toBeCloseTo(inward);
      expect(left.hit.width).toBe(24);
      expect(r.hit.width).toBe(24);
      expect(disjoint(left.hit, r.hit)).toBe(true);
      // The middle third (at least) of the bar moves it
      expect(hitTestBar(v, v.x + v.width / 2, v.cy)).toBe('bar');
    }
  });

  it('stay inside the row: hit areas are capped at the row height', () => {
    for (const rowHeight of [16, 20, 24, 36, 60]) {
      const s = visuals({ rowHeight, bar: { handles: { hitSize: 40 } } });
      const geo = s.at('a');
      const v = s.of(geo);
      for (const h of [v.handles!.left, v.handles!.right]) {
        expect(insideRow(h.hit, geo)).toBe(true);
        expect(h.hit.height).toBe(Math.min(rowHeight, 40));
        expect(insideRow(h.grip, geo)).toBe(true);
      }
    }
  });

  it('are at least as tall as the bar when the bar is taller than hitSize', () => {
    const s = visuals({ rowHeight: 60, bar: { height: 50, handles: { hitSize: 24 } } });
    const v = s.v('a');
    expect(v.height).toBe(50);
    expect(v.handles!.left.hit.height).toBe(50);
    expect(v.handles!.left.hit.y).toBe(v.y);
  });

  it('draw grips as pills centred on the edges, inside the bar height', () => {
    const v = visuals().v('a');
    const { left, right: r } = v.handles!;
    expect(left.grip.x + left.grip.width / 2).toBe(v.x);
    expect(r.grip.x + r.grip.width / 2).toBe(v.x + v.width);
    expect(left.grip.rx).toBe(left.grip.width / 2);
    expect(left.grip.y + left.grip.height / 2).toBeCloseTo(v.cy);
    expect(left.grip.height).toBeLessThanOrEqual(v.height);
    expect(left.grip.height).toBeGreaterThanOrEqual(8);
  });

  it('handle a hitSize of 0 as no resize target', () => {
    const v = visuals({ bar: { handles: { hitSize: 0 } } }).v('a');
    expect(v.handles!.left.hit.width).toBe(0);
    expect(hitTestBar(v, v.x, v.cy)).toBe('bar');
  });
});

describe('BarVisual.focusRect', () => {
  it('is the bar box inflated by FOCUS_RING_OFFSET with a matching radius', () => {
    const v = visuals({ bar: { radius: 5 } }).v('a');
    const o = FOCUS_RING_OFFSET;
    expect(o).toBe(3);
    expect(v.focusRect).toEqual({
      x: v.x - o,
      y: v.y - o,
      width: v.width + 2 * o,
      height: v.height + 2 * o,
      rx: 5 + o,
    });
  });

  it("is the milestone shape's box inflated (round for circles)", () => {
    const o = FOCUS_RING_OFFSET;
    const d = visuals().v('m');
    expect(d.focusRect).toMatchObject({ x: d.x - o, y: d.y - o, width: d.width + 2 * o, height: d.height + 2 * o });
    const c = visuals({ milestone: { shape: 'circle' } }).v('m');
    expect(c.focusRect.rx).toBe(c.width / 2 + o);
  });

  it('encloses the end caps of summary bars', () => {
    const v = visuals({ groupBar: { style: 'summary' } }).v('g');
    expect(v.caps).not.toBeNull();
    const cap = Math.min(v.height, 7);
    expect(bottom(v.focusRect)).toBeCloseTo(v.y + v.height + cap + FOCUS_RING_OFFSET);
  });
});

describe('BarVisual.hitBox', () => {
  it('is the bar box for task bars', () => {
    const v = visuals().v('a');
    expect(v.hitBox).toEqual({ x: v.x, y: v.y, width: v.width, height: v.height });
  });

  it('pads milestones by MILESTONE_HIT_PAD on every side', () => {
    const v = visuals().v('m');
    const p = MILESTONE_HIT_PAD;
    expect(v.hitBox).toEqual({ x: v.x - p, y: v.y - p, width: v.width + 2 * p, height: v.height + 2 * p });
  });

  it('reaches the tips of summary-bar caps (7 px) and stays inside the row', () => {
    const s = visuals({ groupBar: { style: 'summary' } });
    const v = s.v('g');
    expect(v.hitBox.y).toBe(v.y);
    expect(bottom(v.hitBox)).toBeCloseTo(v.y + v.height + 7);
    const tall = visuals({ groupBar: { style: 'summary', height: '100%' } });
    const geo = tall.at('g');
    expect(insideRow(tall.of(geo).hitBox, geo)).toBe(true);
  });

  it('has no caps for bar-style group bars', () => {
    const v = visuals({ groupBar: { style: 'bar' } }).v('g');
    expect(v.hitBox).toEqual({ x: v.x, y: v.y, width: v.width, height: v.height });
  });
});

describe('hitTestBar', () => {
  const v = visuals().v('a');
  const { left, right: r } = v.handles!;

  it('hits the handles first, then the body', () => {
    expect(hitTestBar(v, v.x + 2, v.cy)).toBe('left');
    expect(hitTestBar(v, v.x - 10, v.cy)).toBe('left');
    expect(hitTestBar(v, v.x + v.width - 2, v.cy)).toBe('right');
    expect(hitTestBar(v, v.x + v.width + 10, v.cy)).toBe('right');
    expect(hitTestBar(v, v.x + v.width / 2, v.cy)).toBe('bar');
    // Just past the inner border of a handle
    expect(hitTestBar(v, right(left.hit) + 0.5, v.cy)).toBe('bar');
    expect(hitTestBar(v, r.hit.x - 0.5, v.cy)).toBe('bar');
  });

  it('returns null outside the handles and the body', () => {
    expect(hitTestBar(v, left.hit.x - 1, v.cy)).toBeNull();
    expect(hitTestBar(v, right(r.hit) + 1, v.cy)).toBeNull();
    expect(hitTestBar(v, v.x + v.width / 2, v.y - 1)).toBeNull();
    expect(hitTestBar(v, v.x + v.width / 2, bottom(v) + 1)).toBeNull();
    expect(hitTestBar(v, left.hit.x + 1, left.hit.y - 1)).toBeNull();
  });

  it('hits the handle zones above and below the bar body (up to hitSize tall)', () => {
    expect(left.hit.y).toBeLessThan(v.y);
    expect(hitTestBar(v, v.x + 1, left.hit.y + 0.5)).toBe('left');
    expect(hitTestBar(v, v.x + v.width / 2, left.hit.y + 0.5)).toBeNull();
  });

  it('never resizes a bar without handles', () => {
    const fixed = visuals({}, false).v('a');
    expect(hitTestBar(fixed, fixed.x + 1, fixed.cy)).toBe('bar');
    expect(hitTestBar(fixed, fixed.x - 5, fixed.cy)).toBeNull();
  });

  it('hits milestones inside their padded box', () => {
    const m = visuals().v('m');
    expect(hitTestBar(m, m.x - 2, m.cy)).toBe('bar');
    expect(hitTestBar(m, m.x - MILESTONE_HIT_PAD - 1, m.cy)).toBeNull();
  });

  it('works on any object with handles and a hit box (custom bars)', () => {
    const custom: Pick<BarVisual, 'handles' | 'hitBox'> = {
      handles: null,
      hitBox: { x: 0, y: 0, width: 10, height: 10 },
    };
    expect(hitTestBar(custom, 5, 5)).toBe('bar');
    expect(hitTestBar(custom, 11, 5)).toBeNull();
    expect(hitTestBar({ handles: null, hitBox: { x: 0, y: 0, width: 0, height: 10 } }, 0, 5)).toBeNull();
  });
});
