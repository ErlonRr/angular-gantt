/**
 * @file skeleton.ts
 * The element's persistent DOM: the shadow tree (panes, legend, live regions), built node by node
 * with `h()` (no markup parsing: Trusted Types safe), its stylesheets (the shared base sheet,
 * see `styles/base.ts`), and one timeline `<svg>` whose layer groups never change place. Region
 * effects only patch or refill these nodes; nothing re-creates the panes or the SVG.
 *
 * Shadow tree:
 *
 *   div.gantry-wrapper[part=wrapper][data-view][data-density][data-narrow]   (host region)
 *     div.gantry-toolbar-container[part=toolbar]
 *     div.gantry-main
 *       div.gantry-panel[part=panel] > div.gantry-tasklist-container (+ the load-more footer, tasklist region)
 *       div.gantry-splitter[part=splitter]
 *         div.gantry-splitter-handle[role=separator][tabindex=0]
 *         button.gantry-splitter-toggle
 *       div.gantry-canvas-viewport[part=timeline][role=group][tabindex=0]
 *         div.gantry-canvas-header-sticky > div.gantry-header-container
 *         div.gantry-canvas-container > svg
 *         div.gantt-drag-readout[aria-hidden]   `readout`: attached while a drag readout shows
 *       div.gantt-state[part=state]             `stateBox`: attached while the chart is not ready
 *   div.gantt-legend[part=legend]               `legend`: attached by the legend region (see below)
 *   div.gantt-sr-alert[role=alert]
 *   div.gantt-sr-live[role=status][aria-live=polite]
 *
 * New optional nodes (D27) are built here, detached, and attached by their region only while they
 * show (`showNode`): the readout chip (readout region), the state box (states region), the bar
 * overlay (bars region) and the legend (legend region, per core `legendPlacement`: the
 * wrapper's last child after `.gantry-main`, or the toolbar's last child).
 *
 * Tab stops, in order: the toolbar (one roving stop), the task list (one stop, see
 * `layers/tasklist.ts`), the splitter's separator, its collapse toggle, the timeline's tab-stop
 * bar (the viewport only while no bar is mounted).
 * The separator is a sibling of the toggle, not its parent: a separator's children are
 * presentational, so a button inside it would be hidden from assistive technologies.
 *
 * SVG children, in painting order (the order and the anchor classes are part of the paint
 * snapshots and of the e2e selector contract):
 *
 *   defs                      hatch pattern `gantt-hatch-<uid>` — attached while `style: 'hatch'`
 *   g.gantt-rows              row backgrounds
 *   rect.gantt-row-hover      the hovered row's tint — attached by the hover region while a row is hovered
 *   g.gantt-bands             non-working time (persistent; band rects keyed by x, windowed horizontally)
 *   g.gantt-grid              minor lines · <!--rows--> row separators · <!--major--> period delimiters
 *   g.gantt-annotations
 *   line.gantt-today          attached while the today line is shown
 *   g.gantt-arrows
 *   g.gantt-bars-layer        the bars: `role=option` children of the svg's `role=listbox`
 *   g.gantt-bar-overlay       attached while it shows a focus ring or grips (D4)
 *   g.gantt-annotation-labels
 *   rect.gantt-drag-preview   attached while a bar is dragged
 *   path.gantt-link-preview   attached last while a link session shows a preview (Phase 11)
 *
 * The today line, the row hover, the bar overlay, the drag ghost and the link preview are single
 * persistent nodes and stay detached while hidden: the paint snapshots and `.gantt-drag-preview`
 * (count 0 after a drop) rely on it.
 *
 * The svg is the bars' listbox (D3): `aria-orientation=vertical` here, its name
 * (`labels.ariaBars`) and `aria-multiselectable` from the bars region.
 */

import { HATCH_PATTERN, PAINTS } from '@gantryjs/core';
import { h, s } from '../dom/h';
import { setStyleProp } from '../dom/patch';
import { applySheet } from '../dom/sheet';
import { BASE_CSS, getBaseSheet } from '../styles/base';

export interface Skeleton {
  // ── Panes ───────────────────────────────────────────────
  readonly wrapper: HTMLElement;
  readonly toolbarContainer: HTMLElement;
  readonly main: HTMLElement;
  readonly panel: HTMLElement;
  /** The task list's root (it also gets the `gantt-tasklist` class) */
  readonly tasklistContainer: HTMLElement;
  /** The splitter's box: drag and keyboard listeners, the resizable flag */
  readonly splitter: HTMLElement;
  /** The splitter's focusable `role=separator` (covers the box) */
  readonly splitterHandle: HTMLElement;
  readonly toggle: HTMLButtonElement;
  /** Timeline viewport: scrolls in both axes; a tab stop (`role=group`, named by `labels.ariaChart`) */
  readonly viewport: HTMLElement;
  /** Sticky header box inside the viewport (measured for `headerH`) */
  readonly headerSticky: HTMLElement;
  readonly headerContainer: HTMLElement;
  /** Box of the timeline SVG (sized `totalWidth × totalHeight`) */
  readonly canvasContainer: HTMLElement;
  /** The drag readout chip (`div.gantt-drag-readout`): detached; the readout region attaches it after `canvasContainer` */
  readonly readout: HTMLElement;
  /** The chart-state box (`div.gantt-state[part=state]`): detached; the states region attaches it in `main` */
  readonly stateBox: HTMLElement;
  /** The legend (`div.gantt-legend[part=legend]`): detached; the legend region attaches it */
  readonly legend: HTMLElement;
  /** Assertive live region: announces a failed data-source page */
  readonly srAlert: HTMLElement;
  /** Polite live region: selection and load-state announcements (`engine/announce.ts`) */
  readonly srLive: HTMLElement;

  // ── Timeline SVG (see the file comment for the order) ──
  readonly svg: SVGSVGElement;
  /** Holds the hatch pattern; attached before `rows` only while the hatch style is used */
  readonly defs: SVGDefsElement;
  /** Id of the hatch pattern (unique per element) */
  readonly hatchId: string;
  readonly rows: SVGGElement;
  /**
   * The hovered row's tint (`rect.gantt-row-hover`, fill from the stylesheet): detached; the hover
   * region attaches it right after `rows` (before `bands`) while a row is hovered
   */
  readonly rowHover: SVGRectElement;
  /** Non-working bands (persistent group; the static layer reconciles its rects by x) */
  readonly bands: SVGGElement;
  readonly grid: SVGGElement;
  /** Grid marker: minor lines sit before it, the row separators after it */
  readonly gridRowLines: Comment;
  /** Grid marker: the row separators sit before it, the major lines (period delimiters) after it */
  readonly gridMajorLines: Comment;
  readonly annotations: SVGGElement;
  /** The today line (attached before `arrows` while shown) */
  readonly today: SVGLineElement;
  readonly arrows: SVGGElement;
  readonly bars: SVGGElement;
  /** Focus ring and grips of one bar (`g.gantt-bar-overlay`): detached; attached between `bars` and `annotationLabels` while it shows */
  readonly barOverlay: SVGGElement;
  readonly annotationLabels: SVGGElement;
  /** The drag ghost (appended last while a bar is dragged) */
  readonly ghost: SVGRectElement;
  /**
   * The link being drawn (`path.gantt-link-preview[pointer-events=none]`, Phase 11): detached; the
   * svg's last child while a link session shows a preview (`inputs.link.preview`)
   */
  readonly linkPreview: SVGPathElement;
}

let uid = 0;

/**
 * Builds the shadow tree into `shadow` and adopts the base stylesheet (call once, in the
 * constructor: only the shadow root is touched, never the host).
 */
export function buildSkeleton(shadow: ShadowRoot): Skeleton {
  applySheet(shadow, getBaseSheet(shadow.ownerDocument), BASE_CSS);

  const hatchId = `gantt-hatch-${++uid}`;
  // The hatch geometry is core's (`HATCH_PATTERN`), shared with Angular
  const hatch = HATCH_PATTERN;
  const hatchLine = s('line', {
    x1: 0,
    y1: 0,
    x2: 0,
    y2: hatch.size,
    'stroke-width': hatch.strokeWidth,
    'stroke-opacity': hatch.strokeOpacity,
  });
  setStyleProp(hatchLine, 'stroke', PAINTS.hatch);
  const defs = s(
    'defs',
    null,
    s(
      'pattern',
      {
        id: hatchId,
        width: hatch.size,
        height: hatch.size,
        patternUnits: 'userSpaceOnUse',
        patternTransform: `rotate(${hatch.rotate})`,
      },
      hatchLine,
    ),
  );

  const decorative = { 'aria-hidden': 'true', 'pointer-events': 'none' } as const;
  const rows = s('g', { class: 'gantt-rows', 'aria-hidden': 'true' });
  // Geometry from the hover region; the fill is the stylesheet's `var(--gantt-row-hover-bg)`
  const rowHover = s('rect', { class: 'gantt-row-hover', x: 0, ...decorative });
  const bands = s('g', { class: 'gantt-bands', ...decorative });
  const gridRowLines = document.createComment('rows');
  const gridMajorLines = document.createComment('major');
  const grid = s('g', { class: 'gantt-grid', ...decorative }, gridRowLines, gridMajorLines);
  const annotations = s('g', { class: 'gantt-annotations', ...decorative });
  const today = s('line', { class: 'gantt-today', 'stroke-width': 2, 'pointer-events': 'none' });
  setStyleProp(today, 'stroke', PAINTS.today);
  const arrows = s('g', { class: 'gantt-arrows', ...decorative });
  const bars = s('g', { class: 'gantt-bars-layer' });
  const barOverlay = s('g', { class: 'gantt-bar-overlay', ...decorative });
  const annotationLabels = s('g', { class: 'gantt-annotation-labels', ...decorative });
  // Geometry, opacity, dash and paint come from the drag ghost's visual (overlay layer)
  const ghost = s('rect', { class: 'gantt-drag-preview', 'pointer-events': 'none' });
  // Its `d` and the `--invalid` modifier come from the link session's preview (core `linkPreviewPath`)
  const linkPreview = s('path', { class: 'gantt-link-preview', 'pointer-events': 'none' });
  const svg = s(
    'svg',
    { role: 'listbox', 'aria-orientation': 'vertical' },
    rows,
    bands,
    grid,
    annotations,
    arrows,
    bars,
    annotationLabels,
  );

  const toolbarContainer = h('div', { class: 'gantry-toolbar-container', attrs: { part: 'toolbar' } });
  const tasklistContainer = h('div', { class: 'gantry-tasklist-container' });
  const panel = h('div', { class: 'gantry-panel', attrs: { part: 'panel' } }, tasklistContainer);
  const toggle = h('button', { class: 'gantry-splitter-toggle', attrs: { type: 'button' } });
  const splitterHandle = h('div', {
    class: 'gantry-splitter-handle',
    attrs: { role: 'separator', 'aria-orientation': 'vertical', tabindex: 0 },
  });
  const splitter = h('div', { class: 'gantry-splitter', attrs: { part: 'splitter' } }, splitterHandle, toggle);
  const headerContainer = h('div', { class: 'gantry-header-container' });
  const headerSticky = h('div', { class: 'gantry-canvas-header-sticky' }, headerContainer);
  const canvasContainer = h('div', { class: 'gantry-canvas-container' }, svg);
  const viewport = h(
    'div',
    { class: 'gantry-canvas-viewport', attrs: { part: 'timeline', role: 'group', tabindex: 0 } },
    headerSticky,
    canvasContainer,
  );
  // `is-settling` (no pane width transition) until a frame after the first render (`layers/host.ts`)
  const main = h('div', { class: 'gantry-main is-settling' }, panel, splitter, viewport);
  const wrapper = h(
    'div',
    { class: 'gantry-wrapper', attrs: { part: 'wrapper', 'data-view': 'split' } },
    toolbarContainer,
    main,
  );
  const readout = h('div', { class: 'gantt-drag-readout', attrs: { 'aria-hidden': 'true' } });
  const stateBox = h('div', { class: 'gantt-state', attrs: { part: 'state' } });
  const legend = h('div', { class: 'gantt-legend', attrs: { part: 'legend' } });
  const srAlert = h('div', { class: 'gantt-sr-alert', attrs: { role: 'alert' } });
  const srLive = h('div', {
    class: 'gantt-sr-live',
    attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
  });
  shadow.append(wrapper, srAlert, srLive);

  return {
    wrapper,
    toolbarContainer,
    main,
    panel,
    tasklistContainer,
    splitter,
    splitterHandle,
    toggle,
    viewport,
    headerSticky,
    headerContainer,
    canvasContainer,
    readout,
    stateBox,
    legend,
    srAlert,
    srLive,
    svg,
    defs,
    hatchId,
    rows,
    rowHover,
    bands,
    grid,
    gridRowLines,
    gridMajorLines,
    annotations,
    today,
    arrows,
    bars,
    barOverlay,
    annotationLabels,
    ghost,
    linkPreview,
  };
}

/**
 * Keeps a persistent optional node in its slot: inserted into `parent` before `before` (`null` =
 * at the end) while `on`, detached otherwise. Moves nothing when it is already in place.
 */
export function showNode(parent: Node, node: ChildNode, on: boolean, before: Node | null = null): void {
  if (!on) {
    if (node.parentNode) node.remove();
    return;
  }
  if (node.parentNode !== parent || node.nextSibling !== before) parent.insertBefore(node, before);
}
