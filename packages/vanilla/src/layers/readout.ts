/**
 * @file readout.ts
 * Readout region: the chip that shows the new dates and the duration while a bar is dragged,
 * resized or moved from the keyboard ("3 Mar – 6 Mar · 3 days"). Flushed after the canvas
 * overlay.
 *
 *   div.gantt-drag-readout[aria-hidden][data-align]   `dom.readout`, inside
 *                                                      `.gantry-canvas-viewport` after the canvas
 *                                                      container, attached while a preview shows
 *
 * Shown while `dragPreview` carries the new dates (a pointer drag or resize, a keyboard move) and
 * its ghost is drawn. Text: core `formatDragReadout(dragPreview, …)`, its dates in
 * `formats.readoutFormat` when set (else core's default for the scale unit); place: core
 * `placeDragReadout(ghost, { scrollLeft, viewportWidth, scrollTop, headerHeight, viewportHeight,
 * width })` in the viewport's scroll content, written as the `--x` / `--y` custom properties and
 * `data-align` (`readout.css.ts` translates the chip by 0 / -50% / -100%, so its real width is
 * never measured). `aria-hidden`: the live region announces the result instead.
 *
 * The scroll offsets are read only while a preview shows: an idle chart's scroll never re-runs
 * this region.
 */

import { barKind, dragReadoutWidth, formatDragReadout, placeDragReadout } from '@gantryjs/core';
import { setAttr, setStyleProp, setText } from '../dom/patch';
import type { Layer, LayerContext } from './context';
import { showNode } from './skeleton';

export function createReadoutLayer(ctx: LayerContext): Layer {
  const { inputs: I, graph: G, dom } = ctx;
  const chip = dom.readout;
  return {
    paint() {
      const preview = I.dragPreview();
      const ghost = preview ? G.ghostVisual() : null;
      let text = '';
      if (preview && ghost) {
        const { labels, locale, formats } = G.i18n();
        const row = G.geoById().get(preview.taskId)?.row;
        text = formatDragReadout(preview, {
          labels,
          locale,
          dates: G.config(),
          unit: preview.unit,
          format: formats.readoutFormat,
          milestone: !!row && barKind(row.barType) === 'milestone',
        });
      }
      // At the end of the viewport, after the canvas container (D27: attached only while shown)
      showNode(dom.viewport, chip, ghost !== null && text !== '');
      if (!ghost || !text) return;

      const canvasH = I.canvasH();
      const place = placeDragReadout(ghost, {
        scrollLeft: I.scrollLeft(),
        viewportWidth: I.canvasW(),
        scrollTop: I.scrollTop(),
        headerHeight: G.headerHeight(),
        viewportHeight: canvasH > 0 ? canvasH : undefined,
        width: dragReadoutWidth(text),
      });
      setText(chip, text);
      setAttr(chip, 'data-align', place.align);
      setStyleProp(chip, '--x', `${place.x}px`);
      setStyleProp(chip, '--y', `${place.y}px`);
    },
  };
}
