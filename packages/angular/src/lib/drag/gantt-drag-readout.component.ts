// ─────────────────────────────────────────────────────────────
//  gantry · drag/gantt-drag-readout.component.ts
//
//  The drag readout chip: the new dates and duration of the bar being
//  dragged, resized or moved with the keyboard ("3 Mar – 6 Mar · 3 days"),
//  or the new progress while its grip is dragged ("45%").
//  GantryComponent attaches it inside `.gantry-canvas-viewport`, after the
//  canvas, only while it shows (D27, as the Web Component's readout layer
//  packages/vanilla/src/layers/readout.ts): an `@if` on `injectDragReadout`,
//  which is `null` without a preview, for a preview without the new dates
//  and for one whose row is gone:
//
//    div.gantt-drag-readout[aria-hidden][data-align]   placed with --x / --y
//
//  Dates: shown while the drag preview carries the new dates (a pointer
//  drag or resize, a keyboard move). Text: core `formatDragReadout(preview,
//  …)`, its dates in `formats.readoutFormat` when set, else core's default
//  for the scale unit (a milestone shows its date only, hour scales the
//  time); anchor: the ghost.
//
//  Progress (Phase 11, D11): shown first, while the progress grip is
//  dragged (`GanttProgressService.active()`) and `layout.progressPreview`
//  holds its value. Text: core `formatProgressReadout(progress, locale)`;
//  anchor: the bar's box (`x`, `y`, `width`, `height` of its core
//  `computeBarVisual`, which depend on the geometry, the options and the
//  row's resolved style only). Move mode's ↑ / ↓ write `progressPreview`
//  too, but there the chip keeps the dates (the drag preview is set all
//  along) and the live region says the progress. `active()` is not a
//  signal: a grip drag writes `progressPreview` on each move and clears it
//  when it ends, which re-runs this chip.
//
//  Place: core `placeDragReadout(anchor, { scrollLeft, viewportWidth,
//  scrollTop, headerHeight, viewportHeight, width })` in the viewport's
//  scroll content, written as the `--x` / `--y` custom properties and
//  `data-align` (the stylesheet translates the chip by 0 / -50% / -100%,
//  so its real width is never measured).
//  `aria-hidden`: the live region announces the result instead. The
//  scroll offsets are read only while a preview exists.
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, computed, inject, input, type Signal } from '@angular/core';
import {
  barKind,
  computeBarVisual,
  computeDragGhostVisual,
  dragReadoutWidth,
  formatDragReadout,
  formatProgressReadout,
  placeDragReadout,
  type DragPreview,
  type DragReadoutAnchor,
  type DragReadoutPlacement,
} from '@gantryjs/core';

import { GanttProgressService } from '../editing/progress';
import { GanttLayoutService } from '../layout/gantt-layout.service';
import { GanttScrollService } from '../scroll/gantt-scroll.service';
import { GanttI18nService } from '../services/gantt-i18n.service';

/** The chip's text and place */
export interface DragReadout {
  readonly text: string;
  readonly place: DragReadoutPlacement;
  /** `--x` / `--y`: the place in px */
  readonly x: string;
  readonly y: string;
}

/** What a chip says and the box it is placed by */
interface Chip {
  readonly anchor: DragReadoutAnchor;
  readonly text: string;
}

/**
 * The readout chip of a progress-grip drag, else of `preview` (call in an injection context below
 * the chart: GantryComponent's field), `null` while there is nothing to show — no preview, a
 * preview without the new dates, or one whose row is gone (the Web Component's readout region then
 * detaches its chip).
 */
export function injectDragReadout(preview: Signal<DragPreview | null>): Signal<DragReadout | null> {
  const layout = inject(GanttLayoutService);
  const scroll = inject(GanttScrollService);
  const i18n = inject(GanttI18nService);
  const progressDrag = inject(GanttProgressService);

  /** The progress grip's chip: "45%" over the bar, `null` unless a grip drag shows a preview. */
  const progressChip = computed<Chip | null>(() => {
    const p = layout.progressPreview();
    // Read only while a progress preview exists (editing off never reads the grip)
    if (!p || !progressDrag.active()) return null;
    const geo = layout.geometryById().get(p.taskId);
    if (!geo) return null;
    const { x, y, width, height } = computeBarVisual({
      geo,
      cfg: layout.cfg(),
      toX: layout.timeline().toX,
      fontPx: layout.fontPx(),
      style: layout.rowStyle()(geo.row),
    });
    return { anchor: { x, y, width, height }, text: formatProgressReadout(p.progress, i18n.locale()) };
  });

  /** The dragged bar's ghost (`computeDragGhostVisual`, as the canvas draws it); `null` when its row is gone */
  const ghost = computed(() => {
    const p = preview();
    const geo = p ? layout.geometryById().get(p.taskId) : undefined;
    if (!p || !geo) return null;
    // At its bar's height: the row's resolved style, as the canvas draws the ghost
    const style = layout.rowStyle()(geo.row);
    return computeDragGhostVisual(p, geo, layout.cfg(), layout.timeline().toX, i18n.bundle(), layout.fontPx(), style);
  });

  /** The new dates and duration (`formatDragReadout`, dates in `formats.readoutFormat` when set); `''` without them */
  const text = computed(() => {
    const p = preview();
    if (!p) return '';
    const row = layout.geometryById().get(p.taskId)?.row;
    return formatDragReadout(p, {
      labels: i18n.labels(),
      locale: i18n.locale(),
      dates: layout.cfg(),
      unit: p.unit,
      format: i18n.formats().readoutFormat,
      milestone: !!row && barKind(row.barType) === 'milestone',
    });
  });

  /** The dates chip of a drag, resize or move-mode preview, anchored on its ghost. */
  const datesChip = computed<Chip | null>(() => {
    const g = ghost();
    const t = text();
    return g && t ? { anchor: g, text: t } : null;
  });

  /** Text and place of the chip (`placeDragReadout` in the viewport's scroll content) */
  return computed<DragReadout | null>(() => {
    const chip = progressChip() ?? datesChip();
    if (!chip) return null;
    const { anchor, text: t } = chip;
    const viewportHeight = layout.viewportHeight();
    const place = placeDragReadout(anchor, {
      scrollLeft: scroll.scrollLeft(),
      viewportWidth: layout.viewportWidth(),
      scrollTop: scroll.scrollTop(),
      headerHeight: layout.headerHeight(),
      viewportHeight: viewportHeight > 0 ? viewportHeight : undefined,
      width: dragReadoutWidth(t),
    });
    return { text: t, place, x: `${place.x}px`, y: `${place.y}px` };
  });
}

@Component({
  selector: 'div[ganttDragReadout]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'gantt-drag-readout',
    'aria-hidden': 'true',
    '[attr.data-align]': 'readout().place.align',
    '[style.--x]': 'readout().x',
    '[style.--y]': 'readout().y',
    '[textContent]': 'readout().text',
  },
  template: ``,
  // The Web Component's readout stylesheet (styles/readout.css.ts), `.gantt-drag-readout` being the host:
  // core's look (DRAG_READOUT_HEIGHT 20, DRAG_READOUT_PAD_X 6, DRAG_READOUT_FONT_PX 11)
  styles: [
    `
      :host {
        position: absolute;
        left: var(--x, 0px);
        top: var(--y, 0px);
        z-index: 5;
        box-sizing: border-box;
        height: 20px;
        padding: 0 6px;
        display: flex;
        align-items: center;
        white-space: nowrap;
        font-family: var(--gantt-font);
        font-size: 11px;
        font-weight: 600;
        line-height: 1;
        font-variant-numeric: tabular-nums;
        color: var(--gantt-tooltip-txt);
        background: var(--gantt-tooltip-bg);
        border: 1px solid var(--gantt-tooltip-bdr);
        border-radius: 4px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
        pointer-events: none;
        user-select: none;
      }
      :host([data-align='center']) {
        translate: -50% 0;
      }
      :host([data-align='end']) {
        translate: -100% 0;
      }
      /* Forced colours (D25): Canvas / CanvasText with a CanvasText border */
      @media (forced-colors: active) {
        :host {
          background-color: Canvas;
          color: CanvasText;
          border-color: CanvasText;
        }
      }
    `,
  ],
})
export class GanttDragReadoutComponent {
  /** What the chip shows (`injectDragReadout`): attached only while there is something to show */
  readonly readout = input.required<DragReadout>();
}
