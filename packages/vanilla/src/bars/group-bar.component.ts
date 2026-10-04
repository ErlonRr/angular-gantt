/**
 * @file group-bar.component.ts
 * Vanilla JS Group/Parent summary bar SVG renderer.
 */

import { GanttBarContext } from '@gantry/core';

export class GanttGroupBarComponent {
  static renderSVG(ctx: GanttBarContext): SVGElement {
    const geo = ctx.geometry;
    const theme = ctx.theme;
    const task = ctx.row.task;
    const isSelected = ctx.isSelected ?? false;

    const barHeight = Math.max(Math.round(geo.height * 0.45), 8);
    const barY = geo.y + Math.round((geo.height - barHeight) / 2);
    const barWidth = Math.max(geo.barWidth, 4);
    const fill = task.barColor ?? theme.barColor;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'gantt-group-bar-group');
    g.setAttribute('data-task-id', task.id);

    // Group summary bar
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('class', 'gantt-group-bar');
    rect.setAttribute('x', `${geo.barX}`);
    rect.setAttribute('y', `${barY}`);
    rect.setAttribute('width', `${barWidth}`);
    rect.setAttribute('height', `${barHeight}`);
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', fill);
    rect.setAttribute('opacity', '0.9');
    g.appendChild(rect);

    // Left bracket cap
    const leftCap = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const x = geo.barX;
    leftCap.setAttribute('points', `${x},${barY} ${x + 5},${barY} ${x},${barY + barHeight + 5}`);
    leftCap.setAttribute('fill', fill);
    g.appendChild(leftCap);

    // Right bracket cap
    const rightCap = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const rx = geo.barX + barWidth;
    rightCap.setAttribute('points', `${rx},${barY} ${rx - 5},${barY} ${rx},${barY + barHeight + 5}`);
    rightCap.setAttribute('fill', fill);
    g.appendChild(rightCap);

    // Label
    if (barWidth >= 30) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', `${geo.barX + barWidth / 2}`);
      text.setAttribute('y', `${barY + barHeight / 2}`);
      text.setAttribute('fill', theme.textPrimary);
      text.setAttribute('font-size', theme.fontSize);
      text.setAttribute('font-family', theme.fontFamily);
      text.setAttribute('font-weight', '600');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.style.pointerEvents = 'none';
      text.textContent = task.name;
      g.appendChild(text);
    }

    // Selection outline
    if (isSelected) {
      const selRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      selRect.setAttribute('x', `${geo.barX - 2}`);
      selRect.setAttribute('y', `${barY - 2}`);
      selRect.setAttribute('width', `${barWidth + 4}`);
      selRect.setAttribute('height', `${barHeight + 4}`);
      selRect.setAttribute('rx', '4');
      selRect.setAttribute('fill', 'none');
      selRect.setAttribute('stroke', theme.selectionBorder);
      selRect.setAttribute('stroke-width', '1.5');
      selRect.setAttribute('stroke-dasharray', '4 2');
      g.appendChild(selRect);
    }

    return g;
  }
}
