/**
 * @file host.ts
 * Host region: the view switch on the wrapper, the panel width, which pane is inert, the
 * splitter's resizable flag, position and range (`aria-valuenow` / `-valuemin` / `-valuemax`),
 * the collapse toggle and its vertical position (below the header). Everything comes from the
 * graph; the widths it needs were measured by the ResizeObserver (`mainW`).
 *
 * It also hands the header height to the vertical window (`headerH`): the sticky header is
 * sized by the model, so the model's height is exact, and it is known before the first layout.
 * Host runs first in the flush, so the windowed regions read the new value in the same flush.
 */

import { SPLITTER_TOGGLE_OFFSET } from '@gantryjs/core';
import { setAttr, setStyleProp, setText } from '../dom/patch';
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

      panes();
      dom.panel.inert = view === 'chart';
      // Hidden behind the table view: out of the tab order and the accessibility tree
      dom.viewport.inert = view === 'table';
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
      // Inherited by the toggle (`top: var(--gantry-toggle-top)`); on the wrapper, so a string
      // `style` on the host can't wipe it
      setStyleProp(dom.wrapper, '--gantry-toggle-top', `${headerHeight + SPLITTER_TOGGLE_OFFSET}px`);
    },
  };
}
