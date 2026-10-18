// Drag ghost (Gantry 2 phase 6, step 2.5): the preview paints `computeDragGhostVisual` from
// @gantryjs/core and draws exactly what it drew before (rect, dash, opacity, delta label), with
// its paints as CSS properties; the canvas feeds it the dragged row, the config and the timeline.
import { describe, it, expect } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  DragSession,
  buildTimeline,
  computeBarVisual,
  computeDragGhostVisual,
  computeRowGeometries,
  filterVisible,
  flattenTree,
  reindexVisible,
  resolveConfig,
  taskSpan,
  themeMetrics,
  LightTheme,
  type DragHandle,
  type DragPreview,
  type ResolvedGanttConfig,
  type TimelineModel,
  DEFAULT_FORMATS,
  DEFAULT_LABELS,
  TaskType,
  type GanttI18n,
  type GanttOptions,
  type GanttTask,
  type RowGeometry,
} from '@gantryjs/core';
import { GanttDragPreviewComponent } from './gantt-drag-preview.component';
import { GanttDragService } from './gantt-drag.service';
import { GantryComponent } from '../gantt-component/gantry.component';
import { GanttCanvasComponent } from '../layout/gantt-canvas.component';
import { GanttLayoutService } from '../layout/gantt-layout.service';

const i18n: GanttI18n = { labels: DEFAULT_LABELS, formats: DEFAULT_FORMATS };
const FONT_PX = themeMetrics(LightTheme).fontPx;

const day = (d: number, h = 0) => new Date(2026, 0, d, h);
const TASKS: GanttTask[] = [
  { id: 'a', name: 'Design', start: day(10), end: day(14), progress: 40 },
  { id: 'm', name: 'Review', type: TaskType.Milestone, start: day(16), end: day(16) },
  { id: 'b', name: 'Build', start: day(12, 9), end: day(13, 15), barColor: '#FDE68A' },
];

interface Chart {
  cfg: ResolvedGanttConfig;
  tl: TimelineModel;
  geos: RowGeometry[];
}

function chart(options: GanttOptions = {}): Chart {
  const cfg = resolveConfig(options, i18n, themeMetrics(LightTheme));
  const tl = buildTimeline({ tasks: TASKS, config: cfg, now: day(11, 10) });
  const rows = reindexVisible(filterVisible(flattenTree(TASKS, new Set())));
  return { cfg, tl, geos: computeRowGeometries(rows, tl, cfg) };
}

const geoOf = (geos: readonly RowGeometry[], id: string): RowGeometry => {
  const g = geos.find(x => x.row.task.id === id);
  if (!g) throw new Error(`no row ${id}`);
  return g;
};

/** The preview a pointer drag of `units` snap units produces (as `GanttDragService` does). */
function drag(c: Chart, id: string, handle: DragHandle, units: number): DragPreview {
  const geo = geoOf(c.geos, id);
  const snap = c.cfg.scales.at(-1)?.unit === 'hour' ? 'hour' : 'day';
  const session = new DragSession(
    id,
    handle,
    geo.row.task.start,
    geo.row.task.end ?? geo.row.task.start,
    100,
    { y: geo.y, height: geo.height },
    { pxPerDay: c.cfg.pxPerDay, toX: c.tl.toX, span: (start, end) => taskSpan({ start, end }, c.cfg), snap },
  );
  const pxPerUnit = snap === 'hour' ? c.cfg.pxPerDay / 24 : c.cfg.pxPerDay;
  return session.preview(100 + units * pxPerUnit + 0.3 * Math.sign(units) * pxPerUnit);
}

interface GhostDom {
  rect: Record<string, string | null>;
  text: Record<string, string | null> | null;
}

/** What the preview drew before step 2.5 (transcribed from the old template and canvas inputs). */
function previousGhost(p: DragPreview, c: Chart): GhostDom {
  const geo = geoOf(c.geos, p.taskId);
  const h = computeBarVisual({ geo, cfg: c.cfg, toX: c.tl.toX, fontPx: FONT_PX, resizable: true }).height;
  return {
    rect: {
      class: 'gantt-drag-preview',
      x: String(p.x),
      y: String(p.y + (p.height - h) / 2),
      width: String(p.width),
      height: String(h),
      rx: String(c.cfg.bar.radius),
      fill: 'var(--gantt-bar)',
      stroke: 'var(--gantt-bar)',
      opacity: '0.35',
      'stroke-dasharray': '4 2',
      'stroke-width': '1.5',
    },
    text:
      p.delta === 0
        ? null
        : {
            x: String(p.x + p.width / 2),
            y: String(p.y),
            fill: 'var(--gantt-text)',
            'font-size': '11px',
            'font-weight': '600',
            'text-anchor': 'middle',
            'dominant-baseline': 'auto',
            text: `${p.delta > 0 ? '+' : ''}${p.delta}${p.unit === 'hour' ? 'h' : 'd'}`,
          },
  };
}

/** The ghost as drawn in `root` (`null` when there is none). */
function readGhost(root: Element): GhostDom | null {
  const rect = root.querySelector<SVGRectElement>('rect.gantt-drag-preview');
  if (!rect) return null;
  const attrs = (el: SVGElement, names: string[]) => Object.fromEntries(names.map(n => [n, el.getAttribute(n)]));
  const text = rect.parentElement?.querySelector<SVGTextElement>('text') ?? null;
  return {
    rect: {
      ...attrs(rect, ['class', 'x', 'y', 'width', 'height', 'rx']),
      fill: rect.style.getPropertyValue('fill'),
      stroke: rect.style.getPropertyValue('stroke'),
      ...attrs(rect, ['opacity', 'stroke-dasharray', 'stroke-width']),
    },
    text: text && {
      ...attrs(text, ['x', 'y']),
      fill: text.style.getPropertyValue('fill'),
      ...attrs(text, ['font-size', 'font-weight', 'text-anchor', 'dominant-baseline']),
      text: text.textContent.trim(),
    },
  };
}

// ── The component on its own ─────────────────────────────────

@Component({
  imports: [GanttDragPreviewComponent],
  template: `
    <svg>
      <g
        ganttDragPreview
        [preview]="preview()"
        [geometry]="geometry()"
        [config]="chart().cfg"
        [timeline]="chart().tl"
        [fontPx]="fontPx"
      ></g>
    </svg>
  `,
})
class PreviewHost {
  readonly chart = signal<Chart>(chart({ viewMode: 'Day' }));
  readonly preview = signal<DragPreview | null>(null);
  readonly geometry = signal<RowGeometry | null>(null);
  readonly fontPx = FONT_PX;
}

async function mountPreview(): Promise<ComponentFixture<PreviewHost>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(PreviewHost);
  await fixture.whenStable();
  return fixture;
}

async function show(
  f: ComponentFixture<PreviewHost>,
  options: GanttOptions,
  id: string,
  handle: DragHandle,
  n: number,
) {
  const c = chart(options);
  const p = drag(c, id, handle, n);
  f.componentInstance.chart.set(c);
  f.componentInstance.geometry.set(geoOf(c.geos, id));
  f.componentInstance.preview.set(p);
  await f.whenStable();
  return { c, p, dom: readGhost(f.nativeElement as HTMLElement) };
}

describe('GanttDragPreviewComponent', () => {
  const cases: [name: string, options: GanttOptions, id: string, handle: DragHandle, units: number][] = [
    ['move +3 days', { viewMode: 'Day' }, 'a', 'bar', 3],
    ['move -2 days', { viewMode: 'Day' }, 'a', 'bar', -2],
    ['resize right +4 days', { viewMode: 'Day' }, 'a', 'right', 4],
    ['resize left -3 days', { viewMode: 'Day' }, 'a', 'left', -3],
    ['move a milestone', { viewMode: 'Day' }, 'm', 'bar', 2],
    ['move an explicit-colour bar (Week)', { viewMode: 'Week' }, 'b', 'bar', 5],
    ['move by hours', { viewMode: 'Hour' }, 'b', 'bar', 5],
    ['resize by hours', { viewMode: 'Hour' }, 'b', 'right', -2],
    ['custom bar height, radius, row height', { bar: { height: 10, radius: 7 }, rowHeight: 50 }, 'a', 'bar', 1],
    ['percentage bar height', { bar: { height: '80%' }, rowHeight: 30 }, 'a', 'left', -1],
  ];

  it.each(cases)('draws what it drew before: %s', async (_name, options, id, handle, units) => {
    const f = await mountPreview();
    const { c, p, dom } = await show(f, options, id, handle, units);
    expect(p.delta).toBe(units);
    expect(dom).toEqual(previousGhost(p, c));
  });

  it('draws the core ghost model', async () => {
    const f = await mountPreview();
    const { c, p, dom } = await show(f, { viewMode: 'Day' }, 'a', 'bar', 3);
    const g = computeDragGhostVisual(p, geoOf(c.geos, 'a'), c.cfg, c.tl.toX, i18n, FONT_PX);
    expect(dom?.rect).toMatchObject({ x: String(g.x), y: String(g.y), height: String(g.height), rx: String(g.rx) });
    expect(dom?.rect['fill']).toBe(g.paint);
    expect(dom?.text).toMatchObject({ x: String(g.label?.x), y: String(g.label?.y), text: '+3d' });
  });

  it('draws no label while the snapped movement is zero', async () => {
    const f = await mountPreview();
    const { dom } = await show(f, { viewMode: 'Day' }, 'a', 'bar', 0);
    expect(dom?.rect['class']).toBe('gantt-drag-preview');
    expect(dom?.text).toBeNull();
    expect((f.nativeElement as HTMLElement).querySelectorAll('text')).toHaveLength(0);
  });

  it('draws nothing without a preview or without the dragged row', async () => {
    const f = await mountPreview();
    expect(readGhost(f.nativeElement as HTMLElement)).toBeNull();

    await show(f, { viewMode: 'Day' }, 'a', 'bar', 2);
    expect(readGhost(f.nativeElement as HTMLElement)).not.toBeNull();

    f.componentInstance.geometry.set(null);
    await f.whenStable();
    expect(readGhost(f.nativeElement as HTMLElement)).toBeNull();
  });

  it('ignores pointer events, binds paints as CSS properties and uses the chart font', async () => {
    const f = await mountPreview();
    await show(f, { viewMode: 'Day' }, 'a', 'bar', 2);
    const root = f.nativeElement as HTMLElement;
    const rect = root.querySelector('rect.gantt-drag-preview');
    const text = root.querySelector('text');
    const host = rect?.parentElement;
    if (!rect || !text || !host) throw new Error('no ghost');
    expect(getComputedStyle(host).pointerEvents).toBe('none');
    expect(getComputedStyle(text).userSelect).toBe('none');
    // the test DOM resolves an undefined var() to its default font: read the matching component rule
    const fonts = [...document.styleSheets]
      .flatMap(sheet => [...sheet.cssRules])
      .filter((r): r is CSSStyleRule => r instanceof CSSStyleRule && text.matches(r.selectorText))
      .map(r => r.style.getPropertyValue('font-family'));
    expect(fonts).toContain('var(--gantt-font)');
    for (const el of [rect, text]) {
      expect(el.hasAttribute('fill')).toBe(false);
      expect(el.hasAttribute('stroke')).toBe(false);
      expect(el.hasAttribute('pointer-events')).toBe(false);
    }
  });
});

// ── Inside the chart ─────────────────────────────────────────

@Component({
  imports: [GantryComponent],
  template: `<gantry [series]="tasks" [options]="options()" />`,
})
class ChartHost {
  readonly tasks = TASKS;
  readonly options = signal<GanttOptions>({ initialScroll: false, viewMode: 'Day' });
  readonly gantt = viewChild.required(GantryComponent);
}

async function mountChart(): Promise<ComponentFixture<ChartHost>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(ChartHost);
  await fixture.whenStable();
  return fixture;
}

/** Starts a drag of `id` by `units` through the chart's drag service and returns its preview. */
async function dragInChart(f: ComponentFixture<ChartHost>, id: string, units: number) {
  const canvasDe = f.debugElement.query(By.directive(GanttCanvasComponent));
  // The canvas paints the chart's layout graph: read the model there
  const layout = canvasDe.injector.get(GanttLayoutService);
  const c: Chart = { cfg: layout.cfg(), tl: layout.timeline(), geos: layout.rowGeometries() };
  const p = drag(c, id, 'bar', units);
  const dragSvc = canvasDe.injector.get(GanttDragService);
  dragSvc.state.set({ kind: 'dragging', taskId: id });
  dragSvc.preview.set(p);
  await f.whenStable();
  return { c, p, dragSvc };
}

describe('GanttCanvasComponent drag ghost', () => {
  it('draws the ghost of the dragged row from the chart model', async () => {
    const f = await mountChart();
    const { c, p, dragSvc } = await dragInChart(f, 'a', 2);
    const dom = readGhost(f.nativeElement as HTMLElement);
    expect(dom).toEqual(previousGhost(p, c));
    expect(dom?.text?.['text']).toBe('+2d');

    dragSvc.preview.set(null);
    dragSvc.state.set({ kind: 'idle' });
    await f.whenStable();
    expect((f.nativeElement as HTMLElement).querySelectorAll('.gantt-drag-preview')).toHaveLength(0);
  });

  it('follows the bar options of the chart (radius, height)', async () => {
    const f = await mountChart();
    f.componentInstance.options.set({ initialScroll: false, viewMode: 'Day', bar: { radius: 7, height: 12 } });
    await f.whenStable();
    const { c, p } = await dragInChart(f, 'b', -1);
    const dom = readGhost(f.nativeElement as HTMLElement);
    expect(dom).toEqual(previousGhost(p, c));
    expect(dom?.rect).toMatchObject({ rx: '7', height: '12' });
  });

  it('draws the ghost of a real pointer drag (3 px to start, then the pointer in content coordinates)', async () => {
    const f = await mountChart();
    const el = f.nativeElement as HTMLElement;
    const canvasDe = f.debugElement.query(By.directive(GanttCanvasComponent));
    const layout = canvasDe.injector.get(GanttLayoutService);
    const dragSvc = canvasDe.injector.get(GanttDragService);
    const c: Chart = { cfg: layout.cfg(), tl: layout.timeline(), geos: layout.rowGeometries() };
    const v = f.componentInstance.gantt().getBarVisual('a')!;
    // The test DOM puts the canvas at 0,0: client and canvas coordinates are the same
    const svg = el.querySelector<SVGSVGElement>('gantt-canvas svg')!;
    const send = (type: string, x: number) =>
      svg.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          button: 0,
          pointerId: 1,
          pointerType: 'mouse',
          clientX: x,
          clientY: v.cy,
        }),
      );
    const x0 = v.x + v.width / 2;
    send('pointerdown', x0);
    send('pointermove', x0 + 2);
    await f.whenStable();
    expect(readGhost(el)).toBeNull();

    send('pointermove', x0 + 2 * c.cfg.pxPerDay);
    await f.whenStable();
    const p = dragSvc.preview()!;
    expect(p).toMatchObject({ taskId: 'a', delta: 2 });
    expect(readGhost(el)).toEqual(previousGhost(p, c));

    send('pointerup', x0 + 2 * c.cfg.pxPerDay);
    await f.whenStable();
    expect(readGhost(el)).toBeNull();
  });
});
