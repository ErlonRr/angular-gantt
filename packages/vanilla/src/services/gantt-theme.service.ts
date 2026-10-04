/**
 * @file gantt-theme.service.ts
 * Vanilla JS Theme service injecting dynamic CSS custom properties.
 */

import { GanttTheme } from '@gantry/core';
import { createState, WritableState } from '../core/state';

export const LightTheme: Readonly<GanttTheme> = {
  backgroundColor:  '#FFFFFF',
  headerBackground: '#F8FAFC',
  rowBg:            '#FFFFFF',
  rowBgAlt:         '#F8FAFC',
  barColor:         '#3B82F6',
  barTextColor:     '#FFFFFF',
  barRadius:        '4px',
  milestoneColor:   '#8B5CF6',
  baselineColor:    '#94A3B8',
  criticalColor:    '#EF4444',
  panelBg:          '#FFFFFF',
  panelBorder:      '#E2E8F0',
  borderColor:      '#E2E8F0',
  gridLine:         '#F1F5F9',
  todayColor:       '#F59E0B',
  textPrimary:      '#1E293B',
  textSecondary:    '#475569',
  textMuted:        '#94A3B8',
  fontFamily:       'system-ui, -apple-system, sans-serif',
  fontSize:         '13px',
  arrowColor:       '#3B82F6',
  tooltipBg:        '#FFFFFF',
  tooltipBorder:    '#E2E8F0',
  tooltipText:      '#1E293B',
  selectionBg:      '#EFF6FF',
  selectionBorder:  '#3B82F6',
  scrollbarTrack:   '#F1F5F9',
  scrollbarThumb:   '#CBD5E1',
};

export const DarkTheme: Readonly<GanttTheme> = {
  backgroundColor:  '#0F172A',
  headerBackground: '#1E293B',
  rowBg:            '#0F172A',
  rowBgAlt:         '#111827',
  barColor:         '#3B82F6',
  barTextColor:     '#FFFFFF',
  barRadius:        '4px',
  milestoneColor:   '#A78BFA',
  baselineColor:    '#334155',
  criticalColor:    '#F87171',
  panelBg:          '#0F172A',
  panelBorder:      '#1E293B',
  borderColor:      '#1E293B',
  gridLine:         '#1A2744',
  todayColor:       '#FBBF24',
  textPrimary:      '#F1F5F9',
  textSecondary:    '#94A3B8',
  textMuted:        '#475569',
  fontFamily:       'system-ui, -apple-system, sans-serif',
  fontSize:         '13px',
  arrowColor:       '#60A5FA',
  tooltipBg:        '#1E293B',
  tooltipBorder:    '#334155',
  tooltipText:      '#F1F5F9',
  selectionBg:      '#1D3461',
  selectionBorder:  '#60A5FA',
  scrollbarTrack:   '#1E293B',
  scrollbarThumb:   '#334155',
};

const VAR_MAP: Array<[keyof GanttTheme, string]> = [
  ['backgroundColor',  '--gantt-bg'],
  ['headerBackground', '--gantt-header-bg'],
  ['rowBg',            '--gantt-row-bg'],
  ['rowBgAlt',         '--gantt-row-bg-alt'],
  ['barColor',         '--gantt-bar'],
  ['barTextColor',     '--gantt-bar-text'],
  ['barRadius',        '--gantt-bar-radius'],
  ['milestoneColor',   '--gantt-milestone'],
  ['baselineColor',    '--gantt-baseline'],
  ['criticalColor',    '--gantt-critical'],
  ['panelBg',          '--gantt-panel-bg'],
  ['panelBorder',      '--gantt-panel-border'],
  ['borderColor',      '--gantt-border'],
  ['gridLine',         '--gantt-grid-line'],
  ['todayColor',       '--gantt-today'],
  ['textPrimary',      '--gantt-text'],
  ['textSecondary',    '--gantt-text-sec'],
  ['textMuted',        '--gantt-text-muted'],
  ['fontFamily',       '--gantt-font'],
  ['fontSize',         '--gantt-font-size'],
  ['arrowColor',       '--gantt-arrow'],
  ['tooltipBg',        '--gantt-tooltip-bg'],
  ['tooltipBorder',    '--gantt-tooltip-bdr'],
  ['tooltipText',      '--gantt-tooltip-txt'],
  ['selectionBg',      '--gantt-sel-bg'],
  ['selectionBorder',  '--gantt-sel-border'],
  ['scrollbarTrack',   '--gantt-scrollbar-track'],
  ['scrollbarThumb',   '--gantt-scrollbar-thumb'],
];

export class GanttThemeService {
  private readonly _darkMode = createState<boolean | 'auto'>(false);
  private readonly _prefersDark = createState<boolean>(false);
  private readonly _customOverride = createState<Partial<GanttTheme>>({});
  
  private _hostEl?: HTMLElement;
  private _mql?: MediaQueryList;
  private _mqlCb?: (e: MediaQueryListEvent) => void;
  private _unsubscribeState?: () => void;

  /**
   * Returns current active theme object.
   */
  get resolvedTheme(): GanttTheme {
    const mode = this._darkMode();
    const isDark = mode === 'auto' ? this._prefersDark() : mode === true;
    return { ...(isDark ? DarkTheme : LightTheme), ...this._customOverride() };
  }

  /**
   * Returns boolean indicating dark mode state.
   */
  get isDark(): boolean {
    const mode = this._darkMode();
    return mode === 'auto' ? this._prefersDark() : mode === true;
  }

  /**
   * Bind theme service to host DOM element.
   */
  init(hostEl: HTMLElement, initialDarkMode: boolean | 'auto' = false): void {
    this._hostEl = hostEl;
    this.setDarkMode(initialDarkMode);

    const update = () => {
      if (this._hostEl) {
        this.applyThemeToDom(this._hostEl, this.resolvedTheme);
        this._hostEl.dataset['theme'] = this.isDark ? 'dark' : 'light';
      }
    };

    const unsub1 = this._darkMode.subscribe(update);
    const unsub2 = this._prefersDark.subscribe(update);
    const unsub3 = this._customOverride.subscribe(update);

    this._unsubscribeState = () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }

  setDarkMode(mode: boolean | 'auto'): void {
    this._darkMode.set(mode);
    if (mode === 'auto') {
      this._setupMQL();
    } else {
      this._teardownMQL();
    }
  }

  patchTheme(patch: Partial<GanttTheme>): void {
    this._customOverride.update(cur => ({ ...cur, ...patch }));
  }

  resetTheme(): void {
    this._customOverride.set({});
  }

  private applyThemeToDom(el: HTMLElement, theme: GanttTheme): void {
    for (const [key, cssVar] of VAR_MAP) {
      const val = theme[key];
      if (val != null) el.style.setProperty(cssVar, String(val));
    }
  }

  private _setupMQL(): void {
    if (typeof window === 'undefined' || this._mql) return;
    this._mql = window.matchMedia('(prefers-color-scheme: dark)');
    this._prefersDark.set(this._mql.matches);
    this._mqlCb = e => this._prefersDark.set(e.matches);
    this._mql.addEventListener('change', this._mqlCb);
  }

  private _teardownMQL(): void {
    if (!this._mql || !this._mqlCb) return;
    this._mql.removeEventListener('change', this._mqlCb);
    this._mql = undefined;
    this._mqlCb = undefined;
  }

  destroy(): void {
    this._teardownMQL();
    if (this._unsubscribeState) this._unsubscribeState();
  }
}
