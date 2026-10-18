/**
 * @file rows.ts
 * Rows region: the row backgrounds (zebra, row colour, selection: `rowPaint`) of the mounted rows
 * — the virtual window plus the pinned rows — keyed by task id, and their horizontal separators.
 *
 * The separators sit in `g.gantt-grid` between its two comment markers (above the minor lines,
 * under the period delimiters the static layer owns). They are keyed by task id too, by hand
 * rather than with `dom/keyed.ts` (whose list state is per parent, and the grid is shared): only
 * the nodes between the markers are ever touched.
 */

import { rowPaint, type RowGeometry } from '@gantryjs/core';
import { s } from '../dom/h';
import { reconcile } from '../dom/keyed';
import { setAttr, setStyleProp } from '../dom/patch';
import type { Layer, LayerContext } from './context';

/**
 * Keys of the mounted rows (bars and row backgrounds): task ids, made unique — a repeated id gets
 * `\u0000n`, since a keyed list refuses duplicates.
 */
export function rowKeys(geos: readonly RowGeometry[]): string[] {
  const seen = new Set<string>();
  return geos.map(geo => {
    const id = geo.row.task.id;
    let key = id;
    for (let n = 2; seen.has(key); n++) key = `${id}\u0000${n}`;
    seen.add(key);
    return key;
  });
}

export function createRowsLayer(ctx: LayerContext): Layer {
  const { inputs: I, graph: G, dom } = ctx;
  let painted = false;
  /** Row separators in the grid, by row key, in row order */
  let separators = new Map<string, SVGLineElement>();

  return {
    paint() {
      // The table view hides the timeline: paint it once, then leave it until the view changes
      if (I.viewOverride() === 'table' && painted) return;
      painted = true;
      const geos = G.mountedGeometries();
      const width = G.timeline().totalWidth;
      const selected = I.selection().selected;
      const hz = G.config().gridLines.horizontal;
      const keys = rowKeys(geos);

      reconcile<RowGeometry, SVGRectElement>(
        dom.rows,
        geos,
        (_, i) => keys[i]!,
        () => s('rect', { x: 0 }),
        (rect, geo) => {
          setAttr(rect, 'y', geo.y);
          setAttr(rect, 'width', width);
          setAttr(rect, 'height', geo.height);
          setStyleProp(rect, 'fill', rowPaint(geo, selected.has(geo.row.task.id)));
        },
      );

      // Separators: the rows' bottom edges (none without `gridLines.horizontal`)
      const next = new Map<string, SVGLineElement>();
      if (hz) {
        geos.forEach((geo, i) => {
          const key = keys[i]!;
          const line =
            separators.get(key) ?? s('line', { class: 'gantt-grid-row', x1: 0, 'shape-rendering': 'crispEdges' });
          const y = geo.y + geo.height - 0.5;
          setAttr(line, 'y1', y);
          setAttr(line, 'x2', width);
          setAttr(line, 'y2', y);
          setAttr(line, 'stroke-width', hz.width);
          setAttr(line, 'stroke-dasharray', hz.dash);
          setStyleProp(line, 'stroke', hz.paint);
          next.set(key, line);
        });
      }
      for (const [key, line] of separators) if (!next.has(key)) line.remove();
      separators = next;
      // In row order between the markers: kept lines stay put, the others are inserted
      let cursor = dom.gridRowLines.nextSibling;
      for (const line of next.values()) {
        if (line === cursor) cursor = line.nextSibling;
        else dom.grid.insertBefore(line, cursor ?? dom.gridMajorLines);
      }
    },
  };
}
