/**
 * @file legend.ts
 * Legend region: the legend of the timeline markers (today, annotations, critical path,
 * baseline) from `buildLegend`, placed per core `legendPlacement` (`legend.position`, D9):
 *
 *   'bottom'  → div.gantt-legend.gantt-legend--bottom: an in-flow strip after `.gantry-main`,
 *               the wrapper's last child (the panes give it its height)
 *   'toolbar' → div.gantt-legend.gantt-legend--toolbar: the toolbar's last child (after its
 *               groups; back to 'bottom' while the toolbar is hidden)
 *   null      → detached: off (`showLegend`), nothing to explain, or the table view (D27)
 *
 *   div.gantt-legend[part=legend]
 *     span.gantt-legend-title
 *     span.gantt-legend-item  ×n   svg.gantt-legend-swatch > line | rect · span (label)
 *
 * Patched in place: the title is one persistent node and the items are keyed by
 * `LegendItem.key`, so a label, colour, option or placement change patches text and paints only
 * (the node moves, its children stay). Flushed after the toolbar region, so the toolbar it may
 * join is already in place.
 */

import { buildLegend, legendPlacement, LEGEND_SWATCH_SIZE, type LegendItem } from '@gantryjs/core';
import { computed } from '../reactive';
import { h, s } from '../dom/h';
import { reconcile } from '../dom/keyed';
import { setAttr, setStyleProp, setText, toggleClass } from '../dom/patch';
import type { Layer, LayerContext } from './context';
import { showNode } from './skeleton';
import { toolbarElement } from './toolbar';

/** An item's inner nodes. */
interface ItemParts {
  readonly swatch: SVGSVGElement;
  shape: SVGLineElement | SVGRectElement;
  readonly label: HTMLElement;
}

export function createLegendLayer(ctx: LayerContext): Layer {
  const { inputs: I, graph: G, dom } = ctx;
  const legend = dom.legend;
  const parts = new WeakMap<Element, ItemParts>();
  const title = h('span', { class: 'gantt-legend-title' });
  // The today line moves every minute; the legend only cares whether it is shown
  const todayVisible = computed(() => G.todayX() !== null);

  const createItem = (): HTMLElement => {
    const swatch = s('svg', {
      width: LEGEND_SWATCH_SIZE.width,
      height: LEGEND_SWATCH_SIZE.height,
      'aria-hidden': 'true',
    });
    const label = h('span');
    const el = h('span', { class: 'gantt-legend-item' }, swatch, label);
    parts.set(el, { swatch, shape: swatch.appendChild(s('line')), label });
    return el;
  };

  /** Swatch from the core geometry; the paint goes through the CSSOM, never into markup. */
  const updateItem = (el: HTMLElement, item: LegendItem): void => {
    const p = parts.get(el)!;
    const sw = item.swatch;
    const tag = sw.kind === 'line' ? 'line' : 'rect';
    if (p.shape.tagName !== tag) {
      p.shape.remove();
      p.shape = p.swatch.appendChild(s(tag));
    }
    setAttr(p.swatch, 'class', `gantt-legend-swatch gantt-legend-swatch--${item.shape}`);
    if (sw.kind === 'line') {
      setAttr(p.shape, 'x1', sw.x);
      setAttr(p.shape, 'y1', sw.y1);
      setAttr(p.shape, 'x2', sw.x);
      setAttr(p.shape, 'y2', sw.y2);
      setAttr(p.shape, 'stroke-width', sw.strokeWidth);
      setAttr(p.shape, 'stroke-dasharray', sw.dash);
    } else {
      setAttr(p.shape, 'x', sw.x);
      setAttr(p.shape, 'y', sw.y);
      setAttr(p.shape, 'width', sw.width);
      setAttr(p.shape, 'height', sw.height);
      setAttr(p.shape, 'rx', sw.rx);
    }
    setStyleProp(p.shape, sw.kind === 'line' ? 'stroke' : 'fill', item.paint);
    setText(p.label, item.label);
  };

  return {
    paint() {
      const cfg = G.config();
      const { labels } = G.i18n();
      const items = buildLegend({
        showToday: cfg.showToday,
        todayVisible: todayVisible(),
        annotations: I.annotationsIn(),
        labels,
        // No critical path in the resource view (its rows have no links)
        criticalPath: cfg.criticalPath && cfg.rows !== 'resources',
        baseline: cfg.baseline,
      });
      const toolbar = toolbarElement(dom);
      // Same switch as the toolbar region's: the toolbar is attached when this one runs
      const toolbarShown = !!toolbar && I.showToolbar() && cfg.toolbar !== false;
      const placement = legendPlacement({
        showLegend: I.showLegend(),
        position: cfg.legend.position,
        view: I.viewOverride(),
        items,
        toolbarShown,
      });
      if (placement === null) {
        // Off, nothing to explain, or the table view (no timeline): detached (D27)
        legend.remove();
        return;
      }

      // Built hidden (detached until now): shown whenever attached
      setAttr(legend, 'hidden', false);
      toggleClass(legend, 'gantt-legend--bottom', placement === 'bottom');
      toggleClass(legend, 'gantt-legend--toolbar', placement === 'toolbar');
      setText(title, labels.legend);
      if (title.parentNode !== legend) legend.prepend(title);
      reconcile(legend, items, item => item.key, createItem, updateItem);
      if (placement === 'toolbar') showNode(toolbar!, legend, true);
      else showNode(dom.wrapper, legend, true);
    },
  };
}
