// ─────────────────────────────────────────────────────────────
//  gantry · layout/gantt-canvas.component.ts
//
//  Timeline body. Everything it draws comes from the @gantry/core
//  render model (shared with the Web Component): non-working bands,
//  period delimiters, rows, annotations, today, dependency arrows and
//  bars. Bars are rendered through the bar registry, so custom bar
//  components receive the computed geometry in `ctx.visual`.
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  inject,
  signal,
  type ElementRef,
  viewChild,
} from '@angular/core';
import { GanttBarHostComponent } from './gantt-bar-host.component';

import {
  type RowGeometry,
  type GanttAnnotation,
  type GanttBarContext,
  type GanttDependency,
  type GanttFlatRow,
  type GanttTask,
  type GanttTheme,
  DependencyType,
  type SelectionChangeEvent,
  type TaskDragEvent,
  type TaskResizeEvent,
} from '../types';
import {
  computeBarVisual,
  computeArrowVisual,
  taskSpan,
  rowPaint,
  annotationPaint,
  themeMetrics,
  sameThemeMetrics,
  LightTheme,
  PAINTS,
  DRAG_SOURCE_OPACITY,
  type BarVisual,
  type ArrowVisual,
  type TimelineModel,
  type ResolvedGanttConfig,
} from '@gantry/core';

import { GanttBarRegistry } from '../bar-registry';
import { GanttArrowComponent } from '../arrows/gantt-arrow.component';
import { GanttDragService } from '../drag/gantt-drag.service';
import { GanttDragPreviewComponent } from '../drag/gantt-drag-preview.component';
import { GanttSelectionService } from '../selection/gantt-selection.service';
import { GanttI18nService } from '../services/gantt-i18n.service';
import { GanttThemeService } from '../services/gantt-theme.service';
import { GanttLayoutService } from './gantt-layout.service';
import { GanttTooltipDirective, type GanttTooltipContext } from '../tooltip/gantt-tooltip.directive';

let nextCanvasId = 0;

@Component({
  selector: 'gantt-canvas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GanttArrowComponent, GanttDragPreviewComponent, GanttTooltipDirective, GanttBarHostComponent],
  host: {
    '[style.display]': '"block"',
    '[style.position]': '"relative"',
    '[style.cursor]': 'cursor()',
  },
  template: `
    <div [style.width.px]="timeline().totalWidth" [style.height.px]="totalHeight()" [style.position]="'relative'">
      <!-- Pointer selection; the keyboard path to bars is the roving-focus model (Gantry 2 phase 9) -->
      <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events -->
      <svg
        #svgEl
        [attr.width]="timeline().totalWidth"
        [attr.height]="totalHeight()"
        [style.display]="'block'"
        [style.overflow]="'visible'"
        role="list"
        [attr.aria-label]="i18n.labels().ariaChart"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
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

        <!-- Rows -->
        <g class="gantt-rows" aria-hidden="true">
          @for (geo of visibleGeometries(); track geo.row.task.id) {
            <svg:rect
              [attr.x]="0"
              [attr.y]="geo.y"
              [attr.width]="timeline().totalWidth"
              [attr.height]="geo.height"
              [style.fill]="rowPaint(geo, selSvc.isSelected(geo.row.task.id))"
            />
          }
        </g>

        <!-- Non-working time (full height: unchanged while scrolling) -->
        <g class="gantt-bands" aria-hidden="true" pointer-events="none">
          @for (band of timeline().bands; track band.x) {
            <svg:rect
              [attr.class]="'gantt-band gantt-band--' + band.kind + (band.className ? ' ' + band.className : '')"
              [attr.x]="band.x"
              y="0"
              [attr.width]="band.width"
              [attr.height]="totalHeight()"
              [style.fill]="band.paint"
            />
            @if (hatch() && band.kind !== 'intensive') {
              <svg:rect
                [attr.x]="band.x"
                y="0"
                [attr.width]="band.width"
                [attr.height]="totalHeight()"
                [attr.fill]="'url(#' + uid + '-hatch)'"
              />
            }
          }
        </g>

        <!-- Grid: minor lines, row separators, period delimiters -->
        <g class="gantt-grid" aria-hidden="true" pointer-events="none" shape-rendering="crispEdges">
          @if (config().gridLines.minor; as minor) {
            @for (x of timeline().minorLines; track x) {
              <svg:line
                class="gantt-grid-minor"
                [attr.x1]="x + 0.5"
                y1="0"
                [attr.x2]="x + 0.5"
                [attr.y2]="totalHeight()"
                [style.stroke]="minor.paint"
                [attr.stroke-width]="minor.width"
                [attr.stroke-dasharray]="minor.dash ?? null"
              />
            }
          }
          @if (config().gridLines.horizontal; as hz) {
            @for (geo of visibleGeometries(); track geo.row.task.id) {
              <svg:line
                class="gantt-grid-row"
                [attr.x1]="0"
                [attr.y1]="geo.y + geo.height - 0.5"
                [attr.x2]="timeline().totalWidth"
                [attr.y2]="geo.y + geo.height - 0.5"
                [style.stroke]="hz.paint"
                [attr.stroke-width]="hz.width"
                [attr.stroke-dasharray]="hz.dash ?? null"
              />
            }
          }
          @if (config().gridLines.major; as major) {
            @for (x of timeline().majorLines; track x) {
              <svg:line
                class="gantt-grid-major"
                [attr.x1]="x + 0.5"
                y1="0"
                [attr.x2]="x + 0.5"
                [attr.y2]="totalHeight()"
                [style.stroke]="major.paint"
                [attr.stroke-width]="major.width"
                [attr.stroke-dasharray]="major.dash ?? null"
              />
            }
          }
        </g>

        <!-- Annotations -->
        <g class="gantt-annotations" aria-hidden="true" pointer-events="none">
          @for (ann of resolvedAnnotations(); track $index) {
            @if (ann.x2 !== null) {
              <svg:rect
                [attr.x]="ann.x1"
                [attr.y]="windowTop()"
                [attr.width]="ann.x2 - ann.x1"
                [attr.height]="windowHeight()"
                [style.fill]="ann.paint"
                [attr.opacity]="ann.opacity ?? 0.08"
              />
            }
            <svg:line
              [attr.x1]="ann.x1"
              [attr.y1]="windowTop()"
              [attr.x2]="ann.x1"
              [attr.y2]="windowBottom()"
              [style.stroke]="ann.paint"
              stroke-width="1.5"
              stroke-dasharray="5 3"
              opacity="0.8"
            />
          }
        </g>

        <!-- Today -->
        @if (timeline().todayX >= 0) {
          <svg:line
            class="gantt-today"
            [attr.x1]="timeline().todayX"
            [attr.y1]="windowTop()"
            [attr.x2]="timeline().todayX"
            [attr.y2]="windowBottom()"
            [style.stroke]="paints.today"
            stroke-width="2"
            pointer-events="none"
          />
        }

        <!-- Dependency arrows -->
        <g class="gantt-arrows">
          @for (a of arrows(); track a.id) {
            <g ganttArrow [arrow]="a.visual" [fontPx]="fontPx()"></g>
          }
        </g>

        <!-- Bars -->
        <g class="gantt-bars-layer">
          @for (geo of visibleGeometries(); track geo.row.task.id) {
            <g
              [ganttTooltip]="geo"
              [tooltipTheme]="theme()"
              [tooltipDates]="config()"
              [tooltipContext]="tooltipContext()"
              [tooltipEnabled]="tooltipEnabled() && !dragSvc.isActive()"
              [attr.opacity]="dragSvc.activeTaskId() === geo.row.task.id ? dragSourceOpacity : null"
            >
              <g ganttBarHost [barComponent]="resolveBarComponent(geo.row.barType)" [ctx]="barContext(geo)"></g>
            </g>
          }
        </g>

        <!-- Annotation labels (above the bars) -->
        <g class="gantt-annotation-labels" aria-hidden="true" pointer-events="none">
          @for (ann of resolvedAnnotations(); track $index) {
            @if (ann.label) {
              <svg:text
                [attr.x]="ann.x1 + 6"
                [attr.y]="windowTop() + 14"
                [style.fill]="ann.label.color ?? ann.paint"
                [attr.font-size]="ann.label.fontSize ?? fontPx() - 1"
                [attr.font-weight]="ann.label.fontWeight ?? 600"
                style="user-select:none"
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
          [timeline]="timeline()"
          [fontPx]="fontPx()"
        ></g>
      </svg>
    </div>
  `,
  styles: [
    `
      :host {
        outline: none;
      }
    `,
  ],
})
export class GanttCanvasComponent {
  readonly timeline = input.required<TimelineModel>();
  readonly config = input.required<ResolvedGanttConfig>();
  readonly visibleGeometries = input.required<RowGeometry[]>();
  readonly allGeometries = input.required<RowGeometry[]>();
  readonly windowTop = input<number>(0);
  readonly windowBottom = input<number>(0);
  readonly totalHeight = input.required<number>();
  readonly annotations = input<GanttAnnotation[]>([]);
  readonly criticalIds = input<ReadonlySet<string>>(new Set());
  readonly enableResize = input<boolean>(true);
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
  /** @deprecated Never emitted — listen to `selectionChange` on `<gantry>`. */
  readonly selectionChange = output<SelectionChangeEvent>();
  readonly rowClick = output<RowGeometry>();
  readonly rowDblClick = output<GanttFlatRow>();

  /** Unique per instance: SVG ids live in the light DOM */
  protected readonly uid = `gantry-${++nextCanvasId}`;
  private readonly svgEl = viewChild<ElementRef<SVGSVGElement>>('svgEl');
  private readonly registry = inject(GanttBarRegistry);
  protected readonly dragSvc = inject(GanttDragService);
  protected readonly selSvc = inject(GanttSelectionService);
  protected readonly i18n = inject(GanttI18nService);
  /** The chart's clock (absent when the canvas is used on its own) */
  private readonly layout = inject(GanttLayoutService, { optional: true });
  /** The chart's theme (absent when the canvas is used on its own: the light theme) */
  private readonly themeSvc = inject(GanttThemeService, { optional: true });

  /** Resolved theme: custom bars' `ctx.theme` and the tooltip popover's tokens */
  protected readonly theme = computed<Required<GanttTheme>>(() => this.themeSvc?.resolvedTheme() ?? LightTheme);
  /** Label font and the label colour on explicit bar colours; a colour-only theme change keeps them */
  private readonly metrics = computed(() => themeMetrics(this.theme()), { equal: sameThemeMetrics });
  protected readonly fontPx = computed(() => this.metrics().fontPx);
  protected readonly windowHeight = computed(() => Math.max(0, this.windowBottom() - this.windowTop()));
  protected readonly hatch = computed(() => this.config().nonWorking?.style === 'hatch');
  protected readonly snapUnit = computed<'day' | 'hour'>(() => {
    const scales = this.config().scales;
    return scales[scales.length - 1].unit === 'hour' ? 'hour' : 'day';
  });
  private readonly hoverCursor = signal('');
  protected readonly cursor = computed(() =>
    this.dragSvc.isDragging() ? 'grabbing' : this.dragSvc.isResizing() ? 'ew-resize' : this.hoverCursor(),
  );

  /** Extra tooltip rows: critical path, float, predecessors / successors */
  protected readonly tooltipContext = computed<GanttTooltipContext>(() => ({
    now: this.layout ? new Date(this.layout.now()) : undefined,
    criticalIds: this.criticalIds(),
    floatDays: this.floatDays(),
    tasksById: this.tasksById(),
  }));

  // ── Render model ──────────────────────────────────────────

  /**
   * Bar visual of a row geometry (visible rows + arrow endpoints). Cached per geometry
   * object: collapse, sort or an edit produce new geometries, so bars follow their rows.
   */
  protected readonly visuals = computed(() => {
    const cfg = this.config();
    const tl = this.timeline();
    const crit = this.criticalIds();
    const { fontPx, barTextColor } = this.metrics();
    const resizable = this.enableDrag() && this.enableResize();
    const cache = new WeakMap<RowGeometry, BarVisual>();
    return (geo: RowGeometry): BarVisual => {
      let v = cache.get(geo);
      if (!v) {
        v = computeBarVisual({
          geo,
          cfg,
          toX: tl.toX,
          fontPx,
          barTextColor,
          isCritical: crit.has(geo.row.task.id),
          resizable: resizable && geo.row.task.draggable !== false,
        });
        cache.set(geo, v);
      }
      return v;
    };
  });

  protected readonly arrows = computed<{ id: string; visual: ArrowVisual }[]>(() => {
    const visualOf = this.visuals();
    const cfg = this.config();
    const crit = this.criticalIds();
    const top = this.windowTop();
    const bottom = this.windowBottom();
    const all = this.allGeometries();
    const byId = new Map(all.map(g => [g.row.task.id, g]));
    const out: { id: string; visual: ArrowVisual }[] = [];
    for (const geo of all) {
      for (const dep of normalizeDeps(geo.row.task.dependency)) {
        const from = byId.get(dep.taskId);
        if (!from) continue;
        if (Math.max(from.y, geo.y) + geo.height < top || Math.min(from.y, geo.y) > bottom) continue;
        out.push({
          id: `${dep.taskId}->${geo.row.task.id}`,
          visual: computeArrowVisual(
            visualOf(from),
            visualOf(geo),
            { type: dep.type ?? DependencyType.FS, lag: dep.lag },
            cfg,
            { fromTop: from.y, fromBottom: from.y + from.height },
            crit.has(dep.taskId) && crit.has(geo.row.task.id),
          ),
        });
      }
    }
    return out;
  });

  /** Row geometry of the task being dragged or resized (the drag ghost's row) */
  protected readonly dragGeometry = computed(() => {
    const id = this.dragSvc.activeTaskId();
    return (id ? this.allGeometries().find(g => g.row.task.id === id) : undefined) ?? null;
  });

  /** Theme paints of the body (`var(--gantt-*)`), applied as CSS properties */
  protected readonly paints = PAINTS;
  protected readonly dragSourceOpacity = DRAG_SOURCE_OPACITY;
  /** Row background: selection > `task.rowColor` > zebra (shared with the task list) */
  protected readonly rowPaint = rowPaint;

  protected readonly resolvedAnnotations = computed(() => {
    const tl = this.timeline();
    return this.annotations().map(ann => ({
      x1: tl.toX(ann.x1),
      x2: ann.x2 ? tl.toX(ann.x2) : null,
      // An `isToday` annotation takes the today colour (Angular only, kept as is)
      paint: annotationPaint(ann),
      label: ann.label,
      opacity: ann.opacity,
    }));
  });

  protected barContext(geo: RowGeometry): GanttBarContext {
    const tl = this.timeline();
    const cfg = this.config();
    const id = geo.row.task.id;
    const draggable = this.enableDrag() && geo.row.task.draggable !== false;
    const visual = this.visuals()(geo);
    return {
      row: geo.row,
      geometry: geo,
      theme: this.theme(),
      layoutParams: { origin: tl.start, pxPerDay: tl.pxPerDay, rowHeight: cfg.rowHeight },
      isCritical: this.criticalIds().has(id),
      isSelected: this.selSvc.isSelected(id),
      draggable,
      enableResize: !!visual.handles,
      showBaseline: cfg.baseline,
      visual,
    };
  }

  protected resolveBarComponent(barType: string) {
    return this.registry.resolve(barType);
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
    this.dragSvc.startDrag(event, hit.geo, hit.handle, svg);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.dragSvc.isActive()) return;
    const hit = this.enableDrag() ? this.hitTest(event) : null;
    this.hoverCursor.set(
      !hit || hit.geo.row.task.draggable === false ? '' : hit.handle === 'bar' ? 'grab' : 'ew-resize',
    );
  }

  protected onClick(event: MouseEvent): void {
    if (this.dragSvc.lastDragMoved) {
      this.dragSvc.lastDragMoved = false;
      return;
    }
    const geo = this.rowAt(event);
    if (!geo) return;
    this.selSvc.handleClick(
      geo.row.task.id,
      event,
      this.allGeometries().map(g => g.row),
      { enabled: this.enableSelection(), multi: this.multiSelect() },
    );
    this.rowClick.emit(geo);
  }

  protected onDblClick(event: MouseEvent): void {
    const geo = this.rowAt(event);
    if (geo) this.rowDblClick.emit(geo.row);
  }

  /** Bar under the pointer (using the rendered geometry) and the handle hit. */
  private hitTest(event: PointerEvent | MouseEvent): { geo: RowGeometry; handle: 'bar' | 'left' | 'right' } | null {
    const p = this.svgPoint(event);
    const geo = p && this.allGeometries()[Math.floor(p.y / this.config().rowHeight)];
    if (!p || !geo) return null;
    const v = this.visuals()(geo);
    const pad = v.kind === 'milestone' ? 3 : 0;
    const insideY = p.y >= v.y - pad && p.y <= v.y + v.height + pad + (v.caps ? 7 : 0);
    if (!insideY) return null;
    if (v.handles) {
      if (p.x >= v.handles.left[0] && p.x <= v.handles.left[1]) return { geo, handle: 'left' };
      if (p.x >= v.handles.right[0] && p.x <= v.handles.right[1]) return { geo, handle: 'right' };
    }
    return p.x >= v.x - pad && p.x <= v.x + v.width + pad ? { geo, handle: 'bar' } : null;
  }

  private rowAt(event: MouseEvent): RowGeometry | undefined {
    const p = this.svgPoint(event);
    return p ? this.allGeometries()[Math.floor(p.y / this.config().rowHeight)] : undefined;
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

function normalizeDeps(dep: string | GanttDependency | GanttDependency[] | undefined): GanttDependency[] {
  if (!dep) return [];
  if (typeof dep === 'string') return [{ taskId: dep }];
  return Array.isArray(dep) ? dep : [dep];
}
