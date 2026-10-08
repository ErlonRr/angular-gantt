#!/usr/bin/env node
// Gantry visual QA — drives a real browser against a running demo and checks
// the invariants that regress most often. Works with the Web Component
// (<gantry-element>, shadow DOM) and the Angular library (<gantry>, light DOM).
//
// Usage:
//   node scripts/qa/qa.mjs --url http://localhost:4171 [options]
//
// Options:
//   --url <url>          page to test (required)
//   --name <label>       label used in the report and screenshot names (default: host:port)
//   --out <dir>          screenshot directory (default: $TMPDIR/gantry-qa)
//   --viewport <WxH>     default 1400x820
//   --options '<json>'   Web Component only: merged into `el.options` before the checks
//   --rows <n>           Web Component only: append n generated tasks (exercises virtual + scroll sync)
//   --skip <list>        comma list of checks to skip: drag,panel,table,scroll
//   --browser <path>     browser executable (or env GANTRY_QA_BROWSER); Chrome/Chromium/Firefox
//
// Prints a JSON report; exits 1 when a check fails or the page logs errors.

import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

// ── CLI ─────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]?.startsWith('--') ? 'true' : all[i + 1]]);
    return acc;
  }, []),
);
if (!args.url) {
  console.error('Missing --url');
  process.exit(2);
}
const url = args.url;
const name = args.name ?? new URL(url).host.replace(':', '-');
const outDir = args.out ?? join(tmpdir(), 'gantry-qa');
const [vw, vh] = (args.viewport ?? '1400x820').split('x').map(Number);
const skip = new Set((args.skip ?? '').split(',').filter(Boolean));
mkdirSync(outDir, { recursive: true });

const CANDIDATES = [
  process.env.GANTRY_QA_BROWSER,
  args.browser,
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/firefox', '/Applications/Firefox.app/Contents/MacOS/firefox',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
].filter(Boolean);
const executablePath = CANDIDATES.find(p => existsSync(p));
if (!executablePath) {
  console.error('No browser found. Set GANTRY_QA_BROWSER to a Chrome/Chromium/Firefox executable.');
  process.exit(2);
}

// ── Page helpers (run in the browser) ───────────────────────
// Everything is resolved through one root so the same selectors work for the
// Web Component (shadow root) and Angular (light DOM).
const ROOT_FN = `(() => {
  const host = document.querySelector('gantry-element') ?? document.querySelector('gantry');
  return host ? (host.shadowRoot ?? host) : null;
})()`;
const SEL = {
  row: '.gantt-tl-row',
  bar: 'svg [data-bar-type="task"] .gantt-bar-body',
  tier: '.g-tier',
  colHeaders: '.gantt-tl-col-headers',
  timelineHeader: '.g-header',
  rowRect: '.gantt-rows rect',
  panel: '.gantry-panel, .gantt-panel-scroll',
  viewport: '.gantry-canvas-viewport, .gantt-timeline-scroll',
  main: '.gantry-main',
  toggle: '.gantry-splitter-toggle',
  viewPills: '.gantt-tb-views .gantt-tb-pill',
};

const report = { name, url, browser: executablePath, checks: {}, errors: [], screenshots: [] };
const fail = (check, detail) => { report.checks[check] = { ok: false, ...detail }; };
const pass = (check, detail = {}) => { report.checks[check] = { ok: true, ...detail }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  browser: executablePath.toLowerCase().includes('firefox') ? 'firefox' : 'chrome',
  executablePath,
  headless: true,
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: vw, height: vh });
  page.on('pageerror', e => report.errors.push(String(e?.message ?? e)));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });

  const q = (fn, ...a) => page.evaluate(fn, ...a);
  const inRoot = (body) => q(new Function('SEL', `const root = ${ROOT_FN}; if (!root) return null; ${body}`), SEL);
  const shot = async (label) => {
    const path = join(outDir, `${name}-${label}.png`);
    await page.screenshot({ path });
    report.screenshots.push(path);
  };
  /** Click an element inside the chart root (works across the shadow boundary). */
  const clickIn = async (selector, index = 0) => {
    const handle = await page.evaluateHandle(
      new Function('s', 'i', `const root = ${ROOT_FN}; return root ? root.querySelectorAll(s)[i] ?? null : null;`),
      selector, index,
    );
    const el = handle.asElement();
    if (!el) return false;
    await el.click();
    return true;
  };

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(
    new Function(`const root = ${ROOT_FN}; return !!root && root.querySelectorAll('.gantt-tl-row').length > 0;`),
    { timeout: 20_000 },
  );
  report.kind = await q(() => (document.querySelector('gantry-element') ? 'web-component' : 'angular'));

  if (args.rows && report.kind === 'web-component') {
    await q(n => {
      const el = document.querySelector('gantry-element');
      const base = new Date();
      const extra = Array.from({ length: n }, (_, i) => ({
        id: `qa-${i}`, name: `QA task ${i + 1}`, progress: (i * 7) % 100,
        start: new Date(base.getFullYear(), base.getMonth(), base.getDate() - 20 + (i % 30)),
        end: new Date(base.getFullYear(), base.getMonth(), base.getDate() - 10 + (i % 30)),
      }));
      el.tasks = [...el.tasks, ...extra];
    }, Number(args.rows));
  }
  if (args.options && report.kind === 'web-component') {
    await q(o => { const el = document.querySelector('gantry-element'); el.options = { ...el.options, ...JSON.parse(o) }; }, args.options);
  }
  await sleep(500);

  // ── Render ────────────────────────────────────────────────
  const counts = await inRoot(`return {
    rows: root.querySelectorAll(SEL.row).length,
    bars: root.querySelectorAll('svg [data-task-id]').length,
    tiers: root.querySelectorAll(SEL.tier).length,
  };`);
  report.render = counts;
  if (counts.rows > 0 && counts.bars > 0 && counts.tiers > 0) pass('render', counts);
  else fail('render', counts);
  await shot('initial');

  // ── Header heights: task-list column header == timeline header ─
  const headers = await inRoot(`
    const a = root.querySelector(SEL.colHeaders)?.getBoundingClientRect().height ?? -1;
    const b = root.querySelector(SEL.timelineHeader)?.getBoundingClientRect().height ?? -2;
    return { panel: a, timeline: b };`);
  if (Math.abs(headers.panel - headers.timeline) <= 0.5) pass('headerHeight', headers);
  else fail('headerHeight', headers);

  // ── Row alignment: first panel row and first canvas row at the same y ─
  const rowAlign = async () => inRoot(`
    const row = [...root.querySelectorAll(SEL.row)].find(r => r.getBoundingClientRect().height > 0);
    const rect = root.querySelector(SEL.rowRect);
    if (!row || !rect) return null;
    const vp = root.querySelector(SEL.viewport), panel = root.querySelector(SEL.panel);
    // Compare the row whose top is the same row index on both sides
    const idx = Number(row.getAttribute('aria-rowindex')) - 2;
    const rects = [...root.querySelectorAll(SEL.rowRect)];
    const rh = rect.getBoundingClientRect().height;
    const canvasTop = rects.find(r => Math.round(Number(r.getAttribute('y')) / rh) === idx)?.getBoundingClientRect().top;
    return { panelTop: row.getBoundingClientRect().top, canvasTop, panelScroll: panel?.scrollTop, canvasScroll: vp?.scrollTop };`);
  const align0 = await rowAlign();
  if (align0 && align0.canvasTop != null && Math.abs(align0.panelTop - align0.canvasTop) <= 0.5) pass('rowAlignment', align0);
  else fail('rowAlignment', align0 ?? { reason: 'rows not found' });

  if (!skip.has('scroll')) {
    const scrolled = await inRoot(`
      const vp = root.querySelector(SEL.viewport);
      if (!vp || vp.scrollHeight <= vp.clientHeight + 4) return { scrollable: false };
      vp.scrollTop = Math.min(300, vp.scrollHeight - vp.clientHeight);
      return { scrollable: true };`);
    if (scrolled?.scrollable) {
      await sleep(400);
      const a = await rowAlign();
      const synced = a && Math.abs((a.panelScroll ?? 0) - (a.canvasScroll ?? 0)) <= 1;
      if (synced && a.canvasTop != null && Math.abs(a.panelTop - a.canvasTop) <= 0.5) pass('scrollSync', a);
      else fail('scrollSync', a ?? {});
      await inRoot(`root.querySelector(SEL.viewport).scrollTop = 0; return true;`);
      await sleep(300);
    } else {
      report.checks.scrollSync = { ok: true, skipped: 'not scrollable' };
    }
  }

  // ── Drag: move the first visible task bar with a real mouse ─
  if (!skip.has('drag')) {
    // Bring the first task bar into view
    await inRoot(`
      const vp = root.querySelector(SEL.viewport), bar = root.querySelector(SEL.bar);
      if (vp && bar) vp.scrollLeft += bar.getBoundingClientRect().left - vp.getBoundingClientRect().left - 160;
      return true;`);
    await sleep(400);
    const box = await inRoot(`
      const vp = root.querySelector(SEL.viewport).getBoundingClientRect();
      const bar = [...root.querySelectorAll(SEL.bar)].find(b => {
        const r = b.getBoundingClientRect();
        return r.width > 40 && r.left > vp.left && r.left + 40 < vp.right && r.top > vp.top + 40 && r.bottom < vp.bottom;
      });
      if (!bar) return null;
      const r = bar.getBoundingClientRect();
      return { id: bar.closest('[data-task-id]').getAttribute('data-task-id'), x: r.left + Math.min(20, r.width / 3), y: r.top + r.height / 2, left: r.left, room: vp.right - r.left };`);
    if (!box) {
      report.checks.drag = { ok: true, skipped: 'no fully visible task bar' };
    } else {
      const dx = Math.max(40, Math.min(120, box.room - 60));
      await page.mouse.move(box.x, box.y);
      await page.mouse.down();
      for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + (dx * i) / 6, box.y);
      await page.mouse.up();
      await sleep(400);
      const after = await inRoot(`return root.querySelector('svg [data-task-id="${box.id}"] .gantt-bar-body')?.getBoundingClientRect().left ?? null;`);
      const moved = after == null ? null : Math.round(after - box.left);
      const ghost = await inRoot(`return root.querySelectorAll('.gantt-drag-preview, g[ganttdragpreview] rect, g[ganttDragPreview] rect').length;`);
      if (moved && moved > 0 && ghost === 0) pass('drag', { task: box.id, pointerDx: dx, barMovedPx: moved });
      else fail('drag', { task: box.id, pointerDx: dx, barMovedPx: moved, ghostLeft: ghost });
      await shot('after-drag');
    }
  }

  // ── Panel: collapse and restore the last width ────────────
  if (!skip.has('panel')) {
    const width = () => inRoot(`return Math.round(root.querySelector(SEL.panel)?.getBoundingClientRect().width ?? -1);`);
    const before = await width();
    if (await clickIn(SEL.toggle)) {
      await sleep(450);
      const collapsed = await width();
      await clickIn(SEL.toggle);
      await sleep(450);
      const restored = await width();
      const detail = { before, collapsed, restored };
      if (collapsed === 0 && Math.abs(restored - before) <= 1) pass('panelToggle', detail);
      else fail('panelToggle', detail);
    } else {
      report.checks.panelToggle = { ok: true, skipped: 'no collapse toggle (panel.collapsible: false?)' };
    }
  }

  // ── Table view: the task list takes the full width ────────
  if (!skip.has('table')) {
    if (await clickIn(SEL.viewPills, 1)) {
      await sleep(450);
      const t = await inRoot(`return {
        panel: Math.round(root.querySelector(SEL.panel).getBoundingClientRect().width),
        main: Math.round(root.querySelector(SEL.main).getBoundingClientRect().width),
        columns: root.querySelectorAll('.gantt-tl-col-header').length,
      };`);
      await shot('table');
      if (Math.abs(t.panel - t.main) <= 2) pass('tableView', t);
      else fail('tableView', t);
      await clickIn(SEL.viewPills, 0);
      await sleep(400);
    } else {
      report.checks.tableView = { ok: true, skipped: 'no view switch (toolbar.viewToggle: false?)' };
    }
  }
} catch (err) {
  report.fatal = String(err?.message ?? err);
} finally {
  await browser.close();
}

report.ok = !report.fatal && report.errors.length === 0 && Object.values(report.checks).every(c => c.ok);
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
