// Paints (Gantry 2 phase 6, step 0.3): every colour of the Angular painters is a `Paint` from
// @gantryjs/core — a theme token (`var(--gantt-*)`) or an explicit task colour — bound as a CSS
// property, never as a presentation attribute; the theme service writes every token, the
// bar-label contrast tokens included. Task-list text colours are stylesheet rules (phase 7 step 1.2);
// the tooltip lives inside the chart and inherits the tokens (phase 7 step 4.1).
import { describe, it, expect } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  LightTheme,
  TOOLTIP_SHOW_DELAY,
  readableOn,
  resolveTheme,
  themeToCss,
  TaskType,
  type GanttAnnotation,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';

const day = (d: number) => new Date(2026, 0, d);
const TASKS: GanttTask[] = [
  { id: 'light', name: 'Light', start: day(5), end: day(16), progress: 40, barColor: '#FDE68A' },
  { id: 'plain', name: 'Plain', start: day(5), end: day(16), progress: 50, dependency: 'light', rowColor: '#ECFEFF' },
  { id: 'done', name: 'Done', start: day(6), end: day(9), progress: 100, status: 'done' },
  { id: 'm', name: 'Launch', type: TaskType.Milestone, start: day(20), end: day(20) },
];

@Component({
  imports: [GantryComponent],
  template: `<gantry [series]="tasks()" [options]="options()" [annotations]="annotations()" [showLegend]="true" />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(TASKS);
  readonly options = signal<GanttOptions>({
    initialScroll: false,
    viewMode: 'Day',
    nonWorkingTime: { weekends: true, holidays: [{ start: day(14), color: '#FCE7F3' }] },
    panel: { columns: ['name', 'status'] },
  });
  readonly annotations = signal<GanttAnnotation[]>([
    { x1: day(7), isToday: true, label: { text: 'Today-like' } },
    { x1: day(8), label: { text: 'Plain' } },
    { x1: day(9), color: '#8B5CF6', label: { text: 'Purple' } },
  ]);
  readonly gantt = viewChild.required(GantryComponent);
}

async function mount(setup?: (host: Host) => void): Promise<ComponentFixture<Host>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(Host);
  setup?.(fixture.componentInstance);
  await fixture.whenStable();
  return fixture;
}

const $$ = <E extends Element = HTMLElement>(f: ComponentFixture<Host>, sel: string): E[] => [
  ...(f.nativeElement as HTMLElement).querySelectorAll<E>(sel),
];
const $ = <E extends Element = HTMLElement>(f: ComponentFixture<Host>, sel: string): E => {
  const el = $$<E>(f, sel)[0];
  if (!el) throw new Error(`no element for ${sel}`);
  return el;
};
const style = (el: Element, prop: string) => (el as SVGElement | HTMLElement).style.getPropertyValue(prop);
const bar = (f: ComponentFixture<Host>, id: string, part: string) =>
  $<SVGElement>(f, `.gantt-bars-layer [data-task-id="${id}"] ${part}`);

describe('Angular paints', () => {
  it('paints the label of a light explicit barColor with the dark readable colour', async () => {
    const f = await mount();
    const label = bar(f, 'light', '.gantt-bar-label');
    expect(label.getAttribute('class')).toBe('gantt-bar-label');
    // the test DOM normalises the colour; a browser keeps '#0F172A' in the declaration
    expect(['#0F172A', 'rgb(15, 23, 42)']).toContain(label.style.fill);
    expect(label.hasAttribute('fill')).toBe(false);
    expect(label.hasAttribute('font-family')).toBe(false);
  });

  it('binds bar, arrow and body paints as CSS properties (theme tokens or explicit colours)', async () => {
    const f = await mount();
    expect(style(bar(f, 'plain', '.gantt-bar-body'), 'fill')).toBe('var(--gantt-bar)');
    expect(style(bar(f, 'plain', '.gantt-bar-label'), 'fill')).toBe('var(--gantt-bar-text-on-bar)');
    expect(style(bar(f, 'm', '.gantt-bar-body'), 'fill')).toBe('var(--gantt-milestone)');
    expect(['#FDE68A', 'rgb(253, 230, 138)']).toContain(style(bar(f, 'light', '.gantt-bar-body'), 'fill'));

    const arrow = $<SVGElement>(f, '.gantt-arrows path');
    expect(style(arrow, 'stroke')).toBe('var(--gantt-arrow)');
    expect(style($<SVGElement>(f, '.gantt-arrows polygon'), 'fill')).toBe('var(--gantt-arrow)');

    const bands = $$<SVGElement>(f, '.gantt-bands rect').map(r => style(r, 'fill'));
    expect(bands).toContain('var(--gantt-weekend-bg)');
    expect(bands.some(b => b === '#FCE7F3' || b === 'rgb(252, 231, 243)')).toBe(true);
    expect(style($<SVGElement>(f, '.gantt-grid line'), 'stroke')).toMatch(/^var\(--gantt-/);

    // Annotations: `isToday` keeps the today colour, no colour → the arrow token, explicit colour as is
    const lines = $$<SVGElement>(f, '.gantt-annotations line').map(l => style(l, 'stroke'));
    expect(lines.slice(0, 2)).toEqual(['var(--gantt-today)', 'var(--gantt-arrow)']);
    expect(['#8B5CF6', 'rgb(139, 92, 246)']).toContain(lines[2]);

    // No colour presentation attribute is left in the chart
    const colourAttrs = $$<Element>(f, 'gantry [fill], gantry [stroke]').flatMap(el =>
      ['fill', 'stroke']
        .map(a => el.getAttribute(a))
        .filter((v): v is string => v !== null && v !== 'none' && v !== 'currentColor' && !v.startsWith('url(')),
    );
    expect(colourAttrs).toEqual([]);
  });

  it('paints critical bars with the critical tokens, and the selection outline', async () => {
    const f = await mount(h => {
      h.tasks.set([
        { id: 'a', name: 'A', start: day(5), end: day(12) },
        { id: 'b', name: 'B', start: day(12), end: day(20), dependency: 'a' },
      ]);
      h.options.update(o => ({ ...o, criticalPath: true }));
    });
    expect($(f, '.gantt-bars-layer [data-task-id="b"]').getAttribute('aria-label')).toContain('critical');
    expect(style(bar(f, 'b', '.gantt-bar-body'), 'fill')).toBe('var(--gantt-critical)');
    expect(style(bar(f, 'b', '.gantt-bar-label'), 'fill')).toBe('var(--gantt-bar-text-on-critical)');
    expect(style($<SVGElement>(f, '.gantt-arrows path'), 'stroke')).toBe('var(--gantt-critical)');
    expect(style(bar(f, 'b', '.gantt-bar-body'), 'stroke')).toBe('');

    f.componentInstance.gantt().setSelectedTasks(['b']);
    await f.whenStable();
    expect(style(bar(f, 'b', '.gantt-bar-body'), 'stroke')).toBe('var(--gantt-sel-border)');
  });

  it('writes every theme token, the contrast tokens included, on the host', async () => {
    const f = await mount();
    const host = $(f, 'gantry');
    for (const [cssVar, value] of themeToCss(resolveTheme(false))) {
      expect(host.style.getPropertyValue(cssVar), cssVar).toBe(value);
    }
    f.componentInstance.gantt().setTheme({ barColor: '#FDE68A' });
    await f.whenStable();
    expect(host.style.getPropertyValue('--gantt-bar-text-on-bar')).toBe(readableOn('#FDE68A', LightTheme.barTextColor));
    expect(host.style.getPropertyValue('--gantt-bar-text-on-bar')).toBe('#0F172A');
  });

  it('shares row paints between the timeline and the task list; status dots use the status tokens', async () => {
    const f = await mount();
    // Canvas rows and task-list rows are in the same (visible) order
    const ids = $$(f, '.gantt-tl-row').map(r => r.getAttribute('data-task-id'));
    const rows = $$<SVGElement>(f, '.gantt-rows rect').map(r => style(r, 'fill'));
    const tlRows = $$(f, '.gantt-tl-row').map(r => r.style.backgroundColor);
    expect(rows).toEqual(tlRows);
    expect(['#ECFEFF', 'rgb(236, 254, 255)']).toContain(rows[ids.indexOf('plain')]);
    const zebra = rows.filter((_, i) => ids[i] !== 'plain');
    expect(new Set(zebra)).toEqual(new Set(['var(--gantt-row-bg)', 'var(--gantt-row-bg-alt)']));

    f.componentInstance.gantt().setSelectedTasks(['plain']);
    await f.whenStable();
    const i = ids.indexOf('plain');
    expect(style($$<SVGElement>(f, '.gantt-rows rect')[i], 'fill')).toBe('var(--gantt-sel-bg)');
    expect($$(f, '.gantt-tl-row')[i].style.backgroundColor).toBe('var(--gantt-sel-bg)');

    const dot = $(f, '.gantt-tl-row[data-task-id="done"] .gantt-tl-status-dot');
    expect(dot.style.backgroundColor).toBe('var(--gantt-status-done, var(--gantt-text-muted))');
  });

  it("takes the task-list text colours from the stylesheet: a task's barColor is the only inline one", async () => {
    const f = await mount();
    // Text colours of labels, names, cells and icons are stylesheet rules on the --gantt-* tokens
    const inline = $$(f, '.gantt-tasklist *')
      .filter(el => el.style.color !== '')
      .map(el => `${el.closest('[data-task-id]')?.getAttribute('data-task-id') ?? ''} ${el.className}`);
    expect(inline).toEqual(['light gantt-tl-icon']);
    const icon = $(f, '.gantt-tl-row[data-task-id="light"] .gantt-tl-icon');
    expect(['#FDE68A', 'rgb(253, 230, 138)']).toContain(icon.style.color);
    expect($(f, '.gantt-tl-row[data-task-id="plain"] .gantt-tl-icon').style.color).toBe('');
  });

  it('draws header borders from core and header bands with their paints', async () => {
    const f = await mount(h =>
      h.options.update(o => ({ ...o, nonWorkingTime: { ...o.nonWorkingTime, showInHeader: true } })),
    );
    // the test DOM expands a `var()` inside the `border-left` shorthand oddly: check the declaration text.
    // Upper tiers are period delimiters (major paint); the first cell has no border.
    const upper = [...$$(f, '.g-tier')[0].querySelectorAll<HTMLElement>('.g-cell')];
    expect(upper.length).toBeGreaterThan(1);
    for (const c of upper) {
      if (parseFloat(c.style.left) <= 0) expect(c.style.cssText).not.toContain('var(');
      else expect(c.style.cssText).toContain('var(--gantt-grid-line-major)');
    }
    const bottom = [...$$(f, '.g-tier').at(-1)!.querySelectorAll<HTMLElement>('.g-cell')];
    expect(bottom.some(c => c.style.cssText.includes('var(--gantt-border)'))).toBe(true);
    expect(bottom.some(c => c.style.cssText.includes('#'))).toBe(false);
    expect($$(f, '.g-band').map(b => b.style.backgroundColor)).toContain('var(--gantt-weekend-bg)');
  });

  it('paints legend swatches with the legend item paints', async () => {
    const f = await mount();
    const strokes = $$<SVGElement>(f, '.gantt-legend-swatch line').map(l => style(l, 'stroke'));
    // The legend matches the lines: `isToday` → the today colour, no colour → the arrow token
    expect(strokes.slice(-3, -1)).toEqual(['var(--gantt-today)', 'var(--gantt-arrow)']);
    expect(['#8B5CF6', 'rgb(139, 92, 246)']).toContain(strokes.at(-1));
  });

  it('paints the tooltip with the chart tokens (inherited, not copied) and its progress with paint.progress', async () => {
    const f = await mount();
    const host = $(f, 'gantry');
    const show = async (id: string, name: string) => {
      bar(f, id, '.gantt-bar-body').dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }),
      );
      await new Promise(r => setTimeout(r, TOOLTIP_SHOW_DELAY + 80));
      await f.whenStable();
      const tip = $(f, '.gantt-tooltip');
      expect(tip.querySelector('.gantt-tooltip-title')?.textContent).toBe(name);
      return tip;
    };
    const light = await show('light', 'Light');
    // Inside the chart: the chrome reads the host's tokens through the stylesheet
    expect(light.closest('gantry')).toBe(host);
    expect(host.style.getPropertyValue('--gantt-tooltip-bg')).toBe(LightTheme.tooltipBg);
    expect(light.style.getPropertyValue('--gantt-tooltip-bg')).toBe('');
    expect(light.style.getPropertyValue('--gantt-bar')).toBe('');
    expect(light.style.background).toBe('');
    expect(light.style.color).toBe('');
    const fill = light.querySelector<HTMLElement>('.gantt-tooltip-fill');
    expect(['#FDE68A', 'rgb(253, 230, 138)']).toContain(fill?.style.backgroundColor);
    // The same popover shows the next bar
    const plain = await show('plain', 'Plain');
    expect(plain).toBe(light);
    expect(plain.querySelector<HTMLElement>('.gantt-tooltip-fill')?.style.backgroundColor).toBe('var(--gantt-bar)');
  });
});
