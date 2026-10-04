/**
 * @file task-bar.component.ts
 * Vanilla JS standard TaskBar component SVG renderer.
 */

import { GanttBarContext } from '@gantry/core';

export class GanttTaskBarComponent {
  static renderSVG(ctx: GanttBarContext): SVGElement {
    const geo = ctx.geometry;
    const theme = ctx.theme;
    const task = ctx.row.task;
    const isSelected = ctx.isSelected ?? false;
    const isCritical = ctx.isCritical ?? false;
    const showBaseline = !!(ctx.showBaseline && task.baseline);

    const barY = geo.y + 4;
    const barHeight = Math.max(geo.height - 8, 4);
    const barWidth = Math.max(geo.barWidth, 4);
    const progress = Math.min(Math.max(task.progress ?? 0, 0), 100);
    const progressWidth = Math.max((barWidth * progress) / 100, 0);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'gantt-task-bar-group');
    g.setAttribute('data-task-id', task.id);

    // Selected row highlight
    if (isSelected) {
      const selRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      selRect.setAttribute('x', '0');
      selRect.setAttribute('y', `${geo.y}`);
      selRect.setAttribute('width', '100%');
      selRect.setAttribute('height', `${geo.height}`);
      selRect.setAttribute('fill', theme.selectionBg);
      selRect.setAttribute('opacity', '0.18');
      g.appendChild(selRect);
    }

    // Main Bar
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('class', 'gantt-bar-bg');
    rect.setAttribute('x', `${geo.barX}`);
    rect.setAttribute('y', `${barY}`);
    rect.setAttribute('width', `${barWidth}`);
    rect.setAttribute('height', `${barHeight}`);
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', isCritical ? theme.criticalColor : (task.barColor ?? theme.barColor));
    if (isCritical) {
      rect.setAttribute('stroke', theme.criticalColor);
      rect.setAttribute('stroke-width', '1.5');
    }
    g.appendChild(rect);

    // Progress fill
    if (progressWidth > 0) {
      const progRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      progRect.setAttribute('class', 'gantt-bar-progress');
      progRect.setAttribute('x', `${geo.barX}`);
      progRect.setAttribute('y', `${barY}`);
      progRect.setAttribute('width', `${progressWidth}`);
      progRect.setAttribute('height', `${barHeight}`);
      progRect.setAttribute('rx', '4');
      progRect.setAttribute('fill', 'rgba(0,0,0,0.22)');
      g.appendChild(progRect);
    }

    // Label
    if (barWidth >= 40) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('class', 'gantt-bar-label');
      text.setAttribute('x', `${geo.barX + barWidth / 2}`);
      text.setAttribute('y', `${barY + barHeight / 2}`);
      text.setAttribute('fill', theme.barTextColor);
      text.setAttribute('font-size', theme.fontSize);
      text.setAttribute('font-family', theme.fontFamily);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.style.pointerEvents = 'none';
      text.textContent = task.name;
      g.appendChild(text);
    }

    // Baseline rail
    if (showBaseline && task.baseline) {
      const { origin, pxPerDay } = ctx.layoutParams;
      const bX = Math.round((task.baseline.start.getTime() - origin.getTime()) / 86_400_000 * pxPerDay);
      const bW = Math.max(Math.round(((task.baseline.end.getTime() - task.baseline.start.getTime()) / 86_400_000) * pxPerDay), 2);
      const bY = geo.y + geo.height - 2;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', `${bX}`);
      line.setAttribute('y1', `${bY}`);
      line.setAttribute('x2', `${bX + bW}`);
      line.setAttribute('y2', `${bY}`);
      line.setAttribute('stroke', theme.baselineColor);
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '5 4');
      line.setAttribute('opacity', '0.88');
      g.appendChild(line);
    }

    return g;
  }
}
