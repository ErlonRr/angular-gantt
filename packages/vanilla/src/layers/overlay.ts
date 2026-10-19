/**
 * @file overlay.ts
 * Overlay region: the annotations (regions and lines under the bars, labels above them while the
 * marker lane is off), the today line and the drag ghost.
 *
 * - Annotations are core's `computeAnnotationVisuals` over the mounted window, keyed by index and
 *   patched; they are revisited only when they, the timeline, the window, the font size or the
 *   marker lane change, so a drag move costs nothing here. While the marker lane shows
 *   (`graph.laneHeight` > 0, D12) their labels are in the header's lane, not over the bars.
 * - The today line (`line.gantt-today`, before `g.gantt-arrows`) and the ghost
 *   (`rect.gantt-drag-preview`, last in the SVG) are single persistent nodes, attached only while
 *   shown. The ghost is patched in O(1) from `computeDragGhostVisual` (`graph.ghostVisual`); the
 *   drag readout chip (`layers/readout.ts`) shows the move.
 */

import { computeAnnotationVisuals, type AnnotationVisual } from '@gantryjs/core';
import { s } from '../dom/h';
import { reconcile } from '../dom/keyed';
import { setAttr, setStyleProp, setText } from '../dom/patch';
import type { Layer, LayerContext } from './context';
import { showNode } from './skeleton';

/** One annotation shape: the shaded region (`annotation.x2` set) or the dashed line at `x1`. */
interface Mark {
  readonly key: string;
  readonly kind: 'region' | 'line';
  readonly v: AnnotationVisual;
}

/** An annotation drawn with its label in the canvas (the marker lane is off). */
type Labelled = AnnotationVisual & { readonly label: NonNullable<AnnotationVisual['label']> };

const same = (a: readonly unknown[] | undefined, b: readonly unknown[]) =>
  a?.length === b.length && a.every((v, i) => Object.is(v, b[i]));

export function createOverlayLayer(ctx: LayerContext): Layer {
  const { inputs: I, graph: G, dom } = ctx;
  let painted = false;
  let annotationsFor: readonly unknown[] | undefined;

  // The ghost's opacity covers fill and stroke (core's look): no separate fill opacity
  setAttr(dom.ghost, 'fill-opacity', null);

  return {
    paint() {
      // The table view hides the timeline: paint it once, then leave it until the view changes
      if (I.viewOverride() === 'table' && painted) return;
      painted = true;
      const tl = G.timeline();
      const { top, bottom } = G.windowSpan();
      const annotations = I.annotationsIn();
      const fontPx = G.metrics().fontPx;
      const lane = G.laneHeight() > 0;

      // Annotations: regions and lines under the bars, labels on top of them (lane off)
      const deps = [annotations, tl, top, bottom, fontPx, lane];
      if (!same(annotationsFor, deps)) {
        annotationsFor = deps;
        const visuals = computeAnnotationVisuals(annotations, tl, { top, bottom }, fontPx, lane);
        const marks: Mark[] = [];
        const labels: Labelled[] = [];
        for (const v of visuals) {
          if (v.region) marks.push({ key: `${v.key}:region`, kind: 'region', v });
          marks.push({ key: `${v.key}:line`, kind: 'line', v });
          if (v.label) labels.push(v as Labelled);
        }
        reconcile<Mark, SVGRectElement | SVGLineElement>(
          dom.annotations,
          marks,
          m => m.key,
          m => s(m.kind === 'region' ? 'rect' : 'line'),
          (el, { kind, v }) => {
            if (kind === 'region') {
              const r = v.region!;
              setAttr(el, 'x', r.x);
              setAttr(el, 'y', r.y);
              setAttr(el, 'width', r.width);
              setAttr(el, 'height', r.height);
              setAttr(el, 'opacity', r.opacity);
              setStyleProp(el, 'fill', v.paint);
            } else {
              const l = v.line;
              setAttr(el, 'x1', l.x);
              setAttr(el, 'y1', l.y1);
              setAttr(el, 'x2', l.x);
              setAttr(el, 'y2', l.y2);
              setAttr(el, 'stroke-width', l.strokeWidth);
              setAttr(el, 'stroke-dasharray', l.dash);
              setAttr(el, 'opacity', l.opacity);
              setStyleProp(el, 'stroke', v.paint);
            }
          },
        );
        reconcile<Labelled, SVGTextElement>(
          dom.annotationLabels,
          labels,
          v => v.key,
          () => s('text'),
          (el, { label }) => {
            setAttr(el, 'x', label.x);
            setAttr(el, 'y', label.y);
            setAttr(el, 'font-size', label.fontSize);
            setAttr(el, 'font-weight', label.fontWeight);
            setStyleProp(el, 'fill', label.paint);
            setText(el, label.text);
          },
        );
      }

      // Today line
      const todayX = G.todayX();
      showNode(dom.svg, dom.today, todayX !== null, dom.arrows);
      if (todayX !== null) {
        setAttr(dom.today, 'x1', todayX);
        setAttr(dom.today, 'y1', top);
        setAttr(dom.today, 'x2', todayX);
        setAttr(dom.today, 'y2', bottom);
      }

      // Drag ghost (last in the SVG)
      const ghost = G.ghostVisual();
      showNode(dom.svg, dom.ghost, ghost !== null);
      if (!ghost) return;
      const el = dom.ghost;
      setAttr(el, 'x', ghost.x);
      setAttr(el, 'y', ghost.y);
      setAttr(el, 'width', ghost.width);
      setAttr(el, 'height', ghost.height);
      setAttr(el, 'rx', ghost.rx);
      setAttr(el, 'opacity', ghost.opacity);
      setAttr(el, 'stroke-dasharray', ghost.dash);
      setAttr(el, 'stroke-width', ghost.strokeWidth);
      setStyleProp(el, 'fill', ghost.paint);
      setStyleProp(el, 'stroke', ghost.paint);
    },
  };
}
