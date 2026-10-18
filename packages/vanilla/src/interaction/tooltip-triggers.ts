/**
 * @file tooltip-triggers.ts
 * What opens, closes and moves the task tooltip besides the pointer over the bars
 * (`interaction/canvas-pointer.ts`: `hover`, `unhover`, `tap`):
 *
 * - **Keyboard focus** on a bar: `tooltip.focus()` when `focusVisibleBarId` names a bar (focus
 *   reached from the keyboard, written by the keyboard handlers), `tooltip.blur()` when it goes
 *   back to `null`. A bar focused with the pointer opens nothing.
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
 * - **Dismiss / reset** without a user gesture: a drag or move mode starts (`dragPreview`),
 *   the bar's row goes away (checked when the tasks, the collapsed rows or the options change),
 *   and `tooltipEnabled` or the resolved rules (`config.tooltip`: `trigger`, `showDelay`,
 *   `hideDelay`, as Angular compares them) change: back to closed. Options that resolve to the
 *   same rules (`tooltip: {}` and no `tooltip`) change nothing.
 *
 * Bound by the engine when the element connects, inside the connection's owner: the effects are
 * disposed and every listener goes when `signal` aborts.
 */

import { hitTestBar, type ResolvedGanttConfig } from '@gantryjs/core';
import { computed, effect, untracked } from '../reactive';
import type { LayerContext } from '../layers/context';
import type { TooltipLayer } from '../layers/tooltip';

export interface TooltipTriggerOptions {
  readonly tooltip: TooltipLayer;
  /** Whether a model was painted (no tooltip before the first render) */
  readonly hasRendered: () => boolean;
  /** Aborted when the element disconnects: removes the listeners */
  readonly signal: AbortSignal;
}

const sameValues = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

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
  effect(() => {
    const id = I.focusVisibleBarId();
    untracked(() => {
      if (id === null) {
        tooltip.blur();
        return;
      }
      if (!opts.hasRendered()) return;
      try {
        const row = G.geoById.peek().get(id)?.row;
        const el = barElement(id);
        if (row && el) tooltip.focus(row, el);
      } catch {
        // invalid options: nothing is rendered
      }
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
    untracked(() => {
      const id = tooltip.visibleId();
      if (id === null) return;
      try {
        if (!G.geoById.peek().has(id)) tooltip.dismiss();
      } catch {
        tooltip.dismiss(); // invalid options: nothing is rendered
      }
    });
  });

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
  /** A bar under the pointer, by geometry (the canvas pointer handler's hit test). */
  const onBar = (e: PointerEvent): boolean => {
    try {
      const box = dom.canvasContainer.getBoundingClientRect();
      const y = e.clientY - box.top;
      const geo = G.geometries.peek()[Math.floor(y / G.config.peek().rowHeight)];
      return !!geo && hitTestBar(G.barVisual.peek()(geo), e.clientX - box.left, y) !== null;
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
