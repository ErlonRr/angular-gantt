/**
 * @file tooltip.ts
 * The task tooltip: one `div[popover=manual][role=tooltip].gantt-tooltip`, built once with `h()`
 * and appended to the shadow root. Not a region: it follows the pointer, driven by
 * `interaction/canvas-pointer.ts` (D9's exception — it measures its own size once each time it
 * opens). It reads the chart's state from the graph with `peek()` when it opens, so hovering
 * never subscribes to anything.
 *
 * The content is `buildTooltipModel()` written through `textContent` only (no markup, so a task
 * name or a label can never become HTML): the title, then a `<dl>` with one `dt` / `dd` group
 * per model row. Rows are keyed by kind, so a row keeps its nodes from one task to the next. The
 * progress row adds a track whose fill gets the progress as `--gantt-tt-progress` (the
 * stylesheet turns it into a width) and the model's progress paint, both through the CSSOM. The
 * critical path is the `gantt-tooltip--critical` class, and the position is a CSSOM `translate`.
 */

import { buildTooltipModel, type GanttFlatRow, type TooltipModel, type TooltipRow } from '@gantry/core';
import { h } from '../dom/h';
import { reconcile } from '../dom/keyed';
import { setAttr, setStyleProp, setText, toggleClass } from '../dom/patch';
import type { LayerContext } from './context';

export interface TooltipLayer {
  /** The pointer is over `row`'s bar (shows the tooltip after a delay). */
  enter(row: GanttFlatRow, e: PointerEvent): void;
  /** The pointer moved: follow it while visible. */
  move(e: PointerEvent): void;
  /** The pointer left the bars (hides after a short delay). */
  leave(): void;
  /** Hide now (drag start, `tooltipEnabled = false`, disconnect). */
  hide(): void;
  /** Remove the popover. */
  destroy(): void;
}

/** How long the pointer rests on a bar before the tooltip opens (ms). */
export const TOOLTIP_SHOW_DELAY = 320;
/** How long the tooltip stays open after the pointer left the bars (ms). */
export const TOOLTIP_HIDE_DELAY = 120;
/** Distance from the pointer (px). */
const OFFSET_X = 12;
const OFFSET_Y = 8;
/** Smallest gap kept to the viewport edges (px). */
const EDGE = 8;

/** The nodes of one `dt` / `dd` group. */
interface RowParts {
  readonly label: HTMLElement;
  readonly value: HTMLElement;
  /** Progress fill (the progress row only) */
  readonly fill: HTMLElement | null;
}

/** Stable keys for the rows: kind plus occurrence (`date:0`, `date:1`, `progress:0`…). */
function rowKeys(rows: readonly TooltipRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map(row => {
    const kind = row.kind ?? 'row';
    const n = seen.get(kind) ?? 0;
    seen.set(kind, n + 1);
    return `${kind}:${n}`;
  });
}

export function createTooltipLayer(ctx: LayerContext): TooltipLayer {
  const { inputs: I, graph: G } = ctx;

  const title = h('div', { class: 'gantt-tooltip-title' });
  const list = h('dl', { class: 'gantt-tooltip-rows' });
  const popover = h(
    'div',
    { class: 'gantt-tooltip', attrs: { popover: 'manual', role: 'tooltip', hidden: true } },
    title,
    list,
  );
  ctx.shadow.appendChild(popover);

  const parts = new WeakMap<Element, RowParts>();
  let row: GanttFlatRow | null = null;
  let visible = false;
  let destroyed = false;
  let showTimer = 0;
  let hideTimer = 0;
  let lastX = 0;
  let lastY = 0;
  /** Border-box size, measured when the tooltip opens (its content is fixed while it is open) */
  let width = 0;
  let height = 0;

  const createRow = (item: TooltipRow): HTMLElement => {
    const label = h('dt', { class: 'gantt-tooltip-label' });
    const value = h('dd', { class: 'gantt-tooltip-value' });
    if (item.kind !== 'progress') {
      const el = h('div', { class: 'gantt-tooltip-row' }, label, value);
      parts.set(el, { label, value, fill: null });
      return el;
    }
    const fill = h('div', { class: 'gantt-tooltip-fill' });
    const track = h('dd', { class: 'gantt-tooltip-track', attrs: { 'aria-hidden': 'true' } }, fill);
    const el = h('div', { class: ['gantt-tooltip-row', 'gantt-tooltip-row--progress'] }, label, value, track);
    parts.set(el, { label, value, fill });
    return el;
  };

  const paintModel = (m: TooltipModel): void => {
    setText(title, m.title);
    toggleClass(popover, 'gantt-tooltip--critical', m.critical);
    const keys = rowKeys(m.rows);
    reconcile(
      list,
      m.rows,
      (_, i) => keys[i]!,
      createRow,
      (el, item) => {
        const p = parts.get(el)!;
        setText(p.label, item.label);
        setText(p.value, item.value);
        if (p.fill) {
          setStyleProp(p.fill, '--gantt-tt-progress', m.progress ?? 0);
          setStyleProp(p.fill, 'background-color', m.paint.progress);
        }
      },
    );
  };

  const position = (): void => {
    let x = lastX + OFFSET_X;
    let y = lastY + OFFSET_Y;
    if (x + width > window.innerWidth - EDGE) x = lastX - width - OFFSET_X;
    if (y + height > window.innerHeight - EDGE) y = lastY - height - OFFSET_Y;
    setStyleProp(popover, 'translate', `${Math.round(Math.max(EDGE, x))}px ${Math.round(Math.max(EDGE, y))}px`);
  };

  const clearTimers = (): void => {
    window.clearTimeout(showTimer);
    window.clearTimeout(hideTimer);
    showTimer = 0;
    hideTimer = 0;
  };

  const show = (): void => {
    showTimer = 0;
    if (!row || destroyed || !I.tooltipEnabled.peek()) return;
    const i18n = G.i18n.peek();
    const cpm = G.critical.peek();
    paintModel(
      buildTooltipModel({
        task: row.task,
        hasChildren: row.hasChildren,
        barType: row.barType,
        config: G.config.peek(),
        labels: i18n.labels,
        locale: i18n.locale,
        dateFormat: i18n.formats.dateFormat,
        now: I.nowTick.peek(),
        criticalIds: cpm?.criticalIds,
        floatDays: cpm?.floatMap,
        tasksById: G.columnCtx.peek().taskById,
      }),
    );
    if (!visible) {
      visible = true;
      setAttr(popover, 'hidden', false);
      try {
        popover.showPopover();
      } catch {
        // No Popover API (or not connected): the `hidden` attribute alone shows and hides it
      }
    }
    // One layout read per opening; moves only write `translate`
    const box = popover.getBoundingClientRect();
    width = box.width;
    height = box.height;
    position();
  };

  const hide = (): void => {
    clearTimers();
    row = null;
    if (!visible) return;
    visible = false;
    try {
      popover.hidePopover();
    } catch {
      // No Popover API, or already closed (the element left the document)
    }
    setAttr(popover, 'hidden', true);
  };

  return {
    enter(next, e) {
      if (destroyed) return;
      lastX = e.clientX;
      lastY = e.clientY;
      window.clearTimeout(hideTimer);
      hideTimer = 0;
      if (visible && row?.task.id === next.task.id) return;
      // Hover intent: the delay restarts while the pointer keeps moving before the tooltip opens
      row = next;
      window.clearTimeout(showTimer);
      showTimer = window.setTimeout(show, TOOLTIP_SHOW_DELAY);
    },
    move(e) {
      lastX = e.clientX;
      lastY = e.clientY;
      if (visible) position();
    },
    leave() {
      window.clearTimeout(showTimer);
      showTimer = 0;
      if (!visible) {
        row = null;
        return;
      }
      // Keeps the first deadline: every move off the bars calls `leave()` again
      if (!hideTimer) hideTimer = window.setTimeout(hide, TOOLTIP_HIDE_DELAY);
    },
    hide,
    destroy() {
      hide();
      destroyed = true;
      popover.remove();
    },
  };
}
