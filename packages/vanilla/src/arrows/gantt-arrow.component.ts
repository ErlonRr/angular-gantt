/**
 * @file gantt-arrow.component.ts
 * Vanilla JS SVG Dependency arrow renderer for FS, SS, FF, SF relationships.
 */

import { RowGeometry, DependencyType } from '@gantry/core';

export interface GanttArrowProps {
  fromGeo: RowGeometry;
  toGeo: RowGeometry;
  depType?: DependencyType;
  lag?: number;
  color?: string;
  isCritical?: boolean;
  defaultColor?: string;
}

const OFFSET_X = 12;
const ARROW_SIZE = 6;

export class GanttArrowComponent {
  static renderSVG(props: GanttArrowProps): SVGElement {
    const { fromGeo, toGeo, depType = DependencyType.FS, lag = 0, color, isCritical = false, defaultColor = '#3B82F6' } = props;

    const arrowColor = isCritical ? '#EF4444' : (color || defaultColor);
    const strokeWidth = isCritical ? 1.5 : 1.2;
    const markerId = `gantt-arrow-${fromGeo.row.task.id}-${toGeo.row.task.id}`;

    const fromRight = depType === DependencyType.FS || depType === DependencyType.FF;
    const toRight = depType === DependencyType.FF || depType === DependencyType.SF;

    const exitX = fromRight ? fromGeo.barX + fromGeo.barWidth : fromGeo.barX;
    const exitY = fromGeo.y + fromGeo.height / 2;

    const entryX = toRight ? toGeo.barX + toGeo.barWidth + ARROW_SIZE : toGeo.barX - ARROW_SIZE;
    const entryY = toGeo.y + toGeo.height / 2;

    const hGap = OFFSET_X + Math.max(lag, 0) * 2;
    const vx = fromRight ? exitX + hGap : exitX - hGap;

    const pathD = `M ${exitX} ${exitY} H ${vx} V ${entryY} H ${entryX}`;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'gantt-arrow-group');

    // Defs marker
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', markerId);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '5');
    marker.setAttribute('markerHeight', '5');
    marker.setAttribute('orient', 'auto-start-reverse');

    const markerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    markerPath.setAttribute('d', 'M1 1 L8 5 L1 9');
    markerPath.setAttribute('fill', 'none');
    markerPath.setAttribute('stroke', arrowColor);
    markerPath.setAttribute('stroke-width', '1.8');
    markerPath.setAttribute('stroke-linecap', 'round');
    markerPath.setAttribute('stroke-linejoin', 'round');
    marker.appendChild(markerPath);
    defs.appendChild(marker);
    g.appendChild(defs);

    // Path
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'gantt-arrow-path');
    path.setAttribute('d', pathD);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', arrowColor);
    path.setAttribute('stroke-width', `${strokeWidth}`);
    if (lag > 0) path.setAttribute('stroke-dasharray', '5 3');
    path.setAttribute('marker-end', `url(#${markerId})`);
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    g.appendChild(path);

    // Circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', `${exitX}`);
    circle.setAttribute('cy', `${exitY}`);
    circle.setAttribute('r', '2.5');
    circle.setAttribute('fill', arrowColor);
    g.appendChild(circle);

    return g;
  }
}
