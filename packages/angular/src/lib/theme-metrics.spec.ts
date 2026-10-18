// Theme metrics (Gantry 2 phase 6, step 0.4): the resolved config carries no theme. Only the
// metrics (`themeMetrics(theme)`: bar radius, label font size, label colour on explicit bar
// colours) enter the model, so a colour-only theme change keeps the config.
import { describe, it, expect } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { LightTheme, type ResolvedGanttConfig, type GanttOptions, type GanttTask } from '@gantry/core';
import { GantryComponent } from './gantt-component/gantry.component';

const day = (d: number) => new Date(2026, 0, d);
const TASKS: GanttTask[] = [
  { id: 'plain', name: 'Plain', start: day(5), end: day(16), progress: 50 },
  { id: 'navy', name: 'Navy', start: day(5), end: day(16), barColor: '#1E3A8A' },
];

@Component({
  imports: [GantryComponent],
  template: `<gantry [series]="tasks" [options]="options()" />`,
})
class Host {
  readonly tasks = TASKS;
  readonly options = signal<GanttOptions>({ initialScroll: false, viewMode: 'Day' });
  readonly gantt = viewChild.required(GantryComponent);
}

async function mount(): Promise<ComponentFixture<Host>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  return fixture;
}

const part = (f: ComponentFixture<Host>, id: string, sel: string): SVGElement => {
  const el = (f.nativeElement as HTMLElement).querySelector<SVGElement>(
    `.gantt-bars-layer [data-task-id="${id}"] ${sel}`,
  );
  if (!el) throw new Error(`no ${sel} for ${id}`);
  return el;
};
/** The chart's resolved config (protected: read for the test only) */
const configOf = (f: ComponentFixture<Host>) =>
  (f.componentInstance.gantt() as unknown as { cfg: () => ResolvedGanttConfig }).cfg();

describe('Angular theme metrics', () => {
  it('takes the label font size and the bar radius from the theme', async () => {
    const f = await mount();
    expect(part(f, 'plain', '.gantt-bar-label').getAttribute('font-size')).toBe('12');
    expect(part(f, 'plain', '.gantt-bar-body').getAttribute('d')).toContain('A4,4');

    f.componentInstance.gantt().setTheme({ fontSize: '15px', barRadius: '7px' });
    await f.whenStable();
    expect(part(f, 'plain', '.gantt-bar-label').getAttribute('font-size')).toBe('14');
    expect(part(f, 'plain', '.gantt-bar-body').getAttribute('d')).toContain('A7,7');
  });

  it('labels an explicit bar colour with the theme barTextColor when it is readable', async () => {
    const f = await mount();
    // the test DOM normalises colours; a browser keeps the hex value in the declaration
    expect(['#FFFFFF', 'rgb(255, 255, 255)']).toContain(part(f, 'navy', '.gantt-bar-label').style.fill);
    f.componentInstance.gantt().setTheme({ barTextColor: '#FDE047' });
    await f.whenStable();
    expect(['#FDE047', 'rgb(253, 224, 71)']).toContain(part(f, 'navy', '.gantt-bar-label').style.fill);
  });

  it('keeps the resolved config on a colour-only theme change, and has no theme in it', async () => {
    const f = await mount();
    const before = configOf(f);
    expect('theme' in before).toBe(false);
    expect(before.bar.radius).toBe(4);

    f.componentInstance.gantt().setTheme({ barColor: '#0F766E', rowBg: '#F0FDFA' });
    await f.whenStable();
    expect(configOf(f)).toBe(before);
    expect(part(f, 'plain', '.gantt-bar-body').style.getPropertyValue('fill')).toBe('var(--gantt-bar)');

    f.componentInstance.gantt().setTheme({ barRadius: '2px' });
    await f.whenStable();
    expect(configOf(f)).not.toBe(before);
    expect(configOf(f).bar.radius).toBe(2);
    expect(LightTheme.barRadius).toBe('4px');
  });
});
