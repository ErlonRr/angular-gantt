// The `renderBar` of the case: an epic (`barType: 'epic'`) is its body, its progress as a thick
// underline, its label and a badge with the initial of its risk, placed by `epicBarLayout`; `null`
// keeps the built-in bar for every other task. Built with `createElementNS` and painted through the
// CSSOM (paints may be `var(--gantt-*)` tokens); the `part` names let page CSS reach the nodes
// inside the chart's shadow root (forced colours: custom-bars.css).
import { PAINTS, themeMetrics, type GanttBarRenderer } from '@gantryjs/vanilla';
import { CUSTOM_BAR_TYPE, epicBarLayout } from 'demo-kit/gallery';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** An SVG node with its `part` names, attributes and paints (CSS properties). */
function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  part: string,
  attrs: Record<string, string | number>,
  paints: Partial<Record<'fill' | 'stroke', string>>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  node.setAttribute('part', part);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  for (const [name, value] of Object.entries(paints)) node.style.setProperty(name, value);
  return node;
}

export const renderEpicBar: GanttBarRenderer = ctx => {
  if (ctx.row.task.barType !== CUSTOM_BAR_TYPE) return null;
  const { visual: v, isSelected } = ctx;
  const { underline: u, badge, labelDx, color, initial, description } = epicBarLayout(ctx);
  const line = { x: u.x, y: u.y, height: u.height, rx: u.rx };
  const text = { 'dominant-baseline': 'central', 'pointer-events': 'none' };

  // The chart gives this node its role, name and focus ring; the risk is read after the name
  const bar = document.createElementNS(SVG_NS, 'g');
  bar.setAttribute('aria-description', description);
  const bodyPart = isSelected ? 'epic-body epic-selected' : 'epic-body';
  const body = svg('path', bodyPart, { d: v.path, 'stroke-width': 1.5 }, { fill: v.paint.body });
  if (isSelected) body.style.setProperty('stroke', PAINTS.selectionStroke);
  bar.append(
    body,
    svg('rect', 'epic-track', { ...line, width: u.width, opacity: 0.3 }, { fill: v.paint.body }),
    svg('rect', 'epic-progress', { ...line, width: u.done }, { fill: v.paint.body }),
  );

  if (v.label) {
    const { x, y, anchor, inside } = v.label;
    const attrs = { ...text, x, y, dx: labelDx, 'text-anchor': anchor, 'font-size': themeMetrics(ctx.theme).fontPx };
    const label = svg('text', inside ? 'epic-label' : 'epic-label epic-label-outside', attrs, { fill: v.paint.label });
    label.textContent = v.label.text;
    bar.append(label);
  }
  if (badge) {
    const { cx, cy, r } = badge;
    const attrs = { ...text, x: cx, y: cy, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 700 };
    const letter = svg('text', 'epic-risk-text', attrs, { fill: '#ffffff' });
    letter.textContent = initial;
    bar.append(
      svg('circle', 'epic-risk', { cx, cy, r, 'stroke-width': 1.5 }, { fill: color, stroke: '#ffffff' }),
      letter,
    );
  }
  return bar;
};
