/**
 * @file legend.ts
 * Legend region: the floating legend of the timeline markers (today, annotations, critical path,
 * baseline) from `buildLegend`, patched in place: the title is one persistent node and the items
 * are keyed by `LegendItem.key`, so a label, colour or option change patches text and paints only.
 * Hidden in the table view and when there is nothing to explain; while hidden it holds no
 * children (they come back on the next show).
 *
 *   div.gantt-legend
 *     span.gantt-legend-title
 *     span.gantt-legend-item  ×n   svg.gantt-legend-swatch > line | rect · span (label)
 */

import { buildLegend, isLegendVisible, LEGEND_SWATCH_SIZE, type LegendItem } from '@gantryjs/core';
import { computed } from '../reactive';
import { h, s } from '../dom/h';
import { reconcile } from '../dom/keyed';
import { setAttr, setStyleProp, setText } from '../dom/patch';
import type { Layer, LayerContext } from './context';

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
        criticalPath: cfg.criticalPath,
        baseline: cfg.baseline,
      });
      // The legend explains timeline markers: nothing to explain in the table view
      const visible = isLegendVisible(I.showLegend(), I.viewOverride(), items);
      setAttr(legend, 'hidden', !visible);
      if (visible) {
        setText(title, labels.legend);
        if (title.parentNode !== legend) legend.prepend(title);
      } else title.remove();
      reconcile(legend, visible ? items : [], item => item.key, createItem, updateItem);
    },
  };
}
