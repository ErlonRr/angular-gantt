/**
 * @file hover.ts
 * Hover region, right after `rows`: the tint over the timeline row under a mouse or pen pointer
 * (`inputs.hoveredRowId`, D4 of Gantry 2 phase 10; §3c of its plan, mirrored by Angular).
 *
 * `dom.rowHover` (`rect.gantt-row-hover`, built detached in `layers/skeleton.ts` with x 0,
 * `aria-hidden` and `pointer-events: none`) is attached as the next sibling of `g.gantt-rows`
 * only while `hoveredRowId` is a mounted row and the view is not `table`, at the row geometry's
 * `y` and height, as wide as the timeline. Its fill is the stylesheet's
 * `fill: var(--gantt-row-hover-bg)` (`styles/canvas.css.ts`; `rowHoverBg: 'transparent'` turns the
 * hover off), hidden in forced colours: no paint is written here. Over the row backgrounds, under
 * the bands, grid and bars, so a row colour stays visible under the tint.
 *
 * The task list's hovered row (`.gantt-tl-row--hover`) is the task-list region's: it owns, keys
 * and recycles those rows. The pointer handlers write `hoveredRowId`: the task list's delegated
 * `pointerover` / `pointerleave` (`layers/tasklist.ts`) and the timeline's `pointermove` /
 * `pointerleave` (core `rowIndexAtY`, `interaction/canvas-pointer.ts`), which also clears it when
 * either pane scrolls and when a drag starts. A touch never hovers.
 *
 * While nothing is hovered the region reads only `hoveredRowId` and the view: a scroll or a zoom
 * does not run it.
 */

import { setAttr } from '../dom/patch';
import type { Layer, LayerContext } from './context';
import { showNode } from './skeleton';

export function createHoverLayer(ctx: LayerContext): Layer {
  const { inputs: I, graph: G, dom } = ctx;
  const rect = dom.rowHover;

  return {
    paint() {
      const id = I.hoveredRowId();
      const shown = id !== null && I.viewOverride() !== 'table';
      // Only a mounted row (the virtual window plus the pinned rows) shows the tint
      const geo = shown ? G.mountedGeometries().find(g => g.row.task.id === id) : undefined;
      if (geo) {
        setAttr(rect, 'y', geo.y);
        setAttr(rect, 'width', G.timeline().totalWidth);
        setAttr(rect, 'height', geo.height);
      }
      showNode(dom.svg, rect, geo !== undefined, dom.bands);
    },
  };
}
