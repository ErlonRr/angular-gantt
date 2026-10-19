/**
 * @file print.css.ts
 * The element under `@media print` (Phase 12, D17): what the page's own print (Ctrl+P) shows of
 * a mounted chart — no toolbar (its menus included), splitter, load-more footer, live regions,
 * tooltip, drag readout, bar overlay (focus ring, grips, link connectors), row hover, drag ghost
 * or link preview; exact colours (the backgrounds, bars and bands print as shown); no scrollbars
 * (the panes clip instead). Only the mounted rows print (the chart is virtualised): `print()`
 * prints the whole plan instead (core `exportChartPages`). Last before the forced-colours sheet
 * in `styles/base.ts`; Angular paints the same rules (its `styles/print.css.ts`).
 *
 * No `!important`: these rules come after every region's rules in the one base sheet, with at
 * least their specificity, and no paint sets `display` or `overflow` inline. A page rule on a
 * part (`gantry-element::part(toolbar)`) still wins, as it does on screen.
 */

export const PRINT_CSS = `
    @media print {
      :host, .gantry-wrapper { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .gantry-toolbar-container, .gantry-splitter, .gantt-tl-load-more, .gantt-sr-live, .gantt-sr-alert,
      .gantt-tooltip, .gantt-drag-readout, .gantt-bar-overlay, .gantt-row-hover, .gantt-drag-preview,
      .gantt-link-preview { display: none; }
      .gantry-panel, .gantry-canvas-viewport { overflow: hidden; scrollbar-width: none; }
      .gantry-panel::-webkit-scrollbar, .gantry-canvas-viewport::-webkit-scrollbar { display: none; }
    }
`;
