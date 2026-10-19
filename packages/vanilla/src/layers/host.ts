/**
 * @file host.ts
 * Host region: the view switch on the wrapper, the panel width, which pane is inert, the
 * splitter's resizable flag, position and range (`aria-valuenow` / `-valuemin` / `-valuemax`),
 * the collapse toggle and its vertical position (below the header). Everything comes from the
 * graph; the widths it needs were measured by the ResizeObserver (`mainW`).
 *
 * Inert: the panel in the chart view, the timeline viewport in the table view, and while the chart
 * is not ready (`graph.chartState`) everything the state box covers — the timeline viewport and
 * the splitter here, the task-list rows in the task-list region — so no hidden control stays in
 * the tab order or the accessibility tree. The task-list header row stays above the box and
 * reachable.
 *
 * It also hands the header height (tiers + marker lane, `graph.headerHeight`) to the vertical
 * window (`headerH`): the sticky header is sized by the model, so the model's height is exact, and
 * it is known before the first layout. Host runs first in the flush, so the windowed regions read
 * the new value in the same flush. The same height is `--gantry-header-h` on the wrapper (the
 * timeline header box is at least that tall, lane included: `styles/host.css.ts`) and the panes'
 * scroll padding: what the browser scrolls into view stays clear of the sticky headers, and a bar
 * lands with its whole focus ring in the timeline (core `timelineScrollPadding`).
 *
 * The host region is busy (`aria-busy`, `ctx.setBusy`) while `graph.chartState.busy`.
 *
 * The wrapper also carries the root attributes both bindings share (§3c): `data-view`,
 * `data-density` (`options.density`), `data-narrow` (present while the chart is narrower than
 * `responsive.breakpoint`, `inputs.narrow`) and the private `--gantry-control-size` (the density's
 * toolbar control size, read by the toolbar's CSS). The read-only `--gantt-row-height` /
 * `--gantt-bar-height` are on the host instead, in the theme sheet (`graph/layout.ts` `layoutCss`).
 */

import { SPLITTER_TOGGLE_OFFSET, timelineScrollPadding } from '@gantryjs/core';
import { setAttr, setStyleProp, setText, toggleClass } from '../dom/patch';
import type { Layer, LayerContext } from './context';

export interface HostLayer extends Layer {
  /**
   * Applies what decides the panes' widths (view, panel width). The element calls it when it
   * connects, before measuring the timeline viewport, so the first render sees the viewport
   * width beside the panel; the region repeats it (a no-op through the patch cache).
   */
  panes(): void;
}

export function createHostLayer(ctx: LayerContext): HostLayer {
  const { inputs: I, graph: G, dom } = ctx;
  // Pane widths don't animate until a frame after the first render: options assigned after the
  // element connected (the React and Svelte wrappers) would slide the panel from its default width,
  // and the first scroll (`initialScroll`) would read the viewport mid-slide. As Angular's.
  let settleFrame = 0;
  let settled = false;
  const settle = (): void => {
    if (settled || settleFrame) return;
    const win = dom.main.ownerDocument.defaultView;
    const done = (): void => {
      settleFrame = 0;
      settled = true;
      toggleClass(dom.main, 'is-settling', false);
    };
    if (win?.requestAnimationFrame) settleFrame = win.requestAnimationFrame(done);
    else done();
  };
  const panes = (): void => {
    setAttr(dom.wrapper, 'data-view', I.viewOverride());
    setStyleProp(dom.panel, 'width', `${G.panelPx()}px`);
  };
  return {
    panes,
    paint() {
      const cfg = G.config();
      const { labels } = G.i18n();
      const view = I.viewOverride();
      const headerHeight = G.headerHeight();
      I.headerH.set(headerHeight);
      const state = G.chartState();
      ctx.setBusy(state.busy);
      // The state box covers the body (from the header down): what is under it can't be reached
      const covered = state.kind !== 'ready';

      panes();
      dom.panel.inert = view === 'chart';
      // Hidden behind the table view or the state box: out of the tab order and the accessibility tree
      dom.viewport.inert = view === 'table' || covered;
      dom.splitter.inert = covered;
      setAttr(dom.splitter, 'data-resizable', String(cfg.panel.resizable && view === 'split'));
      // A focusable separator states its position and range: the panel width in px (as Angular's splitter)
      const value = G.splitter();
      setAttr(dom.splitterHandle, 'aria-valuenow', value.now);
      setAttr(dom.splitterHandle, 'aria-valuemin', value.min);
      setAttr(dom.splitterHandle, 'aria-valuemax', value.max);

      const collapsed = view === 'chart';
      const label = collapsed ? labels.showPanel : labels.hidePanel;
      dom.toggle.hidden = !cfg.panel.collapsible;
      setText(dom.toggle, collapsed ? '›' : '‹');
      setAttr(dom.toggle, 'title', label);
      setAttr(dom.toggle, 'aria-label', label);
      setAttr(dom.toggle, 'aria-expanded', String(!collapsed));
      setAttr(dom.wrapper, 'data-density', cfg.density);
      setAttr(dom.wrapper, 'data-narrow', I.narrow());
      setStyleProp(dom.wrapper, '--gantry-control-size', `${cfg.controlSize}px`);
      // Inherited by the toggle (`top: var(--gantry-toggle-top)`) and the timeline header box
      // (`min-height: var(--gantry-header-h)`); on the wrapper, so a string `style` on the host
      // can't wipe them
      setStyleProp(dom.wrapper, '--gantry-toggle-top', `${headerHeight + SPLITTER_TOGGLE_OFFSET}px`);
      setStyleProp(dom.wrapper, '--gantry-header-h', `${headerHeight}px`);
      // Keyboard focus and `scrollIntoView` keep what they reveal below the sticky headers, a bar
      // with its whole focus ring (2.4.11)
      const pad = timelineScrollPadding(headerHeight);
      setStyleProp(dom.viewport, 'scroll-padding-top', `${pad.top}px`);
      setStyleProp(dom.viewport, 'scroll-padding-right', `${pad.right}px`);
      setStyleProp(dom.viewport, 'scroll-padding-bottom', `${pad.bottom}px`);
      setStyleProp(dom.viewport, 'scroll-padding-left', `${pad.left}px`);
      setStyleProp(dom.panel, 'scroll-padding-top', `${headerHeight}px`);
      settle();
    },
    disconnect() {
      // A reconnect settles again (its options may arrive after it, too)
      if (settleFrame) dom.main.ownerDocument.defaultView?.cancelAnimationFrame(settleFrame);
      settleFrame = 0;
      settled = false;
      toggleClass(dom.main, 'is-settling', true);
    },
  };
}
