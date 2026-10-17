/**
 * @file canvas.css.ts
 * Timeline body (SVG canvas): its box, draggable bars, the resize cursor and bar labels.
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
`;
