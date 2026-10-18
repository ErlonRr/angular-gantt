// The marker lane and the canvas geometry that moved to core (Gantry 2 phase 9 step 4.8, the Web
// Component's `layers/header.ts`, `layers/overlay.ts` and `paint/arrows.ts`): the header paints
// `layout.markerLane()` (core `computeMarkerLane`, D12) under its tiers and is sized to
// `layout.headerHeight()`; the canvas annotations are core `computeAnnotationVisuals` (labels only
// while the lane is off); the arrows paint the visual's dash and lag-label font size.
import { describe, it, expect } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  ANNOTATION_LINE,
  MARKER_LANE_HEIGHT,
  computeAnnotationVisuals,
  type GanttAnnotation,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttLayoutService } from './layout/gantt-layout.service';

const now = new Date();
const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);

const TASKS = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(-6), end: day(2) },
  { id: 'b', name: 'Beta', start: day(2), end: day(12), dependency: [{ taskId: 'a', lag: 2 }] },
];

/** A labelled line, a labelled region crowded by an unlabelled line a day later (its label is cut), and a plain line. */
const ANNOTATIONS = (): GanttAnnotation[] => [
  { x1: day(-3), label: { text: 'Kickoff' } },
  { x1: day(5), x2: day(7), color: '#8B5CF6', opacity: 0.15, label: { text: 'Release freeze window' } },
  { x1: day(6) },
];

const DAY: GanttOptions = { viewMode: 'Day', initialScroll: false };

@Component({
  imports: [GantryComponent],
  template: ` <gantry style="height: 400px" [series]="tasks()" [annotations]="annotations()" [options]="options()" /> `,
})
class Host {
  readonly tasks = signal<GanttTask[]>(TASKS());
  readonly annotations = signal<GanttAnnotation[]>(ANNOTATIONS());
  readonly options = signal<GanttOptions>(DAY);
  readonly gantt = viewChild.required(GantryComponent);
}

async function mount(setup?: (h: Host) => void) {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  setup?.(f.componentInstance);
  await f.whenStable();
  const debug = f.debugElement.query(By.directive(GantryComponent));
  const host = debug.nativeElement as HTMLElement;
  return {
    h: f.componentInstance,
    layout: debug.injector.get(GanttLayoutService),
    async set(change: () => void) {
      change();
      await f.whenStable();
    },
    $: <T extends Element = HTMLElement>(sel: string) => host.querySelector<T>(sel),
    $$: <T extends Element = HTMLElement>(sel: string) => [...host.querySelectorAll<T>(sel)],
  };
}

const px = (node: Element, prop: string) => (node as HTMLElement).style.getPropertyValue(prop);
/** A colour as the test DOM may serialise it */
const colour = (value: string) => [value, value.toLowerCase(), value === '#8B5CF6' ? 'rgb(139, 92, 246)' : value];
const css = () => [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');

describe('marker lane and core canvas geometry', () => {
  it('paints the lane under the tiers and before the today pointer, the header sized to tiers + lane', async () => {
    const c = await mount();
    const tl = c.layout.timeline();
    const lane = c.layout.markerLane();
    expect(lane.height).toBe(MARKER_LANE_HEIGHT);
    const header = c.$('.g-header')!;
    expect([...header.children].map(e => e.classList[0])).toEqual([
      'g-tier',
      'g-tier',
      'g-marker-lane',
      'g-today-pointer',
    ]);
    expect(px(header, 'height')).toBe(`${tl.headerHeight + MARKER_LANE_HEIGHT}px`);
    expect(c.layout.headerHeight()).toBe(tl.headerHeight + MARKER_LANE_HEIGHT);
    const laneEl = c.$('.g-marker-lane')!;
    expect(px(laneEl, 'top')).toBe(`${lane.y}px`);
    expect(lane.y).toBe(tl.headerHeight);
    expect(px(laneEl, 'height')).toBe(`${MARKER_LANE_HEIGHT}px`);
    expect(px(laneEl, 'font-size')).toBe(`${lane.labelFontPx}px`);
  });

  it('keys one marker per annotation plus today, in x order, with the model’s geometry and paints', async () => {
    const c = await mount();
    const lane = c.layout.markerLane();
    const markers = c.$$('.g-marker-lane > .g-marker');
    expect(markers).toHaveLength(lane.markers.length);
    expect(lane.markers.map(m => m.key)).toEqual(['annotation:0', 'today', 'annotation:1', 'annotation:2']);
    lane.markers.forEach((m, i) => {
      const node = markers[i];
      expect(node.getAttribute('class')).toBe(`g-marker g-marker--${m.kind}`);
      expect(px(node, '--x')).toBe(`${m.x}px`);
      expect(colour(m.paint)).toContain(px(node, 'color'));
      const label = node.querySelector('.g-marker-label');
      expect(label !== null, m.key).toBe(m.label !== null);
      if (!m.label || !label) return;
      expect(label.textContent).toBe(m.label.text);
      expect(px(label, '--lx')).toBe(`${m.label.x}px`);
      expect(px(label, '--w')).toBe(`${m.label.width}px`);
      expect(colour(m.label.paint)).toContain(px(label, 'color'));
      expect(label.getAttribute('title')).toBe(m.label.title !== m.label.text ? m.label.title : null);
    });
    // The crowded label is cut to fit before the next marker, and keeps its full text as a title
    const freeze = lane.markers.find(m => m.key === 'annotation:1')!;
    expect(freeze.label!.text).not.toBe('Release freeze window');
    expect(markers[2].querySelector('.g-marker-label')!.getAttribute('title')).toBe('Release freeze window');
    // Today's marker label is the localized "Today", on the today tint
    expect(markers[1].querySelector('.g-marker-label')!.textContent).toBe('Today');
    // The Web Component's header rules (header.css.ts)
    expect(css()).toMatch(
      /\.g-marker--today\[_ngcontent-[^\]]+\]\s+\.g-marker-label\[_ngcontent-[^\]]+\]\s*\{\s*background:\s*color-mix\(in srgb, var\(--gantt-today\) 14%/,
    );
    expect(css()).toMatch(
      /\.g-marker-label\[_ngcontent-[^\]]+\]\s*\{[^}]*left:\s*calc\(var\(--lx\) - var\(--x\)\);\s*width:\s*var\(--w\)/,
    );
    expect(css()).toMatch(/\.g-marker\[_ngcontent-[^\]]+\]::before\s*\{[^}]*background:\s*currentColor/);
  });

  it('keeps marker nodes across a zoom and detaches the lane when it is off', async () => {
    const c = await mount();
    const header = c.$('.g-header')!;
    const kickoff = c.$('.g-marker')!;
    await c.set(() => c.h.options.set({ ...DAY, viewMode: 'Week' }));
    expect(c.$('.g-marker')).toBe(kickoff);
    expect(px(kickoff, '--x')).toBe(`${c.layout.markerLane().markers[0].x}px`);

    const tiersOnly = () => `${c.layout.timeline().headerHeight}px`;
    await c.set(() => c.h.options.set({ ...DAY, markers: { lane: false } }));
    expect(c.$('.g-marker-lane')).toBeNull();
    expect([...header.children].map(e => e.classList[0])).toEqual(['g-tier', 'g-tier', 'g-today-pointer']);
    expect(px(header, 'height')).toBe(tiersOnly());

    // Auto: no labelled annotation, no lane
    await c.set(() => {
      c.h.options.set(DAY);
      c.h.annotations.set([{ x1: day(1) }]);
    });
    expect(c.$('.g-marker-lane')).toBeNull();
    expect(px(header, 'height')).toBe(tiersOnly());

    // Forced on: today's marker and the unlabelled annotation's tick; back before the pointer
    await c.set(() => c.h.options.set({ ...DAY, markers: { lane: true } }));
    expect(c.$('.g-marker-lane')!.nextElementSibling?.classList.contains('g-today-pointer')).toBe(true);
    expect(c.$$('.g-marker').map(m => m.getAttribute('class'))).toEqual([
      'g-marker g-marker--today',
      'g-marker g-marker--annotation',
    ]);
    // Labels as the model has them (today's may lack room before the annotation a day later)
    expect(c.$$('.g-marker').map(m => m.querySelector('.g-marker-label')?.textContent ?? null)).toEqual(
      c.layout.markerLane().markers.map(m => m.label?.text ?? null),
    );
    expect(c.$$('.g-marker')[1].querySelector('.g-marker-label')).toBeNull();

    // The table view has no timeline: no lane (core markerLaneShown)
    await c.set(() => c.h.gantt().setView('table'));
    expect(c.$('.g-marker-lane')).toBeNull();
  });

  it('draws the canvas annotations from core: labels in the canvas only while the lane is off', async () => {
    const c = await mount();
    expect(c.$$('.gantt-annotation-labels > text')).toHaveLength(0);
    const marks = c.$$('.gantt-annotations > *');
    expect(marks.map(m => m.tagName.toLowerCase())).toEqual(['line', 'rect', 'line', 'line']);
    const visuals = computeAnnotationVisuals(
      ANNOTATIONS(),
      c.layout.timeline(),
      c.layout.windowSpan(),
      c.layout.fontPx(),
      true,
    );
    const line = marks[0];
    expect(line.getAttribute('x1')).toBe(String(visuals[0].line.x));
    expect(line.getAttribute('y2')).toBe(String(visuals[0].line.y2));
    expect(line.getAttribute('stroke-width')).toBe(String(ANNOTATION_LINE.strokeWidth));
    expect(line.getAttribute('stroke-dasharray')).toBe(ANNOTATION_LINE.dash);
    expect(line.getAttribute('opacity')).toBe(String(ANNOTATION_LINE.opacity));
    const region = marks[1];
    const r = visuals[1].region!;
    expect([region.getAttribute('x'), region.getAttribute('width'), region.getAttribute('opacity')]).toEqual([
      String(r.x),
      String(r.width),
      '0.15',
    ]);
    expect(colour('#8B5CF6')).toContain(px(region, 'fill'));

    // Lane off: the labels come back over the bars, at core's offsets
    await c.set(() => c.h.options.set({ ...DAY, markers: { lane: false } }));
    const labels = c.$$('.gantt-annotation-labels > text');
    expect(labels.map(t => t.textContent)).toEqual(['Kickoff', 'Release freeze window']);
    const off = computeAnnotationVisuals(
      ANNOTATIONS(),
      c.layout.timeline(),
      c.layout.windowSpan(),
      c.layout.fontPx(),
      false,
    );
    expect(labels[0].getAttribute('x')).toBe(String(off[0].label!.x));
    expect(labels[0].getAttribute('y')).toBe(String(off[0].label!.y));
    expect(labels[0].getAttribute('font-size')).toBe(String(c.layout.fontPx() - 1));
    expect(labels[0].getAttribute('font-weight')).toBe('600');
    expect(colour('#8B5CF6')).toContain(px(labels[1], 'fill'));
  });

  it('paints the arrows’ dash and lag label size from the visual (the chart font size − 2)', async () => {
    const c = await mount(h => h.annotations.set([]));
    const lag = () => c.$('.gantt-arrows text')!;
    const path = c.$('.gantt-arrows path')!;
    expect(path.getAttribute('stroke-dasharray')).toBe('5 3');
    expect(lag().textContent).toBe('+2d');
    expect(lag().getAttribute('font-size')).toBe(String(c.layout.fontPx() - 2));
    await c.set(() => c.h.gantt().setTheme({ fontSize: '16px' }));
    expect(c.layout.fontPx()).toBe(15);
    expect(lag().getAttribute('font-size')).toBe('13');
    // Without a lag the link is solid and has no label
    await c.set(() => c.h.tasks.set([TASKS()[0], { ...TASKS()[1], dependency: 'a' }]));
    expect(c.$('.gantt-arrows path')!.hasAttribute('stroke-dasharray')).toBe(false);
    expect(c.$('.gantt-arrows text')).toBeNull();
  });
});
