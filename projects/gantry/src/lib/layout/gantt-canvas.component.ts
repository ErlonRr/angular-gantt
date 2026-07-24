// ─────────────────────────────────────────────────────────────
//  gantry · layout/gantt-canvas.component.ts  (v2)
//
//  Adds to v1:
//    - Pointer event routing to GanttDragService
//    - Selection highlight via GanttSelectionService
//    - Tooltip via GanttTooltipDirective
//    - Drag preview overlay via GanttDragPreviewComponent
//    - Drag handle detection (8px zones on bar edges), only when the
//      pointer hits the bar shape — not empty row area to the left/right
// ─────────────────────────────────────────────────────────────

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  inject,
  ElementRef,
  viewChild,
} from '@angular/core';
import { GanttBarHostComponent } from './gantt-bar-host.component';

import {
  RowGeometry,
  GanttTheme,
  GanttAnnotation,
  GanttBarContext,
  GanttLayoutParams,
  DependencyType,
  SelectionChangeEvent,
  TaskDragEvent,
  TaskResizeEvent,
} from '../types';

import { GanttBarRegistry } from '../bar-registry';
import { GanttArrowComponent } from '../arrows/gantt-arrow.component';
import { GanttDragService } from '../drag/gantt-drag.service';
import { GanttDragPreviewComponent } from '../drag/gantt-drag-preview.component';
import { GanttSelectionService } from '../selection/gantt-selection.service';
import { GanttTooltipDirective } from '../tooltip/gantt-tooltip.directive';
import { GridLine, dateToPixel } from '../gantt-math';

const RESIZE_HANDLE_PX = 8;

interface ResolvedArrow {
  id: string; fromGeo: RowGeometry; toGeo: RowGeometry;
  depType: DependencyType; lag: number; isCritical: boolean;
}

@Component({
  selector: 'gantt-canvas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GanttArrowComponent, GanttDragPreviewComponent, GanttTooltipDirective, GanttBarHostComponent],
  host: {
    '[style.display]': '"block"',
    /* Scroll lives on GantryComponent’s #canvasEl only — nested overflow:auto here
       stole horizontal scroll so scrollLeft never reached GanttScrollService / header. */
    '[style.overflow]': '"visible"',
    '[style.position]': '"relative"',
    '[style.flex]': '"1"',
    '[style.min-height]': '"0"',
    '[style.background-color]': 'transparent',
    '[style.cursor]': 'dragSvc.isDragging() ? "grabbing" : "default"',
    'tabindex': '0',
  },
  template: `
    <div [style.width.px]="totalWidth()" [style.min-height.px]="totalHeight()" [style.position]="'relative'">
      <svg #svgEl [attr.width]="totalWidth()" [attr.height]="totalHeight()"
        [style.display]="'block'" [style.overflow]="'visible'"
        role="list" aria-label="Gantt chart timeline"
        (pointerdown)="onSvgPointerDown($event)"
        (click)="onSvgClick($event)">

        <!-- Row backgrounds -->
        <g aria-hidden="true">
          @for (geo of visibleGeometries(); track geo.row.task.id) {
            <svg:rect [attr.x]="0" [attr.y]="geo.y" [attr.width]="totalWidth()"
              [attr.height]="geo.height" [attr.fill]="rowBg(geo)"/>
          }
        </g>

        <!-- Vertical grid lines -->
        <g aria-hidden="true">
          @for (line of gridLines(); track line.x) {
            <svg:line [attr.x1]="line.x" [attr.y1]="0" [attr.x2]="line.x" [attr.y2]="totalHeight()"
              [attr.stroke]="line.isMajor ? theme().borderColor : theme().gridLine"
              [attr.stroke-width]="line.isMajor ? 0.8 : 0.5"/>
          }
        </g>

        <!-- Row dividers -->
        <g aria-hidden="true">
          @for (geo of visibleGeometries(); track geo.row.task.id) {
            <svg:line [attr.x1]="0" [attr.y1]="geo.y + geo.height"
              [attr.x2]="totalWidth()" [attr.y2]="geo.y + geo.height"
              [attr.stroke]="theme().borderColor" stroke-width="0.5"/>
          }
        </g>

        <!-- Annotations -->
        @if (annotations().length) {
          <g aria-hidden="true">
            @for (ann of resolvedAnnotations(); track ann.x1) {
              @if (ann.x2 !== null) {
                <svg:rect [attr.x]="ann.x1" [attr.y]="0" [attr.width]="ann.x2 - ann.x1"
                  [attr.height]="totalHeight()" [attr.fill]="ann.color" [attr.opacity]="ann.opacity ?? 0.08"/>
              }
              <svg:line [attr.x1]="ann.x1" [attr.y1]="0" [attr.x2]="ann.x1" [attr.y2]="totalHeight()"
                [attr.stroke]="ann.color" stroke-width="1.5"
                [attr.stroke-dasharray]="ann.isToday ? null : '5 3'"/>
              @if (ann.label) {
                <svg:text [attr.x]="ann.x1 + 4" [attr.y]="12" [attr.fill]="ann.label.color ?? ann.color"
                  [attr.font-size]="ann.label.fontSize ?? '11px'" [attr.font-family]="theme().fontFamily"
                  style="pointer-events:none;user-select:none">{{ ann.label.text }}</svg:text>
              }
            }
          </g>
        }

        <!-- Today marker -->
        @if (todayX() >= 0) {
          <g aria-hidden="true">
            <svg:line [attr.x1]="todayX()" [attr.y1]="0" [attr.x2]="todayX()" [attr.y2]="totalHeight()"
              [attr.stroke]="theme().todayColor" stroke-width="1.5"/>
            <svg:polygon [attr.points]="todayTriangle()" [attr.fill]="theme().todayColor"/>
          </g>
        }

        <!-- Dependency arrows -->
        <g aria-hidden="true">
          @for (arrow of resolvedArrows(); track arrow.id) {
            <g ganttArrow [fromGeo]="arrow.fromGeo" [toGeo]="arrow.toGeo"
              [depType]="arrow.depType" [lag]="arrow.lag"
              [isCritical]="arrow.isCritical" [defaultColor]="theme().arrowColor"/>
          }
        </g>

        <!-- Task bars with tooltip -->
        <g>
          @for (geo of visibleGeometries(); track geo.row.task.id) {
            <g [ganttTooltip]="geo" [tooltipTheme]="theme()" [tooltipEnabled]="tooltipEnabled()">
              <g
                ganttBarHost
                [barComponent]="resolveBarComponent(geo.row.barType)"
                [ctx]="buildBarContext(geo)"
              />
            </g>
          }
        </g>

        <!-- Drag preview ghost -->
        <g ganttDragPreview [preview]="dragSvc.preview()" [theme]="theme()"/>

      </svg>
    </div>
  `,
  styles: [`
    :host { outline: none; }
  `],
})
export class GanttCanvasComponent {

  readonly visibleGeometries = input.required<RowGeometry[]>();
  readonly allGeometries = input.required<RowGeometry[]>();
  readonly totalWidth = input.required<number>();
  readonly totalHeight = input.required<number>();
  readonly gridLines = input.required<GridLine[]>();
  readonly theme = input.required<GanttTheme>();
  readonly todayX = input<number>(-1);
  readonly annotations = input<GanttAnnotation[]>([]);
  readonly criticalIds = input<Set<string>>(new Set());
  readonly layoutParams = input.required<GanttLayoutParams>();
  readonly showBaseline = input<boolean>(false);
  readonly enableResize = input<boolean>(true);
  readonly enableDrag = input<boolean>(true);
  readonly tooltipEnabled = input<boolean>(true);

  readonly taskDragged = output<TaskDragEvent>();
  readonly taskResized = output<TaskResizeEvent>();
  readonly selectionChange = output<SelectionChangeEvent>();
  readonly rowClick = output<RowGeometry>();

  private readonly svgEl = viewChild<ElementRef<SVGSVGElement>>('svgEl');
  private readonly registry = inject(GanttBarRegistry);
  protected readonly dragSvc = inject(GanttDragService);
  private readonly selSvc = inject(GanttSelectionService);

  // ── Pointer events ─────────────────────────────────────────

  protected onSvgPointerDown(event: PointerEvent): void {
    if (!this.enableDrag()) return;
    const geo = this._geoFromPoint(event);
    if (!geo) return;
    if (!this._rowDragEnabled(geo)) return;
    const handle = this._resolveDragHandle(event, geo);
    if (handle === null) return;
    const svg = this.svgEl()?.nativeElement;
    if (!svg) return;

    this.dragSvc.configure({
      pxPerDay: this.layoutParams().pxPerDay,
      origin: this.layoutParams().origin,
      rowHeight: this.layoutParams().rowHeight,
    });
    this.dragSvc.onTaskDragged = e => this.taskDragged.emit(e);
    this.dragSvc.onTaskResized = e => this.taskResized.emit(e);
    this.dragSvc.startDrag(event, geo, handle, svg);
  }

  protected onSvgClick(event: MouseEvent): void {
    if (this.dragSvc.isActive()) return; // swallow click after drag
    const geo = this._geoFromPoint(event as PointerEvent);
    if (!geo) return;

    this.selSvc.onChange = e => this.selectionChange.emit(e);
    this.selSvc.handleClick(geo.row.task.id, event, this.visibleGeometries().map(g => g.row));
    this.rowClick.emit(geo);
  }

  /** Per-task gate: `task.draggable === false` disables move/resize for that row (any depth). */
  private _rowDragEnabled(geo: RowGeometry): boolean {
    return this.enableDrag() && geo.row.task.draggable !== false;
  }

  private _geoFromPoint(event: PointerEvent | MouseEvent): RowGeometry | null {
    const svg = this.svgEl()?.nativeElement;
    if (!svg) return null;
    const svgY = this._svgUserY(svg, event);
    if (svgY == null) return null;
    const rh = this.layoutParams().rowHeight;
    const idx = Math.floor(svgY / rh);
    return this.visibleGeometries()[idx] ?? null;
  }

  /**
   * Whether drag/resize may start — only on the bar geometry, not blank row space.
   * Milestone: diamond (L1); group: main bar + cap drop (matches GanttGroupBarComponent).
   */
  private _resolveDragHandle(
    e: PointerEvent,
    geo: RowGeometry,
  ): 'bar' | 'left' | 'right' | null {
    const svg = this.svgEl()?.nativeElement;
    if (!svg) return null;
    const svgX = this._svgUserX(svg, e);
    const svgY = this._svgUserY(svg, e);
    if (svgX == null || svgY == null) return null;

    switch (geo.row.barType) {
      case 'milestone':
        return this._hitMilestone(svgX, svgY, geo) ? 'bar' : null;
      case 'group':
        return this._hitGroupBar(svgX, svgY, geo) ? 'bar' : null;
      default:
        return this._hitTaskBar(svgX, svgY, geo);
    }
  }

  /** Task bar: same vertical insets as GanttTaskBarComponent (4px top/bottom). */
  private _hitTaskBar(
    svgX: number,
    svgY: number,
    geo: RowGeometry,
  ): 'bar' | 'left' | 'right' | null {
    const barY = geo.y + 4;
    const barH = geo.height - 8;
    if (svgY < barY || svgY > barY + barH) return null;

    const x0 = geo.barX;
    const x1 = geo.barX + geo.barWidth;
    if (svgX < x0 || svgX > x1) return null;

    if (!this.enableResize()) return 'bar';

    if (svgX <= x0 + RESIZE_HANDLE_PX) return 'left';
    if (svgX >= x1 - RESIZE_HANDLE_PX) return 'right';
    return 'bar';
  }

  /** Diamond around (barX, row centre); |dx|+|dy| ≤ size — same as milestone template. */
  private _hitMilestone(svgX: number, svgY: number, geo: RowGeometry): boolean {
    const cx = geo.barX;
    const cy = geo.y + geo.height / 2;
    const s = Math.round((geo.height - 10) / 2);
    const dx = svgX - cx;
    const dy = svgY - cy;
    return Math.abs(dx) + Math.abs(dy) <= s;
  }

  /** Group bar + bracket drop; matches GanttGroupBarComponent metrics. */
  private _hitGroupBar(svgX: number, svgY: number, geo: RowGeometry): boolean {
    const barH = Math.max(Math.round(geo.height * 0.45), 8);
    const barY = geo.y + Math.round((geo.height - barH) / 2);
    const drop = 5;
    const bw = Math.max(geo.barWidth, 4);
    const x0 = geo.barX;
    const x1 = geo.barX + bw;
    const y1 = barY + barH + drop;
    return svgX >= x0 && svgX <= x1 && svgY >= barY && svgY <= y1;
  }

  /** Pointer position in SVG user space (stable with any scroll ancestor). */
  private _svgUserX(svg: SVGSVGElement, event: PointerEvent | MouseEvent): number | null {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return p.x;
  }

  private _svgUserY(svg: SVGSVGElement, event: PointerEvent | MouseEvent): number | null {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return p.y;
  }

  // ── Bar context & registry ────────────────────────────────

  protected buildBarContext(geo: RowGeometry): GanttBarContext {
    const rowDrag = this._rowDragEnabled(geo);
    return {
      row: geo.row, geometry: geo, theme: this.theme(),
      layoutParams: this.layoutParams(),
      isCritical: this.criticalIds().has(geo.row.task.id),
      isSelected: this.selSvc.isSelected(geo.row.task.id),
      draggable: rowDrag,
      enableResize: this.enableResize() && rowDrag,
      showBaseline: this.showBaseline(),
    };
  }

  protected resolveBarComponent(barType: string) {
    return this.registry.resolve(barType);
  }

  protected rowBg(geo: RowGeometry): string {
    if (this.selSvc.isSelected(geo.row.task.id)) return this.theme().selectionBg;
    if (geo.row.task.rowColor) return geo.row.task.rowColor;
    return geo.row.visibleIndex % 2 === 0 ? this.theme().rowBg : this.theme().rowBgAlt;
  }

  protected todayTriangle(): string {
    const x = this.todayX();
    return `${x - 5},0 ${x + 5},0 ${x},8`;
  }

  protected readonly resolvedAnnotations = computed(() => {
    const { origin, pxPerDay } = this.layoutParams();
    return this.annotations().map(ann => ({
      x1: dateToPixel(ann.x1, origin, pxPerDay),
      x2: ann.x2 ? dateToPixel(ann.x2, origin, pxPerDay) : null,
      color: ann.isToday ? this.theme().todayColor : (ann.color ?? this.theme().arrowColor),
      label: ann.label, isToday: ann.isToday ?? false, opacity: ann.opacity,
    }));
  });

  protected readonly resolvedArrows = computed<ResolvedArrow[]>(() => {
    const geoMap = new Map(this.allGeometries().map(g => [g.row.task.id, g]));
    const critIds = this.criticalIds();
    const result: ResolvedArrow[] = [];
    for (const geo of this.allGeometries()) {
      const dep = geo.row.task.dependency;
      if (!dep) continue;
      const deps = Array.isArray(dep) ? dep
        : typeof dep === 'string' ? [{ taskId: dep }] : [dep as any];
      for (const d of deps) {
        const fromGeo = geoMap.get(d.taskId);
        if (!fromGeo) continue;
        result.push({
          id: `${d.taskId}->${geo.row.task.id}`,
          fromGeo, toGeo: geo,
          depType: d.type ?? DependencyType.FS,
          lag: d.lag ?? 0,
          isCritical: critIds.has(d.taskId) && critIds.has(geo.row.task.id),
        });
      }
    }
    return result;
  });
}
