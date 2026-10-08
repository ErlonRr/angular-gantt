/**
 * @file bars.ts
 * Paints a core `BarVisual` (task bar, summary bar or milestone) as SVG.
 */

import type { BarVisual, GanttTheme } from '@gantry/core';
import { svgEl } from './svg';

export interface PaintBarOptions {
  theme:     Required<GanttTheme>;
  fontPx:    number;
  selected:  boolean;
  className?: string;
}

export function paintBar(v: BarVisual, opts: PaintBarOptions): SVGGElement {
  const { theme } = opts;
  const g = svgEl('g', { class: `gantt-bar gantt-bar--${v.kind}${opts.className ? ` ${opts.className}` : ''}` });

  g.appendChild(svgEl('path', {
    class: 'gantt-bar-body',
    d: v.path,
    fill: v.fill,
    stroke: opts.selected ? theme.selectionBorder : undefined,
    'stroke-width': opts.selected ? 1.5 : undefined,
  }));
  if (v.caps) g.appendChild(svgEl('path', { class: 'gantt-bar-caps', d: v.caps, fill: v.fill }));
  if (v.progress) {
    g.appendChild(svgEl('path', {
      class: 'gantt-bar-progress',
      d: v.progress.path,
      fill: v.progress.color,
      'fill-opacity': v.progress.opacity,
      'pointer-events': 'none',
    }));
  }
  if (v.baseline) {
    g.appendChild(svgEl('line', {
      class: 'gantt-bar-baseline',
      x1: v.baseline.x, y1: v.baseline.y, x2: v.baseline.x + v.baseline.width, y2: v.baseline.y,
      stroke: theme.baselineColor, 'stroke-width': 2, 'stroke-dasharray': '5 3', 'stroke-linecap': 'round',
      'pointer-events': 'none',
    }));
  }
  if (v.label) {
    const text = svgEl('text', {
      class: `gantt-bar-label${v.label.inside ? '' : ' gantt-bar-label--outside'}`,
      x: v.label.x, y: v.label.y,
      fill: v.label.color,
      'font-size': opts.fontPx,
      'text-anchor': v.label.anchor,
      'dominant-baseline': 'central',
      'pointer-events': 'none',
    });
    text.textContent = v.label.text;
    g.appendChild(text);
  }
  return g;
}
