/**
 * @file bars.ts
 * Paints a core `BarVisual` (task bar, summary bar or milestone) as SVG. Colours are the
 * visual's `paint` (theme tokens or explicit colours), set as CSS properties through the CSSOM.
 *
 * `createBar` builds a bar once; `patchBar` brings an existing bar to a new visual in place: the
 * group keeps its identity, optional parts (caps, progress, baseline, label) are added or removed
 * in their painting order, and every write goes through the `dom/patch.ts` caches. A patch with
 * the same visual and options as the last one returns at once.
 *
 * The group's classes: `gantt-bar` first (the paint-snapshot key), then `gantt-bar--<kind>`,
 * `gantt-bar--critical` on the critical path (forced-colors mode dashes it), the row style's
 * classes (`visual.className`: `options.styles`, `task.style.className`, the deprecated
 * `task.className`) and `gantt-bar-draggable`.
 *
 * A collapsed rolled-up parent (`rollup.segments`) shows its children as segments right after the
 * body: one `rect.gantt-bar-segment` per `visual.segments` entry (x / width from the segment, the
 * bar's y, height and rx, fill through the CSSOM), present only while the visual has segments.
 */

import { PAINTS, type BarVisual } from '@gantryjs/core';
import { s } from '../dom/h';
import { setAttr, setStyleProp, setText } from '../dom/patch';

export interface BarPaintOptions {
  /** Label font size in px (`themeMetrics(theme).fontPx`) */
  readonly fontPx: number;
  readonly selected: boolean;
  /** Adds `gantt-bar-draggable` (grab cursor; the pointer handler only drags such bars) */
  readonly draggable?: boolean | undefined;
  /** On the critical path: adds `gantt-bar--critical` */
  readonly critical?: boolean | undefined;
}

/** The optional parts of a bar, in painting order (the body always comes first). */
const PARTS = ['caps', 'progress', 'baseline', 'label'] as const;
type PartName = (typeof PARTS)[number];

interface BarState {
  readonly body: SVGPathElement;
  /** Child segments (`visual.segments`), in order right after the body */
  readonly segments: SVGRectElement[];
  caps: SVGPathElement | null;
  progress: SVGPathElement | null;
  baseline: SVGLineElement | null;
  label: SVGTextElement | null;
  /** What the bar shows now (a patch with the same values is skipped) */
  v: BarVisual | null;
  opts: BarPaintOptions | null;
}

const bars = new WeakMap<SVGGElement, BarState>();

const sameOptions = (a: BarPaintOptions, b: BarPaintOptions) =>
  a.fontPx === b.fontPx &&
  a.selected === b.selected &&
  !!a.draggable === !!b.draggable &&
  !!a.critical === !!b.critical;

/** Builds the SVG group of a bar. */
export function createBar(v: BarVisual, opts: BarPaintOptions): SVGGElement {
  const body = s('path', { class: 'gantt-bar-body' });
  const g = s('g', null, body);
  bars.set(g, { body, segments: [], caps: null, progress: null, baseline: null, label: null, v: null, opts: null });
  patchBar(g, v, opts);
  return g;
}

/**
 * Brings a group built by `createBar` to `v` / `opts`. A group `createBar` did not build (a
 * custom renderer's node) is left alone.
 */
export function patchBar(g: SVGGElement, v: BarVisual, opts: BarPaintOptions): void {
  const st = bars.get(g);
  if (!st || (st.v === v && st.opts && sameOptions(st.opts, opts))) return;
  st.v = v;
  st.opts = opts;

  let cls = `gantt-bar gantt-bar--${v.kind}`;
  if (opts.critical) cls += ' gantt-bar--critical';
  if (v.className) cls += ` ${v.className}`;
  if (opts.draggable) cls += ' gantt-bar-draggable';
  setAttr(g, 'class', cls);

  const { body } = st;
  setAttr(body, 'd', v.path);
  setAttr(body, 'stroke-width', opts.selected ? 1.5 : null);
  setStyleProp(body, 'fill', v.paint.body);
  setStyleProp(body, 'stroke', opts.selected ? PAINTS.selectionStroke : null);

  paintSegments(st, v);

  const caps = part(g, st, 'caps', v.caps !== null, () => s('path', { class: 'gantt-bar-caps' }));
  if (caps && v.caps) {
    setAttr(caps, 'd', v.caps);
    setStyleProp(caps, 'fill', v.paint.body);
  }

  const progress = part(g, st, 'progress', v.progress !== null, () =>
    s('path', { class: 'gantt-bar-progress', 'pointer-events': 'none' }),
  );
  if (progress && v.progress) {
    setAttr(progress, 'd', v.progress.path);
    setAttr(progress, 'fill-opacity', v.progress.opacity);
    setStyleProp(progress, 'fill', v.paint.progress);
  }

  const baseline = part(g, st, 'baseline', v.baseline !== null, () => {
    const line = s('line', {
      class: 'gantt-bar-baseline',
      'stroke-width': 2,
      'stroke-dasharray': '5 3',
      'stroke-linecap': 'round',
      'pointer-events': 'none',
    });
    setStyleProp(line, 'stroke', PAINTS.baseline);
    return line;
  });
  if (baseline && v.baseline) {
    const b = v.baseline;
    setAttr(baseline, 'x1', b.x);
    setAttr(baseline, 'y1', b.y);
    setAttr(baseline, 'x2', b.x + b.width);
    setAttr(baseline, 'y2', b.y);
  }

  const label = part(g, st, 'label', v.label !== null, () =>
    s('text', { 'dominant-baseline': 'central', 'pointer-events': 'none' }),
  );
  if (label && v.label) {
    const l = v.label;
    setAttr(label, 'class', l.inside ? 'gantt-bar-label' : 'gantt-bar-label gantt-bar-label--outside');
    setAttr(label, 'x', l.x);
    setAttr(label, 'y', l.y);
    setAttr(label, 'font-size', opts.fontPx);
    setAttr(label, 'text-anchor', l.anchor);
    setStyleProp(label, 'fill', v.paint.label);
    setText(label, l.text);
  }
}

/**
 * The child segments of `v` right after the body (none without `v.segments`): the rects are kept
 * in order, extra ones removed, missing ones added after the last one.
 */
function paintSegments(st: BarState, v: BarVisual): void {
  const segments = v.segments ?? [];
  const rects = st.segments;
  while (rects.length > segments.length) rects.pop()!.remove();
  segments.forEach((seg, i) => {
    let rect = rects[i];
    if (!rect) {
      rect = s('rect', { class: 'gantt-bar-segment', 'pointer-events': 'none' });
      (rects[i - 1] ?? st.body).after(rect);
      rects.push(rect);
    }
    setAttr(rect, 'x', seg.x);
    setAttr(rect, 'y', v.y);
    setAttr(rect, 'width', seg.width);
    setAttr(rect, 'height', v.height);
    setAttr(rect, 'rx', v.rx);
    setStyleProp(rect, 'fill', seg.paint);
  });
}

/**
 * Keeps the optional part `name` of a bar: created and inserted in painting order while `on`,
 * removed otherwise. Returns the part while it is shown.
 */
function part<K extends PartName>(
  g: SVGGElement,
  st: BarState,
  name: K,
  on: boolean,
  create: () => NonNullable<BarState[K]>,
): BarState[K] {
  const el = st[name];
  if (!on) {
    if (el) {
      el.remove();
      st[name] = null;
    }
    return null;
  }
  if (el) return el;
  const made = create();
  // Before the next part that is shown (the parts after this one in `PARTS`)
  let before: Element | null = null;
  for (let i = PARTS.indexOf(name) + 1; i < PARTS.length && !before; i++) before = st[PARTS[i]!];
  g.insertBefore(made, before);
  st[name] = made;
  return made;
}
