/**
 * @file canvas.css.ts
 * Timeline body (SVG canvas): its box, the hovered row's tint, draggable bars, the resize cursor,
 * bar labels and the bar overlay (D4): the keyboard focus ring and the resize grips, painted by
 * the bars region over the focused / hovered bar (the focused bar draws no outline of its own).
 *
 * The row hover (Gantry 2 phase 10, D4): rect.gantt-row-hover, placed by the hover region over the
 * row under a mouse or pen pointer, takes its fill from the theme variable here (no CSSOM paint),
 * so rowHoverBg transparent turns it off.
 *
 * Editing (Gantry 2 phase 11, D11, D12, D22): the bar overlay also draws the progress grip (the
 * resize grips' look) and the link connectors (filled with the background, stroked with the focus
 * ring; the target connector filled with it; an invalid target stroked with the overdue status
 * colour). The link preview path (the svg's last child while a link is drawn) is a dashed focus-ring
 * line whose closed head is filled in the same colour; invalid, the overdue colour. No new theme
 * variable; the forced-colours rules are in forced-colors.css.ts.
 */

export const CANVAS_CSS = `
    /* ── Canvas box (sized by the static layer) ─────────── */
    .gantry-canvas-container { position: relative; }
    .gantry-canvas-container > svg { display: block; overflow: visible; }

    /* ── Row hover (the task list's row gets the same tint) ── */
    .gantt-row-hover { fill: var(--gantt-row-hover-bg); }

    /* ── Bars ───────────────────────────────────────────── */
    .gantt-bar-draggable { cursor: grab; }
    .gantry-dragging, .gantry-dragging .gantt-bar-draggable { cursor: grabbing; }
    /* Over a resize handle (set by the pointer handler, kept while resizing) */
    .gantry-canvas-container[data-cursor="ew-resize"],
    .gantry-canvas-container[data-cursor="ew-resize"] .gantt-bar-draggable { cursor: ew-resize; }
    .gantt-bar-label { font-family: var(--gantt-font); user-select: none; }
    .gantt-bar-label--outside { font-weight: 500; }
    .gantt-bars-layer > :focus { outline: none; }

    /* ── Bar overlay: focus ring and resize grips ──────── */
    .gantt-bar-focus-ring { fill: none; stroke: var(--gantt-focus-ring); stroke-width: 2px; }
    .gantt-bar-grip { fill: var(--gantt-bg); stroke: var(--gantt-focus-ring); stroke-width: 1.5px; }

    /* ── Bar overlay: progress grip and link connectors ── */
    .gantt-progress-grip { fill: var(--gantt-bg); stroke: var(--gantt-focus-ring); stroke-width: 1.5px; }
    .gantt-link-connector { fill: var(--gantt-bg); stroke: var(--gantt-focus-ring); stroke-width: 1.5px; }
    .gantt-link-connector--target { fill: var(--gantt-focus-ring); }
    .gantt-link-connector--invalid { stroke: var(--gantt-status-overdue); }

    /* ── Link preview (while a link is drawn) ──────────── */
    .gantt-link-preview {
      fill: var(--gantt-focus-ring);
      stroke: var(--gantt-focus-ring);
      stroke-width: 2px;
      stroke-dasharray: 4 3;
    }
    .gantt-link-preview--invalid { fill: var(--gantt-status-overdue); stroke: var(--gantt-status-overdue); }
`;
