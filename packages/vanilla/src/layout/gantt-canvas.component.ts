/**
 * @file gantt-canvas.component.ts
 * Vanilla JS Canvas & SVG timeline renderer orchestrating grid lines, bars, arrows, annotations, and today marker.
 */

import {
  RowGeometry, GanttTheme, GanttAnnotation, GanttLayoutParams, GridLine, DependencyType
} from '@gantry/core';
import { BaseComponent } from '../core/base-component';
import { GanttTaskBarComponent } from '../bars/task-bar.component';
import { GanttGroupBarComponent } from '../bars/group-bar.component';
import { GanttMilestoneComponent } from '../bars/milestone.component';
import { GanttArrowComponent } from '../arrows/gantt-arrow.component';
import { GanttAnnotationComponent } from '../annotations/gantt-annotation.component';

export interface GanttCanvasProps {
  visibleGeometries: RowGeometry[];
  allGeometries: RowGeometry[];
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
}

export class GanttCanvasComponent extends BaseComponent<GanttCanvasProps> {
  constructor(container: HTMLElement, props: GanttCanvasProps) {
    super(container, props);
    this.render();
  }

  render(): void {
    const {
      visibleGeometries, allGeometries, totalWidth, totalHeight, gridLines,
      theme, todayX, annotations, criticalIds, selectedIds, layoutParams, showBaseline
    } = this.props;

    this.element.innerHTML = '';
    this.element.style.cssText = `
      width: ${totalWidth}px;
      min-height: ${totalHeight}px;
      position: relative;
    `;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', `${totalWidth}`);
    svg.setAttribute('height', `${totalHeight}`);
    svg.style.display = 'block';
    svg.style.overflow = 'visible';

    // 1. Row Backgrounds
    const rowBgGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    visibleGeometries.forEach((geo) => {
      const isSelected = selectedIds.has(geo.row.task.id);
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('x', '0');
      bgRect.setAttribute('y', `${geo.y}`);
      bgRect.setAttribute('width', `${totalWidth}`);
      bgRect.setAttribute('height', `${geo.height}`);
      bgRect.setAttribute('fill', isSelected ? theme.selectionBg : (geo.row.task.rowColor ?? (geo.row.visibleIndex % 2 === 0 ? theme.rowBg : theme.rowBgAlt)));
      rowBgGroup.appendChild(bgRect);
    });
    svg.appendChild(rowBgGroup);

    // 2. Vertical Grid Lines
    const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gridLines.forEach(line => {
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.setAttribute('x1', `${line.x}`);
      l.setAttribute('y1', '0');
      l.setAttribute('x2', `${line.x}`);
      l.setAttribute('y2', `${totalHeight}`);
      l.setAttribute('stroke', line.isMajor ? theme.borderColor : theme.gridLine);
      l.setAttribute('stroke-width', line.isMajor ? '0.8' : '0.5');
      gridGroup.appendChild(l);
    });
    svg.appendChild(gridGroup);

    // 3. Row Dividers
    const dividerGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    visibleGeometries.forEach(geo => {
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.setAttribute('x1', '0');
      l.setAttribute('y1', `${geo.y + geo.height}`);
      l.setAttribute('x2', `${totalWidth}`);
      l.setAttribute('y2', `${geo.y + geo.height}`);
      l.setAttribute('stroke', theme.borderColor);
      l.setAttribute('stroke-width', '0.5');
      dividerGroup.appendChild(l);
    });
    svg.appendChild(dividerGroup);

    // 4. Annotations Layer
    const annotationSVG = GanttAnnotationComponent.renderSVG({
      annotations,
      layoutParams,
      theme,
      totalHeight,
      showToday: todayX >= 0
    });
    svg.appendChild(annotationSVG);

    // 5. Dependency Arrows Layer
    const arrowsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    arrowsGroup.setAttribute('class', 'gantt-arrows-layer');

    const geoMap = new Map(allGeometries.map(g => [g.row.task.id, g]));
    allGeometries.forEach(geo => {
      const dep = geo.row.task.dependency;
      if (!dep) return;
      const deps = Array.isArray(dep) ? dep : typeof dep === 'string' ? [{ taskId: dep }] : [dep as any];
      deps.forEach(d => {
        const fromGeo = geoMap.get(d.taskId);
        if (!fromGeo) return;
        const arrowSVG = GanttArrowComponent.renderSVG({
          fromGeo,
          toGeo: geo,
          depType: d.type ?? DependencyType.FS,
          lag: d.lag ?? 0,
          isCritical: criticalIds.has(d.taskId) && criticalIds.has(geo.row.task.id),
          defaultColor: theme.arrowColor
        });
        arrowsGroup.appendChild(arrowSVG);
      });
    });
    svg.appendChild(arrowsGroup);

    // 6. Bars Layer
    const barsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    visibleGeometries.forEach(geo => {
      const ctx = {
        row: geo.row,
        geometry: geo,
        theme,
        layoutParams,
        isCritical: criticalIds.has(geo.row.task.id),
        isSelected: selectedIds.has(geo.row.task.id),
        draggable: geo.row.task.draggable !== false,
        enableResize: geo.row.task.draggable !== false,
        showBaseline
      };

      let barSVG: SVGElement;
      if (geo.row.barType === 'milestone') {
        barSVG = GanttMilestoneComponent.renderSVG(ctx);
      } else if (geo.row.barType === 'group') {
        barSVG = GanttGroupBarComponent.renderSVG(ctx);
      } else {
        barSVG = GanttTaskBarComponent.renderSVG(ctx);
      }
      barsGroup.appendChild(barSVG);
    });
    svg.appendChild(barsGroup);

    this.element.appendChild(svg);
  }
}
