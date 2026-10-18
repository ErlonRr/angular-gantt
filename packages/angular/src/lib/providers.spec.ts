// Providers (Gantry 2 phase 7, step 2.1): built-in bars without a provider, the per-chart bar
// registry resolving `provideGanttBar` along application → route → component injectors, and
// `provideGantt` configs merged per level (`withBars`).
import { afterEach, describe, it, expect } from 'vitest';
import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  EnvironmentInjector,
  createComponent,
  createEnvironmentInjector,
  getDebugNode,
  provideZonelessChangeDetection,
  type ComponentRef,
  type Provider,
  type EnvironmentProviders,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttCanvasComponent } from './layout/gantt-canvas.component';
import { GanttBarBase, GanttBarRegistry, provideGanttBar } from './bar-registry';
import { GANTT_GLOBAL_CONFIG, mergeGanttConfig, provideGantt, withBars } from './provide';
import { GanttI18nService } from './services/gantt-i18n.service';
import { GanttThemeService } from './services/gantt-theme.service';
import { TaskType, ViewMode, type GanttTask } from '@gantry/core';

const day = (d: number) => new Date(2026, 0, d);
const TASKS: GanttTask[] = [
  { id: 'g', name: 'Group', type: TaskType.Group, start: day(5), end: day(20) },
  { id: 't', name: 'Task', parentId: 'g', start: day(5), end: day(12) },
  { id: 'm', name: 'Milestone', type: TaskType.Milestone, start: day(14), end: day(14) },
  { id: 'e', name: 'Epic', barType: 'epic', start: day(6), end: day(16) },
  { id: 's', name: 'Sprint', barType: 'sprint', start: day(8), end: day(18) },
];
const OPTIONS = { initialScroll: false } as const;

// ── Custom bars: each marks its host with its own name ──────────────────
const BAR_HOST = { '[attr.data-task-id]': 'ctx().row.task.id', '[attr.data-bar-type]': 'ctx().row.barType' };
@Component({
  selector: 'g[testBarA]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { ...BAR_HOST, '[attr.data-bar]': "'A'" },
  template: '<svg:rect class="test-bar" />',
})
class BarA extends GanttBarBase {}
@Component({
  selector: 'g[testBarB]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { ...BAR_HOST, '[attr.data-bar]': "'B'" },
  template: '<svg:rect class="test-bar" />',
})
class BarB extends GanttBarBase {}
@Component({
  selector: 'g[testBarC]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { ...BAR_HOST, '[attr.data-bar]': "'C'" },
  template: '<svg:rect class="test-bar" />',
})
class BarC extends GanttBarBase {}

// ── Hosts ────────────────────────────────────────────────────────────────
@Component({
  selector: 'test-chart',
  imports: [GantryComponent],
  template: `<gantry [series]="tasks" [options]="options" />`,
})
class Chart {
  readonly tasks = TASKS;
  readonly options = OPTIONS;
}

/** A page that provides its own bars (component level) */
@Component({
  selector: 'test-bar-page',
  imports: [GantryComponent],
  providers: [provideGanttBar({ type: 'epic', component: BarB }, { type: 'sprint', component: BarC })],
  template: `<gantry class="inside" [series]="tasks" [options]="options" />`,
})
class BarPage {
  readonly tasks = TASKS;
  readonly options = OPTIONS;
}

/** A page that provides its own config and bars through `provideGantt(…, withBars(…))` */
@Component({
  selector: 'test-config-page',
  imports: [GantryComponent],
  providers: [provideGantt({ labels: { legend: 'Legenda' } }, withBars({ type: 'epic', component: BarA }))],
  template: `<gantry class="inside" [series]="tasks" [options]="options" />`,
})
class ConfigPage {
  readonly tasks = TASKS;
  readonly options = OPTIONS;
}

@Component({
  imports: [GantryComponent, BarPage],
  template: `<test-bar-page /><gantry class="outside" [series]="tasks" [options]="options" />`,
})
class BarHost {
  readonly tasks = TASKS;
  readonly options = OPTIONS;
}

@Component({
  imports: [GantryComponent, ConfigPage],
  template: `<test-config-page /><gantry class="outside" [series]="tasks" [options]="options" />`,
})
class ConfigHost {
  readonly tasks = TASKS;
  readonly options = OPTIONS;
}

async function mount<T>(
  host: new () => T,
  providers: (Provider | EnvironmentProviders)[] = [],
): Promise<ComponentFixture<T>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), ...providers] });
  const fixture = TestBed.createComponent(host);
  await fixture.whenStable();
  return fixture;
}

/** `{ id → 'A' | 'B' | 'C' | 'task' | 'milestone' | 'group' }` for the bars inside `root` */
function barsIn(root: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const el of root.querySelectorAll('.gantt-bars-layer [data-task-id]')) {
    const builtin = el.querySelector(':scope > path.gantt-bar-body') ? el.getAttribute('data-bar-type') : null;
    out[el.getAttribute('data-task-id') ?? '?'] = el.getAttribute('data-bar') ?? `builtin:${builtin}`;
  }
  return out;
}
const chartEl = (f: ComponentFixture<unknown>, sel: string): Element => {
  const el = (f.nativeElement as HTMLElement).querySelector(sel);
  if (!el) throw new Error(`no ${sel}`);
  return el;
};

describe('built-in bars', () => {
  it('render task, milestone and group bars with no provider at all', async () => {
    const f = await mount(Chart);
    expect(barsIn(f.nativeElement as HTMLElement)).toEqual({
      g: 'builtin:group',
      t: 'builtin:task',
      m: 'builtin:milestone',
      // Unknown bar types fall back to the task bar (data-bar-type keeps the row's type)
      e: 'builtin:epic',
      s: 'builtin:sprint',
    });
  });
});

describe('provideGanttBar along the injector hierarchy', () => {
  it('a component level wins inside it; a sibling chart outside gets the root bars and the task fallback', async () => {
    const f = await mount(BarHost, [provideGanttBar({ type: 'epic', component: BarA })]);
    const inside = barsIn(chartEl(f, 'gantry.inside'));
    const outside = barsIn(chartEl(f, 'gantry.outside'));
    expect(inside).toEqual({ g: 'builtin:group', t: 'builtin:task', m: 'builtin:milestone', e: 'B', s: 'C' });
    expect(outside).toEqual({
      g: 'builtin:group',
      t: 'builtin:task',
      m: 'builtin:milestone',
      e: 'A',
      s: 'builtin:sprint',
    });
  });

  it('two charts on one page have independent registries', async () => {
    const f = await mount(BarHost, [provideGanttBar({ type: 'epic', component: BarA })]);
    const [a, b] = f.debugElement
      .queryAll(By.directive(GanttCanvasComponent))
      .map(de => de.injector.get(GanttBarRegistry));
    expect(a).toBeInstanceOf(GanttBarRegistry);
    expect(b).toBeInstanceOf(GanttBarRegistry);
    expect(a).not.toBe(b);
    expect(a?.resolve('sprint')).toBe(BarC);
    expect(b?.resolve('sprint')).not.toBe(BarC);
    expect(b?.has('sprint')).toBe(false);
    // The registry belongs to the chart: nothing is provided in root
    expect(TestBed.inject(GanttBarRegistry, null)).toBeNull();
  });

  it('a nested component level overrides the level above it and keeps its other types', async () => {
    @Component({
      selector: 'test-inner',
      imports: [GantryComponent],
      providers: [provideGanttBar({ type: 'sprint', component: BarA })],
      template: `<gantry class="inner" [series]="tasks" [options]="options" />`,
    })
    class Inner {
      readonly tasks = TASKS;
      readonly options = OPTIONS;
    }
    @Component({
      selector: 'test-outer',
      imports: [Inner],
      providers: [provideGanttBar({ type: 'epic', component: BarB }, { type: 'sprint', component: BarC })],
      template: `<test-inner />`,
    })
    class Outer {}
    @Component({ imports: [Outer], template: `<test-outer />` })
    class Host {}

    const f = await mount(Host);
    expect(barsIn(chartEl(f, 'gantry.inner'))).toMatchObject({ e: 'B', s: 'A', t: 'builtin:task' });
  });

  describe('a route-like EnvironmentInjector', () => {
    const cleanup: (() => void)[] = [];
    afterEach(() => {
      for (const fn of cleanup.splice(0).reverse()) fn();
    });

    function child(providers: Provider[], parent: EnvironmentInjector): EnvironmentInjector {
      const env = createEnvironmentInjector(providers, parent);
      cleanup.push(() => env.destroy());
      return env;
    }

    async function create(env: EnvironmentInjector): Promise<HTMLElement> {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const ref: ComponentRef<Chart> = createComponent(Chart, { environmentInjector: env, hostElement: el });
      const appRef = TestBed.inject(ApplicationRef);
      appRef.attachView(ref.hostView);
      cleanup.push(() => {
        ref.destroy();
        el.remove();
      });
      await appRef.whenStable();
      return el;
    }

    const i18nOf = (el: HTMLElement) => getDebugNode(el.querySelector('gantry'))?.injector.get(GanttI18nService);

    it('resolves the bars and the config of the injector that created the host component', async () => {
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          provideGantt({ locale: 'it' }),
          provideGanttBar({ type: 'epic', component: BarA }),
        ],
      });
      const root = TestBed.inject(EnvironmentInjector);
      const route = child(
        provideGantt({ labels: { legend: 'Legenda' } }, withBars({ type: 'sprint', component: BarC })),
        root,
      );
      const routed = await create(route);
      const plain = await create(root);
      // The route level adds sprint; epic still comes from the application level
      expect(barsIn(routed)).toMatchObject({ e: 'A', s: 'C', t: 'builtin:task' });
      expect(barsIn(plain)).toMatchObject({ e: 'A', s: 'builtin:sprint' });
      expect(i18nOf(routed)?.locale()).toBe('it');
      expect(i18nOf(routed)?.labels().legend).toBe('Legenda');
      expect(i18nOf(plain)?.labels().legend).toBe('Legend');

      // A level below the route wins over both
      const nested = child(provideGanttBar({ type: 'epic', component: BarB }), route);
      const deep = await create(nested);
      expect(barsIn(deep)).toMatchObject({ e: 'B', s: 'C' });
      expect(i18nOf(deep)?.labels().legend).toBe('Legenda');
    });
  });
});

describe('provideGantt config merged along the injector hierarchy', () => {
  it('merges labels per key, inherits the locale and registers withBars at the component level', async () => {
    const f = await mount(ConfigHost, [provideGantt({ locale: 'it', labels: { today: 'Oggi' } })]);
    const [inside, outside] = f.debugElement
      .queryAll(By.directive(GantryComponent))
      .map(de => de.injector.get(GanttI18nService));
    expect(inside?.locale()).toBe('it');
    expect(inside?.labels().today).toBe('Oggi');
    expect(inside?.labels().legend).toBe('Legenda');
    expect(outside?.locale()).toBe('it');
    expect(outside?.labels().today).toBe('Oggi');
    expect(outside?.labels().legend).toBe('Legend');

    expect(barsIn(chartEl(f, 'gantry.inside'))).toMatchObject({ e: 'A' });
    expect(barsIn(chartEl(f, 'gantry.outside'))).toMatchObject({ e: 'builtin:epic' });
  });

  it('the global darkMode and theme reach the chart; the nearest level wins', async () => {
    @Component({
      selector: 'test-dark-page',
      imports: [GantryComponent],
      providers: [provideGantt({ darkMode: true, theme: { todayColor: '#00AA00' } })],
      template: `<gantry class="inside" [series]="tasks" [options]="options" />`,
    })
    class DarkPage {
      readonly tasks = TASKS;
      readonly options = OPTIONS;
    }
    @Component({
      imports: [GantryComponent, DarkPage],
      template: `<test-dark-page /><gantry class="outside" [series]="tasks" [options]="options" />`,
    })
    class Host {
      readonly tasks = TASKS;
      readonly options = OPTIONS;
    }
    const f = await mount(Host, [provideGantt({ theme: { todayColor: '#AA0000', barColor: '#123456' } })]);
    const [inside, outside] = f.debugElement
      .queryAll(By.directive(GantryComponent))
      .map(de => de.injector.get(GanttThemeService));
    expect(inside?.isDark()).toBe(true);
    expect(inside?.token('todayColor')).toBe('#00AA00');
    expect(inside?.token('barColor')).toBe('#123456');
    expect(outside?.isDark()).toBe(false);
    expect(outside?.token('todayColor')).toBe('#AA0000');
    expect(chartEl(f, 'gantry.inside').classList).toContain('gantry-dark');
  });

  it('two provideGantt at the same level: the last one wins', async () => {
    await mount(Chart, [provideGantt({ locale: 'fr' }), provideGantt({ locale: 'de' })]);
    expect(TestBed.inject(GANTT_GLOBAL_CONFIG).locale).toBe('de');
  });

  it('mergeGanttConfig merges theme, labels (viewModes too) and formats (header too) per key', () => {
    const top = () => 'T';
    const bottom = () => 'B';
    const merged = mergeGanttConfig(
      {
        locale: 'it',
        darkMode: 'auto',
        theme: { todayColor: '#111111', barColor: '#222222' },
        labels: { today: 'Oggi', viewModes: { [ViewMode.Day]: 'Giorno', [ViewMode.Week]: 'Settimana' } },
        formats: { dateFormat: 'D MMM', header: { [ViewMode.Day]: { top } } },
      },
      {
        theme: { barColor: '#333333' },
        labels: { legend: 'Legenda', viewModes: { [ViewMode.Week]: 'Sett.' } },
        formats: { header: { [ViewMode.Week]: { bottom } } },
      },
    );
    expect(merged).toEqual({
      locale: 'it',
      darkMode: 'auto',
      theme: { todayColor: '#111111', barColor: '#333333' },
      labels: { today: 'Oggi', legend: 'Legenda', viewModes: { [ViewMode.Day]: 'Giorno', [ViewMode.Week]: 'Sett.' } },
      formats: { dateFormat: 'D MMM', header: { [ViewMode.Day]: { top }, [ViewMode.Week]: { bottom } } },
    });
    // A level that sets nothing keeps the parent's values; scalars are replaced
    expect(mergeGanttConfig({ locale: 'it' }, {})).toEqual({ locale: 'it' });
    expect(mergeGanttConfig({ locale: 'it', darkMode: true }, { darkMode: false })).toEqual({
      locale: 'it',
      darkMode: false,
    });
  });

  it('provideGanttBar rejects a definition without a type or a component', () => {
    expect(() => provideGanttBar({ type: '', component: BarA })).toThrow(/type.*component/);
  });
});
