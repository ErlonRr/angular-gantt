// ─────────────────────────────────────────────────────────────
//  gantry · tooltip/gantt-tooltip.component.ts
//
//  The task tooltip: one popover per chart, in the canvas template —
//  inside <gantry>, so it inherits the theme's `--gantt-*` tokens.
//  Markup, classes and stylesheet are the Web Component's
//  (packages/vanilla/src/layers/tooltip.ts, styles/tooltip.css.ts);
//  the component's host is the popover itself:
//
//    div.gantt-tooltip[popover=manual][role=tooltip](.gantt-tooltip--critical)[hidden while closed]
//      div.gantt-tooltip-title
//      dl.gantt-tooltip-rows
//        div.gantt-tooltip-row(.gantt-tooltip-row--progress)
//          dt.gantt-tooltip-label · dd.gantt-tooltip-value
//          (dd.gantt-tooltip-track[aria-hidden] > div.gantt-tooltip-fill)
//
//  The content is `buildTooltipModel()` of the open row (GanttTooltipState),
//  written as text only (`[textContent]`: a task name never becomes markup).
//  Rows are keyed by kind + occurrence, so they keep their nodes from one
//  task to the next; the closed popover keeps its last content. The
//  progress (`--gantt-tt-progress`) and the fill's paint are style
//  bindings. Opening, closing and placement are DOM work in an
//  afterRenderEffect: showPopover() / hidePopover() once per opening (the
//  `hidden` attribute alone where the Popover API is missing), one size
//  measurement per content, then a `translate` per pointer move.
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  Renderer2,
  RendererStyleFlags2,
  afterRenderEffect,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import {
  buildTooltipModel,
  type GanttTask,
  type Paint,
  type ResolvedGanttConfig,
  type TooltipModel,
} from '@gantryjs/core';

import { GanttI18nService } from '../services/gantt-i18n.service';
import { GanttTooltipState } from './tooltip-state';

/** What the tooltip reads besides the row: how dates are read, the clock, the critical path and the task index */
export interface TooltipContext {
  /** Date reading (`endDateMode`, `normalizeDateOnly`) and the baseline rows (`baseline`) */
  readonly config: Pick<ResolvedGanttConfig, 'endDateMode' | 'normalizeDateOnly' | 'baseline'>;
  /** Clock for the status (the timeline's `now`) */
  readonly now: Date;
  /** Critical task ids — adds the critical-path row */
  readonly criticalIds?: ReadonlySet<string> | undefined;
  /** Total float per task id in days (CPM `floatMap`) — adds the float row */
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

/** Distance from the pointer (px), as in the Web Component */
const OFFSET_X = 12;
const OFFSET_Y = 8;
/** Smallest gap kept to the viewport edges (px) */
const EDGE = 8;

@Component({
  selector: 'div[ganttTooltip]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'gantt-tooltip',
    popover: 'manual',
    role: 'tooltip',
    '[attr.hidden]': "open() ? null : ''",
    '[class.gantt-tooltip--critical]': 'model()?.critical === true',
  },
  template: `
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
  `,
  // The Web Component's tooltip stylesheet (styles/tooltip.css.ts), `.gantt-tooltip` being the host
  styles: [
    `
      :host {
        position: fixed;
        inset: 0 auto auto 0;
        margin: 0;
        z-index: 9999;
        pointer-events: none;
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
        opacity: 0.6;
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
    `,
  ],
})
export class GanttTooltipComponent {
  /** Date reading, clock, critical path and task index of the chart */
  readonly context = input.required<TooltipContext>();

  private readonly state = inject(GanttTooltipState);
  private readonly i18n = inject(GanttI18nService);
  private readonly doc = inject(DOCUMENT);
  private readonly renderer = inject(Renderer2);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** The open row's model; `null` while closed */
  private readonly openModel = computed<TooltipModel | null>(() => {
    const row = this.state.row();
    if (!row) return null;
    const ctx = this.context();
    return buildTooltipModel({
      task: row.task,
      hasChildren: row.hasChildren,
      barType: row.barType,
      config: ctx.config,
      labels: this.i18n.labels(),
      locale: this.i18n.locale(),
      dateFormat: this.i18n.formats().dateFormat,
      now: ctx.now,
      criticalIds: ctx.criticalIds,
      floatDays: ctx.floatDays,
      tasksById: ctx.tasksById,
    });
  });

  protected readonly open = computed(() => this.openModel() !== null);

  /** What the popover shows: the open row's model, kept while closed (the rows keep their nodes) */
  protected readonly model = linkedSignal<TooltipModel | null, TooltipModel | null>({
    source: this.openModel,
    computation: (next, previous) => next ?? previous?.value ?? null,
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
  private shown = false;
  /** Content measured last, and its border-box size */
  private measured: TooltipModel | null = null;
  private width = 0;
  private height = 0;

  constructor() {
    // DOM work after the render: open / close the popover, measure it once per content, place it
    afterRenderEffect(() => this.place(this.open() ? this.model() : null, this.state.pointer()));
  }

  private place(model: TooltipModel | null, pointer: { x: number; y: number }): void {
    const el = this.host;
    if (!model) {
      if (this.shown) {
        this.shown = false;
        try {
          el.hidePopover();
        } catch {
          // No Popover API, or already closed: the `hidden` attribute hides it
        }
      }
      this.measured = null;
      return;
    }
    if (!this.shown) {
      this.shown = true;
      try {
        el.showPopover();
      } catch {
        // No Popover API (or not connected): removing `hidden` alone shows it
      }
    }
    // One layout read per content; moves only write `translate`
    if (this.measured !== model) {
      const box = el.getBoundingClientRect();
      this.width = box.width;
      this.height = box.height;
      this.measured = model;
    }
    const view = this.doc.defaultView;
    const vw = view?.innerWidth ?? this.doc.documentElement.clientWidth;
    const vh = view?.innerHeight ?? this.doc.documentElement.clientHeight;
    let x = pointer.x + OFFSET_X;
    let y = pointer.y + OFFSET_Y;
    if (x + this.width > vw - EDGE) x = pointer.x - this.width - OFFSET_X;
    if (y + this.height > vh - EDGE) y = pointer.y - this.height - OFFSET_Y;
    this.renderer.setStyle(
      el,
      'translate',
      `${Math.round(Math.max(EDGE, x))}px ${Math.round(Math.max(EDGE, y))}px`,
      RendererStyleFlags2.DashCase,
    );
  }
}
