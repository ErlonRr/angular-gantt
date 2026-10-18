// The drag readout chip (Gantry 2 phase 9 step 4.8, the Web Component's `layers/readout.ts`):
// `div.gantt-drag-readout[aria-hidden][data-align]`, the last child of the timeline viewport, attached
// only while it shows (D27): a drag preview exists (pointer drag or keyboard move mode), carries the
// new dates and its row is there. Core `formatDragReadout` is its text and core `placeDragReadout`
// is written as `--x` / `--y` + `data-align`. The scroll offsets are read only while a preview exists.
import { describe, it, expect } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  TaskType,
  barKind,
  computeDragGhostVisual,
  dragReadoutWidth,
  formatDragReadout,
  placeDragReadout,
  type DragPreview,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttScrollService } from './scroll/gantt-scroll.service';
import { GanttDragService } from './drag/gantt-drag.service';
import { GanttI18nService } from './services/gantt-i18n.service';

const TASKS = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: new Date(2026, 2, 2), end: new Date(2026, 2, 9) },
  { id: 'm', name: 'Gate', start: new Date(2026, 2, 16), end: new Date(2026, 2, 16), type: TaskType.Milestone },
];
const DAY: GanttOptions = { viewMode: 'Day', initialScroll: false };

@Component({
  imports: [GantryComponent],
  template: `<gantry style="height: 400px" [series]="tasks()" [options]="options()" />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(TASKS());
  readonly options = signal<GanttOptions>(DAY);
}

interface Chart {
  f: ComponentFixture<Host>;
  host: HTMLElement;
  layout: GanttLayoutService;
  scroll: GanttScrollService;
  drag: GanttDragService;
  i18n: GanttI18nService;
  set(change: () => void): Promise<void>;
}

/** Mounts with the timeline viewport measured 600 × 300 px (happy-dom has no layout). */
async function mount(): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  await f.whenStable();
  const debug = f.debugElement.query(By.directive(GantryComponent));
  const layout = debug.injector.get(GanttLayoutService);
  const c: Chart = {
    f,
    host: debug.nativeElement as HTMLElement,
    layout,
    scroll: debug.injector.get(GanttScrollService),
    drag: debug.injector.get(GanttDragService),
    i18n: debug.injector.get(GanttI18nService),
    async set(change) {
      change();
      await f.whenStable();
    },
  };
  await c.set(() => {
    layout.viewportWidth.set(600);
    layout.viewportHeight.set(300);
  });
  return c;
}

/** A preview of `taskId` moved to `start` → `end`, drawn at `x` (what the drag sessions write). */
function preview(taskId: string, start: Date, end: Date, x = 120, unit: 'day' | 'hour' = 'day'): DragPreview {
  return { taskId, x, width: 160, y: 0, height: 20, delta: 1, unit, daysDelta: 1, start, end };
}

const chip = (c: Chart) => c.host.querySelector<HTMLElement>('.gantt-drag-readout');

/** Shows `p` through a keyboard move session (`null` ends it). */
async function move(c: Chart, p: DragPreview | null): Promise<void> {
  await c.set(() => {
    if (!p) {
      c.drag.endExternal();
      return;
    }
    if (!c.drag.isActive()) c.drag.startExternal(p.taskId);
    c.drag.setExternalPreview(p);
  });
}

/** What the chip should show for `p`. */
function expected(c: Chart, p: DragPreview) {
  const { layout } = c;
  const row = layout.geometryById().get(p.taskId)!.row;
  const text = formatDragReadout(p, {
    labels: c.i18n.labels(),
    locale: c.i18n.locale(),
    dates: layout.cfg(),
    unit: p.unit,
    milestone: barKind(row.barType) === 'milestone',
  });
  const ghost = computeDragGhostVisual(
    p,
    layout.geometryById().get(p.taskId)!,
    layout.cfg(),
    layout.timeline().toX,
    c.i18n.bundle(),
    layout.fontPx(),
  );
  const place = placeDragReadout(ghost, {
    scrollLeft: c.scroll.scrollLeft(),
    viewportWidth: 600,
    scrollTop: c.scroll.scrollTop(),
    headerHeight: layout.headerHeight(),
    viewportHeight: 300,
    width: dragReadoutWidth(text),
  });
  return { text, place };
}

describe('drag readout', () => {
  it('is the viewport’s last child only while it shows a preview’s new dates, with core’s text and place', async () => {
    const c = await mount();
    const viewport = c.host.querySelector('.gantry-canvas-viewport')!;
    expect(chip(c)).toBeNull();

    const p = preview('a', new Date(2026, 2, 3), new Date(2026, 2, 10));
    await move(c, p);
    const node = chip(c)!;
    expect(node.parentElement).toBe(viewport);
    expect(node.previousElementSibling?.localName).toBe('gantt-canvas');
    expect(node.nextElementSibling).toBeNull();
    expect(node.getAttribute('aria-hidden')).toBe('true');
    expect(node.hasAttribute('hidden')).toBe(false);
    const { text, place } = expected(c, p);
    expect(text).toMatch(/^3 Mar – 10 Mar · /);
    expect(node.textContent).toBe(text);
    expect(node.getAttribute('data-align')).toBe(place.align);
    expect(node.style.getPropertyValue('--x')).toBe(`${place.x}px`);
    expect(node.style.getPropertyValue('--y')).toBe(`${place.y}px`);
    // Never a layout property written inline
    for (const prop of ['left', 'top', 'translate']) expect(node.style.getPropertyValue(prop)).toBe('');

    // The preview moves: patched in place
    const next = preview('a', new Date(2026, 2, 5), new Date(2026, 2, 12), 160);
    await move(c, next);
    expect(chip(c)).toBe(node);
    expect(node.textContent).toBe(expected(c, next).text);
    expect(node.style.getPropertyValue('--x')).toBe(`${expected(c, next).place.x}px`);

    // A preview without the new dates (or whose row is gone) shows nothing: the chip is detached, as
    // the Web Component's (D27)
    await move(c, { ...p, start: undefined, end: undefined });
    expect(chip(c)).toBeNull();
    await move(c, preview('gone', new Date(2026, 2, 3), new Date(2026, 2, 10)));
    expect(chip(c)).toBeNull();
    await move(c, next);
    expect(chip(c)!.textContent).toBe(expected(c, next).text);

    await move(c, null);
    expect(chip(c)).toBeNull();
  });

  it('shows only the date of a milestone, and the time on hour scales', async () => {
    const c = await mount();
    const gate = preview('m', new Date(2026, 2, 17), new Date(2026, 2, 17));
    await move(c, gate);
    expect(chip(c)!.textContent).toBe(expected(c, gate).text);
    expect(chip(c)!.textContent).toBe('17 Mar');
    await move(c, null);

    await c.set(() => c.f.componentInstance.options.set({ viewMode: 'Hour', initialScroll: false }));
    const hours = preview('a', new Date(2026, 2, 3, 9), new Date(2026, 2, 3, 17), 120, 'hour');
    await move(c, hours);
    expect(chip(c)!.textContent).toBe(expected(c, hours).text);
    expect(chip(c)!.textContent).toMatch(/^3 Mar 09:00 – 17:00 · /);
  });

  it('follows the scroll while it shows: a ghost scrolled out keeps the chip at the visible start edge', async () => {
    const c = await mount();
    const p = preview('a', new Date(2026, 2, 3), new Date(2026, 2, 10), 100);
    await move(c, p);
    await c.set(() => c.scroll.scrollLeft.set(500));
    const { place } = expected(c, p);
    expect(place.align).toBe('start');
    expect(chip(c)!.getAttribute('data-align')).toBe('start');
    expect(chip(c)!.style.getPropertyValue('--x')).toBe(`${place.x}px`);
    expect(place.x).toBe(500 + 4);
  });

  it('styles the chip from core’s look: 20 px tall, translated by its alignment, no pointer', async () => {
    const c = await mount();
    await move(c, preview('a', new Date(2026, 2, 3), new Date(2026, 2, 10)));
    const css = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
    const host = /\[_nghost-[^\]]+\]\s*\{[^}]*left:\s*var\(--x, 0px\);\s*top:\s*var\(--y, 0px\);[^}]*\}/.exec(css);
    expect(host).not.toBeNull();
    expect(host![0]).toMatch(/height:\s*20px;\s*padding:\s*0 6px/);
    expect(host![0]).toMatch(/font-size:\s*11px;\s*font-weight:\s*600/);
    expect(host![0]).toMatch(/pointer-events:\s*none/);
    // `:host([data-align=…])` compiles to the attribute and the host selector, in either order
    const aligned = (value: string, translate: string) =>
      new RegExp(
        `(\\[data-align=['"]?${value}['"]?\\]\\[_nghost-[^\\]]+\\]|\\[_nghost-[^\\]]+\\]\\[data-align=['"]?${value}['"]?\\])\\s*\\{\\s*translate:\\s*${translate};?\\s*\\}`,
      );
    expect(css).toMatch(aligned('center', '-50% 0'));
    expect(css).toMatch(aligned('end', '-100% 0'));
  });
});
