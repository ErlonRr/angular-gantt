/**
 * @file gantt-header.component.ts
 * Timeline header painter: N tiers from the core render model, drawn as HTML so
 * labels can stick to the left edge while scrolling (`position: sticky`) and
 * ellipsize natively. Period delimiters, the current period and non-working
 * time are tinted to match the chart body.
 */

import type { TimelineModel, ResolvedGanttConfig, GanttLabels } from '@gantry/core';
import { BaseComponent } from '../core/base-component';

export interface GanttHeaderProps {
  timeline: TimelineModel;
  config: ResolvedGanttConfig;
  labels: GanttLabels;
}

export class GanttHeaderComponent extends BaseComponent<GanttHeaderProps> {
  constructor(container: HTMLElement, props: GanttHeaderProps) {
    super(container, props);
    this.render();
  }

  render(): void {
    const { timeline, config } = this.props;
    const theme = config.theme;
    const major = config.gridLines.major;
    const majorSet = new Set(timeline.majorLines);
    const lastTier = timeline.tiers.length - 1;

    const root = document.createElement('div');
    root.className = 'g-header';
    root.setAttribute('aria-hidden', 'true');
    root.style.cssText = `width:${timeline.totalWidth}px;height:${timeline.headerHeight}px;`;

    timeline.tiers.forEach((tier, i) => {
      const row = document.createElement('div');
      row.className = `g-tier g-tier--${tier.unit}${tier.align === 'start' ? ' g-tier--start' : ''}`;
      row.style.cssText = `top:${tier.y}px;height:${tier.height}px;`;

      // Non-working time tint on the finest tier
      if (i === lastTier && config.nonWorking?.showInHeader) {
        for (const band of timeline.bands) {
          const b = document.createElement('div');
          b.className = `g-band g-band--${band.kind}`;
          b.style.cssText = `left:${band.x}px;width:${band.width}px;background:${band.color};`;
          row.appendChild(b);
        }
      }

      for (const cell of tier.cells) {
        const el = document.createElement('div');
        el.className = `g-cell${cell.isCurrent && i === lastTier ? ' g-cell--current' : ''}${cell.className ? ` ${cell.className}` : ''}`;
        // Upper tiers are delimiters by definition; lower cells only at major boundaries
        const isMajor = cell.x > 0 && (i < lastTier || majorSet.has(cell.x));
        const border =
          isMajor && major
            ? `${major.width}px ${major.dash ? 'dashed' : 'solid'} ${major.color}`
            : `1px solid ${theme.borderColor}`;
        el.style.cssText = `left:${cell.x}px;width:${cell.width}px;border-left:${cell.x > 0 ? border : 'none'};`;
        const label = document.createElement('span');
        label.className = 'g-cell-label';
        label.textContent = cell.label;
        label.title = cell.label;
        el.appendChild(label);
        row.appendChild(el);
      }
      root.appendChild(row);
    });

    // "Today" pointer at the bottom of the header (a line would cover the labels)
    if (timeline.todayX >= 0) {
      const today = document.createElement('div');
      today.className = 'g-today-pointer';
      today.style.left = `${timeline.todayX}px`;
      root.appendChild(today);
    }

    this.element.replaceChildren(root);
  }
}
