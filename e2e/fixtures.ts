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

/** Computed colours by stable element key (see `collectPaints`). */
export type PaintRecords = Record<string, string>;

/**
 * Computed colours of every element of the chart, keyed by a stable structural path and
 * sorted. The path restarts at "anchor" layers (`bars`, `arrows`, `bands`, `header`…) and at
 * any element with a `data-task-id` (`bars[api]/path.gantt-bar-body`), so a key names the same
 * thing in both bindings wherever their markup agrees. The visible tooltip is collected under
 * `tooltip/…` whether it lives in the chart (Web Component) or in `<body>` (Angular).
 * SVG elements record fill / stroke / opacities; HTML elements and SVG text record color,
 * background, border colours, opacity and font family. Runs CSS animations to their end first.
 */
export function collectPaints(chart: Chart): Promise<PaintRecords> {
  return chart.evalRoot(root => {
    const host = root instanceof ShadowRoot ? root.host : (root as Element);
    const anims = [...document.getAnimations(), ...(root instanceof ShadowRoot ? root.getAnimations() : [])];
    for (const a of anims) {
      const end = a.effect?.getComputedTiming().endTime;
      if (typeof end === 'number' && Number.isFinite(end)) a.finish();
    }

    const ANCHORS: Record<string, string> = {
      'gantt-toolbar': 'toolbar',
      'gantt-legend': 'legend',
      'g-header': 'header',
      'gantt-tl-col-headers': 'tl-head',
      'gantt-tl-rows': 'tl-rows',
      'gantt-rows': 'rows',
      'gantt-bands': 'bands',
      'gantt-grid': 'grid',
      'gantt-annotations': 'annotations',
      'gantt-annotation-labels': 'annotation-labels',
      'gantt-today': 'today',
      'gantt-arrows': 'arrows',
      'gantt-bars-layer': 'bars',
      'gantt-tooltip': 'tooltip',
    };
    const SKIP = new Set(['STYLE', 'SCRIPT', 'TEMPLATE', 'LINK']);
    const out: Record<string, string> = {};

    const classOf = (el: Element) => [...el.classList].find(c => !c.startsWith('ng-') && !c.startsWith('_ng')) ?? '';
    const anchorOf = (el: Element) => {
      for (const c of el.classList) if (ANCHORS[c]) return ANCHORS[c];
      return null;
    };
    const token = (el: Element) => {
      const id = el.getAttribute('data-task-id');
      if (id !== null) return `[${id}]`;
      const c = classOf(el);
      return el.tagName.toLowerCase() + (c ? `.${c}` : '');
    };
    const segment = (el: Element) => {
      const t = token(el);
      let i = 0;
      for (let s = el.previousElementSibling; s; s = s.previousElementSibling) if (token(s) === t) i++;
      return i ? `${t}:${String(i).padStart(3, '0')}` : t;
    };
    const record = (el: Element, key: string) => {
      const cs = getComputedStyle(el);
      const svg = el instanceof SVGElement;
      const parts: string[] = [];
      if (svg) {
        parts.push(
          `fill=${cs.fill}`,
          `stroke=${cs.stroke}`,
          `fill-opacity=${cs.fillOpacity}`,
          `stroke-opacity=${cs.strokeOpacity}`,
        );
      }
      if (!svg || el.tagName.toLowerCase() === 'text') {
        parts.push(`color=${cs.color}`);
        if (!svg) {
          parts.push(`background-color=${cs.backgroundColor}`);
          const b = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor];
          parts.push(b.every(c => c === b[0]) ? `border-color=${b[0]}` : `border-colors=${b.join(' | ')}`);
        }
        parts.push(`font-family=${cs.fontFamily}`);
      }
      parts.push(`opacity=${cs.opacity}`);
      let k = key;
      for (let n = 2; k in out; n++) k = `${key}~${n}`;
      out[k] = parts.join('; ');
    };
    const walk = (el: ParentNode, path: string, inTooltip: boolean) => {
      for (const child of el.children) {
        if (SKIP.has(child.tagName)) continue;
        if (!inTooltip && child.classList.contains('gantt-tooltip')) continue;
        const anchor = anchorOf(child);
        const seg = segment(child);
        const key = child.hasAttribute('data-task-id')
          ? `${path.split('/')[0]}${seg}`
          : anchor && !inTooltip
            ? anchor
            : `${path}/${seg}`;
        record(child, key);
        walk(child, key, inTooltip);
      }
    };

    record(host, 'host');
    walk(root, 'host', false);
    // The open tooltip: in the shadow root (Web Component) or a popover in <body> (Angular)
    const tips = [...root.querySelectorAll('.gantt-tooltip'), ...document.querySelectorAll('body > .gantt-tooltip')];
    const tip = tips.find(t => getComputedStyle(t).display !== 'none');
    if (tip) {
      record(tip, 'tooltip');
      walk(tip, 'tooltip', true);
    }
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  });
}
