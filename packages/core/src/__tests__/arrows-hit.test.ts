// Arrows as pointer targets (D13): their route as points, the 10 px hit band, the last painted
// link winning, the selected look — plus the link preview path (D12) and the progress readout.
import { describe, it, expect } from 'vitest';
import {
  ARROW_HIT_TOLERANCE,
  DependencyType,
  LINK_PREVIEW_HEAD,
  arrowAt,
  computeArrowVisual,
  formatProgressReadout,
  hitTestArrow,
  linkPreviewPath,
  resolveConfig,
  selectedArrowVisual,
  type ArrowVisual,
  type BarVisual,
} from '../index';

const orthogonal = resolveConfig({});
const straight = resolveConfig({ arrows: { routing: 'straight' } });
// `computeArrowVisual` reads only the bar box and its centre line
const bar = (x: number, width: number, cy: number) => ({ x, width, cy }) as BarVisual;
const rows = { fromTop: 0, fromBottom: 40 };
const TYPES = [DependencyType.FS, DependencyType.SS, DependencyType.FF, DependencyType.SF] as const;

/** Endpoints of a path's M/L commands (and the end of each Q), in order. */
function pathEnds(d: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)|Q-?[\d.]+,-?[\d.]+ (-?[\d.]+),(-?[\d.]+)/g)) {
    out.push(m[1] !== undefined ? [Number(m[1]), Number(m[2])] : [Number(m[3]), Number(m[4])]);
  }
  return out;
}

describe('ArrowVisual.points', () => {
  it('orthogonal: the corners from the exit to the base of the head, then the tip', () => {
    const fs = computeArrowVisual(bar(0, 100, 20), bar(200, 80, 60), {}, orthogonal, rows);
    expect(fs.points).toEqual([
      [100, 20],
      [112, 20],
      [112, 60],
      [195, 60],
      [200, 60],
    ]);
    // The U-turn through the row boundary
    const back = computeArrowVisual(bar(0, 100, 20), bar(50, 80, 60), {}, orthogonal, rows);
    expect(back.points).toEqual([
      [100, 20],
      [112, 20],
      [112, 40],
      [33, 40],
      [33, 60],
      [45, 60],
      [50, 60],
    ]);
  });

  it('starts at the exit edge and ends at the tip of the head for every type and routing', () => {
    const from = bar(0, 100, 20);
    const to = bar(200, 80, 60);
    for (const cfg of [orthogonal, straight])
      for (const type of TYPES) {
        const a = computeArrowVisual(from, to, { type }, cfg, rows);
        const exitX = type === DependencyType.FS || type === DependencyType.FF ? 100 : 0;
        const tipX = type === DependencyType.FF || type === DependencyType.SF ? 280 : 200;
        expect(a.points[0]).toEqual([exitX, 20]);
        expect(a.points.at(-1)).toEqual([tipX, 60]);
        // The line's own path starts at the exit too
        expect(pathEnds(a.d)[0]).toEqual([exitX, 20]);
        // The head's tip is the first head point
        expect(a.head.split(' ')[0]).toBe(`${tipX},60`);
      }
  });

  it('straight: the two ends', () => {
    const a = computeArrowVisual(bar(0, 100, 20), bar(200, 80, 60), {}, straight, rows);
    expect(a.points).toEqual([
      [100, 20],
      [200, 60],
    ]);
  });
});

describe('hitTestArrow', () => {
  const a = computeArrowVisual(bar(0, 100, 20), bar(200, 80, 60), {}, orthogonal, rows);

  it('hits within ARROW_HIT_TOLERANCE (5 px) of the route: a 10 px band', () => {
    expect(ARROW_HIT_TOLERANCE).toBe(5);
    // On each segment
    expect(hitTestArrow(a, 106, 20)).toBe(true);
    expect(hitTestArrow(a, 112, 40)).toBe(true);
    expect(hitTestArrow(a, 150, 60)).toBe(true);
    // The head
    expect(hitTestArrow(a, 198, 60)).toBe(true);
    // 5 px off (edge included), then just beyond
    expect(hitTestArrow(a, 150, 65)).toBe(true);
    expect(hitTestArrow(a, 150, 65.5)).toBe(false);
    expect(hitTestArrow(a, 117, 40)).toBe(true);
    expect(hitTestArrow(a, 117.5, 40)).toBe(false);
    // Past the ends, measured to the end point
    expect(hitTestArrow(a, 96, 20)).toBe(true);
    expect(hitTestArrow(a, 94, 20)).toBe(false);
    expect(hitTestArrow(a, 205, 60)).toBe(true);
    expect(hitTestArrow(a, 206, 60)).toBe(false);
    // Far away
    expect(hitTestArrow(a, 150, 30)).toBe(false);
  });

  it('honours a tolerance and diagonal (straight) routes', () => {
    const s = computeArrowVisual(bar(0, 100, 20), bar(200, 80, 120), {}, straight, rows);
    // The middle of the line, then 4 px off it perpendicularly
    const [mx, my] = [150, 70];
    expect(hitTestArrow(s, mx, my)).toBe(true);
    const n = [-100 / Math.hypot(100, 100), 100 / Math.hypot(100, 100)];
    expect(hitTestArrow(s, mx + n[0] * 4.9, my + n[1] * 4.9)).toBe(true);
    expect(hitTestArrow(s, mx + n[0] * 5.1, my + n[1] * 5.1)).toBe(false);
    expect(hitTestArrow(s, mx + n[0] * 8, my + n[1] * 8, 10)).toBe(true);
  });

  it('a route without points is never hit; a single point is hit around it', () => {
    expect(hitTestArrow({ points: [] }, 0, 0)).toBe(false);
    expect(hitTestArrow({ points: [[10, 10]] }, 13, 14)).toBe(true);
    expect(hitTestArrow({ points: [[10, 10]] }, 14, 14)).toBe(false);
  });
});

describe('arrowAt', () => {
  const visuals = new Map<string, Pick<ArrowVisual, 'points'> | null>([
    [
      'a→b:FS',
      {
        points: [
          [0, 10],
          [100, 10],
        ],
      },
    ],
    [
      'c→d:FS',
      {
        points: [
          [50, 0],
          [50, 100],
        ],
      },
    ],
    ['x→y:FS', null],
  ]);
  const links = [...visuals.keys()].map(key => ({ key }));
  const of = (link: { key: string }) => visuals.get(link.key) ?? null;

  it('returns the key of the hit link, the last painted on a crossing', () => {
    expect(arrowAt(links, of, 20, 12)).toBe('a→b:FS');
    expect(arrowAt(links, of, 52, 60)).toBe('c→d:FS');
    // Where both cross: the later one (painted on top)
    expect(arrowAt(links, of, 50, 10)).toBe('c→d:FS');
    expect(arrowAt([...links].reverse(), of, 50, 10)).toBe('a→b:FS');
  });

  it('returns null off every link and skips links without a visual', () => {
    expect(arrowAt(links, of, 20, 30)).toBeNull();
    expect(arrowAt([], of, 20, 10)).toBeNull();
    expect(arrowAt(links, of, 20, 22, 12)).toBe('a→b:FS');
  });
});

describe('selectedArrowVisual', () => {
  it('paints the focus ring, 1 px wider, selected, with a halo — also over the critical colour', () => {
    const a = computeArrowVisual(bar(0, 100, 20), bar(200, 80, 60), {}, orthogonal, rows);
    expect(a.selected).toBe(false);
    expect(a.halo).toBeNull();
    const s = selectedArrowVisual(a);
    expect(s).toEqual({
      ...a,
      paint: 'var(--gantt-focus-ring)',
      width: a.width + 1,
      selected: true,
      halo: { paint: 'var(--gantt-focus-ring)', width: a.width + 6, opacity: 0.3 },
    });
    expect(s.points).toBe(a.points);
    expect(selectedArrowVisual(s)).toBe(s);
    const crit = computeArrowVisual(bar(0, 100, 20), bar(200, 80, 60), {}, orthogonal, rows, true);
    const sc = selectedArrowVisual(crit);
    expect(sc.paint).toBe('var(--gantt-focus-ring)');
    expect(sc.width).toBe(crit.width + 1);
    expect(sc.critical).toBe(true);
  });
});

describe('linkPreviewPath', () => {
  it('a line to the base of a closed head whose tip is on the target', () => {
    expect(LINK_PREVIEW_HEAD).toBe(6);
    // Level, rightwards: the head is 6 long and 9.6 wide
    expect(linkPreviewPath({ x: 10, y: 20 }, { x: 100, y: 20 })).toBe('M10,20L94,20M100,20L94,15.2L94,24.8Z');
    // Leftwards
    expect(linkPreviewPath({ x: 100, y: 20 }, { x: 10, y: 20 })).toBe('M100,20L16,20M10,20L16,24.8L16,15.2Z');
  });

  it('points along a sloped line, rounded to 1/100 px', () => {
    const d = linkPreviewPath({ x: 0, y: 0 }, { x: 30, y: 40 });
    // Unit vector (0.6, 0.8): base at (26.4, 35.2), wings ∓(−0.8, 0.6) × 4.8
    expect(d).toBe('M0,0L26.4,35.2M30,40L30.24,32.32L22.56,38.08Z');
  });

  it('is all head when shorter than its head, and points right when it has no length', () => {
    expect(linkPreviewPath({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe('M0,0L0,0M4,0L-2,-4.8L-2,4.8Z');
    expect(linkPreviewPath({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe('M5,5L5,5M5,5L-1,0.2L-1,9.8Z');
  });
});

describe('formatProgressReadout', () => {
  it('a whole percentage, clamped to 0–100, in the locale (default en)', () => {
    expect(formatProgressReadout(45)).toBe('45%');
    expect(formatProgressReadout(0)).toBe('0%');
    expect(formatProgressReadout(100)).toBe('100%');
    expect(formatProgressReadout(44.6)).toBe('45%');
    expect(formatProgressReadout(140)).toBe('100%');
    expect(formatProgressReadout(-3)).toBe('0%');
    expect(formatProgressReadout(Number.NaN)).toBe('0%');
    expect(formatProgressReadout(45, 'en-GB')).toBe('45%');
    // German puts a (no-break) space before the sign
    expect(formatProgressReadout(45, 'de').replace(/\s/u, ' ')).toBe('45 %');
    // An unknown tag reads as 'en'
    expect(formatProgressReadout(45, 'not a locale!')).toBe('45%');
  });
});
