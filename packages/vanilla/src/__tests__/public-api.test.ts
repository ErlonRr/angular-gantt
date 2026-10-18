// The curated public surface of `@gantryjs/vanilla` (Gantry 2 phase 6, step 5.1): the index exports
// the element, its data source and the binding tables next to `@gantryjs/core`; the engine stays
// private. `resetTheme()` drops the `setTheme` / `patchTheme` overrides.
import { describe, it, expect, afterEach } from 'vitest';
import * as core from '@gantryjs/core';
import { DarkTheme, LightTheme, type GanttTask } from '@gantryjs/core';
import * as api from '../index';
import type { GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';

const flush = (el: GantryElement) => getEngine(el).flushSync();

function task(id: string, day: number): GanttTask {
  return { id, name: `Task ${id}`, start: new Date(2026, 2, day), end: new Date(2026, 2, day + 5), progress: 40 };
}

function mount(props: Partial<GantryElement> = {}): GantryElement {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks: [task('a', 2), task('b', 6)] }, props);
  document.body.appendChild(el);
  flush(el);
  return el;
}

/** The value of `name` in the element's theme sheet (the last adopted sheet with a `:host` rule). */
function themeValue(el: GantryElement, name: string): string {
  for (const sheet of [...el.shadowRoot!.adoptedStyleSheets].reverse()) {
    const rule = sheet.cssRules[0] as CSSStyleRule | undefined;
    if (rule?.selectorText === ':host') return rule.style.getPropertyValue(name).trim();
  }
  throw new Error('no theme sheet adopted');
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('@gantryjs/vanilla index', () => {
  it('exports the element, the data source and the binding tables next to @gantryjs/core', () => {
    const own = Object.keys(api)
      .filter(name => !(name in core))
      .sort();
    expect(own).toEqual(['GANTRY_EVENTS', 'GANTRY_PROPERTIES', 'GantryElement', 'GanttDataSource']);
    // Everything in core is re-exported as is
    for (const name of Object.keys(core))
      expect(api[name as keyof typeof api], name).toBe(core[name as keyof typeof core]);
  });

  it('keeps the engine private', () => {
    // (the exact export list above already rules out every removed service and painter)
    for (const name of ['getEngine', 'registerEngine', 'createEngine']) expect(name in api, name).toBe(false);
    const el = mount();
    // No public instance fields: the engine lives in a private field and a module-level registry
    expect(Object.keys(el)).toEqual([]);
  });
});

describe('resetTheme()', () => {
  it('drops the setTheme / patchTheme overrides and keeps options.theme', () => {
    const el = mount({ options: { theme: { todayColor: '#00AA00' } } });
    el.setTheme({ barColor: '#FDE68A' });
    el.patchTheme({ fontSize: '15px' });
    flush(el);
    expect(themeValue(el, '--gantt-bar')).toBe('#FDE68A');
    expect(themeValue(el, '--gantt-bar-text-on-bar')).toBe('#0F172A');
    expect(themeValue(el, '--gantt-font-size')).toBe('15px');
    expect(getEngine(el).graph.metrics.peek().fontPx).toBe(14);

    el.resetTheme();
    flush(el);
    expect(themeValue(el, '--gantt-bar')).toBe(LightTheme.barColor);
    expect(themeValue(el, '--gantt-bar-text-on-bar')).toBe(
      core.readableOn(LightTheme.barColor, LightTheme.barTextColor),
    );
    expect(themeValue(el, '--gantt-font-size')).toBe(LightTheme.fontSize);
    expect(themeValue(el, '--gantt-today')).toBe('#00AA00');
    expect(getEngine(el).graph.metrics.peek().fontPx).toBe(core.cssPx(LightTheme.fontSize, 13) - 1);
  });

  it('restores the dark base in dark mode', () => {
    const el = mount({ darkMode: true });
    el.setTheme({ barColor: '#FDE68A', backgroundColor: '#000000' });
    flush(el);
    el.resetTheme();
    flush(el);
    expect(themeValue(el, '--gantt-bar')).toBe(DarkTheme.barColor);
    expect(themeValue(el, '--gantt-bg')).toBe(DarkTheme.backgroundColor);
  });

  it('is a no-op without overrides (the theme is not recomputed)', () => {
    const el = mount();
    const { runs, graph } = getEngine(el);
    graph.theme();
    const before = runs['theme'];
    el.resetTheme();
    graph.theme();
    expect(runs['theme']).toBe(before);
  });
});
