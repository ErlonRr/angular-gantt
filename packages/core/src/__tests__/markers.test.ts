// Marker lane (D12) and the canvas annotation visuals that both painters draw.
import { describe, it, expect } from 'vitest';
import {
  ANNOTATION_LINE,
  DEFAULT_LABELS,
  MARKER_LABEL_GAP,
  MARKER_LABEL_MIN_WIDTH,
  MARKER_LABEL_PADDING,
  MARKER_LANE_HEIGHT,
  PAINTS,
  annotationPaint,
  buildTimeline,
  computeAnnotationVisuals,
  computeMarkerLane,
  estimateTextWidth,
  fitText,
  markerLaneShown,
  resolveConfig,
  ViewMode,
  type GanttAnnotation,
  type GanttOptions,
  type MarkerLaneInput,
} from '../index';

const NOW = new Date(2026, 2, 16, 10);
const tasks = [{ id: 'a', name: 'A', start: new Date(2026, 2, 2), end: new Date(2026, 3, 30) }];
const setup = (options: GanttOptions = {}) => {
  const config = resolveConfig({ viewMode: ViewMode.Day, ...options });
  const timeline = buildTimeline({ tasks, config, now: NOW });
  return { config, timeline };
};
const lane = (annotations: GanttAnnotation[], options: GanttOptions = {}, extra: Partial<MarkerLaneInput> = {}) => {
  const { config, timeline } = setup(options);
  return computeMarkerLane({
    config,
    timeline,
    annotations,
    todayX: timeline.todayX >= 0 ? timeline.todayX : null,
    labels: DEFAULT_LABELS,
    fontPx: 12,
    ...extra,
  });
};
const day = (d: number) => new Date(2026, 2, d);
const box = (text: string, fontPx = 11) => Math.ceil(estimateTextWidth(text, fontPx) + 2 * MARKER_LABEL_PADDING);

describe('marker lane: when it shows', () => {
  it("'auto' shows it when an annotation has label text", () => {
    const { config } = setup();
    expect(config.markers.lane).toBe('auto');
    expect(markerLaneShown(config, [])).toBe(false);
    expect(markerLaneShown(config, [{ x1: day(5) }])).toBe(false);
    expect(markerLaneShown(config, [{ x1: day(5), label: { text: '' } }])).toBe(false);
    expect(markerLaneShown(config, [{ x1: day(5) }, { x1: day(9), label: { text: 'Freeze' } }])).toBe(true);
  });

  it('true always shows it, false never', () => {
    const labelled = [{ x1: day(5), label: { text: 'Freeze' } }];
    expect(markerLaneShown(setup({ markers: { lane: true } }).config, [])).toBe(true);
    expect(markerLaneShown(setup({ markers: { lane: false } }).config, labelled)).toBe(false);
  });

  it('a hidden lane has height 0 and no markers (the today chip goes with it)', () => {
    const off = lane([{ x1: day(5) }]);
    expect(off.height).toBe(0);
    expect(off.markers).toEqual([]);
    expect(lane([{ x1: day(5), label: { text: 'Freeze' } }], { markers: { lane: false } }).markers).toEqual([]);
  });

  it('a shown lane is 18 px, sits under the tiers and labels at the font size − 1', () => {
    const { timeline } = setup();
    const on = lane([{ x1: day(5), label: { text: 'Freeze' } }]);
    expect(MARKER_LANE_HEIGHT).toBe(18);
    expect(on.height).toBe(18);
    expect(on.y).toBe(timeline.headerHeight);
    expect(on.labelFontPx).toBe(11);
    expect(lane([], { markers: { lane: true } }, { fontPx: 14 }).labelFontPx).toBe(13);
  });
});

describe('marker lane: markers', () => {
  it('places annotation markers at x1 and a Today marker at the today line', () => {
    const { timeline } = setup();
    const on = lane([
      { x1: day(20), label: { text: 'Review', color: '#123456' }, color: '#ff0000' },
      { x1: day(5), x2: day(9) },
    ]);
    expect(on.markers.map(m => [m.key, m.kind, m.x])).toEqual([
      ['annotation:1', 'annotation', timeline.toX(day(5))],
      ['today', 'today', timeline.todayX],
      ['annotation:0', 'annotation', timeline.toX(day(20))],
    ]);
    const [region, today, review] = on.markers;
    expect(region.label).toBeNull();
    expect(region.paint).toBe(annotationPaint({}));
    expect(today.paint).toBe(PAINTS.today);
    expect(today.label).toMatchObject({ text: 'Today', title: 'Today', paint: 'var(--gantt-today-label)' });
    // The tick keeps the annotation colour; the label text is the theme's (4.5:1 on the header)
    expect(review.paint).toBe('#ff0000');
    expect(review.label).toEqual({
      text: 'Review',
      title: 'Review',
      x: review.x + MARKER_LABEL_GAP,
      width: box('Review'),
      paint: 'var(--gantt-text)',
    });
  });

  it('uses labels.today and skips today when the line is hidden or out of range', () => {
    const ann = [{ x1: day(5), label: { text: 'Freeze' } }];
    expect(lane(ann, {}, { labels: { today: 'Oggi' } }).markers.find(m => m.kind === 'today')!.label!.text).toBe(
      'Oggi',
    );
    expect(lane(ann, {}, { todayX: null }).markers.map(m => m.kind)).toEqual(['annotation']);
    expect(lane(ann, {}, { todayX: -1 }).markers.map(m => m.kind)).toEqual(['annotation']);
    expect(lane(ann, { showToday: false }, { todayX: 500 }).markers.map(m => m.kind)).toEqual(['annotation']);
  });

  it('drops annotations that start outside the timeline', () => {
    const on = lane([
      { x1: new Date(2025, 0, 1), label: { text: 'Old' } },
      { x1: day(5), label: { text: 'Kept' } },
      { x1: new Date(2030, 0, 1), label: { text: 'Far' } },
    ]);
    expect(on.markers.filter(m => m.kind === 'annotation').map(m => m.key)).toEqual(['annotation:1']);
  });

  it('truncates a label with fitText so it stops before the next marker', () => {
    const { timeline } = setup({ showToday: false });
    // 48 px/day: two days apart = 96 px between the markers
    const text = 'Integration testing window';
    const on = lane(
      [
        { x1: day(10), label: { text } },
        { x1: day(12), label: { text: 'Go' } },
      ],
      { showToday: false },
    );
    const [first, second] = on.markers;
    const room = timeline.toX(day(12)) - MARKER_LABEL_GAP - (first.x + MARKER_LABEL_GAP);
    expect(room).toBe(96 - 2 * MARKER_LABEL_GAP);
    const fitted = fitText(text, room - 2 * MARKER_LABEL_PADDING, 11);
    expect(fitted.endsWith('…')).toBe(true);
    expect(first.label).toMatchObject({ text: fitted, title: text, x: first.x + MARKER_LABEL_GAP });
    expect(first.label!.width).toBeLessThanOrEqual(room);
    expect(first.label!.x + first.label!.width).toBeLessThanOrEqual(second.x - MARKER_LABEL_GAP);
    expect(second.label!.text).toBe('Go');
  });

  it('hides a label with less than 24 px of room, keeps the marker', () => {
    // 48 px/day at Day view: markers 1 day apart leave 40 px, so use hours in between (Hour view)
    const config = resolveConfig({ viewMode: ViewMode.Hour, showToday: false });
    const timeline = buildTimeline({ tasks, config, now: NOW });
    const at = (h: number, m = 0) => new Date(2026, 2, 10, h, m);
    // 960 px/day = 40 px/h: 30 min = 20 px apart → room 12 px; 45 min = 30 px → room 22 px; 1 h → 32 px
    const make = (gapMin: number) =>
      computeMarkerLane({
        config,
        timeline,
        annotations: [
          { x1: at(8), label: { text: 'Kick-off meeting' } },
          { x1: at(8, gapMin), label: { text: 'Standup' } },
        ],
        todayX: null,
        labels: DEFAULT_LABELS,
        fontPx: 12,
      }).markers;
    for (const gap of [0, 30, 45]) {
      const [first] = make(gap);
      expect(first.label).toBeNull();
    }
    const [first] = make(60);
    expect(MARKER_LABEL_MIN_WIDTH).toBe(24);
    expect(first.label).not.toBeNull();
    expect(first.label!.text.endsWith('…')).toBe(true);
  });

  it('on the same x, today keeps its label and the annotation hides it', () => {
    const { timeline } = setup();
    const on = lane([{ x1: new Date(2026, 2, 16, 10), label: { text: 'Now-ish' } }], {}, { todayX: null });
    const x = on.markers[0].x;
    const tie = lane([{ x1: new Date(2026, 2, 16, 10), label: { text: 'Now-ish' } }], {}, { todayX: x });
    expect(tie.markers.map(m => m.kind)).toEqual(['annotation', 'today']);
    expect(tie.markers[0].label).toBeNull();
    expect(tie.markers[1].label!.text).toBe('Today');
    expect(x).toBeLessThan(timeline.totalWidth);
  });

  it('the last label stops at the end of the timeline', () => {
    const { timeline } = setup({ showToday: false });
    const lastDay = new Date(timeline.end.getFullYear(), timeline.end.getMonth(), timeline.end.getDate() - 1);
    const [m] = lane([{ x1: lastDay, label: { text: 'A long label at the very end' } }], { showToday: false }).markers;
    expect(m.label).not.toBeNull();
    expect(m.label!.x + m.label!.width).toBeLessThanOrEqual(timeline.totalWidth);
    expect(m.label!.text.endsWith('…')).toBe(true);
  });

  it('labels never overlap, whatever the spacing', () => {
    const { timeline } = setup({ showToday: false });
    const annotations = Array.from({ length: 30 }, (_, i) => ({
      x1: new Date(2026, 2, 3, i * 7),
      label: { text: `Milestone number ${i}` },
    }));
    const { markers } = lane(annotations);
    for (let i = 0; i < markers.length; i++) {
      const l = markers[i].label;
      if (!l) continue;
      expect(l.width).toBeGreaterThanOrEqual(estimateTextWidth('…', 11));
      const limit = markers[i + 1] ? markers[i + 1].x - MARKER_LABEL_GAP : timeline.totalWidth;
      expect(l.x + l.width).toBeLessThanOrEqual(limit);
    }
  });
});

describe('computeAnnotationVisuals', () => {
  const { timeline } = setup();
  const span = { top: 40, bottom: 400 };
  const anns: GanttAnnotation[] = [
    { x1: day(5), x2: day(9), color: '#22c55e', opacity: 0.2, label: { text: 'Sprint' } },
    { x1: day(12), label: { text: 'Custom', color: '#000', fontSize: '15px', fontWeight: '400' } },
    { x1: day(14) },
    { x1: day(16), isToday: true },
  ];

  it("reproduces today's painter values (regions, dashed lines, +6 / +14 / font − 1)", () => {
    const v = computeAnnotationVisuals(anns, timeline, span, 12, false);
    const x = (d: Date) => timeline.toX(d);
    expect(v).toEqual([
      {
        key: '0',
        paint: '#22c55e',
        region: { x: x(day(5)), y: 40, width: x(day(9)) - x(day(5)), height: 360, opacity: 0.2 },
        line: { x: x(day(5)), y1: 40, y2: 400, strokeWidth: 1.5, dash: '5 3', opacity: 0.8 },
        label: { text: 'Sprint', x: x(day(5)) + 6, y: 54, fontSize: 11, fontWeight: 600, paint: '#22c55e' },
      },
      {
        key: '1',
        paint: 'var(--gantt-arrow)',
        region: null,
        line: { x: x(day(12)), y1: 40, y2: 400, ...ANNOTATION_LINE },
        label: { text: 'Custom', x: x(day(12)) + 6, y: 54, fontSize: '15px', fontWeight: '400', paint: '#000' },
      },
      {
        key: '2',
        paint: 'var(--gantt-arrow)',
        region: null,
        line: { x: x(day(14)), y1: 40, y2: 400, ...ANNOTATION_LINE },
        label: null,
      },
      {
        key: '3',
        paint: PAINTS.today,
        region: null,
        line: { x: x(day(16)), y1: 40, y2: 400, ...ANNOTATION_LINE },
        label: null,
      },
    ]);
  });

  it('a region without opacity uses 0.08; the label font follows fontPx', () => {
    const [v] = computeAnnotationVisuals([{ x1: day(5), x2: day(6), label: { text: 'A' } }], timeline, span, 14, false);
    expect(v.region!.opacity).toBe(0.08);
    expect(v.label!.fontSize).toBe(13);
  });

  it('draws no canvas label while the lane is on', () => {
    const on = lane(anns);
    expect(on.height).toBe(18);
    for (const flag of [true, on] as const) {
      const v = computeAnnotationVisuals(anns, timeline, span, 12, flag);
      expect(v.every(a => a.label === null)).toBe(true);
      // Regions and lines are unchanged
      expect(v.map(a => [a.region, a.line])).toEqual(
        computeAnnotationVisuals(anns, timeline, span, 12, false).map(a => [a.region, a.line]),
      );
    }
    expect(computeAnnotationVisuals(anns, timeline, span, 12, { height: 0 })[0].label).not.toBeNull();
  });

  it('a region that ends before it starts gets no negative width', () => {
    const [v] = computeAnnotationVisuals([{ x1: day(9), x2: day(5) }], timeline, span, 12, false);
    expect(v.region!.width).toBe(0);
  });
});
