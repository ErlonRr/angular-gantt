/**
 * @file canvas.css.ts
 * Timeline body (SVG canvas): its box, draggable bars, the resize cursor, bar labels and the bar
 * overlay (D4): the keyboard focus ring and the resize grips, painted by the bars region over
 * the focused / hovered bar (the focused bar draws no outline of its own).
 */

export const CANVAS_CSS = `
    /* ── Canvas box (sized by the static layer) ─────────── */
    .gantry-canvas-container { position: relative; }
    .gantry-canvas-container > svg { display: block; overflow: visible; }

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
`;
