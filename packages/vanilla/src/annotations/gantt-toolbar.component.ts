/**
 * @file gantt-toolbar.component.ts
 * Vanilla JS Gantt toolbar component with zoom, view mode pills, and today button.
 */

import { ViewMode, GanttTheme } from '@gantry/core';
import { BaseComponent } from '../core/base-component';
import { EventEmitter } from '../core/event-emitter';
import { GanttI18nService } from '../services/gantt-i18n.service';

export interface GanttToolbarProps {
  theme: GanttTheme;
  currentView: ViewMode;
  i18n: GanttI18nService;
}

const VIEW_MODES: ViewMode[] = [
  ViewMode.Day,
  ViewMode.Week,
  ViewMode.Month,
  ViewMode.Quarter,
  ViewMode.Year,
];

export class GanttToolbarComponent extends BaseComponent<GanttToolbarProps> {
  readonly zoomIn$ = new EventEmitter<void>();
  readonly zoomOut$ = new EventEmitter<void>();
  readonly viewModeChange$ = new EventEmitter<ViewMode>();
  readonly scrollToToday$ = new EventEmitter<void>();

  constructor(container: HTMLElement, props: GanttToolbarProps) {
    super(container, props);
    this.render();
  }

  render(): void {
    const { theme, currentView, i18n } = this.props;
    const labels = i18n.labels;

    this.element.innerHTML = '';
    this.element.className = 'gantt-toolbar';
    this.element.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background-color: ${theme.headerBackground};
      border-bottom: 1px solid ${theme.borderColor};
      flex-shrink: 0;
      flex-wrap: wrap;
    `;

    // Zoom buttons
    const zoomGroup = document.createElement('div');
    zoomGroup.style.cssText = 'display: flex; gap: 4px;';

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.className = 'gantt-tb-btn';
    zoomOutBtn.textContent = '−';
    zoomOutBtn.style.cssText = `padding: 3px 10px; font-size: 12px; border: 1px solid ${theme.borderColor}; border-radius: 4px; background: ${theme.panelBg}; color: ${theme.textSecondary}; cursor: pointer;`;
    zoomOutBtn.addEventListener('click', () => this.zoomOut$.emit());

    const zoomInBtn = document.createElement('button');
    zoomInBtn.className = 'gantt-tb-btn';
    zoomInBtn.textContent = '+';
    zoomInBtn.style.cssText = `padding: 3px 10px; font-size: 12px; border: 1px solid ${theme.borderColor}; border-radius: 4px; background: ${theme.panelBg}; color: ${theme.textSecondary}; cursor: pointer;`;
    zoomInBtn.addEventListener('click', () => this.zoomIn$.emit());

    zoomGroup.appendChild(zoomOutBtn);
    zoomGroup.appendChild(zoomInBtn);
    this.element.appendChild(zoomGroup);

    // Separator
    const sep1 = document.createElement('div');
    sep1.style.cssText = `width: 1px; height: 18px; background: ${theme.borderColor}; opacity: 0.6;`;
    this.element.appendChild(sep1);

    // View mode pills
    const pillsGroup = document.createElement('div');
    pillsGroup.style.cssText = 'display: flex; gap: 2px;';

    VIEW_MODES.forEach(vm => {
      const isActive = currentView === vm;
      const btn = document.createElement('button');
      btn.className = `gantt-tb-pill ${isActive ? 'gantt-tb-pill--active' : ''}`;
      btn.textContent = labels.viewModes[vm] ?? vm;
      btn.style.cssText = `
        padding: 2px 8px;
        font-size: 11px;
        border: 1px solid ${isActive ? theme.barColor : theme.borderColor};
        border-radius: 3px;
        background: ${isActive ? theme.barColor : 'transparent'};
        color: ${isActive ? '#ffffff' : theme.textSecondary};
        font-family: ${theme.fontFamily};
        cursor: pointer;
      `;
      btn.addEventListener('click', () => this.viewModeChange$.emit(vm));
      pillsGroup.appendChild(btn);
    });

    this.element.appendChild(pillsGroup);

    // Separator
    const sep2 = document.createElement('div');
    sep2.style.cssText = `width: 1px; height: 18px; background: ${theme.borderColor}; opacity: 0.6;`;
    this.element.appendChild(sep2);

    // Today button
    const todayBtn = document.createElement('button');
    todayBtn.className = 'gantt-tb-btn';
    todayBtn.textContent = `◎ ${labels.todayButton}`;
    todayBtn.style.cssText = `padding: 3px 10px; font-size: 12px; border: 1px solid ${theme.todayColor}66; border-radius: 4px; background: ${theme.panelBg}; color: ${theme.todayColor}; cursor: pointer;`;
    todayBtn.addEventListener('click', () => this.scrollToToday$.emit());
    this.element.appendChild(todayBtn);
  }
}
