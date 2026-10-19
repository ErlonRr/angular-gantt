// The narrow-width layout (Gantry 2 phase 10, `options.responsive` on by default: below 640 px the
// chart shows the timeline alone) and the toolbar's More menu (`toolbar.overflow: 'menu'`), in both
// bindings through the Phase 9 harness (fixtures.ts), the chart's box resized in place:
// - 600 px: the chart view (`data-view="chart"`, `data-narrow`) and a More button in the toolbar;
//   1000 px: the wide view again and no More button;
// - the More menu works with the keyboard only (WAI-ARIA menu button: Enter / Space / ↓ / ↑ open it,
//   ↑/↓ wrap, Home / End, Enter runs an item, Esc closes; focus goes back to More);
// - the view forced by the width is never persisted: `getState().view` keeps the wide view.
import { test, expect, Gantt, BINDINGS, focused, frames, type Chart } from './fixtures';

/** `data-view` and `data-narrow` of the chart: on the wrapper in the Web Component's shadow root, on Angular's host. */
function layout(chart: Chart): Promise<{ view: string | null; narrow: boolean }> {
  return chart.evalRoot(root => {
    const el = root instanceof ShadowRoot ? root.querySelector('.gantry-wrapper') : (root as Element);
    return { view: el?.getAttribute('data-view') ?? null, narrow: el?.hasAttribute('data-narrow') ?? false };
  });
}

/** Resize the chart's box (inline style: wins over the fixture's stylesheet in both bindings). */
async function setWidth(chart: Chart, width: number): Promise<void> {
  await chart.host().evaluate((el, w) => (el as HTMLElement).style.setProperty('width', `${w}px`), width);
}

/** `data-focus-key` of the element focused inside the chart, `null` when focus is outside it. */
async function focusKey(chart: Chart): Promise<string | null> {
  return (await focused(chart))?.key ?? null;
}

const ZOOM_ITEMS = ['Hour', 'Day', 'Week', 'Month', 'Quarter', 'Year'].map(l => `menu:zoom:${l}`);

for (const binding of BINDINGS) {
  test.describe(`responsive · ${binding}`, () => {
    test('600 px: the chart view and a More button; 1000 px: the wide view, no More', async ({ chart }) => {
      const g = new Gantt(chart, binding);
      await g.open();
      const more = chart.get('.gantt-tb-more');
      expect(await layout(chart)).toEqual({ view: 'split', narrow: false });
      await expect(more).toHaveCount(0);

      await setWidth(chart, 600);
      await expect.poll(() => layout(chart)).toEqual({ view: 'chart', narrow: true });
      await expect(more).toBeVisible();
      await expect(more).toHaveAttribute('aria-haspopup', 'menu');
      await expect(more).toHaveAttribute('aria-expanded', 'false');
      await expect(more).toHaveAccessibleName('More');
      // The zoom levels went into the menu: no level radio group left in the toolbar
      await expect(chart.get('.gantt-tb-pills:not(.gantt-tb-views)')).toHaveCount(0);

      await setWidth(chart, 1000);
      await expect.poll(() => layout(chart)).toEqual({ view: 'split', narrow: false });
      await expect(more).toHaveCount(0);
      await expect(chart.get('.gantt-tb-pills:not(.gantt-tb-views) [role="radio"]')).toHaveCount(6);
      await expect(chart.panel()).toBeVisible();

      await setWidth(chart, 600);
      await expect.poll(() => layout(chart)).toEqual({ view: 'chart', narrow: true });
      await expect(more).toBeVisible();
    });

    test('opened at 600 px: the chart view and a More button', async ({ chart }) => {
      const g = new Gantt(chart, binding);
      await g.open({ box: { width: 600, height: 600 } });
      await expect.poll(() => layout(chart)).toEqual({ view: 'chart', narrow: true });
      await expect(chart.get('.gantt-tb-more')).toBeVisible();
      expect((await g.call<{ view: string }>('getState')).view).toBe('split');
    });

    test('the More menu with the keyboard only', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open({ box: { width: 600, height: 600 } });
      const more = chart.get('.gantt-tb-more');
      const menu = chart.get('.gantt-tb-menu');
      await expect(more).toBeVisible();

      // Tab into the toolbar, End: More is the last control of the roving set
      await g.focusBefore();
      await g.tabTo('toolbar');
      await page.keyboard.press('End');
      await expect.poll(() => focusKey(chart)).toBe('more');

      // Enter opens the menu on the checked level
      await page.keyboard.press('Enter');
      await expect(menu).toBeVisible();
      await expect(menu).toHaveAttribute('role', 'menu');
      await expect(more).toHaveAttribute('aria-expanded', 'true');
      const menuId = await menu.getAttribute('id');
      expect(menuId).toBeTruthy();
      await expect(more).toHaveAttribute('aria-controls', menuId!);
      await expect(chart.get('.gantt-tb-menu-item')).toHaveCount(ZOOM_ITEMS.length);
      await expect.poll(() => focusKey(chart)).toBe('menu:zoom:Day');

      // ↓ / ↑ move, Home / End go to the ends, both arrows wrap
      for (const [key, expected] of [
        ['ArrowDown', 'menu:zoom:Week'],
        ['ArrowUp', 'menu:zoom:Day'],
        ['Home', ZOOM_ITEMS[0]],
        ['ArrowUp', ZOOM_ITEMS[ZOOM_ITEMS.length - 1]],
        ['ArrowDown', ZOOM_ITEMS[0]],
        ['End', ZOOM_ITEMS[ZOOM_ITEMS.length - 1]],
      ] as const) {
        await page.keyboard.press(key);
        await expect.poll(() => focusKey(chart), { message: key }).toBe(expected);
      }

      // Esc closes it, focus back on More
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await expect(more).toHaveAttribute('aria-expanded', 'false');
      await expect.poll(() => focusKey(chart)).toBe('more');
      expect(await layout(chart)).toEqual({ view: 'chart', narrow: true });

      // Space opens it; Enter on an item runs it and closes the menu back to More
      await page.keyboard.press('Space');
      await expect(menu).toBeVisible();
      await expect.poll(() => focusKey(chart)).toBe('menu:zoom:Day');
      await page.keyboard.press('ArrowDown');
      await expect.poll(() => focusKey(chart)).toBe('menu:zoom:Week');
      await page.keyboard.press('Enter');
      await expect(menu).toHaveCount(0);
      await expect.poll(() => focusKey(chart)).toBe('more');
      await expect.poll(async () => (await g.call<{ viewMode: string }>('getState')).viewMode).toBe('Week');

      // ↓ on More opens on the checked item, ↑ on the last one
      await page.keyboard.press('ArrowDown');
      await expect(menu).toBeVisible();
      await expect.poll(() => focusKey(chart)).toBe('menu:zoom:Week');
      await expect(chart.get('.gantt-tb-menu-item[data-focus-key="menu:zoom:Week"]')).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await page.keyboard.press('ArrowUp');
      await expect(menu).toBeVisible();
      await expect.poll(() => focusKey(chart)).toBe(ZOOM_ITEMS[ZOOM_ITEMS.length - 1]);
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await expect.poll(() => focusKey(chart)).toBe('more');
    });

    test('the forced narrow view is not persisted: getState().view keeps the wide view', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open();
      await g.call('setView', 'table');
      await expect.poll(() => layout(chart)).toEqual({ view: 'table', narrow: false });

      await setWidth(chart, 600);
      await expect.poll(() => layout(chart)).toEqual({ view: 'chart', narrow: true });
      await frames(page);
      expect((await g.call<{ view: string }>('getState')).view).toBe('table');

      // Wide again: the view from before comes back
      await setWidth(chart, 1000);
      await expect.poll(() => layout(chart)).toEqual({ view: 'table', narrow: false });
      expect((await g.call<{ view: string }>('getState')).view).toBe('table');
    });
  });
}
