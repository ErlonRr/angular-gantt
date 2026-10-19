/**
 * @file toolbar.css.ts
 * The toolbar (layers/toolbar.ts): the panel toggle, zoom out / in / fit icon buttons, the
 * zoom-level radios, the today button (icon and text), the view radios (icons), the More button
 * and its menu. Every control is at least the density's control size square (the private
 * --gantry-control-size on the wrapper: 28 / 32 / 36 px, 32 px by default, WCAG 2.5.8) with 16 px
 * icons; a checked radio or menu item takes the bar colours, the pressed panel toggle a tint of
 * them. The icons take the control's text colour: their fill and stroke are set here, never as
 * SVG attributes.
 *
 * The More menu hangs under the toolbar at its end (the toolbar is its containing block), above
 * the panes' sticky headers, splitter and state box (z-index 14). The Export menu (Phase 12,
 * toolbar.export) is the same menu: it hangs at the same place. The Export button sits at the
 * far end like More, right after the views while they show; it never shows with More (core moves
 * the export group into More first).
 *
 * Undo and Redo (the history group, Phase 11) are plain icon buttons; while there is nothing to
 * undo / redo they are aria-disabled: muted, with no hover change and the default cursor (still
 * focusable, so they keep their focus ring).
 */

export const TOOLBAR_CSS = `
    /* ── Toolbar ────────────────────────────────────────── */
    .gantt-toolbar {
      position: relative; display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px;
      padding: 6px 10px; background: var(--gantt-header-bg); border-bottom: 1px solid var(--gantt-border);
    }
    .gantt-tb-group { display: flex; align-items: center; gap: 2px; }
    .gantt-tb-group + .gantt-tb-group { padding-left: 10px; border-left: 1px solid var(--gantt-border); }
    .gantt-tb-views { margin-left: auto; border-left: none !important; }
    /* More: at the far end, right after the views while they show */
    .gantt-tb-more-group { margin-left: auto; }
    .gantt-tb-group + .gantt-tb-more-group { border-left: none; }
    .gantt-tb-views + .gantt-tb-more-group { margin-left: 0; border-left: 1px solid var(--gantt-border); }
    .gantt-tb-more-group ~ .gantt-legend--toolbar { margin-left: 0; }
    /* Export: at the far end too, right after the views while they show (it moves into More first) */
    .gantt-tb-export-group { margin-left: auto; }
    .gantt-tb-group + .gantt-tb-export-group { border-left: none; }
    .gantt-tb-views + .gantt-tb-export-group { margin-left: 0; border-left: 1px solid var(--gantt-border); }
    .gantt-tb-export-group ~ .gantt-legend--toolbar { margin-left: 0; }
    .gantt-tb-btn, .gantt-tb-pill {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      box-sizing: border-box; min-width: var(--gantry-control-size, 32px); min-height: var(--gantry-control-size, 32px); margin: 0; padding: 0 7px;
      font: inherit; font-size: 12px; line-height: 1; white-space: nowrap; cursor: pointer; border-radius: 6px;
      border: 1px solid var(--gantt-border); background: var(--gantt-panel-bg); color: var(--gantt-text-sec);
    }
    .gantt-tb-pill { border-color: transparent; background: transparent; }
    .gantt-tb-btn:hover, .gantt-tb-pill:hover { color: var(--gantt-text); border-color: var(--gantt-border); }
    .gantt-tb-btn[aria-disabled="true"], .gantt-tb-btn[aria-disabled="true"]:hover {
      color: var(--gantt-text-muted); border-color: var(--gantt-border); cursor: default;
    }
    .gantt-tb-btn:focus-visible, .gantt-tb-pill:focus-visible { outline: 2px solid var(--gantt-focus-ring); outline-offset: 1px; }
    .gantt-tb-pill[aria-checked="true"] { background: var(--gantt-bar); border-color: var(--gantt-bar); color: var(--gantt-bar-text-on-bar); }
    .gantt-tb-btn[aria-pressed="true"] { background: color-mix(in srgb, var(--gantt-bar) 12%, var(--gantt-panel-bg)); border-color: var(--gantt-bar); color: var(--gantt-bar); }
    .gantt-tb-today { color: var(--gantt-today); border-color: color-mix(in srgb, var(--gantt-today) 45%, transparent); }
    .gantt-tb-icon { flex: none; display: block; fill: none; stroke: currentColor; }
    .gantt-tb-label { display: block; }

    /* ── More and Export menus (WAI-ARIA menu buttons) ──── */
    .gantt-tb-menu {
      position: absolute; top: 100%; inset-inline-end: 8px; z-index: 14;
      display: flex; flex-direction: column; box-sizing: border-box; min-width: 160px; max-height: 70vh; overflow-y: auto;
      margin-top: 4px; padding: 4px; border-radius: 8px;
      border: 1px solid var(--gantt-border); background: var(--gantt-panel-bg); color: var(--gantt-text);
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    }
    .gantt-tb-menu-group { display: flex; flex-direction: column; gap: 2px; }
    .gantt-tb-menu-group + .gantt-tb-menu-group { margin-top: 4px; padding-top: 4px; border-top: 1px solid var(--gantt-border); }
    .gantt-tb-menu-item {
      display: flex; align-items: center; gap: 8px; box-sizing: border-box; width: 100%;
      min-height: var(--gantry-control-size, 32px); margin: 0; padding: 0 10px;
      font: inherit; font-size: 12px; line-height: 1; white-space: nowrap; text-align: start; cursor: pointer; border-radius: 6px;
      border: 1px solid transparent; background: transparent; color: var(--gantt-text);
    }
    .gantt-tb-menu-item:hover { background: var(--gantt-header-bg); }
    .gantt-tb-menu-item:focus-visible { outline: 2px solid var(--gantt-focus-ring); outline-offset: -2px; }
    .gantt-tb-menu-item[aria-checked="true"] { background: var(--gantt-bar); border-color: var(--gantt-bar); color: var(--gantt-bar-text-on-bar); }
`;
