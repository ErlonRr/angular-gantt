/**
 * @file tasklist.css.ts
 * Task list (treegrid): layout and chrome of the header row, rows, cells, collapse and
 * load-more buttons and column resize handles. What varies per column or per row (grid template,
 * heights, alignment, indent, row and status paints, the icon colour of a task with `barColor`)
 * is set on the element through the CSSOM by `layers/tasklist.ts`.
 *
 * Text colours (the same rules as Angular's task list): header labels and group names use the
 * primary text, cell texts and leaf names the secondary text, sort and task icons the muted text
 * (an active sort icon the primary text). The collapse toggle and the leaf indent are 24 px wide
 * (WCAG 2.5.8 target size); the column resize handle lies inside its header cell, which clips.
 *
 * Pinned rows: a focused row kept mounted outside the virtual window is positioned absolutely
 * at its row offset (`top` is set through the CSSOM).
 *
 * Focus (`--gantt-focus-ring`): rows, cells, header cells, collapse toggles and the footer show an
 * inset ring (cells and the panel clip anything outside them), the load-more button an outer one;
 * keyboard focus only (`:focus-visible`).
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
    .gantt-tl-cell .gantt-tl-ellipsis { color: var(--gantt-text-sec); }
    .gantt-tl-row--group .gantt-tl-name > .gantt-tl-ellipsis { color: var(--gantt-text); font-weight: 600; }
    .gantt-tl-sort-icon { font-size: 9px; color: var(--gantt-text-muted); }
    .gantt-tl-sort-icon--active { color: var(--gantt-text); }
    .gantt-tl-name { display: flex; align-items: center; gap: 4px; overflow: hidden; width: 100%; }
    .gantt-tl-indent { flex-shrink: 0; width: 24px; }
    .gantt-tl-icon { flex-shrink: 0; font-size: 10px; color: var(--gantt-text-muted); }
    .gantt-tl-status-dot { flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; margin-inline-end: 6px; }
    .gantt-collapse-btn {
      box-sizing: border-box; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
      min-width: 24px; min-height: 24px; padding: 0; border: none; border-radius: 4px; background: transparent;
      font-size: 10px; line-height: 1; cursor: pointer; touch-action: manipulation; color: var(--gantt-text-sec);
    }
    .gantt-collapse-btn:hover { opacity: .75; }
    .gantt-tl-load-more { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; color: var(--gantt-text-sec); }
    .gantt-load-error { display: flex; align-items: center; gap: 8px; }
    .gantt-load-more-btn {
      padding: 3px 10px; font-size: 12px; border-radius: 4px; cursor: pointer;
      border: 1px solid var(--gantt-border); background: var(--gantt-panel-bg); color: var(--gantt-text-sec);
    }
    .gantt-load-more-btn[aria-disabled="true"] { cursor: default; }
    .gantt-col-resize { position: absolute; top: 0; right: 0; width: 6px; height: 100%; cursor: col-resize; z-index: 2; touch-action: none; }
    .gantt-col-resize:hover { background: var(--gantt-sel-border); opacity: .6; }
    .gantt-tl-row:hover { filter: brightness(0.97); }
    .gantt-tl-row--selected { box-shadow: inset 3px 0 0 var(--gantt-sel-border); }
    .gantt-tl-row--pinned { position: absolute; left: 0; right: 0; z-index: 1; }
    .gantt-tl-row:focus-visible, .gantt-tl-cell:focus-visible, .gantt-tl-col-header:focus-visible,
    .gantt-tl-load-more:focus-visible, .gantt-collapse-btn:focus-visible {
      outline: 2px solid var(--gantt-focus-ring); outline-offset: -2px;
    }
    .gantt-load-more-btn:focus-visible { outline: 2px solid var(--gantt-focus-ring); outline-offset: 1px; }
`;
