// ─────────────────────────────────────────────────────────────
//  gantry · tooltip/tooltip-state.ts
//
//  State of the task tooltip, one per chart (provided by the canvas),
//  the Angular half of the Web Component's `layers/tooltip.ts` and
//  `interaction/tooltip-triggers.ts`. When it opens and closes is core's
//  tooltip machine (`reduceTooltip`, with the resolved `options.tooltip`:
//  `trigger`, `showDelay`, `hideDelay`): the state keeps the machine's
//  state and one timer and follows the transitions. Hover opens after the
//  show delay (at once when another bar's tooltip shows), keyboard focus
//  and a tap at once; the pointer can rest on the tooltip
//  (`enterTooltip` / `leaveTooltip`) and `dismiss` closes it.
//
//  What feeds it:
//   - the canvas' pointer handlers: `hover` / `unhover` / `tap`, and
//     `dismiss` when a drag starts;
//   - keyboard focus on a bar: `layout.focusVisibleBarId` (written by the
//     keyboard model) opens the bar's tooltip at once, `null` blurs it; a
//     request whose bar is not rendered yet (before the chart's first
//     render) opens once it is;
//   - the popover (GanttTooltipComponent): the pointer resting on it,
//     Escape, a press elsewhere, scrolls (`reanchor`);
//   - the chart: a drag or keyboard move mode starting dismisses it, so
//     does its bar's row going away; `tooltipEnabled` or the rules in
//     `options.tooltip` changing reset it (a new `render` alone doesn't).
//  The trigger effects are after-render effects (the tooltip is DOM
//  work: none of this runs on a server); each reads everything but its
//  trigger untracked (the keyboard-focus one also follows the mounted
//  rows while its bar is missing).
//
//  What it gives the popover: the open bar (`shown`: task, the row it
//  opened with, what opened it, the pointer x while hovering; `anchor`:
//  its bar element), the consumer's
//  `<ng-template ganttTooltip>` (`template`) and the popover's element id
//  (`elementId`, unique per chart), from which the bar outlet stamps
//  `aria-describedby` on the bar whose tooltip shows (`describedBy`). The
//  popover component is created on the first hover, focus or tap
//  (`requested`), so a chart nobody points at — and a server render —
//  has no popover.
// ─────────────────────────────────────────────────────────────

import {
  DOCUMENT,
  DestroyRef,
  ElementRef,
  Injectable,
  afterRenderEffect,
  computed,
  inject,
  signal,
  untracked,
  type Signal,
  type TemplateRef,
} from '@angular/core';
import {
  fromCalendarDays,
  initialTooltipState,
  reduceTooltip,
  tooltipVisibleId,
  type BarVisual,
  type GanttFlatRow,
  type RowGeometry,
  type TooltipEvent,
  type TooltipSource,
  type TooltipState,
} from '@gantryjs/core';

import { GanttDragService } from '../drag/gantt-drag.service';
import { GanttLayoutService } from '../layout/gantt-layout.service';
import { type GanttTooltipTemplateContext } from './gantt-tooltip-template.directive';

/** The bar whose open tooltip describes it (`aria-describedby`) */
export interface TooltipDescription {
  readonly taskId: string;
  /** The popover's element id */
  readonly id: string;
}

/** The tooltip that shows: its task, its row, what opened it and the pointer x it was placed for. */
export interface ShownTooltip {
  /** What the machine opened: the task id, or `<row key>:<day>` for a resource row's day */
  readonly id: string;
  readonly row: GanttFlatRow;
  readonly source: TooltipSource;
  /** Pointer x (client px) while hovering: the tooltip centres on it; `undefined` for focus and tap */
  readonly pointerX: number | undefined;
  /** The resource view's tooltip: the row (its key is the synthetic task's id) and the epoch day it describes */
  readonly resource?: ResourceDay | undefined;
}

/** A day of a resource row: the resource view's tooltip is about it */
export interface ResourceDay {
  readonly rowKey: string;
  /** The epoch-day index under the pointer */
  readonly day: number;
}

/**
 * What a tooltip is placed by: a bar element, or the day's cell of a resource row (a box measured on demand,
 * which has no element). Only what the placement reads.
 */
export interface TooltipAnchor {
  getBoundingClientRect(): DOMRect;
  readonly isConnected: boolean;
}

/** What pointed at a bar last, per source: its row, the bar element, the pointer x while hovering. */
interface Target {
  readonly row: GanttFlatRow;
  /** The bar element; a resource day's cell for the resource view */
  readonly el: TooltipAnchor;
  readonly x?: number | undefined;
  readonly resource?: ResourceDay | undefined;
}

/** The machine's id of a target: the task, or one day of a resource row (moving along a row follows the pointer day by day) */
const keyOf = (t: Target): string => (t.resource ? `${t.resource.rowKey}:${t.resource.day}` : t.row.task.id);

/** Bar visual of a row geometry (the chart's memoised `computeBarVisual`) */
type BarVisualOf = (geo: RowGeometry) => BarVisual;

let nextTooltipId = 0;

const sameValues = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/** The bar group (`[data-task-id]`) of an element inside it (callers may pass a bar's child). */
const barOf = (el: Element): Element => el.closest?.('[data-task-id]') ?? el;

@Injectable()
export class GanttTooltipState {
  private readonly drag = inject(GanttDragService);
  private readonly layout = inject(GanttLayoutService);
  /** Timers go through the document's window (none on the server) */
  private readonly win = inject(DOCUMENT).defaultView;
  /** The canvas host (the state is provided by the canvas): its bars layer holds the anchors */
  private readonly canvas = inject<ElementRef<Element>>(ElementRef).nativeElement;
  private readonly enabledSource = signal<() => boolean>(() => true);
  private readonly templateSource = signal<() => TemplateRef<GanttTooltipTemplateContext> | null>(() => null);
  private readonly barVisualSource = signal<(() => BarVisualOf) | null>(null);

  /** The chart's `tooltipEnabled` */
  private readonly enabled = computed(() => this.enabledSource()());

  // ── What shows ────────────────────────────────────────────

  private readonly shownSig = signal<ShownTooltip | null>(null);
  /** The tooltip that shows (open, or closing after the hide delay), `null` while closed */
  readonly shown: Signal<ShownTooltip | null> = this.shownSig.asReadonly();
  /** The row whose tooltip shows, `null` while closed */
  readonly row = computed<GanttFlatRow | null>(() => this.shownSig()?.row ?? null);
  /** Whether a tooltip shows */
  readonly open = computed(() => this.shownSig() !== null);
  /** What opened the tooltip that shows (`null` while closed) */
  readonly source = computed<TooltipSource | null>(() => this.shownSig()?.source ?? null);
  private readonly anchorEl = signal<TooltipAnchor | null>(null);
  /** What the tooltip is placed by (a bar's `g[data-task-id]` host, or a resource day's cell), `null` while closed */
  readonly anchor: Signal<TooltipAnchor | null> = this.anchorEl.asReadonly();

  /** A bar was hovered, focused or tapped at least once: the popover exists from then on */
  private readonly requestedFlag = signal(false);
  readonly requested: Signal<boolean> = this.requestedFlag.asReadonly();

  /** The consumer's `<ng-template ganttTooltip>` (`null`: `options.tooltip.render`, or the built-in content) */
  readonly template = computed<TemplateRef<GanttTooltipTemplateContext> | null>(() => this.templateSource()());

  /** Element id of the popover: unique per chart */
  readonly elementId = signal<string | null>(`gantt-tooltip-${++nextTooltipId}`);
  /** The bar the tooltip that shows describes and the popover's id (`aria-describedby`), `null` while closed */
  readonly describedBy = computed<TooltipDescription | null>(
    () => {
      const shown = this.shownSig();
      const id = this.elementId();
      return shown && id ? { taskId: shown.id, id } : null;
    },
    { equal: (a, b) => a === b || (!!a && !!b && a.taskId === b.taskId && a.id === b.id) },
  );

  // ── Machine ───────────────────────────────────────────────

  private machine: TooltipState = initialTooltipState();
  private timer: number | undefined;
  /** The last bar each source pointed at (the machine says which source opened the tooltip) */
  private targets: Partial<Record<TooltipSource, Target>> = {};
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.hide();
      this.destroyed = true;
    });

    // ── Triggers (the Web Component's tooltip-triggers effects) ──

    // Keyboard focus on a bar (keyboard modality only): opens its tooltip at once; `null` blurs it.
    // After the render, so a request made before the chart's first render finds its bar. One whose
    // bar is not mounted yet is tried again after each render that changes the mounted rows, until
    // the bar is there or focus moves on (a run that found it follows nothing more)
    afterRenderEffect(() => {
      const id = this.layout.focusVisibleBarId();
      if (id === null) {
        untracked(() => this.blur());
        return;
      }
      if (!untracked(() => this.focusBar(id))) this.layout.mountedGeometries();
    });

    // A drag or keyboard move mode starts: dismissed (it keeps its own Escape). Each session sets a
    // new state object when it starts and when it ends, so a session that started and ended between
    // two renders (a new idle state) still dismisses — after the keyboard focus that came with it
    let session = untracked(this.drag.state);
    afterRenderEffect(() => {
      const next = this.drag.state();
      untracked(() => {
        const started = next !== session && (next.kind !== 'idle' || session.kind === 'idle');
        session = next;
        if (started) this.dismiss();
      });
    });

    // Back to closed when the switch or the open / close rules change (a new `render` alone changes no rule)
    const rules = computed(
      () => {
        const t = this.layout.cfg().tooltip;
        return [this.enabled(), t.trigger, t.showDelay, t.hideDelay];
      },
      { equal: sameValues },
    );
    let ruled = false;
    afterRenderEffect(() => {
      rules();
      if (ruled) untracked(() => this.hide());
      ruled = true;
    });

    // Its bar's row goes away (removed, collapsed): dismissed
    afterRenderEffect(() => {
      const rows = this.layout.geometryById();
      untracked(() => {
        const shown = this.shownSig();
        const id = shown?.resource?.rowKey ?? shown?.id;
        if (id !== undefined && !rows.has(id)) this.dismiss();
      });
    });
  }

  /** The chart's `tooltipEnabled` (bound once by the canvas) */
  bindEnabled(enabled: () => boolean): void {
    this.enabledSource.set(enabled);
  }

  /** The consumer's `<ng-template ganttTooltip>` (bound once by the canvas) */
  bindTemplate(template: () => TemplateRef<GanttTooltipTemplateContext> | null): void {
    this.templateSource.set(template);
  }

  /**
   * The chart's bar visuals (the canvas' `barVisual`, bound once by it): a press on a bar's hit
   * area — handles included — is the canvas pointer handler's, not a press elsewhere (core
   * `hitTestBar`). Until they are bound, a press on a bar element is.
   */
  bindBarVisual(barVisual: () => BarVisualOf): void {
    this.barVisualSource.set(barVisual);
  }

  /** The bar visual of a row geometry (`null` until the canvas binds them) */
  barVisual(): BarVisualOf | null {
    return untracked(() => this.barVisualSource()?.() ?? null);
  }

  // ── Trigger API (the Web Component tooltip layer's) ───────

  /** A fine pointer is over `row`'s bar `el` at `clientX`: opens after the show delay (at once when another bar's shows). */
  hover(row: GanttFlatRow, el: Element, clientX: number): void {
    this.point('hover', { row, el, x: clientX });
  }

  /**
   * A fine pointer is over `day` (an epoch-day index) of the resource row `row` at `clientX`: opens after
   * the show delay (at once when the tooltip of another day or row shows). The tooltip sits by the day's cell.
   */
  hoverResource(row: GanttFlatRow, clientX: number, day: number): void {
    const resource = { rowKey: row.task.id, day };
    const el = this.dayCell(resource);
    if (el) this.point('hover', { row, el, x: clientX, resource });
  }

  /** The pointer left the bars: closes after the hide delay (unless it rests on the tooltip). */
  unhover(): void {
    this.send({ type: 'unhover' });
  }

  /** `row`'s bar `el` got keyboard focus: opens at once. */
  focus(row: GanttFlatRow, el: Element): void {
    this.point('focus', { row, el });
  }

  /** Keyboard focus left the bars: closes at once (unless the pointer rests on the tooltip). */
  blur(): void {
    this.send({ type: 'blur' });
  }

  /** A tap on `row`'s bar `el`: opens at once, or closes when it already shows for that bar. */
  tap(row: GanttFlatRow, el: Element): void {
    this.point('tap', { row, el });
  }

  /**
   * Closes now (Escape, drag or move-mode start, a press elsewhere, the row gone); the same bar
   * does not reopen it until the pointer or focus has left it. `true` when it was open or opening.
   */
  dismiss(): boolean {
    const pending = this.machine.phase !== 'closed';
    this.send({ type: 'dismiss' });
    return pending;
  }

  /** The pointer entered the tooltip: it stays open. */
  enterTooltip(): void {
    this.send({ type: 'enterTooltip' });
  }

  /** The pointer left the tooltip: closes after the hide delay. */
  leaveTooltip(): void {
    this.send({ type: 'leaveTooltip' });
  }

  /** Task whose tooltip shows now (open, or closing after the hide delay), else `null`. */
  visibleId(): string | null {
    return untracked(this.shownSig)?.id ?? null;
  }

  /**
   * The connected bar element of the tooltip that shows (scroll, resize): a bar rebuilt since it
   * opened is found again by its task id; without one the tooltip is dismissed (`null`).
   */
  reanchor(): TooltipAnchor | null {
    const shown = untracked(this.shownSig);
    const anchor = untracked(this.anchorEl);
    if (!shown || !anchor) return null;
    if (anchor.isConnected) return anchor;
    const again = shown.resource ? this.dayCell(shown.resource) : this.findBar(shown.id);
    if (!again) {
      this.send({ type: 'dismiss' });
      return null;
    }
    this.anchorEl.set(again);
    return again;
  }

  /** Closes now and forgets the pointer and focus (`tooltipEnabled` or `options.tooltip` change, destroy). */
  hide(): void {
    this.stopTimer();
    this.machine = initialTooltipState();
    this.targets = {};
    this.close();
  }

  // ── Internals ─────────────────────────────────────────────

  /** Keyboard focus on `id`'s bar: opens its tooltip when its row and its bar element are there (`false` when not). */
  private focusBar(id: string): boolean {
    const row = this.layout.geometryById().get(id)?.row;
    const el = this.findBar(id);
    if (!row || !el) return false;
    this.focus(row, el);
    return true;
  }

  /** Records what points at a bar and sends its event (nothing while the tooltip is off). */
  private point(source: TooltipSource, target: Target): void {
    if (this.destroyed || !untracked(this.enabled)) return;
    this.requestedFlag.set(true);
    this.targets[source] = target;
    this.send({ type: source, id: keyOf(target) });
  }

  /** Feeds the machine one event and follows its transition (state, timer, what shows). */
  private send(event: TooltipEvent): void {
    if (this.destroyed) return;
    const options = untracked(this.layout.cfg).tooltip;
    const t = reduceTooltip(this.machine, event, options);
    this.machine = t.state;
    if (t.timer !== null) {
      this.stopTimer();
      this.timer = this.win?.setTimeout(() => {
        this.timer = undefined;
        this.send({ type: 'timer' });
      }, t.timer);
    } else if (this.machine.phase === 'open' || this.machine.phase === 'closed') {
      this.stopTimer();
    }
    this.sync();
  }

  /** Shows what the machine's state says: the tooltip of `tooltipVisibleId(state)`, or nothing. */
  private sync(): void {
    const id = tooltipVisibleId(this.machine);
    if (id === null) this.close();
    else if (untracked(this.shownSig)?.id !== id) this.openFor(id);
  }

  /** Opens (or moves) the tooltip to `id`'s bar. */
  private openFor(id: string): void {
    const source = this.machine.source ?? 'hover';
    const own = this.targets[source];
    const target =
      own && keyOf(own) === id ? own : Object.values(this.targets).find(t => t !== undefined && keyOf(t) === id);
    const anchor =
      target &&
      (target.el.isConnected
        ? 'closest' in target.el
          ? barOf(target.el as Element)
          : target.el
        : target.resource
          ? this.dayCell(target.resource)
          : this.findBar(id));
    if (!target || !anchor || !untracked(this.enabled)) {
      // Nothing to anchor to (the bar went away) or the tooltip is off
      this.hide();
      return;
    }
    this.anchorEl.set(anchor);
    this.shownSig.set({
      id,
      row: target.row,
      source,
      pointerX: source === 'hover' ? target.x : undefined,
      ...(target.resource ? { resource: target.resource } : {}),
    });
  }

  private close(): void {
    if (untracked(this.shownSig) === null) return;
    this.shownSig.set(null);
    this.anchorEl.set(null);
  }

  private stopTimer(): void {
    if (this.timer !== undefined) this.win?.clearTimeout(this.timer);
    this.timer = undefined;
  }

  /**
   * The cell of `day` in the resource row `rowKey` (the canvas' x range of that day, the row's y range), a box
   * read from the canvas and the current timeline whenever it is placed — a zoom or a scroll moves it, as the
   * Web Component's. `null` while the row is not in the chart.
   */
  private dayCell(t: ResourceDay): TooltipAnchor | null {
    const layout = this.layout;
    const canvas = this.canvas;
    const geoOf = () => untracked(layout.geometryById).get(t.rowKey);
    if (!geoOf()) return null;
    return {
      get isConnected() {
        return canvas.isConnected && geoOf() !== undefined;
      },
      getBoundingClientRect() {
        const geo = geoOf();
        const { toX } = untracked(layout.timeline);
        const x0 = toX(fromCalendarDays(t.day));
        const x1 = toX(fromCalendarDays(t.day + 1));
        const box = canvas.getBoundingClientRect();
        const left = box.left + x0;
        const top = box.top + (geo?.y ?? 0);
        const height = geo?.height ?? 0;
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
  }

  /** The mounted bar element of `taskId` (`g[data-task-id]` in the canvas' bars layer), if any. */
  private findBar(taskId: string): Element | null {
    const layer = this.canvas.querySelector?.('.gantt-bars-layer');
    if (!layer) return null;
    for (const bar of layer.children) if (bar.getAttribute('data-task-id') === taskId) return bar;
    return null;
  }
}
