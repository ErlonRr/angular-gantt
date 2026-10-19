// Pointer editing on the timeline (Gantry 2 phase 11, step 4.5, D11 / D12 / D13, plan §3d–§3e), the
// Web Component's pointer-p11 suite in Angular: the bar overlay paints core `computeBarOverlay` (the
// progress grip and the link connectors on the hovered, keyboard-focused and — coarse pointers —
// selected bars; with editing off exactly the ring and the resize grips); the pointer hits those
// targets only where they show; a press on the progress grip drags the progress (`ProgressSession`,
// offset from the grip, one `taskProgressChanged` on release); a press on a connector that drags
// starts a drag-mode link, a click or tap on one arms a click-mode link that the next press on a bar
// finishes; a click on a deletable arrow selects it (no row click); the link preview is the svg's
// last child; the cursors follow the part under the pointer; the draggable state is
// `editRules(row).move`. The canvas box is at 0,0 in happy-dom: client and canvas coordinates agree.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Component,
  provideZonelessChangeDetection,
  signal,
  viewChild,
  ɵgetComponentDef as getComponentDef,
  type Type,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  DRAG_THRESHOLD_PX,
  LONG_PRESS_MS,
  ViewMode,
  hitTestBar,
  linkPreviewPathOf,
  type ArrowVisual,
  type BarVisual,
  type DependencyChangeEvent,
  type GanttOptions,
  type GanttTask,
  type LinkSide,
  type Rect,
  type TaskProgressEvent,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttCanvasComponent } from './layout/gantt-canvas.component';
import { GanttBarOverlayComponent } from './bars/bar-overlay.component';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttDragService } from './drag/gantt-drag.service';
import { GanttLinkService } from './editing/link';
import { GanttProgressService } from './editing/progress';

const day = (d: number) => new Date(2026, 2, d);
const plan = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(8), progress: 20 },
  { id: 'b', name: 'Beta', start: day(10), end: day(16), progress: 50, dependency: 'a' },
  { id: 'c', name: 'Gamma', start: day(4), end: day(10), progress: 0 },
];
const BASE: GanttOptions = { viewMode: ViewMode.Day, initialScroll: false };

@Component({
  imports: [GantryComponent],
  template: `<gantry
    style="height: 400px"
    [(series)]="tasks"
    [options]="options()"
    [tooltipEnabled]="false"
    (taskDragged)="log('taskDragged', $event)"
    (taskProgressChanged)="log('taskProgressChanged', $event)"
    (dependencyCreated)="log('dependencyCreated', $event)"
    (tasksChange)="log('tasksChange', $event)"
    (rowClick)="log('rowClick', $event)"
  />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(plan());
  readonly options = signal<GanttOptions>({ ...BASE, editing: true });
  readonly events: [string, unknown][] = [];
  readonly gantt = viewChild.required(GantryComponent);

  log(type: string, detail: unknown): void {
    this.events.push([type, detail]);
  }
}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  gantt: GantryComponent;
  layout: GanttLayoutService;
  drag: GanttDragService;
  link: GanttLinkService;
  progress: GanttProgressService;
  /** The canvas component (its painted arrows) */
  canvas: GanttCanvasComponent;
  /** `gantt-canvas`: its `data-cursor` */
  canvasEl: HTMLElement;
  svg: SVGSVGElement;
  viewport: HTMLElement;
}

async function mount(options: GanttOptions = { editing: true }, tasks: GanttTask[] = plan()): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  f.componentInstance.options.set({ ...BASE, ...options });
  f.componentInstance.tasks.set(tasks);
  await f.whenStable();
  const el = f.nativeElement as HTMLElement;
  const canvasDe = f.debugElement.query(By.directive(GanttCanvasComponent));
  const chart = f.debugElement.query(By.directive(GantryComponent));
  return {
    f,
    h: f.componentInstance,
    gantt: f.componentInstance.gantt(),
    layout: chart.injector.get(GanttLayoutService),
    drag: chart.injector.get(GanttDragService),
    link: chart.injector.get(GanttLinkService),
    progress: chart.injector.get(GanttProgressService),
    canvas: canvasDe.componentInstance as GanttCanvasComponent,
    canvasEl: canvasDe.nativeElement as HTMLElement,
    svg: el.querySelector<SVGSVGElement>('gantt-canvas svg')!,
    viewport: el.querySelector<HTMLElement>('.gantry-canvas-viewport')!,
  };
}

/** A coarse primary pointer (touch) from the next mount on */
function stubCoarse(): void {
  const win = document.defaultView!;
  const coarse = (q: string) => ({ matches: q === '(pointer: coarse)', media: q }) as MediaQueryList;
  if (typeof win.matchMedia === 'function') vi.spyOn(win, 'matchMedia').mockImplementation(coarse);
  else vi.stubGlobal('matchMedia', coarse);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const render = () => TestBed.tick();
const visual = (c: Chart, id: string): BarVisual => c.gantt.getBarVisual(id)!;
const bar = (c: Chart, id: string) => c.svg.querySelector<SVGGElement>(`.gantt-bars-layer > [data-task-id="${id}"]`)!;
const overlay = (c: Chart) => c.svg.querySelector<SVGGElement>('.gantt-bar-overlay');
const shapes = (c: Chart) => {
  render();
  return [...(overlay(c)?.children ?? [])].map(n => n.getAttribute('class'));
};
const box = (n: Element | null | undefined) =>
  n && ['x', 'y', 'width', 'height', 'rx'].map(a => Number(n.getAttribute(a)));
const rect = (r: Rect & { rx: number }) => [r.x, r.y, r.width, r.height, r.rx];
const cursor = (c: Chart) => {
  render();
  return c.canvasEl.getAttribute('data-cursor');
};
const raw = (c: Chart, id: string) => c.h.tasks().find(t => t.id === id)!;
const ofType = (c: Chart, type: string) => c.h.events.filter(([t]) => t === type).map(([, d]) => d);
/** The painted arrows (key and visual as the canvas hands them to `g[ganttArrow]`) */
const arrows = (c: Chart) => (c.canvas as unknown as { arrows(): { key: string; visual: ArrowVisual }[] }).arrows();

type Kind = 'mouse' | 'touch' | 'pen';
const send = (c: Chart, type: string, x: number, y: number, kind: Kind = 'mouse', id = 1): PointerEvent => {
  const e = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    pointerId: id,
    pointerType: kind,
    clientX: x,
    clientY: y,
  });
  c.svg.dispatchEvent(e);
  return e;
};
const click = (c: Chart, x: number, y: number) => {
  c.svg.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  render();
};
const escape = (c: Chart) =>
  c.viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
/** A key on the page, as a keyboard user would press one (focus becomes visible). */
const anyKey = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true, composed: true }));

/** Centre of a rect */
const mid = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
/** The mouse hovers `id`'s bar (its body's centre). */
const hover = (c: Chart, id: string) => {
  const v = visual(c, id);
  send(c, 'pointermove', v.x + v.width / 2, v.cy);
  render();
};
const connectorHit = (c: Chart, id: string, side: LinkSide) => mid(visual(c, id).connectors![side].hit);

/** A point on the (only) arrow that is off every bar (canvas px), and its key. */
function arrowPoint(c: Chart): { key: string; x: number; y: number } {
  const [arrow] = arrows(c);
  const pts = arrow.visual.points;
  const rowHeight = c.layout.cfg().rowHeight;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    for (let t = 0.1; t < 1; t += 0.1) {
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const geo = c.layout.rowGeometries()[Math.floor(y / rowHeight)];
      if (!geo || !hitTestBar(visual(c, geo.row.task.id), x, y)) return { key: arrow.key, x, y };
    }
  }
  throw new Error('no free point on the arrow');
}

/**
 * The compiled styles of a component, without the encapsulation attributes, the compiler's custom
 * property namespace placeholder and whitespace
 */
const css = (type: Type<unknown>) =>
  (getComponentDef(type)?.styles ?? [])
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\[_ng(content|host)-[^\]]+\]/g, '')
    .replace(/%NS%/g, '')
    .replace(/\s+/g, '');

describe('the bar overlay (computeBarOverlay)', () => {
  it('editing off: the hovered bar shows its resize grips only, as before', async () => {
    const c = await mount({});
    hover(c, 'a');
    expect(c.layout.hoveredBarId()).toBe('a');
    expect(shapes(c)).toEqual(['gantt-bar-grip', 'gantt-bar-grip']);
    expect(visual(c, 'a').progressGrip).toBeNull();
    expect(visual(c, 'a').connectors).toBeNull();
  });

  it('editing on: the hovered bar adds its progress grip and its connectors, in that order, at their rects', async () => {
    const c = await mount();
    hover(c, 'a');
    expect(shapes(c)).toEqual([
      'gantt-bar-grip',
      'gantt-bar-grip',
      'gantt-progress-grip',
      'gantt-link-connector',
      'gantt-link-connector',
    ]);
    const v = visual(c, 'a');
    const [, , grip, start, end] = overlay(c)!.children;
    expect(box(grip)).toEqual(rect(v.progressGrip!.grip));
    expect(box(start)).toEqual(rect(v.connectors!.start.dot));
    expect(box(end)).toEqual(rect(v.connectors!.end.dot));
  });

  it('the keyboard-focused bar shows its ring first, then the same shapes', async () => {
    const c = await mount();
    anyKey();
    bar(c, 'c').focus();
    await c.f.whenStable();
    expect(c.layout.focusVisibleBarId()).toBe('c');
    expect(shapes(c)).toEqual([
      'gantt-bar-focus-ring',
      'gantt-bar-grip',
      'gantt-bar-grip',
      'gantt-progress-grip',
      'gantt-link-connector',
      'gantt-link-connector',
    ]);
  });

  it('a coarse pointer shows them on the selected bars, and a tap or a long press there reaches them', async () => {
    stubCoarse();
    const c = await mount();
    expect(overlay(c)).toBeNull();
    c.gantt.setSelectedTasks(['a']);
    expect(shapes(c)).toContain('gantt-progress-grip');
    expect(shapes(c).filter(cls => cls === 'gantt-link-connector')).toHaveLength(2);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // A tap on the end connector of the selected bar arms a click-mode link
    const start = vi.spyOn(c.link, 'start');
    const at = connectorHit(c, 'a', 'end');
    send(c, 'pointerdown', at.x, at.y, 'touch');
    send(c, 'pointerup', at.x, at.y, 'touch');
    expect(start).toHaveBeenCalledWith('a', 'end', 'click', at);
    // A long press on the progress grip drags the progress
    c.link.cancel(true);
    render();
    const g = mid(visual(c, 'a').progressGrip!.hit);
    send(c, 'pointerdown', g.x, g.y, 'touch');
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(c.progress.active()).toBe(true);
    send(c, 'pointerup', g.x, g.y, 'touch');
    expect(c.progress.active()).toBe(false);
  });

  it('a link session marks the source connector and recolours the target one, with the same nodes', async () => {
    const c = await mount();
    hover(c, 'a');
    const nodes = [...overlay(c)!.children];
    c.layout.link.set({
      sourceId: 'a',
      side: 'end',
      mode: 'click',
      preview: { d: 'M0 0', valid: true, targetId: 'c', targetSide: 'start', type: 'FS', reason: null },
    });
    // a: the grips hide, the connectors stay (the same nodes); c: its connectors, the start one targeted
    expect(shapes(c)).toEqual([
      'gantt-link-connector',
      'gantt-link-connector gantt-link-connector--source',
      'gantt-link-connector gantt-link-connector--target',
      'gantt-link-connector',
    ]);
    expect(overlay(c)!.children[1]).toBe(nodes[4]);
    // An invalid target: the same node, recoloured
    const target = overlay(c)!.children[2];
    c.layout.link.update(l => l && { ...l, preview: l.preview && { ...l.preview, valid: false, reason: 'no' } });
    expect(shapes(c)[2]).toBe('gantt-link-connector gantt-link-connector--invalid');
    expect(overlay(c)!.children[2]).toBe(target);
  });
});

describe('pointer targets show before they are hit (D11)', () => {
  it('a bar that shows nothing: its grip spot moves the bar, its connector spot is off the bar', async () => {
    const c = await mount();
    const g = mid(visual(c, 'a').progressGrip!.hit);
    send(c, 'pointerdown', g.x, g.y);
    send(c, 'pointermove', g.x + DRAG_THRESHOLD_PX, g.y);
    expect(c.drag.state().kind).toBe('dragging');
    expect(c.progress.active()).toBe(false);
    send(c, 'pointerup', g.x + DRAG_THRESHOLD_PX, g.y);

    const start = vi.spyOn(c.link, 'start');
    const at = connectorHit(c, 'c', 'end');
    send(c, 'pointermove', 0, 0);
    const down = send(c, 'pointerdown', at.x, at.y);
    expect(down.defaultPrevented).toBe(false);
    send(c, 'pointerup', at.x, at.y);
    expect(start).not.toHaveBeenCalled();
  });

  it('hovered: the cursor is ew-resize on the progress grip, crosshair on a connector, grab on the body', async () => {
    const c = await mount();
    hover(c, 'a');
    expect(cursor(c)).toBe('grab');
    const g = mid(visual(c, 'a').progressGrip!.hit);
    send(c, 'pointermove', g.x, g.y);
    expect(cursor(c)).toBe('ew-resize');
    const at = connectorHit(c, 'a', 'end');
    send(c, 'pointermove', at.x, at.y);
    expect(cursor(c)).toBe('crosshair');
    // Still the hovered bar: its shapes stay
    expect(c.layout.hoveredBarId()).toBe('a');
    send(c, 'pointermove', at.x + 200, at.y + 200);
    expect(cursor(c)).toBeNull();
  });
});

describe('progress drag', () => {
  it('previews the progress, emits once on release, commits one undo step; the click after it selects nothing', async () => {
    const c = await mount();
    hover(c, 'a');
    const v = visual(c, 'a');
    const g = mid(v.progressGrip!.hit);
    send(c, 'pointerdown', g.x, g.y);
    send(c, 'pointermove', g.x + DRAG_THRESHOLD_PX, g.y);
    expect(c.progress.active()).toBe(true);
    expect(cursor(c)).toBe('ew-resize');
    expect(c.drag.state().kind).toBe('idle');

    // The pointer moves the edge by as much as it moves (from the grip, not from the press point)
    const to = g.x + (v.x + v.width * 0.6 - v.progressGrip!.x);
    send(c, 'pointermove', to, g.y);
    expect(c.layout.progressPreview()).toEqual({ taskId: 'a', progress: 60 });
    render();
    // The bar draws the preview; its grip follows it, though the hover went with the drag
    expect(c.layout.hoveredBarId()).toBeNull();
    const drawn = visual(c, 'a');
    expect(drawn.progressGrip!.x).toBeCloseTo(v.x + v.width * 0.6);
    expect(box(overlay(c)!.querySelector('.gantt-progress-grip'))).toEqual(rect(drawn.progressGrip!.grip));

    send(c, 'pointerup', to, g.y);
    click(c, to, g.y);
    expect(c.progress.active()).toBe(false);
    expect(c.layout.progressPreview()).toBeNull();
    expect(c.h.events.map(([t]) => t).filter(t => t !== 'rowClick')).toEqual(['taskProgressChanged', 'tasksChange']);
    expect(ofType(c, 'taskProgressChanged')[0] as TaskProgressEvent).toEqual({
      taskId: 'a',
      oldProgress: 20,
      newProgress: 60,
    });
    expect(raw(c, 'a').progress).toBe(60);
    expect(c.gantt.canUndo()).toBe(true);
    expect(ofType(c, 'rowClick')).toEqual([]);
    c.gantt.undo();
    expect(raw(c, 'a').progress).toBe(20);
  });

  it('starts where the grip is: a press beside the edge does not jump', async () => {
    const c = await mount();
    hover(c, 'c');
    const v = visual(c, 'c');
    // 0 %: the grip's target sits right of the left handle, away from the edge
    const g = mid(v.progressGrip!.hit);
    expect(g.x - v.progressGrip!.x).toBeGreaterThan(12);
    send(c, 'pointerdown', g.x, g.y);
    send(c, 'pointermove', g.x + DRAG_THRESHOLD_PX, g.y);
    expect(c.layout.progressPreview()).toEqual({ taskId: 'c', progress: 0 });
    send(c, 'pointerup', g.x + DRAG_THRESHOLD_PX, g.y);
    expect(raw(c, 'c').progress).toBe(0);
    expect(ofType(c, 'taskProgressChanged')).toEqual([]);
  });

  it('Escape cancels it: no change, the preview goes, the click after it selects nothing', async () => {
    const c = await mount();
    hover(c, 'a');
    const g = mid(visual(c, 'a').progressGrip!.hit);
    send(c, 'pointerdown', g.x, g.y);
    send(c, 'pointermove', g.x + 40, g.y);
    expect(c.layout.progressPreview()).not.toBeNull();
    escape(c);
    expect(c.progress.active()).toBe(false);
    expect(c.layout.progressPreview()).toBeNull();
    send(c, 'pointerup', g.x + 40, g.y);
    click(c, g.x + 40, g.y);
    expect(c.h.events).toEqual([]);
    expect(raw(c, 'a').progress).toBe(20);
  });

  it('a read-only task (`editable: false`) shows no grip and is no drag target', async () => {
    const c = await mount({ editing: true }, [{ ...plan()[0], editable: false }, plan()[2]]);
    hover(c, 'a');
    expect(shapes(c)).toEqual([]);
    expect(bar(c, 'a').classList.contains('gantt-bar-draggable')).toBe(false);
    expect(bar(c, 'c').classList.contains('gantt-bar-draggable')).toBe(true);
  });
});

describe('links from the pointer (D12)', () => {
  it('a press on a connector that drags starts a drag-mode link; released on a bar it finishes there', async () => {
    const c = await mount();
    const start = vi.spyOn(c.link, 'start');
    const move = vi.spyOn(c.link, 'move');
    const finish = vi.spyOn(c.link, 'finish');
    hover(c, 'a');
    const at = connectorHit(c, 'a', 'end');
    const down = send(c, 'pointerdown', at.x, at.y);
    expect(down.defaultPrevented).toBe(true);
    expect(start).not.toHaveBeenCalled();
    send(c, 'pointermove', at.x + DRAG_THRESHOLD_PX, at.y);
    expect(start).toHaveBeenCalledWith('a', 'end', 'drag', at);
    expect(c.layout.link()?.mode).toBe('drag');
    expect(cursor(c)).toBe('crosshair');
    expect(move).toHaveBeenLastCalledWith(at.x + DRAG_THRESHOLD_PX, at.y);

    // Onto the left part of c's bar (row 3): its start side, an FS link a → c
    const v = visual(c, 'c');
    const to = { x: v.x + 4, y: v.cy };
    send(c, 'pointermove', to.x, to.y);
    send(c, 'pointerup', to.x, to.y);
    click(c, to.x, to.y);
    expect(move).toHaveBeenLastCalledWith(to.x, to.y);
    expect(finish).toHaveBeenCalledOnce();
    expect(c.layout.link()).toBeNull();
    expect(ofType(c, 'dependencyCreated')).toHaveLength(1);
    expect(ofType(c, 'dependencyCreated')[0] as DependencyChangeEvent).toMatchObject({
      fromId: 'a',
      toId: 'c',
      type: 'FS',
    });
    expect(ofType(c, 'rowClick')).toEqual([]);
  });

  it('Escape during a link drag cancels it quietly', async () => {
    const c = await mount();
    const cancel = vi.spyOn(c.link, 'cancel');
    hover(c, 'a');
    const at = connectorHit(c, 'a', 'end');
    send(c, 'pointerdown', at.x, at.y);
    send(c, 'pointermove', at.x + 20, at.y + 20);
    expect(c.link.active()).toBe(true);
    escape(c);
    expect(cancel).toHaveBeenCalledWith(true);
    expect(c.link.active()).toBe(false);
  });

  it('a click on a connector arms a click-mode link: the pointer moves its preview, a click on a bar finishes it', async () => {
    const c = await mount();
    const start = vi.spyOn(c.link, 'start');
    const move = vi.spyOn(c.link, 'move');
    const finish = vi.spyOn(c.link, 'finish');
    hover(c, 'a');
    const at = connectorHit(c, 'a', 'end');
    send(c, 'pointerdown', at.x, at.y);
    send(c, 'pointerup', at.x, at.y);
    click(c, at.x, at.y);
    expect(start).toHaveBeenCalledWith('a', 'end', 'click', at);
    expect(c.layout.link()?.mode).toBe('click');
    // The arming click selects no row
    expect(ofType(c, 'rowClick')).toEqual([]);

    const v = visual(c, 'c');
    send(c, 'pointermove', v.x + 4, v.cy);
    expect(move).toHaveBeenLastCalledWith(v.x + 4, v.cy);
    expect(cursor(c)).toBe('crosshair');
    const down = send(c, 'pointerdown', v.x + 4, v.cy);
    expect(down.defaultPrevented).toBe(true);
    expect(finish).toHaveBeenCalledOnce();
    send(c, 'pointerup', v.x + 4, v.cy);
    click(c, v.x + 4, v.cy);
    expect(ofType(c, 'dependencyCreated')).toHaveLength(1);
    expect(ofType(c, 'dependencyCreated')[0] as DependencyChangeEvent).toMatchObject({
      fromId: 'a',
      toId: 'c',
      type: 'FS',
    });
    expect(ofType(c, 'rowClick')).toEqual([]);
    expect(c.layout.link()).toBeNull();
  });

  it('a press off the bars while armed cancels it (announced); a touch that pans keeps it armed', async () => {
    const c = await mount();
    const cancel = vi.spyOn(c.link, 'cancel');
    const finish = vi.spyOn(c.link, 'finish');
    hover(c, 'a');
    const at = connectorHit(c, 'a', 'end');
    send(c, 'pointerdown', at.x, at.y);
    send(c, 'pointerup', at.x, at.y);
    expect(c.link.active()).toBe(true);

    // A touch that pans: still armed
    send(c, 'pointerdown', 600, 10, 'touch', 2);
    send(c, 'pointermove', 640, 60, 'touch', 2);
    expect(c.link.active()).toBe(true);

    // A mouse press on nothing: cancelled, not quietly
    send(c, 'pointerdown', 900, 5);
    expect(cancel).toHaveBeenCalledWith();
    expect(finish).not.toHaveBeenCalled();
    expect(c.link.active()).toBe(false);
  });

  it('a tap on a bar finishes a click-mode link (touch acts on release)', async () => {
    stubCoarse();
    const c = await mount();
    c.gantt.setSelectedTasks(['a']);
    render();
    const at = connectorHit(c, 'a', 'end');
    send(c, 'pointerdown', at.x, at.y, 'touch');
    send(c, 'pointerup', at.x, at.y, 'touch');
    expect(c.link.active()).toBe(true);
    const v = visual(c, 'c');
    send(c, 'pointerdown', v.x + 4, v.cy, 'touch');
    expect(ofType(c, 'dependencyCreated')).toEqual([]);
    send(c, 'pointerup', v.x + 4, v.cy, 'touch');
    expect(ofType(c, 'dependencyCreated')).toHaveLength(1);
  });

  it('the preview is the svg’s last child while the session shows one, invalid on an invalid target', async () => {
    const c = await mount();
    const preview = () => c.svg.querySelector('.gantt-link-preview');
    expect(preview()).toBeNull();
    c.layout.link.set({ sourceId: 'a', side: 'end', mode: 'keyboard', preview: null });
    render();
    expect(preview()).toBeNull();
    c.layout.link.set({
      sourceId: 'a',
      side: 'end',
      mode: 'drag',
      preview: { d: 'M1 2L3 4', valid: false, targetId: 'c', targetSide: 'start', type: 'FS', reason: 'no' },
    });
    render();
    const path = preview()!;
    expect(c.svg.lastElementChild).toBe(path);
    expect(path.tagName.toLowerCase()).toBe('path');
    expect([...path.classList]).toEqual(['gantt-link-preview', 'gantt-link-preview--invalid']);
    expect(path.getAttribute('pointer-events')).toBe('none');
    // Drawn from the bars as they are now: a's end connector to c's start connector
    expect(path.getAttribute('d')).toBe(
      linkPreviewPathOf(visual(c, 'a'), 'end', { visual: visual(c, 'c'), side: 'start' }),
    );
    // Towards the pointer (no target): not invalid
    c.layout.link.update(l => l && { ...l, preview: l.preview && { ...l.preview, targetId: null, targetSide: null } });
    render();
    expect([...preview()!.classList]).toEqual(['gantt-link-preview']);
    c.layout.link.set(null);
    render();
    expect(preview()).toBeNull();
  });
});

describe('arrows (D13)', () => {
  it('with deletion on: the cursor is pointer over an arrow, a click selects it (painted selected) and no row', async () => {
    const c = await mount();
    const selectAt = vi.spyOn(c.link, 'selectAt');
    const p = arrowPoint(c);
    const width = arrows(c)[0].visual.width;
    send(c, 'pointermove', p.x, p.y);
    expect(cursor(c)).toBe('pointer');
    send(c, 'pointerdown', p.x, p.y);
    send(c, 'pointerup', p.x, p.y);
    click(c, p.x, p.y);
    expect(selectAt).toHaveBeenCalledWith(p.x, p.y);
    expect(c.layout.selectedLinkKey()).toBe(p.key);
    expect(ofType(c, 'rowClick')).toEqual([]);
    // Painted through layout.arrowSelection: the focus-ring paint, one px wider
    expect(arrows(c)[0].visual).toMatchObject({ selected: true, width: width + 1 });
    expect(c.svg.querySelector('.gantt-arrows path:not(.gantt-arrow-halo)')!.getAttribute('stroke-width')).toBe(
      String(width + 1),
    );

    // A click on a bar selects the row, not a link
    hover(c, 'c');
    const v = visual(c, 'c');
    send(c, 'pointerdown', v.x + v.width / 2, v.cy);
    send(c, 'pointerup', v.x + v.width / 2, v.cy);
    click(c, v.x + v.width / 2, v.cy);
    expect(c.layout.selectedLinkKey()).toBeNull();
    expect(ofType(c, 'rowClick')).toHaveLength(1);
  });

  it('editing off: no pointer cursor, no link selection, the click selects the row as before', async () => {
    const c = await mount({});
    const selectAt = vi.spyOn(c.link, 'selectAt');
    const p = arrowPoint(c);
    send(c, 'pointermove', p.x, p.y);
    expect(cursor(c)).toBeNull();
    click(c, p.x, p.y);
    expect(selectAt).not.toHaveBeenCalled();
    expect(ofType(c, 'rowClick')).toHaveLength(1);
  });
});

describe('draggable bars follow editRules(row).move', () => {
  it('a rolled-up parent (rollup.dates) is not draggable; its children are', async () => {
    const c = await mount({ rollup: true }, [
      { id: 'p', name: 'Parent', start: day(2), end: day(12) },
      { id: 'k', name: 'Kid', parentId: 'p', start: day(3), end: day(9) },
    ]);
    expect(bar(c, 'p').classList.contains('gantt-bar-draggable')).toBe(false);
    expect(bar(c, 'k').classList.contains('gantt-bar-draggable')).toBe(true);
    const v = visual(c, 'p');
    send(c, 'pointermove', v.x + v.width / 2, v.cy);
    expect(cursor(c)).toBeNull();
    send(c, 'pointerdown', v.x + v.width / 2, v.cy);
    send(c, 'pointermove', v.x + v.width / 2 + 40, v.cy);
    expect(c.drag.state().kind).toBe('idle');
  });
});

describe('styles', () => {
  it('cursors, connectors, the progress grip and the link preview have their rules, and forced-colours ones', () => {
    const canvas = css(GanttCanvasComponent);
    expect(canvas).toMatch(/\[data-cursor=['"]?crosshair['"]?\][^{]*\{cursor:crosshair;?\}/);
    expect(canvas).toMatch(/\[data-cursor=['"]?pointer['"]?\][^{]*\{cursor:pointer;?\}/);
    expect(canvas).toContain(
      '.gantt-link-preview{fill:var(--gantt-focus-ring);stroke:var(--gantt-focus-ring);stroke-width:2px;stroke-dasharray:43;}',
    );
    expect(canvas).toContain(
      '.gantt-link-preview--invalid{fill:var(--gantt-status-overdue);stroke:var(--gantt-status-overdue);}',
    );
    expect(canvas).toContain('.gantt-link-preview{fill:Highlight!important;stroke:Highlight!important;}');

    const overlayCss = css(GanttBarOverlayComponent);
    expect(overlayCss).toContain(
      '.gantt-progress-grip{fill:var(--gantt-bg);stroke:var(--gantt-focus-ring);stroke-width:1.5px;}',
    );
    expect(overlayCss).toContain(
      '.gantt-link-connector{fill:var(--gantt-bg);stroke:var(--gantt-focus-ring);stroke-width:1.5px;}',
    );
    expect(overlayCss).toContain('.gantt-link-connector--target{fill:var(--gantt-focus-ring);}');
    expect(overlayCss).toContain('.gantt-link-connector--invalid{stroke:var(--gantt-status-overdue);}');
    expect(overlayCss).toContain('.gantt-link-connector--target{fill:Highlight!important;}');
  });
});
