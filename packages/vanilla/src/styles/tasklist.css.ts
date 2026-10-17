/**
 * @file tasklist.css.ts
 * Task list (treegrid): layout and chrome of the header row, rows, cells, collapse and
 * load-more buttons and column resize handles. What varies per column or per row (grid template,
 * heights, alignment, indent, paints) is set on the element through the CSSOM by
 * `layers/tasklist.ts`, as are the styles of the class-less inner spans.
 *
 * Pinned rows: a focused row kept mounted outside the virtual window is positioned absolutely
 * at its row offset (`top` is set through the CSSOM).
 *
 * Focus: rows, sortable headers, collapse toggles and the footer show an inset ring (cells and
 * the panel clip anything outside them), the load-more button an outer one; keyboard focus only
 * (`:focus-visible`).
 */

export const TASKLIST_CSS = `
    /* ── Task list ──────────────────────────────────────── */
    .gantt-tasklist { display: flex; flex-direction: column; position: relative; width: max-content; min-width: 100%; }
    .gantt-tl-col-headers {
      display: grid; box-sizing: border-box; flex-shrink: 0; position: sticky; top: 0; z-index: 5;
      background-color: var(--gantt-header-bg); border-bottom: 1px solid var(--gantt-border);
    }
    .gantt-tl-col-header {
      position: relative; padding: 0 8px; display: flex; align-items: center; gap: 4px; overflow: hidden;
      font-weight: 600; cursor: default; user-select: none;
      border-right: 1px solid var(--gantt-border); color: var(--gantt-text);
    }
    .gantt-tl-col-header[aria-sort] { cursor: pointer; }
    .gantt-tl-rows { flex: 1; position: relative; }
    .gantt-tl-row { display: grid; box-sizing: border-box; cursor: pointer; border-bottom: 1px solid var(--gantt-border); }
    .gantt-tl-cell {
      display: flex; align-items: center; overflow: hidden; padding: 0 8px;
      border-right: 1px solid var(--gantt-border); color: var(--gantt-text);
    }
    .gantt-tl-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .gantt-tl-status-dot { flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; margin-inline-end: 6px; }
    .gantt-collapse-btn {
      flex-shrink: 0; border: none; background: transparent; cursor: pointer; font-size: 10px; width: 20px; padding: 0;
      color: var(--gantt-text-sec);
    }
    .gantt-tl-load-more { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; color: var(--gantt-text-sec); }
    .gantt-load-error { display: flex; align-items: center; gap: 8px; }
    .gantt-load-more-btn {
      padding: 3px 10px; font-size: 12px; border-radius: 4px; cursor: pointer;
      border: 1px solid var(--gantt-border); background: var(--gantt-panel-bg); color: var(--gantt-text-sec);
    }
    .gantt-load-more-btn[aria-disabled="true"] { cursor: default; }
    .gantt-col-resize { position: absolute; top: 0; right: -3px; width: 6px; height: 100%; cursor: col-resize; z-index: 2; touch-action: none; }
    .gantt-col-resize:hover { background: var(--gantt-sel-border); opacity: .6; }
    .gantt-tl-row:hover { filter: brightness(0.97); }
    .gantt-tl-row--selected { box-shadow: inset 3px 0 0 var(--gantt-sel-border); }
    .gantt-tl-row--pinned { position: absolute; left: 0; right: 0; z-index: 1; }
    .gantt-tl-row:focus-visible, .gantt-tl-col-header:focus-visible, .gantt-tl-load-more:focus-visible,
    .gantt-collapse-btn:focus-visible {
      outline: 2px solid var(--gantt-sel-border); outline-offset: -2px;
    }
    .gantt-load-more-btn:focus-visible { outline: 2px solid var(--gantt-sel-border); outline-offset: 1px; }
`;
