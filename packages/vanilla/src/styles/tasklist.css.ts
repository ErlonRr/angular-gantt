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
 * Row hover (D4): the row under a mouse or pen pointer in either pane (`gantt-tl-row--hover`, set
 * by the task-list region from `hoveredRowId`) gets the `--gantt-row-hover-bg` tint as a background
 * image, so its background colour (selection, row colour, zebra) stays visible under it; the
 * timeline draws the same tint (`rect.gantt-row-hover`).
 *
 * The load-more footer (the treegrid's sibling) is Angular's `gantt-load-more` look: a top border, 8 /
 * 12 px padding, the panel background; its button is full width and the toolbar's control size tall
 * (`--gantry-control-size`: 28 / 32 / 36 px by density, WCAG 2.5.8), in the chart font.
 *
 * Focus (`--gantt-focus-ring`): rows, cells, header cells, collapse toggles and the footer show an
 * inset ring (cells and the panel clip anything outside them), the load-more button an outer one;
 * keyboard focus only (`:focus-visible`).
 *
 * Cell editor (Phase 11, the same rules as Angular's task list): the editing row is raised above
 * its neighbours (z-index 3) and its editing cell lets its error overflow below it. The editor
 * (an input, a select, or a custom node with the class added) fills the cell height minus a 3 px
 * margin, in the chart font, with the background colour; its focus ring is the focus-ring colour
 * and an invalid value (aria-invalid) is outlined in the overdue status colour. The message sits
 * under the cell (inset-block-start 100%), in the overdue colour on the background. No new theme
 * key; the forced-colors sheet restyles all three.
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
    /* Load-more footer: the same box and button as Angular's gantt-load-more */
    .gantt-tl-load-more {
      padding: 8px 12px; border-top: 1px solid var(--gantt-border); background-color: var(--gantt-panel-bg);
      font-family: var(--gantt-font); font-size: var(--gantt-font-size); color: var(--gantt-text-sec);
    }
    .gantt-load-error { display: flex; align-items: center; justify-content: center; gap: 8px; }
    .gantt-load-done { padding: 4px 0; text-align: center; font-size: 11px; color: var(--gantt-text-muted); }
    .gantt-load-more-btn {
      box-sizing: border-box; min-height: var(--gantry-control-size, 32px); margin: 0; padding: 0 12px;
      border: 1px solid var(--gantt-border); border-radius: 4px; background-color: transparent; color: var(--gantt-text-sec);
      font-family: var(--gantt-font); font-size: var(--gantt-font-size); cursor: pointer;
    }
    .gantt-tl-load-more > .gantt-load-more-btn { display: block; width: 100%; }
    .gantt-load-more-btn:hover { background-color: var(--gantt-row-bg-alt); }
    .gantt-load-more-btn[aria-disabled="true"] { cursor: default; background-color: transparent; }
    .gantt-col-resize { position: absolute; top: 0; right: 0; width: 6px; height: 100%; cursor: col-resize; z-index: 2; touch-action: none; }
    .gantt-col-resize:hover { background: var(--gantt-sel-border); opacity: .6; }
    .gantt-tl-row--hover { background-image: linear-gradient(var(--gantt-row-hover-bg), var(--gantt-row-hover-bg)); }
    .gantt-tl-row--selected { box-shadow: inset 3px 0 0 var(--gantt-sel-border); }
    .gantt-tl-row--pinned { position: absolute; left: 0; right: 0; z-index: 1; }
    /* Cell editor: the raised row, the editing cell, the field and its error */
    .gantt-tl-row--editing { z-index: 3; overflow: visible; }
    .gantt-tl-row--editing:not(.gantt-tl-row--pinned) { position: relative; }
    .gantt-tl-cell--editing { position: relative; overflow: visible; padding: 0 4px; cursor: auto; }
    .gantt-tl-editor {
      box-sizing: border-box; flex: 1 1 auto; align-self: stretch; width: 100%; min-width: 0; margin: 3px 0;
      padding: 0 6px; border: 1px solid var(--gantt-border); border-radius: 4px;
      background-color: var(--gantt-bg); color: var(--gantt-text);
      font-family: var(--gantt-font); font-size: var(--gantt-font-size); cursor: text;
    }
    .gantt-tl-editor:focus-visible { outline: 2px solid var(--gantt-focus-ring); outline-offset: -1px; }
    .gantt-tl-editor[aria-invalid="true"] {
      border-color: var(--gantt-status-overdue);
      outline-width: 2px; outline-style: solid; outline-color: var(--gantt-status-overdue); outline-offset: -1px;
    }
    .gantt-tl-editor-error {
      position: absolute; inset-block-start: 100%; inset-inline-start: 0; z-index: 1;
      box-sizing: border-box; min-width: 100%; max-width: 320px; width: max-content; padding: 4px 8px;
      border: 1px solid var(--gantt-status-overdue); border-radius: 0 0 4px 4px;
      background-color: var(--gantt-bg); color: var(--gantt-status-overdue);
      font-family: var(--gantt-font); font-size: 12px; line-height: 1.4; white-space: normal; cursor: default;
    }
    .gantt-tl-row:focus-visible, .gantt-tl-cell:focus-visible, .gantt-tl-col-header:focus-visible,
    .gantt-tl-load-more:focus-visible, .gantt-collapse-btn:focus-visible {
      outline: 2px solid var(--gantt-focus-ring); outline-offset: -2px;
    }
    .gantt-load-more-btn:focus-visible { outline: 2px solid var(--gantt-focus-ring); outline-offset: 1px; }
`;
