/**
 * @file splitter.css.ts
 * The splitter between the task list and the timeline: its box, the focusable separator that
 * covers it (keyboard focus shows as the highlighted line, in --gantt-focus-ring like every focus
 * ring; hover and resizing in --gantt-sel-border) and the collapse toggle above it.
 */

export const SPLITTER_CSS = `
    /* ── Splitter with collapse toggle ──────────────────── */
    .gantry-splitter {
      flex: 0 0 6px;
      position: relative;
      cursor: col-resize;
      background: linear-gradient(to right, transparent 2px, var(--gantt-panel-border) 2px, var(--gantt-panel-border) 3px, transparent 3px);
      z-index: 12;
    }
    .gantry-splitter:hover, .gantry-main.is-resizing .gantry-splitter {
      background: linear-gradient(to right, transparent 1px, var(--gantt-sel-border) 1px, var(--gantt-sel-border) 4px, transparent 4px);
    }
    .gantry-splitter-handle:focus-visible {
      background: linear-gradient(to right, transparent 1px, var(--gantt-focus-ring) 1px, var(--gantt-focus-ring) 4px, transparent 4px);
    }
    .gantry-splitter-handle { position: absolute; inset: 0; outline: none; }
    .gantry-splitter[data-resizable="false"] { cursor: default; }
    .gantry-splitter-toggle {
      position: absolute;
      top: var(--gantry-toggle-top, 50%);
      left: 50%;
      transform: translate(-50%, -50%);
      width: 18px;
      height: 32px;
      padding: 0;
      border: 1px solid var(--gantt-border);
      border-radius: 9px;
      background: var(--gantt-panel-bg);
      color: var(--gantt-text-sec);
      font-size: 15px;
      font-weight: 600;
      line-height: 1;
      cursor: pointer;
      box-shadow: 0 1px 4px rgba(0,0,0,.12);
      opacity: .85;
    }
    .gantry-splitter-toggle:hover { opacity: 1; color: var(--gantt-text); border-color: var(--gantt-sel-border); }
    .gantry-splitter-toggle:focus-visible { opacity: 1; outline: 2px solid var(--gantt-focus-ring); outline-offset: 1px; }
    .gantry-splitter-toggle[hidden] { display: none; }
`;
