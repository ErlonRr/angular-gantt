// The marker lane follows the shown view (no timeline in the table view, so no lane), and the
// zoom level's toolbar label is shared by the toolbar model and both bindings' announcements.
import { describe, expect, it } from 'vitest';
import {
  buildTimeline,
  computeMarkerLane,
  DEFAULT_LABELS,
  markerLaneShown,
  MARKER_LANE_HEIGHT,
  resolveConfig,
  zoomLevelLabel,
  type GanttAnnotation,
} from '@gantryjs/core';

const annotations: GanttAnnotation[] = [{ x1: new Date(2026, 9, 12), label: { text: 'Freeze' } }];

describe('marker lane and the view', () => {
  const config = resolveConfig({});
  it('is hidden in the table view, shown in the split and chart views', () => {
    expect(markerLaneShown(config, annotations, 'table')).toBe(false);
    expect(markerLaneShown(config, annotations, 'split')).toBe(true);
    expect(markerLaneShown(config, annotations, 'chart')).toBe(true);
    expect(markerLaneShown(config, annotations)).toBe(true);
  });

  it('computeMarkerLane returns no lane in the table view', () => {
    const timeline = buildTimeline({ tasks: [], config, now: new Date(2026, 9, 14) });
    const base = { config, timeline, annotations, todayX: null, labels: DEFAULT_LABELS };
    expect(computeMarkerLane({ ...base, view: 'split' }).height).toBe(MARKER_LANE_HEIGHT);
    expect(computeMarkerLane({ ...base, view: 'table' })).toMatchObject({ height: 0, markers: [] });
  });
});

describe('zoomLevelLabel', () => {
  it('prefers the level label, then labels.viewModes, then the name', () => {
    const labels = { viewModes: { ...DEFAULT_LABELS.viewModes, Week: 'Settimana' } };
    expect(zoomLevelLabel({ name: 'Week', label: 'Weeks' }, labels)).toBe('Weeks');
    expect(zoomLevelLabel({ name: 'Week' }, labels)).toBe('Settimana');
    expect(zoomLevelLabel({ name: 'Sprint' }, labels)).toBe('Sprint');
  });
});
