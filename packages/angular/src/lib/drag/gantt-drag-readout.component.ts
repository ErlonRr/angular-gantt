// ─────────────────────────────────────────────────────────────
//  gantry · drag/gantt-drag-readout.component.ts
//
//  The drag readout chip: the new dates and duration of the bar being
//  dragged, resized or moved with the keyboard ("3 Mar – 6 Mar · 3 days").
//  GantryComponent attaches it inside `.gantry-canvas-viewport`, after the
//  canvas, only while it shows (D27, as the Web Component's readout layer
//  packages/vanilla/src/layers/readout.ts): an `@if` on `injectDragReadout`,
//  which is `null` without a drag preview, for a preview without the new
//  dates and for one whose row is gone:
//
//    div.gantt-drag-readout[aria-hidden][data-align]   placed with --x / --y
//
//  Text: core `formatDragReadout(preview, …)`, its dates in
//  `formats.readoutFormat` when set, else core's default for the scale
//  unit (a milestone shows its date only, hour scales the time). Place:
//  core `placeDragReadout(ghost, { scrollLeft, viewportWidth, scrollTop,
//  headerHeight, viewportHeight, width })` in the viewport's scroll
//  content, written as the `--x` / `--y` custom properties and
//  `data-align` (the stylesheet translates the chip by 0 / -50% / -100%,
//  so its real width is never measured).
//  `aria-hidden`: the live region announces the result instead. The
//  scroll offsets are read only while a preview exists.
// ─────────────────────────────────────────────────────────────

import { ChangeDetectionStrategy, Component, computed, inject, input, type Signal } from '@angular/core';
import {
  barKind,
  computeDragGhostVisual,
  dragReadoutWidth,
  formatDragReadout,
  placeDragReadout,
  type DragPreview,
  type DragReadoutPlacement,
} from '@gantryjs/core';

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

/**
 * The readout chip of `preview` (call in an injection context below the chart: GantryComponent's
 * field), `null` while there is nothing to show — no preview, a preview without the new dates, or
 * one whose row is gone (the Web Component's readout region then detaches its chip).
 */
export function injectDragReadout(preview: Signal<DragPreview | null>): Signal<DragReadout | null> {
  const layout = inject(GanttLayoutService);
  const scroll = inject(GanttScrollService);
  const i18n = inject(GanttI18nService);

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

  /** Text and place of the chip (`placeDragReadout` in the viewport's scroll content) */
  return computed<DragReadout | null>(() => {
    const g = ghost();
    const t = text();
    if (!g || !t) return null;
    const viewportHeight = layout.viewportHeight();
    const place = placeDragReadout(g, {
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
