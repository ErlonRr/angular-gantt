/**
 * @file forced-colors.css.ts
 * Windows High Contrast and other forced colours (`@media (forced-colors: active)`, D25): system
 * colours for bars, labels, lines, rings and the chrome. Last in the cascade. Every colour here
 * is a system colour with `!important`: the paints are inline CSSOM styles, which would win over
 * a normal rule. Nothing outside the media block, so the normal look never changes.
 *
 * What the browser does by itself (Chromium) and why the rules below exist:
 * - SVG keeps its paints: the UA sheet gives svg `forced-color-adjust: preserve-parent-color`, so
 *   every fill and stroke of the canvas, the legend swatches and the bar overlay needs a rule.
 * - HTML colours, backgrounds, borders and outlines are forced (CanvasText on Canvas, ButtonText
 *   on ButtonFace), keeping only the alpha of a background. So a tint (current header cell, today
 *   chip, header bands, skeleton) turns into transparent Canvas, outlines into CanvasText, and
 *   transparent borders into CanvasText (the today pointer: no transparent sides, so it opts out
 *   with forced-color-adjust none and sets its own system colours).
 * - Gradients and shadows are dropped: the splitter line and its focus line (gradients) are drawn
 *   again with a pseudo-element, the selected task-list row (inset shadow) gets Highlight.
 * - Text gets a Canvas readability backplate, which would hide HighlightText on Highlight: what
 *   has a Highlight background (current header cell, today chip, selected row, checked radio)
 *   opts out with forced-color-adjust none and sets every colour of its subtree itself.
 *
 * The mapping (shared with Angular, which mirrors these rules in its component styles):
 * bar body ButtonFace with a 1.5 px ButtonText stroke; rolled-up child segments ButtonFace with a
 * 1 px ButtonText stroke (each child outlined); progress ButtonText at 0.45 (the inside
 * label stays readable over it); summary caps ButtonText; selected bar Highlight 2.5 px;
 * critical bar dashed 4 2 at 2 px; labels ButtonText inside, CanvasText outside; arrows
 * CanvasText; today Highlight; annotations, grid lines and the baseline GrayText; non-working
 * bands GrayText at 0.15 (intensive hours Highlight at 0.15); current header cell and selected
 * row Highlight / HighlightText; every focus ring and the overlay ring Highlight (HighlightText
 * inside a selected row); checked radio Highlight / HighlightText; tooltip, readout chip and
 * state box Canvas / CanvasText with a CanvasText border; skeleton GrayText. The row hover tint
 * is hidden (the timeline rect and the task-list row's background image): forced colours keep
 * the row backgrounds plain.
 *
 * Editing (Phase 11, plan 3d): the progress grip as the resize grip (Canvas, Highlight stroke);
 * link connectors Canvas with a Highlight stroke, the target connector filled Highlight; the link
 * preview Highlight (stroke and its solid head); the selected arrow Highlight (its halo too, at
 * its own opacity); the invalid states
 * (connector, preview, cell editor) a 2 px dashed CanvasText; the cell editor Field / FieldText
 * with a FieldText border (set even inside the selected row, which opts out of forcing), its
 * error message Canvas / CanvasText with a CanvasText border; an aria-disabled toolbar button
 * (Undo / Redo with nothing to do) GrayText. The cell editor's rules come after the focus rings,
 * so an invalid editor keeps its dashed outline while it has focus.
 *
 * Export (Phase 12): the Export button and its menu are the More button and menu again
 * (`.gantt-tb-btn`, `.gantt-tb-menu`, `.gantt-tb-menu-item`); either menu button, while its menu
 * is open (`aria-expanded="true"`), takes Highlight as the pressed panel toggle does.
 */

export const FORCED_COLORS_CSS = `
    @media (forced-colors: active) {
      /* ── Canvas: rows, bands, grid, annotations, today ── */
      .gantt-rows > rect { fill: Canvas !important; }
      .gantt-row-hover { display: none; }
      .gantt-band { fill: GrayText !important; fill-opacity: 0.15; }
      .gantt-band--intensive { fill: Highlight !important; }
      .gantry-canvas-container pattern line { stroke: GrayText !important; }
      .gantt-grid line { stroke: GrayText !important; }
      .gantt-annotations rect { fill: GrayText !important; }
      .gantt-annotations line { stroke: GrayText !important; }
      .gantt-annotation-labels text { fill: CanvasText !important; }
      .gantt-today { stroke: Highlight !important; }

      /* ── Dependency arrows ── */
      .gantt-arrow path { stroke: CanvasText !important; }
      .gantt-arrow polygon, .gantt-arrow text { fill: CanvasText !important; }
      .gantt-arrow--selected path { stroke: Highlight !important; }
      .gantt-arrow--selected polygon { fill: Highlight !important; }

      /* ── Bars: body, caps, progress, baseline, labels; critical dashed, selected Highlight ── */
      .gantt-bar-body { fill: ButtonFace !important; stroke: ButtonText !important; stroke-width: 1.5px; }
      .gantt-bar-segment { fill: ButtonFace !important; stroke: ButtonText !important; stroke-width: 1px; }
      .gantt-bar-caps { fill: ButtonText !important; }
      .gantt-bar-progress { fill: ButtonText !important; fill-opacity: 0.45; }
      .gantt-bar-baseline { stroke: GrayText !important; }
      .gantt-bar-label { fill: ButtonText !important; }
      .gantt-bar-label--outside { fill: CanvasText !important; }
      .gantt-bar--critical > .gantt-bar-body { stroke-width: 2px; stroke-dasharray: 4 2; }
      .gantt-bar[aria-selected="true"] > .gantt-bar-body { stroke: Highlight !important; stroke-width: 2.5px; }

      /* ── Bar overlay (focus ring, grips, link connectors), drag ghost, link preview ── */
      .gantt-bar-focus-ring { stroke: Highlight !important; }
      .gantt-bar-grip, .gantt-progress-grip { fill: Canvas !important; stroke: Highlight !important; }
      .gantt-link-connector { fill: Canvas !important; stroke: Highlight !important; }
      .gantt-link-connector--target { fill: Highlight !important; }
      .gantt-link-connector--invalid { stroke: CanvasText !important; stroke-width: 2px; stroke-dasharray: 4 2; }
      .gantt-drag-preview { fill: Highlight !important; stroke: Highlight !important; }
      .gantt-link-preview { fill: Highlight !important; stroke: Highlight !important; }
      .gantt-link-preview--invalid {
        fill: CanvasText !important; stroke: CanvasText !important; stroke-width: 2px; stroke-dasharray: 4 2;
      }

      /* ── Header: current period, bands, marker lane, today pointer ── */
      .g-cell--current { forced-color-adjust: none; background-color: Highlight !important; border-color: CanvasText !important; }
      .g-cell--current, .g-cell--current .g-cell-label { color: HighlightText !important; }
      .g-band { background-color: GrayText !important; opacity: 0.15; }
      .g-band--intensive { background-color: Highlight !important; }
      .g-marker--today::before { background-color: Highlight !important; }
      .g-marker--annotation::before { background-color: GrayText !important; }
      .g-marker--today .g-marker-label {
        forced-color-adjust: none; background-color: Highlight !important; color: HighlightText !important;
      }
      .g-today-pointer {
        forced-color-adjust: none; color: Highlight !important;
        border-color: transparent !important; border-top-color: Highlight !important;
      }

      /* ── Task list: selected row, status dots, disabled load-more ── */
      .gantt-tl-row--hover { background-image: none; }
      .gantt-tl-row--selected { forced-color-adjust: none; background-color: Highlight !important; box-shadow: none; }
      .gantt-tl-row--selected, .gantt-tl-row--selected * { color: HighlightText !important; border-color: CanvasText !important; }
      .gantt-tl-status-dot { background-color: CanvasText !important; }
      .gantt-tl-row--selected .gantt-tl-status-dot { background-color: HighlightText !important; }
      .gantt-col-resize:hover { background-color: Highlight !important; }
      .gantt-load-more-btn[aria-disabled="true"] { color: GrayText !important; border-color: GrayText !important; }

      /* ── Toolbar: the checked radio and menu item, the pressed panel toggle, the open menu button
         (More, Export), a disabled Undo / Redo, the More and Export menus ── */
      .gantt-tb-pill[aria-checked="true"], .gantt-tb-menu-item[aria-checked="true"] {
        forced-color-adjust: none;
        background-color: Highlight !important; border-color: Highlight !important; color: HighlightText !important;
      }
      .gantt-tb-btn[aria-pressed="true"] { color: Highlight !important; border-color: Highlight !important; }
      .gantt-tb-more[aria-expanded="true"], .gantt-tb-export[aria-expanded="true"] {
        color: Highlight !important; border-color: Highlight !important;
      }
      .gantt-tb-btn[aria-disabled="true"] { color: GrayText !important; border-color: GrayText !important; }
      .gantt-tb-menu { background-color: Canvas !important; color: CanvasText !important; border-color: CanvasText !important; }

      /* ── Splitter: its line and its focus / hover line (the gradients are dropped) ── */
      .gantry-splitter-handle::before {
        content: ''; position: absolute; top: 0; bottom: 0; left: 2px; width: 1px;
        background-color: CanvasText !important;
      }
      .gantry-splitter:hover > .gantry-splitter-handle::before,
      .gantry-main.is-resizing .gantry-splitter-handle::before,
      .gantry-splitter-handle:focus-visible::before { left: 1px; width: 3px; background-color: Highlight !important; }

      /* ── Focus rings ── */
      .gantry-canvas-viewport:focus-visible, .gantry-splitter-toggle:focus-visible,
      .gantt-tb-btn:focus-visible, .gantt-tb-pill:focus-visible, .gantt-tb-menu-item:focus-visible,
      .gantt-tl-row:focus-visible, .gantt-tl-cell:focus-visible, .gantt-tl-col-header:focus-visible,
      .gantt-tl-load-more:focus-visible, .gantt-collapse-btn:focus-visible,
      .gantt-load-more-btn:focus-visible, .gantt-state-retry:focus-visible,
      .gantt-tl-editor:focus-visible { outline-color: Highlight !important; }
      .gantt-tl-row--selected:focus-visible, .gantt-tl-row--selected .gantt-tl-cell:focus-visible,
      .gantt-tl-row--selected .gantt-collapse-btn:focus-visible { outline-color: HighlightText !important; }

      /* ── Cell editor: the field (also in the selected row), its invalid outline, its error ── */
      .gantt-tl-editor { background-color: Field !important; color: FieldText !important; border-color: FieldText !important; }
      .gantt-tl-editor[aria-invalid="true"] { outline: 2px dashed CanvasText !important; }
      .gantt-tl-editor-error {
        background-color: Canvas !important; color: CanvasText !important; border-color: CanvasText !important;
      }

      /* ── Legend swatches: as the canvas draws them ── */
      .gantt-legend-swatch--line > line { stroke: Highlight !important; }
      .gantt-legend-swatch--dashed > line { stroke: GrayText !important; }
      .gantt-legend-swatch--bar > rect {
        fill: ButtonFace !important; stroke: ButtonText !important; stroke-width: 1.5px; stroke-dasharray: 4 2;
      }
      .gantt-legend-swatch--strip > rect { fill: GrayText !important; }

      /* ── Tooltip, readout chip, state box, skeleton ── */
      .gantt-tooltip, .gantt-drag-readout, .gantt-state-box {
        background-color: Canvas !important; color: CanvasText !important; border-color: CanvasText !important;
      }
      .gantt-state-box { border-style: solid; border-width: 1px; border-radius: 6px; padding: 16px 24px; }
      .gantt-tooltip-label { opacity: 1; }
      .gantt-tooltip-track { background-color: Canvas !important; outline: 1px solid CanvasText !important; }
      .gantt-tooltip-fill { background-color: CanvasText !important; }
      .gantt-skeleton-name, .gantt-skeleton-bar { background-color: GrayText !important; }
      .gantt-skeleton-row { border-bottom-color: GrayText !important; }
    }
`;
