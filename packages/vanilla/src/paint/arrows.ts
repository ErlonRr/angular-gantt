/**
 * @file arrows.ts
 * Paints a core `ArrowVisual` (dependency link) as SVG; its `paint` goes through the CSSOM. The
 * dash (`a.dash`) and the lag label's font size (`a.lagLabel.fontPx`) are the visual's. The group's
 * class is `gantt-arrow`, plus `gantt-arrow--critical` (critical path) and `gantt-arrow--selected`
 * (the link selected for deletion, Phase 11: core `selectedArrowVisual` gives its paint, width and
 * halo). The selected link's halo is `path.gantt-arrow-halo`, the group's first child (behind the
 * line), attached only while the visual has one (as Angular's).
 *
 * `createArrow` builds a link once; `patchArrow` brings it to a new visual in place (the halo and
 * the lag label are added or removed as needed). A patch with the same visual is skipped.
 */

import type { ArrowVisual } from '@gantryjs/core';
import { s } from '../dom/h';
import { setAttr, setStyleProp, setText } from '../dom/patch';

interface ArrowState {
  readonly path: SVGPathElement;
  readonly head: SVGPolygonElement;
  /** The selected link's halo (built once, attached while `a.halo`) */
  halo: SVGPathElement | null;
  lag: SVGTextElement | null;
  a: ArrowVisual | null;
}

const arrows = new WeakMap<SVGGElement, ArrowState>();

/** The group's class: `gantt-arrow`, then the `--critical` and `--selected` modifiers. */
const arrowClass = (a: ArrowVisual): string =>
  `gantt-arrow${a.critical ? ' gantt-arrow--critical' : ''}${a.selected ? ' gantt-arrow--selected' : ''}`;

/** Builds the SVG group of a dependency link. */
export function createArrow(a: ArrowVisual): SVGGElement {
  const path = s('path', { fill: 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  const head = s('polygon');
  const g = s('g', null, path, head);
  arrows.set(g, { path, head, halo: null, lag: null, a: null });
  patchArrow(g, a);
  return g;
}

/** Brings a group built by `createArrow` to `a` (other groups are left alone). */
export function patchArrow(g: SVGGElement, a: ArrowVisual): void {
  const st = arrows.get(g);
  if (!st || st.a === a) return;
  st.a = a;

  setAttr(g, 'class', arrowClass(a));
  setAttr(st.path, 'd', a.d);
  setAttr(st.path, 'stroke-width', a.width);
  setAttr(st.path, 'stroke-dasharray', a.dash);
  setStyleProp(st.path, 'stroke', a.paint);
  setAttr(st.head, 'points', a.head);
  setStyleProp(st.head, 'fill', a.paint);

  // The selected link's halo: behind the line, only while selected
  if (a.halo) {
    const halo = (st.halo ??= s('path', {
      class: 'gantt-arrow-halo',
      fill: 'none',
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    }));
    if (g.firstChild !== halo) g.insertBefore(halo, g.firstChild);
    setAttr(halo, 'd', a.d);
    setAttr(halo, 'stroke-width', a.halo.width);
    setAttr(halo, 'stroke-opacity', a.halo.opacity);
    setStyleProp(halo, 'stroke', a.halo.paint);
  } else st.halo?.remove();

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
