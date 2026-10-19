/**
 * @file readout.css.ts
 * The drag readout chip (`div.gantt-drag-readout`, `layers/readout.ts`): the new dates of a drag,
 * resize or keyboard move, or the new progress while the progress grip is dragged (Phase 11; the
 * same chip and look for both). Absolutely placed in the timeline viewport's scroll content by
 * the `--x` / `--y` custom properties the readout region writes (core `placeDragReadout`), and
 * translated by `data-align` so `--x` is its left edge (`start`), its centre (`center`) or its
 * right edge (`end`). Its box is core's look:
 * `DRAG_READOUT_HEIGHT` 20 px (border box), `DRAG_READOUT_PAD_X` 6 px, `DRAG_READOUT_FONT_PX`
 * 11 px at weight 600. Above the canvas, under the sticky header (which it never reaches: the
 * placement keeps it below the header). It takes no pointer and no selection.
 */

export const READOUT_CSS = `
    /* ── Drag readout chip ───────────────────────────────── */
    .gantt-drag-readout {
      position: absolute; left: var(--x, 0px); top: var(--y, 0px); z-index: 5;
      box-sizing: border-box; height: 20px; padding: 0 6px;
      display: flex; align-items: center; white-space: nowrap;
      font-family: var(--gantt-font); font-size: 11px; font-weight: 600; line-height: 1;
      font-variant-numeric: tabular-nums;
      color: var(--gantt-tooltip-txt); background: var(--gantt-tooltip-bg);
      border: 1px solid var(--gantt-tooltip-bdr); border-radius: 4px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.12);
      pointer-events: none; user-select: none;
    }
    .gantt-drag-readout[data-align="center"] { translate: -50% 0; }
    .gantt-drag-readout[data-align="end"] { translate: -100% 0; }
`;
