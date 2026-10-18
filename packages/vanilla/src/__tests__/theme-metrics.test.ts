// Theme metrics (Gantry 2 phase 6, step 0.4): the resolved config carries no theme. Only the
// metrics (`themeMetrics(theme)`: bar radius, label font size, label colour on explicit bar
// colours) enter the model; custom renderers get the resolved theme from the theme service.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LightTheme, ViewMode, type GanttTask, type GanttTheme } from '@gantry/core';
import { type GantryElement } from '../gantry.element';
import '../index';

const frame = () => new Promise<void>(r => requestAnimationFrame(() => r()));

const TASKS: GanttTask[] = [
  { id: 'plain', name: 'Plain', start: new Date(2026, 0, 5), end: new Date(2026, 0, 16), progress: 50 },
  { id: 'navy', name: 'Navy', start: new Date(2026, 0, 5), end: new Date(2026, 0, 16), barColor: '#1E3A8A' },
];

async function mount(): Promise<GantryElement> {
  const el = document.createElement('gantry-element');
  el.style.height = '400px';
  // Day view: wide bars, so the labels sit inside
  el.options = { viewMode: ViewMode.Day, initialScroll: false };
  el.tasks = TASKS;
  document.body.appendChild(el);
  await frame();
  return el;
}

const part = (el: GantryElement, id: string, sel: string) =>
  el.shadowRoot!.querySelector<SVGElement>(`.gantt-bars-layer [data-task-id="${id}"] ${sel}`)!;

describe('<gantry-element> theme metrics', () => {
  let el: GantryElement;

  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => el?.remove());

  it('takes the label font size and the bar radius from the theme', async () => {
    el = await mount();
    expect(part(el, 'plain', '.gantt-bar-label').getAttribute('font-size')).toBe('12');
    expect(part(el, 'plain', '.gantt-bar-body').getAttribute('d')).toContain('A4,4');

    el.setTheme({ fontSize: '15px', barRadius: '7px' });
    await frame();
    expect(part(el, 'plain', '.gantt-bar-label').getAttribute('font-size')).toBe('14');
    expect(part(el, 'plain', '.gantt-bar-body').getAttribute('d')).toContain('A7,7');
  });

  it('labels an explicit bar colour with the theme barTextColor when it is readable', async () => {
    el = await mount();
    expect(part(el, 'navy', '.gantt-bar-label').style.getPropertyValue('fill')).toBe(LightTheme.barTextColor);
    el.setTheme({ barTextColor: '#FDE047' });
    await frame();
    expect(part(el, 'navy', '.gantt-bar-label').style.getPropertyValue('fill')).toBe('#FDE047');
    // Theme fills keep their contrast token: the theme sheet resolves it
    expect(part(el, 'plain', '.gantt-bar-label').style.getPropertyValue('fill')).toBe('var(--gantt-bar-text-on-bar)');
  });

  it("gives custom renderers the theme service's resolved theme", async () => {
    el = await mount();
    const themes: GanttTheme[] = [];
    el.renderBar = ctx => {
      themes.push(ctx.theme);
      return null;
    };
    await frame();
    expect(themes.at(-1)?.barColor).toBe(LightTheme.barColor);
    el.patchTheme({ barColor: '#0F766E' });
    await frame();
    expect(themes.at(-1)?.barColor).toBe('#0F766E');
    expect(themes.at(-1)?.fontSize).toBe(LightTheme.fontSize);
  });
});
