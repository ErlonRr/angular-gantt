/**
 * @file gantt-tooltip.ts
 * Vanilla JS Tooltip helper using HTML Popover API (Baseline 2024).
 */

import { RowGeometry, GanttTheme, formatDate, durationLabel } from '@gantry/core';
import { GanttI18nService } from '../services/gantt-i18n.service';

const SHOW_DELAY = 320;
const HIDE_DELAY = 120;
const OFFSET_X = 12;
const OFFSET_Y = 8;

export class GanttTooltip {
  private popover: HTMLElement;
  private showTimer = 0;
  private hideTimer = 0;
  private lastX = 0;
  private lastY = 0;
  private i18n: GanttI18nService;
  private theme: GanttTheme;
  private geo: RowGeometry;

  constructor(theme: GanttTheme, i18n: GanttI18nService, geo: RowGeometry) {
    this.theme = theme;
    this.i18n = i18n;
    this.geo = geo;

    this.popover = document.createElement('div');
    this.popover.setAttribute('popover', 'manual');
    this.popover.className = 'gantt-tooltip-popover';
    this.applyStyles();
    document.body.appendChild(this.popover);
  }

  attachToElement(targetEl: HTMLElement | SVGElement): void {
    targetEl.addEventListener('pointerenter', (e: Event) => {
      const pe = e as PointerEvent;
      this.lastX = pe.clientX;
      this.lastY = pe.clientY;
      clearTimeout(this.hideTimer);
      this.showTimer = window.setTimeout(() => this.show(), SHOW_DELAY);
    });

    targetEl.addEventListener('pointerleave', () => {
      clearTimeout(this.showTimer);
      this.hideTimer = window.setTimeout(() => this.hide(), HIDE_DELAY);
    });

    targetEl.addEventListener('pointermove', (e: Event) => {
      const pe = e as PointerEvent;
      this.lastX = pe.clientX;
      this.lastY = pe.clientY;
      this.position(pe.clientX, pe.clientY);
    });
  }

  private show(): void {
    this.popover.innerHTML = this.buildHTML();
    try {
      this.popover.showPopover();
    } catch {
      this.popover.style.display = 'block';
    }
    this.position(this.lastX, this.lastY);
  }

  private hide(): void {
    try {
      this.popover.hidePopover();
    } catch {
      this.popover.style.display = 'none';
    }
  }

  private position(clientX: number, clientY: number): void {
    const rect = this.popover.getBoundingClientRect();
    let left = clientX + OFFSET_X;
    let top = clientY + OFFSET_Y;

    if (left + rect.width > window.innerWidth - 8) {
      left = clientX - rect.width - OFFSET_X;
    }
    if (top + rect.height > window.innerHeight - 8) {
      top = clientY - rect.height - OFFSET_Y;
    }

    this.popover.style.left = `${Math.max(8, left)}px`;
    this.popover.style.top = `${Math.max(8, top)}px`;
  }

  private applyStyles(): void {
    Object.assign(this.popover.style, {
      position: 'fixed',
      zIndex: '9999',
      pointerEvents: 'none',
      padding: '8px 12px',
      borderRadius: '6px',
      background: this.theme.tooltipBg,
      border: `1px solid ${this.theme.tooltipBorder}`,
      color: this.theme.tooltipText,
      fontFamily: this.theme.fontFamily,
      fontSize: '12px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      maxWidth: '280px',
      minWidth: '160px',
      display: 'none',
    });
  }

  private buildHTML(): string {
    const task = this.geo.row.task;
    const labels = this.i18n.labels;
    const locale = this.i18n.locale;
    const fmt = this.i18n.formats.dateFormat;

    const start = formatDate(task.start, fmt, locale);
    const end = formatDate(task.end, fmt, locale);
    const dur = durationLabel(task.start, task.end, labels);
    const prog = task.progress ?? 0;

    return `
      <div style="font-weight:600;font-size:13px;margin-bottom:6px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${task.name}
      </div>
      <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:2px;">
        <span style="opacity:0.6">${labels.ttStart}</span><span>${start}</span>
      </div>
      <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:2px;">
        <span style="opacity:0.6">${labels.ttEnd}</span><span>${end}</span>
      </div>
      <div style="display:flex;justify-content:space-between;gap:12px;">
        <span style="opacity:0.6">${labels.ttDuration}</span><span>${dur}</span>
      </div>
      <div style="margin-top:6px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
          <span style="opacity:0.6">${labels.ttProgress}</span>
          <span>${prog}%</span>
        </div>
        <div style="height:3px;background:rgba(0,0,0,0.1);border-radius:2px;overflow:hidden;">
          <div style="height:100%;width:${prog}%;background:var(--gantt-bar,#3B82F6);border-radius:2px;"></div>
        </div>
      </div>
    `;
  }

  destroy(): void {
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    this.popover.remove();
  }
}
