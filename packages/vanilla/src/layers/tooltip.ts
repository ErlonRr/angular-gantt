/**
 * @file tooltip.ts
 * The task tooltip: one `div.gantt-tooltip[popover=manual][role=tooltip][id]`, built once with
 * `h()` and appended to the shadow root. Not a region: it is driven by the pointer over the
 * canvas (`interaction/canvas-pointer.ts`: `hover`, `unhover`, `tap`) and by the tooltip triggers
 * (`interaction/tooltip-triggers.ts`: keyboard focus, Escape, the pointer resting on the tooltip,
 * scrolls, a press elsewhere, drags, option changes and its row's changes). D9's exception: it
 * measures its own size once per opening (and once per content refresh), and reads its bar's box
 * when it opens, when its content is refreshed and when the page or the timeline scrolls. It reads
 * the chart's state from the graph with `peek()`, so hovering never subscribes to anything; the
 * open tooltip's task id is a signal (`visibleId()`), which the triggers follow.
 *
 * When it opens and closes is core's tooltip machine (`reduceTooltip`, with the resolved
 * `options.tooltip`: `trigger`, `showDelay`, `hideDelay`): the layer keeps its state and one timer
 * and follows the transitions. Hover opens after the show delay (at once when another bar's
 * tooltip shows), keyboard focus and a tap at once; the pointer can rest on the tooltip
 * (`pointer-events: auto`, WCAG 1.4.13) and Escape dismisses it.
 *
 * Where it goes is core's `placeTooltip`: below its bar (above it without room), centred on the
 * pointer while hovering, on the visible part of the bar otherwise, kept 8 px from the viewport
 * edges, written as a CSSOM `translate`. While it shows, its bar carries `aria-describedby` with
 * the tooltip's id (the tooltip owns that attribute; it goes when the tooltip closes or moves to
 * another bar).
 *
 * The content is `buildTooltipModel()` written through `textContent` only (no markup, so a task
 * name or a label can never become HTML): the title, then a `<dl>` with one `dt` / `dd` group
 * per model row. Rows are keyed by kind, so a row keeps its nodes from one task to the next. The
 * progress row adds a track whose fill gets the progress as `--gantt-tt-progress` (the
 * stylesheet turns it into a width) and the model's progress paint, both through the CSSOM: the
 * colour of the row's resolved style (`G.rowStyle`, the one its bar is painted with), the critical
 * colour on the critical path. The critical path is the `gantt-tooltip--critical` class.
 * `options.tooltip.render(ctx)` replaces the title and the `<dl>` with `div.gantt-tooltip-custom`:
 * a returned DOM node is appended, a string (or a number) is shown as text; anything else (`null`,
 * `undefined`, `false`) keeps the built-in content, and so does a `render` that throws (reported
 * on the console).
 *
 * While it shows, the content follows its row: `refresh(row)` writes it again when the row's task
 * object, its critical flag, its float, its resolved style (field by field, core `sameTaskStyle`),
 * the i18n bundle (labels, locale, formats), how dates are read (core `sameDateReading`: end-date
 * rule, date-only normalisation, working calendar) or the baseline switch differ from what it was
 * written from, then measures and places it again. `render` runs again only then: never on a clock tick.
 *
 * The resource view (Phase 14) has no bars: a fine pointer over a resource row's timeline cell opens the
 * same tooltip for that row and day (`hoverLoad`, found by `interaction/tooltip-triggers.ts` with core
 * `hitTestLoad`; content from core `buildResourceTooltip`; no custom `render`). Its machine id is the
 * row and the day, its anchor the day's cell in the canvas (a virtual box, read from the canvas on
 * every placement); `refreshLoad()` writes it again when the utilization or the i18n bundle changed.
 *
 *   div.gantt-tooltip[popover=manual][role=tooltip][id]
 *     div.gantt-tooltip-title            built-in content
 *     dl.gantt-tooltip-rows > div.gantt-tooltip-row > dt.gantt-tooltip-label + dd.gantt-tooltip-value (+ dd.gantt-tooltip-track > div.gantt-tooltip-fill)
 *     div.gantt-tooltip-custom           instead of both, while `render` returns content
 */

import {
  TOOLTIP_HIDE_DELAY,
  TOOLTIP_SHOW_DELAY,
  buildResourceTooltip,
  buildTooltipModel,
  contributorsAt,
  dateReadingOf,
  fromCalendarDays,
  initialTooltipState,
  placeTooltip,
  reduceTooltip,
  sameDateReading,
  sameTaskStyle,
  tooltipVisibleId,
  type DateReading,
  type GanttFlatRow,
  type GanttI18n,
  type GanttTask,
  type ResolvedTaskStyle,
  type ResourceUtilization,
  type TooltipEvent,
  type TooltipMachineOptions,
  type TooltipModel,
  type TooltipRow,
  type TooltipSource,
  type TooltipState,
} from '@gantryjs/core';
import { h } from '../dom/h';
import { reconcile } from '../dom/keyed';
import { setAttr, setStyleProp, setText, toggleClass } from '../dom/patch';
import { signal } from '../reactive';
import type { LayerContext } from './context';
import { showNode } from './skeleton';

export interface TooltipLayer {
  /** The popover (`div.gantt-tooltip`): the triggers listen for the pointer resting on it */
  readonly element: HTMLElement;
  /** A fine pointer is over `row`'s bar `el` at `clientX`: opens after the show delay (at once when another bar's is open), anchored to `el`. */
  hover(row: GanttFlatRow, el: Element, clientX: number): void;
  /**
   * A fine pointer is over a resource row's timeline cell (the resource view): opens after the show delay (at
   * once when another one's is open), anchored to that day's cell, centred on `clientX` while hovering.
   */
  hoverLoad(target: LoadTooltipTarget, clientX: number): void;
  /** The pointer left the bars: closes after the hide delay (unless it rests on the tooltip). */
  unhover(): void;
  /** `row`'s bar `el` got keyboard focus: opens at once, anchored to `el`. */
  focus(row: GanttFlatRow, el: Element): void;
  /** Keyboard focus left the bar: closes at once (unless the pointer rests on the tooltip). */
  blur(): void;
  /** A tap on `row`'s bar `el`: opens at once, or closes when it is already open for that bar. */
  tap(row: GanttFlatRow, el: Element): void;
  /**
   * Closes now (Escape, drag or move-mode start, a press elsewhere, the row gone); the same bar
   * does not reopen it until the pointer or focus has left it. `true` when it was open or opening.
   */
  dismiss(): boolean;
  /** The pointer entered the tooltip: it stays open. */
  enterTooltip(): void;
  /** The pointer left the tooltip: closes after the hide delay. */
  leaveTooltip(): void;
  /**
   * Task whose tooltip shows now (open, or closing after the hide delay), else `null`. Tracked: an
   * effect that reads it runs again when the tooltip opens, closes or moves to another bar.
   */
  visibleId(): string | null;
  /** The resource row and day whose tooltip shows now, else `null`. Tracked, like `visibleId()`. */
  visibleLoad(): LoadTooltipTarget | null;
  /**
   * The open resource tooltip as the chart has it now: writes the content again, measures and places it, when
   * the utilization (tasks, resources, date reading) or the i18n bundle differ from what it was written from.
   * No-op for a task tooltip or while closed.
   */
  refreshLoad(): void;
  /**
   * The open tooltip's row as the chart has it now: writes the content again (the custom `render`
   * included), measures and places it, when the task object, the critical flag, the float, the
   * resolved style (its fields), the i18n bundle, the date reading (working calendar, end-date
   * rule) or the baseline switch differ from what the content was written from. No-op for another
   * task or while closed.
   */
  refresh(row: GanttFlatRow): void;
  /** Places the open tooltip by its bar again (scroll, resize): no size measurement; closes it when the bar is gone. */
  reposition(): void;
  /** Closes now and forgets the pointer and focus (`tooltipEnabled = false`, option change, disconnect). */
  hide(): void;
  /** Remove the popover. */
  destroy(): void;
}

// The default open / close delays are core's (`TOOLTIP_SHOW_DELAY`, `TOOLTIP_HIDE_DELAY`), re-exported for the tests
export { TOOLTIP_HIDE_DELAY, TOOLTIP_SHOW_DELAY };

/** The nodes of one `dt` / `dd` group. */
interface RowParts {
  readonly label: HTMLElement;
  readonly value: HTMLElement;
  /** Progress fill (the progress row only) */
  readonly fill: HTMLElement | null;
}

/** A resource row's day, the target of a resource tooltip (`hoverLoad`). */
export interface LoadTooltipTarget {
  /** The resource row's id (`res:<id>` | `team:<group>` | `unassigned`) */
  readonly rowKey: string;
  /** The epoch-day index (`calendarDays` units) */
  readonly day: number;
}

/** What opened (or may open) the tooltip of a bar: its row, the bar element, the pointer x while hovering. */
interface Target {
  readonly row: GanttFlatRow;
  readonly el: Element;
  readonly x?: number | undefined;
}

/** What opened (or may open) a resource tooltip: the row and day, the pointer x. */
interface LoadTarget {
  readonly load: LoadTooltipTarget;
  readonly x?: number | undefined;
}

/** What a tooltip is anchored to: a bar element, or the day's cell of a resource row (a box measured on demand). */
interface Anchor {
  getBoundingClientRect(): DOMRect;
  readonly isConnected: boolean;
}

/** The open tooltip: its id, what it is anchored to and the pointer x it was placed for. */
interface Shown {
  readonly id: string;
  anchor: Anchor;
  readonly pointerX: number | undefined;
}

/** The machine id of a resource tooltip (cannot be a task id). */
const loadId = (t: LoadTooltipTarget): string => `load\u001f${t.rowKey}\u001f${t.day}`;
const idOf = (t: Target | LoadTarget): string => ('load' in t ? loadId(t.load) : t.row.task.id);

/** `aria-describedby` goes on a bar element only: a resource tooltip's anchor is a virtual box. */
const describe = (anchor: Anchor, id: string | null): void => {
  if ('setAttribute' in anchor) setAttr(anchor as Element, 'aria-describedby', id);
};

/** What the content was written from: a refresh writes it again only when one of these changed. */
interface Painted {
  readonly task: GanttTask;
  readonly critical: boolean;
  /** Total float in measured days (`undefined`: not in the critical-path result) */
  readonly float: number | undefined;
  /** The row's resolved style (`undefined`: the task's own, while a `styles.rule` throws) */
  readonly style: ResolvedTaskStyle | undefined;
  readonly i18n: GanttI18n;
  /** How the duration, float and variance were read */
  readonly dates: DateReading;
  readonly baseline: boolean;
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

/**
 * What `options.tooltip.render` returned, as tooltip content: a DOM node (from any realm) as is,
 * a string or a number as text, anything else (`null`, `undefined`, `false`…) `null`: the
 * built-in content.
 */
function customContent(v: unknown): Node | string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return typeof v === 'object' && v !== null && typeof (v as Partial<Node>).nodeType === 'number' ? (v as Node) : null;
}

let uid = 0;

export function createTooltipLayer(ctx: LayerContext): TooltipLayer {
  const { inputs: I, graph: G, dom } = ctx;

  const tooltipId = `gantt-tooltip-${++uid}`;
  const title = h('div', { class: 'gantt-tooltip-title' });
  const list = h('dl', { class: 'gantt-tooltip-rows' });
  const custom = h('div', { class: 'gantt-tooltip-custom' });
  const popover = h(
    'div',
    { class: 'gantt-tooltip', attrs: { id: tooltipId, popover: 'manual', role: 'tooltip', hidden: true } },
    title,
    list,
  );
  ctx.shadow.appendChild(popover);

  const parts = new WeakMap<Element, RowParts>();
  let state: TooltipState = initialTooltipState();
  let timer = 0;
  /** The last bar each source pointed at (the machine says which source opened the tooltip) */
  let targets: Partial<Record<TooltipSource, Target | LoadTarget>> = {};
  let shown: Shown | null = null;
  /** `shown?.id`, tracked (`visibleId()`) */
  const shownId = signal<string | null>(null);
  /** The resource row and day shown, tracked (`visibleLoad()`) */
  const shownLoad = signal<LoadTooltipTarget | null>(null);
  let painted: Painted | null = null;
  /** What a resource tooltip's content was written from */
  let paintedLoad: { utilization: ResourceUtilization | null; i18n: GanttI18n } | null = null;
  let destroyed = false;
  /** Border-box size, measured when the tooltip opens and when a refresh rewrites its content */
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

  /** The row's resolved style (its bar's); the task's own when a `styles.rule` throws (the bars region reports it). */
  const styleOf = (row: GanttFlatRow): ResolvedTaskStyle | undefined => {
    try {
      return G.rowStyle.peek()(row);
    } catch {
      return undefined;
    }
  };

  /** Writes `row`'s content: the custom `render` result, or the built-in title and rows. */
  const paintContent = (row: GanttFlatRow): void => {
    const config = G.config.peek();
    const i18n = G.i18n.peek();
    const cpm = G.critical.peek();
    const style = styleOf(row);
    const model = buildTooltipModel({
      task: row.task,
      hasChildren: row.hasChildren,
      barType: row.barType,
      config,
      labels: i18n.labels,
      locale: i18n.locale,
      dateFormat: i18n.formats.dateFormat,
      now: I.nowTick.peek(),
      criticalIds: cpm?.criticalIds,
      floatDays: cpm?.floatMap,
      tasksById: G.columnCtx.peek().taskById,
      style,
    });
    painted = {
      task: row.task,
      critical: model.critical,
      float: cpm?.floatMap.get(row.task.id),
      style,
      i18n,
      dates: dateReadingOf(config),
      baseline: config.baseline,
    };
    let content: Node | string | null = null;
    const render = config.tooltip.render;
    if (render) {
      try {
        content = customContent(render({ model, task: row.task, row }));
      } catch (err) {
        console.error('[gantry] tooltip render error:', err);
      }
    }
    toggleClass(popover, 'gantt-tooltip--critical', model.critical);
    if (content !== null) {
      showNode(popover, title, false);
      showNode(popover, list, false);
      showNode(popover, custom, true);
      // A string becomes a text node (never parsed as markup)
      custom.replaceChildren(content);
      return;
    }
    showNode(popover, custom, false);
    showNode(popover, list, true);
    showNode(popover, title, true, list);
    paintModel(model);
  };

  /** Writes the resource tooltip of `t`; `false` when its row is gone (the options changed under it). */
  const paintLoadContent = (t: LoadTooltipTarget): boolean => {
    const utilization = G.utilization.peek();
    const load = utilization?.rows.get(t.rowKey);
    if (!utilization || !load) return false;
    const i18n = G.i18n.peek();
    const model = buildResourceTooltip({
      load,
      day: t.day,
      contributors: contributorsAt(G.tasks.peek(), G.resourceIndex.peek(), G.dateReading.peek(), t.rowKey, t.day),
      labels: i18n.labels,
      locale: i18n.locale,
      dateFormat: i18n.formats.dateFormat,
    });
    paintedLoad = { utilization, i18n };
    toggleClass(popover, 'gantt-tooltip--critical', false);
    showNode(popover, custom, false);
    showNode(popover, list, true);
    showNode(popover, title, true, list);
    paintModel(model);
    return true;
  };

  /** The day's cell of a resource row in the canvas, measured on demand (`null` when the row is gone). */
  const loadAnchor = (t: LoadTooltipTarget): Anchor | null => {
    const geo = G.geoById.peek().get(t.rowKey);
    if (!geo) return null;
    const { toX } = G.timeline.peek();
    const x0 = toX(fromCalendarDays(t.day));
    const x1 = toX(fromCalendarDays(t.day + 1));
    const { y, height } = geo;
    return {
      get isConnected() {
        return dom.canvasContainer.isConnected;
      },
      getBoundingClientRect() {
        const box = dom.canvasContainer.getBoundingClientRect();
        const left = box.left + x0;
        const top = box.top + y;
        return {
          x: left,
          y: top,
          left,
          top,
          width: x1 - x0,
          height,
          right: left + (x1 - x0),
          bottom: top + height,
          toJSON: () => ({}),
        };
      },
    };
  };

  /** The mounted bar element of `taskId` (`g[data-task-id]` in the bars layer), if any. */
  const findBar = (taskId: string): Element | null => {
    for (const bar of dom.bars.children) if (bar.getAttribute('data-task-id') === taskId) return bar;
    return null;
  };
  /** The bar group of an element inside it (callers may pass a bar's child). */
  const barOf = (el: Element): Element => el.closest?.('[data-task-id]') ?? el;

  const place = (): void => {
    if (!shown) return;
    const p = placeTooltip({
      anchor: shown.anchor.getBoundingClientRect(),
      pointerX: shown.pointerX,
      size: { width, height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
    setStyleProp(popover, 'translate', `${p.x}px ${p.y}px`);
  };

  /** One layout read: the tooltip's size (its content just changed). */
  const measure = (): void => {
    const box = popover.getBoundingClientRect();
    width = box.width;
    height = box.height;
  };

  const close = (): void => {
    if (!shown) return;
    describe(shown.anchor, null);
    shown = null;
    shownId.set(null);
    shownLoad.set(null);
    try {
      popover.hidePopover();
    } catch {
      // No Popover API, or already closed (the element left the document)
    }
    setAttr(popover, 'hidden', true);
  };

  const stopTimer = (): void => {
    window.clearTimeout(timer);
    timer = 0;
  };

  /** Back to the closed state, forgetting the pointer and focus. */
  const reset = (): void => {
    stopTimer();
    state = initialTooltipState();
    targets = {};
    close();
  };

  /** Opens (or moves) the tooltip to `id`'s bar (or resource day): content, popover, one measurement, placement. */
  const open = (id: string): void => {
    const source = state.source;
    const own = source ? targets[source] : undefined;
    const target = own && idOf(own) === id ? own : Object.values(targets).find(t => t !== undefined && idOf(t) === id);
    const anchor: Anchor | null | undefined =
      target && ('load' in target ? loadAnchor(target.load) : target.el.isConnected ? barOf(target.el) : findBar(id));
    if (!target || !anchor || !I.tooltipEnabled.peek()) {
      // Nothing to anchor to (the bar went away) or the tooltip is off
      reset();
      return;
    }
    if ('load' in target) {
      if (!paintLoadContent(target.load)) {
        reset();
        return;
      }
    } else {
      paintContent(target.row);
    }
    if (!shown) {
      setAttr(popover, 'hidden', false);
      try {
        popover.showPopover();
      } catch {
        // No Popover API (or not connected): the `hidden` attribute alone shows and hides it
      }
    } else if (shown.anchor !== anchor) {
      describe(shown.anchor, null);
    }
    shown = { id, anchor, pointerX: source === 'hover' ? target.x : undefined };
    describe(anchor, tooltipId);
    // One layout read per opening; scrolls only re-read the bar's box
    measure();
    place();
    // Last: the triggers start following this row (its content is written already)
    shownId.set(id);
    shownLoad.set('load' in target ? target.load : null);
  };

  /** Shows what the machine's state says: the tooltip of `tooltipVisibleId(state)`, or nothing. */
  const sync = (): void => {
    const id = tooltipVisibleId(state);
    if (id === null) close();
    else if (shown?.id !== id) open(id);
  };

  /** Feeds the machine one event and follows its transition (state, timer, popover). */
  const send = (event: TooltipEvent): void => {
    if (destroyed) return;
    let options: TooltipMachineOptions;
    try {
      options = G.config.peek().tooltip;
    } catch {
      return; // invalid options: nothing is rendered
    }
    const t = reduceTooltip(state, event, options);
    state = t.state;
    if (t.timer !== null) {
      stopTimer();
      timer = window.setTimeout(() => {
        timer = 0;
        send({ type: 'timer' });
      }, t.timer);
    } else if (state.phase === 'open' || state.phase === 'closed') {
      stopTimer();
    }
    sync();
  };

  /** Places the open tooltip by its bar again: a rebuilt bar is found again, a bar gone closes it. */
  const reposition = (): void => {
    if (!shown) return;
    if (!shown.anchor.isConnected) {
      // The bar was rebuilt (a custom bar re-rendered), or its row left the window
      const again = findBar(shown.id);
      if (!again) {
        send({ type: 'dismiss' });
        return;
      }
      shown.anchor = again;
      describe(again, tooltipId);
    }
    place();
  };

  /** Records what points at a bar and sends its event (nothing while the tooltip is off). */
  const point = (source: TooltipSource, target: Target | LoadTarget): void => {
    if (destroyed || !I.tooltipEnabled.peek()) return;
    targets[source] = target;
    send({ type: source, id: idOf(target) });
  };

  const layer: TooltipLayer = {
    element: popover,
    hover(row, el, clientX) {
      point('hover', { row, el, x: clientX });
    },
    hoverLoad(load, clientX) {
      point('hover', { load, x: clientX });
    },
    unhover() {
      send({ type: 'unhover' });
    },
    focus(row, el) {
      point('focus', { row, el });
    },
    blur() {
      send({ type: 'blur' });
    },
    tap(row, el) {
      point('tap', { row, el });
    },
    dismiss() {
      const pending = state.phase !== 'closed';
      send({ type: 'dismiss' });
      return pending;
    },
    enterTooltip() {
      send({ type: 'enterTooltip' });
    },
    leaveTooltip() {
      send({ type: 'leaveTooltip' });
    },
    visibleId: () => shownId(),
    visibleLoad: () => shownLoad(),
    refreshLoad() {
      const t = shownLoad.peek();
      if (destroyed || !shown || !t) return;
      let utilization: ResourceUtilization | null;
      let i18n: GanttI18n;
      try {
        utilization = G.utilization.peek();
        i18n = G.i18n.peek();
      } catch {
        return; // invalid options: nothing is rendered
      }
      if (paintedLoad && paintedLoad.utilization === utilization && paintedLoad.i18n === i18n) return;
      // The row may be gone (a resource removed): the triggers dismiss it
      const anchor = loadAnchor(t);
      if (!anchor || !paintLoadContent(t)) return;
      shown.anchor = anchor;
      measure();
      reposition();
    },
    refresh(row) {
      const id = row.task.id;
      if (destroyed || shown?.id !== id) return;
      let cpm: ReturnType<typeof G.critical.peek>;
      let config: ReturnType<typeof G.config.peek>;
      try {
        cpm = G.critical.peek();
        config = G.config.peek();
      } catch {
        return; // invalid options: nothing is rendered
      }
      const i18n = G.i18n.peek();
      if (
        painted &&
        painted.task === row.task &&
        painted.critical === (cpm?.criticalIds.has(id) ?? false) &&
        Object.is(painted.float, cpm?.floatMap.get(id)) &&
        sameTaskStyle(painted.style, styleOf(row)) &&
        painted.i18n === i18n &&
        sameDateReading(painted.dates, config) &&
        painted.baseline === config.baseline
      ) {
        return;
      }
      paintContent(row);
      measure();
      reposition();
    },
    reposition,
    hide: reset,
    destroy() {
      reset();
      destroyed = true;
      popover.remove();
    },
  };
  return layer;
}
