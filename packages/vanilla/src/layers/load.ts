/**
 * @file load.ts
 * The resource view's load layer (Phase 14, `options.rows: 'resources'`), painted by the static region:
 * for every mounted resource row the daily load histogram, its part above the capacity and the capacity
 * line, as the paths core computed (`graph.loadVisuals`, core `computeLoadVisuals`). Painters only write
 * what the model says — the `d` strings, the fills (colours through the CSSOM) and core's `LOAD_STYLE`.
 *
 *   g.gantt-load[aria-hidden]                       attached before `g.gantt-bars-layer` only in resource mode
 *     defs > pattern#gantt-over-hatch-<uid>          first child while a mounted row is over its capacity
 *     g.gantt-load-row[data-row-id="res:ana"]        one per mounted row, keyed by the row's id
 *       path.gantt-load-bars                         the load up to the capacity (always present, `d` may be empty)
 *       path.gantt-load-over                         the load above the capacity (only when there is some)
 *       path.gantt-load-hatch                        the same path filled with the over-capacity hatch
 *       path.gantt-load-cap                          the dashed capacity line (not on the Unassigned row)
 *
 * Optional nodes are built once per row, detached, and attached only while they show.
 */

import { LOAD_STYLE, type LoadVisual } from '@gantryjs/core';
import { s } from '../dom/h';
import { reconcile } from '../dom/keyed';
import { setAttr, setStyleProp } from '../dom/patch';
import type { Layer, LayerContext } from './context';
import { showNode } from './skeleton';

/** The paths of one row group. */
interface RowParts {
  readonly bars: SVGPathElement;
  readonly over: SVGPathElement;
  readonly hatch: SVGPathElement;
  readonly cap: SVGPathElement;
}

export function createLoadLayer(ctx: LayerContext): Layer {
  const { graph: G, dom, inputs: I } = ctx;
  const parts = new WeakMap<Element, RowParts>();

  const createRow = (v: LoadVisual): SVGGElement => {
    const bars = s('path', { class: 'gantt-load-bars' });
    const over = s('path', { class: 'gantt-load-over' });
    const hatch = s('path', { class: 'gantt-load-hatch' });
    const cap = s('path', { class: 'gantt-load-cap', fill: 'none' });
    const row = s('g', { class: 'gantt-load-row', 'data-row-id': v.rowKey }, bars);
    parts.set(row, { bars, over, hatch, cap });
    return row;
  };

  const patchRow = (row: SVGGElement, v: LoadVisual): void => {
    const p = parts.get(row)!;
    const hasOver = v.over !== '';
    setAttr(p.bars, 'd', v.bars);
    setStyleProp(p.bars, 'fill', v.barsPaint);
    if (hasOver) {
      setAttr(p.over, 'd', v.over);
      setAttr(p.over, 'fill-opacity', LOAD_STYLE.overOpacity);
      setStyleProp(p.over, 'fill', v.overPaint);
      setAttr(p.hatch, 'd', v.over);
      // The pattern is referenced by id (not a colour), so it stays an attribute
      setAttr(p.hatch, 'fill', `url(#${dom.overHatchId})`);
    }
    if (v.cap !== null) {
      setAttr(p.cap, 'd', v.cap);
      setAttr(p.cap, 'stroke-width', LOAD_STYLE.capWidth);
      setAttr(p.cap, 'stroke-dasharray', LOAD_STYLE.capDash);
      setStyleProp(p.cap, 'stroke', LOAD_STYLE.capPaint);
    }
    // In painting order, each attached right before the next one that shows
    const shown = [true, hasOver, hasOver && v.hatch, v.cap !== null] as const;
    const nodes = [p.bars, p.over, p.hatch, p.cap] as const;
    let before: Node | null = null;
    for (let i = nodes.length - 1; i >= 0; i--) {
      showNode(row, nodes[i]!, shown[i]!, before);
      if (shown[i]) before = nodes[i]!;
    }
  };

  return {
    paint() {
      // Only the resource view has a load; tasks mode reads one shared empty list and keeps the group detached
      const on = G.utilization() !== null;
      // The table view hides the timeline: no row groups to keep or repaint (they come back with the view)
      const hidden = on && I.viewOverride() === 'table';
      showNode(dom.svg, dom.load, on && !hidden, dom.bars);
      if (hidden) {
        reconcile<LoadVisual, SVGGElement>(dom.load, [], v => v.rowKey, createRow, patchRow);
        showNode(dom.load, dom.loadDefs, false, null);
        return;
      }
      if (!on) return;
      const visuals = G.loadVisuals();
      reconcile<LoadVisual, SVGGElement>(dom.load, visuals, v => v.rowKey, createRow, patchRow);
      // The hatch pattern, first in the group, only while a row uses it
      const hatched = visuals.some(v => v.hatch);
      const first = dom.load.firstChild;
      showNode(dom.load, dom.loadDefs, hatched, first === dom.loadDefs ? dom.loadDefs.nextSibling : first);
    },
  };
}
