// The Web Component under a strict Content-Security-Policy with Trusted Types: no inline style
// (`style-src 'self'`), no eval, and every HTML parsing sink locked (`require-trusted-types-for
// 'script'; trusted-types 'none'`). The header is injected through `page.route`, so the page
// (apps/demo-vanilla/csp.html) stays free of inline script and style. Every interaction must
// leave zero `securitypolicyviolation` events and no console error (the shared fixture fails a
// test that logs one).
import { test as plain, type Locator, type Page } from '@playwright/test';
import { test, expect, SEL, type Chart } from './fixtures';
import { TARGETS } from '../playwright.config';

const URL = `http://localhost:${TARGETS.vanilla.port}/csp.html`;
const POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
].join('; ');

interface Violation {
  directive: string;
  blocked: string;
  sample: string;
  source: string;
}

/** Serves csp.html with the policy and records every violation into `window.__violations`. */
async function withPolicy(page: Page): Promise<void> {
  await page.route('**/csp.html', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': POLICY } });
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __violations: unknown[] };
    w.__violations = [];
    document.addEventListener(
      'securitypolicyviolation',
      e =>
        w.__violations.push({
          directive: e.effectiveDirective,
          blocked: e.blockedURI,
          sample: e.sample,
          source: `${e.sourceFile}:${e.lineNumber}:${e.columnNumber}`,
        }),
      true,
    );
  });
}

const violations = (page: Page): Promise<Violation[]> =>
  page.evaluate(() => (window as unknown as { __violations: Violation[] }).__violations);

/** Two animation frames: the element paints once per frame. */
const frames = (page: Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

/** A task bar fully inside the timeline viewport (its id and box). */
async function visibleBar(chart: Chart): Promise<{ id: string; x: number; y: number; width: number; height: number }> {
  const vb = await chart.box(chart.viewport());
  const bars = chart.get(SEL.taskBar);
  const count = await bars.count();
  for (let i = 0; i < count; i++) {
    const b = await bars.nth(i).boundingBox();
    if (
      b &&
      b.width > 48 &&
      b.x > vb.x + 8 &&
      b.x + b.width + 160 < vb.x + vb.width &&
      b.y > vb.y + 60 &&
      b.y + b.height < vb.y + vb.height - 8
    ) {
      const id = await bars.nth(i).evaluate(el => el.closest('[data-task-id]')!.getAttribute('data-task-id')!);
      return { id, ...b };
    }
  }
  throw new Error('no fully visible task bar');
}

const width = async (chart: Chart, locator: Locator) => (await chart.box(locator)).width;

/** The width of `locator` once its CSS transition is over (equal across two measurements 100 ms apart). */
async function settledWidth(chart: Chart, locator: Locator): Promise<number> {
  let last = -1;
  await expect
    .poll(
      async () => {
        const w = await width(chart, locator);
        const same = Math.abs(w - last) < 0.5;
        last = w;
        return same;
      },
      { intervals: [100] },
    )
    .toBe(true);
  return last;
}

test.describe('strict CSP + Trusted Types', () => {
  test('renders and handles every interaction with zero violations', async ({ page, chart }) => {
    test.setTimeout(60_000);
    await withPolicy(page);
    await page.goto(URL);
    const host = chart.host();
    await expect(chart.get(SEL.row).first()).toBeVisible();
    await expect(chart.get('.gantt-bars-layer [data-task-id]').first()).toBeAttached();
    await frames(page);

    // Styled through adopted constructable sheets (shared base + theme): no style element, and the
    // host's style attribute is only the page's own `height`
    const styling = await host.evaluate(el => ({
      adopted: el.shadowRoot!.adoptedStyleSheets.length,
      styleElements: el.shadowRoot!.querySelectorAll('style').length,
      hostStyle: el.getAttribute('style'),
      bg: getComputedStyle(el).getPropertyValue('--gantt-bg').trim(),
      panelBg: getComputedStyle(el.shadowRoot!.querySelector('.gantry-panel')!).backgroundColor,
    }));
    expect(styling.adopted).toBe(2);
    expect(styling.styleElements).toBe(0);
    expect(styling.hostStyle).toBe('height: 100vh;');
    expect(styling.bg).not.toBe('');
    expect(styling.panelBg).not.toBe('rgba(0, 0, 0, 0)');

    // Tooltip on hover
    const bar = await visibleBar(chart);
    await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
    await expect(chart.get('.gantt-tooltip')).toBeVisible();
    // Resize cursor over the bar's right handle: a data attribute + stylesheet rule
    await page.mouse.move(bar.x + bar.width - 2, bar.y + bar.height / 2);
    await expect(chart.get('.gantry-canvas-container')).toHaveAttribute('data-cursor', 'ew-resize');
    await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
    await expect(chart.get('.gantry-canvas-container')).not.toHaveAttribute('data-cursor', /./);
    // Leave the canvas: the tooltip hides
    await page.mouse.move(4, 4);
    await expect(chart.get('.gantt-tooltip')).toBeHidden();

    // Drag a bar (ghost, movement label, dimmed bar)
    const grab = { x: bar.x + Math.min(20, bar.width / 3), y: bar.y + bar.height / 2 };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 60, grab.y, { steps: 6 });
    await expect(chart.get('.gantt-drag-preview')).toHaveCount(1);
    await page.mouse.up();
    const moved = chart.get(`.gantt-bars-layer [data-task-id="${bar.id}"] .gantt-bar-body`);
    await expect.poll(async () => ((await moved.boundingBox())?.x ?? bar.x) - bar.x).toBeGreaterThan(0);
    await expect(chart.get('.gantt-drag-preview')).toHaveCount(0);

    // Select a row
    await chart.get(SEL.row).nth(2).click();
    await expect(chart.get(SEL.row).nth(2)).toHaveAttribute('aria-selected', 'true');

    // Vertical scroll (wheel on the timeline and on the panel) and horizontal scroll
    const vp = chart.viewport();
    await vp.hover();
    await page.mouse.wheel(0, 600);
    await expect.poll(() => vp.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await expect
      .poll(async () =>
        Math.abs((await vp.evaluate(el => el.scrollTop)) - (await chart.panel().evaluate(el => el.scrollTop))),
      )
      .toBeLessThanOrEqual(1);
    await chart.panel().hover();
    await page.mouse.wheel(0, -300);
    const left = await vp.evaluate(el => el.scrollLeft);
    await vp.evaluate(el => {
      el.scrollLeft += 900;
    });
    await expect.poll(() => vp.evaluate(el => el.scrollLeft)).not.toBe(left);
    await frames(page);

    // Toolbar: zoom out and back in
    await chart.get('[data-focus-key="zoom-out"]').click();
    await frames(page);
    await chart.get('[data-focus-key="zoom-in"]').click();
    await frames(page);

    // Theme: dark mode, a theme override, then back
    await host.evaluate(el => {
      (el as HTMLElement & { darkMode: boolean }).darkMode = true;
    });
    await expect
      .poll(() => host.evaluate(el => getComputedStyle(el).getPropertyValue('--gantt-bg').trim()))
      .not.toBe(styling.bg);
    await host.evaluate(el => {
      (el as HTMLElement & { setTheme(t: object): void }).setTheme({ barColor: '#FDE68A' });
    });
    // Non-critical task bars take the new colour (critical ones keep `criticalColor`)
    await expect
      .poll(() => chart.get(SEL.taskBar).evaluateAll(els => els.map(el => getComputedStyle(el).fill)))
      .toContain('rgb(253, 230, 138)');
    await host.evaluate(el => {
      const g = el as HTMLElement & { darkMode: boolean; resetTheme?: () => void; setTheme(t: object): void };
      if (typeof g.resetTheme === 'function') g.resetTheme();
      else g.setTheme({});
      g.darkMode = false;
    });
    await frames(page);

    // Table view, then a column resize
    const pills = chart.get(SEL.viewPills);
    const splitColumns = await chart.get('.gantt-tl-col-header').count();
    await pills.nth(1).click();
    await expect.poll(() => chart.get('.gantt-tl-col-header').count()).toBeGreaterThan(splitColumns);
    // The panel animates to the full width: measure once it has settled
    await expect
      .poll(async () => Math.abs((await width(chart, chart.panel())) - (await width(chart, chart.get(SEL.main)))))
      .toBeLessThanOrEqual(2);
    await settledWidth(chart, chart.panel());
    // The second column: the name column flexes to fill the table view
    const header = chart.get('.gantt-tl-col-header').nth(1);
    const before = await width(chart, header);
    // The handle overhangs the header's right edge, which clips it: grab its visible part
    const head = await chart.box(header);
    const grip = { x: head.x + head.width - 1.5, y: head.y + head.height / 2 };
    await page.mouse.move(grip.x, grip.y);
    await page.mouse.down();
    await page.mouse.move(grip.x + 40, grip.y, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => width(chart, header)).toBeGreaterThan(before + 20);
    // The click that ends the resize doesn't sort
    await expect(header).not.toHaveAttribute('aria-sort', /ascending|descending/);
    await pills.nth(0).click();
    await frames(page);

    // Collapse a group row (back at the top, where the demo plan's groups are) and expand it again
    await vp.evaluate(el => {
      el.scrollTop = 0;
    });
    await expect.poll(() => chart.panel().evaluate(el => el.scrollTop)).toBe(0);
    await frames(page);
    // (the rows stay windowed, so the group row's state is the observable change)
    const group = chart.get(`${SEL.row}[aria-expanded]`).first();
    const groupId = await group.getAttribute('data-task-id');
    const groupRow = chart.get(`${SEL.row}[data-task-id="${groupId}"]`);
    await expect(groupRow).toHaveAttribute('aria-expanded', 'true');
    await groupRow.locator('.gantt-collapse-btn').click();
    await expect(groupRow).toHaveAttribute('aria-expanded', 'false');
    await groupRow.locator('.gantt-collapse-btn').click();
    await expect(groupRow).toHaveAttribute('aria-expanded', 'true');

    // Splitter: collapse and restore the panel, then drag it wider
    const toggle = chart.get(SEL.toggle).first();
    const panelWidth = await settledWidth(chart, chart.panel());
    await toggle.click();
    await expect.poll(async () => Math.round((await chart.panel().boundingBox())?.width ?? -1)).toBe(0);
    await toggle.click();
    await expect
      .poll(async () => Math.abs(((await chart.panel().boundingBox())?.width ?? 0) - panelWidth))
      .toBeLessThanOrEqual(1);
    const splitter = await chart.box(chart.get('.gantry-splitter'));
    await page.mouse.move(splitter.x + splitter.width / 2, splitter.y + splitter.height - 40);
    await page.mouse.down();
    await page.mouse.move(splitter.x + splitter.width / 2 + 60, splitter.y + splitter.height - 40, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => width(chart, chart.panel())).toBeGreaterThan(panelWidth + 30);

    await frames(page);
    expect(await violations(page)).toEqual([]);
  });
});

// Controls (plain Playwright: they log CSP errors on purpose). They prove the policy is really
// enforced on this page, so "zero violations" above can't pass vacuously.
plain.describe('strict CSP controls', () => {
  plain('the policy blocks inline style and HTML parsing sinks on the page', async ({ page }) => {
    await withPolicy(page);
    await page.goto(URL);
    await expect(page.locator('gantry-element .gantt-tl-row').first()).toBeVisible();
    const result = await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = 'body { outline: 1px solid red; }';
      document.head.append(style);
      let sink = 'allowed';
      try {
        document.body.insertAdjacentHTML('beforeend', '<b>x</b>');
      } catch (e) {
        sink = (e as Error).name;
      }
      return { styleApplied: style.sheet !== null, sink };
    });
    expect(result).toEqual({ styleApplied: false, sink: 'TypeError' });
    const directives = (await violations(page)).map(v => v.directive);
    expect(directives).toContain('style-src-elem');
    expect(directives).toContain('require-trusted-types-for');
  });

  plain('without constructable stylesheets the style-element fallback is refused (documented)', async ({ page }) => {
    await withPolicy(page);
    await page.addInitScript(() => {
      // Pretend an engine without constructable stylesheets (Safari < 16.4)
      Object.defineProperty(CSSStyleSheet.prototype, 'replaceSync', { value: undefined });
    });
    await page.goto(URL);
    await expect(page.locator('gantry-element .gantt-tl-row').first()).toBeAttached();
    const shadow = await page.locator('gantry-element').evaluate(el => ({
      adopted: el.shadowRoot!.adoptedStyleSheets.length,
      styles: el.shadowRoot!.querySelectorAll('style').length,
    }));
    expect(shadow).toEqual({ adopted: 0, styles: 1 });
    expect((await violations(page)).map(v => v.directive)).toContain('style-src-elem');
  });
});
