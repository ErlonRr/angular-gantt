/**
 * @file toolbar.css.ts
 * The toolbar: zoom buttons, zoom-level pills, "today" and the view switch.
 */

export const TOOLBAR_CSS = `
    /* ── Toolbar ────────────────────────────────────────── */
    .gantt-toolbar {
      display: flex; align-items: center; flex-wrap: wrap; gap: 10px;
      padding: 6px 10px; background: var(--gantt-header-bg); border-bottom: 1px solid var(--gantt-border);
    }
    .gantt-tb-group { display: flex; align-items: center; gap: 3px; }
    .gantt-tb-group + .gantt-tb-group { padding-left: 10px; border-left: 1px solid var(--gantt-border); }
    .gantt-tb-views { margin-left: auto; border-left: none !important; }
    .gantt-tb-btn, .gantt-tb-pill {
      font: inherit; font-size: 12px; cursor: pointer; border-radius: 5px;
      border: 1px solid var(--gantt-border); background: var(--gantt-panel-bg); color: var(--gantt-text-sec);
      padding: 3px 10px;
    }
    .gantt-tb-pill { border-color: transparent; background: transparent; padding: 3px 8px; }
    .gantt-tb-btn:hover, .gantt-tb-pill:hover { color: var(--gantt-text); border-color: var(--gantt-border); }
    .gantt-tb-btn:focus-visible, .gantt-tb-pill:focus-visible { outline: 2px solid var(--gantt-sel-border); outline-offset: 1px; }
    .gantt-tb-pill[aria-pressed="true"] { background: var(--gantt-bar); border-color: var(--gantt-bar); color: #fff; }
    .gantt-tb-today { color: var(--gantt-today); border-color: color-mix(in srgb, var(--gantt-today) 45%, transparent); }
`;
