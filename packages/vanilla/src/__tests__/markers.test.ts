// The marker lane and the canvas geometry that moved to core (Phase 9 step 4.4): the header paints
// `graph.markerLane` (core `computeMarkerLane`, D12) under its tiers and is sized to
// `graph.headerHeight`; the canvas annotations are core `computeAnnotationVisuals` (labels only
// while the lane is off); the arrows paint the visual's dash and lag-label font size.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ANNOTATION_LINE,
  MARKER_LANE_HEIGHT,
  ViewMode,
  computeAnnotationVisuals,
  type GanttAnnotation,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { type GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { HEADER_CSS } from '../styles/header.css';
import { HOST_CSS } from '../styles/host.css';
import '../index';

const flush = (el: GantryElement) => getEngine(el).flushSync();
const $ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => el.shadowRoot!.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(el: GantryElement, sel: string) => [
  ...el.shadowRoot!.querySelectorAll<T>(sel),
];

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

const DAY: GanttOptions = { viewMode: ViewMode.Day, initialScroll: false };

let el: GantryElement;

function mount(extra: Partial<GantryElement> = {}): GantryElement {
  el = document.createElement('gantry-element');
  el.style.height = '400px';
  Object.assign(el, { tasks: TASKS(), annotations: ANNOTATIONS(), options: DAY }, extra);
  document.body.appendChild(el);
  flush(el);
  return el;
}

const px = (node: Element, prop: string) => (node as HTMLElement).style.getPropertyValue(prop);

describe('marker lane and core canvas geometry', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => el?.remove());

  it('paints the lane under the tiers and before the today pointer, the header sized to tiers + lane', () => {
    mount();
    const { graph } = getEngine(el);
    const tl = graph.timeline();
    const lane = graph.markerLane();
    expect(lane.height).toBe(MARKER_LANE_HEIGHT);
    const header = $(el, '.g-header')!;
    expect([...header.children].map(c => c.classList[0])).toEqual([
      'g-tier',
      'g-tier',
      'g-marker-lane',
      'g-today-pointer',
    ]);
    expect(px(header, 'height')).toBe(`${tl.headerHeight + MARKER_LANE_HEIGHT}px`);
    expect(graph.headerHeight()).toBe(tl.headerHeight + MARKER_LANE_HEIGHT);
    const laneEl = $(el, '.g-marker-lane')!;
    expect(px(laneEl, 'top')).toBe(`${lane.y}px`);
    expect(lane.y).toBe(tl.headerHeight);
    expect(px(laneEl, 'height')).toBe(`${MARKER_LANE_HEIGHT}px`);
    expect(px(laneEl, 'font-size')).toBe(`${lane.labelFontPx}px`);
    // The header box no longer needs the scaffold's min-height rule
    expect(HOST_CSS).not.toContain('min-height: var(--gantry-header-h');
  });

  it('keys one marker per annotation plus today, in x order, with the model’s geometry and paints', () => {
    mount();
    const lane = getEngine(el).graph.markerLane();
    const markers = $$(el, '.g-marker-lane > .g-marker');
    expect(markers).toHaveLength(lane.markers.length);
    expect(lane.markers.map(m => m.key)).toEqual(['annotation:0', 'today', 'annotation:1', 'annotation:2']);
    lane.markers.forEach((m, i) => {
      const node = markers[i];
      expect(node.getAttribute('class')).toBe(`g-marker g-marker--${m.kind}`);
      expect(px(node, '--x')).toBe(`${m.x}px`);
      expect(px(node, 'color')).toBe(m.paint);
      const label = node.querySelector('.g-marker-label');
      expect(label !== null, m.key).toBe(m.label !== null);
      if (!m.label || !label) return;
      expect(label.textContent).toBe(m.label.text);
      expect(px(label, '--lx')).toBe(`${m.label.x}px`);
      expect(px(label, '--w')).toBe(`${m.label.width}px`);
      expect(px(label, 'color')).toBe(m.label.paint);
      expect(label.getAttribute('title')).toBe(m.label.title !== m.label.text ? m.label.title : null);
    });
    // The crowded label is cut to fit before the next marker, and keeps its full text as a title
    const freeze = lane.markers.find(m => m.key === 'annotation:1')!;
    expect(freeze.label!.text).not.toBe('Release freeze window');
    expect(markers[2].querySelector('.g-marker-label')!.getAttribute('title')).toBe('Release freeze window');
    // Today's marker label is the localized "Today", on the today tint
    expect(markers[1].querySelector('.g-marker-label')!.textContent).toBe('Today');
    expect(HEADER_CSS).toMatch(
      /\.g-marker--today \.g-marker-label \{ background: color-mix\(in srgb, var\(--gantt-today\) 14%/,
    );
    // A label is placed against its marker: CSS subtracts the marker's x from the label's
    expect(HEADER_CSS).toMatch(/\.g-marker-label \{[^}]*left: calc\(var\(--lx\) - var\(--x\)\); width: var\(--w\)/);
  });

  it('keeps marker nodes across a zoom and detaches the lane when it is off', () => {
    mount();
    const header = $(el, '.g-header')!;
    const laneEl = $(el, '.g-marker-lane')!;
    const kickoff = $(el, '.g-marker')!;
    el.options = { ...DAY, viewMode: ViewMode.Week };
    flush(el);
    expect($(el, '.g-marker')).toBe(kickoff);
    expect(px(kickoff, '--x')).toBe(`${getEngine(el).graph.markerLane().markers[0].x}px`);

    const tiersOnly = () => `${getEngine(el).graph.timeline().headerHeight}px`;
    el.options = { ...DAY, markers: { lane: false } };
    flush(el);
    expect(laneEl.isConnected).toBe(false);
    expect([...header.children].map(c => c.classList[0])).toEqual(['g-tier', 'g-tier', 'g-today-pointer']);
    expect(px(header, 'height')).toBe(tiersOnly());

    // Auto: no labelled annotation, no lane
    el.options = DAY;
    el.annotations = [{ x1: day(1) }];
    flush(el);
    expect(laneEl.isConnected).toBe(false);
    expect(px(header, 'height')).toBe(tiersOnly());

    // Forced on: today's marker and the unlabelled annotation's tick; back before the pointer
    el.options = { ...DAY, markers: { lane: true } };
    flush(el);
    expect(laneEl.nextElementSibling?.classList.contains('g-today-pointer')).toBe(true);
    expect($$(el, '.g-marker').map(m => m.getAttribute('class'))).toEqual([
      'g-marker g-marker--today',
      'g-marker g-marker--annotation',
    ]);
    // Labels as the model has them (today's may lack room before the annotation a day later)
    expect($$(el, '.g-marker').map(m => m.querySelector('.g-marker-label')?.textContent ?? null)).toEqual(
      getEngine(el)
        .graph.markerLane()
        .markers.map(m => m.label?.text ?? null),
    );
    expect($$(el, '.g-marker')[1].querySelector('.g-marker-label')).toBeNull();

    // The table view has no timeline: no lane (core markerLaneShown)
    el.setView('table');
    flush(el);
    expect(laneEl.isConnected).toBe(false);
  });

  it('draws the canvas annotations from core: labels in the canvas only while the lane is off', () => {
    mount();
    const { graph } = getEngine(el);
    expect($$(el, '.gantt-annotation-labels > text')).toHaveLength(0);
    const marks = $$(el, '.gantt-annotations > *');
    expect(marks.map(m => m.tagName.toLowerCase())).toEqual(['line', 'rect', 'line', 'line']);
    const visuals = computeAnnotationVisuals(
      ANNOTATIONS(),
      graph.timeline(),
      graph.windowSpan(),
      graph.metrics().fontPx,
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
    expect(px(region, 'fill')).toBe('#8B5CF6');

    // Lane off: the labels come back over the bars, at core's offsets
    el.options = { ...DAY, markers: { lane: false } };
    flush(el);
    const labels = $$(el, '.gantt-annotation-labels > text');
    expect(labels.map(t => t.textContent)).toEqual(['Kickoff', 'Release freeze window']);
    const off = computeAnnotationVisuals(
      ANNOTATIONS(),
      graph.timeline(),
      graph.windowSpan(),
      graph.metrics().fontPx,
      false,
    );
    expect(labels[0].getAttribute('x')).toBe(String(off[0].label!.x));
    expect(labels[0].getAttribute('y')).toBe(String(off[0].label!.y));
    expect(labels[0].getAttribute('font-size')).toBe(String(graph.metrics().fontPx - 1));
    expect(labels[0].getAttribute('font-weight')).toBe('600');
    expect(px(labels[1], 'fill')).toBe('#8B5CF6');
  });

  it('paints the arrows’ dash and lag label size from the visual (the chart font size − 2)', () => {
    mount({ annotations: [] });
    const lag = () => $(el, '.gantt-arrows text')!;
    const path = $(el, '.gantt-arrows path')!;
    expect(path.getAttribute('stroke-dasharray')).toBe('5 3');
    expect(lag().textContent).toBe('+2d');
    expect(lag().getAttribute('font-size')).toBe(String(getEngine(el).graph.metrics().fontPx - 2));
    el.setTheme({ fontSize: '16px' });
    flush(el);
    expect(getEngine(el).graph.metrics().fontPx).toBe(15);
    expect(lag().getAttribute('font-size')).toBe('13');
    // Without a lag the link is solid and has no label
    el.tasks = [TASKS()[0], { ...TASKS()[1], dependency: 'a' }];
    flush(el);
    expect($(el, '.gantt-arrows path')!.hasAttribute('stroke-dasharray')).toBe(false);
    expect($(el, '.gantt-arrows text')).toBeNull();
  });
});
