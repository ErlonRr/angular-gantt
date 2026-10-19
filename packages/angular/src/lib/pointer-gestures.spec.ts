// Pointer gestures on the timeline (Gantry 2 phase 9 step 4.6, D13), the Web Component's
// pointer-gestures suite in Angular: a mouse press drags after 3 px, a touch / pen press after a
// 350 ms long press (moving earlier pans), a non-passive touchmove is prevented only while
// dragging, pointercancel / Escape / destroy cancel, the drag follows the pointer in content
// coordinates and auto-scrolls near the edges; the hover writes `hoveredBarId`, the cursor and the
// tooltip calls; a tap toggles the tooltip. Bars are hit by geometry (the canvas box is at 0,0 in
// happy-dom: client and canvas coordinates are the same).
// Phase 10 step 4.7 (the Web Component's 4.1): a mouse press on a bar focuses that bar (a touch or
// pen drag too), with the pointer's modality (no focus ring); Escape belongs to the press while it
// lasts; a scroll of either pane clears the hover (the row hover itself is in hover.spec.ts).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  AUTO_SCROLL_EDGE,
  DRAG_THRESHOLD_PX,
  LONG_PRESS_MS,
  TOUCH_SLOP_PX,
  autoScrollDelta,
  type GanttOptions,
  type GanttTask,
  type TaskDragEvent,
  type TaskResizeEvent,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttCanvasComponent } from './layout/gantt-canvas.component';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttDragService } from './drag/gantt-drag.service';
import { GanttScrollService } from './scroll/gantt-scroll.service';
import { GanttTooltipState } from './tooltip/tooltip-state';
import { GanttSelectionService } from './selection/gantt-selection.service';

const TASKS: GanttTask[] = [
  { id: 'a', name: 'A', start: new Date(2026, 2, 2), end: new Date(2026, 2, 12) },
  { id: 'b', name: 'B', start: new Date(2026, 2, 4), end: new Date(2026, 2, 14) },
  { id: 'locked', name: 'Locked', start: new Date(2026, 2, 3), end: new Date(2026, 2, 13), draggable: false },
];

@Component({
  imports: [GantryComponent],
  template: `<gantry
    style="height: 400px"
    [series]="tasks"
    [options]="options()"
    [tooltipEnabled]="tooltip()"
    (taskDragged)="dragged.push($event)"
    (taskResized)="resized.push($event)"
  />`,
})
class Host {
  readonly tasks = TASKS;
  readonly options = signal<GanttOptions>({ viewMode: 'Day', initialScroll: false });
  readonly tooltip = signal(true);
  readonly dragged: TaskDragEvent[] = [];
  readonly resized: TaskResizeEvent[] = [];
  readonly gantt = viewChild.required(GantryComponent);
}

interface Chart {
  f: ComponentFixture<Host>;
  host: Host;
  gantt: GantryComponent;
  /** `gantt-canvas`: the canvas box and its `data-cursor` */
  canvas: HTMLElement;
  svg: SVGSVGElement;
  viewport: HTMLElement;
  layout: GanttLayoutService;
  drag: GanttDragService;
  scroll: GanttScrollService;
  tooltip: GanttTooltipState;
  /** The task-list pane (`.gantry-panel`) */
  panel: HTMLElement;
}

async function mount(setup?: (h: Host) => void): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  setup?.(f.componentInstance);
  await f.whenStable();
  const el = f.nativeElement as HTMLElement;
  const canvasDe = f.debugElement.query(By.directive(GanttCanvasComponent));
  const chart = f.debugElement.query(By.directive(GantryComponent));
  return {
    f,
    host: f.componentInstance,
    gantt: f.componentInstance.gantt(),
    canvas: canvasDe.nativeElement as HTMLElement,
    svg: el.querySelector<SVGSVGElement>('gantt-canvas svg')!,
    viewport: el.querySelector<HTMLElement>('.gantry-canvas-viewport')!,
    layout: chart.injector.get(GanttLayoutService),
    drag: chart.injector.get(GanttDragService),
    scroll: chart.injector.get(GanttScrollService),
    tooltip: canvasDe.injector.get(GanttTooltipState),
    panel: el.querySelector<HTMLElement>('.gantry-panel')!,
  };
}

/** From here on the long-press timer is driven by hand; renders are flushed with TestBed.tick() */
const fakeTimers = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type Kind = 'mouse' | 'touch' | 'pen';
const pointer = (type: string, x: number, y: number, kind: Kind = 'mouse', id = 1) =>
  new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    pointerId: id,
    pointerType: kind,
    clientX: x,
    clientY: y,
  });
/** Dispatches on `on` (a bar: the event target is then the bar), else on the timeline <svg>. */
const send = (c: Chart, type: string, x: number, y: number, kind: Kind = 'mouse', on?: Element, id = 1) => {
  const e = pointer(type, x, y, kind, id);
  (on ?? c.svg).dispatchEvent(e);
  return e;
};
const touchmove = (c: Chart, x: number, y: number): TouchEvent => {
  const e = new TouchEvent('touchmove', {
    bubbles: true,
    cancelable: true,
    touches: [new Touch({ identifier: 1, target: c.svg, clientX: x, clientY: y })],
  });
  c.svg.dispatchEvent(e);
  return e;
};
const click = (c: Chart, x: number, y: number) => {
  c.svg.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
  TestBed.tick();
};
const escape = (c: Chart) =>
  c.viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
const barEl = (c: Chart, id: string) => c.svg.querySelector<SVGGElement>(`.gantt-bars-layer > [data-task-id="${id}"]`)!;
const kind = (c: Chart) => c.drag.state().kind;
const px = (c: Chart) => c.layout.timeline().pxPerDay;
/** Middle of a bar's body */
const centre = (c: Chart, id: string) => {
  const v = c.gantt.getBarVisual(id)!;
  return { x: v.x + v.width / 2, y: v.cy, v };
};
const cursor = (c: Chart) => {
  TestBed.tick();
  return c.canvas.getAttribute('data-cursor');
};
const selected = (c: Chart) => c.gantt.getSelectedTasks().map(t => t.id);

describe('mouse press', () => {
  it('drags only once the pointer has moved 3 px, from where it was pressed', async () => {
    const c = await mount();
    const capture = vi.spyOn(c.svg, 'setPointerCapture');
    const { x, y } = centre(c, 'a');

    const down = send(c, 'pointerdown', x, y, 'mouse', barEl(c, 'a'));
    // No text selection or native focus: the pressed bar takes keyboard focus, the pointer is captured
    expect(down.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(barEl(c, 'a'));
    expect(c.layout.focusVisibleBarId()).toBeNull();
    expect(capture).toHaveBeenCalledWith(1);
    expect(kind(c)).toBe('idle');

    send(c, 'pointermove', x + DRAG_THRESHOLD_PX - 1, y);
    expect(kind(c)).toBe('idle');
    expect(c.drag.preview()).toBeNull();

    send(c, 'pointermove', x + DRAG_THRESHOLD_PX, y);
    expect(kind(c)).toBe('dragging');
    expect(c.drag.preview()).not.toBeNull();

    send(c, 'pointermove', x + 2 * px(c), y);
    send(c, 'pointerup', x + 2 * px(c), y);
    TestBed.tick();
    expect(kind(c)).toBe('idle');
    expect(c.host.dragged).toHaveLength(1);
    expect(c.host.dragged[0]).toMatchObject({ taskId: 'a', daysMoved: 2 });
  });

  it('a press that does not move is a click: it selects the row; the click that ends a drag does not', async () => {
    const c = await mount();
    const { x, y } = centre(c, 'a');

    send(c, 'pointerdown', x, y, 'mouse', barEl(c, 'a'));
    send(c, 'pointermove', x + 1, y);
    send(c, 'pointerup', x + 1, y);
    expect(kind(c)).toBe('idle');
    click(c, x, y);
    expect(selected(c)).toEqual(['a']);

    c.gantt.clearSelection();
    send(c, 'pointerdown', x, y, 'mouse', barEl(c, 'a'));
    send(c, 'pointermove', x + 2 * px(c), y);
    send(c, 'pointerup', x + 2 * px(c), y);
    click(c, x, y);
    expect(selected(c)).toEqual([]);
  });

  it('resizes from a handle, with the resize cursor while resizing', async () => {
    const c = await mount();
    const v = c.gantt.getBarVisual('a')!;
    const x = v.x + v.width - 2;
    send(c, 'pointerdown', x, v.cy);
    send(c, 'pointermove', x + px(c), v.cy);
    expect(kind(c)).toBe('resizing-right');
    expect(cursor(c)).toBe('ew-resize');
    send(c, 'pointerup', x + px(c), v.cy);
    expect(c.host.resized).toHaveLength(1);
    expect(c.host.resized[0]).toMatchObject({ taskId: 'a', handle: 'right', daysDelta: 1 });
  });

  it('leaves a bar that cannot be dragged to the plain click (no capture), focusing that bar', async () => {
    const c = await mount();
    const capture = vi.spyOn(c.svg, 'setPointerCapture');
    const { x, y } = centre(c, 'locked');
    const down = send(c, 'pointerdown', x, y, 'mouse', barEl(c, 'locked'));
    // The bar takes focus itself (no native focus elsewhere, no text selection)
    expect(down.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(barEl(c, 'locked'));
    send(c, 'pointermove', x + 3 * px(c), y);
    expect(kind(c)).toBe('idle');
    send(c, 'pointerup', x + 3 * px(c), y);
    expect(capture).not.toHaveBeenCalled();
    // Drag off: no press on any bar, but a press still focuses the bar it hits (by geometry)
    c.host.options.update(o => ({ ...o, enableDrag: false }));
    await c.f.whenStable();
    const a = centre(c, 'a');
    send(c, 'pointerdown', a.x, a.y);
    expect(document.activeElement).toBe(barEl(c, 'a'));
    send(c, 'pointermove', a.x + 3 * px(c), a.y);
    expect(kind(c)).toBe('idle');
    send(c, 'pointerup', a.x + 3 * px(c), a.y);
    // Off the bars: nothing is prevented, focus stays where it was
    const off = send(c, 'pointerdown', 5, 5);
    expect(off.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(barEl(c, 'a'));
  });

  it('a pressed bar keeps the pointer modality: no focus ring and no focus tooltip, until a key is pressed', async () => {
    const c = await mount();
    const focusTip = vi.spyOn(c.tooltip, 'focus');
    const { x, y } = centre(c, 'b');
    // A keyboard user's last input was a key: the press makes the pointer the modality
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    send(c, 'pointerdown', x, y, 'mouse', barEl(c, 'b'));
    send(c, 'pointerup', x, y, 'mouse', barEl(c, 'b'));
    expect(document.activeElement).toBe(barEl(c, 'b'));
    expect(c.layout.focusedRowId()).toBe('b');
    expect(c.layout.focusVisibleBarId()).toBeNull();
    await c.f.whenStable();
    expect(focusTip).not.toHaveBeenCalled();
    // The pressed bar is the timeline's tab stop now
    expect(barEl(c, 'b').getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(barEl(c, 'b'));
  });

  it('ignores other buttons', async () => {
    const c = await mount();
    const { x, y } = centre(c, 'a');
    c.svg.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 2,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: x,
        clientY: y,
      }),
    );
    send(c, 'pointermove', x + 3 * px(c), y);
    expect(kind(c)).toBe('idle');
  });
});

describe('cancelling', () => {
  it('pointercancel ends a drag without emitting; later moves change nothing', async () => {
    const c = await mount();
    const { x, y } = centre(c, 'a');
    send(c, 'pointerdown', x, y);
    send(c, 'pointermove', x + px(c), y);
    expect(kind(c)).toBe('dragging');
    send(c, 'pointercancel', x + px(c), y);
    expect(kind(c)).toBe('idle');
    expect(c.drag.preview()).toBeNull();
    expect(cursor(c)).toBeNull();
    send(c, 'pointermove', x + 3 * px(c), y);
    send(c, 'pointerup', x + 3 * px(c), y);
    expect(c.host.dragged).toEqual([]);
  });

  it('Escape cancels a drag, and the click that ends it selects nothing', async () => {
    const c = await mount();
    const { x, y } = centre(c, 'a');
    send(c, 'pointerdown', x, y);
    send(c, 'pointermove', x + 2 * px(c), y);
    expect(kind(c)).toBe('dragging');
    escape(c);
    expect(kind(c)).toBe('idle');
    send(c, 'pointermove', x + 3 * px(c), y);
    expect(kind(c)).toBe('idle');
    send(c, 'pointerup', x + 3 * px(c), y);
    click(c, x, y);
    expect(c.host.dragged).toEqual([]);
    expect(selected(c)).toEqual([]);
  });

  it("Escape is the press's while it lasts: consumed before the chart and the page hear it, then theirs again", async () => {
    const c = await mount();
    const selection = c.f.debugElement.query(By.directive(GantryComponent)).injector.get(GanttSelectionService);
    const onKey = vi.fn();
    document.addEventListener('keydown', onKey);
    c.gantt.setSelectedTasks(['b']);
    await c.f.whenStable();
    const { x, y } = centre(c, 'a');
    send(c, 'pointerdown', x, y, 'mouse', barEl(c, 'a'));
    send(c, 'pointermove', x + 2 * px(c), y);
    expect(kind(c)).toBe('dragging');
    // On the pressed bar, which holds focus
    const esc = () => {
      const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      barEl(c, 'a').dispatchEvent(e);
      return e;
    };
    expect(esc().defaultPrevented).toBe(true);
    expect(kind(c)).toBe('idle');
    expect(c.drag.preview()).toBeNull();
    // Not a keyboard focus (no ring, no focus tooltip), the selection stays, the page saw nothing
    expect(c.layout.focusVisibleBarId()).toBeNull();
    expect(c.tooltip.visibleId()).toBeNull();
    expect([...selection.selectedIds()]).toEqual(['b']);
    expect(onKey).not.toHaveBeenCalled();
    send(c, 'pointerup', x + 2 * px(c), y);
    // The press is over: the next Escape is the chart's (a key shows the focused bar's ring; with
    // no tooltip to close first it clears the selection) and the page's
    c.host.tooltip.set(false);
    await c.f.whenStable();
    esc();
    expect(c.layout.focusVisibleBarId()).toBe('a');
    expect(selected(c)).toEqual([]);
    expect(onKey).toHaveBeenCalledOnce();
    document.removeEventListener('keydown', onKey);
  });

  it('Escape ends an undecided press: moving afterwards does not drag', async () => {
    const c = await mount();
    const { x, y } = centre(c, 'a');
    send(c, 'pointerdown', x, y);
    escape(c);
    send(c, 'pointermove', x + 3 * px(c), y);
    expect(kind(c)).toBe('idle');
  });

  it('destroying the chart ends a drag in progress: no event, no listener left', async () => {
    const c = await mount();
    const { x, y } = centre(c, 'a');
    const added = vi.spyOn(c.svg, 'addEventListener');
    send(c, 'pointerdown', x, y);
    send(c, 'pointermove', x + 2 * px(c), y);
    expect(kind(c)).toBe('dragging');
    // The press listens to its pointer until it ends, through one abort signal
    const press = added.mock.calls.filter(call => ['pointermove', 'pointerup', 'pointercancel'].includes(call[0]));
    expect(press).toHaveLength(3);
    const signals = press.map(call => (call[2] as AddEventListenerOptions).signal!);
    expect(signals.some(sig => sig.aborted)).toBe(false);

    c.f.destroy();
    expect(kind(c)).toBe('idle');
    expect(signals.every(sig => sig.aborted)).toBe(true);
    send(c, 'pointermove', x + 3 * px(c), y);
    send(c, 'pointerup', x + 3 * px(c), y);
    expect(c.drag.preview()).toBeNull();
    expect(c.host.dragged).toEqual([]);
  });
});

describe('touch and pen press', () => {
  it('drags after a 350 ms long press; the touchmove is prevented only while dragging', async () => {
    const c = await mount();
    fakeTimers();
    const { x, y } = centre(c, 'a');

    const down = send(c, 'pointerdown', x, y, 'touch', barEl(c, 'a'));
    // The browser may still pan: nothing is prevented, focus stays where it was
    expect(down.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(barEl(c, 'a'));
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(kind(c)).toBe('idle');
    expect(touchmove(c, x, y).defaultPrevented).toBe(false);

    vi.advanceTimersByTime(1);
    expect(kind(c)).toBe('dragging');
    // The dragged bar takes focus once the drag starts, with no focus ring
    expect(document.activeElement).toBe(barEl(c, 'a'));
    expect(c.layout.focusVisibleBarId()).toBeNull();
    expect(touchmove(c, x + px(c), y).defaultPrevented).toBe(true);
    // The held finger opens no context menu on the bar it drags
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    barEl(c, 'a').dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);

    send(c, 'pointermove', x + 2 * px(c), y, 'touch');
    send(c, 'pointerup', x + 2 * px(c), y, 'touch');
    expect(c.host.dragged[0]).toMatchObject({ taskId: 'a', daysMoved: 2 });
    expect(touchmove(c, x, y).defaultPrevented).toBe(false);
  });

  it('a pen drags after a long press too', async () => {
    const c = await mount();
    fakeTimers();
    const { x, y } = centre(c, 'a');
    send(c, 'pointerdown', x, y, 'pen');
    send(c, 'pointermove', x + DRAG_THRESHOLD_PX + 1, y, 'pen');
    expect(kind(c)).toBe('idle');
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(kind(c)).toBe('dragging');
    send(c, 'pointerup', x + DRAG_THRESHOLD_PX + 1, y, 'pen');
    expect(kind(c)).toBe('idle');
  });

  it('a touch that moves before the long press pans: no drag, no tap', async () => {
    const c = await mount();
    fakeTimers();
    const tap = vi.spyOn(c.tooltip, 'tap');
    const { x, y } = centre(c, 'a');
    send(c, 'pointerdown', x, y, 'touch', barEl(c, 'a'));
    send(c, 'pointermove', x + TOUCH_SLOP_PX + 1, y, 'touch');
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(kind(c)).toBe('idle');
    expect(touchmove(c, x + 40, y).defaultPrevented).toBe(false);
    send(c, 'pointerup', x + 40, y, 'touch');
    expect(c.host.dragged).toEqual([]);
    expect(tap).not.toHaveBeenCalled();
  });

  it('a tap toggles the tooltip of the bar (also one that cannot be dragged); a touch never hovers', async () => {
    const c = await mount();
    fakeTimers();
    const tap = vi.spyOn(c.tooltip, 'tap');
    const hover = vi.spyOn(c.tooltip, 'hover');
    const unhover = vi.spyOn(c.tooltip, 'unhover');
    const { x, y } = centre(c, 'a');

    send(c, 'pointermove', x, y, 'touch', barEl(c, 'a'));
    expect(hover).not.toHaveBeenCalled();
    expect(c.layout.hoveredBarId()).toBeNull();

    send(c, 'pointerdown', x, y, 'touch', barEl(c, 'a'));
    vi.advanceTimersByTime(100);
    send(c, 'pointerup', x, y, 'touch', barEl(c, 'a'));
    expect(tap).toHaveBeenCalledOnce();
    expect(tap.mock.calls[0][0].task.id).toBe('a');
    expect(tap.mock.calls[0][1]).toBe(barEl(c, 'a'));
    // The finger lifting is not the pointer leaving: a tapped tooltip stays
    c.svg.dispatchEvent(pointer('pointerleave', x, y, 'touch'));
    expect(unhover).not.toHaveBeenCalled();

    const locked = centre(c, 'locked');
    send(c, 'pointerdown', locked.x, locked.y, 'touch', barEl(c, 'locked'));
    send(c, 'pointerup', locked.x, locked.y, 'touch', barEl(c, 'locked'));
    expect(tap).toHaveBeenCalledTimes(2);
    expect(tap.mock.calls[1][0].task.id).toBe('locked');
  });

  it('no tap with the tooltip off', async () => {
    const c = await mount(h => h.tooltip.set(false));
    const tap = vi.spyOn(c.tooltip, 'tap');
    const { x, y } = centre(c, 'a');
    send(c, 'pointerdown', x, y, 'touch', barEl(c, 'a'));
    send(c, 'pointerup', x, y, 'touch', barEl(c, 'a'));
    expect(tap).not.toHaveBeenCalled();
  });

  it('a second finger (a pinch) ends an undecided press, on the canvas or anywhere on the timeline', async () => {
    const c = await mount();
    fakeTimers();
    const { x, y } = centre(c, 'a');
    send(c, 'pointerdown', x, y, 'touch', undefined, 1);
    send(c, 'pointerdown', x + 60, y, 'touch', undefined, 2);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(kind(c)).toBe('idle');

    send(c, 'pointerdown', x, y, 'touch', undefined, 3);
    const touch = (id: number, cx: number) =>
      new Touch({ identifier: id, target: c.viewport, clientX: cx, clientY: 5 });
    c.viewport.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch(3, x), touch(4, x + 80)] }));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(kind(c)).toBe('idle');
  });

  it('destroying the chart ends an undecided press: the long press never starts a drag', async () => {
    const c = await mount();
    fakeTimers();
    const { x, y } = centre(c, 'a');
    send(c, 'pointerdown', x, y, 'touch');
    c.f.destroy();
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(kind(c)).toBe('idle');
    expect(c.drag.preview()).toBeNull();
  });

  it('the next press is clicked normally after a touch drag (which has no trailing click)', async () => {
    const c = await mount();
    fakeTimers();
    const { x, y } = centre(c, 'a');
    send(c, 'pointerdown', x, y, 'touch');
    vi.advanceTimersByTime(LONG_PRESS_MS);
    send(c, 'pointermove', x + 2 * px(c), y, 'touch');
    send(c, 'pointerup', x + 2 * px(c), y, 'touch');
    expect(c.drag.lastDragMoved).toBe(true);
    TestBed.tick();

    const b = centre(c, 'b');
    send(c, 'pointerdown', b.x, b.y);
    send(c, 'pointerup', b.x, b.y);
    click(c, b.x, b.y);
    expect(selected(c)).toEqual(['b']);
  });
});

describe('drag in content coordinates', () => {
  it('a scroll under a still pointer moves the bar by as much', async () => {
    const c = await mount();
    const { x, y } = centre(c, 'a');
    send(c, 'pointerdown', x, y);
    send(c, 'pointermove', x + DRAG_THRESHOLD_PX, y);
    const before = c.drag.preview()!.x;
    c.viewport.scrollLeft = 3 * px(c);
    send(c, 'pointermove', x + DRAG_THRESHOLD_PX, y);
    expect(c.drag.preview()!.x).toBe(before + 3 * px(c));
    send(c, 'pointerup', x + DRAG_THRESHOLD_PX, y);
    expect(c.host.dragged[0]).toMatchObject({ taskId: 'a', daysMoved: 3 });
  });
});

describe('auto-scroll while dragging', () => {
  const WIDTH = 400;
  /** The viewport spans client x 0…400; animation frames run by hand */
  function frames(c: Chart) {
    Object.defineProperty(c.viewport, 'clientWidth', { configurable: true, get: () => WIDTH });
    c.viewport.getBoundingClientRect = () => new DOMRect(0, 0, WIDTH, 300);
    c.layout.viewportWidth.set(WIDTH);
    const queue = new Map<number, FrameRequestCallback>();
    let ids = 0;
    const win = document.defaultView!;
    vi.spyOn(win, 'requestAnimationFrame').mockImplementation(cb => {
      queue.set(++ids, cb);
      return ids;
    });
    vi.spyOn(win, 'cancelAnimationFrame').mockImplementation(id => queue.delete(id));
    return {
      pending: () => queue.size,
      next: () => {
        const cbs = [...queue.values()];
        queue.clear();
        for (const cb of cbs) cb(0);
      },
    };
  }
  /** The model's scroll range */
  const maxLeft = (c: Chart) => c.layout.timeline().totalWidth - WIDTH;

  it('scrolls one core step per frame near the right edge, the dragged bar following, until the drag ends', async () => {
    const c = await mount();
    const { x, y } = centre(c, 'a');
    const run = frames(c);
    send(c, 'pointerdown', x, y);
    send(c, 'pointermove', x + DRAG_THRESHOLD_PX, y);
    // Into the right edge zone
    const edge = WIDTH - AUTO_SCROLL_EDGE / 2;
    const step = autoScrollDelta(edge, 0, WIDTH);
    expect(step).toBeGreaterThan(0);
    expect(maxLeft(c)).toBeGreaterThan(4 * step);
    send(c, 'pointermove', edge, y);
    const atEdge = c.drag.preview()!;
    expect(c.viewport.scrollLeft).toBe(0);
    expect(run.pending()).toBe(1);
    run.next();
    expect(c.viewport.scrollLeft).toBe(step);
    run.next();
    expect(c.viewport.scrollLeft).toBe(2 * step);
    // The windowed header and grid see each jump at once (no scroll event needed)
    expect(c.scroll.scrollLeft()).toBe(2 * step);
    // The bar moved with the content: its preview is where content x = edge + the scroll puts it
    const session = c.drag.preview()!;
    expect(session.x).toBeGreaterThanOrEqual(atEdge.x);
    expect(session.delta).toBe(Math.round((edge + 2 * step - x) / px(c)));

    // Back in the middle: the loop stops
    send(c, 'pointermove', WIDTH / 2, y);
    run.next();
    run.next();
    expect(c.viewport.scrollLeft).toBe(2 * step);
    expect(run.pending()).toBe(0);

    // At the edge again, then released: nothing more is scheduled
    send(c, 'pointermove', edge, y);
    expect(run.pending()).toBe(1);
    send(c, 'pointerup', edge, y);
    expect(run.pending()).toBe(0);
    expect(c.host.dragged[0]).toMatchObject({ taskId: 'a' });
  });

  it('stops at the end of the scroll range, and scrolls back near the left edge', async () => {
    const c = await mount();
    const { x, y } = centre(c, 'a');
    const run = frames(c);
    c.viewport.scrollLeft = maxLeft(c) - 5;
    send(c, 'pointerdown', x, y);
    send(c, 'pointermove', WIDTH - 1, y);
    run.next();
    expect(c.viewport.scrollLeft).toBe(maxLeft(c));
    run.next();
    expect(run.pending()).toBe(0);
    send(c, 'pointermove', 1, y);
    run.next();
    expect(c.viewport.scrollLeft).toBe(maxLeft(c) + autoScrollDelta(1, 0, WIDTH));
    send(c, 'pointercancel', 1, y);
    expect(run.pending()).toBe(0);
  });
});

describe('hover', () => {
  it('writes hoveredBarId from geometry for a mouse or pen, and clears it when the pointer leaves', async () => {
    const c = await mount();
    const v = c.gantt.getBarVisual('a')!;
    // Inside the right handle's reach but outside the bar's own shapes
    send(c, 'pointermove', v.x + v.width + 8, v.cy);
    expect(c.layout.hoveredBarId()).toBe('a');
    expect(cursor(c)).toBe('ew-resize');
    send(c, 'pointermove', v.x + v.width / 2, v.cy);
    expect(cursor(c)).toBe('grab');
    send(c, 'pointermove', v.x - 60, v.cy);
    expect(c.layout.hoveredBarId()).toBeNull();
    expect(cursor(c)).toBeNull();

    send(c, 'pointermove', v.x + v.width / 2, v.cy, 'pen');
    expect(c.layout.hoveredBarId()).toBe('a');
    c.svg.dispatchEvent(pointer('pointerleave', 0, 0, 'pen'));
    expect(c.layout.hoveredBarId()).toBeNull();
    expect(cursor(c)).toBeNull();
  });

  it('a bar that cannot be dragged is hovered, with no cursor of ours', async () => {
    const c = await mount();
    const { x, y } = centre(c, 'locked');
    send(c, 'pointermove', x, y);
    expect(c.layout.hoveredBarId()).toBe('locked');
    expect(cursor(c)).toBeNull();
  });

  it('opens the tooltip of the painted bar under the pointer (anchored to it), unhovers elsewhere', async () => {
    const c = await mount();
    const hover = vi.spyOn(c.tooltip, 'hover');
    const unhover = vi.spyOn(c.tooltip, 'unhover');
    const { x, y } = centre(c, 'a');
    send(c, 'pointermove', x, y, 'mouse', barEl(c, 'a').firstElementChild!);
    expect(hover).toHaveBeenCalledOnce();
    expect(hover.mock.calls[0][0].task.id).toBe('a');
    expect(hover.mock.calls[0][1]).toBe(barEl(c, 'a'));
    expect(hover.mock.calls[0][2]).toBe(x);
    send(c, 'pointermove', 5, 5);
    expect(unhover).toHaveBeenCalledOnce();
    c.svg.dispatchEvent(pointer('pointerleave', 0, 0));
    expect(unhover).toHaveBeenCalledTimes(2);
  });

  it('no tooltip calls with the tooltip off (the hover still writes the grips and the cursor)', async () => {
    const c = await mount(h => h.tooltip.set(false));
    const hover = vi.spyOn(c.tooltip, 'hover');
    const unhover = vi.spyOn(c.tooltip, 'unhover');
    const { x, y } = centre(c, 'a');
    send(c, 'pointermove', x, y, 'mouse', barEl(c, 'a'));
    send(c, 'pointermove', 5, 5);
    expect(hover).not.toHaveBeenCalled();
    expect(unhover).not.toHaveBeenCalled();
    send(c, 'pointermove', x, y, 'mouse', barEl(c, 'a'));
    expect(c.layout.hoveredBarId()).toBe('a');
    expect(cursor(c)).toBe('grab');
  });

  it('a drag dismisses the tooltip and hides the grips; the release hovers again', async () => {
    const c = await mount();
    const dismiss = vi.spyOn(c.tooltip, 'dismiss');
    const hover = vi.spyOn(c.tooltip, 'hover');
    const { x, y } = centre(c, 'a');
    send(c, 'pointermove', x, y, 'mouse', barEl(c, 'a'));
    expect(c.layout.hoveredBarId()).toBe('a');
    send(c, 'pointerdown', x, y, 'mouse', barEl(c, 'a'));
    expect(dismiss).not.toHaveBeenCalled();
    send(c, 'pointermove', x + px(c), y);
    expect(dismiss).toHaveBeenCalled();
    expect(c.layout.hoveredBarId()).toBeNull();
    expect(cursor(c)).toBe('grabbing');
    // Moves while dragging don't hover
    send(c, 'pointermove', x + 2 * px(c), y, 'mouse', barEl(c, 'b'));
    expect(hover).toHaveBeenCalledOnce();
    send(c, 'pointerup', x + px(c), y);
    // The bar moved with the pointer: it is under it again
    expect(c.layout.hoveredBarId()).toBe('a');
    expect(cursor(c)).toBe('grab');
  });

  it('a scroll of either pane clears the hovered bar, its grips, the row and the cursor; a drag keeps its cursor', async () => {
    const c = await mount();
    const { x, y } = centre(c, 'a');
    for (const pane of [c.viewport, c.panel]) {
      send(c, 'pointermove', x, y, 'mouse', barEl(c, 'a'));
      expect(c.layout.hoveredBarId()).toBe('a');
      expect(c.layout.hoveredRowId()).toBe('a');
      expect(cursor(c)).toBe('grab');
      pane.dispatchEvent(new Event('scroll'));
      expect(c.layout.hoveredBarId()).toBeNull();
      expect(c.layout.hoveredRowId()).toBeNull();
      expect(cursor(c)).toBeNull();
    }
    // The next move hovers again
    send(c, 'pointermove', x, y);
    expect(c.layout.hoveredBarId()).toBe('a');
    // While a bar is dragged (the viewport auto-scrolls) the cursor stays
    send(c, 'pointerdown', x, y);
    send(c, 'pointermove', x + 2 * px(c), y);
    expect(cursor(c)).toBe('grabbing');
    c.viewport.dispatchEvent(new Event('scroll'));
    expect(cursor(c)).toBe('grabbing');
    send(c, 'pointerup', x + 2 * px(c), y);
  });

  it('measures the canvas box once per hover, again after a scroll, a resize of the panes or re-entering', async () => {
    const c = await mount();
    const measure = vi.spyOn(c.canvas, 'getBoundingClientRect');
    const { x, y } = centre(c, 'a');
    send(c, 'pointermove', x, y);
    send(c, 'pointermove', x + 1, y);
    send(c, 'pointermove', x + 2, y);
    expect(measure).toHaveBeenCalledTimes(1);
    c.viewport.dispatchEvent(new Event('scroll'));
    send(c, 'pointermove', x, y);
    expect(measure).toHaveBeenCalledTimes(2);
    c.layout.viewportWidth.set(c.layout.viewportWidth() + 10);
    send(c, 'pointermove', x, y);
    expect(measure).toHaveBeenCalledTimes(3);
    document.defaultView!.dispatchEvent(new Event('resize'));
    send(c, 'pointermove', x, y);
    expect(measure).toHaveBeenCalledTimes(4);
    c.svg.dispatchEvent(pointer('pointerenter', x, y));
    send(c, 'pointermove', x, y);
    expect(measure).toHaveBeenCalledTimes(5);
    send(c, 'pointermove', x, y);
    expect(measure).toHaveBeenCalledTimes(5);
  });

  it('the window listeners go with the chart', async () => {
    const c = await mount();
    const win = document.defaultView!;
    const removed = vi.spyOn(win, 'removeEventListener');
    c.f.destroy();
    expect(removed.mock.calls.map(call => call[0]).sort()).toEqual(expect.arrayContaining(['resize', 'scroll']));
  });
});

describe('touch styles', () => {
  it('the timeline pans (and only pans) by touch, with no text selection or callout', async () => {
    const c = await mount();
    const style = getComputedStyle(c.svg);
    expect(style.getPropertyValue('touch-action')).toBe('pan-x pan-y');
    expect(style.getPropertyValue('user-select')).toBe('none');
  });

  it('the cursor is a data attribute styled by the stylesheet (no inline style)', async () => {
    const c = await mount();
    const { x, y } = centre(c, 'a');
    send(c, 'pointermove', x, y);
    expect(cursor(c)).toBe('grab');
    expect(c.canvas.style.getPropertyValue('cursor')).toBe('');
    expect(getComputedStyle(c.canvas).cursor).toBe('grab');
    send(c, 'pointerdown', x, y);
    send(c, 'pointermove', x + px(c), y);
    expect(cursor(c)).toBe('grabbing');
    expect(getComputedStyle(c.canvas).cursor).toBe('grabbing');
    send(c, 'pointerup', x + px(c), y);
  });
});
