/**
 * @file gantt-tooltip.ts
 * Vanilla JS task tooltip — one shared Popover API element (Baseline 2024)
 * living in the component's shadow root, positioned next to the pointer.
 */

import {
  type GanttFlatRow,
  type GanttTask,
  type TooltipInput,
  type TooltipModel,
  buildTooltipModel,
} from '@gantry/core';
import { type GanttI18nService } from '../services/gantt-i18n.service';

/** What the tooltip reads besides the row: the chart's state when the pointer entered the bar. */
export interface GanttTooltipContext {
  /** Resolved config: date reading, `baseline` flag and theme */
  config: TooltipInput['config'];
  /** Clock for the status (the timeline's `now`) */
  now: Date;
  /** Critical task ids (critical-path option on) */
  criticalIds?: ReadonlySet<string> | undefined;
  /** CPM total float per task id, in days */
  floatDays?: ReadonlyMap<string, number> | undefined;
  /** Every task by id: predecessor names and successors */
  tasksById?: ReadonlyMap<string, GanttTask> | undefined;
}

const SHOW_DELAY = 320;
const HIDE_DELAY = 120;
const OFFSET_X = 12;
const OFFSET_Y = 8;

export class GanttTooltip {
  private readonly popover: HTMLElement;
  private showTimer = 0;
  private hideTimer = 0;
  private lastX = 0;
  private lastY = 0;
  private row: GanttFlatRow | null = null;
  private ctx: GanttTooltipContext | null = null;
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
  enter(row: GanttFlatRow, e: PointerEvent, ctx: GanttTooltipContext): void {
    this.ctx = ctx;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    clearTimeout(this.hideTimer);
    if (this.row?.task.id === row.task.id && this.visible) return;
    this.row = row;
    clearTimeout(this.showTimer);
    this.showTimer = window.setTimeout(() => this.show(), SHOW_DELAY);
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
    this.row = null;
    try {
      this.popover.hidePopover();
    } catch {
      /* not open / unsupported */
    }
    this.popover.style.display = 'none';
  }

  private show(): void {
    if (!this.row || !this.ctx) return;
    const m = this.model(this.row, this.ctx);
    this.applyStyles(m);
    this.popover.innerHTML = this.buildHTML(m);
    // Colours go through the CSSOM, never into markup (a task colour can't inject CSS)
    const fill = this.popover.querySelector<HTMLElement>('.gantt-tooltip-fill');
    if (fill) fill.style.background = progressFill(m, this.row.task);
    this.popover.style.display = 'block';
    try {
      this.popover.showPopover();
    } catch {
      /* unsupported — still shown via display */
    }
    this.visible = true;
    this.position();
  }

  private model(row: GanttFlatRow, ctx: GanttTooltipContext): TooltipModel {
    return buildTooltipModel({
      task: row.task,
      hasChildren: row.hasChildren,
      barType: row.barType,
      config: ctx.config,
      labels: this.i18n.labels,
      locale: this.i18n.locale,
      dateFormat: this.i18n.formats.dateFormat,
      now: ctx.now,
      criticalIds: ctx.criticalIds,
      floatDays: ctx.floatDays,
      tasksById: ctx.tasksById,
    });
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

  private applyStyles(m: TooltipModel): void {
    Object.assign(this.popover.style, {
      position: 'fixed',
      inset: 'auto',
      margin: '0',
      zIndex: '9999',
      pointerEvents: 'none',
      padding: '8px 12px',
      borderRadius: '6px',
      background: m.colors.background,
      border: `1px solid ${m.colors.border}`,
      color: m.colors.text,
      fontFamily: m.colors.fontFamily,
      fontSize: '12px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      maxWidth: '280px',
      minWidth: '160px',
    });
  }

  private buildHTML(m: TooltipModel): string {
    const row = (label: string, value: string) => `
      <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:2px;">
        <span style="opacity:0.6">${esc(label)}</span><span>${esc(value)}</span>
      </div>`;
    const progress = (label: string, value: string) => `
      <div style="margin-top:6px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
          <span style="opacity:0.6">${esc(label)}</span><span>${esc(value)}</span>
        </div>
        <div style="height:3px;background:rgba(127,127,127,0.25);border-radius:2px;overflow:hidden;">
          <div class="gantt-tooltip-fill" style="height:100%;width:${m.progress ?? 0}%;border-radius:2px;"></div>
        </div>
      </div>`;

    return `
      <div style="font-weight:600;font-size:13px;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${esc(m.title)}
      </div>
      ${m.rows.map(r => (r.kind === 'progress' ? progress(r.label, r.value) : row(r.label, r.value))).join('')}
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

/** Progress fill: keeps `--gantt-*` CSS-variable theming for the default colours; an explicit bar colour wins. */
function progressFill(m: TooltipModel, task: GanttTask): string {
  if (m.critical) return `var(--gantt-critical, ${m.colors.progress})`;
  return task.barColor ? m.colors.progress : `var(--gantt-bar, ${m.colors.progress})`;
}
