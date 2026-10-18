import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig } from '@gantryjs/core';
import { GANTRY_API } from '../api';
import {
  PLAYGROUND_DEFAULTS,
  PLAYGROUND_SECTIONS,
  changedKeys,
  decodeState,
  encodeState,
  playgroundCode,
  playgroundOptions,
  withValue,
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
