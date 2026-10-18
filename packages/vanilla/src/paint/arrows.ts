/**
 * @file arrows.ts
 * Paints a core `ArrowVisual` (dependency link) as SVG; its `paint` goes through the CSSOM. The
 * dash (`a.dash`) and the lag label's font size (`a.lagLabel.fontPx`) are the visual's.
 *
 * `createArrow` builds a link once; `patchArrow` brings it to a new visual in place (the lag
 * label is added or removed as needed). A patch with the same visual is skipped.
 */

import type { ArrowVisual } from '@gantryjs/core';
import { s } from '../dom/h';
import { setAttr, setStyleProp, setText } from '../dom/patch';

interface ArrowState {
  readonly path: SVGPathElement;
  readonly head: SVGPolygonElement;
  lag: SVGTextElement | null;
  a: ArrowVisual | null;
}

const arrows = new WeakMap<SVGGElement, ArrowState>();

/** Builds the SVG group of a dependency link. */
export function createArrow(a: ArrowVisual): SVGGElement {
  const path = s('path', { fill: 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  const head = s('polygon');
  const g = s('g', null, path, head);
  arrows.set(g, { path, head, lag: null, a: null });
  patchArrow(g, a);
  return g;
}

/** Brings a group built by `createArrow` to `a` (other groups are left alone). */
export function patchArrow(g: SVGGElement, a: ArrowVisual): void {
  const st = arrows.get(g);
  if (!st || st.a === a) return;
  st.a = a;

  setAttr(g, 'class', a.critical ? 'gantt-arrow gantt-arrow--critical' : 'gantt-arrow');
  setAttr(st.path, 'd', a.d);
  setAttr(st.path, 'stroke-width', a.width);
  setAttr(st.path, 'stroke-dasharray', a.dash);
  setStyleProp(st.path, 'stroke', a.paint);
  setAttr(st.head, 'points', a.head);
  setStyleProp(st.head, 'fill', a.paint);

  if (!a.lagLabel) {
    st.lag?.remove();
    st.lag = null;
    return;
  }
  const t = (st.lag ??= g.appendChild(s('text', { 'dominant-baseline': 'central', opacity: 0.85 })));
  setAttr(t, 'x', a.lagLabel.x);
  setAttr(t, 'y', a.lagLabel.y);
  setAttr(t, 'font-size', a.lagLabel.fontPx);
  setStyleProp(t, 'fill', a.paint);
  setText(t, a.lagLabel.text);
}
