/**
 * @file header.ts
 * Header region: the timeline header tiers, drawn as HTML so labels can stick to the left edge
 * while scrolling (`position: sticky`) and ellipsize natively. Period delimiters, the current
 * period and non-working time are tinted to match the chart body.
 *
 * Horizontally windowed and keyed (D10): each tier mounts only the cells inside
 * `graph.tierWindows` (the viewport ± half its width, snapped to 256px), keyed by `cell.x`, so a
 * scroll inside one chunk re-runs nothing and a scroll across a chunk only adds and removes cells
 * at the window's ends. The `.g-header` box keeps the full `totalWidth`. Geometry goes through
 * custom properties (`--x`, `--w`, read by `left` / `width` in `styles/header.css.ts`); colours
 * are the model's paints (`band.paint`, `headerCellBorder`). Everything is written through the
 * CSSOM (no style text).
 *
 *   div.g-header                    persistent, sized totalWidth × headerHeight
 *     div.g-tier  (one per tier)    top / height from the tier
 *       div.g-band …                non-working tint (finest tier, `nonWorking.showInHeader`)
 *       div.g-cell > span.g-cell-label …
 *     div.g-today-pointer           attached while the today line is shown
 */

import { headerCellBorder, type ScaleCell, type TimeBand } from '@gantryjs/core';
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
  const pointer = h('div', { class: 'g-today-pointer' });
  /** One row per tier, in tier order (they stay before the today pointer) */
  const rows: HTMLDivElement[] = [];

  return {
    paint() {
      const tl = G.timeline();
      const cfg = G.config();
      const tiers = G.tierWindows();
      const todayX = G.todayX();
      const bands = cfg.nonWorking?.showInHeader ? G.bandWindow() : NO_BANDS;
      const lastTier = tiers.length - 1;

      showNode(dom.headerContainer, root, true);
      setStyleProp(root, 'width', `${tl.totalWidth}px`);
      setStyleProp(root, 'height', `${tl.headerHeight}px`);

      while (rows.length > tiers.length) rows.pop()!.remove();
      tiers.forEach((tier, i) => {
        let row = rows[i];
        if (!row) {
          // Rows are created in order: after the previous row, before the today pointer
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

      // "Today" pointer at the bottom of the header (a line would cover the labels)
      showNode(root, pointer, todayX !== null);
      if (todayX !== null) setStyleProp(pointer, '--x', `${todayX}px`);
    },
  };
}
