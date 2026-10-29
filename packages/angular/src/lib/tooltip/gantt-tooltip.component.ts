// ─────────────────────────────────────────────────────────────
//  gantry · tooltip/gantt-tooltip.component.ts
//
//  The task tooltip: one popover per chart, in the canvas template —
//  inside <gantry>, so it inherits the theme's `--gantt-*` tokens.
//  Markup, classes and stylesheet are the Web Component's
//  (packages/vanilla/src/layers/tooltip.ts, styles/tooltip.css.ts);
//  the component's host is the popover itself:
//
//    div.gantt-tooltip[popover=manual][role=tooltip][id](.gantt-tooltip--critical)[hidden while closed]
//      div.gantt-tooltip-title
//      dl.gantt-tooltip-rows
//        div.gantt-tooltip-row(.gantt-tooltip-row--progress)
//          dt.gantt-tooltip-label · dd.gantt-tooltip-value
//          (dd.gantt-tooltip-track[aria-hidden] > div.gantt-tooltip-fill)
//      div.gantt-tooltip-custom          instead of both, for custom content
//
//  When it shows is the chart's GanttTooltipState (core `reduceTooltip`).
//  The content is `buildTooltipModel()` of the row that shows, written as
//  text only (`[textContent]`: a task name never becomes markup). Rows
//  are keyed by kind + occurrence, so they keep their nodes from one task
//  to the next; the closed popover keeps its last content. The progress
//  (`--gantt-tt-progress`) and the fill's paint are style bindings: the
//  colour of the row's resolved style (`layout.rowStyle()`, the one its
//  bar is painted with; the task's own when a `styles.rule` throws), the
//  critical colour on the critical path.
//  Custom content replaces the title and the rows: the consumer's
//  `<ng-template ganttTooltip>` (it wins), else `options.tooltip.render`
//  — a returned DOM node is appended, a string (or a number) is shown as
//  text; `null` / `undefined` / `false` keep the built-in content, and so
//  does a `render` that throws (reported on the console).
//
//  While it shows, the content follows its row (the Web Component's
//  `refresh(row)`): it is built again — the template's context and
//  `render` included — for a new opening and when the row's task object
//  (looked up by id in the layout as it is now), its critical flag, its
//  float, its resolved style (field by field, core `sameTaskStyle`: the
//  progress colour), the i18n bundle (labels, locale, formats), how dates
//  are read (core `sameDateReading`: end-date rule, date-only
//  normalisation, working calendar) or the baseline switch change. The
//  clock and the task index are read when it is built, never followed: a
//  clock tick builds nothing.
//
//  The resource view (`rows: 'resources'`, Phase 14) has no bars: a pointer over a resource row's
//  timeline cell opens the same popover for that row and day (`GanttTooltipState.hoverResource`, core
//  `hitTestLoad`); its content is core's `buildResourceTooltip` (the day's load, the capacity, what is
//  over it, the tasks that weigh on it), built again when the utilization (tasks, resources, date
//  reading) or the i18n bundle change. It is placed by its row, centred on the pointer.
//
//  Where it goes is core's `placeTooltip`: below its bar (above it
//  without room), centred on the pointer while hovering, on the visible
//  part of the bar otherwise, kept 8 px from the viewport edges, written
//  as a `translate`. DOM work in after-render effects: showPopover() /
//  hidePopover() once per opening (the `hidden` attribute alone where the
//  Popover API is missing), one size measurement per opening and per
//  content refresh, the bar's box read then (a bar gone dismisses it) and
//  on every scroll or resize.
//
//  Its listeners (the Web Component's tooltip triggers), bound after the
//  first render and released with it: the pointer resting on it keeps it
//  open (`pointer-events: auto`, WCAG 1.4.13); Escape on the chart, in the
//  capture phase, dismisses it and consumes the key (D24: before the
//  selection is cleared) unless a drag or move mode owns Escape or a text
//  input has focus; Escape elsewhere in the page closes it without
//  consuming the key; a press outside it and off the bars dismisses it;
//  the timeline's, the page's scrolls and window resizes move it with
//  its bar.
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  Renderer2,
  RendererStyleFlags2,
  afterNextRender,
  afterRenderEffect,
  computed,
  inject,
  input,
  linkedSignal,
  untracked,
  viewChild,
  type TemplateRef,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  buildResourceTooltip,
  buildTooltipModel,
  contributorsAt,
  dateReadingOf,
  hitTestBar,
  placeTooltip,
  sameDateReading,
  sameTaskStyle,
  type DateReading,
  type GanttFlatRow,
  type GanttI18n,
  type GanttTask,
  type Paint,
  type ResolvedGanttConfig,
  type ResolvedTaskStyle,
  type ResourceUtilization,
  type TooltipModel,
} from '@gantryjs/core';

import { GanttDragService } from '../drag/gantt-drag.service';
import { GanttLayoutService } from '../layout/gantt-layout.service';
import { GanttI18nService } from '../services/gantt-i18n.service';
import { type GanttTooltipTemplateContext } from './gantt-tooltip-template.directive';
import { GanttTooltipState, type ShownTooltip, type TooltipAnchor } from './tooltip-state';

/**
 * What the tooltip reads besides the row: how dates are read, the clock, the critical path and the
 * task index. Only the critical flag of the row that shows is followed; the rest is read when the
 * content is built.
 */
export interface TooltipContext {
  /** Date reading (`endDateMode`, `normalizeDateOnly`, `calendar`), the baseline rows (`baseline`) and `tooltip.render` */
  readonly config: Pick<ResolvedGanttConfig, 'endDateMode' | 'normalizeDateOnly' | 'calendar' | 'baseline' | 'tooltip'>;
  /** Clock for the status (the timeline's `now`) */
  readonly now: Date;
  /** Critical task ids — adds the critical-path row */
  readonly criticalIds?: ReadonlySet<string> | undefined;
  /** Total float per task id in measured days (CPM `floatMap`) — adds the float row */
  readonly floatDays?: ReadonlyMap<string, number> | undefined;
  /** Every task by id — names predecessors and finds successors */
  readonly tasksById?: ReadonlyMap<string, GanttTask> | undefined;
}

/** One `dt` / `dd` group of the template */
interface TooltipRowView {
  /** Kind and occurrence (`date:0`, `date:1`, `progress:0`…): a row keeps its nodes from one task to the next */
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** Progress 0–100 of the progress row (its track); `null` for the other rows */
  readonly progress: number | null;
  readonly paint: Paint;
}

/** What the open tooltip's content is built from, besides what is read at build time */
interface TooltipSource {
  /** The opening: a new one builds the content again */
  readonly shown: ShownTooltip;
  /** Its row as the layout has it now (the row it opened with once it is gone: the state dismisses it) */
  readonly row: GanttFlatRow;
  readonly critical: boolean;
  /** Its total float in measured days (`undefined`: not in the critical-path result) */
  readonly float: number | undefined;
  /** Its row's resolved style (`undefined` while a `styles.rule` throws: the task's own) */
  readonly style: ResolvedTaskStyle | undefined;
  /** Labels, locale and formats */
  readonly i18n: GanttI18n;
  /** How the duration, float and variance are read: end-date rule, date-only normalisation, working calendar */
  readonly dates: DateReading;
  /** Whether baseline rows show */
  readonly baseline: boolean;
  /** The resource view's tooltip follows the utilization (`null` for a task): any change of tasks, resources or dates */
  readonly utilization: ResourceUtilization | null;
}

/**
 * Same content: the same opening, task object, critical flag, float, style fields, i18n bundle,
 * date reading, baseline switch and (a resource row's day) utilization (a new row object alone is
 * not a change, nor a new style object with the same fields).
 */
const sameSource = (a: TooltipSource | null, b: TooltipSource | null): boolean =>
  a === b ||
  (!!a &&
    !!b &&
    a.shown === b.shown &&
    a.row.task === b.row.task &&
    a.critical === b.critical &&
    Object.is(a.float, b.float) &&
    sameTaskStyle(a.style, b.style) &&
    a.i18n === b.i18n &&
    sameDateReading(a.dates, b.dates) &&
    a.baseline === b.baseline &&
    a.utilization === b.utilization);

/** The opening the popover shows, its row and its model */
interface TooltipView {
  readonly shown: ShownTooltip;
  readonly row: GanttFlatRow;
  readonly model: TooltipModel;
}

/** Custom content: the consumer's template (with its context), or what `options.tooltip.render` returned */
type TooltipContent =
  | {
      readonly template: TemplateRef<GanttTooltipTemplateContext>;
      readonly context: GanttTooltipTemplateContext;
      readonly value?: undefined;
    }
  | { readonly template?: undefined; readonly value: Node | string };

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

/** Typing into an input or an editable cell keeps its own Escape. */
function isEditable(target: EventTarget | undefined): boolean {
  const el = target as Partial<HTMLElement> | undefined;
  return (
    !!el &&
    typeof el.tagName === 'string' &&
    (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable === true)
  );
}

@Component({
  selector: 'div[ganttTooltip]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  host: {
    class: 'gantt-tooltip',
    popover: 'manual',
    role: 'tooltip',
    '[attr.id]': 'state.elementId()',
    '[attr.hidden]': "open() ? null : ''",
    '[class.gantt-tooltip--critical]': 'model()?.critical === true',
    '(pointerenter)': 'state.enterTooltip()',
    '(pointerleave)': 'state.leaveTooltip()',
  },
  template: `
    @let custom = content();
    @if (custom) {
      @if (custom.template; as template) {
        <div class="gantt-tooltip-custom">
          <ng-container [ngTemplateOutlet]="template" [ngTemplateOutletContext]="custom.context" />
        </div>
      } @else {
        <div #customHost class="gantt-tooltip-custom"></div>
      }
    } @else {
      <div class="gantt-tooltip-title" [textContent]="model()?.title ?? ''"></div>
      <dl class="gantt-tooltip-rows">
        @for (r of rows(); track r.key) {
          <div class="gantt-tooltip-row" [class.gantt-tooltip-row--progress]="r.progress !== null">
            <dt class="gantt-tooltip-label" [textContent]="r.label"></dt>
            <dd class="gantt-tooltip-value" [textContent]="r.value"></dd>
            @if (r.progress !== null) {
              <dd class="gantt-tooltip-track" aria-hidden="true">
                <div
                  class="gantt-tooltip-fill"
                  [style.--gantt-tt-progress]="r.progress"
                  [style.background-color]="r.paint"
                ></div>
              </dd>
            }
          </div>
        }
      </dl>
    }
  `,
  // The Web Component's tooltip stylesheet (styles/tooltip.css.ts), `.gantt-tooltip` being the host
  styles: [
    `
      :host {
        position: fixed;
        inset: 0 auto auto 0;
        margin: 0;
        z-index: 9999;
        pointer-events: auto;
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid var(--gantt-tooltip-bdr);
        background: var(--gantt-tooltip-bg);
        color: var(--gantt-tooltip-txt);
        font-family: var(--gantt-font);
        font-size: 12px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        max-width: 280px;
        min-width: 160px;
      }
      :host([hidden]) {
        display: none;
      }
      .gantt-tooltip-title {
        font-weight: 600;
        font-size: 13px;
        margin-bottom: 6px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .gantt-tooltip-rows,
      .gantt-tooltip-rows dd {
        margin: 0;
      }
      .gantt-tooltip-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 2px;
      }
      .gantt-tooltip-label {
        /* 0.75 of the tooltip text keeps AA contrast (6.4:1 light, 9:1 dark; 0.6 was 4.0:1) */
        opacity: 0.75;
      }
      .gantt-tooltip-row--progress {
        flex-wrap: wrap;
        row-gap: 3px;
        margin: 6px 0 0;
      }
      .gantt-tooltip-track {
        flex: 0 0 100%;
        height: 3px;
        overflow: hidden;
        background: rgba(127, 127, 127, 0.25);
        border-radius: 2px;
      }
      .gantt-tooltip-fill {
        height: 100%;
        border-radius: 2px;
        inline-size: calc(var(--gantt-tt-progress, 0) * 1%);
      }
      .gantt-tooltip-custom {
        overflow-wrap: anywhere;
      }

      /* Print (Gantry 2 phase 12, D17; styles/print.css.ts): Ctrl+P prints no tooltip, open or not */
      @media print {
        :host {
          display: none;
        }
      }

      /* Forced colours (D25): Canvas / CanvasText with a CanvasText border, labels at full
         opacity; the progress track outlined, its fill CanvasText (inline paint: !important) */
      @media (forced-colors: active) {
        :host {
          background-color: Canvas;
          color: CanvasText;
          border-color: CanvasText;
        }
        .gantt-tooltip-label {
          opacity: 1;
        }
        .gantt-tooltip-track {
          background-color: Canvas;
          outline: 1px solid CanvasText;
        }
        .gantt-tooltip-fill {
          background-color: CanvasText !important;
        }
      }
    `,
  ],
})
export class GanttTooltipComponent {
  /** Date reading, clock, critical path, task index and `tooltip.render` of the chart */
  readonly context = input.required<TooltipContext>();

  protected readonly state = inject(GanttTooltipState);
  private readonly i18n = inject(GanttI18nService);
  private readonly layout = inject(GanttLayoutService);
  private readonly drag = inject(GanttDragService);
  private readonly doc = inject(DOCUMENT);
  private readonly renderer = inject(Renderer2);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly customHost = viewChild<ElementRef<HTMLElement>>('customHost');

  /**
   * What the open tooltip's content follows: the opening, its row as the layout has it now, its
   * critical flag and float, its resolved style, the i18n bundle, the date reading and the baseline
   * switch. The cut-off keeps the clock out: a tick may rebuild the rows (a sort by status) and the
   * context, but not the task, the critical set, the style fields, the labels or the date reading (a
   * rolled-up parent gets a new copy only when the day of `now` moves on).
   */
  private readonly source = computed<TooltipSource | null>(
    () => {
      const shown = this.state.shown();
      if (!shown) return null;
      // A resource row's day is described by the row (its key is the synthetic task's id), not by a task
      const resource = shown.resource;
      const row = this.layout.geometryById().get(resource?.rowKey ?? shown.id)?.row ?? shown.row;
      const ctx = this.context();
      return {
        shown,
        row,
        critical: resource ? false : (ctx.criticalIds?.has(shown.id) ?? false),
        float: resource ? undefined : ctx.floatDays?.get(shown.id),
        style: this.styleOf(row),
        i18n: this.i18n.bundle(),
        dates: dateReadingOf(ctx.config),
        baseline: ctx.config.baseline,
        utilization: resource ? this.layout.utilization() : null,
      };
    },
    { equal: sameSource },
  );

  /** The row that shows and its model; `null` while closed. Built again only when `source` changes. */
  private readonly openView = computed<TooltipView | null>(() => {
    const src = this.source();
    if (!src) return null;
    const { shown, row, style, i18n } = src;
    // Read when the content is built, never followed: the clock, the task index and the rest of the config
    return untracked(() => {
      const ctx = this.context();
      if (shown.resource) {
        // The resource view: the row's load on that day and the tasks that weigh on it (core `buildResourceTooltip`)
        const load = src.utilization?.rows.get(shown.resource.rowKey);
        if (!load) return null;
        const day = shown.resource.day;
        const contributors = contributorsAt(this.layout.tasks(), this.layout.resourceIndex(), src.dates, load.key, day);
        const resourceModel = buildResourceTooltip({
          load,
          day,
          contributors,
          labels: i18n.labels,
          locale: i18n.locale,
          dateFormat: i18n.formats.dateFormat,
        });
        return { shown, row, model: resourceModel };
      }
      const model = buildTooltipModel({
        task: row.task,
        hasChildren: row.hasChildren,
        barType: row.barType,
        config: ctx.config,
        labels: i18n.labels,
        locale: i18n.locale,
        dateFormat: i18n.formats.dateFormat,
        now: ctx.now,
        criticalIds: ctx.criticalIds,
        floatDays: ctx.floatDays,
        tasksById: ctx.tasksById,
        style,
      });
      return { shown, row, model };
    });
  });

  protected readonly open = computed(() => this.openView() !== null);

  /** What the popover shows: the open row and its model, kept while closed (the rows keep their nodes) */
  private readonly view = linkedSignal<TooltipView | null, TooltipView | null>({
    source: this.openView,
    computation: (next, previous) => next ?? previous?.value ?? null,
  });

  protected readonly model = computed<TooltipModel | null>(() => this.view()?.model ?? null);

  /**
   * Custom content instead of the title and rows: the template, else `render`'s result (`null`:
   * built-in). `render` runs when the content is built (an opening or its row's change), never for a
   * new `render` function alone or a clock tick.
   */
  protected readonly content = computed<TooltipContent | null>(() => {
    const view = this.view();
    if (!view) return null;
    const { row, model } = view;
    const template = this.state.template();
    if (template) return { template, context: { $implicit: model, model, task: row.task, row } };
    const render = untracked(this.context).config.tooltip.render;
    if (!render) return null;
    try {
      // Consumer code: none of the signals it reads belongs to the tooltip
      const value = customContent(untracked(() => render({ model, task: row.task, row })));
      return value === null ? null : { value };
    } catch (err) {
      console.error('[gantry] tooltip render error:', err);
      return null;
    }
  });

  /** The model rows, keyed by kind and occurrence */
  protected readonly rows = computed<TooltipRowView[]>(() => {
    const m = this.model();
    if (!m) return [];
    const seen = new Map<string, number>();
    return m.rows.map(row => {
      const kind = row.kind ?? 'row';
      const n = seen.get(kind) ?? 0;
      seen.set(kind, n + 1);
      return {
        key: `${kind}:${n}`,
        label: row.label,
        value: row.value,
        progress: row.kind === 'progress' ? (m.progress ?? 0) : null,
        paint: m.paint.progress,
      };
    });
  });

  /** The popover is showing (Popover API) */
  private popoverOpen = false;
  /** The content measured last (an opening or a refresh), and the popover's border-box size then */
  private measured: TooltipView | null = null;
  private width = 0;
  private height = 0;

  constructor() {
    // `render`'s node or text, written into div.gantt-tooltip-custom (a string becomes a text node,
    // never markup) before the popover is measured
    afterRenderEffect({
      write: () => {
        const el = this.customHost()?.nativeElement;
        const value = this.content()?.value;
        if (el && value !== undefined) el.replaceChildren(value);
      },
    });
    // Open / close the popover; measure it and place it by its bar once per opening and once per
    // content refresh (after the render that wrote the new content)
    afterRenderEffect(() => {
      const shown = this.state.shown();
      const view = this.openView();
      untracked(() => this.follow(shown, view));
    });
    afterNextRender(() => this.connect());
  }

  /** The row's resolved style (its bar's); the task's own when a `styles.rule` throws. */
  private styleOf(row: GanttFlatRow): ResolvedTaskStyle | undefined {
    try {
      return this.layout.rowStyle()(row);
    } catch {
      return undefined;
    }
  }

  private follow(shown: ShownTooltip | null, view: TooltipView | null): void {
    const el = this.host;
    if (!shown || !view) {
      if (this.popoverOpen) {
        this.popoverOpen = false;
        try {
          el.hidePopover();
        } catch {
          // No Popover API, or already closed: the `hidden` attribute hides it
        }
      }
      this.measured = null;
      return;
    }
    if (!this.popoverOpen) {
      this.popoverOpen = true;
      try {
        el.showPopover();
      } catch {
        // No Popover API (or not connected): removing `hidden` alone shows it
      }
    }
    // One layout read per opening and per content refresh; scrolls only re-read the bar's box
    if (this.measured === view) return;
    const box = el.getBoundingClientRect();
    this.width = box.width;
    this.height = box.height;
    this.measured = view;
    // A bar rebuilt since it opened is found again; a bar gone dismisses the tooltip
    const anchor = this.state.reanchor();
    if (anchor) this.place(shown, anchor);
  }

  /** Writes core's placement by `anchor`'s box as the popover's `translate`. */
  private place(shown: ShownTooltip, anchor: TooltipAnchor): void {
    const view = this.doc.defaultView;
    const p = placeTooltip({
      anchor: anchor.getBoundingClientRect(),
      pointerX: shown.pointerX,
      size: { width: this.width, height: this.height },
      viewport: {
        width: view?.innerWidth ?? this.doc.documentElement.clientWidth,
        height: view?.innerHeight ?? this.doc.documentElement.clientHeight,
      },
    });
    this.renderer.setStyle(this.host, 'translate', `${p.x}px ${p.y}px`, RendererStyleFlags2.DashCase);
  }

  /** Scrolls and resizes: the open tooltip moves with its bar (closed when the bar is gone). */
  private readonly reposition = (): void => {
    const shown = this.state.shown();
    if (!shown || this.measured?.shown !== shown) return;
    const anchor = this.state.reanchor();
    if (anchor) this.place(shown, anchor);
  };

  /** Escape on the chart (capture phase): closes the tooltip that shows and consumes the key. */
  private readonly onChartKeydown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || this.state.visibleId() === null) return;
    // A drag or move mode cancels on Escape (it dismissed the tooltip when it started anyway)
    if (this.drag.isActive() || this.drag.preview() !== null) return;
    if (isEditable(e.composedPath()[0])) return;
    this.state.dismiss();
    e.preventDefault();
    e.stopPropagation();
  };

  /** A press outside the tooltip and off the bars dismisses it (a press on a bar is the canvas'). */
  private onPointerDown(e: PointerEvent, svg: Element | null): void {
    if (this.state.visibleId() === null) return;
    const path = e.composedPath();
    if (path.includes(this.host)) return;
    if (svg && path.includes(svg) && this.onBar(e, svg)) return;
    this.state.dismiss();
  }

  /** A bar under the pointer, by geometry (the canvas pointer handler's hit test, core `hitTestBar`). */
  private onBar(e: PointerEvent, svg: Element): boolean {
    // The resource view has no bars: a press anywhere on the rows dismisses the tooltip
    if (this.layout.resourceMode()) return false;
    const visualOf = this.state.barVisual();
    if (!visualOf) {
      // Bar visuals not bound: the bar elements themselves
      const target = e.target as Partial<Element> | null;
      return !!target?.closest?.('.gantt-bars-layer > [data-task-id]');
    }
    const box = svg.getBoundingClientRect();
    const y = e.clientY - box.top;
    const geo = this.layout.rowGeometries()[Math.floor(y / this.layout.cfg().rowHeight)];
    // The bar's own hit area: the edit targets (progress grip, link connectors) are no bar press here
    return !!geo && hitTestBar(visualOf(geo), e.clientX - box.left, y, false) !== null;
  }

  /** Binds the listeners on the chart, the page and the window; released with the component. */
  private connect(): void {
    const doc = this.doc;
    const win = doc.defaultView;
    const chart = this.host.closest<HTMLElement>('.gantry') ?? this.host;
    const viewport = this.host.closest('.gantry-canvas-viewport');
    // The timeline <svg>: bar coordinates start at its top-left corner
    const svg = this.host.parentElement?.querySelector('svg') ?? null;

    const onDocKeydown = (e: KeyboardEvent): void => {
      // A hover tooltip while keyboard focus is elsewhere in the page: Escape still closes it, but the
      // key stays the page's (it may close a dialog too)
      if (e.key !== 'Escape' || e.isComposing || this.state.visibleId() === null) return;
      if (!e.composedPath().includes(chart)) this.state.dismiss();
    };
    const onDocPointerDown = (e: PointerEvent): void => this.onPointerDown(e, svg);

    chart.addEventListener('keydown', this.onChartKeydown, { capture: true });
    doc.addEventListener('keydown', onDocKeydown, { capture: true });
    doc.addEventListener('pointerdown', onDocPointerDown, { capture: true, passive: true });
    viewport?.addEventListener('scroll', this.reposition, { passive: true });
    // Scrolls of the page and of the chart's scrolling ancestors (scroll events don't bubble)
    win?.addEventListener('scroll', this.reposition, { capture: true, passive: true });
    win?.addEventListener('resize', this.reposition, { passive: true });

    this.destroyRef.onDestroy(() => {
      chart.removeEventListener('keydown', this.onChartKeydown, { capture: true });
      doc.removeEventListener('keydown', onDocKeydown, { capture: true });
      doc.removeEventListener('pointerdown', onDocPointerDown, { capture: true });
      viewport?.removeEventListener('scroll', this.reposition);
      win?.removeEventListener('scroll', this.reposition, { capture: true });
      win?.removeEventListener('resize', this.reposition);
    });
  }
}
