/**
 * @file gantt-canvas.component.ts
 * Vanilla JS SVG timeline renderer orchestrating grid lines, bars, arrows,
 * annotations, today marker and drag preview.
 *
 * Only the rows inside the virtual-scroll window are rendered; the SVG keeps
 * the full height so the viewport scrolls natively.
 */

import {
  RowGeometry, GanttTheme, GanttAnnotation, GanttLayoutParams, GridLine,
  DependencyType, GanttDependency, GanttBarContext,
} from '@gantry/core';
import { BaseComponent } from '../core/base-component';
import { GanttTaskBarComponent } from '../bars/task-bar.component';
import { GanttGroupBarComponent } from '../bars/group-bar.component';
import { GanttMilestoneComponent } from '../bars/milestone.component';
import { GanttArrowComponent } from '../arrows/gantt-arrow.component';
import { GanttAnnotationComponent } from '../annotations/gantt-annotation.component';
import type { DragPreview } from '../drag/gantt-drag.service';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Custom bar renderer. Return an SVG element to replace the built-in bar,
 * or `null`/`undefined` to fall back to `renderDefault()`.
 * The returned element should carry `data-task-id` to stay interactive.
 */
export type GanttBarRenderer = (
  ctx: GanttBarContext,
  renderDefault: () => SVGElement,
) => SVGElement | null | undefined;

export interface GanttCanvasProps {
  visibleGeometries: RowGeometry[];
  allGeometries: RowGeometry[];
  /** Vertical pixel range currently rendered (for culling arrows) */
  windowTop: number;
  windowBottom: number;
  totalWidth: number;
  totalHeight: number;
  gridLines: GridLine[];
  theme: GanttTheme;
  todayX: number;
  annotations: GanttAnnotation[];
  criticalIds: Set<string>;
  selectedIds: Set<string>;
  layoutParams: GanttLayoutParams;
  showBaseline: boolean;
  enableDrag: boolean;
  enableResize: boolean;
  dragPreview: DragPreview | null;
  ariaLabel: string;
  renderBar?: GanttBarRenderer;
}

export class GanttCanvasComponent extends BaseComponent<GanttCanvasProps> {
  constructor(container: HTMLElement, props: GanttCanvasProps) {
    super(container, props);
    this.render();
  }

  render(): void {
    const {
      visibleGeometries, allGeometries, windowTop, windowBottom, totalWidth, totalHeight,
      gridLines, theme, todayX, annotations, criticalIds, selectedIds, layoutParams,
      showBaseline, enableDrag, enableResize, dragPreview, ariaLabel, renderBar,
    } = this.props;

    this.element.innerHTML = '';
    this.element.style.cssText = `width:${totalWidth}px;height:${totalHeight}px;position:relative;`;

    const svg = svgEl('svg', { width: totalWidth, height: totalHeight, role: 'list', 'aria-label': ariaLabel });
    svg.style.display = 'block';
    svg.style.overflow = 'visible';

    // 1. Row backgrounds + dividers (visible window only)
    const rowsGroup = svgEl('g', { 'aria-hidden': 'true' });
    for (const geo of visibleGeometries) {
      const task = geo.row.task;
      rowsGroup.appendChild(svgEl('rect', {
        x: 0, y: geo.y, width: totalWidth, height: geo.height,
        fill: selectedIds.has(task.id)
          ? theme.selectionBg
          : task.rowColor ?? (geo.row.visibleIndex % 2 === 0 ? theme.rowBg : theme.rowBgAlt),
      }));
      rowsGroup.appendChild(svgEl('line', {
        x1: 0, y1: geo.y + geo.height, x2: totalWidth, y2: geo.y + geo.height,
        stroke: theme.borderColor, 'stroke-width': 0.5,
      }));
    }
    svg.appendChild(rowsGroup);

    // 2. Vertical grid lines (span the rendered window only)
    const gridGroup = svgEl('g', { 'aria-hidden': 'true' });
    for (const line of gridLines) {
      gridGroup.appendChild(svgEl('line', {
        x1: line.x, y1: windowTop, x2: line.x, y2: windowBottom,
        stroke: line.isMajor ? theme.borderColor : theme.gridLine,
        'stroke-width': line.isMajor ? 0.8 : 0.5,
      }));
    }
    svg.appendChild(gridGroup);

    // 3. Annotations + today marker
    svg.appendChild(GanttAnnotationComponent.renderSVG({
      annotations, layoutParams, theme, totalHeight, showToday: todayX >= 0,
    }));

    // 4. Dependency arrows that cross the rendered window
    const arrowsGroup = svgEl('g', { class: 'gantt-arrows-layer', 'aria-hidden': 'true' });
    const geoMap = new Map(allGeometries.map(g => [g.row.task.id, g]));
    for (const geo of allGeometries) {
      for (const dep of normalizeDeps(geo.row.task.dependency)) {
        const fromGeo = geoMap.get(dep.taskId);
        if (!fromGeo) continue;
        const top = Math.min(fromGeo.y, geo.y);
        const bottom = Math.max(fromGeo.y, geo.y) + geo.height;
        if (bottom < windowTop || top > windowBottom) continue;
        arrowsGroup.appendChild(GanttArrowComponent.renderSVG({
          fromGeo,
          toGeo: geo,
          depType: dep.type ?? DependencyType.FS,
          lag: dep.lag ?? 0,
          isCritical: criticalIds.has(dep.taskId) && criticalIds.has(geo.row.task.id),
          defaultColor: theme.arrowColor,
        }));
      }
    }
    svg.appendChild(arrowsGroup);

    // 5. Bars
    const barsGroup = svgEl('g', { class: 'gantt-bars-layer' });
    for (const geo of visibleGeometries) {
      const task = geo.row.task;
      const draggable = enableDrag && task.draggable !== false;
      const ctx: GanttBarContext = {
        row: geo.row,
        geometry: geo,
        theme,
        layoutParams,
        isCritical: criticalIds.has(task.id),
        isSelected: selectedIds.has(task.id),
        draggable,
        enableResize: draggable && enableResize && isResizable(geo.row.barType),
        showBaseline,
      };
      const renderDefault = () => defaultBar(ctx);
      const bar = renderBar?.(ctx, renderDefault) ?? renderDefault();

      bar.setAttribute('data-task-id', task.id);
      bar.setAttribute('data-bar-type', geo.row.barType);
      bar.setAttribute('role', 'listitem');
      bar.setAttribute('aria-label', `${task.name}, ${task.progress ?? 0}% complete${showBaseline && task.baseline ? ', planned baseline shown' : ''}`);
      if (draggable) bar.classList.add('gantt-bar-draggable');
      if (dragPreview?.taskId === task.id) bar.setAttribute('opacity', '0.35');
      barsGroup.appendChild(bar);
    }
    svg.appendChild(barsGroup);

    // 6. Drag ghost
    if (dragPreview) {
      const ghost = svgEl('rect', {
        class: 'gantt-drag-preview',
        x: dragPreview.x, y: dragPreview.y + 4,
        width: dragPreview.width, height: Math.max(dragPreview.height - 8, 4),
        rx: 4, fill: theme.barColor, 'fill-opacity': 0.25,
        stroke: theme.barColor, 'stroke-width': 1.5, 'stroke-dasharray': '4 3',
        'pointer-events': 'none',
      });
      svg.appendChild(ghost);
    }

    this.element.appendChild(svg);
  }
}

/** Milestones and summary (group) bars can move but not be resized. */
export function isResizable(barType: string): boolean {
  return barType !== 'milestone' && barType !== 'group';
}

function defaultBar(ctx: GanttBarContext): SVGElement {
  switch (ctx.row.barType) {
    case 'milestone': return GanttMilestoneComponent.renderSVG(ctx);
    case 'group':     return GanttGroupBarComponent.renderSVG(ctx);
    default:          return GanttTaskBarComponent.renderSVG(ctx);
  }
}

function normalizeDeps(dep: string | GanttDependency | GanttDependency[] | undefined): GanttDependency[] {
  if (!dep) return [];
  if (typeof dep === 'string') return [{ taskId: dep }];
  return Array.isArray(dep) ? dep : [dep];
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}
