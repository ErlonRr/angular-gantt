// The chart states (Gantry 2 phase 9, step 4.7; D11, §3c): `div.gantt-state` as the last child of
// `.gantry-main`, attached while `chartState.kind !== 'ready'` (D27) — the loading skeleton from core
// `skeletonRows` (shimmer off under reduced motion), the error box (`role=alert`, Retry → `retry`
// output and `dataSource.retry()`), the empty box with `[ganttEmpty]` or `labels.emptyState` — the
// Web Component's markup and styles.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  DEFAULT_LABELS,
  bodyHeight,
  skeletonRows,
  type GanttOptions,
  type GanttTask,
  type RetryEvent,
  type SkeletonBlock,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttChartStateComponent } from './states/gantt-chart-state.component';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttDataSource } from './datasource/gantt-datasource';

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
    [series]="tasks()"
    [dataSource]="dataSource()"
    [options]="options()"
    [loading]="loading()"
    [errorMessage]="errorMessage()"
    (retry)="retries.push($event)"
  />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>([]);
  readonly dataSource = signal<GanttDataSource | null>(null);
  readonly options = signal<GanttOptions>({ initialScroll: false });
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly retries: RetryEvent[] = [];
  readonly gantt = viewChild.required(GantryComponent);
}

/** `[ganttEmpty]` content (not inside an `@if`: a control-flow block around it fills the slot even when empty) */
@Component({
  imports: [GantryComponent],
  template: `<gantry style="height: 300px" [series]="[]" [options]="{ initialScroll: false }">
    <div ganttEmpty class="my-empty">Nothing planned yet</div>
  </gantry>`,
})
class EmptyContentHost {}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  host: HTMLElement;
  gantt: GantryComponent;
  layout: GanttLayoutService;
  set(change: () => void): Promise<void>;
  $(sel: string): HTMLElement | null;
  $$(sel: string): HTMLElement[];
  /** The state component, while attached */
  state(): GanttChartStateComponent | undefined;
}

async function mount(setup?: (host: Host) => void): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  setup?.(f.componentInstance);
  await f.whenStable();
  const debug = f.debugElement.query(By.directive(GantryComponent));
  const host = debug.nativeElement as HTMLElement;
  return {
    f,
    h: f.componentInstance,
    host,
    gantt: f.componentInstance.gantt(),
    layout: debug.injector.get(GanttLayoutService),
    async set(change) {
      change();
      await f.whenStable();
    },
    $: sel => host.querySelector<HTMLElement>(sel),
    $$: sel => [...host.querySelectorAll<HTMLElement>(sel)],
    state: () =>
      f.debugElement.query(By.directive(GanttChartStateComponent))?.componentInstance as
        GanttChartStateComponent | undefined,
  };
}

const childClasses = (node: Element) => [...node.children].map(c => c.getAttribute('class'));
const at = (el: HTMLElement) => ['left', 'top', 'width', 'height'].map(p => el.style.getPropertyValue(p));
const px = (b: SkeletonBlock) => [b.x, b.y, b.width, b.height].map(v => `${v}px`);
/** GantryComponent's panel width (protected: read for the test only) */
const panelPx = (c: Chart) => (c.gantt as unknown as { panelPx: () => number }).panelPx();

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
});

describe('chart states (D11)', () => {
  it('stay detached while the chart is ready (D27); loading over rows keeps the chart', async () => {
    const c = await mount(h => h.tasks.set(plan(3)));
    expect(c.layout.chartState().kind).toBe('ready');
    expect(c.$('.gantt-state')).toBeNull();
    await c.set(() => c.h.loading.set(true));
    expect(c.$('.gantt-state')).toBeNull();
    expect(c.host.getAttribute('aria-busy')).toBe('true');
  });

  describe('empty', () => {
    it('shows the empty box, labels.emptyState as the fallback of [ganttEmpty]', async () => {
      const c = await mount();
      const main = c.$('.gantry-main')!;
      const state = c.$('.gantt-state')!;
      expect(state.parentElement).toBe(main);
      expect(main.lastElementChild).toBe(state);
      expect(state.getAttribute('class')).toBe('gantt-state gantt-state--empty');
      expect(childClasses(state)).toEqual(['gantt-state-box']);
      const content = state.firstElementChild!;
      expect(content.hasAttribute('role')).toBe(false);
      expect(childClasses(content)).toEqual(['gantt-state-message']);
      expect(content.textContent?.trim()).toBe(DEFAULT_LABELS.emptyState);

      await c.set(() => c.h.options.set({ initialScroll: false, labels: { emptyState: 'Niente da mostrare' } }));
      expect(c.$('.gantt-state-message')!.textContent?.trim()).toBe('Niente da mostrare');

      await c.set(() => c.h.tasks.set(plan(2)));
      expect(c.$('.gantt-state')).toBeNull();
      await c.set(() => c.h.tasks.set([]));
      expect(c.$('.gantt-state--empty .gantt-state-message')).not.toBeNull();
    });

    it('projects [ganttEmpty] content in place of the message', async () => {
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      const f = TestBed.createComponent(EmptyContentHost);
      await f.whenStable();
      const host = f.debugElement.query(By.directive(GantryComponent)).nativeElement as HTMLElement;
      const box = host.querySelector('.gantry-main > .gantt-state--empty > .gantt-state-box')!;
      expect(box.querySelector('.my-empty')?.textContent).toBe('Nothing planned yet');
      expect(box.querySelector('.gantt-state-message')).toBeNull();
    });

    it('styles the fallback message from GantryComponent’s view (unencapsulated rules)', async () => {
      const c = await mount();
      const message = c.$('.gantt-state-message')!;
      expect(cascaded(message, 'color')).toBe('var(--gantt-text-sec)');
      expect(cascaded(message, 'margin')).toBe('0');
    });
  });

  describe('loading', () => {
    it('draws the skeleton rows of core skeletonRows, hidden from assistive technologies', async () => {
      const c = await mount(h => h.loading.set(true));
      const state = c.$('.gantt-state')!;
      expect(state.getAttribute('class')).toBe('gantt-state gantt-state--loading');
      expect(c.$('.gantry-main')!.lastElementChild).toBe(state);
      // The skeleton is decoration; labels.loading is its text for assistive technologies
      expect(childClasses(state)).toEqual(['gantt-skeleton', 'gantt-state-message']);
      const skeleton = state.firstElementChild as HTMLElement;
      expect(skeleton.getAttribute('aria-hidden')).toBe('true');
      expect(c.host.getAttribute('aria-busy')).toBe('true');
      // From the header height down
      expect(state.style.top).toBe(`${c.layout.headerHeight()}px`);

      const expected = skeletonRows({
        viewportHeight: bodyHeight(c.layout.viewportHeight(), c.layout.headerHeight()),
        rowHeight: c.layout.rowHeight(),
        panelWidth: c.state()!.panelWidth(),
        timelineWidth: c.layout.viewportWidth(),
      });
      expect(expected.length).toBeGreaterThan(0);
      const rows = c.$$('.gantt-skeleton-row');
      expect(rows).toHaveLength(expected.length);
      rows.forEach((row, i) => {
        const r = expected[i];
        expect(row.parentElement).toBe(skeleton);
        expect([row.style.getPropertyValue('top'), row.style.getPropertyValue('height')]).toEqual([
          `${r.y}px`,
          `${r.height}px`,
        ]);
        const name = row.querySelector<HTMLElement>('.gantt-skeleton-name');
        const bar = row.querySelector<HTMLElement>('.gantt-skeleton-bar');
        expect(name ? at(name) : null).toEqual(r.name ? px(r.name) : null);
        expect(bar ? at(bar) : null).toEqual(r.bar ? px(r.bar) : null);
        // Name first, then bar
        if (name && bar) expect(row.firstElementChild).toBe(name);
      });
    });

    // Needs GantryComponent to bind `[panelWidth]="panelPx()"` on `div[ganttChartState]` (step 4.5's file)
    it('places the name blocks in the chart’s panel width', async () => {
      const c = await mount(h => h.loading.set(true));
      await c.set(() => c.layout.viewportWidth.set(600));
      expect(panelPx(c)).toBeGreaterThan(0);
      expect(c.state()!.panelWidth()).toBe(panelPx(c));
      expect(c.$$('.gantt-skeleton-name').length).toBeGreaterThan(0);
    });

    it('follows the measured size and the view: no names in the chart view, no bars in the table view', async () => {
      const c = await mount(h => h.loading.set(true));
      await c.set(() => {
        c.layout.viewportWidth.set(600);
        c.layout.viewportHeight.set(c.layout.headerHeight() + 5 * c.layout.rowHeight());
      });
      expect(c.$$('.gantt-skeleton-row')).toHaveLength(5);
      expect(c.$$('.gantt-skeleton-bar')).toHaveLength(5);

      await c.set(() => c.gantt.setView('chart'));
      expect(c.$$('.gantt-skeleton-name')).toHaveLength(0);
      expect(c.$$('.gantt-skeleton-bar')).toHaveLength(5);
      // The bars start at the timeline's left edge (no panel)
      const first = skeletonRows({
        viewportHeight: 5 * c.layout.rowHeight(),
        rowHeight: c.layout.rowHeight(),
        panelWidth: 0,
        timelineWidth: 600,
      })[0];
      expect(c.$('.gantt-skeleton-bar')!.style.getPropertyValue('left')).toBe(`${first.bar!.x}px`);

      await c.set(() => c.gantt.setView('table'));
      expect(c.$$('.gantt-skeleton-bar')).toHaveLength(0);
    });

    it('gives way to the rows once they arrive', async () => {
      const c = await mount(h => h.loading.set(true));
      expect(c.$('.gantt-state')).not.toBeNull();
      await c.set(() => c.h.tasks.set(plan(2)));
      expect(c.$('.gantt-state')).toBeNull();
      expect(c.$$('.gantt-bars-layer [data-task-id]')).toHaveLength(2);
      await c.set(() => c.h.loading.set(false));
      expect(c.host.hasAttribute('aria-busy')).toBe(false);
    });
  });

  describe('error', () => {
    it("shows errorMessage in a role=alert box with Retry, over the rows, and emits retry { source: 'error' }", async () => {
      const c = await mount(h => {
        h.tasks.set(plan(3));
        h.errorMessage.set('Server unreachable');
      });
      const state = c.$('.gantt-state')!;
      expect(state.getAttribute('class')).toBe('gantt-state gantt-state--error');
      expect(c.$('.gantry-main')!.lastElementChild).toBe(state);
      const alert = state.firstElementChild as HTMLElement;
      expect(alert.getAttribute('class')).toBe('gantt-state-box');
      expect(alert.getAttribute('role')).toBe('alert');
      expect(childClasses(alert)).toEqual(['gantt-state-title', 'gantt-state-message', 'gantt-state-retry']);
      expect(alert.querySelector('.gantt-state-title')!.textContent?.trim()).toBe(DEFAULT_LABELS.errorTitle);
      expect(alert.querySelector('.gantt-state-message')!.textContent?.trim()).toBe('Server unreachable');
      const retry = alert.querySelector<HTMLButtonElement>('.gantt-state-retry')!;
      expect(retry.type).toBe('button');
      expect(retry.getAttribute('data-focus-key')).toBe('retry');
      expect(retry.textContent).toBe(DEFAULT_LABELS.retry);
      // The box reads the failure: the alert region stays quiet
      expect(c.$('.gantt-sr-alert')!.textContent).toBe('');

      await c.set(() => retry.click());
      expect(c.h.retries).toEqual([{ source: 'error' }]);

      await c.set(() => {
        c.h.options.set({ initialScroll: false, labels: { errorTitle: 'Errore', retry: 'Riprova' } });
        c.h.errorMessage.set('Server non raggiungibile');
      });
      expect(c.$('.gantt-state-title')!.textContent?.trim()).toBe('Errore');
      expect(c.$('.gantt-state-message')!.textContent?.trim()).toBe('Server non raggiungibile');
      expect(c.$('.gantt-state-retry')!.textContent?.trim()).toBe('Riprova');
    });

    it('keeps focus in the chart when Retry goes away', async () => {
      const c = await mount(h => {
        h.tasks.set(plan(3));
        h.errorMessage.set('Offline');
      });
      const retry = c.$('.gantt-state-retry')!;
      retry.focus();
      expect(document.activeElement).toBe(retry);
      await c.set(() => c.h.errorMessage.set(null));
      expect(c.$('.gantt-state')).toBeNull();
      expect(document.activeElement).not.toBe(retry);
      expect(c.host.contains(document.activeElement)).toBe(true);
    });

    it('retries a data source whose first page failed: retry { source: "dataSource" } and dataSource.retry()', async () => {
      let fail = true;
      const fetcher = vi.fn((page: number, size: number) =>
        fail ? Promise.reject(new Error('offline')) : Promise.resolve(page > 1 ? [] : plan(size)),
      );
      const ds = new GanttDataSource({ fetcher, pageSize: 3, retries: 0 });
      const c = await mount(h => h.dataSource.set(ds));
      await vi.waitFor(() => expect(ds.error()).not.toBeNull());
      await c.f.whenStable();
      expect(c.layout.chartState()).toMatchObject({ kind: 'error', retry: 'dataSource' });
      expect(c.$('.gantt-state')!.getAttribute('class')).toBe('gantt-state gantt-state--error');
      expect(c.$('.gantt-state-message')!.textContent?.trim()).toBe(DEFAULT_LABELS.loadError);
      // One announcement: the role=alert box, not the alert region too
      expect(c.$('.gantt-sr-alert')!.textContent).toBe('');
      expect(c.$('gantt-load-more')).toBeNull();

      const retry = vi.spyOn(ds, 'retry');
      fail = false;
      await c.set(() => c.$('.gantt-state-retry')!.click());
      expect(c.h.retries).toEqual([{ source: 'dataSource' }]);
      expect(retry).toHaveBeenCalledOnce();
      await vi.waitFor(() => expect(ds.items()).toHaveLength(3));
      await c.f.whenStable();
      expect(c.$('.gantt-state')).toBeNull();
      // The retry fetched the failed first page again
      expect(fetcher.mock.calls[1]?.slice(0, 2)).toEqual([1, 3]);
    });
  });

  it('wins in core order: error > loading > empty', async () => {
    const c = await mount(h => {
      h.loading.set(true);
      h.errorMessage.set('Nope');
    });
    expect(c.$('.gantt-state')!.getAttribute('class')).toBe('gantt-state gantt-state--error');
    await c.set(() => c.h.errorMessage.set(null));
    expect(c.$('.gantt-state')!.getAttribute('class')).toBe('gantt-state gantt-state--loading');
    expect(childClasses(c.$('.gantt-state')!)).toEqual(['gantt-skeleton', 'gantt-state-message']);
    await c.set(() => c.h.loading.set(false));
    expect(c.$('.gantt-state')!.getAttribute('class')).toBe('gantt-state gantt-state--empty');
  });
});

describe('chart state styles', () => {
  it('covers the body from the header height down, opaque, over the panes', async () => {
    const c = await mount(h => h.errorMessage.set('Nope'));
    const state = c.$('.gantt-state')!;
    expect(cascaded(state, 'position')).toBe('absolute');
    expect(cascaded(state, 'z-index')).toBe('13');
    expect(cascaded(state, 'background')).toBe('var(--gantt-bg)');
    expect(cascaded(state, 'display')).toBe('flex');
    expect(cascaded(c.$('.gantt-state-retry')!, 'min-height')).toBe('32px');
    expect(cascaded(c.$('.gantt-state-retry')!, 'min-width')).toBe('32px');
  });

  it('shimmers the skeleton blocks, except under reduced motion', async () => {
    const c = await mount(h => h.loading.set(true));
    await c.set(() => c.layout.viewportWidth.set(600));
    const bar = c.$('.gantt-skeleton-bar')!;
    expect(cascaded(bar, 'animation')).toContain('gantt-skeleton-shimmer');
    expect(cascaded(bar, 'animation', 'prefers-reduced-motion')).toBe('none');
    expect(cascaded(bar, 'background-image', 'prefers-reduced-motion')).toBe('none');
  });
});
