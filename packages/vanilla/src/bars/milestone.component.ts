/**
 * @file milestone.component.ts
 * Vanilla JS Milestone diamond SVG renderer.
 */

import { GanttBarContext } from '@gantry/core';

export class GanttMilestoneComponent {
  static renderSVG(ctx: GanttBarContext): SVGElement {
    const geo = ctx.geometry;
    const theme = ctx.theme;
    const task = ctx.row.task;
    const isSelected = ctx.isSelected ?? false;
    const isCritical = ctx.isCritical ?? false;

    const cx = geo.barX;
    const cy = geo.y + geo.height / 2;
    const s = Math.round((geo.height - 10) / 2);

    const fill = isCritical ? theme.criticalColor : (task.barColor ?? theme.milestoneColor);
    const stroke = isCritical ? theme.criticalColor : 'none';

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'gantt-milestone-group');
    g.setAttribute('data-task-id', task.id);

    // Diamond polygon: top, right, bottom, left
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('class', 'gantt-milestone-diamond');
    poly.setAttribute('points', `${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`);
    poly.setAttribute('fill', fill);
    poly.setAttribute('stroke', stroke);
    poly.setAttribute('stroke-width', isCritical ? '2' : '1');
    g.appendChild(poly);

    // Label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', `${cx + s + 6}`);
    text.setAttribute('y', `${cy}`);
    text.setAttribute('fill', theme.textPrimary);
    text.setAttribute('font-size', theme.fontSize);
    text.setAttribute('font-family', theme.fontFamily);
    text.setAttribute('dominant-baseline', 'central');
    text.style.pointerEvents = 'none';
    text.textContent = task.name;
    g.appendChild(text);

    // Selection ring
    if (isSelected) {
      const selPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      selPoly.setAttribute('points', `${cx},${cy - s - 2} ${cx + s + 2},${cy} ${cx},${cy + s + 2} ${cx - s - 2},${cy}`);
      selPoly.setAttribute('fill', 'none');
      selPoly.setAttribute('stroke', theme.selectionBorder);
      selPoly.setAttribute('stroke-width', '2');
      selPoly.setAttribute('stroke-dasharray', '4 2');
      g.appendChild(selPoly);
    }

    return g;
  }
}
