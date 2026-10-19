// Zoom gestures (Gantry 2 phase 9 step 4.6, D16), the Web Component's zoom suite in Angular:
// Ctrl/⌘ + wheel (and the trackpad pinch that arrives as one) through core `wheelZoom`, the
// two-finger touch pinch through `pinchZoomSteps`, Safari's gesture events; the zoom keeps the date
// under the pointer (the layout's `zoomAnchorX` → the chart's scroll sync → core
// `anchoredScrollLeft`), the API / toolbar zooms keep the centre. `bindZoomGestures` is also tested
// on its own with a stub host (the level it reads, no zoom while a bar is moved).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  anchoredScrollLeft,
  PINCH_ZOOM_RATIO,
  ViewMode,
  WHEEL_LINE_DELTA,
  WHEEL_ZOOM_DELTA,
  type GanttOptions,
  type GanttTask,
  type TimelineModel,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttScrollService } from './scroll/gantt-scroll.service';
import { bindZoomGestures, type ZoomGestureHost } from './scroll/zoom-gestures';
import { GanttDragService } from './drag/gantt-drag.service';

const TASKS: GanttTask[] = [
  { id: 'a', name: 'A', start: new Date(2025, 0, 6), end: new Date(2025, 0, 20) },
  { id: 'b', name: 'B', start: new Date(2025, 5, 2), end: new Date(2025, 5, 20) },
  { id: 'c', name: 'C', start: new Date(2026, 2, 2), end: new Date(2026, 2, 12) },
];
const WIDTH = 800;
/** One week of tasks: the Hour level over the 15 months of TASKS mounts ~11 000 header cells (slow, timed out) */
const SHORT_TASKS: GanttTask[] = [{ id: 's', name: 'S', start: new Date(2026, 2, 2), end: new Date(2026, 2, 6) }];

@Component({
  imports: [GantryComponent],
  template: `<gantry
    style="height: 400px"
    [series]="tasks"
    [options]="options()"
    (viewModeChange)="modes.push($event)"
  />`,
})
class Host {
  tasks = TASKS;
  readonly options = signal<GanttOptions>({ viewMode: ViewMode.Week, initialScroll: false });
  readonly modes: (string | undefined)[] = [];
  readonly gantt = viewChild.required(GantryComponent);
}

interface Chart {
  f: ComponentFixture<Host>;
  host: Host;
  gantt: GantryComponent;
  viewport: HTMLElement;
  layout: GanttLayoutService;
  scroll: GanttScrollService;
}

async function mount(viewMode: string = ViewMode.Week, tasks: GanttTask[] = TASKS): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  f.componentInstance.tasks = tasks;
  f.componentInstance.options.set({ viewMode, initialScroll: false });
  await f.whenStable();
  const chart = f.debugElement.query(By.directive(GantryComponent));
  const viewport = (f.nativeElement as HTMLElement).querySelector<HTMLElement>('.gantry-canvas-viewport')!;
  Object.defineProperty(viewport, 'clientWidth', { configurable: true, get: () => WIDTH });
  return {
    f,
    host: f.componentInstance,
    gantt: f.componentInstance.gantt(),
    viewport,
    layout: chart.injector.get(GanttLayoutService),
    scroll: chart.injector.get(GanttScrollService),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

const level = (c: Chart) => c.layout.level();
const timeline = (c: Chart): TimelineModel => c.layout.timeline();
/** The timeline scrolled to `left` (as the scroll listener records it) */
const scrollTo = (c: Chart, left: number) => {
  c.viewport.scrollLeft = left;
  c.scroll.scrollLeft.set(left);
};

interface WheelInit {
  ctrl?: boolean;
  meta?: boolean;
  mode?: number;
  clientX?: number;
}
/** A wheel over `target` (happy-dom's WheelEvent has no modifier keys or position) */
function wheelOn(
  target: EventTarget,
  deltaY: number,
  { ctrl = true, meta = false, mode = 0, clientX = 300 }: WheelInit = {},
): WheelEvent {
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY, deltaMode: mode });
  Object.defineProperties(e, { ctrlKey: { value: ctrl }, metaKey: { value: meta }, clientX: { value: clientX } });
  target.dispatchEvent(e);
  return e;
}
const wheel = (c: Chart, deltaY: number, init?: WheelInit) => wheelOn(c.viewport, deltaY, init);

const touch = (target: EventTarget, id: number, x: number, y = 40) =>
  new Touch({ identifier: id, target, clientX: x, clientY: y });
function touches(target: EventTarget, type: string, list: Touch[], cancelable = true): TouchEvent {
  const e = new TouchEvent(type, { bubbles: true, cancelable, touches: list });
  target.dispatchEvent(e);
  return e;
}
function gesture(target: EventTarget, type: string, scale: number, clientX = 200): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(e, { scale: { value: scale }, clientX: { value: clientX } });
  target.dispatchEvent(e);
  return e;
}

describe('Ctrl/⌘ + wheel', () => {
  it('zooms one level per 100 px, keeping the date under the pointer', async () => {
    const c = await mount();
    scrollTo(c, 1000);
    const prev = timeline(c);
    const first = wheel(c, -WHEEL_ZOOM_DELTA * 0.6);
    // The page doesn't zoom; not a whole level yet
    expect(first.defaultPrevented).toBe(true);
    expect(level(c)).toBe(ViewMode.Week);
    wheel(c, -WHEEL_ZOOM_DELTA * 0.4, { clientX: 300 });
    expect(level(c)).toBe(ViewMode.Day);
    expect(c.layout.zoomAnchorX()).toBe(300);

    await c.f.whenStable();
    const next = timeline(c);
    expect(next.pxPerDay).toBeGreaterThan(prev.pxPerDay);
    const expected = anchoredScrollLeft(prev, next, 1000, WIDTH, 300)!;
    expect(c.viewport.scrollLeft).toBe(expected);
    // The date under the pointer stayed there
    expect(Math.abs(next.toX(prev.toDate(1300)) - (expected + 300))).toBeLessThanOrEqual(1);
    // The anchor served this timeline only
    expect(c.layout.zoomAnchorX()).toBeNull();
  });

  it('anchors at the pointer inside the viewport box, clamped to its width', async () => {
    const c = await mount();
    c.viewport.getBoundingClientRect = () => new DOMRect(150, 0, WIDTH, 300);
    Object.defineProperty(c.viewport, 'clientLeft', { configurable: true, get: () => 2 });
    wheel(c, -WHEEL_ZOOM_DELTA, { clientX: 452 });
    expect(c.layout.zoomAnchorX()).toBe(300);
    await c.f.whenStable();
    wheel(c, WHEEL_ZOOM_DELTA, { clientX: 2000 });
    expect(c.layout.zoomAnchorX()).toBe(WIDTH);
    await c.f.whenStable();
    wheel(c, -WHEEL_ZOOM_DELTA, { clientX: 10 });
    expect(c.layout.zoomAnchorX()).toBe(0);
  });

  it('zooms out with a positive delta, ⌘ works like Ctrl, and the plain wheel keeps scrolling', async () => {
    const c = await mount();
    const plain = wheel(c, -300, { ctrl: false });
    expect(plain.defaultPrevented).toBe(false);
    expect(level(c)).toBe(ViewMode.Week);
    wheel(c, WHEEL_ZOOM_DELTA, { ctrl: false, meta: true });
    expect(level(c)).toBe(ViewMode.Month);
    // Two levels at once
    wheel(c, -2 * WHEEL_ZOOM_DELTA);
    expect(level(c)).toBe(ViewMode.Day);
  });

  it('counts lines and pages (deltaMode 1 / 2)', async () => {
    const c = await mount();
    // Three lines: 120 px, one level and a 20 px rest
    wheel(c, -3, { mode: 1 });
    expect(level(c)).toBe(ViewMode.Day);
    const rest = 3 * WHEEL_LINE_DELTA - WHEEL_ZOOM_DELTA;
    wheel(c, -(WHEEL_ZOOM_DELTA - rest - 1));
    expect(level(c)).toBe(ViewMode.Day);
    wheel(c, -1);
    expect(level(c)).toBe(ViewMode.Hour);
    // A page is a level
    wheel(c, 1, { mode: 2 });
    expect(level(c)).toBe(ViewMode.Day);
  });

  it('at the finest level nothing changes and no anchor is left behind', async () => {
    const c = await mount(ViewMode.Hour, SHORT_TASKS);
    const e = wheel(c, -500);
    expect(e.defaultPrevented).toBe(true);
    expect(level(c)).toBe(ViewMode.Hour);
    expect(c.layout.zoomAnchorX()).toBeNull();
  });

  it('emits viewModeChange like any zoom', async () => {
    const c = await mount();
    wheel(c, -WHEEL_ZOOM_DELTA);
    await c.f.whenStable();
    expect(c.host.modes).toEqual([ViewMode.Day]);
  });

  it('is heard on the timeline viewport only (the header in it too, not the task list)', async () => {
    const c = await mount();
    wheelOn(c.viewport.querySelector('.gantry-canvas-header-sticky')!, -WHEEL_ZOOM_DELTA);
    expect(level(c)).toBe(ViewMode.Day);
    const panel = (c.f.nativeElement as HTMLElement).querySelector('.gantry-panel')!;
    wheelOn(panel, -WHEEL_ZOOM_DELTA);
    expect(level(c)).toBe(ViewMode.Day);
  });

  it('starts counting again after a zoom from elsewhere', async () => {
    const c = await mount();
    wheel(c, -60);
    c.gantt.zoomOut();
    expect(level(c)).toBe(ViewMode.Month);
    wheel(c, -60);
    expect(level(c)).toBe(ViewMode.Month);
    wheel(c, -40);
    expect(level(c)).toBe(ViewMode.Week);
  });

  it('does not zoom while a bar is dragged, nor in keyboard move mode', async () => {
    const c = await mount(ViewMode.Day);
    const drag = c.f.debugElement.query(By.directive(GantryComponent)).injector.get(GanttDragService);
    drag.state.set({ kind: 'dragging', taskId: 'c' });
    expect(wheel(c, -WHEEL_ZOOM_DELTA).defaultPrevented).toBe(true);
    expect(level(c)).toBe(ViewMode.Day);
    drag.state.set({ kind: 'external', taskId: 'c' });
    wheel(c, -WHEEL_ZOOM_DELTA);
    expect(level(c)).toBe(ViewMode.Day);
    drag.state.set({ kind: 'idle' });
    wheel(c, -WHEEL_ZOOM_DELTA);
    expect(level(c)).toBe(ViewMode.Hour);
  });

  it('over the task list, Ctrl/⌘ + wheel is left to the browser', async () => {
    const c = await mount();
    const panel = (c.f.nativeElement as HTMLElement).querySelector('.gantry-panel')!;
    expect(wheelOn(panel, -WHEEL_ZOOM_DELTA).defaultPrevented).toBe(false);
    expect(wheelOn(panel, -WHEEL_ZOOM_DELTA, { meta: true, ctrl: false }).defaultPrevented).toBe(false);
    expect(wheelOn(panel, -WHEEL_ZOOM_DELTA, { ctrl: false }).defaultPrevented).toBe(true);
    expect(level(c)).toBe(ViewMode.Week);
  });
});

describe('anchoring', () => {
  it('API, toolbar and option zooms keep the date at the viewport centre', async () => {
    const c = await mount();
    scrollTo(c, 1200);
    let prev = timeline(c);
    c.gantt.zoomIn();
    await c.f.whenStable();
    expect(c.viewport.scrollLeft).toBe(anchoredScrollLeft(prev, timeline(c), 1200, WIDTH, null));

    // A gesture's anchor serves its own zoom only: a later zoom from the options keeps the centre
    wheel(c, WHEEL_ZOOM_DELTA, { clientX: 40 });
    await c.f.whenStable();
    const left = c.viewport.scrollLeft;
    c.scroll.scrollLeft.set(left);
    prev = timeline(c);
    c.host.options.set({ viewMode: ViewMode.Month, initialScroll: false });
    await c.f.whenStable();
    expect(c.viewport.scrollLeft).toBe(anchoredScrollLeft(prev, timeline(c), left, WIDTH, null));
  });
});

describe('touch pinch', () => {
  it('zooms one level per ×1.25 of spread at the fingers’ midpoint, holding the page still', async () => {
    const c = await mount();
    const v = c.viewport;
    scrollTo(c, 900);
    const prev = timeline(c);
    touches(v, 'touchstart', [touch(v, 1, 100), touch(v, 2, 200)]);
    const move = touches(v, 'touchmove', [touch(v, 1, 100), touch(v, 2, 100 + 100 * PINCH_ZOOM_RATIO)]);
    expect(move.defaultPrevented).toBe(true);
    expect(level(c)).toBe(ViewMode.Day);
    expect(c.layout.zoomAnchorX()).toBe((100 + 100 + 100 * PINCH_ZOOM_RATIO) / 2);
    await c.f.whenStable();
    expect(c.viewport.scrollLeft).toBe(anchoredScrollLeft(prev, timeline(c), 900, WIDTH, 162.5));

    // Back to the starting spread: one level out again; a smaller spread stays put meanwhile
    touches(v, 'touchmove', [touch(v, 1, 100), touch(v, 2, 210)]);
    expect(level(c)).toBe(ViewMode.Day);
    touches(v, 'touchmove', [touch(v, 1, 100), touch(v, 2, 200)]);
    expect(level(c)).toBe(ViewMode.Week);
    touches(v, 'touchend', [touch(v, 1, 100)]);
    // One finger: no pinch
    expect(touches(v, 'touchmove', [touch(v, 1, 300)]).defaultPrevented).toBe(false);
  });

  it('leaves a touch the browser already pans alone', async () => {
    const c = await mount();
    const v = c.viewport;
    touches(v, 'touchstart', [touch(v, 1, 100), touch(v, 2, 200)]);
    const move = touches(v, 'touchmove', [touch(v, 1, 100), touch(v, 2, 300)], false);
    expect(move.defaultPrevented).toBe(false);
    expect(level(c)).toBe(ViewMode.Week);
  });
});

describe('Safari gesture events', () => {
  it('zoom from the gesture scale and keep the page from zooming', async () => {
    const c = await mount();
    const v = c.viewport;
    expect(gesture(v, 'gesturestart', 1).defaultPrevented).toBe(true);
    expect(gesture(v, 'gesturechange', 1.1).defaultPrevented).toBe(true);
    expect(level(c)).toBe(ViewMode.Week);
    gesture(v, 'gesturechange', PINCH_ZOOM_RATIO, 250);
    expect(level(c)).toBe(ViewMode.Day);
    expect(c.layout.zoomAnchorX()).toBe(250);
    gesture(v, 'gesturechange', 0.75);
    expect(level(c)).toBe(ViewMode.Month);
    expect(gesture(v, 'gestureend', 0.75).defaultPrevented).toBe(true);
  });

  it('step aside while a touch pinch zooms (iOS sends both)', async () => {
    const c = await mount();
    const v = c.viewport;
    touches(v, 'touchstart', [touch(v, 1, 100), touch(v, 2, 200)]);
    gesture(v, 'gesturestart', 1);
    gesture(v, 'gesturechange', 2);
    expect(level(c)).toBe(ViewMode.Week);
  });
});

describe('bindZoomGestures', () => {
  /** A viewport 800 px wide at client x 0, and a host stub on the default levels */
  function setup(host: Partial<ZoomGestureHost> = {}) {
    const viewport = document.createElement('div');
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, get: () => WIDTH });
    document.body.appendChild(viewport);
    const zoom = vi.fn<(steps: number, anchorX: number) => void>();
    const unbind = bindZoomGestures(viewport, { zoom, ...host });
    return { viewport, zoom, unbind };
  }

  it('reports whole steps with the anchor, and unbinds every listener', () => {
    const { viewport, zoom, unbind } = setup();
    wheelOn(viewport, -WHEEL_ZOOM_DELTA * 2, { clientX: 120 });
    expect(zoom).toHaveBeenCalledWith(2, 120);
    gesture(viewport, 'gesturestart', 1);
    gesture(viewport, 'gesturechange', 1 / PINCH_ZOOM_RATIO, 80);
    expect(zoom).toHaveBeenLastCalledWith(-1, 80);
    gesture(viewport, 'gestureend', 1);

    unbind();
    zoom.mockClear();
    const e = wheelOn(viewport, -WHEEL_ZOOM_DELTA);
    expect(e.defaultPrevented).toBe(false);
    expect(gesture(viewport, 'gesturestart', 1).defaultPrevented).toBe(false);
    touches(viewport, 'touchstart', [touch(viewport, 1, 100), touch(viewport, 2, 200)]);
    touches(viewport, 'touchmove', [touch(viewport, 1, 100), touch(viewport, 2, 400)]);
    expect(zoom).not.toHaveBeenCalled();
    viewport.remove();
  });

  it('does not zoom while a bar is moved (pointer drag or keyboard move mode), still holding the page', () => {
    let busy = true;
    const { viewport, zoom } = setup({ busy: () => busy });
    expect(wheelOn(viewport, -WHEEL_ZOOM_DELTA).defaultPrevented).toBe(true);
    touches(viewport, 'touchstart', [touch(viewport, 1, 100), touch(viewport, 2, 200)]);
    touches(viewport, 'touchmove', [touch(viewport, 1, 100), touch(viewport, 2, 400)]);
    gesture(viewport, 'gesturestart', 1);
    gesture(viewport, 'gesturechange', 2);
    expect(zoom).not.toHaveBeenCalled();
    busy = false;
    gesture(viewport, 'gestureend', 1);
    wheelOn(viewport, -WHEEL_ZOOM_DELTA);
    expect(zoom).toHaveBeenCalledOnce();
    viewport.remove();
  });

  it('starts counting again after a zoom from elsewhere', () => {
    let shown = 'Week';
    const { viewport, zoom } = setup({ level: () => shown });
    wheelOn(viewport, -60);
    // The toolbar (or the API, the keyboard) zoomed out meanwhile
    shown = 'Month';
    wheelOn(viewport, -60);
    expect(zoom).not.toHaveBeenCalled();
    wheelOn(viewport, -40);
    expect(zoom).toHaveBeenCalledWith(1, 300);
    viewport.remove();
  });
});
