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
//  window, the arrows whose span meets the window (`layout.arrowIndex`),
//  annotations and the today line over the window's height.
//
//  Row backgrounds are core `rowPaint` with the row's resolved style
//  (`layout.rowStyle`: selection, else `rowColor`, else the zebra). The
//  row under a mouse or pen pointer, in either pane (`layout.hoveredRowId`,
//  D4 of Gantry 2 phase 10), is one `rect.gantt-row-hover` right after
//  `g.gantt-rows` (x 0, the row's y and height, as wide as the timeline,
//  `aria-hidden`, `pointer-events: none`), its fill the stylesheet's
//  `var(--gantt-row-hover-bg)` (`rowHoverBg: 'transparent'` turns it off,
//  forced colours hide it): over the row backgrounds, under the bands,
//  grid and bars. Attached only while the hovered row is mounted and the
//  view is not `table` (the Web Component's `layers/hover.ts`).
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
//  Dependency arrows are painted as the layout selects them
//  (`layout.arrowSelection`: the selected link with the focus-ring paint,
//  `gantt-arrow--selected`). While a link is drawn with a preview
//  (`layout.link().preview`, Gantry 2 phase 11, D12), the svg's last child
//  is `path.gantt-link-preview[pointer-events=none]` (its `d` from the
//  bars as they are now, core `linkPreviewPathOf`: a zoom during a session
//  moves it with them; `gantt-link-preview--invalid` on an invalid target).
//
//  Pointer interaction on the <svg>, the Web Component's
//  `interaction/canvas-pointer.ts` (listeners bound after the first render,
//  passive where they can be, released with the chart):
//
//  - Hit-testing by geometry: the row under the pointer's `y`, then core
//    `hitTestBar` on that row's visual (D11 order: the resize handles, the
//    progress grip, the link connectors, then the hit box), so custom bars
//    hit the same way and the hover, the cursor and a press agree. The
//    progress grip and the connectors (`editing`) are hit only on a bar
//    whose overlay shows them (`GanttBarFocusService.hitTargets`), so a
//    press inside a narrow bar that shows nothing still moves it. The
//    canvas box is measured once and kept until something can move it (a
//    scroll of the viewport or the page, a resize, the pointer entering, a
//    press, a change of the measured sizes or the view): no layout read
//    per `pointermove`. During a press, canvas coordinates are the press
//    point plus the pointer's and the scroll's moves.
//  - Press (D13, `trackPress` in `drag/gantt-drag.service.ts`): a mouse
//    drags once it has moved 3 px, a touch or pen once held still for
//    350 ms; moving a touch earlier lets the browser pan. What drags is the
//    part hit: the body or a resize handle (`GanttDragService`, when
//    `editRules(row).move`), the progress grip (`GanttProgressService`:
//    core `ProgressSession`, the live fill and the readout chip follow
//    `layout.progressPreview`) or a link connector
//    (`link.start(id, side, 'drag', at)`, then `link.move()` with the
//    pointer and `link.move()` + `link.finish()` on release). A drag
//    dismisses the tooltip, follows the pointer in content coordinates
//    (client x plus the scroll since the press) and auto-scrolls near the
//    viewport's edges (`GanttScrollService.autoScroll`). A tap (touch /
//    pen, no drag) toggles the bar's tooltip; a click selects through the
//    `click` event. `pointercancel`, Escape (the press's own, in the
//    window's capture phase) and the chart's destruction cancel.
//  - Click-mode links (WCAG 2.5.7): a click or tap on a connector arms a
//    link (`link.start(…, 'click', …)`). While it is armed the pointer
//    moves its preview (`link.move`) and the next press belongs to it: on
//    a bar it finishes the link there, elsewhere it cancels it
//    (announced); a mouse acts on the press, a touch or pen on its release
//    (a touch that pans keeps it armed). The click that ends a progress or
//    link gesture selects nothing.
//  - Click: with `editing.dependencies.delete` a click first goes to the
//    arrows (`link.selectAt`: the arrow under it, bars win; the press has
//    deselected the last one unless it was on that very link, so
//    re-clicking it never flickers); a click that selects a link selects
//    no row. Otherwise it selects the row.
//  - Focus: a mouse press on a bar (one that can be dragged or not)
//    prevents the native focus and text selection and focuses that bar
//    itself, without scrolling (Escape then cancels its drag, the arrow
//    keys move from it); a touch or pen press focuses the bar once it
//    drags. The modality stays the pointer's (`GanttBarFocusService`): no
//    focus ring, no focus tooltip until a key is pressed.
//  - Hover (mouse and pen): the bar under the pointer is the layout's
//    `hoveredBarId` (its overlay shapes show), its tooltip opens
//    (`tooltip.hover` from the painted bar under the pointer); off the
//    bars, `tooltip.unhover()`. The row under the pointer (core
//    `rowIndexAtY`) is `layout.hoveredRowId` (the row tint of both panes).
//    The cursor is the host's `data-cursor` attribute styled by the
//    stylesheet: `ew-resize` on the handles and the progress grip, `grab`
//    on the body of a bar that can be dragged, `crosshair` on the
//    connectors and while a link is being made, `pointer` on a deletable
//    arrow (core `arrowAt`, `ARROW_HIT_TOLERANCE`); `grabbing` /
//    `ew-resize` / `crosshair` while dragging. Leaving the canvas, a drag
//    starting and a scroll of either pane (the content moves under the
//    pointer) clear the hovered bar, its shapes, the hovered row and the
//    cursor, until the pointer moves again; so does the chart's
//    destruction.
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
  ARROW_HIT_TOLERANCE,
  arrowAt,
  computeArrowVisual,
  linkPreviewPathOf,
  editTiming,
  rowPaint,
  themeMetrics,
  sameThemeMetrics,
  PAINTS,
  HATCH_PATTERN,
  gestureKind,
  hitTestBar,
  rowIndexAtY,
  type ArrowLink,
  type ArrowVisual,
  type BarHit,
  type BarVisual,
  type DragHandle,
  type GestureState,
  type LinkSide,
} from '@gantryjs/core';

import { GanttBarRegistry } from '../bar-registry';
import { GanttBarOutletDirective } from '../bars/bar-outlet.directive';
import { GanttBarOverlayComponent } from '../bars/bar-overlay.component';
import { GanttBarFocusService } from '../bars/bar-focus.service';
import { GanttArrowComponent } from '../arrows/gantt-arrow.component';
import { GanttDragService, bindTouchGuard, trackPress, type Press } from '../drag/gantt-drag.service';
import { GanttDragPreviewComponent } from '../drag/gantt-drag-preview.component';
import { GanttLinkService } from '../editing/link';
import { GanttProgressService } from '../editing/progress';
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
  /**
   * The press may become a drag: on the body and the resize handles when the row may move
   * (`editRules(row).move`); on the progress grip and the connectors always (they exist only where
   * their rule allows them)
   */
  readonly draggable: boolean;
}

/** The host's `data-cursor` (styled by the stylesheet) */
type Cursor = 'grab' | 'grabbing' | 'ew-resize' | 'crosshair' | 'pointer' | null;

/** What a press drags once it moves: the bar (move / resize), its progress, or a new link. */
type Gesture = 'drag' | 'progress' | 'link';

/** The `DragSession` handle of a hit part: the body moves the bar, the resize handles resize it. */
const dragHandle = (part: BarHit): DragHandle | null =>
  part === 'bar' || part === 'left' || part === 'right' ? part : null;

/** The connector side of a hit part (`null`: not a connector). */
const linkSide = (part: BarHit): LinkSide | null =>
  part === 'link-start' ? 'start' : part === 'link-end' ? 'end' : null;

/** The hover cursor of a hit (the Web Component's `hoverCursor`). */
const hoverCursor = (hit: BarPointerHit): Cursor => {
  switch (hit.part) {
    case 'progress':
      return 'ew-resize';
    case 'link-start':
    case 'link-end':
      return 'crosshair';
    case 'bar':
      return hit.draggable ? 'grab' : null;
    default:
      return hit.draggable ? 'ew-resize' : null;
  }
};

/** The cursor while a press drags `part`. */
const dragCursor = (part: BarHit): Cursor => (part === 'bar' ? 'grabbing' : linkSide(part) ? 'crosshair' : 'ew-resize');

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
    @let styleOf = layout.rowStyle();
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

        <!-- Rows: the mounted rows (virtual window + pinned rows), with their resolved styles -->
        <g class="gantt-rows" aria-hidden="true">
          @for (geo of layout.mountedGeometries(); track geo.row.task.id) {
            <svg:rect
              [attr.x]="0"
              [attr.y]="geo.y"
              [attr.width]="tl.totalWidth"
              [attr.height]="geo.height"
              [style.fill]="rowPaint(geo, selSvc.isSelected(geo.row.task.id), styleOf(geo.row))"
            />
          }
        </g>

        <!-- The hovered row's tint (fill from the stylesheet), attached while a mounted row is hovered -->
        @if (hoverGeometry(); as hover) {
          <svg:rect
            class="gantt-row-hover"
            x="0"
            aria-hidden="true"
            pointer-events="none"
            [attr.y]="hover.y"
            [attr.width]="tl.totalWidth"
            [attr.height]="hover.height"
          />
        }

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

        <!-- Focus ring, grips, progress grip and link connectors (core computeBarOverlay; attached while shown) -->
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
          [rowStyle]="dragRowStyle()"
        ></g>

        <!-- The link being drawn: the svg's last child while the session shows a preview -->
        @if (layout.link()?.preview; as preview) {
          <svg:path
            class="gantt-link-preview"
            [class.gantt-link-preview--invalid]="preview.targetId !== null && !preview.valid"
            pointer-events="none"
            [attr.d]="linkPreviewD() ?? preview.d"
          />
        }
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
      /* The hovered row's tint (the task list's row gets the same one) */
      .gantt-row-hover {
        fill: var(--gantt-row-hover-bg);
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
      /* Editing (Gantry 2 phase 11): crosshair on the link connectors and while a link is being made,
         pointer on a dependency arrow a click can select */
      :host([data-cursor='crosshair']),
      :host([data-cursor='crosshair']) .gantt-bar-draggable {
        cursor: crosshair;
      }
      :host([data-cursor='pointer']),
      :host([data-cursor='pointer']) .gantt-bar-draggable {
        cursor: pointer;
      }
      /* The link being drawn: a dashed focus-ring line whose closed head is filled in the same colour;
         an invalid target, the overdue status colour (D22: no new theme variable) */
      .gantt-link-preview {
        fill: var(--gantt-focus-ring);
        stroke: var(--gantt-focus-ring);
        stroke-width: 2px;
        stroke-dasharray: 4 3;
      }
      .gantt-link-preview--invalid {
        fill: var(--gantt-status-overdue);
        stroke: var(--gantt-status-overdue);
      }

      /* Forced colours (D25): SVG paints are not forced (preserve-parent-color) and are inline, so
         every one is set here with !important: rows Canvas (the hover tint hidden), non-working time
         GrayText at 0.15 (intensive hours Highlight), grid lines GrayText, today Highlight; the link
         preview Highlight, invalid a 2 px dashed CanvasText */
      @media (forced-colors: active) {
        .gantt-rows > rect {
          fill: Canvas !important;
        }
        .gantt-row-hover {
          display: none;
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
        .gantt-link-preview {
          fill: Highlight !important;
          stroke: Highlight !important;
        }
        .gantt-link-preview--invalid {
          fill: CanvasText !important;
          stroke: CanvasText !important;
          stroke-width: 2px;
          stroke-dasharray: 4 2;
        }
      }
    `,
  ],
})
export class GanttCanvasComponent {
  /**
   * Bar visuals of the chart as painted (memoised per geometry; restarts with the config, timeline,
   * critical path and metrics; a progress drag's bar at its previewed progress)
   */
  readonly barVisual = input.required<BarVisualOf>();
  /**
   * The bar visuals without a progress preview (what the arrows and a progress drag's start read: a
   * progress moves no bar end). Unbound: `barVisual`.
   */
  readonly baseBarVisual = input<BarVisualOf | null>(null);
  readonly criticalIds = input<ReadonlySet<string>>(new Set());
  /** `enableDrag` of the chart (the bars' draggable state is `layout.editRules`, which reads the same flag) */
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
  /** A row was clicked (its bar or the row around it): the row, as the task list's `rowClick` */
  readonly rowClick = output<GanttFlatRow>();
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
  /** Links drawn from the connectors, arrows selected by a click (provided by GantryComponent) */
  private readonly link = inject(GanttLinkService);
  /** The progress-grip drag (provided by GantryComponent) */
  private readonly progress = inject(GanttProgressService);
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
  private readonly arrowIndex = this.layout.arrowIndex;

  /** The bar visuals without a progress preview (a progress being dragged moves no bar end) */
  private readonly baseVisual = computed<BarVisualOf>(() => this.baseBarVisual() ?? this.barVisual());

  /**
   * Arrow visual of a link, memoised per link; the memo restarts with the bar visuals (config,
   * timeline, critical path, metrics; not a progress preview), the rows and the critical path, so a
   * scroll computes only the links that entered the window.
   */
  private readonly arrowVisual = computed(() => {
    const visualOf = this.baseVisual();
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

  /**
   * The links whose span meets the window (`windowSpan`), in drawing order, keyed by `link.key`, as
   * painted: the selected one (`layout.arrowSelection`) with the focus-ring paint
   */
  protected readonly arrows = computed<MountedArrow[]>(() => {
    const { top, bottom } = this.layout.windowSpan();
    const arrowOf = this.arrowVisual();
    const shown = this.layout.arrowSelection();
    const out: MountedArrow[] = [];
    for (const link of this.arrowIndex().query(top, bottom)) {
      const visual = arrowOf(link);
      if (visual) out.push({ key: link.key, visual: shown(link.key, visual) });
    }
    return out;
  });

  /**
   * The `d` of `path.gantt-link-preview` with the bars as they are now: from the source's connector
   * to the target's, else to the last pointer (core `linkPreviewPathOf`), so a zoom during a session
   * moves the preview with the bars; `null` while none shows (the session's own `preview.d` when an
   * end has no row). The Web Component's `graph.linkPreviewPath`.
   */
  protected readonly linkPreviewD = computed<string | null>(() => {
    const link = this.layout.link();
    const preview = link?.preview;
    if (!link || !preview) return null;
    const geoById = this.layout.geometryById();
    const source = geoById.get(link.sourceId);
    const target = preview.targetId === null ? undefined : geoById.get(preview.targetId);
    const visualOf = this.barVisual();
    if (source && target && preview.targetSide) {
      return linkPreviewPathOf(visualOf(source), link.side, { visual: visualOf(target), side: preview.targetSide });
    }
    if (source && preview.targetId === null && link.pointer) {
      return linkPreviewPathOf(visualOf(source), link.side, link.pointer);
    }
    return preview.d;
  });

  /** Row geometry of the task being dragged or resized (the drag ghost's row) */
  protected readonly dragGeometry = computed(() => {
    const id = this.dragSvc.activeTaskId();
    return (id ? this.layout.geometryById().get(id) : undefined) ?? null;
  });

  /** The dragged row's resolved style (the ghost's height and radius, as its bar's); `null` while idle */
  protected readonly dragRowStyle = computed(() => {
    const geo = this.dragGeometry();
    return geo ? this.layout.rowStyle()(geo.row) : null;
  });

  /** Theme paints of the body (`var(--gantt-*)`), applied as CSS properties */
  protected readonly paints = PAINTS;
  /** Row background: selection > the row style's `rowColor` > zebra (shared with the task list) */
  protected readonly rowPaint = rowPaint;

  /**
   * Geometry of the hovered row while it shows its tint: a mounted row (window + pinned) outside the
   * table view. While nothing is hovered it reads only `hoveredRowId` (a scroll or a zoom does not
   * run it).
   */
  protected readonly hoverGeometry = computed<RowGeometry | null>(() => {
    const id = this.layout.hoveredRowId();
    if (id === null || this.layout.view() === 'table') return null;
    return this.layout.mountedGeometries().find(geo => geo.row.task.id === id) ?? null;
  });

  /**
   * Bar contexts of the mounted rows, in window order. A row whose geometry, visual, style, theme,
   * flags and layout parameters are unchanged keeps its previous `ctx` object, so its bar doesn't
   * re-render (selecting a row changes that row's context only). `style` is the row's resolved
   * style (`layout.rowStyle`, memoised per row: compared by identity).
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
      // Which bars can be dragged (`gantt-bar-draggable`, `ctx.draggable`): the rows' edit rules (D9)
      const rulesOf = this.layout.editRules();
      const styleOf = this.layout.rowStyle();
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
          draggable: rulesOf(geo.row).move,
          enableResize: !!visual.handles,
          showBaseline: cfg.baseline,
          visual,
          style: styleOf(geo.row),
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
    // A progress drag starts from the visual without a preview
    this.progress.bindVisual(() => this.baseVisual());
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

  // ── Pointer: press (drag, resize, progress, link, tap), hover, click ──────

  /** The timeline viewport (`.gantry-canvas-viewport`, the scroll container), from the first render */
  private viewport: HTMLElement | null = null;
  /** The canvas box in client px, kept until something can move it (see `connectPointer`) */
  private box: { left: number; top: number } | null = null;
  /** The measured sizes and the view the box was read with: when they change, the canvas may have moved */
  private boxKey = '';
  /** The press in progress: its gesture, and its auto-scroll once it drags */
  private current: { press: Press; auto: AutoScroll | null } | null = null;
  /** What the press drags (set once it drags) */
  private gesture: Gesture | null = null;
  /** The viewport's scroll offsets when the press started: content x = client x + the scroll since */
  private scroll0 = 0;
  private scrollTop0 = 0;
  /** Where the press started, in canvas and in client coordinates */
  private pressCanvas = { x: 0, y: 0 };
  private pressClient = { x: 0, y: 0 };
  /** The trailing click of the last press belongs to a progress or link gesture: it selects nothing */
  private swallowClick = false;
  /** Follows the pointer while dragging (set when the press starts dragging) */
  private dragMove: (g: GestureState) => void = noop;

  /** A pointer drag or resize is in progress */
  private readonly dragging = (): boolean => this.dragSvc.isPointerDrag();
  /** A press drags something (a bar, a progress, a link) */
  private readonly busy = (): boolean => this.dragging() || this.gesture !== null;

  /** The press's gesture still runs (the keyboard may have ended it) */
  private live(): boolean {
    switch (this.gesture) {
      case 'drag':
        return this.dragging();
      case 'progress':
        return this.progress.active();
      case 'link':
        return this.link.active();
      default:
        return false;
    }
  }

  /** After the first render, in the browser: press, hover and touch listeners, released with the chart. */
  private connectPointer(): void {
    const svg = this.svgEl()?.nativeElement;
    if (!svg) return;
    const host = this.hostEl.nativeElement;
    const viewport = host.closest<HTMLElement>('.gantry-canvas-viewport') ?? host;
    this.viewport = viewport;
    // The task-list pane, the viewport's sibling (its scroll moves the rows under the pointer too)
    const panel = Array.from(viewport.parentElement?.children ?? []).find(el => el.classList.contains('gantry-panel'));
    const win = this.doc.defaultView;
    // Escape cancels a press wherever focus is (the pressed bar has it), before anything else
    const keyTarget: EventTarget = win ?? host;
    const listeners = new AbortController();
    const { signal } = listeners;
    const invalidate = (): void => {
      this.box = null;
    };

    svg.addEventListener('pointerdown', e => this.onPointerDown(e, svg, keyTarget), { signal });
    svg.addEventListener('pointermove', e => this.onPointerMove(e), { passive: true, signal });
    svg.addEventListener('pointerleave', e => this.onPointerLeave(e), { signal });
    svg.addEventListener('pointerenter', invalidate, { signal });
    // A scroll of either pane moves the content under a still pointer: the canvas box is measured
    // again, and what was hovered is cleared (unless a press is in progress: a drag keeps its cursor)
    const onContentScroll = (): void => {
      invalidate();
      if (!this.current) this.unhover();
    };
    viewport.addEventListener('scroll', onContentScroll, { passive: true, signal });
    panel?.addEventListener('scroll', onContentScroll, { passive: true, signal });
    // A second finger anywhere on the timeline starts a pinch: an undecided press gives way
    viewport.addEventListener(
      'touchstart',
      e => {
        if (this.current && e.touches.length > 1 && !this.busy()) this.current.press.cancel();
      },
      { passive: true, signal },
    );
    // While a touch drags a bar, its progress or a link the browser must not pan
    bindTouchGuard(svg, this.busy, signal);
    // The page scrolling or resizing moves the canvas too (removed by hand: some DOMs don't tie a
    // window listener to an abort signal)
    win?.addEventListener('scroll', invalidate, { passive: true, capture: true });
    win?.addEventListener('resize', invalidate, { passive: true });

    this.destroyRef.onDestroy(() => {
      // A press in progress ends with the chart: no long press, drag, progress, link or auto-scroll left behind
      this.current?.press.cancel();
      listeners.abort();
      win?.removeEventListener('scroll', invalidate, { capture: true });
      win?.removeEventListener('resize', invalidate);
      // No hover survives the chart
      this.layout.hoveredBarId.set(null);
      this.layout.hoveredRowId.set(null);
    });
  }

  private onPointerDown(e: PointerEvent, svg: SVGSVGElement, keyTarget: EventTarget): void {
    // The previous press's trailing click has been dispatched by now (or never comes: a touch drag)
    this.dragSvc.lastDragMoved = false;
    this.swallowClick = false;
    // A press deselects the selected link, except a press on that link: its click selects it again,
    // so it never flickers off for a frame (presses outside the canvas: the keyboard directive)
    const selectedLink = this.layout.selectedLinkKey();
    if (selectedLink !== null) {
      this.box = null;
      const p = this.point(e.clientX, e.clientY);
      if (this.link.keyAt(p.x, p.y) !== selectedLink) this.link.deselect();
    }
    const current = this.current;
    if (current) {
      // A second pointer (a pinch, another finger): an undecided press gives way; a drag goes on
      if (current.press.pointerId !== e.pointerId && !this.busy()) current.press.cancel();
      return;
    }
    if (e.button !== 0) return;
    this.box = null;
    const at = this.point(e.clientX, e.clientY);
    // A link armed by a click takes the press (a keyboard link already ended: the keyboard directive)
    if (this.layout.link()?.mode === 'click') {
      this.pressArmed(e, at, svg, keyTarget);
      return;
    }
    const hit = this.hitOf(this.geoAt(at.y), at.x, at.y);
    if (!hit) return;
    const id = hit.geo.row.task.id;
    const mouse = gestureKind(e.pointerType) === 'mouse';
    if (mouse) {
      // No text selection or native focus: the pressed bar takes keyboard focus itself, without
      // scrolling (Escape cancels its drag); the modality stays the pointer's (no focus ring)
      e.preventDefault();
      this.focusBar(id);
      // A bar that can't be dragged: the press is a plain click (touch and pen may still tap)
      if (!hit.draggable) return;
    }
    this.beginPress(e, at);
    const target = e.target;
    const press = trackPress(e, {
      target: svg,
      keyTarget,
      draggable: hit.draggable,
      onDragStart: g => this.dragStart(hit, g),
      onDragMove: g => {
        // The keyboard shortcuts ended the gesture (Escape): the press is over too
        if (!this.live()) this.current?.press.cancel();
        else this.dragMove(g);
      },
      onEnd: (result, g) => {
        const was = this.endPress();
        const side = linkSide(hit.part);
        if (result === 'drop') this.dropGesture(was, g);
        else if ((result === 'click' || result === 'tap') && side) {
          // A click or tap on a connector arms a click-mode link (WCAG 2.5.7): the next press ends it
          this.swallowClick = true;
          this.tooltip.dismiss();
          this.link.start(id, side, 'click', at);
        } else if (result === 'tap' && this.tooltipEnabled()) {
          // The tapped bar (or the bar of a handle's reach, outside its own shapes)
          const bar = barHostOf(target) ?? this.barById(id);
          if (bar) this.tooltip.tap(hit.geo.row, bar);
        }
        // A mouse or pen hovers again where it was released (the bar may have moved under it)
        if (e.pointerType !== 'touch') this.hoverAt(g.x, g.y);
        else this.cursor.set(null);
      },
      onCancel: () => {
        this.cancelGesture(this.endPress());
        this.cursor.set(null);
      },
    });
    this.current = { press, auto: null };
  }

  /**
   * A press while a click-mode link is armed belongs to it: a mouse settles it at once; a touch or
   * pen on release (a tap), and a touch that pans keeps it armed.
   */
  private pressArmed(e: PointerEvent, at: { x: number; y: number }, svg: SVGSVGElement, keyTarget: EventTarget): void {
    this.tooltip.dismiss();
    if (gestureKind(e.pointerType) === 'mouse') {
      e.preventDefault();
      this.swallowClick = true;
      this.settleLink(at);
      return;
    }
    this.beginPress(e, at);
    const press = trackPress(e, {
      target: svg,
      keyTarget,
      draggable: false,
      onDragStart: noop,
      onDragMove: noop,
      onEnd: (result, g) => {
        this.endPress();
        if (result === 'none') return;
        this.swallowClick = true;
        this.settleLink(this.canvasAt(g.x, g.y));
        this.cursor.set(null);
      },
      onCancel: () => {
        this.endPress();
        this.link.cancel();
        this.cursor.set(null);
      },
    });
    this.current = { press, auto: null };
  }

  /** A click-mode link ends at canvas `p`: on a bar it links to that bar, elsewhere it is cancelled. */
  private settleLink(p: { x: number; y: number }): void {
    if (this.hitOf(this.geoAt(p.y), p.x, p.y)) {
      this.link.move(p.x, p.y);
      this.link.finish();
    } else this.link.cancel();
  }

  /** A press became a drag: the tooltip and the hover step aside, the gesture follows the pointer. */
  private dragStart(hit: BarPointerHit, g: GestureState): void {
    const current = this.current;
    if (!current) return;
    const id = hit.geo.row.task.id;
    this.tooltip.dismiss();
    this.layout.hoveredBarId.set(null);
    this.layout.hoveredRowId.set(null);
    this.cursor.set(dragCursor(hit.part));
    // A touch or pen drag focuses its bar too (a mouse press already did): Escape cancels it there
    if (g.kind === 'touch') this.focusBar(id);
    const handle = dragHandle(hit.part);
    const side = linkSide(hit.part);
    let follow: (clientX: number, clientY: number) => void;
    if (handle) {
      this.gesture = 'drag';
      this.dragSvc.start(hit.geo, handle, g.startX, editTiming(this.timeline(), this.config()));
      follow = x => this.dragSvc.move(this.contentX(x));
    } else if (side) {
      this.gesture = 'link';
      this.link.start(id, side, 'drag', this.pressCanvas);
      follow = (x, y) => {
        const p = this.canvasAt(x, y);
        this.link.move(p.x, p.y);
      };
    } else {
      this.gesture = 'progress';
      this.progress.start(hit.geo, g.startX);
      follow = x => this.progress.move(this.contentX(x));
    }
    let last = { x: g.x, y: g.y };
    const auto = this.scrollSvc.autoScroll({
      maxLeft: () => this.timeline().totalWidth - this.layout.viewportWidth(),
      // The viewport scrolled under a still pointer: the gesture moves by as much
      onScroll: () => follow(last.x, last.y),
    });
    current.auto = auto;
    const move = (next: GestureState): void => {
      last = { x: next.x, y: next.y };
      follow(next.x, next.y);
      auto.update(next.x);
    };
    move(g);
    this.dragMove = move;
  }

  /** Released while dragging: the gesture ends at the release point. */
  private dropGesture(was: Gesture | null, g: GestureState): void {
    if (was === 'drag') this.drop(g.x);
    else if (was === 'progress') {
      this.swallowClick = true;
      this.progress.drop(this.contentX(g.x));
    } else if (was === 'link') {
      this.swallowClick = true;
      const p = this.canvasAt(g.x, g.y);
      this.link.move(p.x, p.y);
      this.link.finish();
    }
  }

  /** The press was cancelled (Escape, `pointercancel`, a second finger, the chart destroyed): so is its gesture. */
  private cancelGesture(was: Gesture | null): void {
    this.dragSvc.cancel();
    if (was === 'progress') this.progress.cancel();
    else if (was === 'link') this.link.cancel(true);
    // The release that follows (a mouse button still down) is not a click
    if (was === 'progress' || was === 'link') this.swallowClick = true;
  }

  /** Released while dragging a bar at client x `clientX`: the task moved or resized (when it changed). */
  private drop(clientX: number): void {
    const result = this.dragSvc.drop(this.contentX(clientX));
    if (result?.kind === 'drag') this.taskDragged.emit(result.event);
    else if (result?.kind === 'resize') this.taskResized.emit(result.event);
  }

  /** Marks where a press starts (its coordinates for `contentX` / `canvasAt`). */
  private beginPress(e: PointerEvent, at: { x: number; y: number }): void {
    this.scroll0 = this.viewport?.scrollLeft ?? 0;
    this.scrollTop0 = this.viewport?.scrollTop ?? 0;
    this.pressCanvas = at;
    this.pressClient = { x: e.clientX, y: e.clientY };
  }

  /** The press is over: its auto-scroll stops; returns what it was dragging. */
  private endPress(): Gesture | null {
    const was = this.gesture;
    this.current?.auto?.stop();
    this.current = null;
    this.gesture = null;
    this.dragMove = noop;
    return was;
  }

  /** Content x of a client x: plus how far the timeline scrolled since the press */
  private contentX(clientX: number): number {
    return clientX + (this.viewport?.scrollLeft ?? 0) - this.scroll0;
  }

  /** Canvas coordinates of a client position during the press: the press point plus the pointer's and the scroll's moves */
  private canvasAt(clientX: number, clientY: number): { x: number; y: number } {
    return {
      x: this.pressCanvas.x + this.contentX(clientX) - this.pressClient.x,
      y: this.pressCanvas.y + clientY - this.pressClient.y + (this.viewport?.scrollTop ?? 0) - this.scrollTop0,
    };
  }

  // Hover (mouse and pen)

  private onPointerMove(e: PointerEvent): void {
    if (this.current || e.pointerType === 'touch' || this.dragging()) return;
    // A link armed by a click follows the pointer (and finds its target), with no tooltip
    if (this.layout.link()?.mode === 'click') {
      const { x, y } = this.point(e.clientX, e.clientY);
      this.link.move(x, y);
      this.hoverAt(e.clientX, e.clientY);
      this.tooltip.unhover();
      return;
    }
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
    this.unhover();
    this.tooltip.unhover();
  }

  /**
   * Cursor, overlay shapes and row tint for a fine pointer at a client position (geometry: the
   * handles and the edit targets reach past the bar).
   */
  private hoverAt(clientX: number, clientY: number): void {
    const { x, y } = this.point(clientX, clientY);
    const geo = this.geoAt(y);
    const hit = this.hitOf(geo, x, y);
    this.cursor.set(
      this.layout.link()
        ? 'crosshair'
        : hit
          ? hoverCursor(hit)
          : this.linksDeletable() && this.onArrow(x, y)
            ? 'pointer'
            : null,
    );
    this.layout.hoveredBarId.set(hit?.geo.row.task.id ?? null);
    this.layout.hoveredRowId.set(geo?.row.task.id ?? null);
  }

  /** Nothing is hovered any more: cursor, overlay shapes and row tint go (the tooltip has its own rules). */
  private unhover(): void {
    this.cursor.set(null);
    this.layout.hoveredBarId.set(null);
    this.layout.hoveredRowId.set(null);
  }

  /** The painted bar of `id` takes keyboard focus, without scrolling (a press on it). */
  private focusBar(id: string): void {
    (this.barById(id) as HTMLElement | SVGElement | null)?.focus({ preventScroll: true });
  }

  // Click, double-click

  protected onClick(event: MouseEvent): void {
    if (this.dragSvc.lastDragMoved || this.swallowClick) {
      this.dragSvc.lastDragMoved = false;
      this.swallowClick = false;
      return;
    }
    const { x, y } = this.point(event.clientX, event.clientY);
    // A dependency arrow (D13): a click on it selects it, not the row (bars win)
    if (this.linksDeletable() && this.link.selectAt(x, y)) return;
    const geo = this.geoAt(y);
    if (!geo) return;
    this.selSvc.handleClick(geo.row.task.id, event, this.layout.visibleRows(), {
      enabled: this.enableSelection(),
      multi: this.multiSelect(),
    });
    this.rowClick.emit(geo.row);
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

  /** Row geometry under a canvas-relative `y` (core `rowIndexAtY`) */
  private geoAt(y: number): RowGeometry | undefined {
    const geos = this.layout.rowGeometries();
    const i = rowIndexAtY(y, this.config().rowHeight, geos.length);
    return i === null ? undefined : geos[i];
  }

  /**
   * The bar of `geo` at canvas `x` / `y` and the part hit (core `hitTestBar`), `null` off it. The
   * progress grip and the link connectors count only where the bar overlay shows them
   * (`GanttBarFocusService.hitTargets`, D11).
   */
  private hitOf(geo: RowGeometry | undefined, x: number, y: number): BarPointerHit | null {
    if (!geo) return null;
    const part = hitTestBar(this.barFocus.hitTargets(geo.row.task.id, this.barVisual()(geo)), x, y);
    if (!part) return null;
    return { geo, part, draggable: !dragHandle(part) || this.layout.editRules()(geo.row).move };
  }

  /** `editing.dependencies.delete`: a click selects a link, a link under the pointer shows `pointer` */
  private linksDeletable(): boolean {
    return this.config().editing.dependencies.delete;
  }

  /** Whether a dependency arrow passes within `ARROW_HIT_TOLERANCE` of canvas `x` / `y` (core `arrowAt`) */
  private onArrow(x: number, y: number): boolean {
    const links = this.arrowIndex().query(y - ARROW_HIT_TOLERANCE, y + ARROW_HIT_TOLERANCE);
    return arrowAt(links, this.arrowVisual(), x, y) !== null;
  }

  /** The painted bar of `id` (a tap in a handle's reach, outside the bar's own shapes; a press focuses it) */
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
    a.style === b.style &&
    a.theme === b.theme &&
    a.layoutParams === b.layoutParams &&
    a.isCritical === b.isCritical &&
    a.isSelected === b.isSelected &&
    a.draggable === b.draggable &&
    a.enableResize === b.enableResize &&
    a.showBaseline === b.showBaseline
  );
}
