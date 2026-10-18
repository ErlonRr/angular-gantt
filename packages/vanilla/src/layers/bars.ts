/**
 * @file bars.ts
 * Bars region: one bar per mounted row (the virtual window plus the pinned rows), keyed by task
 * id under `g.gantt-bars-layer`, with its `data-task-id`, `data-bar-type`, role and accessible
 * name. The dragged bar is dimmed through the CSSOM.
 *
 * - Built-in bars (`createBar` / `patchBar`) keep their node for as long as their row stays
 *   mounted: a selection, a drag or a zoom patches them in place, and a scroll only adds and
 *   removes the bars at the window's ends.
 * - A custom `renderBar` is called when its row is mounted, then again only when its context
 *   changes: the task object, the row's place in the tree, the visual (by value), selection,
 *   critical / draggable / baseline state, the scale, the theme or the renderer itself. The node
 *   it returns replaces the row's keyed slot; in between, the same node is kept and only the
 *   attributes above are patched on it. (A task mutated in place keeps its custom bar until its
 *   visual changes: replace the task object to re-render it.)
 */

import {
  DRAG_SOURCE_OPACITY,
  taskAccessibleName,
  type BarVisual,
  type GanttBarContext,
  type GanttFlatRow,
  type GanttI18n,
} from '@gantry/core';
import { reconcile } from '../dom/keyed';
import { setAttr, setStyleProp, toggleClass } from '../dom/patch';
import { structuralEqual } from '../engine/inputs';
import { createBar, patchBar, type BarPaintOptions } from '../paint/bars';
import type { GanttBarRenderer } from '../types';
import type { Layer, LayerContext } from './context';
import { rowKeys } from './rows';

const NONE: ReadonlySet<string> = new Set();

/** A custom renderer's node for a row, with the context and renderer it was rendered from. */
interface CustomBar {
  readonly key: string;
  readonly node: SVGElement;
  readonly ctx: GanttBarContext;
  readonly renderBar: GanttBarRenderer;
}

/** Accessible name of a row's bar, with what it was computed from. */
interface BarName {
  readonly labels: GanttI18n['labels'];
  readonly locale: string | undefined;
  readonly critical: boolean;
  readonly baseline: boolean;
  readonly name: string;
}

/** Per-row data of one paint. */
interface Item {
  readonly key: string;
  readonly row: GanttFlatRow;
  readonly v: BarVisual;
  readonly opts: BarPaintOptions;
  readonly critical: boolean;
  /** The custom renderer's node (`null` for a built-in bar) */
  readonly node: SVGElement | null;
}

const sameRow = (a: GanttFlatRow, b: GanttFlatRow) =>
  a === b ||
  (a.task === b.task &&
    a.level === b.level &&
    a.hasChildren === b.hasChildren &&
    a.isCollapsed === b.isCollapsed &&
    a.barType === b.barType);

/** Whether a custom bar rendered from `a` still shows `b` (visuals compare by value). */
function sameContext(a: GanttBarContext, b: GanttBarContext): boolean {
  return (
    a.theme === b.theme &&
    a.isSelected === b.isSelected &&
    a.isCritical === b.isCritical &&
    a.draggable === b.draggable &&
    a.enableResize === b.enableResize &&
    a.showBaseline === b.showBaseline &&
    a.layoutParams.origin.getTime() === b.layoutParams.origin.getTime() &&
    a.layoutParams.pxPerDay === b.layoutParams.pxPerDay &&
    a.layoutParams.rowHeight === b.layoutParams.rowHeight &&
    sameRow(a.row, b.row) &&
    (a.visual === b.visual || structuralEqual(a.visual, b.visual))
  );
}

export function createBarsLayer(ctx: LayerContext): Layer {
  const { inputs: I, graph: G, dom } = ctx;
  let painted = false;
  /** Custom bars of the mounted rows, by row key */
  let custom = new Map<string, CustomBar>();
  /** Makes a re-rendered custom bar's key new, so the keyed list swaps its node */
  let generation = 0;
  const names = new WeakMap<GanttFlatRow, BarName>();
  /** Bars dimmed as the dragged one */
  const dimmed = new WeakSet<Element>();

  /** The bar's accessible name, recomputed only when the row, the locale or a flag changes */
  const nameOf = (row: GanttFlatRow, i18n: GanttI18n, critical: boolean, baselineShown: boolean): string => {
    const { labels, locale } = i18n;
    const baseline = baselineShown && !!row.task.baseline;
    const memo = names.get(row);
    if (memo?.labels === labels && memo.locale === locale && memo.critical === critical && memo.baseline === baseline)
      return memo.name;
    const name = taskAccessibleName(row, { labels, locale, critical, baseline });
    names.set(row, { labels, locale, critical, baseline, name });
    return name;
  };

  return {
    paint() {
      // The table view hides the timeline: paint it once, then leave it until the view changes
      if (I.viewOverride() === 'table' && painted) return;
      painted = true;
      const geos = G.mountedGeometries();
      const visualOf = G.barVisual();
      const cfg = G.config();
      const i18n = G.i18n();
      const renderBar = I.renderBar();
      // Only custom renderers read the resolved theme (`ctx.theme`) and the scale: only they
      // repaint on a colour change
      const theme = renderBar ? G.theme() : undefined;
      const tl = renderBar ? G.timeline() : undefined;
      const fontPx = G.metrics().fontPx;
      const critical = G.critical()?.criticalIds ?? NONE;
      const selected = I.selection().selected;
      const enableDrag = I.enableDrag();
      const dragged = G.draggedBarId();

      const keys = rowKeys(geos);
      const nextCustom = new Map<string, CustomBar>();
      const items = geos.map((geo, i): Item => {
        const task = geo.row.task;
        const v = visualOf(geo);
        const isCritical = critical.has(task.id);
        const opts: BarPaintOptions = {
          fontPx,
          selected: selected.has(task.id),
          className: task.className,
          draggable: enableDrag && task.draggable !== false,
        };
        const key = keys[i]!;
        if (!renderBar || !theme || !tl) return { key, row: geo.row, v, opts, critical: isCritical, node: null };

        const barCtx: GanttBarContext = {
          row: geo.row,
          geometry: geo,
          theme,
          layoutParams: { origin: tl.start, pxPerDay: tl.pxPerDay, rowHeight: cfg.rowHeight },
          isCritical,
          isSelected: opts.selected,
          draggable: !!opts.draggable,
          enableResize: !!v.handles,
          showBaseline: cfg.baseline,
          visual: v,
        };
        let bar = custom.get(key);
        if (!bar || bar.renderBar !== renderBar || !sameContext(bar.ctx, barCtx)) {
          const renderDefault = () => createBar(v, opts);
          bar = {
            key: `${key}\u0001${++generation}`,
            node: renderBar(barCtx, renderDefault) ?? renderDefault(),
            ctx: barCtx,
            renderBar,
          };
        } else if (bar.ctx.visual !== v) {
          // Equal by value: remember the new objects, so the next paints compare by identity
          bar = { ...bar, ctx: barCtx };
        }
        nextCustom.set(key, bar);
        return { key: bar.key, row: geo.row, v, opts, critical: isCritical, node: bar.node };
      });
      custom = nextCustom;

      reconcile<Item, SVGElement>(
        dom.bars,
        items,
        item => item.key,
        item => item.node ?? createBar(item.v, item.opts),
        (el, item) => {
          const task = item.row.task;
          if (item.node) toggleClass(el, 'gantt-bar-draggable', !!item.opts.draggable);
          else patchBar(el as SVGGElement, item.v, item.opts);
          setAttr(el, 'data-task-id', task.id);
          setAttr(el, 'data-bar-type', item.row.barType);
          setAttr(el, 'role', 'listitem');
          setAttr(el, 'aria-label', nameOf(item.row, i18n, item.critical, cfg.baseline));
          // Dim the dragged bar; restore only a bar this layer dimmed (a custom node keeps its own opacity)
          const dim = dragged === task.id;
          if (dim || dimmed.has(el)) {
            setStyleProp(el, 'opacity', dim ? DRAG_SOURCE_OPACITY : null);
            if (dim) dimmed.add(el);
            else dimmed.delete(el);
          }
        },
      );
    },
  };
}
