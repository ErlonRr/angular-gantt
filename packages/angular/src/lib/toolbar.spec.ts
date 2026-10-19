// The toolbar (Gantry 2 phase 9, step 4.7): core `buildToolbar()` painted with the Web Component's
// markup (§3c of the plan) — groups and controls in order with the shared classes, radiogroups of
// radios (`aria-checked`, checked on activation only), inline SVG icons (`svg.gantt-tb-icon[ganttIcon]`),
// the Today label, `data-focus-key` on every control, one roving tab stop with ←/→ (wrap) and
// Home/End, the Fit button, and the Angular-only `[ganttToolbar]` slot outside the roving set.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  TOOLBAR_ICON_STROKE,
  TOOLBAR_ICON_VIEWBOX,
  TOOLBAR_ICONS,
  ViewMode,
  type GanttOptions,
  type GanttTask,
  type ToolbarIcon,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttToolbarComponent } from './annotations/gantt-toolbar.component';

/** `n` one-week tasks in March 2026. */
function plan(n: number): GanttTask[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Task ${i}`,
    start: new Date(2026, 2, 2 + (i % 20)),
    end: new Date(2026, 2, 9 + (i % 20)),
    progress: 40,
  }));
}

@Component({
  imports: [GantryComponent],
  template: `<gantry
    style="height: 400px"
    [series]="tasks"
    [options]="options()"
    [showToolbar]="showToolbar()"
    [(viewMode)]="zoom"
  >
    @if (slot()) {
      <button ganttToolbar type="button" class="consumer" data-focus-key="consumer">Export</button>
    }
  </gantry>`,
})
class Host {
  readonly tasks = plan(3);
  readonly options = signal<GanttOptions>({ initialScroll: false, viewMode: ViewMode.Month });
  readonly showToolbar = signal(true);
  readonly slot = signal(false);
  readonly zoom = signal<string | undefined>(undefined);
  readonly gantt = viewChild.required(GantryComponent);
}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  host: HTMLElement;
  gantt: GantryComponent;
  set(change: () => void): Promise<void>;
  $<E extends Element = HTMLElement>(sel: string): E | null;
  $$<E extends Element = HTMLElement>(sel: string): E[];
  button(key: string): HTMLButtonElement;
}

async function mount(setup?: (host: Host) => void): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  setup?.(f.componentInstance);
  await f.whenStable();
  const host = f.debugElement.query(By.directive(GantryComponent)).nativeElement as HTMLElement;
  const c: Chart = {
    f,
    h: f.componentInstance,
    host,
    gantt: f.componentInstance.gantt(),
    async set(change) {
      change();
      await f.whenStable();
    },
    $: sel => host.querySelector(sel),
    $$: sel => [...host.querySelectorAll(sel)] as never[],
    button(key) {
      const b = host.querySelector<HTMLButtonElement>(`.gantt-toolbar [data-focus-key="${key}"]`);
      if (!b) throw new Error(`no control ${key}`);
      return b;
    },
  };
  return c;
}

/** `data-focus-key` of every built-in control, in order */
const keys = (c: Chart) =>
  c.$$('.gantt-toolbar .gantt-tb-group:not(.gantt-tb-slot) > button').map(b => b.getAttribute('data-focus-key'));
const tabStops = (c: Chart) =>
  c.$$('.gantt-toolbar .gantt-tb-group > button[tabindex="0"]').map(b => b.getAttribute('data-focus-key'));
const active = () => document.activeElement?.getAttribute('data-focus-key');
/** The `d` of each path of a control's icon */
const iconPaths = (b: Element) => [...b.querySelectorAll('svg.gantt-tb-icon > path')].map(p => p.getAttribute('d'));

/** Dispatches a keydown on `target` the way a browser does (bubbling, cancelable); true when prevented. */
function key(target: Element, k: string, init: KeyboardEventInit = {}): boolean {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e.defaultPrevented;
}

/** CSS specificity of one compound selector, as one comparable number. */
function specificity(sel: string): number {
  const ids = (sel.match(/#[\w-]+/g) ?? []).length;
  const cls = (sel.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length;
  const types = (sel.match(/(?:^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return ids * 10_000 + cls * 100 + types;
}

interface CssBlock {
  /** The `@media` condition around the block, `null` at the top level */
  media: string | null;
  selector: string;
  body: string;
}

/** Every `selector { declarations }` block of the document's style elements, as written (no CSSOM parsing). */
function cssBlocks(): CssBlock[] {
  const out: CssBlock[] = [];
  const blocks = (text: string, media: string | null) => {
    for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ media, selector: m[1].trim(), body: m[2] });
  };
  for (const style of document.querySelectorAll('style')) {
    const text = (style.textContent ?? '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
      .replace(/@media([^{]*)\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g, (_, media: string, inner: string) => {
        blocks(inner, media.trim());
        return '';
      });
    blocks(text, null);
  }
  return out;
}

/**
 * The value of `prop` as declared by the most specific (then last) stylesheet rule matching `el`, at
 * the top level or inside an `@media` whose condition contains `media`.
 */
function cascaded(el: Element, prop: string, media: string | null = null): string {
  let best = { spec: -1, value: '' };
  for (const block of cssBlocks()) {
    if (media === null ? block.media !== null : !block.media?.includes(media)) continue;
    const decl = block.body
      .split(';')
      .map(d => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()] as const)
      .filter(([name]) => name === prop)
      .at(-1);
    if (!decl) continue;
    for (const sel of block.selector.split(',')) {
      let hit = false;
      try {
        hit = el.matches(sel.trim());
      } catch {
        // a selector the test DOM cannot parse never matches here
      }
      const spec = specificity(sel.trim());
      if (hit && spec >= best.spec) best = { spec, value: decl[1] };
    }
  }
  return best.value;
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('toolbar markup (§3c)', () => {
  it('paints the groups in order with their classes, roles and names; the slot before the views', async () => {
    const c = await mount();
    const bar = c.$('.gantt-toolbar')!;
    expect(bar.getAttribute('role')).toBe('toolbar');
    expect(bar.getAttribute('aria-label')).toBe('Chart toolbar');
    // The Angular host element is not the toolbar
    expect(c.$('gantt-toolbar')!.hasAttribute('role')).toBe(false);
    const groups = [...bar.children];
    expect(groups.map(g => g.getAttribute('class'))).toEqual([
      'gantt-tb-group',
      'gantt-tb-group gantt-tb-pills',
      'gantt-tb-group',
      'gantt-tb-slot gantt-tb-group',
      'gantt-tb-group gantt-tb-pills gantt-tb-views',
    ]);
    expect(groups.map(g => g.getAttribute('role'))).toEqual([null, 'radiogroup', null, null, 'radiogroup']);
    expect(groups.map(g => g.getAttribute('aria-label'))).toEqual([null, 'Zoom level', null, null, 'View']);
    expect(keys(c)).toEqual([
      'zoom-out',
      'zoom-in',
      'fit',
      'zoom:Hour',
      'zoom:Day',
      'zoom:Week',
      'zoom:Month',
      'zoom:Quarter',
      'zoom:Year',
      'today',
      'view:split',
      'view:table',
      'view:chart',
    ]);
    for (const b of c.$$('.gantt-toolbar button')) expect(b.getAttribute('type')).toBe('button');
  });

  it('draws zoom out, zoom in and fit as named icon buttons (svg.gantt-tb-icon[ganttIcon])', async () => {
    const c = await mount();
    const expected: [string, ToolbarIcon, string][] = [
      ['zoom-out', 'zoomOut', 'Zoom out'],
      ['zoom-in', 'zoomIn', 'Zoom in'],
      ['fit', 'fit', 'Fit to screen'],
    ];
    for (const [k, icon, name] of expected) {
      const b = c.button(k);
      expect(b.getAttribute('class')).toBe('gantt-tb-btn');
      expect(b.hasAttribute('role')).toBe(false);
      expect(b.hasAttribute('aria-checked')).toBe(false);
      expect(b.getAttribute('aria-label')).toBe(name);
      expect(b.getAttribute('title')).toBe(name);
      expect(b.children).toHaveLength(1);
      expect(b.textContent).toBe('');
      expect(iconPaths(b)).toEqual(TOOLBAR_ICONS[icon]);
      const svg = b.firstElementChild!;
      expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
      expect(svg.getAttribute('class')).toBe('gantt-tb-icon');
      expect(svg.getAttribute('viewBox')).toBe(TOOLBAR_ICON_VIEWBOX);
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('focusable')).toBe('false');
      expect([svg.getAttribute('width'), svg.getAttribute('height')]).toEqual(['16', '16']);
      expect(svg.getAttribute('stroke-width')).toBe(String(TOOLBAR_ICON_STROKE.width));
      expect(svg.getAttribute('stroke-linecap')).toBe(TOOLBAR_ICON_STROKE.linecap);
      expect(svg.getAttribute('stroke-linejoin')).toBe(TOOLBAR_ICON_STROKE.linejoin);
      // The colours are the stylesheet's, never attributes
      expect(svg.hasAttribute('fill')).toBe(false);
      expect(svg.hasAttribute('stroke')).toBe(false);
      for (const p of svg.children) expect(p.namespaceURI).toBe('http://www.w3.org/2000/svg');
    }
  });

  it('draws the zoom levels as text radios and the views as icon radios', async () => {
    const c = await mount();
    const month = c.button('zoom:Month');
    expect(month.getAttribute('class')).toBe('gantt-tb-pill');
    expect(month.getAttribute('role')).toBe('radio');
    expect(month.getAttribute('aria-checked')).toBe('true');
    expect(month.textContent).toBe('Month');
    expect(month.children).toHaveLength(0);
    // The visible text names it: no aria-label, no title
    expect(month.hasAttribute('aria-label')).toBe(false);
    expect(month.hasAttribute('title')).toBe(false);
    expect(c.button('zoom:Week').getAttribute('aria-checked')).toBe('false');
    expect(c.$$('[aria-pressed]')).toHaveLength(0);

    const views: [string, ToolbarIcon, string, string][] = [
      ['view:split', 'viewSplit', 'Table and chart', 'true'],
      ['view:table', 'viewTable', 'Table only', 'false'],
      ['view:chart', 'viewChart', 'Chart only', 'false'],
    ];
    for (const [k, icon, name, checked] of views) {
      const b = c.button(k);
      expect(b.getAttribute('class')).toBe('gantt-tb-pill');
      expect(b.getAttribute('role')).toBe('radio');
      expect(b.getAttribute('aria-checked')).toBe(checked);
      expect(b.getAttribute('aria-label')).toBe(name);
      expect(b.getAttribute('title')).toBe(name);
      expect(b.textContent).toBe('');
      expect(iconPaths(b)).toEqual(TOOLBAR_ICONS[icon]);
    }
  });

  it('draws Today as an icon followed by its label', async () => {
    const c = await mount();
    const today = c.button('today');
    expect(today.getAttribute('class')).toBe('gantt-tb-btn gantt-tb-today');
    expect([...today.children].map(e => e.getAttribute('class'))).toEqual(['gantt-tb-icon', 'gantt-tb-label']);
    expect(iconPaths(today)).toEqual(TOOLBAR_ICONS.today);
    expect(today.querySelector('.gantt-tb-label')!.textContent).toBe('Today');
    expect(today.hasAttribute('aria-label')).toBe(false);
    expect(today.hasAttribute('title')).toBe(false);
  });

  it('follows options.toolbar: fit, groups and the offered levels (each once)', async () => {
    const c = await mount(h =>
      h.options.set({
        initialScroll: false,
        viewMode: ViewMode.Month,
        toolbar: { fit: false, today: false, viewModes: ['Week', 'Week', 'Nope'] },
      }),
    );
    expect(keys(c)).toEqual(['zoom-out', 'zoom-in', 'zoom:Week', 'view:split', 'view:table', 'view:chart']);
    await c.set(() =>
      c.h.options.set({
        initialScroll: false,
        viewMode: ViewMode.Month,
        toolbar: { zoom: false, viewModes: false, today: false },
      }),
    );
    expect(keys(c)).toEqual(['fit', 'view:split', 'view:table', 'view:chart']);
    await c.set(() => c.h.options.set({ initialScroll: false, viewMode: ViewMode.Month, toolbar: false }));
    expect(c.$('.gantt-toolbar')).toBeNull();
  });

  it('localises names and texts in place, keeping the controls and their icons', async () => {
    const c = await mount();
    const zoomIn = c.button('zoom-in');
    const icon = zoomIn.firstElementChild;
    const todayLabel = c.button('today').querySelector('.gantt-tb-label');
    await c.set(() =>
      c.h.options.set({
        initialScroll: false,
        viewMode: ViewMode.Month,
        labels: {
          zoomIn: 'Ingrandisci',
          todayButton: 'Oggi',
          viewSplit: 'Tabella e grafico',
          ariaZoomLevels: 'Livello di zoom',
          ariaToolbar: 'Barra del grafico',
          viewModes: { Month: 'Mese' },
        },
      }),
    );
    expect(c.button('zoom-in')).toBe(zoomIn);
    expect(zoomIn.firstElementChild).toBe(icon);
    expect(zoomIn.getAttribute('aria-label')).toBe('Ingrandisci');
    expect(zoomIn.title).toBe('Ingrandisci');
    expect(c.button('today').querySelector('.gantt-tb-label')).toBe(todayLabel);
    expect(todayLabel!.textContent).toBe('Oggi');
    expect(c.button('view:split').getAttribute('aria-label')).toBe('Tabella e grafico');
    expect(c.button('zoom:Month').textContent).toBe('Mese');
    expect(c.$('.gantt-tb-pills')!.getAttribute('aria-label')).toBe('Livello di zoom');
    expect(c.$('.gantt-toolbar')!.getAttribute('aria-label')).toBe('Barra del grafico');
  });
});

describe('toolbar actions', () => {
  it('runs each control: zoom, fit, today, levels and views', async () => {
    const c = await mount(h => h.zoom.set(ViewMode.Week));
    const toolbar = c.f.debugElement.query(By.directive(GanttToolbarComponent))
      .componentInstance as GanttToolbarComponent;
    const fit = vi.fn();
    toolbar.fit.subscribe(fit);
    const today = vi.spyOn(c.gantt, 'scrollToToday').mockImplementation(() => undefined);

    await c.set(() => c.button('zoom-out').click());
    expect(c.h.zoom()).toBe(ViewMode.Month);
    await c.set(() => c.button('zoom-in').click());
    expect(c.h.zoom()).toBe(ViewMode.Week);
    await c.set(() => c.button('fit').click());
    expect(fit).toHaveBeenCalledOnce();
    await c.set(() => c.button('today').click());
    expect(today).toHaveBeenCalledOnce();
    await c.set(() => c.button('zoom:Day').click());
    expect(c.h.zoom()).toBe(ViewMode.Day);
    // A click on the icon inside a control runs that control
    await c.set(() =>
      c
        .button('view:chart')
        .querySelector('path')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    expect(c.gantt.view()).toBe('chart');
    await c.set(() =>
      c
        .button('today')
        .querySelector('.gantt-tb-label')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    expect(today).toHaveBeenCalledTimes(2);
  });

  // Needs GantryComponent to bind `(fit)="fitToScreen()"` on <gantt-toolbar> (step 4.5's file)
  it('the Fit button runs the chart’s fitToScreen()', async () => {
    const c = await mount();
    const fit = vi.spyOn(c.gantt, 'fitToScreen').mockImplementation(() => undefined);
    await c.set(() => c.button('fit').click());
    expect(fit).toHaveBeenCalledOnce();
  });

  it('checks a radio when it is activated, keeping every control', async () => {
    const c = await mount();
    const before = c.$$('.gantt-toolbar button');
    const week = c.button('zoom:Week');
    await c.set(() => week.click());
    expect(c.h.zoom()).toBe(ViewMode.Week);
    expect(week.getAttribute('aria-checked')).toBe('true');
    expect(c.button('zoom:Month').getAttribute('aria-checked')).toBe('false');
    const table = c.button('view:table');
    await c.set(() => table.click());
    expect(c.gantt.view()).toBe('table');
    expect(table.getAttribute('aria-checked')).toBe('true');
    expect(c.button('view:split').getAttribute('aria-checked')).toBe('false');
    // The API checks the radios too
    await c.set(() => c.gantt.setViewMode(ViewMode.Day));
    expect(c.button('zoom:Day').getAttribute('aria-checked')).toBe('true');
    expect(c.$$('.gantt-toolbar button')).toEqual(before);
  });
});

describe('toolbar keyboard: one roving tab stop (D7)', () => {
  it('has exactly one tab stop, the first control at first', async () => {
    const c = await mount();
    expect(tabStops(c)).toEqual(['zoom-out']);
    expect(c.$$('.gantt-toolbar .gantt-tb-group > button[tabindex="-1"]')).toHaveLength(keys(c).length - 1);
  });

  it('moves focus with ←/→ (wrapping) and Home/End, and the tab stop follows the focus', async () => {
    const c = await mount();
    const first = c.button('zoom-out');
    first.focus();
    expect(key(first, 'ArrowRight')).toBe(true);
    expect(active()).toBe('zoom-in');
    key(c.button('zoom-in'), 'ArrowRight');
    key(c.button('fit'), 'ArrowRight');
    // Into the zoom-level radios: focus moves, the zoom level does not change
    expect(active()).toBe('zoom:Hour');
    await c.f.whenStable();
    expect(c.gantt.viewMode()).toBeUndefined();
    expect(c.button('zoom:Hour').getAttribute('aria-checked')).toBe('false');
    expect(c.button('zoom:Month').getAttribute('aria-checked')).toBe('true');
    expect(tabStops(c)).toEqual(['zoom:Hour']);

    key(c.button('zoom:Hour'), 'End');
    expect(active()).toBe('view:chart');
    await c.f.whenStable();
    expect(c.gantt.view()).toBe('split');
    key(c.button('view:chart'), 'ArrowRight');
    expect(active()).toBe('zoom-out');
    key(c.button('zoom-out'), 'ArrowLeft');
    expect(active()).toBe('view:chart');
    key(c.button('view:chart'), 'Home');
    expect(active()).toBe('zoom-out');
    await c.f.whenStable();
    expect(tabStops(c)).toEqual(['zoom-out']);
  });

  it('leaves other keys to the chart: Enter / Space activate natively, shortcuts still work', async () => {
    const c = await mount();
    const month = c.button('zoom:Month');
    month.focus();
    expect(key(month, 'Enter')).toBe(false);
    expect(key(month, ' ')).toBe(false);
    expect(key(month, 'ArrowDown')).toBe(false);
    expect(key(month, 'ArrowRight', { shiftKey: true })).toBe(false);
    expect(active()).toBe('zoom:Month');
    // The chart's "+" shortcut zooms in from the toolbar too
    key(month, '+');
    await c.f.whenStable();
    expect(c.h.zoom()).toBe(ViewMode.Week);
  });

  it('keeps the focused control as the tab stop across a zoom, and falls back to the first when it goes', async () => {
    const c = await mount();
    const week = c.button('zoom:Week');
    week.focus();
    await c.set(() => week.click());
    expect(active()).toBe('zoom:Week');
    expect(tabStops(c)).toEqual(['zoom:Week']);
    await c.set(() =>
      c.h.options.set({
        initialScroll: false,
        viewMode: ViewMode.Week,
        toolbar: { viewModes: ['Day', 'Month'] },
      }),
    );
    expect(c.$('[data-focus-key="zoom:Week"]')).toBeNull();
    expect(tabStops(c)).toEqual(['zoom-out']);
  });

  it('keeps the tab stop when the toolbar is hidden and shown again', async () => {
    const c = await mount();
    c.button('today').focus();
    await c.set(() => c.h.showToolbar.set(false));
    expect(c.$('.gantt-toolbar')).toBeNull();
    await c.set(() => c.h.showToolbar.set(true));
    expect(tabStops(c)).toEqual(['today']);
  });

  it('swaps the arrows in a right-to-left chart', async () => {
    const c = await mount();
    // The direction the toolbar inherits (read on its host element)
    const toolbar = c.$('gantt-toolbar')!;
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      el => ({ direction: el === toolbar ? 'rtl' : 'ltr' }) as CSSStyleDeclaration,
    );
    const first = c.button('zoom-out');
    first.focus();
    key(first, 'ArrowLeft');
    expect(active()).toBe('zoom-in');
    key(c.button('zoom-in'), 'ArrowRight');
    expect(active()).toBe('zoom-out');
  });

  it('keeps the [ganttToolbar] content out of the roving set', async () => {
    const c = await mount(h => h.slot.set(true));
    const consumer = c.$<HTMLButtonElement>('.gantt-tb-slot > .consumer')!;
    expect(consumer.hasAttribute('tabindex')).toBe(false);
    expect(keys(c)).not.toContain('consumer');
    consumer.focus();
    expect(key(consumer, 'ArrowRight')).toBe(false);
    expect(document.activeElement).toBe(consumer);
    await c.f.whenStable();
    expect(tabStops(c)).toEqual(['zoom-out']);
    // Between Today and the view switch
    const slot = consumer.parentElement!;
    expect(slot.previousElementSibling?.querySelector('[data-focus-key="today"]')).not.toBeNull();
    expect(slot.nextElementSibling?.classList.contains('gantt-tb-views')).toBe(true);
  });
});

describe('toolbar styles', () => {
  it('has 32 px controls, 16 px stroked icons and checked radios in the bar colours', async () => {
    const c = await mount();
    // The density's control size (phase 10, D5): 32 px by default, set on the chart's host
    expect(c.host.style.getPropertyValue('--gantry-control-size')).toBe('32px');
    for (const b of [c.button('zoom-in'), c.button('zoom:Month'), c.button('today'), c.button('view:table')]) {
      expect(cascaded(b, 'min-width')).toBe('var(--gantry-control-size, 32px)');
      expect(cascaded(b, 'min-height')).toBe('var(--gantry-control-size, 32px)');
      expect(cascaded(b, 'box-sizing')).toBe('border-box');
    }
    const checked = c.button('zoom:Month');
    expect(cascaded(checked, 'background')).toBe('var(--gantt-bar)');
    expect(cascaded(checked, 'color')).toBe('var(--gantt-bar-text-on-bar)');
    const icon = c.button('zoom-in').firstElementChild!;
    expect(cascaded(icon, 'fill')).toBe('none');
    expect(cascaded(icon, 'stroke')).toBe('currentColor');
    expect(cascaded(icon, 'display')).toBe('block');
    expect(cascaded(c.button('today'), 'color')).toBe('var(--gantt-today)');
    expect(cascaded(c.button('today').querySelector('.gantt-tb-label')!, 'display')).toBe('block');
    // The slot takes no room while empty
    expect(cascaded(c.$('.gantt-tb-slot')!, 'display')).toBe('none');
  });
});
