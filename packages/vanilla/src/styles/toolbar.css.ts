/**
 * @file toolbar.css.ts
 * The toolbar (layers/toolbar.ts): zoom out / in / fit icon buttons, the zoom-level radios, the
 * today button (icon and text) and the view radios (icons). Every control is at least 32 px
 * square (WCAG 2.5.8) with 16 px icons; a checked radio takes the bar colours. The icons take
 * the control's text colour: their fill and stroke are set here, never as SVG attributes.
 */

export const TOOLBAR_CSS = `
    /* ── Toolbar ────────────────────────────────────────── */
    .gantt-toolbar {
      display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px;
      padding: 6px 10px; background: var(--gantt-header-bg); border-bottom: 1px solid var(--gantt-border);
    }
    .gantt-tb-group { display: flex; align-items: center; gap: 2px; }
    .gantt-tb-group + .gantt-tb-group { padding-left: 10px; border-left: 1px solid var(--gantt-border); }
    .gantt-tb-views { margin-left: auto; border-left: none !important; }
    .gantt-tb-btn, .gantt-tb-pill {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      box-sizing: border-box; min-width: 32px; min-height: 32px; margin: 0; padding: 0 7px;
      font: inherit; font-size: 12px; line-height: 1; white-space: nowrap; cursor: pointer; border-radius: 6px;
      border: 1px solid var(--gantt-border); background: var(--gantt-panel-bg); color: var(--gantt-text-sec);
    }
    .gantt-tb-pill { border-color: transparent; background: transparent; }
    .gantt-tb-btn:hover, .gantt-tb-pill:hover { color: var(--gantt-text); border-color: var(--gantt-border); }
    .gantt-tb-btn:focus-visible, .gantt-tb-pill:focus-visible { outline: 2px solid var(--gantt-focus-ring); outline-offset: 1px; }
    .gantt-tb-pill[aria-checked="true"] { background: var(--gantt-bar); border-color: var(--gantt-bar); color: var(--gantt-bar-text-on-bar); }
    .gantt-tb-today { color: var(--gantt-today); border-color: color-mix(in srgb, var(--gantt-today) 45%, transparent); }
    .gantt-tb-icon { flex: none; display: block; fill: none; stroke: currentColor; }
    .gantt-tb-label { display: block; }
`;
