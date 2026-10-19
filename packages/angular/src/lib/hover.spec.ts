// Row hover (Gantry 2 phase 10, step 4.7, D4, §3c of its plan; the Web Component's hover.test.ts):
// the row under a mouse or pen pointer, in either pane, is `layout.hoveredRowId`. The timeline shows
// it as one `rect.gantt-row-hover` right after `g.gantt-rows` (x 0, the row's y and height, the
// timeline width, its fill the stylesheet's `var(--gantt-row-hover-bg)`), attached only while a
// mounted row is hovered and the view is not `table`; the task list as `.gantt-tl-row--hover` (a
// background-image tint). The task list hears it by delegation (`pointerover` / `pointerleave`),
// the timeline by geometry (core `rowIndexAtY`); leaving, a scroll of either pane and a drag
// starting clear it; a touch never hovers. Forced colours hide both. The canvas box is at 0,0 in
// happy-dom: client and canvas coordinates are the same.
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
import { ViewMode, type GanttOptions, type GanttTask } from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttCanvasComponent } from './layout/gantt-canvas.component';
import { GanttTaskListComponent } from './tasklist/gantt-tasklist.component';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttDragService } from './drag/gantt-drag.service';
import { GanttScrollService } from './scroll/gantt-scroll.service';

/** `n` one-week tasks in March 2026. */
function plan(n: number): GanttTask[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Task ${i}`,
    start: new Date(2026, 2, 2 + (i % 20)),
    end: new Date(2026, 2, 9 + (i % 20)),
    progress: (i * 7) % 100,
  }));
}

@Component({
  imports: [GantryComponent],
  template: `<gantry style="height: 400px" [series]="tasks()" [options]="options()" />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(plan(6));
  readonly options = signal<GanttOptions>({ viewMode: ViewMode.Day, initialScroll: false });
  readonly gantt = viewChild.required(GantryComponent);
}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  gantt: GantryComponent;
  layout: GanttLayoutService;
  drag: GanttDragService;
  scroll: GanttScrollService;
  /** The timeline <svg> (its pointer listeners) */
  svg: SVGSVGElement;
  viewport: HTMLElement;
  panel: HTMLElement;
  /** Runs `change` and waits for the render */
  set(change: () => void): Promise<void>;
}

async function mount(n = 6): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  f.componentInstance.tasks.set(plan(n));
  await f.whenStable();
  const el = f.nativeElement as HTMLElement;
  const debug = f.debugElement.query(By.directive(GantryComponent));
  return {
    f,
    h: f.componentInstance,
    gantt: f.componentInstance.gantt(),
    layout: debug.injector.get(GanttLayoutService),
    drag: debug.injector.get(GanttDragService),
    scroll: debug.injector.get(GanttScrollService),
    svg: el.querySelector<SVGSVGElement>('gantt-canvas svg')!,
    viewport: el.querySelector<HTMLElement>('.gantry-canvas-viewport')!,
    panel: el.querySelector<HTMLElement>('.gantry-panel')!,
    async set(change) {
      change();
      await f.whenStable();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

const root = (c: Chart) => c.f.nativeElement as HTMLElement;
const hoverRect = (c: Chart) => root(c).querySelector<SVGRectElement>('.gantt-row-hover');
const tlRow = (c: Chart, id: string) => root(c).querySelector<HTMLElement>(`.gantt-tl-row[data-task-id="${id}"]`)!;
const hoveredRows = (c: Chart) =>
  [...root(c).querySelectorAll<HTMLElement>('.gantt-tl-row--hover')].map(r => r.getAttribute('data-task-id'));
const hovered = (c: Chart) => c.layout.hoveredRowId();
/** Id of the task shown at visible row `i` (the rows go by start date: ids repeat their order every 20) */
const idAt = (c: Chart, i: number) => c.layout.visibleRows()[i].task.id;
const rh = (c: Chart) => c.layout.rowHeight();
const rowsGroup = (c: Chart) => root(c).querySelector<HTMLElement>('.gantt-tl-rows')!;

type Kind = 'mouse' | 'pen' | 'touch';
const pointer = (type: string, x: number, y: number, kind: Kind = 'mouse', bubbles = true) =>
  new PointerEvent(type, {
    bubbles,
    cancelable: true,
    button: 0,
    pointerId: 1,
    pointerType: kind,
    clientX: x,
    clientY: y,
  });
/** A move over the timeline at canvas y */
const moveOnTimeline = (c: Chart, y: number, kind: Kind = 'mouse', x = 2) =>
  c.svg.dispatchEvent(pointer('pointermove', x, y, kind));
/** The pointer entering a task-list row (on one of its cells) */
const overRow = (c: Chart, id: string, kind: Kind = 'mouse') =>
  (tlRow(c, id).querySelector('.gantt-tl-cell') ?? tlRow(c, id)).dispatchEvent(pointer('pointerover', 0, 0, kind));

describe('row hover: the timeline', () => {
  it('a mouse over a timeline row hovers it: the rect sits right after g.gantt-rows over that row', async () => {
    const c = await mount();
    expect(hoverRect(c)).toBeNull();
    moveOnTimeline(c, 2 * rh(c) + 5);
    expect(hovered(c)).toBe('t2');
    await c.f.whenStable();
    const rect = hoverRect(c)!;
    expect(rect.parentElement).toBe(c.svg);
    expect(rect.previousElementSibling?.getAttribute('class')).toBe('gantt-rows');
    expect(rect.nextElementSibling?.getAttribute('class')).toBe('gantt-bands');
    expect(rect.getAttribute('class')).toBe('gantt-row-hover');
    const geo = c.layout.geometryById().get('t2')!;
    expect(Number(rect.getAttribute('x'))).toBe(0);
    expect(Number(rect.getAttribute('y'))).toBe(geo.y);
    expect(Number(rect.getAttribute('height'))).toBe(geo.height);
    expect(Number(rect.getAttribute('width'))).toBe(c.layout.timeline().totalWidth);
    expect(rect.getAttribute('aria-hidden')).toBe('true');
    expect(rect.getAttribute('pointer-events')).toBe('none');
    // The fill is the stylesheet's (the theme variable), never an inline paint or an attribute
    expect(rect.style.getPropertyValue('fill')).toBe('');
    expect(rect.hasAttribute('fill')).toBe(false);
    // The task list's row shows it too
    expect(hoveredRows(c)).toEqual(['t2']);

    // Another row: the same rect moves
    moveOnTimeline(c, 4 * rh(c) + 1);
    await c.f.whenStable();
    expect(hoverRect(c)).toBe(rect);
    expect(Number(rect.getAttribute('y'))).toBe(4 * rh(c));
    expect(hoveredRows(c)).toEqual(['t4']);
  });

  it('below the last row nothing is hovered; a pen hovers like a mouse, a touch never', async () => {
    const c = await mount(3);
    moveOnTimeline(c, 3 * rh(c) + 5);
    expect(hovered(c)).toBeNull();
    moveOnTimeline(c, rh(c) + 5, 'pen');
    expect(hovered(c)).toBe('t1');
    c.svg.dispatchEvent(pointer('pointerleave', 0, 0, 'pen', false));
    expect(hovered(c)).toBeNull();
    moveOnTimeline(c, rh(c) + 5, 'touch');
    expect(hovered(c)).toBeNull();
    await c.f.whenStable();
    expect(hoverRect(c)).toBeNull();
  });

  it('leaving the canvas clears it; a finger lifting does not count as leaving', async () => {
    const c = await mount();
    moveOnTimeline(c, rh(c) + 5);
    await c.f.whenStable();
    expect(hoverRect(c)).not.toBeNull();
    c.svg.dispatchEvent(pointer('pointerleave', 0, 0, 'touch', false));
    expect(hovered(c)).toBe('t1');
    c.svg.dispatchEvent(pointer('pointerleave', 0, 0, 'mouse', false));
    expect(hovered(c)).toBeNull();
    await c.f.whenStable();
    expect(hoverRect(c)).toBeNull();
    expect(hoveredRows(c)).toEqual([]);
  });

  it('a drag starting clears it, the moves while dragging hover nothing, the release hovers again', async () => {
    const c = await mount();
    const v = c.gantt.getBarVisual('t1')!;
    const x = v.x + v.width / 2;
    moveOnTimeline(c, v.cy, 'mouse', x);
    expect(hovered(c)).toBe('t1');
    c.svg.dispatchEvent(pointer('pointerdown', x, v.cy));
    c.svg.dispatchEvent(pointer('pointermove', x + 10, v.cy));
    expect(c.drag.state().kind).toBe('dragging');
    expect(hovered(c)).toBeNull();
    c.svg.dispatchEvent(pointer('pointermove', x + 20, 3 * rh(c) + 5));
    expect(hovered(c)).toBeNull();
    // The task list does not hover while a bar is dragged
    overRow(c, 't3');
    expect(hovered(c)).toBeNull();
    await c.f.whenStable();
    expect(hoverRect(c)).toBeNull();
    c.svg.dispatchEvent(pointer('pointerup', x + 20, v.cy));
    expect(hovered(c)).toBe('t1');
  });

  it('a scroll of either pane clears it until the pointer moves again', async () => {
    const c = await mount(40);
    for (const pane of [c.viewport, c.panel]) {
      moveOnTimeline(c, rh(c) + 5);
      expect(hovered(c)).toBe(idAt(c, 1));
      pane.dispatchEvent(new Event('scroll'));
      expect(hovered(c)).toBeNull();
    }
    await c.f.whenStable();
    expect(hoverRect(c)).toBeNull();
  });

  it('destroying the chart clears it (no stale hover, no listener left)', async () => {
    const c = await mount();
    moveOnTimeline(c, rh(c) + 5);
    overRow(c, 't2');
    expect(hovered(c)).toBe('t2');
    const rows = rowsGroup(c);
    c.f.destroy();
    expect(hovered(c)).toBeNull();
    expect(c.layout.hoveredBarId()).toBeNull();
    // The task list's delegated listeners went with it
    rows.dispatchEvent(pointer('pointerover', 0, 0));
    moveOnTimeline(c, rh(c) + 5);
    expect(hovered(c)).toBeNull();
  });

  it('is hidden in the table view and while the hovered row is not mounted', async () => {
    const c = await mount(300);
    const third = idAt(c, 3);
    await c.set(() => c.layout.hoveredRowId.set(third));
    expect(hoverRect(c)).not.toBeNull();

    await c.set(() => c.gantt.setView('table'));
    expect(hoverRect(c)).toBeNull();
    await c.set(() => c.gantt.setView('split'));
    expect(hoverRect(c)).not.toBeNull();

    // A row far below the virtual window
    await c.set(() => c.layout.hoveredRowId.set(idAt(c, 250)));
    expect(hoverRect(c)).toBeNull();
    expect(hoveredRows(c)).toEqual([]);
    // Removed: gone too
    await c.set(() => c.layout.hoveredRowId.set(third));
    expect(hoverRect(c)).not.toBeNull();
    await c.set(() => c.h.tasks.set(plan(300).filter(t => t.id !== third)));
    expect(hoverRect(c)).toBeNull();
  });
});

describe('row hover: the task list', () => {
  it('pointerover a row (any cell) hovers it in both panes; leaving the rows clears it', async () => {
    const c = await mount();
    overRow(c, 't3');
    expect(hovered(c)).toBe('t3');
    await c.f.whenStable();
    expect(hoveredRows(c)).toEqual(['t3']);
    expect(tlRow(c, 't3').classList.contains('gantt-tl-row--hover')).toBe(true);
    // The row's own class stays first (the paint-snapshot key)
    expect(tlRow(c, 't3').classList[0]).toBe('gantt-tl-row');
    const geo = c.layout.geometryById().get('t3')!;
    expect(Number(hoverRect(c)!.getAttribute('y'))).toBe(geo.y);

    overRow(c, 't0', 'pen');
    await c.f.whenStable();
    expect(hoveredRows(c)).toEqual(['t0']);

    rowsGroup(c).dispatchEvent(pointer('pointerleave', 0, 0, 'mouse', false));
    expect(hovered(c)).toBeNull();
    await c.f.whenStable();
    expect(hoveredRows(c)).toEqual([]);
    expect(hoverRect(c)).toBeNull();
  });

  it('a touch never hovers, and a finger lifting does not clear a hover', async () => {
    const c = await mount();
    overRow(c, 't1', 'touch');
    expect(hovered(c)).toBeNull();
    overRow(c, 't1');
    rowsGroup(c).dispatchEvent(pointer('pointerleave', 0, 0, 'touch', false));
    expect(hovered(c)).toBe('t1');
  });

  it('off the rows (a spacer of the rows group) nothing is hovered', async () => {
    const c = await mount();
    overRow(c, 't1');
    expect(hovered(c)).toBe('t1');
    rowsGroup(c).firstElementChild!.dispatchEvent(pointer('pointerover', 0, 0));
    expect(hovered(c)).toBeNull();
  });

  it('the class follows the row id: a row scrolled out of the window and back', async () => {
    const c = await mount(300);
    const id = idAt(c, 2);
    overRow(c, id);
    await c.f.whenStable();
    expect(hoveredRows(c)).toEqual([id]);
    // Scroll the window by hand (no scroll event: the hover stays) so the row unmounts
    await c.set(() => c.scroll.scrollTop.set(rh(c) * 100));
    expect(hoveredRows(c)).toEqual([]);
    expect(hoverRect(c)).toBeNull();
    await c.set(() => c.scroll.scrollTop.set(0));
    expect(hoveredRows(c)).toEqual([id]);
    expect(hoverRect(c)).not.toBeNull();
  });

  it('a hover change re-renders no row, bar or cell: the same nodes and the same mounted geometries', async () => {
    const c = await mount(40);
    const nodes = () => [
      ...root(c).querySelectorAll('.gantt-rows > rect, .gantt-bars-layer > g, .gantt-tl-row, .gantt-tl-cell'),
    ];
    const geos = c.layout.mountedGeometries();
    const fills = () => [...root(c).querySelectorAll<SVGRectElement>('.gantt-rows > rect')].map(r => r.style.fill);
    const before = nodes();
    const beforeFills = fills();
    overRow(c, 't1');
    await c.f.whenStable();
    const rect = hoverRect(c);
    overRow(c, 't2');
    await c.f.whenStable();
    expect(hoverRect(c)).toBe(rect);
    const after = nodes();
    expect(after).toHaveLength(before.length);
    expect(after.every((n, i) => n === before[i])).toBe(true);
    expect(fills()).toEqual(beforeFills);
    expect(c.layout.mountedGeometries()).toBe(geos);
  });
});

/** The compiled styles of a component, without comments, encapsulation attributes or namespaces. */
function cssOf(type: Type<unknown>): string {
  return (getComponentDef(type)?.styles ?? [])
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\[_ng(content|host)-[^\]]+\]/g, '')
    .replace(/%NS%/g, '')
    .replace(/\s+/g, ' ');
}
/** The declarations of the rules for exactly `selector` (outside or inside forced colours), whitespace-free. */
function rules(css: string, selector: string): string[] {
  const out: string[] = [];
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (sel.split(',').some(s => s.trim() === selector)) out.push(body.replace(/\s+/g, ''));
  }
  return out;
}
const forced = (css: string) => {
  const i = css.indexOf('@media (forced-colors: active)');
  return i < 0 ? '' : css.slice(i);
};

describe('row hover: styles', () => {
  it('the timeline rect takes var(--gantt-row-hover-bg) from the stylesheet', () => {
    const css = cssOf(GanttCanvasComponent);
    expect(rules(css, '.gantt-row-hover')).toContain('fill:var(--gantt-row-hover-bg);');
  });

  it('the task-list row gets the tint as a background image; the old :hover filter is gone', () => {
    const css = cssOf(GanttTaskListComponent);
    expect(rules(css, '.gantt-tl-row--hover')).toContain(
      'background-image:linear-gradient(var(--gantt-row-hover-bg),var(--gantt-row-hover-bg));',
    );
    expect(css).not.toContain('.gantt-tl-row:hover');
    expect(css).not.toContain('brightness');
  });

  it('forced colours hide both (the row backgrounds stay plain)', () => {
    expect(rules(forced(cssOf(GanttCanvasComponent)), '.gantt-row-hover')).toEqual(['display:none;']);
    expect(rules(forced(cssOf(GanttTaskListComponent)), '.gantt-tl-row--hover')).toEqual(['background-image:none;']);
  });

  it('the theme variable is on the host (rowHoverBg)', async () => {
    const c = await mount();
    const host = c.f.debugElement.query(By.directive(GantryComponent)).nativeElement as HTMLElement;
    expect(host.style.getPropertyValue('--gantt-row-hover-bg').trim()).toBe('rgba(15, 23, 42, 0.04)');
  });
});
