/**
 * @file legend.css.ts
 * The legend of the timeline markers (layers/legend.ts): an in-flow strip under the panes
 * (legend.position 'bottom', the default) or the end of the toolbar ('toolbar'). It takes room
 * in the layout instead of floating over the chart, so it never hides a bar.
 */

export const LEGEND_CSS = `
    /* ── Legend ─────────────────────────────────────────── */
    .gantt-legend {
      display: flex; align-items: center; flex-wrap: wrap; gap: 4px 14px;
      font-size: 11px; line-height: 16px; color: var(--gantt-text-sec);
    }
    /* The strip after the panes: the wrapper's last row */
    .gantt-legend--bottom {
      flex: none; padding: 6px 12px;
      background: var(--gantt-header-bg); border-top: 1px solid var(--gantt-border);
    }
    /* The toolbar's last child: at the far end, after the view switch when there is one */
    .gantt-legend--toolbar { margin-left: auto; }
    .gantt-tb-views ~ .gantt-legend--toolbar { margin-left: 0; }
    .gantt-tb-group ~ .gantt-legend--toolbar { padding-left: 10px; border-left: 1px solid var(--gantt-border); }
    .gantt-legend-title { font-weight: 700; text-transform: uppercase; letter-spacing: .4px; font-size: 9.5px; color: var(--gantt-text-muted); }
    .gantt-legend-item { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; color: var(--gantt-text); }
    .gantt-legend-swatch { flex: none; }
`;
