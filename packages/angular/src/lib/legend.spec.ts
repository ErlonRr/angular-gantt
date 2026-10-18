// The legend (Gantry 2 phase 9, step 4.7): placed by core `legendPlacement()` (D9, §3c) — an in-flow
// strip after `.gantry-main` by default, the toolbar's last child with `legend.position: 'toolbar'`
// (back to the strip while the toolbar is hidden), attached only while there is something to show
// and never in the table view (D27); the Web Component's markup and strip styles.
import { describe, it, expect } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ViewMode, type GanttAnnotation, type GanttOptions, type GanttTask } from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';

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

const FREEZE: GanttAnnotation[] = [{ x1: new Date(2026, 2, 5), label: { text: 'Freeze' } }];
const BASE: GanttOptions = { initialScroll: false, viewMode: ViewMode.Month, showToday: false, criticalPath: true };

@Component({
  imports: [GantryComponent],
  template: `<gantry
    style="height: 400px"
    [series]="tasks"
    [options]="options()"
    [annotations]="annotations()"
    [showLegend]="showLegend()"
    [showToolbar]="showToolbar()"
  />`,
})
class Host {
  readonly tasks = plan(3);
  readonly options = signal<GanttOptions>(BASE);
  readonly annotations = signal<GanttAnnotation[]>(FREEZE);
  readonly showLegend = signal(true);
  readonly showToolbar = signal(true);
  readonly gantt = viewChild.required(GantryComponent);
}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  host: HTMLElement;
  gantt: GantryComponent;
  set(change: () => void): Promise<void>;
  $(sel: string): HTMLElement | null;
  $$(sel: string): HTMLElement[];
}

async function mount(setup?: (host: Host) => void): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  setup?.(f.componentInstance);
  await f.whenStable();
  const host = f.debugElement.query(By.directive(GantryComponent)).nativeElement as HTMLElement;
  return {
    f,
    h: f.componentInstance,
    host,
    gantt: f.componentInstance.gantt(),
    async set(change) {
      change();
      await f.whenStable();
    },
    $: sel => host.querySelector<HTMLElement>(sel),
    $$: sel => [...host.querySelectorAll<HTMLElement>(sel)],
  };
}

const childClasses = (node: Element) => [...node.children].map(c => c.getAttribute('class'));

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

describe('legend placement (D9)', () => {
  it("is an in-flow strip after the panes by default ('bottom')", async () => {
    const c = await mount();
    const legend = c.$('.gantt-legend')!;
    expect(legend.parentElement).toBe(c.host);
    expect(legend.previousElementSibling?.classList.contains('gantry-main')).toBe(true);
    expect(legend.getAttribute('class')).toBe('gantt-legend gantt-legend--bottom');
    expect(childClasses(legend)).toEqual(['gantt-legend-title', 'gantt-legend-item', 'gantt-legend-item']);
    expect(legend.firstElementChild!.textContent).toBe('Legend');
    expect(c.$$('.gantt-legend-item').map(i => i.textContent?.trim())).toEqual(['Freeze', 'Critical path']);
    expect(c.$$('.gantt-legend')).toHaveLength(1);
  });

  it('is attached only while shown: off, nothing to explain, the table view (D27)', async () => {
    const c = await mount(h => h.showLegend.set(false));
    expect(c.$('.gantt-legend')).toBeNull();

    await c.set(() => c.h.showLegend.set(true));
    expect(c.$('.gantt-legend')).not.toBeNull();

    await c.set(() => c.gantt.setView('table'));
    expect(c.$('.gantt-legend')).toBeNull();
    await c.set(() => c.gantt.setView('chart'));
    expect(c.$('.gantt-legend--bottom')).not.toBeNull();

    // No entry left: nothing to explain
    await c.set(() => {
      c.h.annotations.set([]);
      c.h.options.set({ ...BASE, criticalPath: false });
    });
    expect(c.$('.gantt-legend')).toBeNull();
  });

  it("joins the end of the toolbar with legend.position 'toolbar', after the slot and the view switch", async () => {
    const c = await mount(h => h.options.set({ ...BASE, legend: { position: 'toolbar' } }));
    const bar = c.$('.gantt-toolbar')!;
    const legend = c.$('.gantt-legend')!;
    expect(legend.parentElement).toBe(bar);
    expect(bar.lastElementChild).toBe(legend);
    expect(legend.getAttribute('class')).toBe('gantt-legend gantt-legend--toolbar');
    expect(childClasses(bar)).toEqual([
      'gantt-tb-group',
      'gantt-tb-group gantt-tb-pills',
      'gantt-tb-group',
      'gantt-tb-slot gantt-tb-group',
      'gantt-tb-group gantt-tb-pills gantt-tb-views',
      'gantt-legend gantt-legend--toolbar',
    ]);
    expect(c.$('.gantt-legend--bottom')).toBeNull();
    // Not a toolbar control: outside the roving set, no tab stop of its own
    expect(legend.querySelector('button, [tabindex]')).toBeNull();
    expect(c.$$('.gantt-legend-item').map(i => i.textContent?.trim())).toEqual(['Freeze', 'Critical path']);

    // The toolbar hidden: back to the strip; shown again: back into the toolbar
    await c.set(() => c.h.showToolbar.set(false));
    expect(c.$('.gantt-legend')!.getAttribute('class')).toBe('gantt-legend gantt-legend--bottom');
    expect(c.$('.gantt-legend')!.previousElementSibling?.classList.contains('gantry-main')).toBe(true);
    await c.set(() => c.h.showToolbar.set(true));
    expect(c.$('.gantt-toolbar')!.lastElementChild?.getAttribute('class')).toBe('gantt-legend gantt-legend--toolbar');

    // toolbar: false hides the toolbar too
    await c.set(() => c.h.options.set({ ...BASE, legend: { position: 'toolbar' }, toolbar: false }));
    expect(c.$('.gantt-legend')!.getAttribute('class')).toBe('gantt-legend gantt-legend--bottom');
    expect(c.$$('.gantt-legend')).toHaveLength(1);
  });
});

describe('legend styles', () => {
  it('styles the strip in flow: a top border, the header background, no shadow or absolute position', async () => {
    const c = await mount();
    const legend = c.$('.gantt-legend')!;
    expect(cascaded(legend, 'border-top')).toBe('1px solid var(--gantt-border)');
    expect(cascaded(legend, 'background')).toBe('var(--gantt-header-bg)');
    expect(cascaded(legend, 'display')).toBe('flex');
    expect(cascaded(legend, 'flex')).toBe('none');
    expect(cascaded(legend, 'position')).toBe('');
    expect(cascaded(legend, 'box-shadow')).toBe('');
    expect(cascaded(legend, 'border-radius')).toBe('');
    expect(cascaded(legend, 'pointer-events')).toBe('');
  });

  it('sits at the far end of the toolbar, after a divider', async () => {
    const c = await mount(h => h.options.set({ ...BASE, legend: { position: 'toolbar' } }));
    const legend = c.$('.gantt-legend')!;
    expect(cascaded(legend, 'border-top')).toBe('');
    expect(cascaded(legend, 'border-left')).toBe('1px solid var(--gantt-border)');
    // After the view switch (itself pushed to the end): no extra margin
    expect(cascaded(legend, 'margin-left')).toBe('0');
    await c.set(() => c.h.options.set({ ...BASE, legend: { position: 'toolbar' }, toolbar: { viewToggle: false } }));
    expect(cascaded(c.$('.gantt-legend')!, 'margin-left')).toBe('auto');
    expect(cascaded(c.$('.gantt-legend')!, 'border-left')).toBe('1px solid var(--gantt-border)');
    // No built-in control: no divider (the empty [ganttToolbar] slot is no group to divide from)
    await c.set(() =>
      c.h.options.set({
        ...BASE,
        legend: { position: 'toolbar' },
        toolbar: { zoom: false, fit: false, viewModes: false, today: false, viewToggle: false },
      }),
    );
    expect(c.$('.gantt-toolbar')!.lastElementChild?.getAttribute('class')).toBe('gantt-legend gantt-legend--toolbar');
    expect(cascaded(c.$('.gantt-legend')!, 'border-left')).toBe('');
    expect(cascaded(c.$('.gantt-legend')!, 'margin-left')).toBe('auto');
  });
});
