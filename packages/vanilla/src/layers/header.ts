/**
 * @file header.ts
 * Header region: the timeline header tiers, drawn as HTML so labels can stick to the left edge
 * while scrolling (`position: sticky`) and ellipsize natively. Period delimiters, the current
 * period and non-working time are tinted to match the chart body. Under the tiers, the marker
 * lane (D12, core `computeMarkerLane`, `graph.markerLane`) holds the today marker and the
 * annotation markers with their labels, so labels never cover bars.
 *
 * Horizontally windowed and keyed (D10): each tier mounts only the cells inside
 * `graph.tierWindows` (the viewport ± half its width, snapped to 256px), keyed by `cell.x`, so a
 * scroll inside one chunk re-runs nothing and a scroll across a chunk only adds and removes cells
 * at the window's ends. The `.g-header` box keeps the full `totalWidth` and the model's header
 * height (`graph.headerHeight`: the tiers plus the lane). Geometry goes through custom properties
 * (`--x`, `--w`, `--lx`, read by `left` / `width` in `styles/header.css.ts`); colours are the
 * model's paints (`band.paint`, `headerCellBorder`, `marker.paint`, `label.paint`). Everything is
 * written through the CSSOM (no style text).
 *
 *   div.g-header                    persistent, sized totalWidth × headerHeight
 *     div.g-tier  (one per tier)    top / height from the tier
 *       div.g-band …                non-working tint (finest tier, `nonWorking.showInHeader`)
 *       div.g-cell > span.g-cell-label …
 *     div.g-marker-lane             attached while the lane shows (top = lane.y, 18 px)
 *       div.g-marker.g-marker--today|--annotation      keyed by `marker.key`, in x order; `--x`, colour = marker paint
 *         span.g-marker-label                          while the marker has a label: `--lx`, `--w`, colour = label paint, `title` when truncated
 *     div.g-today-pointer           attached while the today line is shown
 */

import { headerCellBorder, type MarkerVisual, type ScaleCell, type TimeBand } from '@gantryjs/core';
import { h } from '../dom/h';
import { reconcile } from '../dom/keyed';
import { setAttr, setStyleProp, setText } from '../dom/patch';
import type { Layer, LayerContext } from './context';
import { showNode } from './skeleton';
import { uniqueKeys } from './static';

/** One child of a tier row: a non-working band or a cell. */
type TierItem = { readonly band: TimeBand; readonly cell?: undefined } | { readonly cell: ScaleCell };

const NO_BANDS: readonly TimeBand[] = [];

export function createHeaderLayer(ctx: LayerContext): Layer {
  const { graph: G, dom } = ctx;
  const root = h('div', { class: 'g-header', attrs: { 'aria-hidden': 'true' } });
  const lane = h('div', { class: 'g-marker-lane' });
  const pointer = h('div', { class: 'g-today-pointer' });
  /** One row per tier, in tier order (they stay before the lane and the today pointer) */
  const rows: HTMLDivElement[] = [];
  /** Each marker's label span (attached while the marker has a label) */
  const labelOf = new WeakMap<HTMLElement, HTMLElement>();

  const createMarker = (): HTMLElement => {
    const label = h('span', { class: 'g-marker-label' });
    const marker = h('div', null, label);
    labelOf.set(marker, label);
    return marker;
  };

  const patchMarker = (el: HTMLElement, m: MarkerVisual): void => {
    setAttr(el, 'class', `g-marker g-marker--${m.kind}`);
    setStyleProp(el, '--x', `${m.x}px`);
    setStyleProp(el, 'color', m.paint);
    const span = labelOf.get(el)!;
    const { label } = m;
    showNode(el, span, label !== null);
    if (!label) return;
    setStyleProp(span, '--lx', `${label.x}px`);
    setStyleProp(span, '--w', `${label.width}px`);
    setStyleProp(span, 'color', label.paint);
    setText(span, label.text);
    // The full text when core truncated it to fit before the next marker
    setAttr(span, 'title', label.title !== label.text ? label.title : null);
  };

  return {
    paint() {
      const tl = G.timeline();
      const cfg = G.config();
      const tiers = G.tierWindows();
      const todayX = G.todayX();
      const markers = G.markerLane();
      const bands = cfg.nonWorking?.showInHeader ? G.bandWindow() : NO_BANDS;
      const lastTier = tiers.length - 1;

      showNode(dom.headerContainer, root, true);
      setStyleProp(root, 'width', `${tl.totalWidth}px`);
      setStyleProp(root, 'height', `${G.headerHeight()}px`);

      while (rows.length > tiers.length) rows.pop()!.remove();
      tiers.forEach((tier, i) => {
        let row = rows[i];
        if (!row) {
          // Rows are created in order: after the previous row, before the lane and the today pointer
          row = h('div');
          root.insertBefore(row, i === 0 ? root.firstChild : rows[i - 1]!.nextSibling);
          rows.push(row);
        }
        setAttr(row, 'class', `g-tier g-tier--${tier.unit}${tier.align === 'start' ? ' g-tier--start' : ''}`);
        setStyleProp(row, 'top', `${tier.y}px`);
        setStyleProp(row, 'height', `${tier.height}px`);

        const last = i === lastTier;
        // Non-working tint on the finest tier, under its cells
        const items: TierItem[] = [];
        for (const band of last ? bands : NO_BANDS) items.push({ band });
        for (const cell of tier.cells) items.push({ cell });
        const keys = uniqueKeys(items, it => (it.cell ? `c${it.cell.x}` : `b${it.band.x}`));
        reconcile<TierItem, HTMLElement>(
          row,
          items,
          (_, k) => keys[k]!,
          it => (it.cell ? h('div', null, h('span', { class: 'g-cell-label' })) : h('div')),
          (el, it) => {
            if (!it.cell) {
              const { band } = it;
              setAttr(el, 'class', `g-band g-band--${band.kind}`);
              setStyleProp(el, '--x', `${band.x}px`);
              setStyleProp(el, '--w', `${band.width}px`);
              setStyleProp(el, 'background-color', band.paint);
              return;
            }
            const { cell } = it;
            setAttr(
              el,
              'class',
              `g-cell${cell.isCurrent && last ? ' g-cell--current' : ''}${cell.className ? ` ${cell.className}` : ''}`,
            );
            setStyleProp(el, '--x', `${cell.x}px`);
            setStyleProp(el, '--w', `${cell.width}px`);
            // Period delimiter: upper tiers always, the bottom tier at major boundaries
            setStyleProp(el, 'border-left', headerCellBorder(cfg, tl, i, cell) ?? 'none');
            const label = el.firstChild as HTMLElement;
            setText(label, cell.label);
            setAttr(label, 'title', cell.label);
          },
        );
      });

      // Marker lane under the tiers, before the today pointer (D27: attached only while shown)
      const laneShown = markers.height > 0;
      showNode(root, lane, laneShown, pointer.parentNode === root ? pointer : null);
      if (laneShown) {
        setStyleProp(lane, 'top', `${markers.y}px`);
        setStyleProp(lane, 'height', `${markers.height}px`);
        setStyleProp(lane, 'font-size', `${markers.labelFontPx}px`);
        reconcile<MarkerVisual, HTMLElement>(lane, markers.markers, m => m.key, createMarker, patchMarker);
      }

      // "Today" pointer at the bottom of the header (a line would cover the labels)
      showNode(root, pointer, todayX !== null);
      if (todayX !== null) setStyleProp(pointer, '--x', `${todayX}px`);
    },
  };
}
