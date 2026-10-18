// What the chart state box covers (Gantry 2 phase 9 fixes, the Web Component's host / task-list /
// focus-restore regions): while `chartState.kind !== 'ready'` the timeline viewport, the splitter and
// the task-list rows are inert, the task list keeps its one tab stop on the header row (above the box;
// also without rows — core `gridTabStop`), and focus on a covered control moves to Retry, else the
// toolbar's tab stop, else the task list's. The loading box carries `labels.loading` for assistive
// technologies, the host's `gantry-loading` class follows the `loading` input as well as the data
// source, the timeline's scroll padding is core `timelineScrollPadding`, and the keys the chart leaves
// alone are the splitter handle's only (the toggle is a plain button, as in the Web Component).
import { describe, it, expect } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  DEFAULT_LABELS,
  FOCUS_RING_MARGIN,
  timelineScrollPadding,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttLayoutService } from './layout/gantt-layout.service';

/** `n` one-week tasks in March 2026. */
function plan(n: number): GanttTask[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Task ${i}`,
    start: new Date(2026, 2, 2 + (i % 20)),
    end: new Date(2026, 2, 9 + (i % 20)),
  }));
}

@Component({
  imports: [GantryComponent],
  template: `<gantry
    style="height: 400px"
    [series]="tasks()"
    [options]="options()"
    [loading]="loading()"
    [errorMessage]="errorMessage()"
    [showToolbar]="showToolbar()"
  />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(plan(3));
  readonly options = signal<GanttOptions>({ viewMode: 'Day', initialScroll: false });
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showToolbar = signal(true);
}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  host: HTMLElement;
  layout: GanttLayoutService;
  set(change: (h: Host) => void): Promise<void>;
  $(sel: string): HTMLElement | null;
  $$(sel: string): HTMLElement[];
}

async function mount(setup?: (h: Host) => void): Promise<Chart> {
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
    layout: debug.injector.get(GanttLayoutService),
    async set(change) {
      change(f.componentInstance);
      await f.whenStable();
    },
    $: sel => host.querySelector<HTMLElement>(sel),
    $$: sel => [...host.querySelectorAll<HTMLElement>(sel)],
  };
}

const inert = (el: Element | null) => !!el && el.hasAttribute('inert');
/** `data-focus-key` of the task list's tab stops (exactly one expected) */
const listStops = (c: Chart) => c.$$('gantt-tasklist [tabindex="0"]').map(n => n.getAttribute('data-focus-key'));
const activeKey = () => document.activeElement?.getAttribute('data-focus-key') ?? null;

describe('the body under the state box', () => {
  it('is inert while not ready (timeline, splitter, task-list rows); the header row stays reachable', async () => {
    const c = await mount(h => h.errorMessage.set('Nope'));
    const rows = c.$('.gantt-tl-rows');
    expect(inert(c.$('.gantry-canvas-viewport'))).toBe(true);
    expect(inert(c.$('.gantry-splitter'))).toBe(true);
    expect(inert(rows)).toBe(true);
    expect(inert(c.$('.gantry-panel'))).toBe(false);
    expect(c.$('.gantt-tl-col-headers')!.closest('[inert]')).toBeNull();
    // The rows are covered: the first header cell is the task list's tab stop
    expect(listStops(c)).toEqual(['head:name']);

    await c.set(h => h.errorMessage.set(null));
    expect(inert(c.$('.gantry-canvas-viewport'))).toBe(false);
    expect(inert(c.$('.gantry-splitter'))).toBe(false);
    expect(inert(c.$('.gantt-tl-rows'))).toBe(false);
    expect(listStops(c)).toEqual(['row:t0']);
  });

  it('without rows (loading, empty) the first header cell is the task list tab stop', async () => {
    for (const setup of [(h: Host) => (h.tasks.set([]), h.loading.set(true)), (h: Host) => h.tasks.set([])]) {
      const c = await mount(setup);
      expect(c.layout.chartState().kind).not.toBe('ready');
      expect(listStops(c)).toEqual(['head:name']);
      c.f.destroy();
      TestBed.resetTestingModule();
    }
  });

  it('moves focus off a covered control: to Retry, else the toolbar tab stop, else the task list’s', async () => {
    const c = await mount();
    c.$('.gantt-tl-row[data-task-id="t1"]')!.focus();
    await c.set(h => h.errorMessage.set('Nope'));
    expect(document.activeElement).toBe(c.$('.gantt-state-retry'));

    await c.set(h => h.errorMessage.set(null));
    c.$('.gantt-tl-row[data-task-id="t1"]')!.focus();
    await c.set(h => {
      h.tasks.set([]);
      h.loading.set(true);
    });
    expect(activeKey()).toBe('zoom-out');

    // No toolbar: the task list's tab stop, a header cell above the box
    await c.set(h => {
      h.showToolbar.set(false);
      h.loading.set(false);
      h.tasks.set(plan(2));
    });
    c.$('.gantt-tl-row[data-task-id="t0"]')!.focus();
    await c.set(h => h.tasks.set([]));
    expect(activeKey()).toBe('head:name');
  });

  it('gives the loading box its text for assistive technologies (labels.loading), visually hidden', async () => {
    const c = await mount(h => {
      h.tasks.set([]);
      h.loading.set(true);
    });
    const box = c.$('.gantt-state.gantt-state--loading')!;
    const message = box.querySelector<HTMLElement>(':scope > .gantt-state-message')!;
    expect(message.tagName).toBe('SPAN');
    expect(message.textContent).toBe(DEFAULT_LABELS.loading);
    expect(message.closest('[aria-hidden]')).toBeNull();
    expect(box.querySelector('.gantt-skeleton')!.getAttribute('aria-hidden')).toBe('true');
    const css = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
    expect(css).toMatch(/\.gantt-state--loading \.gantt-state-message \{[^}]*clip-path: inset\(50%\)/);
  });
});

describe('host state and scroll padding', () => {
  it('gantry-loading follows the loading input (no data source) like the Web Component’s :state(loading)', async () => {
    const c = await mount();
    expect(c.host.classList.contains('gantry-loading')).toBe(false);
    // Over shown rows: busy, the class too
    await c.set(h => h.loading.set(true));
    expect(c.host.classList.contains('gantry-loading')).toBe(true);
    await c.set(h => h.tasks.set([]));
    expect(c.host.classList.contains('gantry-loading')).toBe(true);
    await c.set(h => h.loading.set(false));
    expect(c.host.classList.contains('gantry-loading')).toBe(false);
  });

  it('pads the timeline by core timelineScrollPadding (a bar lands with its whole focus ring), the panel by the header', async () => {
    const c = await mount();
    const h = c.layout.headerHeight();
    const pad = timelineScrollPadding(h);
    expect(pad.top).toBe(h + FOCUS_RING_MARGIN);
    const viewport = c.$('.gantry-canvas-viewport')!;
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      expect(viewport.style.getPropertyValue(`scroll-padding-${side}`)).toBe(`${pad[side]}px`);
    }
    expect(c.$('.gantry-panel')!.style.getPropertyValue('scroll-padding-top')).toBe(`${h}px`);
  });
});

describe('splitter keys (parity with the Web Component)', () => {
  const press = (el: HTMLElement, key: string) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

  it('leaves only the handle’s keys alone: a shortcut on the collapse toggle reaches the chart', async () => {
    const c = await mount();
    expect(c.layout.level()).toBe('Day');
    press(c.$('.gantry-splitter-handle')!, '+');
    await c.f.whenStable();
    expect(c.layout.level()).toBe('Day');
    press(c.$('.gantry-splitter-toggle')!, '+');
    await c.f.whenStable();
    expect(c.layout.level()).toBe('Hour');
  });
});
