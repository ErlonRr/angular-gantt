// Phase 11 bar targets (D11): the progress grip and the link connectors next to the resize
// handles — every target at least 24 px both ways, disjoint from the others, inside its row, the
// visible shape inside its own target, and hit in the order resize > progress > connectors > body.
import { describe, it, expect } from 'vitest';
import {
  CONNECTOR_DOT,
  CONNECTOR_GAP,
  CONNECTOR_HIT,
  PROGRESS_GRIP_HIT,
  buildTimeline,
  computeBarVisual,
  computeRowGeometries,
  filterVisible,
  flattenTree,
  hitTestBar,
  reindexVisible,
  resolveConfig,
  ViewMode,
  type BarHit,
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
  t('a', new Date(2026, 0, 5), new Date(2026, 0, 20), { progress: 40 }),
  t('g', new Date(2026, 0, 5), new Date(2026, 0, 25), { type: 'group' as never, progress: 30 }),
  t('c', new Date(2026, 0, 6), new Date(2026, 0, 9), { parentId: 'g' }),
  t('m', new Date(2026, 0, 26), new Date(2026, 0, 26), { type: 'milestone' as never }),
];

interface Flags {
  resizable?: boolean;
  progressEditable?: boolean;
  linkable?: boolean;
  progress?: number;
}

function chart(options: GanttOptions = {}) {
  const cfg = resolveConfig({ viewMode: ViewMode.Day, showToday: false, ...options });
  const rows = reindexVisible(filterVisible(flattenTree(TASKS, new Set())));
  const tl = buildTimeline({ tasks: TASKS, config: cfg });
  const geos = computeRowGeometries(rows, tl, cfg);
  const at = (id: string) => geos.find(g => g.row.task.id === id)!;
  const of = (geo: RowGeometry, flags: Flags = {}): BarVisual =>
    computeBarVisual({
      geo,
      cfg,
      toX: tl.toX,
      resizable: flags.resizable ?? true,
      progressEditable: flags.progressEditable ?? true,
      linkable: flags.linkable ?? true,
      progress: flags.progress,
    });
  return { cfg, at, of };
}

const withWidth = (geo: RowGeometry, barWidth: number): RowGeometry => ({ ...geo, barWidth });
const right = (r: Rect) => r.x + r.width;
const bottom = (r: Rect) => r.y + r.height;
/** Interiors don't meet (shared edges are fine: the hit order settles them) */
const disjoint = (a: Rect, b: Rect) => right(a) <= b.x || right(b) <= a.x || bottom(a) <= b.y || bottom(b) <= a.y;
const inside = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x - 1e-9 &&
  inner.y >= outer.y - 1e-9 &&
  right(inner) <= right(outer) + 1e-9 &&
  bottom(inner) <= bottom(outer) + 1e-9;
const centre = (r: Rect): [number, number] => [r.x + r.width / 2, r.y + r.height / 2];

/** Every pointer target of a bar but its body, with the part it hits and the shape it shows. */
function targets(v: BarVisual): { part: BarHit; hit: Rect; shape: Rect }[] {
  const out: { part: BarHit; hit: Rect; shape: Rect }[] = [];
  if (v.handles) {
    out.push({ part: 'left', hit: v.handles.left.hit, shape: v.handles.left.grip });
    out.push({ part: 'right', hit: v.handles.right.hit, shape: v.handles.right.grip });
  }
  if (v.progressGrip) out.push({ part: 'progress', hit: v.progressGrip.hit, shape: v.progressGrip.grip });
  if (v.connectors) {
    out.push({ part: 'link-start', hit: v.connectors.start.hit, shape: v.connectors.start.dot });
    out.push({ part: 'link-end', hit: v.connectors.end.hit, shape: v.connectors.end.dot });
  }
  return out;
}

const WIDTHS = [4, 6, 8, 11, 12, 13, 16, 20, 24, 30, 36, 40, 47, 48, 50, 60, 71, 72, 73, 80, 96, 120, 200, 300, 400];
const ROW_HEIGHTS = [28, 36, 44];
const PROGRESS = [0, 1, 5, 10, 25, 50, 75, 90, 99, 100];

describe('bar targets with editing (D11): sizes, disjointness, rows', () => {
  for (const rowHeight of ROW_HEIGHTS) {
    it(`every target ≥ 24 px, disjoint, inside the row, its shape inside it (row ${rowHeight} px)`, () => {
      for (const groupStyle of ['bar', 'summary'] as const) {
        const c = chart({ rowHeight, groupBar: { style: groupStyle } });
        for (const id of ['a', 'g', 'm']) {
          for (const width of WIDTHS) {
            const geo = id === 'm' ? c.at(id) : withWidth(c.at(id), width);
            for (const progress of PROGRESS) {
              for (const resizable of [true, false]) {
                const v = c.of(geo, { progress, resizable });
                const all = targets(v);
                expect(v.connectors).not.toBeNull();
                for (const tg of all) {
                  expect(tg.hit.width).toBeGreaterThanOrEqual(24);
                  expect(tg.hit.height).toBeGreaterThanOrEqual(24);
                  // Clipped to the row
                  expect(tg.hit.y).toBeGreaterThanOrEqual(geo.y);
                  expect(bottom(tg.hit)).toBeLessThanOrEqual(geo.y + rowHeight);
                  // What you see is what you hit
                  expect(inside(tg.shape, tg.hit), `${tg.part} shape in its target`).toBe(true);
                  const [sx, sy] = centre(tg.shape);
                  expect(hitTestBar(v, sx, sy)).toBe(tg.part);
                  const [hx, hy] = centre(tg.hit);
                  expect(hitTestBar(v, hx, hy)).toBe(tg.part);
                }
                for (let i = 0; i < all.length; i++)
                  for (let j = i + 1; j < all.length; j++)
                    expect(disjoint(all[i].hit, all[j].hit), `${all[i].part} / ${all[j].part}`).toBe(true);
                // The connectors also stay off the body
                expect(disjoint(v.connectors!.start.hit, v.hitBox)).toBe(true);
                expect(disjoint(v.connectors!.end.hit, v.hitBox)).toBe(true);
              }
            }
          }
        }
      }
    });
  }

  it('the targets keep their size and order for a custom resize hitSize', () => {
    for (const hitSize of [24, 32, 40]) {
      const c = chart({ bar: { handles: { hitSize } } });
      for (const width of WIDTHS) {
        const v = c.of(withWidth(c.at('a'), width), { progress: 50 });
        const all = targets(v);
        for (let i = 0; i < all.length; i++)
          for (let j = i + 1; j < all.length; j++) expect(disjoint(all[i].hit, all[j].hit)).toBe(true);
      }
    }
  });
});

describe('BarVisual.progressGrip', () => {
  const c = chart();

  it('needs `progressEditable`, a drawn progress and a bar (never a milestone)', () => {
    expect(c.of(c.at('a')).progressGrip).not.toBeNull();
    expect(c.of(c.at('a'), { progressEditable: false }).progressGrip).toBeNull();
    expect(c.of(c.at('g')).progressGrip).not.toBeNull();
    expect(c.of(c.at('m')).progressGrip).toBeNull();
    const hidden = chart({ bar: { progress: { show: false } } });
    expect(hidden.of(hidden.at('a')).progressGrip).toBeNull();
    const groupOff = chart({ groupBar: { showProgress: false } });
    expect(groupOff.of(groupOff.at('g')).progressGrip).toBeNull();
    expect(groupOff.of(groupOff.at('a')).progressGrip).not.toBeNull();
  });

  it('is omitted without room: twice PROGRESS_GRIP_HIT between the handles (the bar without them)', () => {
    expect(PROGRESS_GRIP_HIT).toBe(24);
    for (const width of WIDTHS) {
      const geo = withWidth(c.at('a'), width);
      const v = c.of(geo);
      const h = v.handles;
      const room = h ? h.right.hit.x - right(h.left.hit) : v.width;
      expect(v.progressGrip !== null, `width ${width}`).toBe(room >= 48);
      const fixed = c.of(geo, { resizable: false });
      expect(fixed.progressGrip !== null, `width ${width}, no handles`).toBe(width >= 48);
    }
    // With handles: a 72 px bar is the narrowest with room (24 + 24 + 12 inward each side)
    expect(c.of(withWidth(c.at('a'), 71)).progressGrip).toBeNull();
    expect(c.of(withWidth(c.at('a'), 72)).progressGrip).not.toBeNull();
  });

  it('leaves at least PROGRESS_GRIP_HIT of the body to move the bar by', () => {
    for (const width of WIDTHS) {
      for (const progress of PROGRESS) {
        const v = c.of(withWidth(c.at('a'), width), { progress });
        if (!v.progressGrip) continue;
        let body = 0;
        for (let x = v.x; x < v.x + v.width; x += 0.5) if (hitTestBar(v, x + 0.25, v.cy) === 'bar') body += 0.5;
        expect(body).toBeGreaterThanOrEqual(24 - 1);
      }
    }
  });

  it('is centred on the progress edge, kept between the handles at the ends', () => {
    const geo = withWidth(c.at('a'), 200);
    const mid = c.of(geo, { progress: 50 });
    const g = mid.progressGrip!;
    expect(g.x).toBe(mid.x + 100);
    expect(g.hit.x + g.hit.width / 2).toBe(g.x);
    expect(g.grip.x + g.grip.width / 2).toBe(g.x);
    expect(g.hit.width).toBe(24);
    expect(g.grip.rx).toBe(g.grip.height / 2);
    // A pill on the bar's bottom edge; the target centred on the row, tall enough for it
    for (const rowHeight of ROW_HEIGHTS) {
      const r = chart({ rowHeight });
      const geoR = r.at('a');
      const vr = r.of(withWidth(geoR, 200), { progress: 50 });
      const pg = vr.progressGrip!;
      expect(pg.grip.y + pg.grip.height / 2).toBeCloseTo(vr.y + vr.height);
      expect(pg.hit.y + pg.hit.height / 2).toBeCloseTo(geoR.y + rowHeight / 2);
      expect(pg.hit.height).toBeGreaterThanOrEqual(24);
    }
    // A bar as tall as its row (height − 2) moves the pill up into the target
    const tall = chart({ bar: { height: '100%' } });
    const tv = tall.of(withWidth(tall.at('a'), 200), { progress: 50 });
    expect(bottom(tv.progressGrip!.grip)).toBe(bottom(tv.progressGrip!.hit));

    const zero = c.of(geo, { progress: 0 });
    expect(zero.progressGrip!.x).toBe(zero.x);
    expect(zero.progressGrip!.hit.x).toBe(right(zero.handles!.left.hit));
    expect(zero.progressGrip!.grip.x).toBe(zero.progressGrip!.hit.x);
    const full = c.of(geo, { progress: 100 });
    expect(full.progressGrip!.x).toBe(full.x + full.width);
    expect(right(full.progressGrip!.hit)).toBe(full.handles!.right.hit.x);
    expect(right(full.progressGrip!.grip)).toBe(right(full.progressGrip!.hit));
  });

  it('follows the `progress` override (a progress drag preview) and clamps it to 0–100', () => {
    const geo = withWidth(c.at('a'), 200);
    const own = c.of(geo);
    expect(own.progressGrip!.x).toBe(own.x + 80); // task progress 40
    expect(c.of(geo, { progress: 60 }).progressGrip!.x).toBe(own.x + 120);
    expect(c.of(geo, { progress: 150 }).progressGrip!.x).toBe(own.x + 200);
    expect(c.of(geo, { progress: -5 }).progressGrip!.x).toBe(own.x);
  });

  it('has no handle-free room inside a bar without handles but stays on the bar', () => {
    const v = c.of(withWidth(c.at('a'), 120), { resizable: false, progress: 0 });
    expect(v.handles).toBeNull();
    expect(v.progressGrip!.hit.x).toBe(v.x);
    const end = c.of(withWidth(c.at('a'), 120), { resizable: false, progress: 100 });
    expect(right(end.progressGrip!.hit)).toBe(end.x + end.width);
  });
});

describe('BarVisual.connectors', () => {
  const c = chart();

  it('exist for every bar kind with `linkable`, else null', () => {
    for (const id of ['a', 'g', 'm']) {
      expect(c.of(c.at(id)).connectors).not.toBeNull();
      expect(c.of(c.at(id), { linkable: false }).connectors).toBeNull();
    }
    expect([CONNECTOR_HIT, CONNECTOR_DOT, CONNECTOR_GAP]).toEqual([24, 10, 2]);
  });

  it('sit CONNECTOR_GAP outside the bar without handles, their square against the bar edge', () => {
    const v = c.of(withWidth(c.at('a'), 100), { resizable: false });
    const { start, end } = v.connectors!;
    expect(start.side).toBe('start');
    expect(end.side).toBe('end');
    expect(right(start.dot)).toBe(v.x - CONNECTOR_GAP);
    expect(end.dot.x).toBe(v.x + v.width + CONNECTOR_GAP);
    expect(right(start.hit)).toBe(v.x);
    expect(end.hit.x).toBe(v.x + v.width);
    for (const k of [start, end]) {
      expect(k.dot).toEqual({ x: k.cx - 5, y: k.cy - 5, width: 10, height: 10, rx: 5 });
      expect(k.cy).toBe(v.cy);
      expect(k.hit.width).toBe(24);
      expect(k.hit.height).toBe(24);
      expect(k.hit.y + 12).toBe(v.cy);
    }
  });

  it('move out past the resize handles', () => {
    for (const width of [12, 30, 72, 200]) {
      const v = c.of(withWidth(c.at('a'), width));
      const { left, right: r } = v.handles!;
      expect(right(v.connectors!.start.hit)).toBe(left.hit.x);
      expect(v.connectors!.end.hit.x).toBe(right(r.hit));
      expect(right(v.connectors!.start.dot)).toBe(left.hit.x - CONNECTOR_GAP);
      expect(v.connectors!.end.dot.x).toBe(right(r.hit) + CONNECTOR_GAP);
    }
  });

  it("stay off a milestone's padded hit box", () => {
    const v = c.of(c.at('m'));
    expect(v.handles).toBeNull();
    expect(right(v.connectors!.start.hit)).toBe(v.hitBox.x);
    expect(v.connectors!.end.hit.x).toBe(right(v.hitBox));
    expect(v.connectors!.start.cy).toBe(v.cy);
  });

  it('are clipped to a row lower than CONNECTOR_HIT', () => {
    const low = chart({ rowHeight: 20 });
    const geo = low.at('a');
    const k = low.of(geo).connectors!.start;
    expect(k.hit.y).toBe(geo.y);
    expect(k.hit.height).toBe(20);
  });
});

describe('hitTestBar with the editing targets', () => {
  const c = chart();
  const v = c.of(withWidth(c.at('a'), 200), { progress: 50 });

  it('hits resize > progress > connectors > body', () => {
    expect(hitTestBar(v, v.x + 2, v.cy)).toBe('left');
    expect(hitTestBar(v, v.x + v.width - 2, v.cy)).toBe('right');
    expect(hitTestBar(v, v.progressGrip!.x, v.cy)).toBe('progress');
    expect(hitTestBar(v, v.connectors!.start.cx, v.cy)).toBe('link-start');
    expect(hitTestBar(v, v.connectors!.end.cx, v.cy)).toBe('link-end');
    expect(hitTestBar(v, v.x + 40, v.cy)).toBe('bar');
    expect(hitTestBar(v, v.connectors!.start.hit.x - 1, v.cy)).toBeNull();
  });

  it('settles shared edges by the hit order', () => {
    const zero = c.of(withWidth(c.at('a'), 200), { progress: 0 });
    const edge = right(zero.handles!.left.hit);
    expect(zero.progressGrip!.hit.x).toBe(edge);
    expect(hitTestBar(zero, edge, zero.cy)).toBe('left');
    expect(hitTestBar(zero, zero.handles!.left.hit.x, zero.cy)).toBe('left');
    expect(hitTestBar(zero, zero.handles!.left.hit.x - 0.5, zero.cy)).toBe('link-start');
  });

  it('`editTargets: false` skips the progress grip and the connectors', () => {
    expect(hitTestBar(v, v.progressGrip!.x, v.cy, false)).toBe('bar');
    expect(hitTestBar(v, v.connectors!.start.cx, v.cy, false)).toBeNull();
    expect(hitTestBar(v, v.x + 2, v.cy, false)).toBe('left');
  });

  it('is unchanged without the editing targets (editing off)', () => {
    const off = c.of(withWidth(c.at('a'), 200), { progressEditable: false, linkable: false });
    const on = c.of(withWidth(c.at('a'), 200), { progressEditable: true, linkable: true });
    expect(off.handles).toEqual(on.handles);
    expect(off.hitBox).toEqual(on.hitBox);
    expect(off.focusRect).toEqual(on.focusRect);
    for (let x = off.x - 40; x <= off.x + off.width + 40; x += 1) {
      const a = hitTestBar(off, x, off.cy);
      const b = hitTestBar(on, x, on.cy, false);
      expect(b).toBe(a);
    }
  });
});
