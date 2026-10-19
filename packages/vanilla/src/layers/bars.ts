/**
 * @file bars.ts
 * Bars region: one bar per mounted row (the virtual window plus the pinned rows), keyed by task
 * id under `g.gantt-bars-layer`, with its `data-task-id`, `data-bar-type` and the ARIA of an
 * option of the svg's listbox (D3): `role=option`, the accessible name (`taskAccessibleName`),
 * `aria-roledescription` (`barRoleDescription`: "task bar", "milestone", "summary bar"),
 * `aria-selected` and `aria-posinset` / `aria-setsize` (the listbox is flat: the row's place
 * among the visible rows, `visibleIndex + 1` of the visible row count). Custom bars get the same
 * attributes. The svg itself is named by `labels.ariaBars` and is `aria-multiselectable` with
 * multiple selection. The dragged bar is dimmed through the CSSOM. (`aria-describedby` is the
 * tooltip's, set while it is open for the bar.)
 *
 * Keyboard (D5): the bars rove. Every bar is focusable (`data-focus-key="bar:<id>"`), one has
 * `tabindex=0` — the focused row's bar (in either pane: `focusedRowId`), else the one focused
 * last while it is mounted, else the first bar in view (core `tabStopIndex`) — the others `-1`.
 * The timeline viewport is a tab stop (`tabindex=0`) only while no bar is mounted. A bar node
 * that may be replaced (a custom renderer called again) keeps focus through `focus.capture()`.
 * The keys are `interaction/timeline-keys.ts`.
 *
 * The bar overlay (D4, `g.gantt-bar-overlay` between the bars and the annotation labels,
 * attached only while it shows something): the focus ring of the bar focused from the keyboard
 * (`focusVisibleBarId`, core `BarVisual.focusRect`) and the resize grips (`handles.*.grip`) of
 * that bar, of the bar under a fine pointer (`hoveredBarId`) and, on coarse pointers, of the
 * selected bars. Its look is in `styles/canvas.css.ts` (`--gantt-focus-ring`); it works the same
 * for custom bars and adds no node to the bars themselves.
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
 *
 * The row style's classes (`visual.className`: `options.styles`, `task.style.className`, the
 * deprecated `task.className`) are part of a built-in bar's class (`paint/bars.ts`); a custom
 * node gets them added and removed one by one next to its own classes (as Angular's bar outlet
 * does), and reads the whole style in `ctx.style`.
 */

import {
  DRAG_SOURCE_OPACITY,
  barRoleDescription,
  tabStopIndex,
  taskAccessibleName,
  type BarVisual,
  type GanttBarContext,
  type GanttFlatRow,
  type GanttI18n,
  type Rect,
  type RowGeometry,
} from '@gantryjs/core';
import { s } from '../dom/h';
import { reconcile } from '../dom/keyed';
import { setAttr, setStyleProp, toggleClass } from '../dom/patch';
import { structuralEqual } from '../engine/inputs';
import { createBar, patchBar, type BarPaintOptions } from '../paint/bars';
import type { GanttBarRenderer } from '../types';
import type { Layer, LayerContext } from './context';
import { rowKeys } from './rows';
import { showNode } from './skeleton';

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

/** One shape of the bar overlay: a focus ring or a resize grip. */
interface OverlayShape {
  readonly key: string;
  readonly className: 'gantt-bar-focus-ring' | 'gantt-bar-grip';
  readonly rect: Rect & { readonly rx: number };
}

const same = (a: readonly unknown[] | undefined, b: readonly unknown[]) =>
  a?.length === b.length && a.every((v, i) => Object.is(v, b[i]));

const NO_CLASSES: readonly string[] = [];

/** The classes of a `className` value (`null`: none) */
const classList = (className: string | null): readonly string[] =>
  className ? className.split(/\s+/).filter(Boolean) : NO_CLASSES;

/** The primary pointer is coarse (touch): selected bars show their grips. Read once per element. */
const coarsePointer = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

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
    a.style === b.style &&
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
  /** The style classes this layer added to each custom bar node */
  const styleClasses = new WeakMap<Element, readonly string[]>();
  /** The bar focused last: it keeps the tab stop while mounted, so Tab returns to it */
  let lastFocusedId: string | null = null;
  /** What the bars were last painted from (the overlay alone may change: hover, keyboard focus) */
  let paintedFrom: readonly unknown[] | undefined;
  const coarse = coarsePointer();

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

  /**
   * The bar overlay: the focus ring of the keyboard-focused bar, the grips of that bar, of the
   * hovered one and (coarse pointers) of the selected ones, for the mounted rows.
   */
  const paintOverlay = (
    geos: readonly RowGeometry[],
    keys: readonly string[],
    visualOf: (geo: RowGeometry) => BarVisual,
    selected: ReadonlySet<string>,
  ): void => {
    const ringId = I.focusVisibleBarId();
    const hoverId = I.hoveredBarId();
    const shapes: OverlayShape[] = [];
    geos.forEach((geo, i) => {
      const id = geo.row.task.id;
      const ring = id === ringId;
      if (!ring && id !== hoverId && !(coarse && selected.has(id))) return;
      const v = visualOf(geo);
      const key = keys[i]!;
      if (ring) shapes.push({ key: `${key}\u0001ring`, className: 'gantt-bar-focus-ring', rect: v.focusRect });
      if (!v.handles) return;
      shapes.push({ key: `${key}\u0001left`, className: 'gantt-bar-grip', rect: v.handles.left.grip });
      shapes.push({ key: `${key}\u0001right`, className: 'gantt-bar-grip', rect: v.handles.right.grip });
    });
    reconcile<OverlayShape, SVGRectElement>(
      dom.barOverlay,
      shapes,
      shape => shape.key,
      shape => s('rect', { class: shape.className }),
      (el, { rect }) => {
        setAttr(el, 'x', rect.x);
        setAttr(el, 'y', rect.y);
        setAttr(el, 'width', rect.width);
        setAttr(el, 'height', rect.height);
        setAttr(el, 'rx', rect.rx);
      },
    );
    showNode(dom.svg, dom.barOverlay, shapes.length > 0, dom.annotationLabels);
  };

  return {
    paint() {
      const cfg = G.config();
      const i18n = G.i18n();
      // The listbox of the bars (in every view: its name never goes stale)
      setAttr(dom.svg, 'aria-label', i18n.labels.ariaBars);
      setAttr(dom.svg, 'aria-multiselectable', String(cfg.selection.enabled && cfg.selection.multi));
      // The table view hides the timeline: paint it once, then leave it until the view changes
      if (I.viewOverride() === 'table' && painted) return;
      painted = true;
      const geos = G.mountedGeometries();
      const visualOf = G.barVisual();
      const renderBar = I.renderBar();
      // Only custom renderers read the resolved theme (`ctx.theme`) and the scale: only they
      // repaint on a colour change
      const theme = renderBar ? G.theme() : undefined;
      const tl = renderBar ? G.timeline() : undefined;
      // Custom bars get their row's resolved style (`ctx.style`)
      const styleOf = renderBar ? G.rowStyle() : undefined;
      const fontPx = G.metrics().fontPx;
      const critical = G.critical()?.criticalIds ?? NONE;
      const selected = I.selection().selected;
      const enableDrag = I.enableDrag();
      const dragged = G.draggedBarId();
      const rowCount = G.visibleRows().length;
      const vw = G.vWindow();

      // The roving tab stop (D5); the viewport is one only while no bar is mounted
      const focusedId = I.focusedRowId();
      if (focusedId !== null) lastFocusedId = focusedId;
      // The scroll offset is current here: the window (read above) changes whenever a row crosses the top
      const firstInView = Math.max(vw.first, Math.ceil(I.scrollTop.peek() / cfg.rowHeight));
      const stop = tabStopIndex(
        geos.map(geo => geo.row.task.id),
        [focusedId, lastFocusedId],
        geos.findIndex(geo => geo.row.visibleIndex >= firstInView && geo.row.visibleIndex <= vw.last),
      );
      setAttr(dom.viewport, 'tabindex', geos.length ? -1 : 0);

      const keys = rowKeys(geos);
      paintOverlay(geos, keys, visualOf, selected);
      // Only the overlay changed (hover, keyboard focus): the bars stay as they are
      const from: unknown[] = [geos, visualOf, renderBar, theme, tl, styleOf, fontPx, critical, selected];
      from.push(enableDrag, dragged, stop, rowCount, i18n, cfg);
      if (same(paintedFrom, from)) return;
      paintedFrom = from;
      const nextCustom = new Map<string, CustomBar>();
      const items = geos.map((geo, i): Item => {
        const task = geo.row.task;
        const v = visualOf(geo);
        const isCritical = critical.has(task.id);
        const opts: BarPaintOptions = {
          fontPx,
          selected: selected.has(task.id),
          draggable: enableDrag && task.draggable !== false,
          critical: isCritical,
        };
        const key = keys[i]!;
        if (!renderBar || !theme || !tl || !styleOf)
          return { key, row: geo.row, v, opts, critical: isCritical, node: null };

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
          style: styleOf(geo.row),
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

      // A custom bar node may be replaced: the focus-restore region gives focus back to its key
      ctx.focus.capture();
      reconcile<Item, SVGElement>(
        dom.bars,
        items,
        item => item.key,
        item => item.node ?? createBar(item.v, item.opts),
        (el, item, i) => {
          const task = item.row.task;
          if (item.node) {
            toggleClass(el, 'gantt-bar-draggable', !!item.opts.draggable);
            // The row style's classes, next to the node's own (the ones added before and gone are removed)
            const prev = styleClasses.get(el) ?? NO_CLASSES;
            const next = classList(item.v.className);
            for (const c of prev) if (!next.includes(c)) toggleClass(el, c, false);
            for (const c of next) toggleClass(el, c, true);
            styleClasses.set(el, next);
          } else patchBar(el as SVGGElement, item.v, item.opts);
          setAttr(el, 'data-task-id', task.id);
          setAttr(el, 'data-bar-type', item.row.barType);
          setAttr(el, 'role', 'option');
          setAttr(el, 'aria-label', nameOf(item.row, i18n, item.critical, cfg.baseline));
          setAttr(el, 'aria-roledescription', barRoleDescription(item.row, i18n.labels));
          setAttr(el, 'aria-selected', String(!!item.opts.selected));
          // A flat listbox: the place among every visible row (the task list's rows tell the tree)
          setAttr(el, 'aria-posinset', item.row.visibleIndex + 1);
          setAttr(el, 'aria-setsize', rowCount);
          setAttr(el, 'tabindex', i === stop ? 0 : -1);
          setAttr(el, 'data-focus-key', `bar:${task.id}`);
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
