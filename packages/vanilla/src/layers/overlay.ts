/**
 * @file overlay.ts
 * Overlay region: the annotations (regions and lines under the bars, labels above them), the
 * today line and the drag ghost.
 *
 * - Annotations are keyed by index and patched; they are revisited only when they, the timeline,
 *   the window or the font size change, so a drag move costs nothing here.
 * - The today line (`line.gantt-today`, before `g.gantt-arrows`) and the ghost
 *   (`rect.gantt-drag-preview`, last in the SVG) are single persistent nodes, attached only while
 *   shown. The ghost is patched in O(1) from `computeDragGhostVisual` (`graph.ghostVisual`), with
 *   its movement label (`text.gantt-drag-preview-label`) right before it.
 */

import { annotationPaint, type GanttAnnotation } from '@gantry/core';
import { s } from '../dom/h';
import { reconcile } from '../dom/keyed';
import { setAttr, setStyleProp, setText } from '../dom/patch';
import type { Layer, LayerContext } from './context';
import { showNode } from './skeleton';

/** One annotation shape: the shaded region (`x2` set) or the line at `x1`. */
interface Mark {
  readonly key: string;
  readonly kind: 'region' | 'line';
  readonly ann: GanttAnnotation;
}

/** One annotation label. */
interface Label {
  readonly key: string;
  readonly ann: GanttAnnotation & { readonly label: NonNullable<GanttAnnotation['label']> };
}

const same = (a: readonly unknown[] | undefined, b: readonly unknown[]) =>
  a?.length === b.length && a.every((v, i) => Object.is(v, b[i]));

export function createOverlayLayer(ctx: LayerContext): Layer {
  const { inputs: I, graph: G, dom } = ctx;
  let painted = false;
  let annotationsFor: readonly unknown[] | undefined;

  // The ghost's opacity covers fill and stroke (core's look): no separate fill opacity
  setAttr(dom.ghost, 'fill-opacity', null);
  const ghostLabel = s('text', {
    class: 'gantt-drag-preview-label',
    'font-weight': 600,
    'text-anchor': 'middle',
    'dominant-baseline': 'auto',
    'pointer-events': 'none',
  });
  setStyleProp(ghostLabel, 'font-family', 'var(--gantt-font)');
  setStyleProp(ghostLabel, 'user-select', 'none');

  return {
    paint() {
      // The table view hides the timeline: paint it once, then leave it until the view changes
      if (I.viewOverride() === 'table' && painted) return;
      painted = true;
      const tl = G.timeline();
      const { top, bottom } = G.windowSpan();
      const annotations = I.annotationsIn();
      const fontPx = G.metrics().fontPx;

      // Annotations: regions and lines under the bars, labels on top of them
      const deps = [annotations, tl, top, bottom, fontPx];
      if (!same(annotationsFor, deps)) {
        annotationsFor = deps;
        const marks: Mark[] = [];
        const labels: Label[] = [];
        annotations.forEach((ann, i) => {
          if (ann.x2) marks.push({ key: `${i}:region`, kind: 'region', ann });
          marks.push({ key: `${i}:line`, kind: 'line', ann });
          if (ann.label) labels.push({ key: String(i), ann: ann as Label['ann'] });
        });
        reconcile<Mark, SVGRectElement | SVGLineElement>(
          dom.annotations,
          marks,
          m => m.key,
          m =>
            m.kind === 'region'
              ? s('rect')
              : s('line', { 'stroke-width': 1.5, 'stroke-dasharray': '5 3', opacity: 0.8 }),
          (el, { kind, ann }) => {
            const x1 = tl.toX(ann.x1);
            if (kind === 'region') {
              setAttr(el, 'x', x1);
              setAttr(el, 'y', top);
              setAttr(el, 'width', tl.toX(ann.x2!) - x1);
              setAttr(el, 'height', bottom - top);
              setAttr(el, 'opacity', ann.opacity ?? 0.08);
              setStyleProp(el, 'fill', annotationPaint(ann));
            } else {
              setAttr(el, 'x1', x1);
              setAttr(el, 'y1', top);
              setAttr(el, 'x2', x1);
              setAttr(el, 'y2', bottom);
              setStyleProp(el, 'stroke', annotationPaint(ann));
            }
          },
        );
        reconcile<Label, SVGTextElement>(
          dom.annotationLabels,
          labels,
          l => l.key,
          () => s('text'),
          (el, { ann }) => {
            setAttr(el, 'x', tl.toX(ann.x1) + 6);
            setAttr(el, 'y', top + 14);
            setAttr(el, 'font-size', ann.label.fontSize ?? fontPx - 1);
            setAttr(el, 'font-weight', ann.label.fontWeight ?? 600);
            setStyleProp(el, 'fill', ann.label.color ?? annotationPaint(ann));
            setText(el, ann.label.text);
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

      // Drag ghost (last in the SVG) and its movement label (right before it)
      const ghost = G.ghostVisual();
      showNode(dom.svg, dom.ghost, ghost !== null);
      showNode(dom.svg, ghostLabel, !!ghost?.label, dom.ghost);
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
      const label = ghost.label;
      if (label) {
        setAttr(ghostLabel, 'x', label.x);
        setAttr(ghostLabel, 'y', label.y);
        setAttr(ghostLabel, 'font-size', label.fontPx);
        setStyleProp(ghostLabel, 'fill', label.paint);
        setText(ghostLabel, label.text);
      }
    },
  };
}
