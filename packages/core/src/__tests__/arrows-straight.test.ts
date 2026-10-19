// `arrows.routing: 'straight'` (phase 10, D8): one line from the exit to the entry, the head
// rotated along it, the lag label next to the midpoint — and 'orthogonal' (the default) unchanged.
import { describe, it, expect } from 'vitest';
import {
  ARROW_DASH,
  DependencyType,
  computeArrowVisual,
  estimateTextWidth,
  resolveConfig,
  roundedPolyline,
  type ArrowVisual,
  type BarVisual,
  type GanttOptions,
} from '../index';

const orthogonal = resolveConfig({});
const straight = resolveConfig({ arrows: { routing: 'straight' } });
// `computeArrowVisual` reads only the bar box and its centre line
const bar = (x: number, width: number, cy: number) => ({ x, width, cy }) as BarVisual;
const rows = { fromTop: 0, fromBottom: 40 };
const TYPES = [DependencyType.FS, DependencyType.SS, DependencyType.FF, DependencyType.SF] as const;

type Pt = [number, number];
const parseLine = (d: string): [Pt, Pt] => {
  const m = /^M(-?[\d.]+),(-?[\d.]+)L(-?[\d.]+),(-?[\d.]+)$/.exec(d);
  if (!m) throw new Error(`not a straight line: ${d}`);
  const [, x1, y1, x2, y2] = m.map(Number);
  return [
    [x1, y1],
    [x2, y2],
  ];
};
const parseHead = (head: string): Pt[] => head.split(' ').map(p => p.split(',').map(Number) as Pt);
const dist = ([ax, ay]: Pt, [bx, by]: Pt) => Math.hypot(bx - ax, by - ay);

describe("arrows.routing: 'orthogonal' (default) is unchanged", () => {
  it("defaults to 'orthogonal'; 'straight' resolves as given", () => {
    expect(orthogonal.arrows.routing).toBe('orthogonal');
    expect(resolveConfig({ arrows: { routing: 'orthogonal' } }).arrows.routing).toBe('orthogonal');
    expect(straight.arrows.routing).toBe('straight');
  });

  it('draws the same right-angled paths and heads as before (FS, FF, U-turn)', () => {
    const from = bar(0, 100, 20);
    const fs = computeArrowVisual(from, bar(200, 80, 60), { lag: 2 }, orthogonal, rows);
    expect(fs).toEqual({
      d: roundedPolyline(
        [
          [100, 20],
          [112, 20],
          [112, 60],
          [195, 60],
        ],
        4,
      ),
      head: '200,60 195,56 195,64',
      paint: 'var(--gantt-arrow)',
      width: 1.25,
      dashed: true,
      dash: ARROW_DASH,
      critical: false,
      lagLabel: { text: '+2d', x: 116, y: 40, fontPx: 10 },
    } satisfies ArrowVisual);

    const ff = computeArrowVisual(from, bar(200, 80, 60), { type: DependencyType.FF }, orthogonal, rows, true);
    expect(ff.d).toBe(
      roundedPolyline(
        [
          [100, 20],
          [297, 20],
          [297, 60],
          [285, 60],
        ],
        4,
      ),
    );
    expect(ff.head).toBe('280,60 285,56 285,64');
    expect(ff.width).toBe(1.75);

    // The successor starts before the exit: U-turn through the row gap
    const uturn = computeArrowVisual(from, bar(50, 80, 60), {}, orthogonal, rows);
    expect(uturn.d).toBe(
      roundedPolyline(
        [
          [100, 20],
          [112, 20],
          [112, 40],
          [33, 40],
          [33, 60],
          [45, 60],
        ],
        4,
      ),
    );
  });
});

describe("arrows.routing: 'straight'", () => {
  const from = bar(0, 100, 20);
  const to = bar(200, 80, 60);

  it('exits and enters on the edges of the dependency type, at the bar centre lines', () => {
    const ends: Record<DependencyType, [Pt, Pt]> = {
      [DependencyType.FS]: [
        [100, 20],
        [200, 60],
      ],
      [DependencyType.SS]: [
        [0, 20],
        [200, 60],
      ],
      [DependencyType.FF]: [
        [100, 20],
        [280, 60],
      ],
      [DependencyType.SF]: [
        [0, 20],
        [280, 60],
      ],
    };
    for (const type of TYPES) {
      const a = computeArrowVisual(from, to, { type }, straight, rows);
      const [exit, tip] = ends[type];
      const [start] = parseLine(a.d);
      const [headTip] = parseHead(a.head);
      expect(start).toEqual(exit);
      expect(headTip).toEqual(tip);
    }
  });

  it('is one line that stops at the base of a head rotated along it', () => {
    for (const headSize of [5, 8]) {
      const cfg = resolveConfig({ arrows: { routing: 'straight', headSize } });
      for (const type of TYPES) {
        const a = computeArrowVisual(from, to, { type }, cfg, rows);
        const [exit, end] = parseLine(a.d);
        const [tip, left, right] = parseHead(a.head);
        // The base of the head is the end of the line, `headSize` before the tip, on the line
        const base: Pt = [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
        expect(base[0]).toBeCloseTo(end[0], 1);
        expect(base[1]).toBeCloseTo(end[1], 1);
        expect(dist(base, tip)).toBeCloseTo(headSize, 1);
        expect(dist(exit, end) + dist(end, tip)).toBeCloseTo(dist(exit, tip), 1);
        // 1.6 × headSize wide, perpendicular to the line
        expect(dist(left, right)).toBeCloseTo(1.6 * headSize, 1);
        const along: Pt = [tip[0] - exit[0], tip[1] - exit[1]];
        const across: Pt = [right[0] - left[0], right[1] - left[1]];
        expect(Math.abs(along[0] * across[0] + along[1] * across[1]) / dist([0, 0], along)).toBeLessThan(0.05);
      }
    }
  });

  it('a level link into a left edge has the orthogonal head, point for point', () => {
    const level = bar(200, 80, 20);
    const s = computeArrowVisual(from, level, {}, straight, rows);
    const o = computeArrowVisual(from, level, {}, orthogonal, rows);
    expect(s.head).toBe(o.head);
    expect(s.head).toBe('200,20 195,16 195,24');
    expect(s.d).toBe('M100,20L195,20');
  });

  it('a successor that starts before the exit gets a diagonal back, not a U-turn', () => {
    const early = bar(50, 80, 60);
    const a = computeArrowVisual(from, early, {}, straight, rows);
    const [exit, end] = parseLine(a.d);
    expect(exit).toEqual([100, 20]);
    expect(end[0]).toBeGreaterThan(50);
    expect(end[1]).toBeLessThan(60);
    expect(parseHead(a.head)[0]).toEqual([50, 60]);
    // The row boundary only matters to the orthogonal U-turn
    expect(computeArrowVisual(from, early, {}, straight, { fromTop: -500, fromBottom: 500 })).toEqual(a);
  });

  it('ends that meet: a zero-length line and a head into the bar edge', () => {
    const touching = bar(100, 50, 20);
    const fs = computeArrowVisual(from, touching, {}, straight, rows);
    expect(fs.d).toBe('M100,20L100,20');
    expect(fs.head).toBe('100,20 95,16 95,24');
    // Into a right edge (SF): the head points left
    const sf = computeArrowVisual(bar(100, 50, 20), bar(0, 100, 20), { type: DependencyType.SF }, straight, rows);
    expect(sf.d).toBe('M100,20L100,20');
    expect(parseHead(sf.head).map(p => p[0])).toEqual([100, 105, 105]);
    // Shorter than its head: the line doesn't leave the exit
    const short = computeArrowVisual(from, bar(103, 50, 20), {}, straight, rows);
    expect(short.d).toBe('M100,20L100,20');
    expect(parseHead(short.head)[0]).toEqual([103, 20]);
  });

  it('writes at most 2 decimals, never -0 or NaN', () => {
    const odd = computeArrowVisual(bar(0.123456, 99.98765, 17.3333), bar(213.7777, 41.1, 61.6666), {}, straight, rows);
    for (const n of `${odd.d} ${odd.head}`.match(/-?[\d.]+(e-?\d+)?/g) ?? []) {
      expect(n).toMatch(/^-?\d+(\.\d{1,2})?$/);
      expect(n).not.toBe('-0');
    }
    expect(`${odd.d} ${odd.head}`).not.toContain('NaN');
  });

  it('keeps paint, width, dash and the critical flag of the orthogonal link', () => {
    const pick = ({ paint, width, dashed, dash, critical }: ArrowVisual) => ({ paint, width, dashed, dash, critical });
    for (const options of [{}, { arrows: { color: '#123456' } }] satisfies GanttOptions[])
      for (const type of TYPES)
        for (const lag of [0, 2, -1])
          for (const crit of [false, true]) {
            const s = resolveConfig({ ...options, arrows: { ...options.arrows, routing: 'straight' } });
            const o = resolveConfig(options);
            expect(pick(computeArrowVisual(from, to, { type, lag }, s, rows, crit))).toEqual(
              pick(computeArrowVisual(from, to, { type, lag }, o, rows, crit)),
            );
          }
  });

  describe('lag label', () => {
    it('sits 4 px right of the midpoint, above a line going down to the right', () => {
      const a = computeArrowVisual(from, to, { lag: 2 }, straight, rows);
      // midpoint (150, 40); centre half the 10 px text plus 2 px above it
      expect(a.lagLabel).toEqual({ text: '+2d', x: 154, y: 33, fontPx: 10 });
      expect(computeArrowVisual(from, to, { lag: 0 }, straight, rows).lagLabel).toBeNull();
      expect(computeArrowVisual(from, to, { lag: -3 }, straight, rows, false, 14).lagLabel).toEqual({
        text: '-3d',
        x: 154,
        y: 32,
        fontPx: 12,
      });
    });

    it('below a line going up to the right, beside a vertical one, above a level one', () => {
      expect(computeArrowVisual(bar(0, 100, 60), bar(200, 80, 20), { lag: 1 }, straight, rows).lagLabel).toMatchObject({
        x: 154,
        y: 47,
      });
      // Down and to the left (a successor that starts early): the line rises to the right
      expect(computeArrowVisual(from, bar(50, 80, 60), { lag: 1 }, straight, rows).lagLabel).toMatchObject({
        x: 79,
        y: 47,
      });
      expect(computeArrowVisual(from, bar(100, 80, 60), { lag: 1 }, straight, rows).lagLabel).toMatchObject({
        x: 104,
        y: 40,
      });
      expect(computeArrowVisual(from, bar(200, 80, 20), { lag: 1 }, straight, rows).lagLabel).toMatchObject({
        x: 154,
        y: 13,
      });
    });

    it('never crosses its line', () => {
      const ys = [20, 56, 92, 200];
      const xs = [-40, 60, 100, 104, 150, 400];
      for (const type of TYPES)
        for (const fy of ys)
          for (const ty of ys)
            for (const tx of xs) {
              const a = computeArrowVisual(bar(0, 100, fy), bar(tx, 80, ty), { type, lag: 12 }, straight, rows);
              const label = a.lagLabel!;
              // The whole link: exit → head tip
              const [[x1, y1]] = parseLine(a.d);
              const [x2, y2] = parseHead(a.head)[0];
              const half = label.fontPx / 2;
              const right = label.x + estimateTextWidth(label.text, label.fontPx);
              // Sample the line inside the label's x range: its y stays out of the text box
              for (let i = 0; i <= 200; i++) {
                const t = i / 200;
                const x = x1 + (x2 - x1) * t;
                const y = y1 + (y2 - y1) * t;
                if (x < label.x || x > right) continue;
                expect(y <= label.y - half || y >= label.y + half).toBe(true);
              }
            }
    });
  });
});
