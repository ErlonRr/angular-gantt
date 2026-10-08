/**
 * @file arrows.ts
 * Paints a core `ArrowVisual` (dependency link) as SVG.
 */

import type { ArrowVisual } from '@gantry/core';
import { svgEl } from './svg';

export function paintArrow(a: ArrowVisual, fontPx: number): SVGGElement {
  const g = svgEl('g', { class: `gantt-arrow${a.critical ? ' gantt-arrow--critical' : ''}` });
  g.appendChild(svgEl('path', {
    d: a.d, fill: 'none', stroke: a.color, 'stroke-width': a.width,
    'stroke-dasharray': a.dashed ? '5 3' : undefined,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  }));
  g.appendChild(svgEl('polygon', { points: a.head, fill: a.color }));
  if (a.lagLabel) {
    const t = svgEl('text', {
      x: a.lagLabel.x, y: a.lagLabel.y, fill: a.color, 'font-size': fontPx - 2,
      'dominant-baseline': 'central', opacity: 0.85,
    });
    t.textContent = a.lagLabel.text;
    g.appendChild(t);
  }
  return g;
}
