/**
 * @file gantt-toolbar.component.ts
 * Vanilla JS toolbar: zoom, zoom-level pills, "today" and the split / table /
 * chart view switch — each part configurable through `options.toolbar`.
 */

import type { GanttLabels, GanttView, ResolvedToolbar, GanttZoomLevel } from '@gantry/core';
import { BaseComponent } from '../core/base-component';
import { EventEmitter } from '../core/event-emitter';

export interface GanttToolbarProps {
  toolbar:     ResolvedToolbar;
  zoomLevels:  GanttZoomLevel[];
  currentView: string;
  view:        GanttView;
  labels:      GanttLabels;
}

export class GanttToolbarComponent extends BaseComponent<GanttToolbarProps> {
  readonly zoomIn$ = new EventEmitter<void>();
  readonly zoomOut$ = new EventEmitter<void>();
  readonly viewModeChange$ = new EventEmitter<string>();
  readonly scrollToToday$ = new EventEmitter<void>();
  readonly viewChange$ = new EventEmitter<GanttView>();

  constructor(container: HTMLElement, props: GanttToolbarProps) {
    super(container, props);
    this.render();
  }

  render(): void {
    const { toolbar, zoomLevels, currentView, view, labels } = this.props;
    const bar = document.createElement('div');
    bar.className = 'gantt-toolbar';
    bar.setAttribute('role', 'toolbar');
    const group = () => {
      const g = document.createElement('div');
      g.className = 'gantt-tb-group';
      bar.appendChild(g);
      return g;
    };
    const button = (parent: HTMLElement, text: string, title: string, onClick: () => void, cls = 'gantt-tb-btn') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = text;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('click', onClick);
      parent.appendChild(b);
      return b;
    };

    if (toolbar.zoom) {
      const g = group();
      button(g, '−', labels.zoomOut, () => this.zoomOut$.emit());
      button(g, '+', labels.zoomIn, () => this.zoomIn$.emit());
    }

    if (toolbar.viewModes !== false && toolbar.viewModes.length) {
      const g = group();
      g.classList.add('gantt-tb-pills');
      for (const name of toolbar.viewModes) {
        const level = zoomLevels.find(l => l.name === name);
        if (!level) continue;
        const text = level.label ?? (labels.viewModes as Record<string, string>)[name] ?? name;
        const b = button(g, text, text, () => this.viewModeChange$.emit(name), 'gantt-tb-pill');
        b.setAttribute('aria-pressed', String(name === currentView));
      }
    }

    if (toolbar.today) {
      button(group(), `◎ ${labels.todayButton}`, labels.todayButton, () => this.scrollToToday$.emit(), 'gantt-tb-btn gantt-tb-today');
    }

    if (toolbar.viewToggle) {
      const g = group();
      g.classList.add('gantt-tb-pills', 'gantt-tb-views');
      const views: [GanttView, string][] = [['split', labels.viewSplit], ['table', labels.viewTable], ['chart', labels.viewChart]];
      for (const [v, text] of views) {
        const b = button(g, text, text, () => this.viewChange$.emit(v), 'gantt-tb-pill');
        b.setAttribute('aria-pressed', String(v === view));
      }
    }

    this.element.replaceChildren(bar);
  }
}
