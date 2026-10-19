/**
 * @file tooltip.css.ts
 * The task tooltip popover (`layers/tooltip.ts`). Its chrome reads the `--gantt-tooltip-*`
 * variables; the layer only writes `translate` (position by its bar, core `placeTooltip`),
 * `--gantt-tt-progress` (0–100) and the fill's `background-color` (the model's progress paint)
 * through the CSSOM. It takes the pointer (`pointer-events: auto`), so the pointer can move onto
 * it and rest there (WCAG 1.4.13). `.gantt-tooltip--critical` marks a task on the critical path
 * (a hook, no rule of its own); `.gantt-tooltip-custom` holds `options.tooltip.render`'s content.
 */

export const TOOLTIP_CSS = `
    /* ── Tooltip (popover, placed by its bar with translate) ── */
    .gantt-tooltip {
      position: fixed; inset: 0 auto auto 0; margin: 0; z-index: 9999; pointer-events: auto;
      padding: 8px 12px; border-radius: 6px; border: 1px solid var(--gantt-tooltip-bdr);
      background: var(--gantt-tooltip-bg); color: var(--gantt-tooltip-txt);
      font-family: var(--gantt-font); font-size: 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.12); max-width: 280px; min-width: 160px;
    }
    .gantt-tooltip[hidden] { display: none; }
    .gantt-tooltip-title {
      font-weight: 600; font-size: 13px; margin-bottom: 6px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .gantt-tooltip-rows, .gantt-tooltip-rows dd { margin: 0; }
    .gantt-tooltip-row { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 2px; }
    .gantt-tooltip-label { opacity: 0.75; }
    .gantt-tooltip-row--progress { flex-wrap: wrap; row-gap: 3px; margin: 6px 0 0; }
    .gantt-tooltip-track {
      flex: 0 0 100%; height: 3px; overflow: hidden;
      background: rgba(127,127,127,0.25); border-radius: 2px;
    }
    .gantt-tooltip-fill {
      height: 100%; border-radius: 2px;
      inline-size: calc(var(--gantt-tt-progress, 0) * 1%);
    }
    .gantt-tooltip-custom { overflow-wrap: anywhere; }
`;
