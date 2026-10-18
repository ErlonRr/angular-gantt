// State as field initializers (Gantry 2 phase 7, step 1.1): `[(viewMode)]` / `viewModeChange`, UI
// state seeded by the consumer and changed by the user (linkedSignal resets), dark-mode precedence,
// the theme as a host `[style]` binding and column directives read through a content query.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  DarkTheme,
  LightTheme,
  resolveTheme,
  themeToCss,
  zoomStep,
  DEFAULT_ZOOM_LEVELS,
  type ResolvedGanttConfig,
  TaskType,
  type GanttOptions,
  type GanttState,
  type GanttTask,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttColumnDefDirective } from './columns/gantt-column.directive';
import { GanttColumnService } from './columns/gantt-column.service';
import { GanttDataSource } from './datasource/gantt-datasource';
import { GanttDragService } from './drag/gantt-drag.service';
import { provideGantt } from './provide';

const day = (d: number) => new Date(2026, 0, d);
const TASKS: GanttTask[] = [
  { id: 'g', name: 'Group', type: TaskType.Group, start: day(5), end: day(30), collapsed: true },
  { id: 'g1', name: 'Child one', parentId: 'g', start: day(5), end: day(12) },
  { id: 'g2', name: 'Child two', parentId: 'g', start: day(12), end: day(20) },
  { id: 'x', name: 'Standalone', start: day(8), end: day(25) },
];

@Component({
  imports: [GantryComponent, GanttColumnDefDirective],
  template: `<gantry
    style="height: 420px"
    [style]="consumerStyle()"
    [series]="tasks()"
    [dataSource]="dataSource()"
    [options]="options()"
    [darkMode]="dark()"
    [(viewMode)]="zoom"
    (viewModeChange)="zoomEvents.push($event)"
    (stateChange)="states.push($event)"
  >
    @if (withOwner()) {
      <ng-template ganttColumn="owner" [label]="ownerLabel()" [width]="140" />
    }
  </gantry>`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(TASKS);
  readonly dataSource = signal<GanttDataSource | null>(null);
  readonly options = signal<GanttOptions>({ initialScroll: false });
  readonly dark = signal<boolean | 'auto' | undefined>(undefined);
  readonly zoom = signal<string | undefined>(undefined);
  readonly consumerStyle = signal<Record<string, string>>({});
  readonly withOwner = signal(false);
  readonly ownerLabel = signal('Owner');
  readonly zoomEvents: (string | undefined)[] = [];
  readonly states: GanttState[] = [];
  readonly gantt = viewChild.required(GantryComponent);
}

/** A single token through a property binding: `--global--` keeps the key un-namespaced */
@Component({
  imports: [GantryComponent],
  template: `<gantry [series]="tasks" [options]="{ initialScroll: false }" [style.--global--gantt-today]="today()" />`,
})
class TokenHost {
  readonly tasks = TASKS;
  readonly today = signal('#00FF00');
  readonly gantt = viewChild.required(GantryComponent);
}

async function mount(setup?: (host: Host) => void, providers: unknown[] = []): Promise<ComponentFixture<Host>> {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), ...(providers as never[])],
  });
  const fixture = TestBed.createComponent(Host);
  setup?.(fixture.componentInstance);
  await fixture.whenStable();
  return fixture;
}

const $$ = <E extends Element = HTMLElement>(f: ComponentFixture<Host>, sel: string): E[] => [
  ...(f.nativeElement as HTMLElement).querySelectorAll<E>(sel),
];
const hostOf = (f: ComponentFixture<Host>): HTMLElement => {
  const host = $$(f, 'gantry')[0];
  if (!host) throw new Error('no <gantry>');
  return host;
};
/** Zoom pill the toolbar shows as active (the view pills are another group) */
const pressedLevel = (f: ComponentFixture<Host>) =>
  $$(f, '.gantt-tb-group:not(.gantt-tb-views) > .gantt-tb-pill[aria-pressed="true"]').map(b => b.textContent?.trim());
const rowIds = (f: ComponentFixture<Host>) => $$(f, '.gantt-tl-row').map(r => r.getAttribute('data-task-id'));
const barLabel = (f: ComponentFixture<Host>, id: string) =>
  $$(f, `.gantt-bars-layer [data-task-id="${id}"]`)[0]?.getAttribute('aria-label');
const headerLabels = (f: ComponentFixture<Host>) => $$(f, '.gantt-tl-col-header').map(h => h.textContent?.trim() ?? '');
/** The chart's resolved config (protected: read for the test only) */
const configOf = (f: ComponentFixture<Host>) =>
  (f.componentInstance.gantt() as unknown as { cfg: () => ResolvedGanttConfig }).cfg();
const columnsOf = (f: ComponentFixture<Host>) =>
  f.debugElement.query(By.directive(GantryComponent)).injector.get(GanttColumnService);
const debounce = () => new Promise(r => setTimeout(r, 200));

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('[(viewMode)] and viewModeChange', () => {
  it('shows the parent level without emitting, on the first render and on a parent change', async () => {
    const f = await mount(h => h.zoom.set('Week'));
    expect(pressedLevel(f)).toEqual(['Week']);
    expect(f.componentInstance.zoomEvents).toEqual([]);

    f.componentInstance.zoom.set('Day');
    await f.whenStable();
    expect(pressedLevel(f)).toEqual(['Day']);
    expect(f.componentInstance.zoomEvents).toEqual([]);
  });

  it('emits nothing on the first render with options.viewMode and no model', async () => {
    const f = await mount(h => h.options.set({ initialScroll: false, viewMode: 'Day' }));
    expect(pressedLevel(f)).toEqual(['Day']);
    expect(f.componentInstance.zoomEvents).toEqual([]);
    expect(f.componentInstance.zoom()).toBeUndefined();
  });

  it('a toolbar zoom updates the parent signal, emits once and saves the state', async () => {
    const f = await mount(h => h.zoom.set('Week'));
    const zoomIn = $$<HTMLButtonElement>(f, '.gantt-tb-btn[aria-label="Zoom in"]')[0];
    zoomIn?.click();
    await f.whenStable();
    const next = zoomStep(DEFAULT_ZOOM_LEVELS, 'Week', -1);
    expect(next).not.toBe('Week');
    expect(f.componentInstance.zoom()).toBe(next);
    expect(f.componentInstance.zoomEvents).toEqual([next]);
    expect(pressedLevel(f)).toEqual([next]);

    await debounce();
    expect(f.componentInstance.states.at(-1)?.viewMode).toBe(next);
    expect(f.componentInstance.zoomEvents).toEqual([next]);
  });

  it('a changed options.viewMode overrides a user zoom and emits once; an equal one does not', async () => {
    const f = await mount(h => h.options.set({ initialScroll: false, viewMode: 'Week' }));
    f.componentInstance.gantt().setViewMode('Day');
    await f.whenStable();
    expect(f.componentInstance.zoomEvents).toEqual(['Day']);

    // Re-assigned options with the same viewMode keep the user's zoom
    f.componentInstance.options.set({ initialScroll: false, viewMode: 'Week' });
    await f.whenStable();
    expect(pressedLevel(f)).toEqual(['Day']);
    expect(f.componentInstance.zoomEvents).toEqual(['Day']);

    f.componentInstance.options.set({ initialScroll: false, viewMode: 'Month' });
    await f.whenStable();
    expect(pressedLevel(f)).toEqual(['Month']);
    expect(f.componentInstance.zoom()).toBe('Month');
    expect(f.componentInstance.zoomEvents).toEqual(['Day', 'Month']);
  });

  it('keyboard zoom goes through the same path', async () => {
    const f = await mount(h => h.zoom.set('Week'));
    hostOf(f).dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true, cancelable: true }));
    await f.whenStable();
    const next = zoomStep(DEFAULT_ZOOM_LEVELS, 'Week', 1);
    expect(f.componentInstance.zoom()).toBe(next);
    expect(f.componentInstance.zoomEvents).toEqual([next]);
  });
});

describe('UI state seeded by options', () => {
  it('an equal view / panel width keeps the user view and splitter width; a changed one resets them', async () => {
    const f = await mount(h => h.options.set({ initialScroll: false, panel: { width: 320 } }));
    const gantt = f.componentInstance.gantt();
    const splitter = $$(f, '.gantry-splitter')[0];
    splitter?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await f.whenStable();
    expect(gantt.getState().panelWidth).toBe(344);

    // A new options object with the same panel width (and no view)
    f.componentInstance.options.set({ initialScroll: false, panel: { width: 320 } });
    await f.whenStable();
    expect(gantt.getState().panelWidth).toBe(344);

    gantt.setView('table');
    f.componentInstance.options.set({ initialScroll: false, panel: { width: 320 } });
    await f.whenStable();
    expect(gantt.view()).toBe('table');
    expect(hostOf(f).getAttribute('data-view')).toBe('table');

    // A changed view and width win over the user's
    f.componentInstance.options.set({ initialScroll: false, panel: { width: 360 }, view: 'split' });
    await f.whenStable();
    expect(gantt.view()).toBe('split');
    expect(hostOf(f).getAttribute('data-view')).toBe('split');
    expect(gantt.getState().panelWidth).toBe(360);

    // The same view option again: the user's later choice stays
    gantt.setView('chart');
    f.componentInstance.options.set({ initialScroll: false, panel: { width: 360 }, view: 'split' });
    await f.whenStable();
    expect(gantt.view()).toBe('chart');
  });

  it('a new series reference resets a locally moved task', async () => {
    const f = await mount();
    expect(barLabel(f, 'x')).toContain('8 Jan – 25 Jan 2026');
    // The path of a finished drag: the task is moved locally
    f.componentInstance.gantt().updateTask('x', { start: day(10), end: day(27) });
    await f.whenStable();
    expect(barLabel(f, 'x')).toContain('10 Jan – 27 Jan 2026');

    f.componentInstance.tasks.set([...TASKS]);
    await f.whenStable();
    expect(barLabel(f, 'x')).toContain('8 Jan – 25 Jan 2026');
  });

  it('task.collapsed collapses new ids only; an existing id keeps the user expand state', async () => {
    const f = await mount();
    expect(rowIds(f)).toEqual(['g', 'x']);

    $$(f, '.gantt-collapse-btn')[0]?.click();
    await f.whenStable();
    expect(rowIds(f)).toEqual(['g', 'g1', 'g2', 'x']);

    f.componentInstance.tasks.set([
      ...TASKS,
      { id: 'h', name: 'Second group', type: TaskType.Group, start: day(6), end: day(18), collapsed: true },
      { id: 'h1', name: 'Hidden child', parentId: 'h', start: day(6), end: day(10) },
    ]);
    await f.whenStable();
    // 'g' keeps the user's expand state, the new 'h' starts collapsed
    expect(rowIds(f)).toEqual(expect.arrayContaining(['g', 'g1', 'g2', 'x', 'h']));
    expect(rowIds(f)).not.toContain('h1');
  });
});

describe('dark mode', () => {
  /** A `prefers-color-scheme` stub whose listeners the test can fire */
  function stubColorScheme(dark: boolean) {
    const listeners = new Set<(e: { matches: boolean }) => void>();
    const mql = {
      matches: dark,
      media: '(prefers-color-scheme: dark)',
      addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.delete(cb),
    };
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mql),
    );
    return {
      listeners,
      fire(matches: boolean) {
        mql.matches = matches;
        for (const cb of listeners) cb({ matches });
      },
    };
  }

  it('provideGantt({ darkMode: "auto" }) applies without [darkMode]; the input wins; options.darkMode wins over both', async () => {
    const scheme = stubColorScheme(true);
    const f = await mount(undefined, [provideGantt({ darkMode: 'auto' })]);
    const host = hostOf(f);
    expect(host.classList.contains('gantry-dark')).toBe(true);
    expect(host.style.getPropertyValue('--gantt-bg')).toBe(DarkTheme.backgroundColor);

    scheme.fire(false);
    await f.whenStable();
    expect(host.classList.contains('gantry-dark')).toBe(false);
    expect(host.style.getPropertyValue('--gantt-bg')).toBe(LightTheme.backgroundColor);
    scheme.fire(true);
    await f.whenStable();
    expect(host.classList.contains('gantry-dark')).toBe(true);

    f.componentInstance.dark.set(false);
    await f.whenStable();
    expect(host.classList.contains('gantry-dark')).toBe(false);

    f.componentInstance.options.set({ initialScroll: false, darkMode: true });
    await f.whenStable();
    expect(host.classList.contains('gantry-dark')).toBe(true);
    expect(host.style.getPropertyValue('--gantt-bg')).toBe(DarkTheme.backgroundColor);

    // The colour-scheme listener is released with the chart
    f.destroy();
    expect(scheme.listeners.size).toBe(0);
  });

  it('defaults to light without any setting (no listener needed)', async () => {
    const f = await mount();
    expect(hostOf(f).classList.contains('gantry-dark')).toBe(false);
    expect(hostOf(f).hasAttribute('data-theme')).toBe(false);
  });
});

describe('theme on the host', () => {
  it('binds every theme token as the host style; setTheme / resetTheme change it without a new config', async () => {
    const f = await mount();
    const host = hostOf(f);
    for (const [cssVar, value] of themeToCss(resolveTheme(false))) {
      expect(host.style.getPropertyValue(cssVar), cssVar).toBe(value);
    }
    // Chrome comes from the stylesheet (on the tokens), not from inline declarations
    for (const prop of ['color', 'background-color', 'font-family', 'font-size']) {
      expect(host.style.getPropertyValue(prop), prop).toBe('');
    }
    const hostRule = [...document.querySelectorAll('style')]
      .map(s => s.textContent)
      .find(css => /\[_nghost-[^\]]+\]\s*\{[^}]*font-family:\s*var\(--gantt-font\)/.test(css));
    expect(hostRule).toMatch(/color:\s*var\(--gantt-text\)/);
    expect(hostRule).toMatch(/background-color:\s*var\(--gantt-bg\)/);

    const config = configOf(f);
    f.componentInstance.gantt().setTheme({ barColor: '#0F766E' });
    await f.whenStable();
    expect(host.style.getPropertyValue('--gantt-bar')).toBe('#0F766E');
    expect(configOf(f)).toBe(config);

    f.componentInstance.gantt().resetTheme();
    await f.whenStable();
    expect(host.style.getPropertyValue('--gantt-bar')).toBe(LightTheme.barColor);
    expect(configOf(f)).toBe(config);

    f.componentInstance.dark.set(true);
    await f.whenStable();
    expect(host.classList.contains('gantry-dark')).toBe(true);
    expect(host.hasAttribute('data-theme')).toBe(false);
    expect(host.style.getPropertyValue('--gantt-bar')).toBe(DarkTheme.barColor);
  });

  // Angular 22 compiles `[style.--x]` to a namespaced key (`--%NS%x`), which the styling precedence
  // can't match with the host map's `--x`; a template `[style]` map or `[style.--global--x]` can.
  it('keeps the consumer style attribute; a consumer [style] map and [style.--global--gantt-*] win', async () => {
    const f = await mount(h => h.consumerStyle.set({ '--gantt-grid-line': '#FF0000' }));
    const host = hostOf(f);
    expect(host.style.height).toBe('420px');
    expect(host.style.getPropertyValue('--gantt-grid-line')).toBe('#FF0000');
    expect(host.style.getPropertyValue('--gantt-bar')).toBe(LightTheme.barColor);

    // A theme change re-writes its tokens, not the consumer's
    f.componentInstance.gantt().setTheme({ barColor: '#0F766E', gridLine: '#111111' });
    await f.whenStable();
    expect(host.style.height).toBe('420px');
    expect(host.style.getPropertyValue('--gantt-bar')).toBe('#0F766E');
    expect(host.style.getPropertyValue('--gantt-grid-line')).toBe('#FF0000');

    // Dropping the consumer value hands the token back to the theme
    f.componentInstance.consumerStyle.set({});
    await f.whenStable();
    expect(host.style.getPropertyValue('--gantt-grid-line')).toBe('#111111');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const t = TestBed.createComponent(TokenHost);
    await t.whenStable();
    const tokenHost = (t.nativeElement as HTMLElement).querySelector('gantry') as HTMLElement;
    expect(tokenHost.style.getPropertyValue('--gantt-today')).toBe('#00FF00');
    t.componentInstance.gantt().setTheme({ todayColor: '#222222' });
    await t.whenStable();
    expect(tokenHost.style.getPropertyValue('--gantt-today')).toBe('#00FF00');
  });

  it('marks a loading data source and an active drag on the host', async () => {
    // The test environment's IntersectionObserver has no methods (the load-more footer observes)
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    let release = (): void => undefined;
    const pending = new Promise<GanttTask[]>(resolve => (release = () => resolve([])));
    const ds = new GanttDataSource({ fetcher: () => pending, retries: 0 });
    const f = await mount(h => h.dataSource.set(ds));
    const host = hostOf(f);
    expect(ds.isLoading()).toBe(true);
    expect(host.classList.contains('gantry-loading')).toBe(true);
    release();
    await vi.waitFor(() => expect(ds.isLoading()).toBe(false));
    await f.whenStable();
    expect(host.classList.contains('gantry-loading')).toBe(false);

    const drag = f.debugElement.query(By.directive(GantryComponent)).injector.get(GanttDragService);
    expect(host.classList.contains('gantry-dragging')).toBe(false);
    drag.state.set({ kind: 'resizing-right', taskId: 'x' });
    await f.whenStable();
    expect(host.classList.contains('gantry-dragging')).toBe(true);
    drag.state.set({ kind: 'idle' });
    await f.whenStable();
    expect(host.classList.contains('gantry-dragging')).toBe(false);
  });
});

describe('column directives', () => {
  it('picks up a ganttColumn inside @if, follows its inputs and drops it with the block', async () => {
    const f = await mount();
    expect(headerLabels(f).some(l => l.includes('Owner'))).toBe(false);

    f.componentInstance.withOwner.set(true);
    await f.whenStable();
    expect(headerLabels(f).some(l => l.includes('Owner'))).toBe(true);
    expect(
      columnsOf(f)
        .columns()
        .find(c => c.key === 'owner')?.width,
    ).toBe(140);

    f.componentInstance.ownerLabel.set('Assignee');
    await f.whenStable();
    expect(headerLabels(f).some(l => l.includes('Assignee'))).toBe(true);
    expect(headerLabels(f).some(l => l.includes('Owner'))).toBe(false);

    f.componentInstance.withOwner.set(false);
    await f.whenStable();
    expect(headerLabels(f).some(l => l.includes('Assignee'))).toBe(false);
    expect(
      columnsOf(f)
        .columns()
        .some(c => c.key === 'owner'),
    ).toBe(false);
  });

  it('a locale / labels change re-labels the built-ins and keeps a user width', async () => {
    const f = await mount();
    const cols = columnsOf(f);
    cols.setColumnWidth('name', 260);
    await f.whenStable();
    expect(cols.widths()['name']).toBe(260);
    const before = cols.builtins();

    f.componentInstance.options.set({ initialScroll: false, locale: 'it', labels: { colName: 'Attività' } });
    await f.whenStable();
    expect(cols.builtins()).not.toBe(before);
    expect(cols.builtins().find(c => c.key === 'name')?.label).toBe('Attività');
    expect(headerLabels(f).some(l => l.includes('Attività'))).toBe(true);
    expect(cols.widths()['name']).toBe(260);

    // Re-assigning equal i18n options rebuilds nothing
    const relabelled = cols.builtins();
    f.componentInstance.options.update(o => ({ ...o }));
    await f.whenStable();
    expect(cols.builtins()).toBe(relabelled);
  });
});
