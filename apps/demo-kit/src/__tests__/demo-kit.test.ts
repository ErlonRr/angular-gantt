import { afterEach, describe, expect, it } from 'vitest';
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

describe('site', () => {
  it('builds install commands', () => {
    expect(installCommand('pnpm', '@gantryjs/vanilla')).toBe('pnpm add @gantryjs/vanilla');
    expect(installCommand('npm', 'ngx-gantry')).toBe('npm i ngx-gantry');
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
