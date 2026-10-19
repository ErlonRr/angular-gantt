import { afterEach, describe, expect, it } from 'vitest';
import { ISO_WEEK, US_WEEK, resolveConfig } from '@gantryjs/core';
import { GANTRY_API } from '../api';
import {
  PLAYGROUND_DEFAULTS,
  PLAYGROUND_SECTIONS,
  changedKeys,
  decodeState,
  encodeState,
  playgroundCode,
  playgroundCommand,
  playgroundOptions,
  valueText,
  withValue,
  type PlaygroundKey,
  type PlaygroundState,
} from '../playground';
import { FRAMEWORKS, installCommand } from '../site';
import { getTheme, initTheme, onThemeChange, setTheme, toggleTheme } from '../theme';

const TODAY = new Date(2026, 9, 14);

describe('playground model', () => {
  it('has one control per state key', () => {
    const keys = PLAYGROUND_SECTIONS.flatMap(s => s.controls.map(c => c.key)).sort();
    expect(keys).toEqual(Object.keys(PLAYGROUND_DEFAULTS).sort());
  });

  it('round-trips the changed keys through a link', () => {
    let state = withValue({ ...PLAYGROUND_DEFAULTS }, 'viewMode', 'Day');
    state = withValue(state, 'rowHeight', 44);
    state = withValue(state, 'criticalPath', true);
    expect(changedKeys(state)).toEqual(['viewMode', 'rowHeight', 'criticalPath']);
    const text = encodeState(state);
    expect(text).toMatch(/^[\w-]+$/);
    expect(decodeState(text)).toEqual(state);
    expect(encodeState({ ...PLAYGROUND_DEFAULTS })).toBe('');
  });

  it('drops invalid or unknown values from a link', () => {
    const forged = btoa(JSON.stringify({ rowHeight: 999, viewMode: 'Decade', weekends: 'yes', nope: 1, radius: 8 }));
    expect(decodeState(forged)).toEqual({ ...PLAYGROUND_DEFAULTS, radius: 8 });
    expect(decodeState('%%%')).toEqual(PLAYGROUND_DEFAULTS);
    expect(decodeState(null)).toEqual(PLAYGROUND_DEFAULTS);
  });

  it('maps the state to options', () => {
    const o = playgroundOptions({ ...PLAYGROUND_DEFAULTS, initialScroll: 'none', stateKey: true }, TODAY);
    expect(o.initialScroll).toBe(false);
    expect(o.stateKey).toBe('playground');
    expect(o.nonWorkingTime).toMatchObject({ holidays: [{ start: new Date(2026, 9, 16), label: 'Holiday' }] });
    expect(playgroundOptions({ ...PLAYGROUND_DEFAULTS, viewMode: 'Month' }, TODAY).scales).toBeUndefined();
  });

  it('prints the same options for every framework', () => {
    for (const { id } of FRAMEWORKS) {
      const code = playgroundCode({ ...PLAYGROUND_DEFAULTS, criticalPath: true }, id, TODAY);
      expect(code, id).toContain("viewMode: 'Week'");
      expect(code, id).toContain('criticalPath: true');
      expect(code, id).toContain('WEEK_FORMATS.number');
      expect(code, id).toContain('new Date(2026, 9, 16)');
      expect(code, id).not.toContain('undefined');
    }
    expect(playgroundCode({ ...PLAYGROUND_DEFAULTS, viewMode: 'Day' }, 'react', TODAY)).not.toContain('WEEK_FORMATS');
    expect(playgroundCode(PLAYGROUND_DEFAULTS, 'angular', TODAY)).toContain('<gantry [series]="tasks()"');
  });
});

describe('playground: interaction & accessibility', () => {
  const SECTION = PLAYGROUND_SECTIONS.find(s => s.title === 'Interaction & accessibility');
  /** Every non-default value of the section at once. */
  const CHANGED: PlaygroundState = {
    ...PLAYGROUND_DEFAULTS,
    legendPosition: 'toolbar',
    tooltipTrigger: 'focus',
    tooltipShowDelay: 600,
    tooltipHideDelay: 300,
    characterShortcuts: false,
    handleHitSize: 32,
    markerLane: 'off',
    toolbarFit: false,
  };

  it('has a control for each new option', () => {
    expect(SECTION?.controls.map(c => c.option)).toEqual([
      'tooltip.trigger',
      'tooltip.showDelay',
      'tooltip.hideDelay',
      'keyboard.characterShortcuts',
      'formats.readoutFormat',
      'bar.handles.hitSize',
      'markers.lane',
      'legend.position',
      'toolbar.fit',
    ]);
  });

  it('starts from the core defaults and leaves them to core', () => {
    const core = resolveConfig({});
    const toolbar = core.toolbar === false ? null : core.toolbar;
    expect(PLAYGROUND_DEFAULTS.legendPosition).toBe(core.legend.position);
    expect(PLAYGROUND_DEFAULTS.tooltipTrigger).toBe(core.tooltip.trigger);
    expect(PLAYGROUND_DEFAULTS.tooltipShowDelay).toBe(core.tooltip.showDelay);
    expect(PLAYGROUND_DEFAULTS.tooltipHideDelay).toBe(core.tooltip.hideDelay);
    expect(PLAYGROUND_DEFAULTS.characterShortcuts).toBe(core.keyboard.characterShortcuts);
    expect(PLAYGROUND_DEFAULTS.handleHitSize).toBe(core.bar.handles.hitSize);
    expect(PLAYGROUND_DEFAULTS.markerLane).toBe(core.markers.lane);
    expect(PLAYGROUND_DEFAULTS.toolbarFit).toBe(toolbar?.fit);
    // Every default fits its control (range bounds, select choices)
    for (const c of SECTION?.controls ?? []) {
      expect(withValue(CHANGED, c.key, PLAYGROUND_DEFAULTS[c.key])[c.key], c.key).toBe(PLAYGROUND_DEFAULTS[c.key]);
    }
    // At the defaults the options are left out: the chart resolves the same values
    const o = playgroundOptions(PLAYGROUND_DEFAULTS, TODAY);
    expect(o.tooltip).toEqual({ trigger: undefined, showDelay: undefined, hideDelay: undefined });
    expect(o.markers?.lane).toBeUndefined();
    const resolved = resolveConfig(o);
    expect(resolved.tooltip.showDelay).toBe(320);
    expect(resolved.tooltip.hideDelay).toBe(120);
    expect(resolved.markers.lane).toBe('auto');
  });

  it('maps every control to the option the chart resolves', () => {
    const c = resolveConfig(playgroundOptions(CHANGED, TODAY));
    expect(c.legend.position).toBe('toolbar');
    expect(c.tooltip).toMatchObject({ trigger: 'focus', showDelay: 600, hideDelay: 300 });
    expect(c.keyboard.characterShortcuts).toBe(false);
    expect(c.bar.handles.hitSize).toBe(32);
    expect(c.markers.lane).toBe(false);
    expect(c.toolbar === false ? null : c.toolbar.fit).toBe(false);
    expect(resolveConfig(playgroundOptions({ ...CHANGED, markerLane: 'on' }, TODAY)).markers.lane).toBe(true);
    // The other toolbar controls keep their defaults
    expect(c.toolbar).toMatchObject({ zoom: true, today: true, viewToggle: true });
  });

  it('round-trips the section through a link and drops invalid values', () => {
    expect(changedKeys(CHANGED)).toHaveLength(8);
    expect(decodeState(encodeState(CHANGED))).toEqual(CHANGED);
    const forged = btoa(
      JSON.stringify({
        tooltipShowDelay: 1200,
        tooltipHideDelay: -20,
        handleHitSize: 8,
        markerLane: true,
        legendPosition: 'top',
        toolbarFit: 0,
      }),
    );
    expect(decodeState(forged)).toEqual(PLAYGROUND_DEFAULTS);
  });

  it('prints the section only once it is changed, in every framework', () => {
    for (const { id } of FRAMEWORKS) {
      const plain = playgroundCode(PLAYGROUND_DEFAULTS, id, TODAY);
      for (const word of ['tooltip', 'keyboard', 'handles', 'markers', 'legend', 'toolbar']) {
        expect(plain, `${id} ${word}`).not.toMatch(new RegExp(`\\b${word}:`));
      }
      const code = playgroundCode(CHANGED, id, TODAY);
      expect(code, id).toContain("tooltip: { trigger: 'focus', showDelay: 600, hideDelay: 300 }");
      expect(code, id).toContain('keyboard: { characterShortcuts: false }');
      expect(code, id).toContain('handles: { hitSize: 32 }');
      expect(code, id).toContain('markers: { lane: false }');
      expect(code, id).toContain("legend: { position: 'toolbar' }");
      expect(code, id).toContain('toolbar: { fit: false }');
      expect(code, id).not.toContain('undefined');
    }
    expect(playgroundCode({ ...PLAYGROUND_DEFAULTS, markerLane: 'on' }, 'js', TODAY)).toContain(
      'markers: { lane: true }',
    );
  });
});

describe('playground: layout, weeks, rollup and styles', () => {
  /** The Phase 10 controls: state key → the option it sets. */
  const OPTIONS: Partial<Record<PlaygroundKey, string>> = {
    weekNumbering: 'weekNumbering',
    arrowRouting: 'arrows.routing',
    rollup: 'rollup',
    rollupColor: 'rollup.color',
    groupsCollapsed: 'groupBar.collapsed',
    stylePreset: 'styles',
    density: 'density',
    responsive: 'responsive',
    panelToggle: 'toolbar.panelToggle',
    toolbarOverflow: 'toolbar.overflow',
  };
  const KEYS = Object.keys(OPTIONS) as PlaygroundKey[];
  /** Every new control off its default at once. */
  const CHANGED: PlaygroundState = {
    ...PLAYGROUND_DEFAULTS,
    weekStart: 6,
    weekNumbering: 'us',
    arrowRouting: 'straight',
    rollup: true,
    rollupColor: 'status',
    groupsCollapsed: true,
    stylePreset: 'levels',
    density: 'compact',
    responsive: 'table',
    panelToggle: true,
    toolbarOverflow: 'wrap',
  };
  const controls = PLAYGROUND_SECTIONS.flatMap(s => s.controls);

  it('has a control for each new option, Layout in a section of its own', () => {
    for (const key of KEYS) expect(controls.find(c => c.key === key)?.option, key).toBe(OPTIONS[key]);
    expect(PLAYGROUND_SECTIONS.find(s => s.title === 'Layout')?.controls.map(c => c.key)).toEqual([
      'density',
      'responsive',
      'panelToggle',
      'toolbarOverflow',
    ]);
    const weekStart = controls.find(c => c.key === 'weekStart');
    expect(weekStart?.kind === 'select' && weekStart.choices.map(([v]) => v)).toEqual(['rule', 1, 0, 6]);
    expect(controls.find(c => c.key === 'weekNumbering')?.hint).toBe(
      'ISO is exact only with Monday; weekStart overrides the rule’s first day.',
    );
    // Every default fits its control
    for (const key of [...KEYS, 'rowHeight', 'weekStart'] as PlaygroundKey[]) {
      expect(withValue(CHANGED, key, PLAYGROUND_DEFAULTS[key])[key], key).toBe(PLAYGROUND_DEFAULTS[key]);
    }
  });

  it('starts from the core defaults and leaves them to core', () => {
    const core = resolveConfig({});
    const toolbar = core.toolbar === false ? null : core.toolbar;
    expect(PLAYGROUND_DEFAULTS.density).toBe(core.density);
    expect(PLAYGROUND_DEFAULTS.rowHeight).toBe(core.rowHeight);
    // weekStart unset: the rule's own first day
    expect(PLAYGROUND_DEFAULTS.weekStart).toBe('rule');
    expect(PLAYGROUND_DEFAULTS.arrowRouting).toBe(core.arrows.routing);
    expect(PLAYGROUND_DEFAULTS.groupsCollapsed).toBe(core.groupBar.collapsed);
    expect(PLAYGROUND_DEFAULTS.rollup).toBe(core.rollup !== false);
    expect(PLAYGROUND_DEFAULTS.panelToggle).toBe(toolbar?.panelToggle);
    expect(PLAYGROUND_DEFAULTS.toolbarOverflow).toBe(toolbar?.overflow);
    // At the defaults the options are left out, and the chart resolves the same values
    const o = playgroundOptions(PLAYGROUND_DEFAULTS, TODAY);
    for (const key of [
      'weekStart',
      'weekNumbering',
      'density',
      'rowHeight',
      'responsive',
      'rollup',
      'styles',
    ] as const) {
      expect(o[key], key).toBeUndefined();
    }
    expect(o.arrows?.routing).toBeUndefined();
    expect(o.groupBar?.collapsed).toBeUndefined();
    expect(o.toolbar).toEqual({ panelToggle: undefined, fit: undefined, overflow: undefined });
    const resolved = resolveConfig(o);
    expect(resolved.week).toEqual(core.week);
    expect(resolved.weekStart).toBe(core.weekStart);
    expect(resolved.density).toBe(core.density);
    expect(resolved.rowHeight).toBe(core.rowHeight);
    expect(resolved.responsive).toEqual(core.responsive);
    expect(resolved.responsive).toEqual({ breakpoint: 640, view: 'chart' });
    expect(resolved.rollup).toBe(false);
    expect(resolved.styles).toEqual(core.styles);
    expect(resolved.arrows.routing).toBe(core.arrows.routing);
    expect(resolved.groupBar.collapsed).toBe(core.groupBar.collapsed);
    expect(resolved.toolbar).toEqual(core.toolbar);
  });

  it('maps every control to the option the chart resolves', () => {
    const c = resolveConfig(playgroundOptions(CHANGED, TODAY));
    expect(c.weekStart).toBe(6);
    expect(c.week).toEqual({ firstDay: 6, minimalDays: US_WEEK.minimalDays });
    expect(c.arrows.routing).toBe('straight');
    expect(c.rollup).toMatchObject({ color: 'status', dates: true, progress: 'duration' });
    expect(c.groupBar.collapsed).toBe(true);
    expect(c.styles.levels).toHaveLength(3);
    expect(c.density).toBe('compact');
    expect(c.responsive).toEqual({ breakpoint: 640, view: 'table' });
    expect(c.toolbar).toMatchObject({ panelToggle: true, overflow: 'wrap', fit: true });
  });

  it('lets the density size the rows until the row height is changed', () => {
    const comfortable = { ...PLAYGROUND_DEFAULTS, density: 'comfortable' };
    expect(resolveConfig(playgroundOptions(comfortable, TODAY)).rowHeight).toBe(44);
    expect(resolveConfig(playgroundOptions({ ...comfortable, rowHeight: 30 }, TODAY)).rowHeight).toBe(30);
    expect(resolveConfig(playgroundOptions({ ...PLAYGROUND_DEFAULTS, rowHeight: 50 }, TODAY)).rowHeight).toBe(50);
    expect(resolveConfig(playgroundOptions({ ...PLAYGROUND_DEFAULTS, density: 'compact' }, TODAY)).tierHeights).toEqual(
      [28, 24],
    );
  });

  it('numbers weeks by the chosen rule, weekStart giving the first day', () => {
    const week = (s: Partial<PlaygroundState>) =>
      resolveConfig(playgroundOptions({ ...PLAYGROUND_DEFAULTS, ...s }, TODAY)).week;
    expect(week({})).toEqual(ISO_WEEK);
    expect(week({ weekStart: 0 })).toEqual(US_WEEK);
    expect(week({ weekNumbering: 'iso', weekStart: 0 })).toEqual({ firstDay: 0, minimalDays: 4 });
    expect(week({ weekNumbering: 'us', weekStart: 0 })).toEqual(US_WEEK);
    expect(week({ weekStart: 6 })).toEqual({ firstDay: 6, minimalDays: 4 });
    // From the rule (weekStart unset): the US rule's own Sunday, ISO's Monday
    expect(week({ weekNumbering: 'us' })).toEqual(US_WEEK);
    expect(week({ weekNumbering: 'iso' })).toEqual(ISO_WEEK);
    expect(week({ weekNumbering: 'us', weekStart: 1 })).toEqual({ firstDay: 1, minimalDays: US_WEEK.minimalDays });
    // `locale` reads the chart's own locale: the playground sets none
    const o = playgroundOptions({ ...PLAYGROUND_DEFAULTS, weekNumbering: 'locale' }, TODAY);
    expect(o.weekNumbering).toBe('locale');
    expect(o.locale).toBeUndefined();
  });

  it('rolls the colour up only while parents roll up', () => {
    const on = { ...PLAYGROUND_DEFAULTS, rollup: true };
    expect(playgroundOptions(on, TODAY).rollup).toBe(true);
    expect(playgroundOptions({ ...on, rollupColor: 'status' }, TODAY).rollup).toEqual({ color: 'status' });
    expect(playgroundOptions({ ...PLAYGROUND_DEFAULTS, rollupColor: 'status' }, TODAY).rollup).toBeUndefined();
  });

  it('maps responsive to the core shapes', () => {
    const responsive = (value: string) =>
      playgroundOptions({ ...PLAYGROUND_DEFAULTS, responsive: value }, TODAY).responsive;
    expect(responsive('on')).toBeUndefined();
    expect(responsive('off')).toBe(false);
    expect(responsive('table')).toEqual({ view: 'table' });
    expect(resolveConfig(playgroundOptions({ ...PLAYGROUND_DEFAULTS, responsive: 'off' }, TODAY)).responsive).toBe(
      false,
    );
  });

  it('offers declarative style presets only', () => {
    const select = controls.find(c => c.key === 'stylePreset');
    const presets = select?.kind === 'select' ? select.choices.map(([v]) => String(v)) : [];
    expect(presets).toEqual(['none', 'parents', 'levels']);
    for (const preset of presets.slice(1)) {
      const styles = playgroundOptions({ ...PLAYGROUND_DEFAULTS, stylePreset: preset }, TODAY).styles;
      expect(styles, preset).toBeDefined();
      // Plain data: survives JSON (no `rule` callback), so it prints as code and travels in a link
      expect(JSON.parse(JSON.stringify(styles)), preset).toEqual(styles);
      expect(styles?.rule, preset).toBeUndefined();
    }
    expect(
      resolveConfig(playgroundOptions({ ...PLAYGROUND_DEFAULTS, stylePreset: 'parents' }, TODAY)).styles.parent,
    ).toEqual({ color: '#64748B', rowColor: 'rgba(100, 116, 139, 0.12)' });
  });

  it('round-trips the new controls through a link and drops invalid values', () => {
    expect(changedKeys(CHANGED)).toEqual(['weekStart', ...KEYS]);
    expect(decodeState(encodeState(CHANGED))).toEqual(CHANGED);
    const forged = btoa(
      JSON.stringify({
        weekStart: 2,
        weekNumbering: 'iso8601',
        arrowRouting: 'curved',
        rollup: 'yes',
        rollupColor: 'red',
        groupsCollapsed: 1,
        stylePreset: 'rule',
        density: 'tiny',
        responsive: true,
        panelToggle: 'on',
        toolbarOverflow: 'scroll',
      }),
    );
    expect(decodeState(forged)).toEqual(PLAYGROUND_DEFAULTS);
  });

  it('prints the new options only once they are changed, in every framework', () => {
    for (const { id } of FRAMEWORKS) {
      const plain = playgroundCode(PLAYGROUND_DEFAULTS, id, TODAY);
      for (const word of [
        'weekNumbering',
        'density',
        'rowHeight',
        'responsive',
        'routing',
        'rollup',
        'collapsed',
        'styles',
        'panelToggle',
        'overflow',
      ]) {
        expect(plain, `${id} ${word}`).not.toMatch(new RegExp(`\\b${word}:`));
      }
      expect(plain, id).not.toContain('weekStart');
      const code = playgroundCode(CHANGED, id, TODAY);
      expect(code, id).toContain('weekStart: 6');
      expect(code, id).toContain("weekNumbering: 'us'");
      expect(code, id).toContain("density: 'compact'");
      expect(code, id).toContain("responsive: { view: 'table' }");
      expect(code, id).toContain("arrows: { radius: 4, routing: 'straight' }");
      expect(code, id).toContain("rollup: { color: 'status' }");
      expect(code, id).toContain("groupBar: { style: 'summary', collapsed: true }");
      expect(code, id).toMatch(/styles: \{\s+levels: \[/);
      expect(code, id).toContain("color: '#8B5CF6', height: '45%'");
      expect(code, id).toContain("toolbar: { panelToggle: true, overflow: 'wrap' }");
      expect(code, id).not.toContain('rowHeight');
      expect(code, id).not.toContain('undefined');
      expect(code, id).not.toContain('=> …');
    }
    const more = { ...PLAYGROUND_DEFAULTS, rowHeight: 44, rollup: true, responsive: 'off', stylePreset: 'parents' };
    const js = playgroundCode(more, 'js', TODAY);
    expect(js).toContain('rowHeight: 44');
    expect(js).toContain('rollup: true');
    expect(js).toContain('responsive: false');
    expect(js).toContain("parent: { color: '#64748B', rowColor: 'rgba(100, 116, 139, 0.12)' }");
  });

  it('collapses or expands the rows shown when groupBar.collapsed changes', () => {
    const on = { ...PLAYGROUND_DEFAULTS, groupsCollapsed: true };
    expect(playgroundCommand(PLAYGROUND_DEFAULTS, on)).toBe('collapseAll');
    expect(playgroundCommand(on, { ...PLAYGROUND_DEFAULTS })).toBe('expandAll');
    expect(playgroundCommand(PLAYGROUND_DEFAULTS, { ...PLAYGROUND_DEFAULTS, rollup: true })).toBeNull();
    expect(playgroundCommand(on, { ...on, density: 'compact' })).toBeNull();
  });

  it('prints a range value with its unit the same way in every playground', () => {
    expect(valueText(600, 'ms')).toBe('600 ms');
    expect(valueText(24, 'px')).toBe('24 px');
    expect(valueText(9, 'h')).toBe('9 h');
    expect(valueText(60, '%')).toBe('60%');
    expect(valueText(3, undefined)).toBe('3');
  });
});

describe('playground: drag readout format, rollup progress and segments, week start from the rule', () => {
  const controls = PLAYGROUND_SECTIONS.flatMap(s => s.controls);
  const CHANGED: PlaygroundState = {
    ...PLAYGROUND_DEFAULTS,
    rollup: true,
    rollupProgress: 'count',
    rollupSegments: true,
    readoutFormat: 'YYYY-MM-DD',
  };

  it('has a control for each option, the rollup ones after the rollup colour', () => {
    expect(controls.find(c => c.key === 'readoutFormat')?.option).toBe('formats.readoutFormat');
    expect(controls.find(c => c.key === 'rollupProgress')?.option).toBe('rollup.progress');
    expect(controls.find(c => c.key === 'rollupSegments')?.option).toBe('rollup.segments');
    const bars = PLAYGROUND_SECTIONS.find(s => s.title === 'Bars')!.controls.map(c => c.key);
    expect(bars.slice(bars.indexOf('rollup'), bars.indexOf('rollup') + 4)).toEqual([
      'rollup',
      'rollupColor',
      'rollupProgress',
      'rollupSegments',
    ]);
    const weekStart = controls.find(c => c.key === 'weekStart');
    expect(weekStart?.kind === 'select' && weekStart.choices[0]).toEqual(['rule', 'From the rule']);
  });

  it('starts from the core defaults and leaves them to core', () => {
    const core = resolveConfig({ rollup: true });
    const rollup = core.rollup === false ? null : core.rollup;
    expect(PLAYGROUND_DEFAULTS.rollupProgress).toBe(rollup?.progress);
    expect(PLAYGROUND_DEFAULTS.rollupSegments).toBe(rollup?.segments);
    expect(PLAYGROUND_DEFAULTS.readoutFormat).toBe('scale');
    const o = playgroundOptions(PLAYGROUND_DEFAULTS, TODAY);
    expect(o.formats).toEqual({ readoutFormat: undefined });
    expect(o.weekStart).toBeUndefined();
    expect(playgroundOptions({ ...PLAYGROUND_DEFAULTS, rollup: true }, TODAY).rollup).toBe(true);
    for (const key of ['readoutFormat', 'rollupProgress', 'rollupSegments', 'weekStart'] as PlaygroundKey[]) {
      expect(withValue(CHANGED, key, PLAYGROUND_DEFAULTS[key])[key], key).toBe(PLAYGROUND_DEFAULTS[key]);
    }
  });

  it('maps every control to the option the chart resolves', () => {
    const o = playgroundOptions(CHANGED, TODAY);
    expect(o.formats).toEqual({ readoutFormat: 'YYYY-MM-DD' });
    expect(o.rollup).toEqual({ progress: 'count', segments: true });
    expect(resolveConfig(o).rollup).toMatchObject({ progress: 'count', segments: true, dates: true, color: false });
    const off = playgroundOptions({ ...CHANGED, rollupProgress: 'off', rollupColor: 'status' }, TODAY).rollup;
    expect(off).toEqual({ color: 'status', progress: false, segments: true });
    expect(resolveConfig({ rollup: off }).rollup).toMatchObject({ progress: false, color: 'status' });
    // Only while parents roll up
    expect(playgroundOptions({ ...CHANGED, rollup: false }, TODAY).rollup).toBeUndefined();
    // Week start from the rule: the US rule starts on Sunday, a chosen day wins
    const us = { ...PLAYGROUND_DEFAULTS, weekNumbering: 'us' };
    expect(resolveConfig(playgroundOptions(us, TODAY)).weekStart).toBe(0);
    expect(resolveConfig(playgroundOptions({ ...us, weekStart: 1 }, TODAY)).weekStart).toBe(1);
  });

  it('round-trips through a link and drops invalid values', () => {
    expect(changedKeys(CHANGED)).toEqual(['rollup', 'rollupProgress', 'rollupSegments', 'readoutFormat']);
    expect(decodeState(encodeState(CHANGED))).toEqual(CHANGED);
    const forged = btoa(
      JSON.stringify({ readoutFormat: '<b>', rollupProgress: 'sum', rollupSegments: 'yes', weekStart: 'monday' }),
    );
    expect(decodeState(forged)).toEqual(PLAYGROUND_DEFAULTS);
    // An older link with a numeric week start still opens
    expect(decodeState(btoa(JSON.stringify({ weekStart: 1 }))).weekStart).toBe(1);
  });

  it('prints them only once they are changed, in every framework', () => {
    for (const { id } of FRAMEWORKS) {
      const plain = playgroundCode({ ...PLAYGROUND_DEFAULTS, rollup: true }, id, TODAY);
      for (const word of ['formats', 'readoutFormat', 'progress', 'segments', 'weekStart']) {
        expect(plain, `${id} ${word}`).not.toMatch(new RegExp(`\\b${word}:`));
      }
      expect(plain, id).toContain('rollup: true');
      const code = playgroundCode({ ...CHANGED, weekNumbering: 'us', weekStart: 0 }, id, TODAY);
      expect(code, id).toContain("formats: { readoutFormat: 'YYYY-MM-DD' }");
      expect(code, id).toContain("rollup: { progress: 'count', segments: true }");
      expect(code, id).toContain('weekStart: 0');
      expect(code, id).not.toContain('undefined');
    }
  });
});

describe('site', () => {
  it('builds install commands', () => {
    expect(installCommand('pnpm', '@gantryjs/vanilla')).toBe('pnpm add @gantryjs/vanilla');
    expect(installCommand('npm', '@gantryjs/angular')).toBe('npm i @gantryjs/angular');
  });

  it('reads the element API from the manifest', () => {
    expect(GANTRY_API.tagName).toBe('gantry-element');
    expect(GANTRY_API.properties.map(p => p.name)).toContain('options');
    expect(GANTRY_API.properties.find(p => p.name === 'darkMode')?.attribute).toBe('dark-mode');
    expect(GANTRY_API.methods.find(m => m.name === 'zoomIn')?.signature).toBe('zoomIn(): void');
    // A parameter with a default is optional, typed from the default when the manifest has no type
    const setState = GANTRY_API.methods.find(m => m.name === 'setState')?.signature ?? '';
    expect(setState).toMatch(/emit\?: boolean/);
    expect(GANTRY_API.methods.find(m => m.name === 'scrollToToday')?.signature).toMatch(/behavior\?:/);
    expect(GANTRY_API.events.find(e => e.name === 'task-dragged')?.detail).toBe('TaskDragEvent');
    expect(GANTRY_API.cssProperties.length).toBeGreaterThan(30);
  });
});

describe('theme switch', () => {
  afterEach(() => localStorage.clear());

  it('applies, stores and announces the theme', () => {
    initTheme();
    const seen: string[] = [];
    const off = onThemeChange(t => seen.push(t));
    setTheme('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem('gantry-site-theme')).toBe('dark');
    expect(toggleTheme()).toBe('light');
    expect(getTheme()).toBe('light');
    off();
    setTheme('dark');
    expect(seen).toEqual(['dark', 'light']);
  });
});
