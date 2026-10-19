/**
 * @file gestures.css.ts
 * Touch and pointer gestures on the timeline (D13): the canvas lets the browser pan (and only
 * pan: no page pinch-zoom or double-tap zoom, the chart zooms itself) until a long press starts a
 * drag, holds no selectable text and no touch callout, and shows the cursor of the bar part under
 * the pointer through `data-cursor` (written by `interaction/canvas-pointer.ts` from core
 * `hitTestBar`, so the cursor covers the whole hit area, handles included). Phase 11 (editing):
 * ew-resize also on the progress grip, crosshair on the link connectors and while a link is being
 * made, pointer on a dependency arrow a click can select (editing.dependencies.delete).
 */

export const GESTURES_CSS = `
    /* ── Touch: pan the timeline, long-press to drag ─────── */
    .gantry-canvas-container {
      touch-action: pan-x pan-y;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
    }

    /* ── Cursor of the bar part under the pointer ───────── */
    .gantry-canvas-container[data-cursor="grab"],
    .gantry-canvas-container[data-cursor="grab"] .gantt-bar-draggable { cursor: grab; }
    .gantry-canvas-container[data-cursor="grabbing"],
    .gantry-canvas-container[data-cursor="grabbing"] .gantt-bar-draggable { cursor: grabbing; }
    .gantry-canvas-container[data-cursor="ew-resize"],
    .gantry-canvas-container[data-cursor="ew-resize"] .gantt-bar-draggable { cursor: ew-resize; }
    .gantry-canvas-container[data-cursor="crosshair"],
    .gantry-canvas-container[data-cursor="crosshair"] .gantt-bar-draggable { cursor: crosshair; }
    .gantry-canvas-container[data-cursor="pointer"],
    .gantry-canvas-container[data-cursor="pointer"] .gantt-bar-draggable { cursor: pointer; }
`;
