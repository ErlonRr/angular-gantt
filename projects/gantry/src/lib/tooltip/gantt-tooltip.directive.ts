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

import {
  Directive,
  ElementRef,
  inject,
  input,
  OnDestroy,
  OnInit,
  DOCUMENT,
} from '@angular/core';

import { RowGeometry, GanttTheme } from '../types';
import { formatDate, durationLabel }              from '../gantt-math';

// ─── Tooltip directive ────────────────────────────────────────

/** Delay (ms) before showing the tooltip — avoids flicker on fast mouse moves */
const SHOW_DELAY = 320;
/** Delay (ms) before hiding — allows moving pointer into tooltip */
const HIDE_DELAY = 120;
/** Offset from pointer position */
const OFFSET_X   = 12;
const OFFSET_Y   = 8;

@Directive({
  selector:  '[ganttTooltip]',
  standalone: true,
  host: {
    '(pointerenter)': 'onEnter($event)',
    '(pointerleave)': 'onLeave()',
    '(pointermove)':  'onMove($event)',
    '(pointerdown)':  'onLeave()',   // hide on click start
  },
})
export class GanttTooltipDirective implements OnInit, OnDestroy {

  readonly ganttTooltip = input.required<RowGeometry>();
  readonly tooltipTheme = input<GanttTheme | null>(null);
  readonly tooltipEnabled = input<boolean>(true);

  private readonly doc  = inject(DOCUMENT);
  private readonly el   = inject(ElementRef);

  private _popover: HTMLElement | null = null;
  private _showTimer = 0;
  private _hideTimer = 0;
  private _lastX     = 0;
  private _lastY     = 0;

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
    pop.className = 'gantt-tooltip-popover';

    const theme = this.tooltipTheme();
    this._applyPopoverStyles(pop, theme);

    // Render tooltip content as HTML (lightweight, no Angular component)
    pop.innerHTML = this._buildHTML();

    this.doc.body.appendChild(pop);
    this._popover = pop;
  }

  private _show(): void {
    const pop = this._popover;
    if (!pop) return;

    // Update content in case task changed
    pop.innerHTML = this._buildHTML();

    try {
      pop.showPopover();
    } catch {
      // Popover API not supported — fallback to display:block
      pop.style.display = 'block';
    }

    this._position(this._lastX, this._lastY);
  }

  private _hide(): void {
    const pop = this._popover;
    if (!pop) return;
    try {
      pop.hidePopover();
    } catch {
      pop.style.display = 'none';
    }
  }

  private _position(clientX: number, clientY: number): void {
    const pop  = this._popover;
    if (!pop)  return;

    const vw   = window.innerWidth;
    const vh   = window.innerHeight;
    const rect = pop.getBoundingClientRect();

    let left = clientX + OFFSET_X;
    let top  = clientY + OFFSET_Y;

    // Flip horizontally if tooltip overflows right edge
    if (left + rect.width > vw - 8) {
      left = clientX - rect.width - OFFSET_X;
    }
    // Flip vertically if tooltip overflows bottom edge
    if (top + rect.height > vh - 8) {
      top = clientY - rect.height - OFFSET_Y;
    }

    pop.style.left = `${Math.max(8, left)}px`;
    pop.style.top  = `${Math.max(8, top)}px`;
  }

  private _applyPopoverStyles(pop: HTMLElement, theme: GanttTheme | null): void {
    const bg  = theme?.tooltipBg     ?? '#FFFFFF';
    const bdr = theme?.tooltipBorder ?? '#E2E8F0';
    const txt = theme?.tooltipText   ?? '#1E293B';

    Object.assign(pop.style, {
      position:     'fixed',
      zIndex:       '9999',
      pointerEvents: 'none',
      padding:      '8px 12px',
      borderRadius: '6px',
      background:   bg,
      border:       `1px solid ${bdr}`,
      color:        txt,
      fontFamily:   theme?.fontFamily ?? 'system-ui, sans-serif',
      fontSize:     '12px',
      boxShadow:    '0 4px 16px rgba(0,0,0,0.12)',
      maxWidth:     '280px',
      minWidth:     '160px',
      // CSS animation — no @angular/animations
      transition:   'opacity 0.12s ease',
      display:      'none',   // overridden by popover API
    });
  }

  // ── HTML builder ─────────────────────────────────────────

  private _buildHTML(): string {
    const task  = this.ganttTooltip().row.task;
    const start = formatDate(task.start);
    const end   = formatDate(task.end);
    const dur   = durationLabel(task.start, task.end);
    const prog  = task.progress ?? 0;

    const progressBar = task.progress != null ? `
      <div style="margin-top:6px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
          <span style="opacity:0.6">Progress</span>
          <span>${prog}%</span>
        </div>
        <div style="height:3px;background:rgba(0,0,0,0.1);border-radius:2px;overflow:hidden;">
          <div style="height:100%;width:${prog}%;background:var(--gantt-bar,#3B82F6);border-radius:2px;"></div>
        </div>
      </div>` : '';

    const milestone = task.type === 'milestone'
      ? `<div style="margin-top:4px;font-size:11px;opacity:0.7;">◆ Milestone</div>`
      : '';

    return `
      <div style="font-weight:600;font-size:13px;margin-bottom:6px;
                  max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${this._esc(task.name)}
      </div>
      <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:2px;">
        <span style="opacity:0.6">Start</span><span>${start}</span>
      </div>
      <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:2px;">
        <span style="opacity:0.6">End</span><span>${end}</span>
      </div>
      <div style="display:flex;justify-content:space-between;gap:12px;">
        <span style="opacity:0.6">Duration</span><span>${dur}</span>
      </div>
      ${progressBar}
      ${milestone}
    `;
  }

  private _esc(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
