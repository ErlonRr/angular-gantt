// ─────────────────────────────────────────────────────────────
//  gantry · layout/gantt-canvas.component.ts
//
//  Timeline body. Everything it draws comes from the @gantryjs/core
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
//  The <svg> is a listbox named by `labels.ariaBars` (multi-selectable
//  with selection + multi-select): bars are its options, stamped by their
//  outlet (role, name, role description, selection, position in the set,
//  roving tabindex from `GanttBarFocusService.tabStop`). Annotations are
//  two extracted layer components (`g.gantt-annotations[ganttAnnotations]`
//  under the bars, `g.gantt-annotation-labels[ganttAnnotationLabels]`
//  over them); the bar overlay (`g.gantt-bar-overlay`, focus ring and
//  grips) is attached between them while `GanttBarFocusService.shown`.
//  `focusin` / `focusout` on a bar report to the bar-focus service
//  (keyboard focus → `layout.focusVisibleBarId`, from which the tooltip
//  state opens the focus tooltip).
//
//  Bars sit directly in `g.gantt-bars-layer` (one `[ganttBarOutlet]` per
//  mounted row, the dragged bar dimmed by its outlet). The task tooltip is
//  one popover per chart (`div[ganttTooltip]`, created on the first hover).
//
//  Pointer interaction on the <svg>, the Web Component's
//  `interaction/canvas-pointer.ts` (listeners bound after the first render,
//  passive where they can be, released with the chart):
//
//  - Hit-testing by geometry: the row under the pointer's `y`, then core
//    `hitTestBar` on that row's visual (handles first, then the hit box),
//    so custom bars hit the same way and the hover, the cursor and a press
//    agree. The canvas box is measured once and kept until something can
//    move it (a scroll of the viewport or the page, a resize, the pointer
//    entering, a press, a change of the measured sizes or the view): no
//    layout read per `pointermove`.
//  - Press (D13, `trackPress` in `drag/gantt-drag.service.ts`): a mouse
//    drags once it has moved 3 px, a touch or pen once held still for
//    350 ms; moving a touch earlier lets the browser pan. A drag dismisses
//    the tooltip, follows the pointer in content coordinates (client x plus
//    the scroll since the press) and auto-scrolls near the viewport's edges
//    (`GanttScrollService.autoScroll`). A tap (touch / pen, no drag)
//    toggles the bar's tooltip; a click selects through the `click` event.
//    `pointercancel`, Escape and the chart's destruction cancel.
//  - Hover (mouse and pen): the bar under the pointer is the layout's
//    `hoveredBarId` (its grips show), its tooltip opens (`tooltip.hover`
//    from the painted bar under the pointer); off the bars,
//    `tooltip.unhover()`. The cursor is the host's `data-cursor` attribute
//    styled by the stylesheet: `ew-resize` on the handles, `grab` on the
//    body of a bar that can be dragged, `grabbing` / `ew-resize` while
//    dragging.
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  input,
  linkedSignal,
  output,
  inject,
  signal,
  type Signal,
  type TemplateRef,
  viewChild,
} from '@angular/core';

import {
  type RowGeometry,
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
  themeMetrics,
  sameThemeMetrics,
  PAINTS,
  HATCH_PATTERN,
  bottomScale,
  gestureKind,
  hitTestBar,
  type ArrowLink,
  type ArrowVisual,
  type BarHit,
  type BarVisual,
  type DragTiming,
  type GestureState,
} from '@gantryjs/core';

import { GanttBarRegistry } from '../bar-registry';
import { GanttBarOutletDirective } from '../bars/bar-outlet.directive';
import { GanttBarOverlayComponent } from '../bars/bar-overlay.component';
import { GanttBarFocusService } from '../bars/bar-focus.service';
import { GanttArrowComponent } from '../arrows/gantt-arrow.component';
import { GanttDragService, bindTouchGuard, trackPress, type Press } from '../drag/gantt-drag.service';
import { GanttDragPreviewComponent } from '../drag/gantt-drag-preview.component';
import { GanttScrollService, type AutoScroll } from '../scroll/gantt-scroll.service';
import { GanttSelectionService } from '../selection/gantt-selection.service';
import { GanttI18nService } from '../services/gantt-i18n.service';
import { GanttThemeService } from '../services/gantt-theme.service';
import { GanttLayoutService } from './gantt-layout.service';
import { GanttAnnotationLabelsComponent, GanttAnnotationsComponent } from './gantt-annotations.component';
import { GanttTooltipComponent, type TooltipContext } from '../tooltip/gantt-tooltip.component';
import { GanttTooltipState } from '../tooltip/tooltip-state';
import { type GanttTooltipTemplateContext } from '../tooltip/gantt-tooltip-template.directive';

let nextCanvasId = 0;

/** Bar visual of a row geometry, memoised by the chart (`computeBarVisual`); serves off-window rows too */
export type BarVisualOf = (geo: RowGeometry) => BarVisual;

/** A dependency arrow of the window: its key in the arrow index and its visual */
interface MountedArrow {
  readonly key: string;
  readonly visual: ArrowVisual;
}

/** The bar under the pointer and the part hit. */
interface BarPointerHit {
  readonly geo: RowGeometry;
  readonly part: BarHit;
  /** Drag is on and the task may be dragged */
  readonly draggable: boolean;
}

/** The host's `data-cursor` (styled by the stylesheet) */
type Cursor = 'grab' | 'grabbing' | 'ew-resize' | null;

/** The hover cursor of a hit: resize on the handles, grab on the body of a bar that can be dragged. */
const hoverCursor = (hit: BarPointerHit | null): Cursor =>
  !hit?.draggable ? null : hit.part === 'bar' ? 'grab' : 'ew-resize';

const noop = (): void => undefined;

@Component({
  selector: 'gantt-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GanttArrowComponent,
    GanttDragPreviewComponent,
    GanttTooltipComponent,
    GanttBarOutletDirective,
    GanttBarOverlayComponent,
    GanttAnnotationsComponent,
    GanttAnnotationLabelsComponent,
  ],
  // One registry per chart (built-in bars, then `provideGanttBar` from the outermost to the nearest
  // level) and one tooltip
  providers: [GanttBarRegistry, GanttTooltipState],
  host: {
    // The cursor of the bar part under the pointer (stylesheet rules below)
    '[attr.data-cursor]': 'cursor()',
    // Bar focus is heard on the host, not on the svg: Chromium makes an SVG element with focus
    // listeners keyboard-focusable, which would add the listbox itself as a tab stop
    '(focusin)': 'onFocusIn($event)',
    '(focusout)': 'onFocusOut($event)',
  },
  template: `
    @let tl = timeline();
    @let height = layout.totalHeight();
    @let span = layout.windowSpan();
    <div [style.width.px]="tl.totalWidth" [style.height.px]="height">
      <!-- A listbox of the bars (options). Pointer selection here (press, hover and touch listeners are
           bound after the first render); the keyboard path to bars is the roving-focus model
           (GanttBarFocusService, the chart's keyboard directive): the options take focus, never the
           listbox itself -->
      <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
      <svg
        #svgEl
        [attr.width]="tl.totalWidth"
        [attr.height]="height"
        role="listbox"
        aria-orientation="vertical"
        [attr.aria-label]="i18n.labels().ariaBars"
        [attr.aria-multiselectable]="multiselectable()"
        (click)="onClick($event)"
        (dblclick)="onDblClick($event)"
      >
        @if (hatch()) {
          <defs>
            <pattern
              [attr.id]="uid + '-hatch'"
              [attr.width]="hatchPattern.size"
              [attr.height]="hatchPattern.size"
              patternUnits="userSpaceOnUse"
              [attr.patternTransform]="'rotate(' + hatchPattern.rotate + ')'"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                [attr.y2]="hatchPattern.size"
                [style.stroke]="paints.hatch"
                [attr.stroke-width]="hatchPattern.strokeWidth"
                [attr.stroke-opacity]="hatchPattern.strokeOpacity"
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

        <!-- Annotation regions and lines (over the window's height): g.gantt-annotations -->
        <g ganttAnnotations></g>

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
            <g ganttArrow [arrow]="a.visual"></g>
          }
        </g>

        <!-- Bars: g.gantt-bars-layer > g[data-task-id][role=option] (each outlet inserts its bar before its anchor) -->
        <g class="gantt-bars-layer">
          @let dragged = dragSvc.activeTaskId();
          @for (ctx of bars(); track ctx.row.task.id) {
            <ng-container
              [ganttBarOutlet]="registry.resolve(ctx.row.barType)"
              [ganttBarOutletCtx]="ctx"
              [ganttBarOutletDimmed]="dragged === ctx.row.task.id"
              [ganttBarOutletTabStop]="barFocus.tabStop(ctx.row.task.id)"
              [ganttBarOutletSelected]="ctx.isSelected"
            />
          }
        </g>

        <!-- Focus ring and grips of the focused / hovered bar (attached while shown) -->
        @if (barFocus.shown()) {
          <g ganttBarOverlay></g>
        }

        <!-- Annotation labels (above the bars): g.gantt-annotation-labels -->
        <g ganttAnnotationLabels></g>

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
        /* Touch (D13): pan the timeline (and only pan: the chart zooms itself), long-press to drag;
           no selectable text, no touch callout */
        touch-action: pan-x pan-y;
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
      }
      .gantt-annotation-labels text {
        user-select: none;
      }
      /* The bar overlay's focus ring replaces the bars' own outline */
      .gantt-bars-layer > :focus {
        outline: none;
      }
      /* Cursor of the bar part under the pointer (data-cursor from core hitTestBar, so it covers the
         whole hit area, handles included) */
      :host([data-cursor='grab']),
      :host([data-cursor='grab']) .gantt-bar-draggable {
        cursor: grab;
      }
      :host([data-cursor='grabbing']),
      :host([data-cursor='grabbing']) .gantt-bar-draggable {
        cursor: grabbing;
      }
      :host([data-cursor='ew-resize']),
      :host([data-cursor='ew-resize']) .gantt-bar-draggable {
        cursor: ew-resize;
      }

      /* Forced colours (D25): SVG paints are not forced (preserve-parent-color) and are inline, so
         every one is set here with !important: rows Canvas, non-working time GrayText at 0.15
         (intensive hours Highlight), grid lines GrayText, today Highlight */
      @media (forced-colors: active) {
        .gantt-rows > rect {
          fill: Canvas !important;
        }
        .gantt-band {
          fill: GrayText !important;
          fill-opacity: 0.15;
        }
        .gantt-band--intensive {
          fill: Highlight !important;
        }
        pattern > line,
        .gantt-grid > line {
          stroke: GrayText !important;
        }
        .gantt-today {
          stroke: Highlight !important;
        }
      }
    `,
  ],
})
export class GanttCanvasComponent {
  /** Bar visuals of the chart (memoised per geometry; restarts with the config, timeline, critical path and metrics) */
  readonly barVisual = input.required<BarVisualOf>();
  readonly criticalIds = input<ReadonlySet<string>>(new Set());
  readonly enableDrag = input<boolean>(true);
  readonly enableSelection = input<boolean>(true);
  readonly multiSelect = input<boolean>(true);
  readonly tooltipEnabled = input<boolean>(true);
  /** Total float per task id (CPM `floatMap`, when the critical path is on) — tooltip float row */
  readonly floatDays = input<ReadonlyMap<string, number> | undefined>(undefined);
  /** Every task by id — tooltip predecessor names and successors */
  readonly tasksById = input<ReadonlyMap<string, GanttTask> | undefined>(undefined);
  /** The consumer's `<ng-template ganttTooltip>` (handed to the tooltip state) */
  readonly tooltipTemplate = input<TemplateRef<GanttTooltipTemplateContext> | null>(null);

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
  /** Bar tab stops, focus and the overlay (one per chart, provided by GantryComponent) */
  protected readonly barFocus = inject(GanttBarFocusService);
  private readonly themeSvc = inject(GanttThemeService);
  /** The timeline viewport's scrolling (auto-scroll while dragging) */
  private readonly scrollSvc = inject(GanttScrollService);
  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly config = this.layout.cfg;
  protected readonly timeline = this.layout.timeline;
  /** Resolved theme: custom bars' `ctx.theme` */
  protected readonly theme: Signal<Required<GanttTheme>> = this.themeSvc.resolvedTheme;
  /** Label font; a colour-only theme change keeps it */
  private readonly metrics = computed(() => themeMetrics(this.theme()), { equal: sameThemeMetrics });
  protected readonly fontPx = computed(() => this.metrics().fontPx);
  protected readonly hatch = computed(() => this.config().nonWorking?.style === 'hatch');
  /** The hatch pattern of `nonWorking.style: 'hatch'` (core, shared with the Web Component) */
  protected readonly hatchPattern = HATCH_PATTERN;
  /** `aria-multiselectable` of the listbox: selection and multi-select are both on */
  protected readonly multiselectable = computed(() => this.enableSelection() && this.multiSelect());
  /** The host's `data-cursor`: the hovered bar part, or the drag in progress */
  protected readonly cursor = signal<Cursor>(null);

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
    const fontPx = this.fontPx();
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
                fontPx,
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
    this.tooltip.bindTemplate(this.tooltipTemplate);
    // A press on a bar's hit area (handles included) is this canvas', not a press elsewhere
    this.tooltip.bindBarVisual(this.barVisual);
    // Browser only (never on the server): the pointer listeners, released with the chart
    afterNextRender(() => this.connectPointer());
  }

  // ── Focus on the bars ─────────────────────────────────────

  /**
   * A bar received focus: the bar-focus service records it, as `layout.focusVisibleBarId` when the
   * last input was a key (the bar overlay's ring; the tooltip state opens its tooltip from it: focus
   * from the pointer opens none).
   */
  protected onFocusIn(event: FocusEvent): void {
    const id = barHostOf(event.target)?.getAttribute('data-task-id');
    if (id) this.barFocus.focusIn(id);
  }

  /** Focus left a bar for something that is not a bar: no bar holds focus (its focus tooltip closes). */
  protected onFocusOut(event: FocusEvent): void {
    if (!barHostOf(event.target) || barHostOf(event.relatedTarget)) return;
    this.barFocus.focusOut();
  }

  // ── Pointer: press (drag, resize, tap), hover, click ──────

  /** The timeline viewport (`.gantry-canvas-viewport`, the scroll container), from the first render */
  private viewport: HTMLElement | null = null;
  /** The canvas box in client px, kept until something can move it (see `connectPointer`) */
  private box: { left: number; top: number } | null = null;
  /** The measured sizes and the view the box was read with: when they change, the canvas may have moved */
  private boxKey = '';
  /** The press in progress: its gesture, and its auto-scroll once it drags */
  private current: { press: Press; auto: AutoScroll | null } | null = null;
  /** `scrollLeft` of the viewport when the press started: content x = client x + the scroll since */
  private scroll0 = 0;
  /** Follows the pointer while dragging (set when the press starts dragging) */
  private dragMove: (g: GestureState) => void = noop;

  /** A pointer drag or resize is in progress */
  private readonly dragging = (): boolean => this.dragSvc.isPointerDrag();

  /** After the first render, in the browser: press, hover and touch listeners, released with the chart. */
  private connectPointer(): void {
    const svg = this.svgEl()?.nativeElement;
    if (!svg) return;
    const host = this.hostEl.nativeElement;
    const viewport = host.closest<HTMLElement>('.gantry-canvas-viewport') ?? host;
    this.viewport = viewport;
    // Escape is heard on the chart (keys bubble to its host from any of its controls)
    const keyTarget: EventTarget = host.closest('gantry') ?? viewport;
    const listeners = new AbortController();
    const { signal } = listeners;
    const invalidate = (): void => {
      this.box = null;
    };

    svg.addEventListener('pointerdown', e => this.onPointerDown(e, svg, keyTarget), { signal });
    svg.addEventListener('pointermove', e => this.onPointerMove(e), { passive: true, signal });
    svg.addEventListener('pointerleave', e => this.onPointerLeave(e), { signal });
    svg.addEventListener('pointerenter', invalidate, { signal });
    viewport.addEventListener('scroll', invalidate, { passive: true, signal });
    // A second finger anywhere on the timeline starts a pinch: an undecided press gives way
    viewport.addEventListener(
      'touchstart',
      e => {
        if (this.current && e.touches.length > 1 && !this.dragging()) this.current.press.cancel();
      },
      { passive: true, signal },
    );
    // While a touch drags a bar the browser must not pan
    bindTouchGuard(svg, this.dragging, signal);
    // The page scrolling or resizing moves the canvas too (removed by hand: some DOMs don't tie a
    // window listener to an abort signal)
    const win = this.doc.defaultView;
    win?.addEventListener('scroll', invalidate, { passive: true, capture: true });
    win?.addEventListener('resize', invalidate, { passive: true });

    this.destroyRef.onDestroy(() => {
      // A press in progress ends with the chart: no long press, drag or auto-scroll left behind
      this.current?.press.cancel();
      listeners.abort();
      win?.removeEventListener('scroll', invalidate, { capture: true });
      win?.removeEventListener('resize', invalidate);
    });
  }

  private onPointerDown(e: PointerEvent, svg: SVGSVGElement, keyTarget: EventTarget): void {
    // The previous press's trailing click has been dispatched by now (or never comes: a touch drag)
    this.dragSvc.lastDragMoved = false;
    const current = this.current;
    if (current) {
      // A second pointer (a pinch, another finger): an undecided press gives way; a drag goes on
      if (current.press.pointerId !== e.pointerId && !this.dragging()) current.press.cancel();
      return;
    }
    if (e.button !== 0) return;
    this.box = null;
    const hit = this.hitAt(e.clientX, e.clientY);
    const mouse = gestureKind(e.pointerType) === 'mouse';
    // A mouse press on a bar that can't be dragged is a plain click; touch and pen may still tap
    if (!hit || (mouse && !hit.draggable)) return;
    if (mouse) {
      // No text selection or native focus: keyboard focus goes to the timeline (Escape cancels the drag)
      e.preventDefault();
      this.viewport?.focus({ preventScroll: true });
    }
    this.scroll0 = this.viewport?.scrollLeft ?? 0;
    const target = e.target;
    const press = trackPress(e, {
      target: svg,
      keyTarget,
      draggable: hit.draggable,
      onDragStart: g => this.dragStart(hit, g),
      onDragMove: g => {
        // The keyboard shortcuts cancelled the drag (Escape): the press is over too
        if (!this.dragging()) this.current?.press.cancel();
        else this.dragMove(g);
      },
      onEnd: (result, g) => {
        this.endPress();
        if (result === 'drop') this.drop(g.x);
        else if (result === 'tap' && this.tooltipEnabled()) {
          // The tapped bar (or the bar of a handle's reach, outside its own shapes)
          const bar = barHostOf(target) ?? this.barById(hit.geo.row.task.id);
          if (bar) this.tooltip.tap(hit.geo.row, bar);
        }
        // A mouse or pen hovers again where it was released (the bar may have moved under it)
        if (e.pointerType !== 'touch') this.hoverAt(g.x, g.y);
        else this.cursor.set(null);
      },
      onCancel: () => {
        this.endPress();
        this.dragSvc.cancel();
        this.cursor.set(null);
      },
    });
    this.current = { press, auto: null };
  }

  /** A press became a drag: the tooltip and the grips step aside, the bar follows the pointer. */
  private dragStart(hit: BarPointerHit, g: GestureState): void {
    const current = this.current;
    if (!current) return;
    this.tooltip.dismiss();
    this.layout.hoveredBarId.set(null);
    this.cursor.set(hit.part === 'bar' ? 'grabbing' : 'ew-resize');
    // A touch drag takes keyboard focus to the timeline too (a mouse press already did)
    if (g.kind === 'touch') this.viewport?.focus({ preventScroll: true });
    this.dragSvc.start(hit.geo, hit.part, g.startX, this.dragTiming());
    let lastX = g.x;
    const auto = this.scrollSvc.autoScroll({
      maxLeft: () => this.timeline().totalWidth - this.layout.viewportWidth(),
      // The viewport scrolled under a still pointer: the bar moves by as much
      onScroll: () => this.dragSvc.move(this.contentX(lastX)),
    });
    current.auto = auto;
    const follow = (next: GestureState): void => {
      lastX = next.x;
      this.dragSvc.move(this.contentX(next.x));
      auto.update(next.x);
    };
    follow(g);
    this.dragMove = follow;
  }

  /** Released while dragging at client x `clientX`: the task moved or resized (when it changed). */
  private drop(clientX: number): void {
    const result = this.dragSvc.drop(this.contentX(clientX));
    if (result?.kind === 'drag') this.taskDragged.emit(result.event);
    else if (result?.kind === 'resize') this.taskResized.emit(result.event);
  }

  /** The press is over: its auto-scroll stops */
  private endPress(): void {
    this.current?.auto?.stop();
    this.current = null;
    this.dragMove = noop;
  }

  /** Content x of a client x: plus how far the timeline scrolled since the press */
  private contentX(clientX: number): number {
    return clientX + (this.viewport?.scrollLeft ?? 0) - this.scroll0;
  }

  /** The scale a drag starts on: the current timeline (core `DragSession` timing) */
  private dragTiming(): DragTiming {
    const tl = this.timeline();
    const cfg = this.config();
    return {
      pxPerDay: tl.pxPerDay,
      toX: tl.toX,
      span: (start, end) => taskSpan({ start, end }, cfg),
      snap: bottomScale(cfg.scales).unit === 'hour' ? 'hour' : 'day',
    };
  }

  // Hover (mouse and pen)

  private onPointerMove(e: PointerEvent): void {
    if (this.current || e.pointerType === 'touch' || this.dragging()) return;
    this.hoverAt(e.clientX, e.clientY);
    if (!this.tooltipEnabled()) return;
    // The tooltip follows the painted bar under the pointer (its host in the bars layer)
    const bar = barHostOf(e.target);
    const id = bar?.getAttribute('data-task-id');
    const row = id ? this.layout.geometryById().get(id)?.row : undefined;
    if (bar && row) this.tooltip.hover(row, bar, e.clientX);
    else this.tooltip.unhover();
  }

  private onPointerLeave(e: PointerEvent): void {
    // A finger lifting is not the pointer leaving (a tapped tooltip stays), nor is a press in progress
    if (e.pointerType === 'touch' || this.current) return;
    this.box = null;
    this.cursor.set(null);
    this.layout.hoveredBarId.set(null);
    this.tooltip.unhover();
  }

  /** Cursor and grips for a fine pointer at a client position (geometry: the handles reach past the bar). */
  private hoverAt(clientX: number, clientY: number): void {
    const hit = this.hitAt(clientX, clientY);
    this.cursor.set(hoverCursor(hit));
    this.layout.hoveredBarId.set(hit?.geo.row.task.id ?? null);
  }

  // Click, double-click

  protected onClick(event: MouseEvent): void {
    if (this.dragSvc.lastDragMoved) {
      this.dragSvc.lastDragMoved = false;
      return;
    }
    const geo = this.geoAt(this.point(event.clientX, event.clientY).y);
    if (!geo) return;
    this.selSvc.handleClick(geo.row.task.id, event, this.layout.visibleRows(), {
      enabled: this.enableSelection(),
      multi: this.multiSelect(),
    });
    this.rowClick.emit(geo);
  }

  protected onDblClick(event: MouseEvent): void {
    const geo = this.geoAt(this.point(event.clientX, event.clientY).y);
    if (geo) this.rowDblClick.emit(geo.row);
  }

  // Hit-testing (geometry, the Web Component's test)

  /** Client → canvas coordinates (the canvas box is measured once, then kept until it can have moved) */
  private point(clientX: number, clientY: number): { x: number; y: number } {
    const l = this.layout;
    const key = `${l.viewportWidth()} ${l.viewportHeight()} ${l.headerHeight()} ${l.panelWidthPx()} ${l.view()}`;
    if (!this.box || key !== this.boxKey) {
      const r = this.hostEl.nativeElement.getBoundingClientRect();
      this.box = { left: r.left, top: r.top };
      this.boxKey = key;
    }
    return { x: clientX - this.box.left, y: clientY - this.box.top };
  }

  /** Row geometry under a canvas-relative `y` */
  private geoAt(y: number): RowGeometry | undefined {
    return this.layout.rowGeometries()[Math.floor(y / this.config().rowHeight)];
  }

  /**
   * The bar under a client position and the part hit, `null` off the bars: the row from `y`, then
   * core `hitTestBar` on its visual (handles first, then the hit box).
   */
  private hitAt(clientX: number, clientY: number): BarPointerHit | null {
    const { x, y } = this.point(clientX, clientY);
    const geo = this.geoAt(y);
    if (!geo) return null;
    const part = hitTestBar(this.barVisual()(geo), x, y);
    if (!part) return null;
    return { geo, part, draggable: this.enableDrag() && geo.row.task.draggable !== false };
  }

  /** The painted bar of `id` (a tap in a handle's reach, outside the bar's own shapes) */
  private barById(id: string): Element | null {
    const layer = this.svgEl()?.nativeElement.querySelector('.gantt-bars-layer');
    for (const child of Array.from(layer?.children ?? [])) if (child.getAttribute('data-task-id') === id) return child;
    return null;
  }
}

/** The bar host (`g.gantt-bars-layer > g[data-task-id]`) an event target belongs to, if any. */
function barHostOf(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest('.gantt-bars-layer > [data-task-id]') : null;
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
