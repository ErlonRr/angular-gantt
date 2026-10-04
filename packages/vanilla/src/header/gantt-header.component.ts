/**
 * @file gantt-header.component.ts
 * Vanilla JS SVG-based dual-tier timeline header component matching ngx-gantry visual specification.
 */

import { ViewMode, GanttTheme, generateHeaderRows, HeaderCell } from '@gantry/core';
import { BaseComponent } from '../core/base-component';
import { GanttI18nService } from '../services/gantt-i18n.service';

export interface GanttHeaderProps {
  viewMode: ViewMode;
  startDate: Date;
  endDate: Date;
  pxPerDay: number;
  totalWidth: number;
  theme: GanttTheme;
  i18nService: GanttI18nService;
}

export class GanttHeaderComponent extends BaseComponent<GanttHeaderProps> {
  private svgEl!: SVGSVGElement;

  constructor(container: HTMLElement, props: GanttHeaderProps) {
    super(container, props);
    this.render();
  }

  render(): void {
    const { viewMode, startDate, endDate, pxPerDay, totalWidth, theme, i18nService } = this.props;
    const [topRow, bottomRow] = generateHeaderRows(viewMode, startDate, endDate, pxPerDay, i18nService.bundle);

    const topHeight = topRow.height;
    const bottomHeight = bottomRow.height;
    const totalHeight = topHeight + bottomHeight;

    this.element.innerHTML = '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', `${totalWidth}`);
    svg.setAttribute('height', `${totalHeight}`);
    svg.style.display = 'block';

    // Top tier row
    const topG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    topG.setAttribute('class', 'gantt-header-top');

    topRow.cells.forEach(cell => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', `${cell.x + 0.5}`);
      rect.setAttribute('y', '0.5');
      rect.setAttribute('width', `${cell.width - 1}`);
      rect.setAttribute('height', `${topHeight - 1}`);
      rect.setAttribute('fill', theme.headerBackground);
      rect.setAttribute('stroke', theme.borderColor);
      rect.setAttribute('stroke-width', '0.5');
      g.appendChild(rect);

      if (cell.width >= 24) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', `${cell.x + cell.width / 2}`);
        text.setAttribute('y', `${topHeight / 2}`);
        text.setAttribute('fill', theme.textPrimary);
        text.setAttribute('font-size', theme.fontSize);
        text.setAttribute('font-family', theme.fontFamily);
        text.setAttribute('font-weight', '600');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.style.pointerEvents = 'none';
        text.textContent = cell.label;
        g.appendChild(text);
      }
      topG.appendChild(g);
    });

    // Bottom tier row
    const bottomG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    bottomG.setAttribute('class', 'gantt-header-bottom');
    bottomG.setAttribute('transform', `translate(0, ${topHeight})`);

    const today = new Date();

    bottomRow.cells.forEach(cell => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const cellStart = new Date(cell.dateKey);
      const cellEnd = new Date(cellStart.getTime() + (cell.width / pxPerDay) * 86_400_000);
      const isToday = today >= cellStart && today < cellEnd;

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', `${cell.x + 0.5}`);
      rect.setAttribute('y', '0.5');
      rect.setAttribute('width', `${cell.width - 1}`);
      rect.setAttribute('height', `${bottomHeight - 1}`);
      rect.setAttribute('fill', isToday ? theme.todayColor + '1F' : theme.headerBackground);
      rect.setAttribute('stroke', theme.borderColor);
      rect.setAttribute('stroke-width', '0.5');
      g.appendChild(rect);

      if (cell.width >= 20) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', `${cell.x + cell.width / 2}`);
        text.setAttribute('y', `${bottomHeight / 2}`);
        text.setAttribute('fill', isToday ? theme.todayColor : theme.textSecondary);
        text.setAttribute('font-size', '12px');
        text.setAttribute('font-family', theme.fontFamily);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.style.pointerEvents = 'none';
        text.textContent = cell.label;
        g.appendChild(text);
      }
      bottomG.appendChild(g);
    });

    svg.appendChild(topG);
    svg.appendChild(bottomG);
    this.element.appendChild(svg);
  }
}
