// Strict CSP and Trusted Types (Gantry 2 phase 6, step 3): one shared base stylesheet per document
// plus the per-instance theme sheet, both adopted; a style element filled through textContent only
// without constructable stylesheets; the shadow tree built node by node (no HTML parsing, no style
// text); no colour in any style attribute (theme colours are var() references written through the
// CSSOM); the host keeps no style attribute of ours; the resize cursor is a data attribute + CSS.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LightTheme, themeToCss, type GanttTask, type GanttFlatRow } from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { BASE_CSS, getBaseSheet } from '../styles/base';
import { TOOLTIP_SHOW_DELAY } from '../layers/tooltip';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();

/** `n` one-week tasks in March 2026 (a group with children, a milestone), theme colours only. */
function plan(n: number): GanttTask[] {
  return [
    { id: 'g', name: 'Group', start: new Date(2026, 2, 2), end: new Date(2026, 2, 30), progress: 30 },
    ...Array.from({ length: n }, (_, i) => ({
      id: `t${i}`,
      name: `Task ${i}`,
      parentId: 'g',
      start: new Date(2026, 2, 2 + (i % 20)),
      end: new Date(2026, 2, 9 + (i % 20)),
      progress: (i * 7) % 100,
      ...(i > 0 ? { dependency: `t${i - 1}` } : {}),
    })),
    { id: 'm', name: 'Milestone', start: new Date(2026, 2, 20), end: new Date(2026, 2, 20), type: 'milestone' },
  ] as GanttTask[];
}

/** Created and connected without any style of the test's own on the host. */
function mount(props: Partial<Pick<GantryElement, 'tasks' | 'options' | 'showLegend' | 'annotations'>> = {}) {
  const el = document.createElement('gantry-element');
  Object.assign(el, props);
  document.body.appendChild(el);
  flush(el);
  return el;
}

const $ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel)!;

/**
 * A literal colour in a declaration value: hex, a colour function, or a common named colour.
 * Custom property names (`var(--gantt-bar)`) are removed first, so theme references pass.
 */
const LITERAL_COLOUR =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|(?<![\w-])(?:transparent|black|white|red|green|blue|yellow|orange|purple|pink|brown|gray|grey|silver|navy|teal|olive|lime|aqua|fuchsia|maroon)(?![\w-])/i;

/** The declarations of a style attribute whose value holds a literal colour (`prop: value`). */
const colouredDeclarations = (style: string): string[] =>
  style
    .split(';')
    .map(d => d.trim())
    .filter(d => {
      const colon = d.indexOf(':');
      return colon > 0 && LITERAL_COLOUR.test(d.slice(colon + 1).replace(/--[\w-]+/g, ''));
    });

/** Every element of the shadow tree with a style attribute: `path → style text`. */
function styledNodes(el: GantryElement): Record<string, string> {
  const out: Record<string, string> = {};
  el.shadowRoot!.querySelectorAll('[style]').forEach((node, i) => {
    out[`${i}:${node.tagName.toLowerCase()}.${node.getAttribute('class') ?? ''}`] = node.getAttribute('style')!;
  });
  return out;
}

describe('stylesheets', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('two instances share one base CSSStyleSheet; each adopts its own theme sheet after it', () => {
    const a = mount({ tasks: plan(3) });
    const b = mount({ tasks: plan(3) });
    const base = getBaseSheet(document);
    expect(base).toBeInstanceOf(CSSStyleSheet);
    expect(base!.cssRules.length).toBeGreaterThan(20);

    const [baseA, themeA] = a.shadowRoot!.adoptedStyleSheets;
    const [baseB, themeB] = b.shadowRoot!.adoptedStyleSheets;
    expect(a.shadowRoot!.adoptedStyleSheets).toHaveLength(2);
    expect(baseA).toBe(base);
    expect(baseB).toBe(base);
    expect(themeA).not.toBe(themeB);
    expect((themeA.cssRules[0] as CSSStyleRule).selectorText).toBe(':host');
    // No style element: the CSS lives only in the adopted sheet
    expect(a.shadowRoot!.querySelectorAll('style')).toHaveLength(0);
  });

  it('builds the base sheet once per document', () => {
    expect(getBaseSheet(document)).toBe(getBaseSheet(document));
    // A document without a window can't construct (nor adopt) sheets
    expect(getBaseSheet(document.implementation.createHTMLDocument(''))).toBeNull();
  });

  it('falls back to a style element filled through textContent without constructable stylesheets', () => {
    vi.stubGlobal('CSSStyleSheet', undefined);
    const el = mount({ tasks: plan(3) });
    expect(getBaseSheet(document)).toBeNull();
    expect(el.shadowRoot!.adoptedStyleSheets).toHaveLength(0);
    const first = el.shadowRoot!.firstElementChild!;
    expect(first.tagName).toBe('STYLE');
    expect(first.textContent).toBe(BASE_CSS);
    expect(el.shadowRoot!.querySelectorAll('style')).toHaveLength(1);
  });
});

describe('shadow tree', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps the structure, parts and roles of the former template', () => {
    const el = mount({ tasks: plan(3) });
    const root = el.shadowRoot!;
    const top = [...root.children].map(c => `${c.tagName.toLowerCase()}.${c.className}`);
    expect(top.slice(0, 3)).toEqual(['div.gantry-wrapper', 'div.gantt-legend', 'div.gantt-sr-alert']);
    expect([...root.querySelectorAll('[part]')].map(n => n.getAttribute('part'))).toEqual([
      'wrapper',
      'toolbar',
      'panel',
      'splitter',
      'timeline',
    ]);
    const shape = (sel: string) => [...$(el, sel).children].map(c => c.className);
    expect(shape('.gantry-main')).toEqual(['gantry-panel', 'gantry-splitter', 'gantry-canvas-viewport']);
    expect(shape('.gantry-canvas-viewport')).toEqual(['gantry-canvas-header-sticky', 'gantry-canvas-container']);
    expect(shape('.gantry-panel')[0]).toContain('gantry-tasklist-container');
    // The separator covers the splitter box, beside the toggle (a separator's children are presentational)
    expect(shape('.gantry-splitter')).toEqual(['gantry-splitter-handle', 'gantry-splitter-toggle']);
    const splitter = $(el, '.gantry-splitter-handle');
    expect(splitter.getAttribute('role')).toBe('separator');
    expect(splitter.getAttribute('aria-orientation')).toBe('vertical');
    expect(splitter.getAttribute('tabindex')).toBe('0');
    expect($(el, '.gantry-splitter-toggle').getAttribute('type')).toBe('button');
    expect($(el, '.gantt-legend').hidden).toBe(true);
    expect($(el, '.gantt-sr-alert').getAttribute('role')).toBe('alert');
    expect($(el, '.gantry-canvas-container > svg').getAttribute('role')).toBe('list');
  });

  it('never parses HTML nor writes style text while building, rendering and re-theming', () => {
    const restore: (() => void)[] = [];
    const calls: string[] = [];
    /**
     * Whether the trapped call comes from outside node_modules: happy-dom itself uses cssText and
     * setAttribute('style') internally. Its style object is a Proxy whose `set` handler forwards to
     * the accessor, so that one frame is skipped for the setter traps.
     */
    const fromOurCode = (skipStyleProxy = false) => {
      const frames = (new Error().stack ?? '').split('\n').slice(3);
      const caller = skipStyleProxy ? frames.find(f => !/at Object\.set .*CSSStyleDeclaration\.js/.test(f)) : frames[0];
      return !/node_modules/.test(caller ?? '');
    };
    const trapSetter = (proto: object, prop: string) => {
      const desc = Object.getOwnPropertyDescriptor(proto, prop);
      if (!desc?.set) return;
      Object.defineProperty(proto, prop, {
        ...desc,
        set(this: unknown, v: unknown) {
          if (fromOurCode(true)) calls.push(prop);
          desc.set!.call(this, v);
        },
      });
      restore.push(() => Object.defineProperty(proto, prop, desc));
    };
    const protoOf = (obj: object, prop: string): object => {
      let p: object | null = obj;
      while (p && !Object.prototype.hasOwnProperty.call(p, prop)) p = Object.getPrototypeOf(p) as object | null;
      return p ?? obj;
    };
    const probe = document.createElement('div');
    trapSetter(protoOf(probe, 'innerHTML'), 'innerHTML');
    trapSetter(protoOf(probe, 'outerHTML'), 'outerHTML');
    trapSetter(protoOf(probe.style, 'cssText'), 'cssText');
    const insertHtml = vi.spyOn(Element.prototype, 'insertAdjacentHTML');
    // happy-dom reflects CSSOM writes through its own setAttribute('style'): count our calls only
    const attrNames: string[] = [];
    const setAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
      if (fromOurCode()) attrNames.push(name.toLowerCase());
      setAttribute.call(this, name, value);
    };
    restore.push(() => {
      Element.prototype.setAttribute = setAttribute;
    });
    try {
      // The traps fire for code outside node_modules (this file included)
      probe.innerHTML = '';
      probe.style.cssText = '';
      expect(calls).toEqual(['innerHTML', 'cssText']);
      calls.length = 0;

      const el = mount({ tasks: plan(12), showLegend: true, options: { criticalPath: true } });
      el.darkMode = true;
      el.setTheme({ barColor: '#FDE68A' });
      el.setView('table');
      flush(el);
      el.setView('split');
      el.setSelectedTasks(['t1']);
      el.collapseAll();
      flush(el);
      el.expandAll();
      el.zoomOut();
      flush(el);
      el.remove();
      document.body.appendChild(el);
      flush(el);
    } finally {
      for (const r of restore) r();
      insertHtml.mockRestore();
    }
    expect(attrNames).toContain('aria-selected'); // the trap works
    expect(calls).toEqual([]);
    expect(insertHtml).not.toHaveBeenCalled();
    expect(attrNames.filter(n => n === 'style' || n.startsWith('on'))).toEqual([]);
  });
});

describe('style attributes', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('no style attribute in the shadow tree carries a literal colour (theme paints are var() references)', () => {
    const el = mount({
      tasks: plan(12),
      showLegend: true,
      annotations: [{ x1: new Date(2026, 2, 12), label: { text: 'Review' } }],
      options: { criticalPath: true, nonWorkingTime: { weekends: true, style: 'hatch' }, baseline: true },
    });
    el.setSelectedTasks(['t2']);
    flush(el);
    // Open the tooltip on a task (its progress paint and position are CSSOM writes too)
    const row = getEngine(el)
      .graph.allRows.peek()
      .find((r: GanttFlatRow) => r.task.id === 't3')!;
    getEngine(el).layers.tooltip.enter(row, new PointerEvent('pointermove', { clientX: 120, clientY: 80 }));
    vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY);
    expect($(el, '.gantt-tooltip').hidden).toBe(false);

    const styled = styledNodes(el);
    // Sanity: paints really are inline (CSSOM) — the check below is not vacuous
    expect(Object.values(styled).some(s => s.includes('var(--gantt-'))).toBe(true);
    // No exception left: the progress overlay is the `--gantt-progress-overlay` token too
    expect(el.getBarVisual('t1')!.paint.progress).toBe('var(--gantt-progress-overlay)');
    const withColour = Object.entries(styled)
      .map(([node, style]) => [node, colouredDeclarations(style)])
      .filter(([, decls]) => decls.length > 0);
    expect(withColour).toEqual([]);
    // Theme variables live in the theme sheet only, never inline in the tree
    const themeVars = themeToCss(LightTheme).map(([name]) => name);
    expect(themeVars).toContain('--gantt-bar');
    const inlineVars = Object.values(styled).flatMap(s => themeVars.filter(v => s.includes(`${v}:`)));
    expect(inlineVars).toEqual([]);
  });

  it('the host has no style attribute after connect, re-theming and reconnecting', () => {
    const el = mount({ tasks: plan(5) });
    expect(el.hasAttribute('style')).toBe(false);
    el.darkMode = true;
    el.patchTheme({ todayColor: '#FF0000' });
    flush(el);
    el.remove();
    document.body.appendChild(el);
    flush(el);
    expect(el.hasAttribute('style')).toBe(false);
  });
});

describe('resize cursor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('is a data attribute styled by the stylesheet, not an inline cursor', () => {
    const el = mount({ tasks: plan(3) });
    const canvas = $(el, '.gantry-canvas-container');
    const body = $(el, '.gantt-bars-layer [data-task-id="t1"] .gantt-bar-body');
    const handles = el.getBarVisual('t1')!.handles!;
    const move = (clientX: number) =>
      body.dispatchEvent(new PointerEvent('pointermove', { clientX, clientY: 1, bubbles: true }));

    move((handles.right[0] + handles.right[1]) / 2);
    expect(canvas.getAttribute('data-cursor')).toBe('ew-resize');
    expect(canvas.style.getPropertyValue('cursor')).toBe('');
    expect(BASE_CSS).toMatch(/\.gantry-canvas-container\[data-cursor="ew-resize"\][^{]*\{\s*cursor: ew-resize;/);

    move((handles.left[1] + handles.right[0]) / 2);
    expect(canvas.hasAttribute('data-cursor')).toBe(false);
  });
});
