// Scroll performance of the Web Component on 10 000 tasks with ~5 000 dependencies (Day view,
// three years): flush durations from the scheduler's `gantry:flush` measure while scrolling both
// axes for 300 frames, and the DOM size at the start, the middle and the end of the chart.
// Blocking (Phase 6 gate): p95 flush < 4 ms, median < 2 ms, < 3000 shadow DOM nodes, < 400 header
// cells and < 300 band rects at each position. The numbers are logged as annotations. One retry
// absorbs a noisy CI runner.
//
// Plain Playwright `test`, not the shared fixture: its fixed clock replaces `performance` and
// `requestAnimationFrame` with fakes, which would drop the measures and the frame timing.
import { test, expect } from '@playwright/test';
import { TARGETS } from '../playwright.config';

const FRAMES = 300;

test.describe.configure({ retries: 1 });

interface Counts {
  nodes: number;
  cells: number;
  bands: number;
  bars: number;
}

const quantile = (sorted: readonly number[], q: number) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;

test('scrolls 10k tasks within the frame budget', { tag: '@perf' }, async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto(`http://localhost:${TARGETS.vanilla.port}/perf.html`);
  const host = page.locator('gantry-element');
  await expect(host.locator('.gantt-bars-layer [data-task-id]').first()).toBeAttached({ timeout: 30_000 });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate(() => performance.clearMeasures());

  const durations = await host.evaluate(async (el, frames) => {
    const vp = el.shadowRoot!.querySelector<HTMLElement>('.gantry-canvas-viewport')!;
    const frame = () => new Promise<void>(r => requestAnimationFrame(() => r()));
    let dy = 37;
    let dx = 53;
    for (let i = 0; i < frames; i++) {
      await frame();
      const maxTop = vp.scrollHeight - vp.clientHeight;
      const maxLeft = vp.scrollWidth - vp.clientWidth;
      if (vp.scrollTop + dy > maxTop || vp.scrollTop + dy < 0) dy = -dy;
      if (vp.scrollLeft + dx > maxLeft || vp.scrollLeft + dx < 0) dx = -dx;
      vp.scrollTop += dy;
      vp.scrollLeft += dx;
    }
    await frame();
    await frame();
    return performance.getEntriesByName('gantry:flush').map(e => e.duration);
  }, FRAMES);

  const sorted = [...durations].sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  const p95 = quantile(sorted, 0.95);
  const max = sorted.at(-1) ?? 0;

  // DOM size after jumping to the start, the middle and the end
  const counts: Record<string, Counts> = {};
  for (const [name, at] of [
    ['start', 0],
    ['middle', 0.5],
    ['end', 1],
  ] as const) {
    counts[name] = await host.evaluate(async (el, f) => {
      const root = el.shadowRoot!;
      const vp = root.querySelector<HTMLElement>('.gantry-canvas-viewport')!;
      vp.scrollTop = (vp.scrollHeight - vp.clientHeight) * f;
      vp.scrollLeft = (vp.scrollWidth - vp.clientWidth) * f;
      for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r));
      return {
        nodes: root.querySelectorAll('*').length,
        cells: root.querySelectorAll('.g-cell').length,
        bands: root.querySelectorAll('.gantt-bands rect').length,
        bars: root.querySelectorAll('.gantt-bars-layer [data-task-id]').length,
      };
    }, at);
  }

  const fmt = (n: number) => n.toFixed(2);
  info.annotations.push(
    {
      type: 'flush',
      description: `${durations.length} flushes · median ${fmt(median)} ms · p95 ${fmt(p95)} ms · max ${fmt(max)} ms`,
    },
    ...Object.entries(counts).map(([name, c]) => ({
      type: `dom ${name}`,
      description: `${c.nodes} nodes · ${c.cells} .g-cell · ${c.bands} band rects · ${c.bars} bars`,
    })),
  );
  console.log(
    `[perf] flushes=${durations.length} median=${fmt(median)}ms p95=${fmt(p95)}ms max=${fmt(max)}ms ` +
      Object.entries(counts)
        .map(([name, c]) => `${name}: nodes=${c.nodes} cells=${c.cells} bands=${c.bands} bars=${c.bars}`)
        .join(' | '),
  );

  expect(errors, 'the page logged errors').toEqual([]);
  expect(durations.length, 'the scroll was rendered').toBeGreaterThan(0);
  expect(counts['end'].bars, 'bars at the end position').toBeGreaterThan(0);
  expect(p95, 'p95 flush (ms)').toBeLessThan(4);
  expect(median, 'median flush (ms)').toBeLessThan(2);
  for (const [name, c] of Object.entries(counts)) {
    expect(c.nodes, `${name}: shadow DOM nodes`).toBeLessThan(3000);
    expect(c.cells, `${name}: header cells`).toBeLessThan(400);
    expect(c.bands, `${name}: band rects`).toBeLessThan(300);
  }
});
