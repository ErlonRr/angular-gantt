// ─────────────────────────────────────────────────────────────
//  gantry · layout/gantt-canvas.component.ts
//
//  Timeline body. Everything it draws comes from the @gantry/core
//  render model (shared with the Web Component): non-working bands,
//  period delimiters, rows, annotations, today, dependency arrows and
//  bars. Bars are rendered through this chart's bar registry (built-in
//  bars + `provideGanttBar` along the injector hierarchy), so custom bar
//  components receive the computed geometry in `ctx.visual`.
//
//  Windowed like the Web Component, from the chart's layout graph:
//  rows, row separators and bars of the mounted rows (virtual window +
//  pinned rows), bands and vertical grid lines inside the horizontal
//  window, the arrows whose span meets the window (`buildArrowIndex`),
//  annotations and the today line over the window's height.
//
//  Bars sit directly in `g.gantt-bars-layer` (one `[ganttBarOutlet]` per
//  mounted row, the dragged bar dimmed by its outlet). The task tooltip is
//  one popover per chart (`div[ganttTooltip]`, created on the first hover)
//  driven by delegated pointer handlers on the <svg>, like the Web
//  Component's `interaction/canvas-pointer.ts`: moving over a bar
//  (`closest('[data-task-id]')`) enters it, moving off the bars or leaving
//  the canvas leaves it, a drag start hides it.
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
  inject,
  signal,
  type ElementRef,
  type Signal,
  viewChild,
} from '@angular/core';

import {
  type RowGeometry,
  type GanttAnnotation,
  type GanttBarContext,
  type GanttFlatRow,
  type GanttLayoutParams,
  type GanttTask,
  type GanttTheme,
  DependencyType,
  type TaskDragEvent,
  type TaskResizeEvent,
} from '../types';
import {
  buildArrowIndex,
  computeArrowVisual,
  taskSpan,
  rowPaint,
  annotationPaint,
  themeMetrics,
  sameThemeMetrics,
  PAINTS,
  type ArrowLink,
  type ArrowVisual,
  type BarVisual,
} from '@gantry/core';

import { GanttBarRegistry } from '../bar-registry';
import { GanttBarOutletDirective } from '../bars/bar-outlet.directive';
import { GanttArrowComponent } from '../arrows/gantt-arrow.component';
import { GanttDragService } from '../drag/gantt-drag.service';
import { GanttDragPreviewComponent } from '../drag/gantt-drag-preview.component';
import { GanttSelectionService } from '../selection/gantt-selection.service';
import { GanttI18nService } from '../services/gantt-i18n.service';
import { GanttThemeService } from '../services/gantt-theme.service';
import { GanttLayoutService } from './gantt-layout.service';
import { GanttTooltipComponent, type TooltipContext } from '../tooltip/gantt-tooltip.component';
import { GanttTooltipState } from '../tooltip/tooltip-state';

let nextCanvasId = 0;

/** Bar visual of a row geometry, memoised by the chart (`computeBarVisual`); serves off-window rows too */
export type BarVisualOf = (geo: RowGeometry) => BarVisual;

/** A dependency arrow of the window: its key in the arrow index and its visual */
interface MountedArrow {
  readonly key: string;
  readonly visual: ArrowVisual;
}

@Component({
  selector: 'gantt-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GanttArrowComponent, GanttDragPreviewComponent, GanttTooltipComponent, GanttBarOutletDirective],
  // One registry per chart (built-in bars, then `provideGanttBar` from the outermost to the nearest
  // level) and one tooltip
  providers: [GanttBarRegistry, GanttTooltipState],
  host: {
    '[style.cursor]': 'cursor()',
  },
  template: `
    @let tl = timeline();
    @let height = layout.totalHeight();
    @let span = layout.windowSpan();
    <div [style.width.px]="tl.totalWidth" [style.height.px]="height">
      <!-- Pointer selection; the keyboard path to bars is the roving-focus model (Gantry 2 phase 9) -->
      <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events -->
      <svg
        #svgEl
        [attr.width]="tl.totalWidth"
        [attr.height]="height"
        role="list"
        [attr.aria-label]="i18n.labels().ariaChart"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
        (pointerleave)="tooltip.leave()"
        (click)="onClick($event)"
        (dblclick)="onDblClick($event)"
      >
        @if (hatch()) {
          <defs>
            <pattern
              [attr.id]="uid + '-hatch'"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="6"
                [style.stroke]="paints.hatch"
                stroke-width="1.5"
                stroke-opacity="0.35"
              />
            </pattern>
          </defs>
        }

        <!-- Rows: the mounted rows (virtual window + pinned rows) -->
        <g class="gantt-rows" aria-hidden="true">
          @for (geo of layout.mountedGeometries(); track geo.row.task.id) {
            <svg:rect
              [attr.x]="0"
              [attr.y]="geo.y"
              [attr.width]="tl.totalWidth"
              [attr.height]="geo.height"
              [style.fill]="rowPaint(geo, selSvc.isSelected(geo.row.task.id))"
            />
          }
        </g>

        <!-- Non-working time inside the horizontal window (full height: unchanged by a vertical scroll) -->
        <g class="gantt-bands" aria-hidden="true" pointer-events="none">
          <!-- Keyed by kind and x like the Web Component: a rebuilt timeline keeps the rects -->
          @for (band of layout.bandWindow(); track band.kind + ':' + band.x) {
            <svg:rect
              [attr.class]="'gantt-band gantt-band--' + band.kind + (band.className ? ' ' + band.className : '')"
              [attr.x]="band.x"
              y="0"
              [attr.width]="band.width"
              [attr.height]="height"
              [style.fill]="band.paint"
            />
            @if (hatch() && band.kind !== 'intensive') {
              <svg:rect
                [attr.x]="band.x"
                y="0"
                [attr.width]="band.width"
                [attr.height]="height"
                [attr.fill]="'url(#' + uid + '-hatch)'"
              />
            }
          }
        </g>

        <!-- Grid: minor lines, row separators, period delimiters (vertical lines inside the horizontal window) -->
        <g class="gantt-grid" aria-hidden="true" pointer-events="none" shape-rendering="crispEdges">
          @let lines = layout.lineWindow();
          @if (config().gridLines.minor; as minor) {
            @for (x of lines.minor; track $index) {
              <svg:line
                class="gantt-grid-minor"
                [attr.x1]="x + 0.5"
                y1="0"
                [attr.x2]="x + 0.5"
                [attr.y2]="height"
                [style.stroke]="minor.paint"
                [attr.stroke-width]="minor.width"
                [attr.stroke-dasharray]="minor.dash ?? null"
              />
            }
          }
          @if (config().gridLines.horizontal; as hz) {
            @for (geo of layout.mountedGeometries(); track geo.row.task.id) {
              <svg:line
                class="gantt-grid-row"
                [attr.x1]="0"
                [attr.y1]="geo.y + geo.height - 0.5"
                [attr.x2]="tl.totalWidth"
                [attr.y2]="geo.y + geo.height - 0.5"
                [style.stroke]="hz.paint"
                [attr.stroke-width]="hz.width"
                [attr.stroke-dasharray]="hz.dash ?? null"
              />
            }
          }
          @if (config().gridLines.major; as major) {
            @for (x of lines.major; track $index) {
              <svg:line
                class="gantt-grid-major"
                [attr.x1]="x + 0.5"
                y1="0"
                [attr.x2]="x + 0.5"
                [attr.y2]="height"
                [style.stroke]="major.paint"
                [attr.stroke-width]="major.width"
                [attr.stroke-dasharray]="major.dash ?? null"
              />
            }
          }
        </g>

        <!-- Annotations (over the window's height) -->
        <g class="gantt-annotations" aria-hidden="true" pointer-events="none">
          @for (ann of resolvedAnnotations(); track $index) {
            @if (ann.x2 !== null) {
              <svg:rect
                [attr.x]="ann.x1"
                [attr.y]="span.top"
                [attr.width]="ann.x2 - ann.x1"
                [attr.height]="span.bottom - span.top"
                [style.fill]="ann.paint"
                [attr.opacity]="ann.opacity ?? 0.08"
              />
            }
            <svg:line
              [attr.x1]="ann.x1"
              [attr.y1]="span.top"
              [attr.x2]="ann.x1"
              [attr.y2]="span.bottom"
              [style.stroke]="ann.paint"
              stroke-width="1.5"
              stroke-dasharray="5 3"
              opacity="0.8"
            />
          }
        </g>

        <!-- Today: the exact clock tick on the (daily) timeline -->
        @let todayX = layout.todayX();
        @if (todayX !== null) {
          <svg:line
            class="gantt-today"
            [attr.x1]="todayX"
            [attr.y1]="span.top"
            [attr.x2]="todayX"
            [attr.y2]="span.bottom"
            [style.stroke]="paints.today"
            stroke-width="2"
            pointer-events="none"
          />
        }

        <!-- Dependency arrows crossing the window, in drawing order -->
        <g class="gantt-arrows">
          @for (a of arrows(); track a.key) {
            <g ganttArrow [arrow]="a.visual" [fontPx]="fontPx()"></g>
          }
        </g>

        <!-- Bars: g.gantt-bars-layer > g[data-task-id] (each outlet inserts its bar before its anchor) -->
        <g class="gantt-bars-layer">
          @let dragged = dragSvc.activeTaskId();
          @for (ctx of bars(); track ctx.row.task.id) {
            <ng-container
              [ganttBarOutlet]="registry.resolve(ctx.row.barType)"
              [ganttBarOutletCtx]="ctx"
              [ganttBarOutletDimmed]="dragged === ctx.row.task.id"
            />
          }
        </g>

        <!-- Annotation labels (above the bars) -->
        <g class="gantt-annotation-labels" aria-hidden="true" pointer-events="none">
          @for (ann of resolvedAnnotations(); track $index) {
            @if (ann.label) {
              <svg:text
                [attr.x]="ann.x1 + 6"
                [attr.y]="span.top + 14"
                [style.fill]="ann.label.color ?? ann.paint"
                [attr.font-size]="ann.label.fontSize ?? fontPx() - 1"
                [attr.font-weight]="ann.label.fontWeight ?? 600"
              >
                {{ ann.label.text }}
              </svg:text>
            }
          }
        </g>

        <!-- Drag preview ghost -->
        <g
          ganttDragPreview
          [preview]="dragSvc.preview()"
          [geometry]="dragGeometry()"
          [config]="config()"
          [timeline]="tl"
          [fontPx]="fontPx()"
        ></g>
      </svg>
      <!-- Task tooltip: one popover per chart, from the first hover on -->
      @if (tooltip.requested()) {
        <div ganttTooltip [context]="tooltipContext()"></div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
        outline: none;
      }
      :host > div {
        position: relative;
      }
      :host > div > svg {
        display: block;
        overflow: visible;
      }
      .gantt-annotation-labels text {
        user-select: none;
      }
    `,
  ],
})
export class GanttCanvasComponent {
  /** Bar visuals of the chart (memoised per geometry; restarts with the config, timeline, critical path and metrics) */
  readonly barVisual = input.required<BarVisualOf>();
  readonly annotations = input<GanttAnnotation[]>([]);
  readonly criticalIds = input<ReadonlySet<string>>(new Set());
  readonly enableDrag = input<boolean>(true);
  readonly enableSelection = input<boolean>(true);
  readonly multiSelect = input<boolean>(true);
  readonly tooltipEnabled = input<boolean>(true);
  /** Total float per task id (CPM `floatMap`, when the critical path is on) — tooltip float row */
  readonly floatDays = input<ReadonlyMap<string, number> | undefined>(undefined);
  /** Every task by id — tooltip predecessor names and successors */
  readonly tasksById = input<ReadonlyMap<string, GanttTask> | undefined>(undefined);

  readonly taskDragged = output<TaskDragEvent>();
  readonly taskResized = output<TaskResizeEvent>();
  readonly rowClick = output<RowGeometry>();
  readonly rowDblClick = output<GanttFlatRow>();

  /** Unique per instance: SVG ids live in the light DOM */
  protected readonly uid = `gantry-${++nextCanvasId}`;
  private readonly svgEl = viewChild<ElementRef<SVGSVGElement>>('svgEl');
  protected readonly registry = inject(GanttBarRegistry);
  protected readonly dragSvc = inject(GanttDragService);
  protected readonly selSvc = inject(GanttSelectionService);
  protected readonly i18n = inject(GanttI18nService);
  /** The chart's layout graph: timeline, windows, geometries, clock */
  protected readonly layout = inject(GanttLayoutService);
  private readonly themeSvc = inject(GanttThemeService);

  protected readonly config = this.layout.cfg;
  protected readonly timeline = this.layout.timeline;
  /** Resolved theme: custom bars' `ctx.theme` */
  protected readonly theme: Signal<Required<GanttTheme>> = this.themeSvc.resolvedTheme;
  /** Label font; a colour-only theme change keeps it */
  private readonly metrics = computed(() => themeMetrics(this.theme()), { equal: sameThemeMetrics });
  protected readonly fontPx = computed(() => this.metrics().fontPx);
  protected readonly hatch = computed(() => this.config().nonWorking?.style === 'hatch');
  protected readonly snapUnit = computed<'day' | 'hour'>(() => {
    const scales = this.config().scales;
    return scales[scales.length - 1].unit === 'hour' ? 'hour' : 'day';
  });
  private readonly hoverCursor = signal('');
  protected readonly cursor = computed(() =>
    this.dragSvc.isDragging() ? 'grabbing' : this.dragSvc.isResizing() ? 'ew-resize' : this.hoverCursor(),
  );

  /** The chart's task tooltip (pointer handlers below) */
  protected readonly tooltip = inject(GanttTooltipState);

  /** Date reading, clock and the extra tooltip rows: critical path, float, predecessors / successors */
  protected readonly tooltipContext = computed<TooltipContext>(() => ({
    config: this.config(),
    now: new Date(this.layout.now()),
    criticalIds: this.criticalIds(),
    floatDays: this.floatDays(),
    tasksById: this.tasksById(),
  }));

  // ── Render model ──────────────────────────────────────────

  /** Dependency links indexed by their vertical span: built once per (tasks, geometries), queried per window */
  private readonly arrowIndex = computed(() => buildArrowIndex(this.layout.tasks(), this.layout.geometryById()));

  /**
   * Arrow visual of a link, memoised per link; the memo restarts with the bar visuals (config,
   * timeline, critical path, metrics), the rows and the critical path, so a scroll computes only
   * the links that entered the window.
   */
  private readonly arrowVisual = computed(() => {
    const visualOf = this.barVisual();
    const geoById = this.layout.geometryById();
    const cfg = this.config();
    const crit = this.criticalIds();
    const memo = new WeakMap<ArrowLink, ArrowVisual | null>();
    return (link: ArrowLink): ArrowVisual | null => {
      let a = memo.get(link);
      if (a === undefined) {
        const from = geoById.get(link.from);
        const to = geoById.get(link.to);
        a =
          from && to
            ? computeArrowVisual(
                visualOf(from),
                visualOf(to),
                { type: link.dep.type ?? DependencyType.FS, lag: link.dep.lag },
                cfg,
                { fromTop: from.y, fromBottom: from.y + from.height },
                crit.has(link.from) && crit.has(link.to),
              )
            : null;
        memo.set(link, a);
      }
      return a;
    };
  });

  /** The links whose span meets the window (`windowSpan`), in drawing order, keyed by `link.key` */
  protected readonly arrows = computed<MountedArrow[]>(() => {
    const { top, bottom } = this.layout.windowSpan();
    const arrowOf = this.arrowVisual();
    const out: MountedArrow[] = [];
    for (const link of this.arrowIndex().query(top, bottom)) {
      const visual = arrowOf(link);
      if (visual) out.push({ key: link.key, visual });
    }
    return out;
  });

  /** Row geometry of the task being dragged or resized (the drag ghost's row) */
  protected readonly dragGeometry = computed(() => {
    const id = this.dragSvc.activeTaskId();
    return (id ? this.layout.geometryById().get(id) : undefined) ?? null;
  });

  /** Theme paints of the body (`var(--gantt-*)`), applied as CSS properties */
  protected readonly paints = PAINTS;
  /** Row background: selection > `task.rowColor` > zebra (shared with the task list) */
  protected readonly rowPaint = rowPaint;

  protected readonly resolvedAnnotations = computed(() => {
    const tl = this.timeline();
    return this.annotations().map(ann => ({
      x1: tl.toX(ann.x1),
      x2: ann.x2 ? tl.toX(ann.x2) : null,
      paint: annotationPaint(ann),
      label: ann.label,
      opacity: ann.opacity,
    }));
  });

  /**
   * Bar contexts of the mounted rows, in window order. A row whose geometry, visual, theme, flags
   * and layout parameters are unchanged keeps its previous `ctx` object, so its bar doesn't re-render
   * (selecting a row changes that row's context only).
   */
  protected readonly contexts = linkedSignal<readonly RowGeometry[], ReadonlyMap<string, GanttBarContext>>({
    source: this.layout.mountedGeometries,
    computation: (geos, previous) => {
      const prev = previous?.value;
      const visualOf = this.barVisual();
      const tl = this.timeline();
      const cfg = this.config();
      const theme = this.theme();
      const crit = this.criticalIds();
      const selected = this.selSvc.selectedIds();
      const dragEnabled = this.enableDrag();
      const out = new Map<string, GanttBarContext>();
      for (const geo of geos) {
        const id = geo.row.task.id;
        const visual = visualOf(geo);
        const old = prev?.get(id);
        const layoutParams =
          old && sameLayoutParams(old.layoutParams, tl.start, tl.pxPerDay, cfg.rowHeight)
            ? old.layoutParams
            : { origin: tl.start, pxPerDay: tl.pxPerDay, rowHeight: cfg.rowHeight };
        const next: GanttBarContext = {
          row: geo.row,
          geometry: geo,
          theme,
          layoutParams,
          isCritical: crit.has(id),
          isSelected: selected.has(id),
          draggable: dragEnabled && geo.row.task.draggable !== false,
          enableResize: !!visual.handles,
          showBaseline: cfg.baseline,
          visual,
        };
        out.set(id, old && sameBarContext(old, next) ? old : next);
      }
      return out;
    },
  });

  /** The contexts as a list for the template (`@for` tracks the task id) */
  protected readonly bars = computed(() => [...this.contexts().values()]);

  constructor() {
    this.tooltip.bindEnabled(this.tooltipEnabled);
  }

  // ── Pointer events ─────────────────────────────────────────

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !this.enableDrag()) return;
    const hit = this.hitTest(event);
    if (!hit || hit.geo.row.task.draggable === false) return;
    const svg = this.svgEl()?.nativeElement;
    if (!svg) return;

    const tl = this.timeline();
    const cfg = this.config();
    this.dragSvc.configure({
      pxPerDay: tl.pxPerDay,
      toX: tl.toX,
      span: (start, end) => taskSpan({ start, end }, cfg),
      snap: this.snapUnit(),
    });
    this.dragSvc.onTaskDragged = e => this.taskDragged.emit(e);
    this.dragSvc.onTaskResized = e => this.taskResized.emit(e);
    this.tooltip.hide();
    this.dragSvc.startDrag(event, hit.geo, hit.handle, svg);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.dragSvc.isActive()) return;
    const hit = this.enableDrag() ? this.hitTest(event) : null;
    this.hoverCursor.set(
      !hit || hit.geo.row.task.draggable === false ? '' : hit.handle === 'bar' ? 'grab' : 'ew-resize',
    );
    if (!this.tooltipEnabled()) return;
    // Delegated hover: the bar under the pointer opens its tooltip, anything else leaves
    const row = this.barRowAt(event.target);
    if (row) {
      this.tooltip.enter(row, event.clientX, event.clientY);
      this.tooltip.move(event.clientX, event.clientY);
    } else {
      this.tooltip.leave();
    }
  }

  protected onClick(event: MouseEvent): void {
    if (this.dragSvc.lastDragMoved) {
      this.dragSvc.lastDragMoved = false;
      return;
    }
    const geo = this.rowAt(event);
    if (!geo) return;
    this.selSvc.handleClick(geo.row.task.id, event, this.layout.visibleRows(), {
      enabled: this.enableSelection(),
      multi: this.multiSelect(),
    });
    this.rowClick.emit(geo);
  }

  protected onDblClick(event: MouseEvent): void {
    const geo = this.rowAt(event);
    if (geo) this.rowDblClick.emit(geo.row);
  }

  /** Bar under the pointer (using the rendered geometry) and the handle hit. */
  private hitTest(event: PointerEvent | MouseEvent): { geo: RowGeometry; handle: 'bar' | 'left' | 'right' } | null {
    const p = this.svgPoint(event);
    const geo = p && this.layout.rowGeometries()[Math.floor(p.y / this.config().rowHeight)];
    if (!p || !geo) return null;
    const v = this.barVisual()(geo);
    const pad = v.kind === 'milestone' ? 3 : 0;
    const insideY = p.y >= v.y - pad && p.y <= v.y + v.height + pad + (v.caps ? 7 : 0);
    if (!insideY) return null;
    if (v.handles) {
      if (p.x >= v.handles.left[0] && p.x <= v.handles.left[1]) return { geo, handle: 'left' };
      if (p.x >= v.handles.right[0] && p.x <= v.handles.right[1]) return { geo, handle: 'right' };
    }
    return p.x >= v.x - pad && p.x <= v.x + v.width + pad ? { geo, handle: 'bar' } : null;
  }

  /** Row of the bar (`[data-task-id]` host in the bars layer) an event target belongs to */
  private barRowAt(target: EventTarget | null): GanttFlatRow | undefined {
    const bar = target instanceof Element ? target.closest('[data-task-id]') : null;
    const id = bar?.getAttribute('data-task-id');
    return id ? this.layout.geometryById().get(id)?.row : undefined;
  }

  private rowAt(event: MouseEvent): RowGeometry | undefined {
    const p = this.svgPoint(event);
    return p ? this.layout.rowGeometries()[Math.floor(p.y / this.config().rowHeight)] : undefined;
  }

  /** Pointer position in SVG user space (stable with any scroll ancestor). */
  private svgPoint(event: PointerEvent | MouseEvent): { x: number; y: number } | null {
    const svg = this.svgEl()?.nativeElement;
    const ctm = svg?.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  }
}

/** Same origin (by time), scale and row height: the previous `layoutParams` object can be kept. */
function sameLayoutParams(p: GanttLayoutParams, origin: Date, pxPerDay: number, rowHeight: number): boolean {
  return p.origin.getTime() === origin.getTime() && p.pxPerDay === pxPerDay && p.rowHeight === rowHeight;
}

/** Every field of a bar context is identical (objects by reference). */
function sameBarContext(a: GanttBarContext, b: GanttBarContext): boolean {
  return (
    a.row === b.row &&
    a.geometry === b.geometry &&
    a.visual === b.visual &&
    a.theme === b.theme &&
    a.layoutParams === b.layoutParams &&
    a.isCritical === b.isCritical &&
    a.isSelected === b.isSelected &&
    a.draggable === b.draggable &&
    a.enableResize === b.enableResize &&
    a.showBaseline === b.showBaseline
  );
}
