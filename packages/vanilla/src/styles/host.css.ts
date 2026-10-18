/**
 * @file host.css.ts
 * Host, wrapper and pane layout: the panel and timeline viewport boxes, the view switch, the
 * scrollbars, the timeline viewport's focus ring and the screen-reader live regions.
 * Concatenated with the other region sheets into the shared base stylesheet (`styles/base.ts`).
 *
 * The host is not focusable itself (the shadow root delegates focus to the internal tab stops)
 * and carries no theme attribute: the dark theme is the `:state(dark)` custom state, which needs
 * no rule here because every colour comes from the theme variables.
 */

export const HOST_CSS = `
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      font-family: var(--gantt-font, system-ui, -apple-system, sans-serif);
      font-size: var(--gantt-font-size, 13px);
      color: var(--gantt-text, #1E293B);
      background-color: var(--gantt-bg, #FFFFFF);
    }
    :host([hidden]) { display: none; }

    .gantry-wrapper { display: flex; flex-direction: column; width: 100%; height: 100%; background: var(--gantt-bg); overflow: hidden; }
    .gantry-main { display: flex; flex: 1; overflow: hidden; min-height: 0; position: relative; }

    /* ── Task list panel ─────────────────────────────────── */
    .gantry-panel {
      flex: 0 0 auto;
      overflow-x: auto;
      overflow-y: hidden;
      background: var(--gantt-panel-bg);
      transition: width .25s ease;
      scrollbar-width: thin;
      scrollbar-color: var(--gantt-scrollbar-thumb) var(--gantt-scrollbar-track);
    }
    .gantry-main.is-resizing .gantry-panel,
    .gantry-main.is-resizing .gantry-canvas-viewport { transition: none; }

    /* ── Timeline ───────────────────────────────────────── */
    .gantry-canvas-viewport {
      flex: 1;
      overflow: auto;
      position: relative;
      min-width: 0;
      transition: opacity .25s ease;
      scrollbar-width: thin;
      scrollbar-color: var(--gantt-scrollbar-thumb) var(--gantt-scrollbar-track);
      outline: none;
    }
    /* Keyboard focus (a tab stop: arrow keys scroll it); inset, so the panes' clipping keeps it whole */
    .gantry-canvas-viewport:focus-visible { outline: 2px solid var(--gantt-sel-border); outline-offset: -2px; }
    .gantry-canvas-header-sticky { position: sticky; top: 0; z-index: 10; background: var(--gantt-header-bg); width: max-content; }

    .gantry-wrapper[data-view="table"] .gantry-canvas-viewport { opacity: 0; pointer-events: none; }
    .gantry-wrapper[data-view="table"] .gantry-splitter { display: none; }
    .gantry-wrapper[data-view="chart"] .gantry-panel { overflow: hidden; }

    .gantry-panel::-webkit-scrollbar, .gantry-canvas-viewport::-webkit-scrollbar { width: 6px; height: 6px; }
    .gantry-panel::-webkit-scrollbar-track, .gantry-canvas-viewport::-webkit-scrollbar-track { background: var(--gantt-scrollbar-track); }
    .gantry-panel::-webkit-scrollbar-thumb, .gantry-canvas-viewport::-webkit-scrollbar-thumb { background: var(--gantt-scrollbar-thumb); border-radius: 3px; }

    /* Live regions: read by screen readers, never shown */
    .gantt-sr-alert, .gantt-sr-live {
      position: absolute; width: 1px; height: 1px; overflow: hidden;
      clip-path: inset(50%); white-space: nowrap;
    }

    @media (prefers-reduced-motion: reduce) {
      .gantry-panel, .gantry-canvas-viewport { transition: none; }
    }
`;
