// ─────────────────────────────────────────────────────────────
//  gantry · styles/print.css.ts
//
//  The chart under `@media print` (Gantry 2 phase 12, D17), the Web
//  Component's `styles/print.css.ts`: what the page's own print (Ctrl+P)
//  shows of a mounted chart — no toolbar (its menus included), splitter,
//  load-more footer, live regions, tooltip, drag readout, bar overlay
//  (focus ring, grips, link connectors), row hover, drag ghost or link
//  preview; exact colours (the backgrounds, bars and bands print as
//  shown); no scrollbars (the panes clip instead). Only the mounted rows
//  print (the chart is virtualised): `print()` prints the whole plan
//  instead (core `exportChartPages`).
//
//  `PRINT_CSS` holds GantryComponent's part: its host, the splitter, the
//  live regions and the panes, the nodes of its own template.
//  GantryComponent lists it after its own styles (`styles: [..., PRINT_CSS]`):
//  the same specificity as the rules it overrides, so the later rule wins.
//  Every other node is hidden by the component that paints it, in an
//  `@media print` block of its own styles right before its forced-colours
//  block (emulated encapsulation: a rule here can't reach them):
//
//    Web Component selector       Angular
//    .gantry-toolbar-container    GanttToolbarComponent          :host
//    .gantt-tl-load-more          GanttLoadMoreComponent         :host
//    .gantt-tooltip               GanttTooltipComponent          :host
//    .gantt-drag-readout          GanttDragReadoutComponent      :host
//    .gantt-bar-overlay           GanttBarOverlayComponent       :host
//    .gantt-row-hover             GanttCanvasComponent           .gantt-row-hover
//    .gantt-link-preview          GanttCanvasComponent           .gantt-link-preview
//    .gantt-drag-preview          GanttDragPreviewComponent      .gantt-drag-preview
//    :host, .gantry-wrapper       GantryComponent (here)         :host
//
//  No `!important`, as in the Web Component: each rule comes after its
//  component's own rules for the node with the same specificity, no
//  binding sets `display` or `overflow` inline, and no other component
//  styles these nodes. A page rule still wins, as it does on screen.
// ─────────────────────────────────────────────────────────────

export const PRINT_CSS = `
  @media print {
    :host {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .gantry-splitter,
    .gantt-sr-live,
    .gantt-sr-alert {
      display: none;
    }
    .gantry-panel,
    .gantry-canvas-viewport {
      overflow: hidden;
      scrollbar-width: none;
    }
    .gantry-panel::-webkit-scrollbar,
    .gantry-canvas-viewport::-webkit-scrollbar {
      display: none;
    }
  }
`;
