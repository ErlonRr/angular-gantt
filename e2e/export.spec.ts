// Export and print (Gantry 2 phase 12) in both bindings, through the Phase 9 harness (`Gantt`: the Web
// Component in the playground page, Angular in the `/fixture` route, events recorded under the Web
// Component's names):
// - the toolbar's Export menu by keyboard (↓, ↑, End, Enter): SVG, PNG and CSV downloads (file
//   names, contents, the `before-export` → `export` events, the announcement) and Print…;
// - the files: SVG with role/title/desc, every task name, no `var(` / `<style>` / `foreignObject`;
//   PNG signature and IHDR = drawing × scale; CSV with BOM in files only, CRLF and formula
//   neutralisation;
// - the export options: `theme` (light / dark / the one shown), `range: 'visible'` (the timeline
//   is the viewport), collapsed rows (out of the SVG, in the CSV `rows: 'all'`), custom bars
//   (`renderBar` / an Angular bar component) drawn as on screen, `customBars: 'builtin'`;
// - parity: `exportSvg({ idPrefix })` and `exportCsv()` are byte-equal in both bindings (D2);
// - the `before-export` veto (no file, no `export` event), one print at a time;
// - `print()` through the print stub (e2e/print-stub.ts): pages, title, lang, `@page` size, alts,
//   footers, the hidden 0 × 0 frame and its removal after `afterprint`;
// - `@media print` (emulated): toolbar, splitter, live regions and the bar overlay hidden,
//   `print-color-adjust: exact`, no scrollbars;
// - the More menu of a 480 px chart holds the Export section.
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import {
  test,
  expect,
  BINDINGS,
  PLAN,
  Gantt,
  extraTasks,
  focused,
  frames,
  type Binding,
  type Chart,
  type GanttSetup,
} from './fixtures';
import { installPrintStub, printFrames, prints, topPrints } from './print-stub';

/** The plan with the toolbar's Export menu and a file name. */
const EXPORT_OPTIONS = {
  viewMode: 'Day',
  initialScroll: false,
  toolbar: { export: true },
  export: { fileName: 'e2e-plan' },
};

/** `labels.ariaChart`: the SVG title and the print document's title */
const TITLE = 'Gantt chart timeline';

/** Every task name of `PLAN`. */
const NAMES = PLAN.map(t => t.name);

async function open(chart: Chart, binding: Binding, setup: GanttSetup = {}): Promise<Gantt> {
  const g = new Gantt(chart, binding);
  await g.open(setup);
  return g;
}

/** Run `action` and return the download it starts: its name and bytes. */
async function download(page: Page, action: () => Promise<unknown>): Promise<{ name: string; bytes: Buffer }> {
  const [d] = await Promise.all([page.waitForEvent('download'), action()]);
  return { name: d.suggestedFilename(), bytes: await readFile(await d.path()) };
}

/** The root `<svg>`'s `width` × `height`. */
function svgSize(svg: string): { width: number; height: number } {
  const tag = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
  return { width: Number(attr(tag, 'width')), height: Number(attr(tag, 'height')) };
}

/** Attribute `name` of one start tag. */
const attr = (tag: string, name: string): string | null => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

/** The start tag of the first element whose `class` attribute contains `cls`. */
const tagWithClass = (svg: string, cls: string): string =>
  new RegExp(`<[a-z]+\\b[^>]*\\sclass="(?:[^"]*\\s)?${cls}(?:\\s[^"]*)?"[^>]*>`).exec(svg)?.[0] ?? '';

/** The background colour of an SVG export (`rect.gantry-export-bg`). */
const background = (svg: string): string | null => attr(tagWithClass(svg, 'gantry-export-bg'), 'fill');

/** Width of the timeline's clip (`clipPath#<p>-timeline > rect`). */
const timelineClip = (svg: string): number =>
  Number(/<clipPath\b[^>]*id="[^"]*-timeline"[^>]*>\s*<rect\b[^>]*\swidth="([\d.]+)"/.exec(svg)?.[1] ?? NaN);

/** The PNG signature and the IHDR size of `bytes`. */
function png(bytes: Buffer): { signature: boolean; width: number; height: number } {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return {
    signature: sig.every((b, i) => bytes[i] === b) && bytes.toString('latin1', 12, 16) === 'IHDR',
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

/** `exportPng(options)` in the page: the Blob's type, size and IHDR. */
function exportPng(page: Page, options: Record<string, unknown>) {
  return page.evaluate(async o => {
    const w = window as unknown as { __GANTRY_API__?: { chart: unknown } };
    const target = (w.__GANTRY_API__?.chart ?? document.querySelector('gantry-element')) as {
      exportPng(o: unknown): Promise<Blob>;
    };
    const blob = await target.exportPng(o);
    const view = new DataView(await blob.arrayBuffer());
    return { type: blob.type, size: blob.size, width: view.getUint32(16), height: view.getUint32(20) };
  }, options);
}

/** The menu open in the chart's toolbar: its label and items. */
function openMenu(chart: Chart): Promise<{ label: string | null; items: string[]; keys: string[] } | null> {
  return chart.evalRoot(root => {
    const menu = root.querySelector('.gantt-tb-menu[role="menu"]');
    if (!menu) return null;
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    return {
      label: menu.getAttribute('aria-label'),
      items: items.map(i => i.textContent?.trim() ?? ''),
      keys: items.map(i => i.getAttribute('data-focus-key') ?? ''),
    };
  });
}

/** `data-focus-key` of the element focused in the chart. */
const focusKey = async (chart: Chart) => (await focused(chart))?.key ?? null;

/** Parse a CSV file's records (no quoted line breaks in these fixtures). */
const records = (csv: string) =>
  csv
    .replace(/^\uFEFF/, '')
    .split('\r\n')
    .filter(Boolean);

/** The first field of a CSV record as written (quotes included). */
const firstField = (line: string): string => (/^"(?:[^"]|"")*"/.exec(line) ?? /^[^,]*/.exec(line))![0];

for (const binding of BINDINGS) {
  test.describe(`export · ${binding}`, () => {
    test('toolbar Export menu by keyboard: SVG, PNG and CSV files, Print…, events and announcements', async ({
      chart,
      page,
    }) => {
      test.setTimeout(60_000);
      await installPrintStub(page);
      const g = await open(chart, binding, { options: EXPORT_OPTIONS });
      const button = chart.get('[data-focus-key="export"]');
      await expect(button).toHaveAttribute('aria-haspopup', 'menu');
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(button).toHaveAttribute('aria-label', 'Export');
      await button.focus();

      // ↓ opens on the first item; Enter saves the SVG and puts the focus back on Export
      await page.keyboard.press('ArrowDown');
      await expect.poll(() => focusKey(chart)).toBe('menu:export:svg');
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      expect(await openMenu(chart)).toEqual({
        label: 'Export',
        items: ['SVG image', 'PNG image', 'CSV table', 'Print…'],
        keys: ['menu:export:svg', 'menu:export:png', 'menu:export:csv', 'menu:export:print'],
      });
      const svgFile = await download(page, () => page.keyboard.press('Enter'));
      expect(svgFile.name).toBe('e2e-plan.svg');
      const svg = svgFile.bytes.toString('utf8');
      expect(svg.startsWith('<?xml')).toBe(true);
      expect(svg).toMatch(/<svg\b[^>]*\srole="img"/);
      expect(svg).toContain(`>${TITLE}</title>`);
      expect(svg).toMatch(/<desc\b[^>]*>11 tasks from /);
      for (const name of NAMES) expect(svg, name).toContain(`>${name}<`);
      for (const banned of ['var(', '<style', 'foreignObject', '<script']) expect(svg, banned).not.toContain(banned);
      await expect.poll(() => focusKey(chart)).toBe('export');
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(await openMenu(chart)).toBeNull();
      await expect.poll(() => g.liveText()).toBe('e2e-plan.svg is ready');

      // ↓ ↓ Enter: the PNG, at twice the drawing's size (the menu opens on the next paint)
      await page.keyboard.press('ArrowDown');
      await expect.poll(() => focusKey(chart)).toBe('menu:export:svg');
      await page.keyboard.press('ArrowDown');
      await expect.poll(() => focusKey(chart)).toBe('menu:export:png');
      const pngFile = await download(page, () => page.keyboard.press('Enter'));
      expect(pngFile.name).toBe('e2e-plan.png');
      const size = svgSize(svg);
      expect(png(pngFile.bytes)).toEqual({
        signature: true,
        width: Math.round(size.width * 2),
        height: Math.round(size.height * 2),
      });
      await expect.poll(() => g.liveText()).toBe('e2e-plan.png is ready');

      // ↓ End ↑ Enter: the CSV (BOM, header, CRLF)
      await page.keyboard.press('ArrowDown');
      await expect.poll(() => focusKey(chart)).toBe('menu:export:svg');
      await page.keyboard.press('End');
      await expect.poll(() => focusKey(chart)).toBe('menu:export:print');
      await page.keyboard.press('ArrowUp');
      await expect.poll(() => focusKey(chart)).toBe('menu:export:csv');
      const csvFile = await download(page, () => page.keyboard.press('Enter'));
      expect(csvFile.name).toBe('e2e-plan.csv');
      const csv = csvFile.bytes.toString('utf8');
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      expect(csv).toContain('\r\n');
      expect(csv.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
      const lines = records(csv);
      expect(lines[0]).toMatch(/^Task Name,/);
      // Every task, in display order (roots by start date, children under their parent)
      expect(lines.slice(1).map(firstField).sort()).toEqual([...NAMES].sort());
      await expect.poll(() => g.liveText()).toBe('e2e-plan.csv is ready');

      // ↓ End Enter: Print…
      await page.keyboard.press('ArrowDown');
      await expect.poll(() => focusKey(chart)).toBe('menu:export:svg');
      await page.keyboard.press('End');
      await expect.poll(() => focusKey(chart)).toBe('menu:export:print');
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await prints(page)).length).toBe(1);
      await expect.poll(() => printFrames(page)).toBe(0);
      const printed = (await prints(page))[0];
      await expect
        .poll(() => g.liveText())
        .toBe(`Printing ${printed.images.length} page${printed.images.length === 1 ? '' : 's'}`);
      await expect.poll(() => focusKey(chart)).toBe('export');

      // before-export then export for each, from the toolbar, with the file's size
      await expect.poll(async () => (await g.events('export')).length).toBe(4);
      const events = (await g.events()).filter(e => e.type === 'before-export' || e.type === 'export');
      expect(events.map(e => `${e.type}:${String(e.detail['format'])}`)).toEqual([
        'before-export:svg',
        'export:svg',
        'before-export:png',
        'export:png',
        'before-export:csv',
        'export:csv',
        'before-export:print',
        'export:print',
      ]);
      expect(events[0].detail).toMatchObject({ format: 'svg', trigger: 'toolbar', fileName: 'e2e-plan.svg' });
      const sizes = { svg: svgFile.bytes.length, png: pngFile.bytes.length, csv: csvFile.bytes.length };
      for (const e of events.filter(x => x.type === 'export' && x.detail['format'] !== 'print')) {
        const format = e.detail['format'] as 'svg' | 'png' | 'csv';
        expect(e.detail).toEqual({
          format,
          trigger: 'toolbar',
          fileName: `e2e-plan.${format}`,
          size: sizes[format],
          pages: null,
        });
      }
      expect(events[7].detail).toEqual({
        format: 'print',
        trigger: 'toolbar',
        fileName: null,
        size: null,
        pages: printed.images.length,
      });
      expect(await topPrints(page)).toBe(0);
    });

    test('exportSvg / exportCsv / exportPng: theme, range, collapsed rows and the CSV rules', async ({
      chart,
      page,
    }) => {
      const tasks = [
        ...PLAN.map(t => (t.id === 'plan' ? { ...t, collapsed: true } : t)),
        { id: 'f1', name: '=HYPERLINK("x")', start: PLAN[0].start, end: PLAN[1].end },
        { id: 'f2', name: '+1 approve', start: PLAN[0].start, end: PLAN[1].end },
        { id: 'f3', name: '-2', start: PLAN[0].start, end: PLAN[1].end },
        { id: 'f4', name: '@sum', start: PLAN[0].start, end: PLAN[1].end },
        { id: 'f5', name: '\tTabbed', start: PLAN[0].start, end: PLAN[1].end },
        { id: 'f6', name: '-3', start: PLAN[0].start, end: PLAN[1].end },
      ];
      const g = await open(chart, binding, { tasks });

      // The SVG: no prolog, role/title/desc, no CSS; the collapsed group's children are not drawn
      const svg = await g.callAsync<string>('exportSvg');
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toMatch(/<svg\b[^>]*\saria-labelledby="[^"]+-title [^"]+-desc"/);
      expect(svg).toMatch(/<svg\b[^>]*\slang="en/);
      for (const banned of ['var(', '<style', 'foreignObject']) expect(svg, banned).not.toContain(banned);
      expect(svg).toContain('data-task-id="plan"');
      for (const id of ['scope', 'research', 'specs']) expect(svg, id).not.toContain(`data-task-id="${id}"`);
      expect(svg).toContain('data-task-id="build"');

      // The CSV: every loaded row (collapsed children included), no BOM from exportCsv()
      const csv = await g.callAsync<string>('exportCsv');
      expect(csv.charCodeAt(0)).not.toBe(0xfeff);
      const names = records(csv).slice(1).map(firstField);
      expect(names).toHaveLength(tasks.length);
      expect(names).toContain('Scope');
      expect(records(await g.callAsync<string>('exportCsv', { rows: 'shown' })).map(firstField)).not.toContain('Scope');
      // Formula neutralisation (a leading ', unless the cell is a plain number), then RFC 4180 quoting
      expect(names).toEqual(
        expect.arrayContaining([`"'=HYPERLINK(""x"")"`, `'+1 approve`, '-2', `'@sum`, `'\tTabbed`, '-3']),
      );
      for (const raw of ['=HYPERLINK', '+1 approve', '@sum', '\tTabbed']) {
        expect(
          names.filter(n => n.replace(/^"/, '').startsWith(raw)),
          raw,
        ).toEqual([]);
      }

      // Theme: the shown one (light) by default, the dark palette on request, and the shown dark one
      const light = background(await g.callAsync<string>('exportSvg', { theme: 'light' }));
      const dark = background(await g.callAsync<string>('exportSvg', { theme: 'dark' }));
      expect(light).toMatch(/^#|^rgb/);
      expect(dark).toMatch(/^#|^rgb/);
      expect(dark).not.toBe(light);
      expect(background(svg)).toBe(light);
      expect(svg).not.toContain('gantry-export-bg" fill="none"');
      expect(await g.callAsync<string>('exportSvg', { background: 'transparent' })).not.toContain('gantry-export-bg');

      // range 'visible': the timeline is the viewport's width
      const vp = await g.viewportMetrics();
      const visible = await g.callAsync<string>('exportSvg', { range: 'visible' });
      expect(Math.abs(timelineClip(visible) - vp.clientWidth)).toBeLessThanOrEqual(2);
      expect(timelineClip(svg)).toBeGreaterThan(vp.clientWidth);

      // PNG at scale 1: the drawing's own size
      const size = svgSize(svg);
      expect(await exportPng(page, { scale: 1 })).toMatchObject({
        type: 'image/png',
        width: Math.round(size.width),
        height: Math.round(size.height),
      });

      await g.set({ darkMode: true });
      expect(background(await g.callAsync<string>('exportSvg'))).toBe(dark);
      expect(background(await g.callAsync<string>('exportSvg', { theme: 'light' }))).toBe(light);
      // Data methods fire no events
      expect(await g.events('before-export')).toEqual([]);
    });

    test('custom bars are exported as drawn; customBars: builtin draws the built-in bar', async ({ chart }) => {
      const tasks = PLAN.map(t => (t.id === 'scope' || t.id === 'docs' ? { ...t, barType: 'e2e-custom' } : t));
      const g = await open(chart, binding, { tasks, customBars: true });
      // On screen first: the harness's custom bar is painted
      await expect(chart.get('[data-e2e-custom="scope"]')).toHaveCount(1);

      const svg = await g.callAsync<string>('exportSvg');
      // Every custom row, mounted or not, in its own bar group, painted with its attributes
      expect(svg.match(/data-e2e-custom="/g)).toHaveLength(2);
      for (const id of ['scope', 'docs']) {
        expect(svg, id).toMatch(
          new RegExp(
            `<g\\b[^>]*data-task-id="${id}"[^>]*>(?:(?!<g\\b[^>]*data-task-id=)[\\s\\S])*data-e2e-custom="${id}"`,
          ),
        );
      }
      expect(svg).toMatch(/<path\b[^>]*fill="#7C3AED"/);
      for (const banned of ['var(', '<style', 'foreignObject', '_ngcontent', '_nghost', 'ng-version']) {
        expect(svg, banned).not.toContain(banned);
      }
      expect(await g.callAsync<string>('exportSvg', { customBars: 'builtin' })).not.toContain('data-e2e-custom');
    });

    test('before-export veto: no file, no export event', async ({ chart, page }) => {
      await installPrintStub(page);
      const g = await open(chart, binding, { vetoExport: ['csv', 'print'] });
      let downloads = 0;
      page.on('download', () => downloads++);

      expect(await g.callAsync<boolean>('download', 'csv')).toBe(false);
      expect(await g.callAsync<boolean>('print')).toBe(false);
      await frames(page);
      expect(downloads).toBe(0);
      expect(await prints(page)).toEqual([]);
      expect(await printFrames(page)).toBe(0);
      expect((await g.events()).map(e => `${e.type}:${String(e.detail['format'])}`)).toEqual([
        'before-export:csv',
        'before-export:print',
      ]);
      expect((await g.events('before-export'))[0].detail).toMatchObject({
        format: 'csv',
        trigger: 'api',
        fileName: 'gantt.csv',
      });
      expect((await g.events('before-export'))[1].detail).toMatchObject({ format: 'print', fileName: null });

      // The others run: the default file name, from the API
      await g.clearEvents();
      const file = await download(page, () => g.callAsync<boolean>('download', 'svg'));
      expect(file.name).toBe('gantt.svg');
      expect((await g.events('export')).map(e => e.detail)).toEqual([
        { format: 'svg', trigger: 'api', fileName: 'gantt.svg', size: file.bytes.length, pages: null },
      ]);
    });

    test('one print at a time: a print() called while another runs resolves false', async ({ chart, page }) => {
      // Web Component: every call shares one import() of the lazy export chunk and the lock is taken
      // before any await, so a second call in the same tick never starts a second print
      await installPrintStub(page, { readSvgs: false });
      const g = await open(chart, binding);
      await g.callAsync<string>('exportCsv');
      // A slow CPU widens the gap between the calls (the race shows within a few tries)
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
      const results = await page.evaluate(async () => {
        const w = window as unknown as { __GANTRY_API__?: { chart: unknown } };
        const target = (w.__GANTRY_API__?.chart ?? document.querySelector('gantry-element')) as {
          print(): Promise<boolean>;
        };
        const out: boolean[][] = [];
        for (let i = 0; i < 10; i++) {
          out.push(await Promise.all([target.print(), target.print()]));
          await new Promise(r => setTimeout(r, 20));
        }
        return out;
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      expect(results).toEqual(Array.from({ length: 10 }, () => [true, false]));
      await expect.poll(async () => (await prints(page)).length).toBe(10);
      await expect.poll(() => printFrames(page)).toBe(0);
      expect((await g.events('export')).length).toBe(10);
    });

    test('print(): 60 rows on A4 portrait through the hidden frame, removed after afterprint', async ({
      chart,
      page,
    }) => {
      await installPrintStub(page);
      const g = await open(chart, binding, { tasks: [...PLAN, ...extraTasks(49)] });
      expect(await g.callAsync<boolean>('print', { paper: 'a4', orientation: 'portrait' })).toBe(true);
      await expect.poll(async () => (await prints(page)).length).toBe(1);
      const p = (await prints(page))[0];
      const n = p.images.length;
      expect(n).toBeGreaterThanOrEqual(2);

      // The frame: hidden, 0 × 0, out of the accessibility tree and the tab order, in the body
      expect(p.frame).toEqual({
        title: TITLE,
        ariaHidden: 'true',
        tabIndex: '-1',
        className: 'gantry-print-frame',
        width: 0,
        height: 0,
        position: 'fixed',
        visibility: 'hidden',
        inBody: true,
      });
      // The document: title, lang, A4 portrait page, one decoded image per page with its alt and footer
      expect(p.title).toBe(TITLE);
      expect(p.lang).toMatch(/^en/);
      expect(p.pageCss).toMatch(/@page\s*\{\s*size:\s*210mm 297mm;\s*margin:\s*10mm;?\s*\}/);
      for (const [i, img] of p.images.entries()) {
        expect(img.alt).toBe(`${TITLE}, Page ${i + 1} of ${n}`);
        expect(img.complete && img.naturalWidth > 0, `page ${i + 1} decoded`).toBe(true);
        expect(img.width).toBeGreaterThan(0);
        expect(img.height).toBeGreaterThan(0);
      }
      expect(p.footers).toEqual(p.images.map((_, i) => `${TITLE} · Page ${i + 1} of ${n}`));
      // Every row printed, the 60th included (only part of them are mounted on screen)
      const svgs = p.svgs!.join('\n');
      for (const name of ['Planning', 'Retro', 'Extra task 1', 'Extra task 49'])
        expect(svgs, name).toContain(`>${name}<`);
      for (const banned of ['var(', '<style', 'foreignObject']) expect(svgs, banned).not.toContain(banned);

      await expect.poll(() => printFrames(page)).toBe(0);
      expect(await topPrints(page)).toBe(0);
      expect((await g.events('export')).map(e => e.detail)).toEqual([
        { format: 'print', trigger: 'api', fileName: null, size: null, pages: n },
      ]);
      await expect.poll(() => g.liveText()).toBe(`Printing ${n} pages`);
    });

    test('@media print hides the toolbar, splitter, live regions and overlay; colours print exactly', async ({
      chart,
      page,
    }) => {
      const g = await open(chart, binding, { options: EXPORT_OPTIONS });
      // The keyboard focus on a bar: its overlay ring is shown
      await g.focusBefore();
      await g.tabTo('bar');
      await expect(chart.get('.gantt-bar-overlay .gantt-bar-focus-ring')).toHaveCount(1);
      const HIDDEN = ['.gantt-toolbar', '.gantry-splitter', '.gantt-sr-live', '.gantt-sr-alert', '.gantt-bar-overlay'];
      const state = () =>
        chart.evalRoot((root, sels) => {
          const host = root instanceof ShadowRoot ? root.host : (root as Element);
          // Rendered: no `display: none` on it or an ancestor (checkVisibility() misses it on SVG groups)
          const rendered = (el: Element) => {
            for (let e: Element | null = el; e; e = e.parentElement ?? (e.getRootNode() as ShadowRoot).host ?? null) {
              if (getComputedStyle(e).display === 'none') return false;
            }
            return true;
          };
          const shown = (sel: string) => [...root.querySelectorAll(sel)].some(rendered);
          const vp = getComputedStyle(root.querySelector('.gantry-canvas-viewport')!);
          const bar = root.querySelector('.gantt-bars-layer [data-task-id] .gantt-bar-body');
          return {
            shown: Object.fromEntries(sels.map(s => [s, shown(s)])),
            colorAdjust: getComputedStyle(host).printColorAdjust,
            viewport: `${vp.overflowX} ${vp.overflowY} ${vp.scrollbarWidth}`,
            bars: !!bar && rendered(bar),
            rows: shown('.gantt-tl-row'),
          };
        }, HIDDEN);

      const screen = await state();
      expect(screen.shown).toEqual(Object.fromEntries(HIDDEN.map(s => [s, true])));
      expect(screen.colorAdjust).toBe('economy');

      await page.emulateMedia({ media: 'print' });
      await frames(page);
      const print = await state();
      expect(print.shown).toEqual(Object.fromEntries(HIDDEN.map(s => [s, false])));
      expect(print.colorAdjust).toBe('exact');
      expect(print.viewport).toBe('hidden hidden none');
      expect(print.bars).toBe(true);
      expect(print.rows).toBe(true);

      await page.emulateMedia({ media: 'screen' });
      await frames(page);
      expect((await state()).shown['.gantt-toolbar']).toBe(true);
    });

    test('a 480 px chart moves Export into More as a section of the same items', async ({ chart, page }) => {
      const g = await open(chart, binding, { options: EXPORT_OPTIONS, box: { width: 480, height: 600 } });
      await expect(chart.get('.gantt-tb-more')).toBeVisible();
      await expect(chart.get('.gantt-tb-export')).toHaveCount(0);
      await chart.get('[data-focus-key="more"]').focus();
      await page.keyboard.press('ArrowDown');
      await expect(chart.get('.gantt-tb-menu[role="menu"]')).toHaveCount(1);
      const section = chart.get('.gantt-tb-menu .gantt-tb-menu-group[aria-label="Export"]');
      await expect(section).toHaveAttribute('role', 'group');
      await expect(section.locator('[role="menuitem"]')).toHaveText(['SVG image', 'PNG image', 'CSV table', 'Print…']);
      // Never a nested menu
      await expect(chart.get('.gantt-tb-menu [aria-haspopup]')).toHaveCount(0);

      // ↓ until the CSV item, Enter
      for (let i = 0; i < 20 && (await focusKey(chart)) !== 'menu:export:csv'; i++)
        await page.keyboard.press('ArrowDown');
      expect(await focusKey(chart)).toBe('menu:export:csv');
      const file = await download(page, () => page.keyboard.press('Enter'));
      expect(file.name).toBe('e2e-plan.csv');
      await expect.poll(() => focusKey(chart)).toBe('more');
      expect((await g.events('export'))[0].detail).toMatchObject({ format: 'csv', trigger: 'toolbar' });
    });
  });
}

test('the Web Component and Angular export the same SVG and CSV bytes', async ({ chart }) => {
  const setup: GanttSetup = {
    tasks: PLAN.map(t => (t.id === 'build' ? { ...t, collapsed: true } : t)),
    options: { viewMode: 'Day', initialScroll: false, criticalPath: true, showToday: true },
  };
  const out: Record<string, string[]> = {};
  for (const binding of BINDINGS) {
    const g = await open(chart, binding, setup);
    out[binding] = [
      await g.callAsync<string>('exportSvg', { idPrefix: 'p' }),
      await g.callAsync<string>('exportSvg', { idPrefix: 'p', theme: 'dark', range: 'visible' }),
      await g.callAsync<string>('exportCsv'),
      await g.callAsync<string>('exportCsv', { columns: 'all', values: 'display', delimiter: ';' }),
    ];
  }
  const [svg, darkVisible, csv, display] = out['vanilla'];
  expect(svg.length).toBeGreaterThan(5000);
  expect(svg).toContain('id="p-title"');
  expect(out['angular'][0], 'exportSvg').toBe(svg);
  expect(out['angular'][1], 'exportSvg dark, visible').toBe(darkVisible);
  expect(out['angular'][2], 'exportCsv').toBe(csv);
  expect(out['angular'][3], 'exportCsv all columns, display, ;').toBe(display);
});
