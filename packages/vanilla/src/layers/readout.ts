/**
 * @file readout.ts
 * Readout region: the chip that shows the new dates and the duration while a bar is dragged,
 * resized or moved from the keyboard ("3 Mar – 6 Mar · 3 days"), or the new progress while its
 * grip is dragged ("45%"). Flushed after the canvas overlay.
 *
 *   div.gantt-drag-readout[aria-hidden][data-align]   `dom.readout`, inside
 *                                                      `.gantry-canvas-viewport` after the canvas
 *                                                      container, attached while a preview shows
 *
 * Dates: shown while `dragPreview` carries the new dates (a pointer drag or resize, a keyboard
 * move) and its ghost is drawn. Text: core `formatDragReadout(dragPreview, …)`, its dates in
 * `formats.readoutFormat` when set (else core's default for the scale unit); anchor: the ghost.
 *
 * Progress (Phase 11, D11): shown while the progress grip is dragged (`ctx.progress.active()`)
 * and `progressPreview` holds its value. Text: core `formatProgressReadout(progress, locale)`;
 * anchor: the bar's box (`x`, `y`, `width`, `height` of its visual). Move mode's ↑ / ↓ write
 * `progressPreview` too, but there the chip keeps the dates (`dragPreview` is set all along) and
 * the live region says the progress. `ctx.progress.active()` is not a signal: a grip drag writes
 * `progressPreview` on each move and clears it when it ends, which re-runs this region.
 *
 * Place: core `placeDragReadout(anchor, { scrollLeft, viewportWidth, scrollTop, headerHeight,
 * viewportHeight, width })` in the viewport's scroll content, written as the `--x` / `--y` custom
 * properties and `data-align` (`readout.css.ts` translates the chip by 0 / -50% / -100%, so its
 * real width is never measured). `aria-hidden`: the live region announces the result instead.
 *
 * The scroll offsets are read only while a preview shows: an idle chart's scroll never re-runs
 * this region.
 */

import {
  barKind,
  dragReadoutWidth,
  formatDragReadout,
  formatProgressReadout,
  placeDragReadout,
  type DragReadoutAnchor,
} from '@gantryjs/core';
import { setAttr, setStyleProp, setText } from '../dom/patch';
import type { Layer, LayerContext } from './context';
import { showNode } from './skeleton';

export function createReadoutLayer(ctx: LayerContext): Layer {
  const { inputs: I, graph: G, dom } = ctx;
  const chip = dom.readout;

  /** The progress grip's chip: "45%" over the bar, `null` unless a grip drag shows a preview. */
  const progressChip = (): { anchor: DragReadoutAnchor; text: string } | null => {
    const progress = I.progressPreview();
    if (!progress || !ctx.progress.active()) return null;
    const geo = G.geoById().get(progress.taskId);
    if (!geo) return null;
    const { x, y, width, height } = G.barVisual()(geo);
    return { anchor: { x, y, width, height }, text: formatProgressReadout(progress.progress, G.i18n().locale) };
  };

  /** The dates chip of a drag, resize or move-mode preview, anchored on its ghost. */
  const datesChip = (): { anchor: DragReadoutAnchor; text: string } | null => {
    const preview = I.dragPreview();
    const ghost = preview ? G.ghostVisual() : null;
    if (!preview || !ghost) return null;
    const { labels, locale, formats } = G.i18n();
    const row = G.geoById().get(preview.taskId)?.row;
    const text = formatDragReadout(preview, {
      labels,
      locale,
      dates: G.config(),
      unit: preview.unit,
      format: formats.readoutFormat,
      milestone: !!row && barKind(row.barType) === 'milestone',
    });
    return { anchor: ghost, text };
  };

  return {
    paint() {
      const shown = progressChip() ?? datesChip();
      // At the end of the viewport, after the canvas container (D27: attached only while shown)
      showNode(dom.viewport, chip, shown !== null && shown.text !== '');
      if (!shown || !shown.text) return;

      const { anchor, text } = shown;
      const canvasH = I.canvasH();
      const place = placeDragReadout(anchor, {
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
