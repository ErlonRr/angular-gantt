// Every binding paints the same core model: with the same tasks (the demo plan around the
// frozen "now") and the same options, bars land on the same pixels relative to the timeline.
import { test, expect, type Chart } from './fixtures';
import { TARGETS } from '../playwright.config';

const OPTIONS = { viewMode: 'Week', rowHeight: 36, baseline: true, criticalPath: false, showToday: true };

type Boxes = Record<string, { x: number; y: number; w: number; h: number }>;

/** Bar boxes by task id, relative to the timeline SVG (independent of page layout and scroll). */
function barBoxes(chart: Chart): Promise<Boxes> {
  return chart.evalRoot((root) => {
    const svg = root.querySelector('.gantt-bars-layer')?.closest('svg');
    if (!svg) return {};
    const o = svg.getBoundingClientRect();
    const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const bar of root.querySelectorAll('.gantt-bars-layer [data-task-id]')) {
      const body = bar.querySelector('.gantt-bar-body, path, rect') ?? bar;
      const r = body.getBoundingClientRect();
      out[bar.getAttribute('data-task-id')!] = { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
    }
    return out;
  });
}

async function webComponentBoxes(chart: Chart, url: string): Promise<Boxes> {
  await chart.open(url);
  await chart.host().evaluate((el, o) => { (el as HTMLElement & { options: object }).options = o; }, OPTIONS);
  await expect(chart.get('.gantt-bars-layer [data-task-id]').first()).toBeVisible();
  await chart.page.waitForTimeout(100);
  return barBoxes(chart);
}

test('bars match pixel for pixel across the Web Component, React, Vue, Svelte and Angular', async ({ chart }) => {
  const reference = await webComponentBoxes(chart, `http://localhost:${TARGETS.vanilla.port}/`);
  expect(Object.keys(reference).length).toBeGreaterThan(5);

  const others: Record<string, Boxes> = {};
  for (const name of ['react', 'vue', 'svelte'] as const) {
    others[name] = await webComponentBoxes(chart, `http://localhost:${TARGETS[name].port}/`);
  }
  await chart.open(`http://localhost:${TARGETS.angular.port}/demo?options=${encodeURIComponent(JSON.stringify(OPTIONS))}`);
  await expect(chart.get('.gantt-bars-layer [data-task-id]').first()).toBeVisible();
  others['angular'] = await barBoxes(chart);

  for (const [name, boxes] of Object.entries(others)) {
    // Compare the bars both sides render (virtualisation may cut different tails)
    const common = Object.keys(reference).filter(id => id in boxes);
    expect(common.length, `${name}: bars in common`).toBeGreaterThan(5);
    for (const id of common) {
      const a = reference[id], b = boxes[id];
      for (const k of ['x', 'y', 'w', 'h'] as const) {
        expect(Math.abs(a[k] - b[k]), `${name} · ${id} · ${k}`).toBeLessThanOrEqual(0.5);
      }
    }
  }
});
