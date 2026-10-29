/**
 * @file tooltip-triggers.ts
 * What opens, closes and moves the task tooltip besides the pointer over the bars
 * (`interaction/canvas-pointer.ts`: `hover`, `unhover`, `tap`):
 *
 * - **Keyboard focus** on a bar: `tooltip.focus()` when `focusVisibleBarId` names a bar (focus
 *   reached from the keyboard, written by the keyboard handlers), `tooltip.blur()` when it goes
 *   back to `null`. A bar focused with the pointer opens nothing. Before the first render no bar
 *   is mounted: the request is tried once more on the next animation frame, which comes after the
 *   engine's first flush (its frame was requested when the element connected, before this one).
 * - **Escape** (D24, WCAG 1.4.13): while a tooltip shows, a keydown on the host in the capture
 *   phase dismisses it and consumes the key, before the keyboard handlers clear the selection. A
 *   drag or keyboard move mode dismisses the tooltip when it starts (below) and keeps its own
 *   Escape (cancel): the handler steps aside while a preview is shown. With keyboard focus
 *   elsewhere in the page, Escape still closes a hover tooltip, without consuming the key.
 * - **The pointer on the tooltip**: `pointerenter` / `pointerleave` → `enterTooltip()` /
 *   `leaveTooltip()`, so it stays open while the pointer rests on it.
 * - **Scrolls and resizes**: the timeline viewport, any scroll in the page and a window resize
 *   place the open tooltip by its bar again (`tooltip.reposition()`).
 * - **A press elsewhere**: a `pointerdown` outside the tooltip and off the bars dismisses it (a
 *   press on a bar is the canvas pointer handler's: a tap toggles that bar's tooltip). Bars are
 *   hit by geometry, as the pointer handler hits them (core `hitTestBar`).
 * - **The resource view** (Phase 14): there are no bars, so a mouse or pen over a resource row's timeline cell
 *   (core `hitTestLoad`: the row and the day) opens the resource tooltip (`tooltip.hoverLoad`), and
 *   leaving the rows closes it (`unhover`). Touch and keyboard focus open none: the numbers are in the
 *   Capacity and Peak load columns and the rows' accessible names. The open resource tooltip follows its
 *   utilization and the i18n bundle (`tooltip.refreshLoad`) and goes when its row does.
 * - **Its row changes**: while a tooltip shows, its row's task object, critical flag, float,
 *   resolved style (field by field, core `sameTaskStyle`: the progress colour), the i18n bundle
 *   (labels, locale, formats), how dates are read (core `sameDateReading`: end-date rule,
 *   date-only normalisation, working calendar) and the baseline switch are followed; when one
 *   changes, `tooltip.refresh(row)` writes the content again in the next frame, after the bars
 *   are painted, so it is placed by the moved bar (a custom `render` runs again only then: the
 *   clock alone changes none of them).
 * - **Dismiss / reset** without a user gesture: a drag or move mode starts (`dragPreview`),
 *   the bar's row goes away (checked when the tasks, the collapsed rows or the options change),
 *   and `tooltipEnabled` or the resolved rules (`config.tooltip`: `trigger`, `showDelay`,
 *   `hideDelay`, as Angular compares them) change: back to closed. Options that resolve to the
 *   same rules (`tooltip: {}` and no `tooltip`) change nothing.
 *
 * Bound by the engine when the element connects, inside the connection's owner: the effects are
 * disposed and every listener goes when `signal` aborts.
 */

import {
  hitTestBar,
  hitTestLoad,
  sameDateReading,
  sameTaskStyle,
  type DateReading,
  type GanttFlatRow,
  type GanttI18n,
  type ResolvedGanttConfig,
  type ResolvedTaskStyle,
} from '@gantryjs/core';
import { computed, effect, onCleanup, untracked } from '../reactive';
import type { LayerContext } from '../layers/context';
import type { TooltipLayer } from '../layers/tooltip';

export interface TooltipTriggerOptions {
  readonly tooltip: TooltipLayer;
  /** Whether a model was painted (no tooltip before the first render) */
  readonly hasRendered: () => boolean;
  /** Aborted when the element disconnects: removes the listeners */
  readonly signal: AbortSignal;
  /**
   * Runs the open tooltip's refresh in the frame, after the bars are painted (the engine's frame
   * scheduler), so a tooltip whose task moved is placed by the repainted bar. Without it the
   * refresh runs at once.
   */
  readonly afterPaint?: ((run: () => void) => void) | undefined;
}

const sameValues = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/** What the open tooltip's content is built from, besides the clock and the task index. */
interface OpenContent {
  readonly row: GanttFlatRow;
  readonly critical: boolean;
  /** Total float in measured days (`undefined`: off the critical-path result) */
  readonly float: number | undefined;
  /** The row's resolved style (`undefined` while a `styles.rule` throws: the task's own) */
  readonly style: ResolvedTaskStyle | undefined;
  readonly i18n: GanttI18n;
  /** How the duration, float and variance are read: end-date rule, date-only normalisation, working calendar */
  readonly dates: DateReading;
  /** Whether baseline rows show */
  readonly baseline: boolean;
}

/**
 * Same content: the same task object, critical flag, float, style fields, i18n bundle, date
 * reading and baseline switch (a new row object alone is not a change, nor a new style object
 * with the same fields).
 */
const sameContent = (a: OpenContent | null, b: OpenContent | null): boolean =>
  a === b ||
  (!!a &&
    !!b &&
    a.row.task === b.row.task &&
    a.critical === b.critical &&
    Object.is(a.float, b.float) &&
    sameTaskStyle(a.style, b.style) &&
    a.i18n === b.i18n &&
    sameDateReading(a.dates, b.dates) &&
    a.baseline === b.baseline);

/** `row`'s resolved style, `undefined` while a `styles.rule` throws (the bars region reports it). */
function styleOf(resolve: (row: GanttFlatRow) => ResolvedTaskStyle, row: GanttFlatRow): ResolvedTaskStyle | undefined {
  try {
    return resolve(row);
  } catch {
    return undefined;
  }
}

/** Typing into a slotted / custom cell input keeps its own Escape. */
const isEditable = (el: Element | undefined): boolean =>
  !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || (el as HTMLElement).isContentEditable === true);

export function bindTooltipTriggers(ctx: LayerContext, opts: TooltipTriggerOptions): void {
  const { host, shadow, inputs: I, graph: G, dom, drag } = ctx;
  const { tooltip, signal } = opts;
  const doc = shadow.ownerDocument;
  const win = doc.defaultView;

  /** The mounted bar element of `taskId` (`g[data-task-id]` in the bars layer), if any. */
  const barElement = (taskId: string): Element | null => {
    for (const bar of dom.bars.children) if (bar.getAttribute('data-task-id') === taskId) return bar;
    return null;
  };

  // ── Keyboard focus on a bar (keyboard modality only) ───────────────────
  /** Opens the tooltip of `id`'s bar, when its row and its bar element are there. */
  const focusBar = (id: string): void => {
    try {
      const row = G.geoById.peek().get(id)?.row;
      const el = barElement(id);
      if (row && el) tooltip.focus(row, el);
    } catch {
      // invalid options: nothing is rendered
    }
  };
  effect(() => {
    const id = I.focusVisibleBarId();
    untracked(() => {
      if (id === null) {
        tooltip.blur();
        return;
      }
      if (opts.hasRendered()) {
        focusBar(id);
        return;
      }
      // Not painted yet: once more after the first render (cancelled when focus moves meanwhile)
      if (!win) return;
      const frame = win.requestAnimationFrame(() => {
        if (opts.hasRendered()) focusBar(id);
      });
      onCleanup(() => win.cancelAnimationFrame(frame));
    });
  });

  // ── Dismiss when a drag or keyboard move mode starts ────────────────────
  const previewing = computed(() => I.dragPreview() !== null);
  effect(() => {
    if (previewing()) untracked(() => tooltip.dismiss());
  });

  // ── Back to closed when the switch or the open / close rules change ─────
  // The resolved rules (core defaults applied), as Angular reads them. A new `render` alone
  // changes no rule (a framework re-render may pass a new function every time).
  const tooltipRules = (): ResolvedGanttConfig['tooltip'] | null => {
    try {
      return G.config().tooltip;
    } catch {
      return null; // invalid options: nothing is rendered
    }
  };
  let rules: readonly unknown[] | undefined;
  effect(() => {
    const t = tooltipRules();
    const next = [I.tooltipEnabled(), t?.trigger, t?.showDelay, t?.hideDelay];
    if (rules && !sameValues(rules, next)) untracked(() => tooltip.hide());
    rules = next;
  });

  // ── Dismiss when the bar's row goes away (removed, collapsed) ───────────
  // The inputs rows come from; the rows themselves are read only while a tooltip shows
  effect(() => {
    I.tasksIn();
    I.collapsedIds();
    I.optionsIn();
    // The resource view's rows come from the resources and the rows shown (a toggle changes no option)
    I.resourcesIn();
    I.rowsOverride();
    untracked(() => {
      // A resource tooltip is for a row of the resource view, a task tooltip for a task's
      const id = tooltip.visibleLoad()?.rowKey ?? tooltip.visibleId();
      if (id === null) return;
      try {
        if (!G.geoById.peek().has(id)) tooltip.dismiss();
      } catch {
        tooltip.dismiss(); // invalid options: nothing is rendered
      }
    });
  });

  // ── The open tooltip follows its row ────────────────────────────────────
  // Graph nodes are read only while a tooltip shows. The cut-off keeps the clock out: a tick may
  // rebuild the rows (a sort by status) but not their tasks, the critical set, the style fields or
  // the labels (a rolled-up parent gets a new copy only when `nowDay` moves on: its status may
  // change then). The date reading is already cut off on the calendar key, end-date rule and
  // date-only normalisation, so the clock stays out of it too.
  const openContent = computed(
    (): OpenContent | null => {
      const id = tooltip.visibleId();
      if (id === null) return null;
      try {
        const row = G.geoById().get(id)?.row;
        // A row gone is the dismiss rule's (above)
        if (!row) return null;
        const cpm = G.critical();
        return {
          row,
          critical: cpm?.criticalIds.has(id) ?? false,
          float: cpm?.floatMap.get(id),
          style: styleOf(G.rowStyle(), row),
          i18n: G.i18n(),
          dates: G.dateReading(),
          baseline: G.config().baseline,
        };
      } catch {
        return null; // invalid options: nothing is rendered
      }
    },
    { equals: sameContent },
  );
  effect(
    () => {
      const content = openContent();
      // The tooltip compares with what it wrote: opening it (a new id) writes nothing again
      if (content) untracked(() => tooltip.refresh(content.row));
    },
    { scheduler: opts.afterPaint },
  );

  // ── The open resource tooltip follows its utilization and the labels ─────
  // Read only while one shows; `utilization` already covers the tasks, the resources, the date reading
  // (working calendar) and `resourceView.unassigned`, so the clock stays out
  const openLoad = computed(
    () => {
      const target = tooltip.visibleLoad();
      if (!target) return null;
      try {
        return { target, utilization: G.utilization(), i18n: G.i18n() };
      } catch {
        return null; // invalid options: nothing is rendered
      }
    },
    {
      equals: (a, b) =>
        a === b || (!!a && !!b && a.target === b.target && a.utilization === b.utilization && a.i18n === b.i18n),
    },
  );
  effect(
    () => {
      if (openLoad()) untracked(() => tooltip.refreshLoad());
    },
    { scheduler: opts.afterPaint },
  );

  // ── A mouse or pen over a resource row opens its tooltip ────────────────
  // After the canvas pointer handler (bound first), which calls `unhover()` on every move off a bar: the
  // resource view has none, so the hover below follows it on the same event
  dom.canvasContainer.addEventListener(
    'pointermove',
    e => {
      if (e.pointerType === 'touch' || !I.tooltipEnabled.peek() || !opts.hasRendered()) return;
      try {
        const utilization = G.utilization.peek();
        if (!utilization) return;
        const box = dom.canvasContainer.getBoundingClientRect();
        const hit = hitTestLoad({
          x: e.clientX - box.left,
          y: e.clientY - box.top,
          geos: G.mountedGeometries.peek(),
          utilization,
          dayOfX: G.dayOfX.peek(),
          pxPerDay: G.timeline.peek().pxPerDay,
        });
        if (hit) tooltip.hoverLoad({ rowKey: hit.rowKey, day: hit.day }, e.clientX);
      } catch {
        // invalid options: nothing is rendered
      }
    },
    { passive: true, signal },
  );

  // ── Escape closes the tooltip first (D24) ───────────────────────────────
  host.addEventListener(
    'keydown',
    e => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || tooltip.visibleId() === null) return;
      // A drag or move mode cancels on Escape (it dismissed the tooltip when it started anyway)
      if (drag.state.peek().kind !== 'idle' || I.dragPreview.peek() !== null) return;
      if (isEditable(e.composedPath()[0] as Element | undefined)) return;
      tooltip.dismiss();
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true, signal },
  );
  // A hover tooltip while keyboard focus is elsewhere in the page: Escape still closes it, but the
  // key stays the page's (it may close a dialog too)
  doc.addEventListener(
    'keydown',
    e => {
      if (e.key !== 'Escape' || e.isComposing || tooltip.visibleId() === null) return;
      if (!e.composedPath().includes(host)) tooltip.dismiss();
    },
    { capture: true, signal },
  );

  // ── The pointer resting on the tooltip keeps it open ────────────────────
  tooltip.element.addEventListener('pointerenter', () => tooltip.enterTooltip(), { signal });
  tooltip.element.addEventListener('pointerleave', () => tooltip.leaveTooltip(), { signal });

  // ── Scrolls and resizes move it with its bar ────────────────────────────
  const reposition = (): void => tooltip.reposition();
  dom.viewport.addEventListener('scroll', reposition, { passive: true, signal });
  // Scrolls of the page and of the element's scrolling ancestors (scroll events don't bubble).
  // Removed by hand: not every window implementation honours the `signal` option.
  win?.addEventListener('scroll', reposition, { capture: true, passive: true });
  win?.addEventListener('resize', reposition, { passive: true });
  signal.addEventListener('abort', () => {
    win?.removeEventListener('scroll', reposition, { capture: true });
    win?.removeEventListener('resize', reposition);
  });

  // ── A press elsewhere dismisses it ──────────────────────────────────────
  /** A bar under the pointer, by geometry (the canvas pointer handler's hit test, without the edit targets). */
  const onBar = (e: PointerEvent): boolean => {
    if (G.utilization.peek() !== null) return false; // the resource view has no bars
    try {
      const box = dom.canvasContainer.getBoundingClientRect();
      const y = e.clientY - box.top;
      const geo = G.geometries.peek()[Math.floor(y / G.config.peek().rowHeight)];
      return !!geo && hitTestBar(G.barVisual.peek()(geo), e.clientX - box.left, y, false) !== null;
    } catch {
      return false;
    }
  };
  doc.addEventListener(
    'pointerdown',
    e => {
      if (tooltip.visibleId() === null) return;
      const path = e.composedPath();
      if (path.includes(tooltip.element)) return;
      if (path.includes(dom.canvasContainer) && onBar(e)) return;
      tooltip.dismiss();
    },
    { capture: true, passive: true, signal },
  );
}
