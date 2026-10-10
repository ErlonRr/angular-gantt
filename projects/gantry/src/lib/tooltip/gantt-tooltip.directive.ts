// ─────────────────────────────────────────────────────────────
//  gantry · tooltip/gantt-tooltip.directive.ts
//
//  Tooltip using the native Popover API (Baseline 2024).
//  Supported: Chrome 114+, Firefox 125+, Safari 17+.
//  No CDK Overlay, no z-index fighting, no portal.
//
//  The popover element is created once per directive instance,
//  appended to the shadow root / document body, and shown/hidden
//  via el.showPopover() / el.hidePopover().
//
//  Positioning uses CSS anchor positioning where supported,
//  with a JS fallback (getBoundingClientRect) for others.
//
//  Applied on the bar <g> element — works on SVG elements too
//  because we use clientX/Y from the pointer event.
//
//  Usage (applied automatically by GanttCanvasComponent):
//    <g ganttTaskBar [ganttTooltip]="geo" [tooltipTheme]="theme" />
// ─────────────────────────────────────────────────────────────

import { Directive, ElementRef, inject, input, type OnDestroy, type OnInit, DOCUMENT } from '@angular/core';

import { type RowGeometry, type GanttTask, type GanttTheme } from '../types';
import { buildTooltipModel, resolveTheme, type ResolvedGanttConfig, type TooltipModel } from '@gantry/core';
import { GanttI18nService } from '../services/gantt-i18n.service';

/** What the tooltip reads besides the row: the clock, the critical path, float and the task index. */
export interface GanttTooltipContext {
  /** Clock for the status (the timeline's `now`); default: when the tooltip opens */
  now?: Date | undefined;
  /** Critical task ids — adds the critical-path row */
  criticalIds?: ReadonlySet<string> | undefined;
  /** Total float per task id in days (CPM `floatMap`) — adds the float row */
  floatDays?: ReadonlyMap<string, number> | undefined;
  /** Every task by id — names predecessors and finds successors */
  tasksById?: ReadonlyMap<string, GanttTask> | undefined;
}

/** Colours when no `tooltipTheme` is bound */
const FALLBACK_THEME = resolveTheme(false);

// ─── Tooltip directive ────────────────────────────────────────

/** Delay (ms) before showing the tooltip — avoids flicker on fast mouse moves */
const SHOW_DELAY = 320;
/** Delay (ms) before hiding — allows moving pointer into tooltip */
const HIDE_DELAY = 120;
/** Offset from pointer position */
const OFFSET_X = 12;
const OFFSET_Y = 8;

@Directive({
  selector: '[ganttTooltip]',
  standalone: true,
  host: {
    '(pointerenter)': 'onEnter($event)',
    '(pointerleave)': 'onLeave()',
    '(pointermove)': 'onMove($event)',
    '(pointerdown)': 'onLeave()', // hide on click start
  },
})
export class GanttTooltipDirective implements OnInit, OnDestroy {
  readonly ganttTooltip = input.required<RowGeometry>();
  readonly tooltipTheme = input<GanttTheme | null>(null);
  readonly tooltipEnabled = input<boolean>(true);
  /**
   * How task dates are read, so the duration matches the bar and the Duration column, and
   * whether baseline rows are shown (`baseline`, like the bars; default off)
   */
  readonly tooltipDates = input<
    Pick<ResolvedGanttConfig, 'endDateMode' | 'normalizeDateOnly'> & { baseline?: boolean | undefined }
  >({
    endDateMode: 'exclusive',
    normalizeDateOnly: true,
  });
  /** Critical path, float and task index for the extra rows */
  readonly tooltipContext = input<GanttTooltipContext>({});

  private readonly doc = inject(DOCUMENT);
  private readonly el = inject(ElementRef);
  private readonly i18n = inject(GanttI18nService);

  private _popover: HTMLElement | null = null;
  private _showTimer = 0;
  private _hideTimer = 0;
  private _lastX = 0;
  private _lastY = 0;

  ngOnInit(): void {
    this._createPopover();
  }

  ngOnDestroy(): void {
    clearTimeout(this._showTimer);
    clearTimeout(this._hideTimer);
    this._popover?.remove();
    this._popover = null;
  }

  // ── Pointer handlers ──────────────────────────────────────

  onEnter(event: PointerEvent): void {
    if (!this.tooltipEnabled()) return;
    this._lastX = event.clientX;
    this._lastY = event.clientY;
    clearTimeout(this._hideTimer);
    this._showTimer = window.setTimeout(() => this._show(), SHOW_DELAY);
  }

  onLeave(): void {
    clearTimeout(this._showTimer);
    this._hideTimer = window.setTimeout(() => this._hide(), HIDE_DELAY);
  }

  onMove(event: PointerEvent): void {
    this._lastX = event.clientX;
    this._lastY = event.clientY;
    if (this._popover?.matches(':popover-open')) {
      this._position(event.clientX, event.clientY);
    }
  }

  // ── Popover lifecycle ─────────────────────────────────────

  private _createPopover(): void {
    const pop = this.doc.createElement('div');
    pop.setAttribute('popover', 'manual');
    pop.className = 'gantt-tooltip gantt-tooltip-popover';
    pop.setAttribute('role', 'tooltip');

    // Content and colours are rendered as HTML when shown (lightweight, no Angular component)
    pop.style.display = 'none';

    this.doc.body.appendChild(pop);
    this._popover = pop;
  }

  private _show(): void {
    const pop = this._popover;
    if (!pop) return;

    // Update content and colours in case the task or theme changed
    const model = this._model();
    this._applyPopoverStyles(pop, model);
    pop.innerHTML = this._buildHTML(model);
    // Colours go through the CSSOM, never into markup (a task colour can't inject CSS)
    const fill = pop.querySelector<HTMLElement>('.gantt-tooltip-fill');
    if (fill) fill.style.background = this._progressFill(model);

    // An inline `display: none` would hide an open popover too: show it explicitly first
    pop.style.display = 'block';
    try {
      pop.showPopover();
    } catch {
      /* Popover API not supported — still shown via display */
    }

    this._position(this._lastX, this._lastY);
  }

  private _hide(): void {
    const pop = this._popover;
    if (!pop) return;
    try {
      pop.hidePopover();
    } catch {
      /* not open / unsupported */
    }
    pop.style.display = 'none';
  }

  private _position(clientX: number, clientY: number): void {
    const pop = this._popover;
    if (!pop) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = pop.getBoundingClientRect();

    let left = clientX + OFFSET_X;
    let top = clientY + OFFSET_Y;

    // Flip horizontally if tooltip overflows right edge
    if (left + rect.width > vw - 8) {
      left = clientX - rect.width - OFFSET_X;
    }
    // Flip vertically if tooltip overflows bottom edge
    if (top + rect.height > vh - 8) {
      top = clientY - rect.height - OFFSET_Y;
    }

    pop.style.left = `${Math.max(8, left)}px`;
    pop.style.top = `${Math.max(8, top)}px`;
  }

  private _applyPopoverStyles(pop: HTMLElement, m: TooltipModel): void {
    Object.assign(pop.style, {
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
      // CSS animation — no @angular/animations
      transition: 'opacity 0.12s ease',
    });
  }

  // ── HTML builder ─────────────────────────────────────────

  /** Tooltip content from the shared @gantry/core model (same rows as the Web Component). */
  private _model(): TooltipModel {
    const { row } = this.ganttTooltip();
    const dates = this.tooltipDates();
    const ctx = this.tooltipContext();
    return buildTooltipModel({
      task: row.task,
      hasChildren: row.hasChildren,
      barType: row.barType,
      config: {
        endDateMode: dates.endDateMode,
        normalizeDateOnly: dates.normalizeDateOnly,
        baseline: dates.baseline ?? false,
        theme: this.tooltipTheme() ?? FALLBACK_THEME,
      },
      labels: this.i18n.labels(),
      locale: this.i18n.locale(),
      dateFormat: this.i18n.formats().dateFormat,
      now: ctx.now ?? new Date(),
      criticalIds: ctx.criticalIds,
      floatDays: ctx.floatDays,
      tasksById: ctx.tasksById,
    });
  }

  /** Progress fill: keeps `--gantt-*` CSS-variable theming for the default colours; an explicit bar colour wins. */
  private _progressFill(m: TooltipModel): string {
    if (m.critical) return `var(--gantt-critical, ${m.colors.progress})`;
    return this.ganttTooltip().row.task.barColor ? m.colors.progress : `var(--gantt-bar, ${m.colors.progress})`;
  }

  private _buildHTML(m: TooltipModel): string {
    const esc = (v: string) => this._esc(v);
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
      <div style="font-weight:600;font-size:13px;margin-bottom:6px;
                  max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${esc(m.title)}
      </div>
      ${m.rows.map(r => (r.kind === 'progress' ? progress(r.label, r.value) : row(r.label, r.value))).join('')}
    `;
  }

  private _esc(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
