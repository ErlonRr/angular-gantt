/**
 * @file gantt-tooltip.ts
 * Vanilla JS task tooltip — one shared Popover API element (Baseline 2024)
 * living in the component's shadow root, positioned next to the pointer.
 */

import {
  type GanttTask,
  type GanttTheme,
  TaskType,
  formatDate,
  taskDurationLabel,
  type ResolvedGanttConfig,
} from '@gantry/core';

type DateReading = Pick<ResolvedGanttConfig, 'endDateMode' | 'normalizeDateOnly'>;
import { type GanttI18nService } from '../services/gantt-i18n.service';

const SHOW_DELAY = 320;
const HIDE_DELAY = 120;
const OFFSET_X = 12;
const OFFSET_Y = 8;

export class GanttTooltip {
  /** How task dates are read (the duration matches the bar and the Duration column) */
  private dates: DateReading = { endDateMode: 'exclusive', normalizeDateOnly: true };
  private readonly popover: HTMLElement;
  private showTimer = 0;
  private hideTimer = 0;
  private lastX = 0;
  private lastY = 0;
  private task: GanttTask | null = null;
  private visible = false;

  private readonly i18n: GanttI18nService;

  constructor(root: ShadowRoot | HTMLElement, i18n: GanttI18nService) {
    this.i18n = i18n;
    this.popover = document.createElement('div');
    this.popover.setAttribute('popover', 'manual');
    this.popover.setAttribute('role', 'tooltip');
    this.popover.className = 'gantt-tooltip';
    root.appendChild(this.popover);
  }

  /** Pointer entered a bar (or moved to a different one). */
  enter(task: GanttTask, e: PointerEvent, theme: GanttTheme, dates?: DateReading): void {
    if (dates) this.dates = dates;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    clearTimeout(this.hideTimer);
    if (this.task?.id === task.id && this.visible) return;
    this.task = task;
    clearTimeout(this.showTimer);
    this.showTimer = window.setTimeout(() => this.show(theme), SHOW_DELAY);
  }

  move(e: PointerEvent): void {
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    if (this.visible) this.position();
  }

  leave(): void {
    clearTimeout(this.showTimer);
    this.hideTimer = window.setTimeout(() => this.hide(), HIDE_DELAY);
  }

  /** Hide immediately (e.g. when a drag starts). */
  hide(): void {
    clearTimeout(this.showTimer);
    this.visible = false;
    this.task = null;
    try {
      this.popover.hidePopover();
    } catch {
      /* not open / unsupported */
    }
    this.popover.style.display = 'none';
  }

  private show(theme: GanttTheme): void {
    if (!this.task) return;
    this.applyStyles(theme);
    this.popover.innerHTML = this.buildHTML(this.task);
    this.popover.style.display = 'block';
    try {
      this.popover.showPopover();
    } catch {
      /* unsupported — still shown via display */
    }
    this.visible = true;
    this.position();
  }

  private position(): void {
    const rect = this.popover.getBoundingClientRect();
    let left = this.lastX + OFFSET_X;
    let top = this.lastY + OFFSET_Y;
    if (left + rect.width > window.innerWidth - 8) left = this.lastX - rect.width - OFFSET_X;
    if (top + rect.height > window.innerHeight - 8) top = this.lastY - rect.height - OFFSET_Y;
    this.popover.style.left = `${Math.max(8, left)}px`;
    this.popover.style.top = `${Math.max(8, top)}px`;
  }

  private applyStyles(theme: GanttTheme): void {
    Object.assign(this.popover.style, {
      position: 'fixed',
      inset: 'auto',
      margin: '0',
      zIndex: '9999',
      pointerEvents: 'none',
      padding: '8px 12px',
      borderRadius: '6px',
      background: theme.tooltipBg,
      border: `1px solid ${theme.tooltipBorder}`,
      color: theme.tooltipText,
      fontFamily: theme.fontFamily,
      fontSize: '12px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      maxWidth: '280px',
      minWidth: '160px',
    });
  }

  private buildHTML(task: GanttTask): string {
    const labels = this.i18n.labels;
    const locale = this.i18n.locale;
    const fmt = this.i18n.formats.dateFormat;
    const end = task.end ?? task.start;
    const prog = Math.min(Math.max(task.progress ?? 0, 0), 100);
    const row = (label: string, value: string) => `
      <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:2px;">
        <span style="opacity:0.6">${esc(label)}</span><span>${esc(value)}</span>
      </div>`;

    const isMilestone = task.type === TaskType.Milestone;
    return `
      <div style="font-weight:600;font-size:13px;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${esc(task.name)}
      </div>
      ${
        isMilestone
          ? row(labels.ttMilestone, formatDate(task.start, fmt, locale))
          : row(labels.ttStart, formatDate(task.start, fmt, locale)) +
            row(labels.ttEnd, formatDate(end, fmt, locale)) +
            row(labels.ttDuration, taskDurationLabel(task, this.dates, labels)) +
            `<div style="margin-top:6px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                <span style="opacity:0.6">${esc(labels.ttProgress)}</span><span>${prog}%</span>
              </div>
              <div style="height:3px;background:rgba(127,127,127,0.25);border-radius:2px;overflow:hidden;">
                <div style="height:100%;width:${prog}%;background:var(--gantt-bar,#2563EB);border-radius:2px;"></div>
              </div>
            </div>`
      }
    `;
  }

  destroy(): void {
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    this.popover.remove();
  }
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ESCAPES[c] ?? c);
}
