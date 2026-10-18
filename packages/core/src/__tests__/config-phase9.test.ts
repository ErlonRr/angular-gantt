// ─────────────────────────────────────────────────────────────
//  Tests — Phase 9 contract: the new options and their resolved
//  defaults, the new and changed labels, the focus-ring theme token
//  and the milestone colour.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  CONTRAST_CSS_VARS,
  DEFAULT_ANNOUNCE_LABELS,
  DEFAULT_LABELS,
  DarkTheme,
  LegacyDarkTheme,
  LegacyLightTheme,
  LightTheme,
  THEME_CSS_VARS,
  TOOLTIP_HIDE_DELAY,
  TOOLTIP_SHOW_DELAY,
  contrastRatio,
  readableOn,
  resolveConfig,
  resolvePaint,
  resolveTheme,
  themeToCss,
  themeVar,
  type GanttFlatRow,
  type GanttOptions,
  type GanttTooltipRenderContext,
  type RetryEvent,
  type ResolvedToolbar,
  type TooltipModel,
} from '../index';

describe('resolveConfig: Phase 9 defaults', () => {
  const cfg = resolveConfig();

  it('keeps the character shortcuts on', () => {
    expect(cfg.keyboard).toEqual({ characterShortcuts: true });
  });

  it('tooltip: auto trigger, the shared delays, no custom render', () => {
    expect(cfg.tooltip).toEqual({ trigger: 'auto', showDelay: 320, hideDelay: 120, render: undefined });
  });

  it('tooltip delays equal TOOLTIP_SHOW_DELAY / TOOLTIP_HIDE_DELAY', () => {
    expect(cfg.tooltip.showDelay).toBe(TOOLTIP_SHOW_DELAY);
    expect(cfg.tooltip.hideDelay).toBe(TOOLTIP_HIDE_DELAY);
  });

  it('legend at the bottom, marker lane automatic', () => {
    expect(cfg.legend).toEqual({ position: 'bottom' });
    expect(cfg.markers).toEqual({ lane: 'auto' });
  });

  it('resize handle targets are 24 px', () => {
    expect(cfg.bar.handles).toEqual({ hitSize: 24 });
  });

  it('the toolbar shows the fit button', () => {
    expect(cfg.toolbar).toMatchObject({ fit: true });
    expect(resolveConfig({ toolbar: {} }).toolbar).toMatchObject({ fit: true });
    expect(resolveConfig({ toolbar: false }).toolbar).toBe(false);
  });

  it('explicit undefined keeps the defaults', () => {
    const c = resolveConfig({
      keyboard: { characterShortcuts: undefined },
      tooltip: { trigger: undefined, showDelay: undefined, hideDelay: undefined, render: undefined },
      legend: { position: undefined },
      markers: { lane: undefined },
      bar: { handles: { hitSize: undefined } },
      toolbar: { fit: undefined },
    });
    expect(c.keyboard).toEqual(cfg.keyboard);
    expect(c.tooltip).toEqual(cfg.tooltip);
    expect(c.legend).toEqual(cfg.legend);
    expect(c.markers).toEqual(cfg.markers);
    expect(c.bar.handles).toEqual(cfg.bar.handles);
    expect(c.toolbar).toEqual(cfg.toolbar);
  });
});

describe('resolveConfig: Phase 9 options', () => {
  it('passes every option through', () => {
    const render = (ctx: GanttTooltipRenderContext) => ctx.task.name;
    const c = resolveConfig({
      keyboard: { characterShortcuts: false },
      tooltip: { trigger: 'focus', showDelay: 0, hideDelay: 500, render },
      legend: { position: 'toolbar' },
      markers: { lane: true },
      bar: { handles: { hitSize: 32 } },
      toolbar: { fit: false },
    });
    expect(c.keyboard.characterShortcuts).toBe(false);
    expect(c.tooltip).toEqual({ trigger: 'focus', showDelay: 0, hideDelay: 500, render });
    expect(c.tooltip.render).toBe(render);
    expect(c.legend.position).toBe('toolbar');
    expect(c.markers.lane).toBe(true);
    expect(c.bar.handles.hitSize).toBe(32);
    expect((c.toolbar as ResolvedToolbar).fit).toBe(false);
  });

  it('accepts every trigger and lane value', () => {
    for (const trigger of ['auto', 'hover', 'focus'] as const) {
      expect(resolveConfig({ tooltip: { trigger } }).tooltip.trigger).toBe(trigger);
    }
    for (const lane of ['auto', true, false] as const) {
      expect(resolveConfig({ markers: { lane } }).markers.lane).toBe(lane);
    }
  });

  it('a bar option without handles keeps the handle default', () => {
    expect(resolveConfig({ bar: { height: 20 } }).bar.handles.hitSize).toBe(24);
  });

  it('the new option types are part of GanttOptions', () => {
    expectTypeOf<NonNullable<GanttOptions['tooltip']>['trigger']>().toEqualTypeOf<
      'auto' | 'hover' | 'focus' | undefined
    >();
    expectTypeOf<NonNullable<GanttOptions['legend']>['position']>().toEqualTypeOf<'bottom' | 'toolbar' | undefined>();
    expectTypeOf<NonNullable<GanttOptions['markers']>['lane']>().toEqualTypeOf<'auto' | boolean | undefined>();
    expectTypeOf<GanttTooltipRenderContext>().toEqualTypeOf<{
      model: TooltipModel;
      task: GanttTooltipRenderContext['task'];
      row: GanttFlatRow;
    }>();
    expectTypeOf<RetryEvent>().toEqualTypeOf<{ source: 'error' | 'dataSource' }>();
    expectTypeOf<GanttFlatRow['posInSet']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<GanttFlatRow['setSize']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<GanttFlatRow['parentIndex']>().toEqualTypeOf<number | undefined>();
  });
});

describe('labels: Phase 9', () => {
  it('adds the new labels', () => {
    expect(DEFAULT_LABELS).toMatchObject({
      ariaBars: 'Task bars',
      ariaTask: 'task bar',
      ariaMilestone: 'milestone',
      ariaGroup: 'summary bar',
      ariaBarRole: 'bar',
      ariaZoomLevels: 'Zoom level',
      ariaViews: 'View',
      fitToScreen: 'Fit to screen',
      emptyState: 'No tasks to show',
      errorTitle: 'Couldn’t show the chart',
    });
    expect(DEFAULT_LABELS.dragReadout('3 Mar – 14 Mar', '9 days')).toBe('3 Mar – 14 Mar · 9 days');
  });

  it('names the view toggle by what it shows', () => {
    expect(DEFAULT_LABELS.viewSplit).toBe('Table and chart');
    expect(DEFAULT_LABELS.viewTable).toBe('Table only');
    expect(DEFAULT_LABELS.viewChart).toBe('Chart only');
  });

  it('the edit-mode help no longer offers Up / Down for progress (Phase 11)', () => {
    const text =
      'Editing Backend. Arrow keys move, Shift+Arrow resizes the end, Alt+Arrow resizes the start, ' +
      'Enter saves, Escape cancels.';
    expect(DEFAULT_LABELS.announceEditStart('Backend')).toBe(text);
    expect(DEFAULT_ANNOUNCE_LABELS.announceEditStart('Backend')).toBe(text);
    expect(text).not.toMatch(/Up|Down|progress/);
  });
});

describe('theme: focus ring and milestone colour', () => {
  it('focusRing is the last theme token, --gantt-focus-ring', () => {
    expect(THEME_CSS_VARS).toHaveLength(39);
    expect(THEME_CSS_VARS.at(-1)).toEqual(['focusRing', '--gantt-focus-ring']);
    expect(themeVar('focusRing')).toBe('var(--gantt-focus-ring)');
  });

  it('defaults to the selection border of each palette, so nothing changes visibly', () => {
    expect(LightTheme.focusRing).toBe('#2563EB');
    expect(DarkTheme.focusRing).toBe('#60A5FA');
    for (const theme of [LightTheme, DarkTheme, LegacyLightTheme, LegacyDarkTheme]) {
      expect(theme.focusRing).toBe(theme.selectionBorder);
      expect(new Map(themeToCss(theme)).get('--gantt-focus-ring')).toBe(theme.focusRing);
      expect(resolvePaint(themeVar('focusRing'), theme)).toBe(theme.focusRing);
    }
  });

  it('an undefined override falls back to the palette', () => {
    expect(resolveTheme(false, { focusRing: undefined }).focusRing).toBe('#2563EB');
    expect(resolveTheme(true, { focusRing: '#FF00FF' }).focusRing).toBe('#FF00FF');
  });

  it('focus rings reach 3:1 against the chart background (WCAG 1.4.11)', () => {
    for (const theme of [LightTheme, DarkTheme]) {
      expect(contrastRatio(theme.focusRing, theme.backgroundColor) ?? 0).toBeGreaterThanOrEqual(3);
    }
  });

  it('the light milestone is #7C3AED: white labels reach 4.5:1', () => {
    expect(LightTheme.milestoneColor).toBe('#7C3AED');
    expect(contrastRatio('#7C3AED', '#FFFFFF') ?? 0).toBeGreaterThanOrEqual(4.5);
    expect(readableOn('#7C3AED', '#FFFFFF')).toBe('#FFFFFF');
    expect(new Map(themeToCss(LightTheme)).get(CONTRAST_CSS_VARS.milestone)).toBe('#FFFFFF');
  });

  it('the legacy light palette keeps #8B5CF6; the dark milestone is unchanged', () => {
    expect(LegacyLightTheme.milestoneColor).toBe('#8B5CF6');
    expect(DarkTheme.milestoneColor).toBe('#A78BFA');
    expect(LegacyDarkTheme.milestoneColor).toBe('#A78BFA');
  });
});
