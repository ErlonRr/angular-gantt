/**
 * @file legend.css.ts
 * The floating legend of the timeline markers.
 */

export const LEGEND_CSS = `
    /* ── Legend ─────────────────────────────────────────── */
    .gantt-legend {
      position: absolute; bottom: 12px; right: 12px; z-index: 15;
      display: flex; align-items: center; gap: 14px; padding: 6px 12px; border-radius: 8px; font-size: 11px;
      background: var(--gantt-panel-bg); border: 1px solid var(--gantt-border); color: var(--gantt-text-sec);
      box-shadow: 0 4px 16px rgba(0,0,0,0.12); pointer-events: none;
    }
    .gantt-legend-title { font-weight: 700; text-transform: uppercase; letter-spacing: .4px; font-size: 9.5px; color: var(--gantt-text-muted); }
    .gantt-legend-item { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; color: var(--gantt-text); }
    .gantt-legend-swatch { flex: none; }
`;
