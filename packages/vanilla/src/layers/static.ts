/**
 * @file static.ts
 * Static region: the canvas size, the non-working bands and the vertical grid lines. They span
 * the full height, so a vertical scroll never re-runs this region; horizontally only what lies in
 * the mounted window (`graph.hWindow`: the viewport ± half its width, snapped to 256px) is in the
 * DOM, so a horizontal scroll re-runs it only when the window moves by a chunk (D10).
 *
 * Elements are keyed and patched in place: a band rect by its `x`, a grid line by `kind:x`. A
 * window change removes what left it and adds what entered it; the rest keeps its node and, with
 * the patch cache, costs nothing. Bands and lines are re-synced only when their window, the grid
 * line styles, the hatch style or the content height changed.
 *
 * `g.gantt-bands` is the skeleton's persistent group (one keyed list). `g.gantt-grid` is shared
 * with the rows region, so it holds three runs: the minor lines before its `<!--rows-->` marker,
 * the row separators (rows region) between the markers, the major lines (period delimiters)
 * after `<!--major-->`. `reconcile()` serves one list per parent, so the two line runs use
 * `syncRun()` below.
 */

import type { LinesWindow, ResolvedLine, TimeBand } from '@gantry/core';
import { s } from '../dom/h';
import { reconcile } from '../dom/keyed';
import { setAttr, setStyleProp } from '../dom/patch';
import type { Layer, LayerContext } from './context';
import { showNode } from './skeleton';

/**
 * Keys for a keyed list: `base(item)`, with `#2`, `#3`… appended to repeats (two bands that start
 * at the same x, say a weekend and a holiday). Repeats are rare and keep their order, so their
 * keys are stable too.
 */
export function uniqueKeys<T>(items: readonly T[], base: (item: T) => string): string[] {
  const seen = new Map<string, number>();
  return items.map(item => {
    const k = base(item);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n === 1 ? k : `${k}#${n}`;
  });
}

/**
 * Keyed run of siblings ending right before `end` (`null` = the end of `parent`), for a parent
 * that holds several lists. Returns the elements by key. Stale elements are removed, new ones
 * created, and an element moves only when it is not already right before its successor: kept
 * elements stay where they are, so a sliding window only inserts at its two ends.
 */
function syncRun<T, E extends Element>(
  parent: Node,
  prev: ReadonlyMap<string, E>,
  items: readonly T[],
  keys: readonly string[],
  create: () => E,
  update: (el: E, item: T) => void,
  end: Node | null,
): Map<string, E> {
  const next = new Map<string, E>();
  for (const k of keys) next.set(k, prev.get(k) ?? create());
  for (const [k, el] of prev) if (!next.has(k)) el.remove();
  let ref = end;
  for (let i = items.length - 1; i >= 0; i--) {
    const el = next.get(keys[i]!)!;
    update(el, items[i]!);
    if (el.parentNode !== parent || el.nextSibling !== ref) parent.insertBefore(el, ref);
    ref = el;
  }
  return next;
}

const sameLine = (a: ResolvedLine | null, b: ResolvedLine | null): boolean =>
  a === b || (!!a && !!b && a.paint === b.paint && a.width === b.width && a.dash === b.dash);

/** A band rect or the hatch overlay drawn over it (`nonWorkingTime.style: 'hatch'`). */
interface BandItem {
  readonly band: TimeBand;
  readonly hatch: boolean;
}

export function createStaticLayer(ctx: LayerContext): Layer {
  const { inputs: I, graph: G, dom } = ctx;
  let painted = false;
  /** What the bands were last synced for */
  let bandsFor: { bands: TimeBand[]; height: number; hatch: boolean } | undefined;
  /** What the lines were last synced for */
  let linesFor:
    { lines: LinesWindow; minor: ResolvedLine | null; major: ResolvedLine | null; height: number } | undefined;
  let minorLines = new Map<string, SVGLineElement>();
  let majorLines = new Map<string, SVGLineElement>();
  let height = 0;

  const updateBand = (el: SVGRectElement, { band, hatch }: BandItem): void => {
    setAttr(el, 'x', band.x);
    setAttr(el, 'width', band.width);
    setAttr(el, 'height', height);
    if (hatch) {
      // The overlay references the pattern (not a colour), so it stays an attribute
      setAttr(el, 'fill', `url(#${dom.hatchId})`);
      return;
    }
    setAttr(el, 'class', `gantt-band gantt-band--${band.kind}${band.className ? ` ${band.className}` : ''}`);
    setStyleProp(el, 'fill', band.paint);
  };

  const lineUpdater =
    (cls: string, style: ResolvedLine) =>
    (el: SVGLineElement, x: number): void => {
      setAttr(el, 'class', cls);
      setAttr(el, 'x1', x + 0.5);
      setAttr(el, 'x2', x + 0.5);
      setAttr(el, 'y2', height);
      setAttr(el, 'stroke-width', style.width);
      setAttr(el, 'stroke-dasharray', style.dash);
      setStyleProp(el, 'stroke', style.paint);
    };
  const newLine = () => s('line', { y1: 0, 'shape-rendering': 'crispEdges' });

  return {
    paint() {
      // The table view hides the timeline: paint it once, then leave it until the view changes
      if (I.viewOverride() === 'table' && painted) return;
      painted = true;
      const tl = G.timeline();
      const cfg = G.config();
      height = G.totalHeight();
      const width = tl.totalWidth;

      setStyleProp(dom.canvasContainer, 'width', `${width}px`);
      setStyleProp(dom.canvasContainer, 'height', `${height}px`);
      setAttr(dom.svg, 'width', width);
      setAttr(dom.svg, 'height', height);
      setAttr(dom.svg, 'aria-label', G.i18n().labels.ariaChart);

      // Hatch pattern for `nonWorkingTime.style: 'hatch'`
      const hatch = cfg.nonWorking?.style === 'hatch';
      showNode(dom.svg, dom.defs, hatch, dom.rows);

      // ── Bands (keyed by x) ──
      const bands = G.bandWindow();
      if (bandsFor?.bands !== bands || bandsFor.height !== height || bandsFor.hatch !== hatch) {
        bandsFor = { bands, height, hatch };
        const items: BandItem[] = [];
        for (const band of bands) {
          items.push({ band, hatch: false });
          if (hatch && band.kind !== 'intensive') items.push({ band, hatch: true });
        }
        const keys = uniqueKeys(items, ({ band, hatch: h }) => `${h ? 'hatch:' : ''}${band.x}`);
        reconcile(
          dom.bands,
          items,
          (_, i) => keys[i]!,
          () => s('rect', { y: 0 }),
          updateBand,
        );
      }

      // ── Grid lines (keyed by kind:x), around the rows region's separators ──
      const lines = G.lineWindow();
      const { minor, major } = cfg.gridLines;
      if (
        linesFor?.lines !== lines ||
        linesFor.height !== height ||
        !sameLine(linesFor.minor, minor) ||
        !sameLine(linesFor.major, major)
      ) {
        linesFor = { lines, minor, major, height };
        const minorX = minor ? lines.minor : [];
        const majorX = major ? lines.major : [];
        minorLines = syncRun(
          dom.grid,
          minorLines,
          minorX,
          uniqueKeys(minorX, x => `minor:${x}`),
          newLine,
          minor ? lineUpdater('gantt-grid-minor', minor) : () => {},
          dom.gridRowLines,
        );
        majorLines = syncRun(
          dom.grid,
          majorLines,
          majorX,
          uniqueKeys(majorX, x => `major:${x}`),
          newLine,
          major ? lineUpdater('gantt-grid-major', major) : () => {},
          null,
        );
      }
    },
  };
}
