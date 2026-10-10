import { test as base, expect, type Page, type Locator } from '@playwright/test';

/** Fixed "now" for every page: dates, the today marker and screenshots stay stable. */
// Explicit offset: the browser runs in Europe/Rome (CEST on that date), the runner may not
export const NOW = new Date('2026-10-14T10:00:00+02:00');

type Fixtures = { chart: Chart; pageErrors: string[] };

/**
 * `chart` drives either binding: Playwright CSS locators pierce the Web Component's
 * open shadow root, so the same selectors work for `<gantry-element>` and Angular's `<gantry>`.
 * Every test fails if the page logs an error or throws.
 */
export const test = base.extend<Fixtures>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
      page.on('console', m => {
        if (m.type() === 'error') errors.push(`console: ${m.text()}`);
      });
      await page.clock.setFixedTime(NOW);
      await use(errors);
      expect(errors, 'the page logged errors').toEqual([]);
    },
    { auto: true },
  ],
  chart: async ({ page }, use) => {
    await use(new Chart(page));
  },
});
export { expect };

export const SEL = {
  row: '.gantt-tl-row',
  taskBar: '.gantt-bars-layer [data-bar-type="task"] .gantt-bar-body',
  tier: '.g-tier',
  colHeaders: '.gantt-tl-col-headers',
  timelineHeader: '.g-header',
  rowRect: '.gantt-rows rect',
  panel: '.gantry-panel, .gantt-panel-scroll',
  viewport: '.gantry-canvas-viewport, .gantt-timeline-scroll',
  main: '.gantry-main',
  toggle: '.gantry-splitter-toggle',
  viewPills: '.gantt-tb-views .gantt-tb-pill',
} as const;

export class Chart {
  constructor(readonly page: Page) {}

  host(): Locator {
    return this.page.locator('gantry-element, gantry').first();
  }
  get(selector: string): Locator {
    return this.host().locator(selector);
  }
  viewport(): Locator {
    return this.get(SEL.viewport).first();
  }
  panel(): Locator {
    return this.get(SEL.panel).first();
  }

  async open(url: string): Promise<void> {
    await this.page.goto(url);
    await expect(this.get(SEL.row).first()).toBeVisible();
  }

  /** Run `fn` against the element hosting the chart (shadow root for the Web Component). */
  evalRoot<R, A = undefined>(fn: (root: ParentNode, arg: A) => R, arg?: A): Promise<R> {
    return this.host().evaluate(
      (host, [src, a]) => {
        const root = (host as HTMLElement).shadowRoot ?? host;
        // The callback crosses into the page as source text: rebuild it there
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        return new Function('root', 'arg', `return (${src})(root, arg)`)(root, a);
      },
      [fn.toString(), arg] as const,
    ) as Promise<R>;
  }

  /** Bounding box, retried: the Web Component rebuilds parts of its DOM on every render. */
  async box(locator: Locator) {
    let b: Awaited<ReturnType<Locator['boundingBox']>> = null;
    await expect.poll(async () => (b = await locator.boundingBox().catch(() => null)) !== null).toBe(true);
    return b!;
  }
}
