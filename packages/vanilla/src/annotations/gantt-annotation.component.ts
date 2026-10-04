/**
 * @file gantt-annotation.component.ts
 * Vanilla JS Annotation & Today Marker SVG renderer.
 */

import { GanttAnnotation, GanttTheme, GanttLayoutParams, dateToPixel } from '@gantry/core';

export interface GanttAnnotationProps {
  annotations: GanttAnnotation[];
  layoutParams: GanttLayoutParams;
  theme: GanttTheme;
  totalHeight: number;
  showToday?: boolean;
}

export class GanttAnnotationComponent {
  static renderSVG(props: GanttAnnotationProps): SVGElement {
    const { annotations, layoutParams, theme, totalHeight, showToday = true } = props;
    const { origin, pxPerDay } = layoutParams;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'gantt-annotations-layer');
    g.setAttribute('aria-hidden', 'true');
    g.style.pointerEvents = 'none';

    // Today marker
    if (showToday) {
      const todayX = dateToPixel(new Date(), origin, pxPerDay);
      if (todayX >= 0) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', `${todayX}`);
        line.setAttribute('y1', '0');
        line.setAttribute('x2', `${todayX}`);
        line.setAttribute('y2', `${totalHeight}`);
        line.setAttribute('stroke', theme.todayColor);
        line.setAttribute('stroke-width', '2');
        g.appendChild(line);

        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', `${todayX - 5},0 ${todayX + 5},0 ${todayX},9`);
        poly.setAttribute('fill', theme.todayColor);
        g.appendChild(poly);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', `${todayX + 5}`);
        text.setAttribute('y', '16');
        text.setAttribute('fill', theme.todayColor);
        text.setAttribute('font-size', '10');
        text.setAttribute('font-weight', '600');
        text.setAttribute('font-family', theme.fontFamily);
        text.style.userSelect = 'none';
        text.textContent = 'TODAY';
        g.appendChild(text);
      }
    }

    // Consumer annotations
    annotations.forEach(ann => {
      const x1 = dateToPixel(ann.x1, origin, pxPerDay);
      const x2 = ann.x2 ? dateToPixel(ann.x2, origin, pxPerDay) : null;
      const color = ann.color ?? theme.arrowColor;

      // Shaded region
      if (x2 !== null) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', `${x1}`);
        rect.setAttribute('y', '0');
        rect.setAttribute('width', `${x2 - x1}`);
        rect.setAttribute('height', `${totalHeight}`);
        rect.setAttribute('fill', color);
        rect.setAttribute('opacity', `${ann.opacity ?? 0.08}`);
        g.appendChild(rect);
      }

      // Vertical line
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', `${x1}`);
      line.setAttribute('y1', '0');
      line.setAttribute('x2', `${x1}`);
      line.setAttribute('y2', `${totalHeight}`);
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-dasharray', '5 3');
      line.setAttribute('opacity', '0.8');
      g.appendChild(line);

      // Label
      if (ann.label) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', `${x1 + 8}`);
        text.setAttribute('y', '13');
        text.setAttribute('fill', ann.label.color ?? color);
        text.setAttribute('font-size', ann.label.fontSize ?? '11px');
        text.setAttribute('font-weight', ann.label.fontWeight ?? '500');
        text.setAttribute('font-family', theme.fontFamily);
        text.style.userSelect = 'none';
        text.textContent = ann.label.text;
        g.appendChild(text);
      }
    });

    return g;
  }
}
