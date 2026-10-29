// Theme variables in the per-instance `:host{}` sheet, and paints applied through the CSSOM.
// happy-dom's getComputedStyle ignores CSSOM edits of stylesheet rules, so "computed" colours
// are resolved here from the inline paint and the theme sheet rule (`paintOf`).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DarkTheme, LightTheme, ViewMode, themeToCss, type GanttTask, type GanttOptions } from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { createThemeSheet } from '../styles/theme-sheet';
import '../index';

const frame = () => new Promise<void>(r => requestAnimationFrame(() => r()));

function task(id: string, start: string, end: string, extra: Partial<GanttTask> = {}): GanttTask {
  return { id, name: `Task ${id}`, start: new Date(start), end: new Date(end), progress: 50, ...extra };
}

async function mount(
  props: Partial<Pick<GantryElement, 'tasks' | 'options' | 'darkMode' | 'showLegend' | 'annotations'>> = {},
): Promise<GantryElement> {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, props);
  document.body.appendChild(el);
  await frame();
  return el;
}

const $ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel)!;
const $$ = (el: GantryElement, sel: string) => [...el.shadowRoot!.querySelectorAll(sel)];

/** The element's theme rule: the `:host` rule of the last adopted sheet that has one (after the base sheet). */
function themeRule(el: GantryElement): CSSStyleRule {
  for (const sheet of [...el.shadowRoot!.adoptedStyleSheets].reverse()) {
    const rule = sheet.cssRules[0] as CSSStyleRule | undefined;
    if (rule?.selectorText === ':host') return rule;
  }
  throw new Error('no theme sheet adopted');
}

const themeValue = (el: GantryElement, name: string) => themeRule(el).style.getPropertyValue(name).trim();

/** A paint as the browser computes it: `var(--x[, fallback])` resolved against the theme sheet. */
function resolve(el: GantryElement, value: string): string {
  const m = /^var\(\s*(--[\w-]+)\s*(?:,(.*))?\)$/s.exec(value.trim());
  if (!m) return value.trim();
  return themeValue(el, m[1]) || (m[2] ? resolve(el, m[2]) : '');
}

const paintOf = (el: GantryElement, node: Element, prop: string) =>
  resolve(el, (node as SVGElement | HTMLElement).style.getPropertyValue(prop));

describe('createThemeSheet', () => {
  const shadowHost = () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    return { host, shadow: host.attachShadow({ mode: 'open' }) };
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('adopts one :host rule (after the sheets already adopted) and writes through the CSSOM', () => {
    const { host, shadow } = shadowHost();
    const base = new CSSStyleSheet();
    shadow.adoptedStyleSheets = [base];
    const sheet = createThemeSheet(shadow);
    sheet.write([
      ['--gantt-bar', '#123456'],
      ['--gantt-text', '#654321'],
    ]);
    expect(shadow.adoptedStyleSheets).toHaveLength(2);
    expect(shadow.adoptedStyleSheets[0]).toBe(base);
    const rule = shadow.adoptedStyleSheets[1].cssRules[0] as CSSStyleRule;
    expect(rule.selectorText).toBe(':host');
    expect(rule.style.getPropertyValue('--gantt-bar')).toBe('#123456');
    expect(host.getAttribute('style')).toBeNull();

    sheet.destroy();
    expect(shadow.adoptedStyleSheets).toEqual([base]);
  });

  it('refuses a value that would smuggle in more declarations', () => {
    const { shadow } = shadowHost();
    const sheet = createThemeSheet(shadow);
    sheet.write([['--gantt-bar', '#123456']]);
    sheet.write([['--gantt-bar', 'red;background:url(x)']]);
    const rule = shadow.adoptedStyleSheets[0].cssRules[0] as CSSStyleRule;
    expect(rule.style.getPropertyValue('--gantt-bar')).toBe('');
    expect(rule.cssText).not.toContain('url(');
  });

  it("falls back to the host's inline style without constructable stylesheets", () => {
    vi.stubGlobal('CSSStyleSheet', undefined);
    const { host, shadow } = shadowHost();
    const sheet = createThemeSheet(shadow);
    sheet.write([['--gantt-bar', '#123456']]);
    expect(host.style.getPropertyValue('--gantt-bar')).toBe('#123456');
    expect(shadow.adoptedStyleSheets).toHaveLength(0);
    sheet.destroy();
    expect(host.style.getPropertyValue('--gantt-bar')).toBe('');
  });
});

describe('<gantry-element> theme sheet and paints', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    el?.remove();
    vi.restoreAllMocks();
  });

  it('writes every theme variable and the contrast tokens into the sheet, none into the host style', async () => {
    el = await mount({ tasks: [task('a', '2026-01-01', '2026-01-10')] });
    const css = themeToCss(LightTheme);
    expect(css).toHaveLength(45);
    for (const [name, value] of css) expect(themeValue(el, name), name).toBe(value);
    expect(el.getAttribute('style') ?? '').not.toContain('--gantt-');
    // No theme attribute on the host: the dark theme is the `:state(dark)` custom state
    expect(el.hasAttribute('data-theme')).toBe(false);
  });

  it('keeps the theme when the style attribute is replaced, and follows setTheme', async () => {
    el = await mount({ tasks: [task('a', '2026-01-01', '2026-01-10')] });
    el.setAttribute('style', 'height:400px');
    expect(themeValue(el, '--gantt-bar')).toBe(LightTheme.barColor);

    el.setTheme({ barColor: '#FDE68A' });
    await frame();
    expect(themeValue(el, '--gantt-bar')).toBe('#FDE68A');
    // A light bar colour switches its label token to the dark readable colour
    expect(themeValue(el, '--gantt-bar-text-on-bar')).toBe('#0F172A');
    expect(paintOf(el, $(el, '.gantt-bars-layer [data-task-id="a"] .gantt-bar-label'), 'fill')).toBe('#0F172A');
    expect(el.getAttribute('style') ?? '').not.toContain('--gantt-');
  });

  it("re-renders after an OS colour-scheme flip in 'auto' mode", async () => {
    const listeners = new Set<(e: { matches: boolean }) => void>();
    const mql = {
      matches: false,
      media: '(prefers-color-scheme: dark)',
      addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.delete(cb),
    };
    vi.spyOn(window, 'matchMedia').mockImplementation(() => mql as unknown as MediaQueryList);
    const themes: string[] = [];
    el = await mount({ tasks: [task('a', '2026-01-01', '2026-01-10')], darkMode: 'auto' });
    el.renderBar = ctx => {
      themes.push(ctx.theme.backgroundColor);
      return null;
    };
    await frame();
    const row = () => $(el, '.gantt-rows rect');
    expect(paintOf(el, row(), 'fill')).toBe(LightTheme.rowBg);
    expect(themes.at(-1)).toBe(LightTheme.backgroundColor);
    expect(listeners.size).toBe(1);

    mql.matches = true;
    for (const cb of listeners) cb({ matches: true });
    // The variables switch at once; custom renderers (`ctx.theme`) re-render on the next frame
    expect(themeValue(el, '--gantt-row-bg')).toBe(DarkTheme.rowBg);
    expect(themes.at(-1)).toBe(LightTheme.backgroundColor);
    await frame();
    expect(paintOf(el, row(), 'fill')).toBe(DarkTheme.rowBg);
    expect(themes.at(-1)).toBe(DarkTheme.backgroundColor);
    expect(el.hasAttribute('data-theme')).toBe(false);

    el.remove();
    expect(listeners.size).toBe(0);
  });

  it('paints colours as CSS properties through the CSSOM, never as presentation attributes', async () => {
    const options: GanttOptions = {
      // Wide enough for the labels to sit inside the bars
      viewMode: ViewMode.Day,
      criticalPath: true,
      baseline: true,
      initialScroll: false,
      nonWorkingTime: { weekends: true, holidays: [{ start: new Date('2026-03-04'), color: '#FCE7F3' }] },
      panel: { columns: ['name', 'status'] },
    };
    el = await mount({
      tasks: [
        task('a', '2026-03-02', '2026-03-06', {
          baseline: { start: new Date('2026-03-01'), end: new Date('2026-03-05') },
        }),
        task('b', '2026-03-09', '2026-03-13', { dependency: 'a', status: 'inProgress' }),
        // Has slack (the a → b chain is critical): its explicit colours are painted as given
        task('c', '2026-03-02', '2026-03-05', { barColor: '#FDE68A', progressColor: '#B45309' }),
      ],
      options,
      showLegend: true,
      annotations: [{ x1: new Date('2026-03-10'), label: { text: 'Freeze' } }],
    });
    el.setSelectedTasks(['c']);
    await frame();

    const attrs = $$(el, '[fill], [stroke]').flatMap(n => [n.getAttribute('fill'), n.getAttribute('stroke')]);
    expect(attrs.filter(v => v !== null && v !== 'none' && v !== 'url(#gantt-hatch)')).toEqual([]);

    const bar = (id: string, part: string) => $(el, `.gantt-bars-layer [data-task-id="${id}"] ${part}`);
    // Theme defaults are tokens; critical bars use the critical tokens
    expect(bar('a', '.gantt-bar-body').style.getPropertyValue('fill')).toBe('var(--gantt-critical)');
    expect(bar('a', '.gantt-bar-label').style.getPropertyValue('fill')).toBe('var(--gantt-bar-text-on-critical)');
    expect(bar('a', '.gantt-bar-baseline').style.getPropertyValue('stroke')).toBe('var(--gantt-baseline)');
    // Explicit colours pass through; the label on a light explicit fill is a concrete readable colour
    expect(paintOf(el, bar('c', '.gantt-bar-body'), 'fill').toUpperCase()).toBe('#FDE68A');
    expect(paintOf(el, bar('c', '.gantt-bar-progress'), 'fill').toUpperCase()).toBe('#B45309');
    expect(paintOf(el, bar('c', '.gantt-bar-label'), 'fill').toUpperCase()).toBe('#0F172A');
    expect(bar('c', '.gantt-bar-body').style.getPropertyValue('stroke')).toBe('var(--gantt-sel-border)');

    expect($(el, '.gantt-arrows path').style.getPropertyValue('stroke')).toMatch(/^var\(--gantt-(arrow|critical)\)$/);
    expect($(el, '.gantt-today').style.getPropertyValue('stroke')).toBe('var(--gantt-today)');
    expect($(el, '.gantt-band--weekend').style.getPropertyValue('fill')).toBe('var(--gantt-weekend-bg)');
    expect(paintOf(el, $(el, '.gantt-band--holiday'), 'fill').toUpperCase()).toBe('#FCE7F3');
    expect($(el, '.gantt-grid line').style.getPropertyValue('stroke')).toMatch(/^var\(--gantt-/);
    expect($(el, '.gantt-annotations line').style.getPropertyValue('stroke')).toBe('var(--gantt-arrow)');
    expect(paintOf(el, $(el, '.gantt-rows rect'), 'fill')).toBe(LightTheme.rowBg);
    expect($(el, '.gantt-legend-swatch--dashed > *').style.getPropertyValue('stroke')).toBe('var(--gantt-arrow)');
    // Toolbar icons and the legend strip: colours from the stylesheet (currentColor, theme tokens)
    const icons = $$(el, 'svg.gantt-tb-icon, svg.gantt-tb-icon > path');
    expect(icons.length).toBeGreaterThan(7);
    for (const icon of icons) expect(icon.getAttribute('style')).toBeNull();
    expect($(el, '.gantt-legend.gantt-legend--bottom').getAttribute('style')).toBeNull();
    for (const b of $$(el, '.gantt-toolbar button')) expect(b.getAttribute('style')).toBeNull();

    // Header: the delimiter border from headerCellBorder, band paints, no style text
    const cells = $$(el, '.g-cell') as HTMLElement[];
    expect(cells.some(c => c.style.getPropertyValue('border-left').includes('var(--gantt-'))).toBe(true);
    expect(paintOf(el, $(el, '.g-band--holiday'), 'background-color').toUpperCase()).toBe('#FCE7F3');

    // Task list: chrome from the stylesheet, data colours as paints
    expect($(el, '.gantt-tl-col-headers').style.getPropertyValue('background-color')).toBe('');
    const rowEl = (id: string) => $(el, `.gantt-tl-row[data-task-id="${id}"]`);
    expect(rowEl('a').style.getPropertyValue('background-color')).toBe('var(--gantt-row-bg)');
    expect(rowEl('c').style.getPropertyValue('background-color')).toBe('var(--gantt-sel-bg)');
    expect(paintOf(el, $(el, '.gantt-tl-status-dot'), 'background-color')).toBeTruthy();
    expect($(el, '.gantt-tl-status-dot').style.getPropertyValue('background-color')).toMatch(/^var\(--gantt-status-/);
  });

  it('places the state boxes through the CSSOM, their colours from the stylesheet', async () => {
    el = await mount({ options: { viewMode: ViewMode.Week } });
    el.loading = true;
    await frame();
    const blocks = $$(el, '.gantt-skeleton-row, .gantt-skeleton-name, .gantt-skeleton-bar') as HTMLElement[];
    expect(blocks.length).toBeGreaterThan(0);
    const GEOMETRY = new Set(['left', 'top', 'width', 'height']);
    for (const block of blocks) {
      const props = [...Array(block.style.length).keys()].map(i => block.style.item(i));
      expect(
        props.every(p => GEOMETRY.has(p)),
        props.join(),
      ).toBe(true);
    }
    el.errorMessage = 'Offline';
    await frame();
    for (const node of $$(el, '.gantt-state, .gantt-state *')) expect(node.getAttribute('style')).toBeNull();
  });

  it('falls back to inline host variables without constructable stylesheets', async () => {
    vi.stubGlobal('CSSStyleSheet', undefined);
    try {
      el = await mount({ tasks: [task('a', '2026-01-01', '2026-01-10')] });
      expect(el.shadowRoot!.adoptedStyleSheets).toHaveLength(0);
      for (const [name, value] of themeToCss(LightTheme)) expect(el.style.getPropertyValue(name), name).toBe(value);
      expect(getComputedStyle($(el, '.gantt-rows rect')).fill.toUpperCase()).toBe(LightTheme.rowBg);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('leaves no injected declaration from a task or holiday colour', async () => {
    const evil = 'red;background:url(x)';
    el = await mount({
      tasks: [task('a', '2026-03-02', '2026-03-06', { rowColor: evil, barColor: evil })],
      options: {
        initialScroll: false,
        nonWorkingTime: { weekends: true, holidays: [{ start: new Date('2026-03-04'), color: evil }] },
      },
    });
    const row = $(el, '.gantt-tl-row[data-task-id="a"]');
    expect(row.style.getPropertyValue('background')).toBe('');
    expect(row.style.getPropertyValue('background-image')).toBe('');
    expect(row.style.getPropertyValue('background-color')).toBe('');
    for (const node of $$(el, '[style]') as HTMLElement[]) expect(node.getAttribute('style')).not.toContain('url(');
    expect($(el, '.gantt-rows rect').style.getPropertyValue('fill')).toBe('');
    expect($(el, '.gantt-bars-layer [data-task-id="a"] .gantt-bar-body').style.getPropertyValue('fill')).toBe('');
  });

  it('styles the tooltip chrome from the stylesheet and fills its progress with the paint', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      el = await mount({ tasks: [task('a', '2026-01-01', '2026-01-10', { barColor: '#FDE68A' })] });
      const bar = $(el, '.gantt-bars-layer [data-task-id="a"]');
      bar.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }));
      vi.advanceTimersByTime(500);
      const tip = $(el, '.gantt-tooltip');
      expect(tip.style.getPropertyValue('background')).toBe('');
      expect(tip.style.getPropertyValue('color')).toBe('');
      expect(tip.style.getPropertyValue('font-family')).toBe('');
      expect(paintOf(el, $(el, '.gantt-tooltip-fill'), 'background-color').toUpperCase()).toBe('#FDE68A');
    } finally {
      vi.useRealTimers();
    }
  });
});
