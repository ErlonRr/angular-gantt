// The keyboard model of Gantry 2 phase 9 (contract §3d, D5–D7, D24), keyboard only, with the same
// test body for the Web Component (`<gantry-element>` in the playground page) and Angular (the
// showcase's `/fixture` route), through the `Gantt` harness of ./fixtures:
// - the toolbar is one tab stop whose controls rove with ←/→ (wrapping) and Home/End; moving
//   focus never checks a zoom radio, Enter / Space do;
// - the task list is one tab stop: ↑/↓ rows (the header row above the first), →/← expand and
//   collapse a group (announced in the live region), then step into the cells and back;
// - the timeline's tab stop is one bar: ↑/↓ move to the neighbouring bars, ←/→ pan by one cell;
// - Enter starts move mode: ←/→ move, Shift resizes the end, Alt the start, Enter commits (the task
//   changes, `task-dragged` / `task-resized` fire), Esc cancels;
// - Ctrl/⌘+A selects every task; + − T F zoom, scroll to today and fit, and
//   `keyboard.characterShortcuts: false` turns those four off;
// - the focus ring (the bar overlay) is visible on the focused bar and never under the sticky
//   header (WCAG 2.4.11).
import type { Page } from '@playwright/test';
import {
  test,
  expect,
  BINDINGS,
  DEFAULT_OPTIONS,
  Gantt,
  LEVEL_PX_PER_DAY,
  PLAN,
  extraTasks,
  focused,
  frames,
  type Chart,
} from './fixtures';
import { day } from './paint-fixture';

/** The toolbar's controls in roving order (contract §3c, `data-focus-key`). */
const TOOLBAR_KEYS = [
  'zoom-out',
  'zoom-in',
  'fit',
  'zoom:Hour',
  'zoom:Day',
  'zoom:Week',
  'zoom:Month',
  'zoom:Quarter',
  'zoom:Year',
  'today',
  'view:split',
  'view:table',
  'view:chart',
];

/** `data-focus-key` of the focused element inside the chart. */
const keyOf = async (chart: Chart) => (await focused(chart))?.key ?? null;
/** Task of the focused bar or row. */
const taskOf = async (chart: Chart) => (await focused(chart))?.taskId ?? null;

/** `local` (a local ISO date-time of the fixture) as the page's `Date#toISOString()`. */
const iso = (page: Page, local: string) => page.evaluate(s => new Date(s).toISOString(), local);

/**
 * Give the chart time to react to keys that should do nothing (two frames and the 250 ms
 * announcement debounce): a negative check has nothing to poll for.
 */
async function settle(page: Page): Promise<void> {
  await frames(page);
  await page.waitForTimeout(300);
  await frames(page);
}

/** Client boxes of the focus ring (the overlay's rect), the focused bar's body and the sticky header. */
function ringGeometry(chart: Chart) {
  return chart.evalRoot(root => {
    const host = root instanceof ShadowRoot ? root.host : (root as Element);
    const active = host.shadowRoot ? host.shadowRoot.activeElement : document.activeElement;
    const ring = root.querySelector('.gantt-bar-overlay .gantt-bar-focus-ring');
    const body = active?.querySelector('.gantt-bar-body, path, rect');
    const header = root.querySelector('.gantry-canvas-header-sticky');
    const viewport = root.querySelector<HTMLElement>('.gantry-canvas-viewport');
    if (!ring || !body || !header || !viewport) return null;
    const r = ring.getBoundingClientRect();
    const b = body.getBoundingClientRect();
    const vp = viewport.getBoundingClientRect();
    const cs = getComputedStyle(ring);
    return {
      ring: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
      body: { top: b.top, bottom: b.bottom, left: b.left, right: b.right },
      headerBottom: header.getBoundingClientRect().bottom,
      viewportBottom: vp.top + viewport.clientTop + viewport.clientHeight,
      stroke: cs.stroke,
      strokeWidth: parseFloat(cs.strokeWidth),
      visible: (ring as SVGGraphicsElement).checkVisibility(),
    };
  });
}

/**
 * `'ok'` when the focused bar shows a visible ring around it and `part` (the bar's body, or the
 * whole ring) is below the sticky header and above the viewport's bottom; otherwise what is wrong.
 */
async function ringInView(chart: Chart, part: 'bar' | 'ring'): Promise<string> {
  const r = await ringGeometry(chart);
  if (!r || !r.visible || r.stroke === 'none' || r.strokeWidth < 2) return 'no visible ring';
  if (r.ring.top > r.body.top || r.ring.bottom < r.body.bottom) return 'ring off the bar';
  const box = part === 'bar' ? r.body : r.ring;
  if (box.top < r.headerBottom - 0.5) return `${part} under the header by ${r.headerBottom - box.top}px`;
  if (box.bottom > r.viewportBottom + 0.5) return `${part} below the viewport by ${box.bottom - r.viewportBottom}px`;
  return 'ok';
}

/** The timeline and the task list scrolled to the same offset, and still for 100 ms (their sync is done). */
async function scrollSettled(chart: Chart): Promise<void> {
  let last = '';
  await expect
    .poll(
      async () => {
        const now = await chart.evalRoot(root => {
          const v = root.querySelector('.gantry-canvas-viewport')!;
          const p = root.querySelector('.gantry-panel')!;
          return Math.abs(v.scrollTop - p.scrollTop) <= 1 ? `${v.scrollTop},${v.scrollLeft}` : 'syncing';
        });
        const still = now !== 'syncing' && now === last;
        last = now;
        return still;
      },
      { intervals: [100] },
    )
    .toBe(true);
}

for (const binding of BINDINGS) {
  test.describe(`keyboard · ${binding}`, () => {
    test('toolbar: one tab stop, arrows rove and wrap, Enter / Space check a zoom level, focus never does', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open();
      await g.focusBefore();
      await page.keyboard.press('Tab');
      expect((await focused(chart))?.kind).toBe('toolbar');
      expect(await g.level()).toBe('Day');

      // Home / End, then ←/→ wrap around the ends
      await page.keyboard.press('Home');
      expect(await keyOf(chart)).toBe('zoom-out');
      await page.keyboard.press('End');
      expect(await keyOf(chart)).toBe('view:chart');
      await page.keyboard.press('ArrowRight');
      expect(await keyOf(chart)).toBe('zoom-out');
      await page.keyboard.press('ArrowLeft');
      expect(await keyOf(chart)).toBe('view:chart');

      // → walks every control once, in order; nothing is pressed or checked on the way
      await page.keyboard.press('Home');
      const order = [await keyOf(chart)];
      for (let i = 1; i < TOOLBAR_KEYS.length; i++) {
        await page.keyboard.press('ArrowRight');
        order.push(await keyOf(chart));
      }
      expect(order).toEqual(TOOLBAR_KEYS);
      expect(await g.level()).toBe('Day');
      expect(await g.events('view-mode-change')).toEqual([]);

      // Focus on an unchecked zoom radio does not check it; Enter does
      await page.keyboard.press('Home');
      while ((await keyOf(chart)) !== 'zoom:Week') await page.keyboard.press('ArrowRight');
      const week = chart.get('[data-focus-key="zoom:Week"]');
      await expect(week).toHaveAttribute('aria-checked', 'false');
      await page.keyboard.press('Enter');
      await expect(week).toHaveAttribute('aria-checked', 'true');
      await expect.poll(() => g.level()).toBe('Week');
      expect(await keyOf(chart)).toBe('zoom:Week');

      // → to the next level: still Week; Space checks it
      await page.keyboard.press('ArrowRight');
      expect(await keyOf(chart)).toBe('zoom:Month');
      await settle(page);
      expect(await g.level()).toBe('Week');
      await page.keyboard.press('Space');
      await expect.poll(() => g.level()).toBe('Month');
      await expect
        .poll(async () => (await g.events('view-mode-change')).map(e => e.detail['viewMode']))
        .toEqual(['Week', 'Month']);

      // One tab stop: Tab leaves for the task list, Shift+Tab comes back to the last control
      await page.keyboard.press('Tab');
      expect((await focused(chart))?.kind).toBe('row');
      await page.keyboard.press('Shift+Tab');
      expect(await keyOf(chart)).toBe('zoom:Month');
    });

    test('task list: ↑/↓ rows, → / ← expand and collapse (announced), into the cells and back', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open();
      await g.focusBefore();
      expect((await g.tabTo('row', 2)).taskId).toBe('plan');

      // ↑/↓ between rows; the header row sits above the first one
      await page.keyboard.press('ArrowDown');
      expect(await taskOf(chart)).toBe('scope');
      await page.keyboard.press('ArrowDown');
      expect(await taskOf(chart)).toBe('research');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
      expect(await focused(chart)).toMatchObject({ kind: 'row', taskId: 'plan' });
      await page.keyboard.press('ArrowUp');
      const head = await focused(chart);
      expect(head?.kind).toBe('column-header');
      expect(head?.key).toMatch(/^head:/);
      // ↓ from a header cell: the same column of the first row; ← on the first cell: its row
      await page.keyboard.press('ArrowDown');
      expect(await keyOf(chart)).toBe(`cell:plan:${head!.key!.slice('head:'.length)}`);
      await page.keyboard.press('ArrowLeft');
      expect(await focused(chart)).toMatchObject({ kind: 'row', taskId: 'plan' });

      // ← collapses the expanded group, → expands it again; both are announced
      const group = chart.get('.gantt-tl-row[data-task-id="plan"]');
      await expect(group).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('ArrowLeft');
      await expect(group).toHaveAttribute('aria-expanded', 'false');
      await expect(chart.get('.gantt-tl-row[data-task-id="scope"]')).toHaveCount(0);
      await expect.poll(() => g.liveText()).toContain('Planning collapsed');
      expect(await focused(chart)).toMatchObject({ kind: 'row', taskId: 'plan' });
      await page.keyboard.press('ArrowRight');
      await expect(group).toHaveAttribute('aria-expanded', 'true');
      await expect(chart.get('.gantt-tl-row[data-task-id="scope"]')).toHaveCount(1);
      await expect.poll(() => g.liveText()).toContain('Planning expanded');

      // → on the expanded group steps into its first cell, → / ← move along the row, ← on the
      // first cell returns to the row
      await page.keyboard.press('ArrowRight');
      const first = await focused(chart);
      expect(first?.kind).toBe('cell');
      expect(first?.key).toMatch(/^cell:plan:/);
      const column = first!.key!.slice('cell:plan:'.length);
      await page.keyboard.press('ArrowRight');
      const second = await keyOf(chart);
      expect(second).toMatch(/^cell:plan:/);
      expect(second).not.toBe(first!.key);
      await page.keyboard.press('ArrowLeft');
      expect(await keyOf(chart)).toBe(first!.key);

      // ↓ in a cell keeps the column
      await page.keyboard.press('ArrowDown');
      expect(await keyOf(chart)).toBe(`cell:scope:${column}`);
      await page.keyboard.press('ArrowLeft');
      expect(await focused(chart)).toMatchObject({ kind: 'row', taskId: 'scope' });
    });

    test('bars: one tab stop, ↑/↓ move between bars, ←/→ pan by one cell, the focus ring follows', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open();
      await g.focusBefore();
      // The tab-stop bar: the first one in view
      expect((await g.tabTo('bar')).taskId).toBe('plan');

      await page.keyboard.press('ArrowDown');
      expect(await focused(chart)).toMatchObject({ kind: 'bar', key: 'bar:scope', taskId: 'scope' });
      await expect(g.bar('scope')).toHaveAttribute('tabindex', '0');
      await expect(g.bar('plan')).toHaveAttribute('tabindex', '-1');
      // The overlay's ring surrounds the focused bar
      await expect
        .poll(async () => {
          const r = await ringGeometry(chart);
          return (
            !!r &&
            r.visible &&
            r.ring.left <= r.body.left &&
            r.ring.right >= r.body.right &&
            r.ring.top <= r.body.top &&
            r.ring.bottom >= r.body.bottom
          );
        })
        .toBe(true);
      await page.keyboard.press('ArrowUp');
      expect(await taskOf(chart)).toBe('plan');

      // ←/→ pan the timeline to the next / previous bottom-tier cell (a day at the Day level, the
      // cells start at whole days); focus stays
      const cell = LEVEL_PX_PER_DAY['Day'];
      const left0 = (await g.viewportMetrics()).scrollLeft;
      const next = (Math.floor(left0 / cell) + 1) * cell;
      const scrollLeft = async () => (await g.viewportMetrics()).scrollLeft;
      await page.keyboard.press('ArrowRight');
      await expect.poll(scrollLeft).toBe(next);
      await page.keyboard.press('ArrowRight');
      await expect.poll(scrollLeft).toBe(next + cell);
      await page.keyboard.press('ArrowLeft');
      await expect.poll(scrollLeft).toBe(next);
      expect(await focused(chart)).toMatchObject({ kind: 'bar', taskId: 'plan' });
    });

    test('move mode: Enter, ←/→ (Shift resizes the end, Alt the start), Enter commits; Esc cancels', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open();
      await g.focusBefore();
      await g.tabTo('bar');
      await page.keyboard.press('ArrowDown');
      expect(await taskOf(chart)).toBe('scope');
      const px = LEVEL_PX_PER_DAY['Day'];
      const v0 = await g.barVisual('scope');

      // Move two days later
      await page.keyboard.press('Enter');
      await expect.poll(() => g.liveText()).toContain('Editing Scope');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      // The pointer drag's ghost and the readout chip show the new dates
      await expect(chart.get('.gantt-drag-preview')).toHaveCount(1);
      await expect(chart.get('.gantt-drag-readout')).toContainText('·');
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await g.events('task-dragged')).length).toBe(1);
      const [moved] = await g.events('task-dragged');
      expect(moved.detail).toEqual({
        taskId: 'scope',
        oldStart: await iso(page, day(-12)),
        oldEnd: await iso(page, day(-8)),
        newStart: await iso(page, day(-10)),
        newEnd: await iso(page, day(-6)),
        daysMoved: 2,
      });
      await expect.poll(async () => (await g.barVisual('scope')).x).toBe(v0.x + 2 * px);
      await expect(chart.get('.gantt-drag-preview')).toHaveCount(0);
      await expect.poll(() => g.liveText()).toContain('Scope moved 2 days later');
      expect(await taskOf(chart)).toBe('scope');

      // Shift+→ resizes the end one day later
      await page.keyboard.press('Enter');
      await page.keyboard.press('Shift+ArrowRight');
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await g.events('task-resized')).length).toBe(1);
      expect((await g.events('task-resized'))[0].detail).toMatchObject({
        taskId: 'scope',
        handle: 'right',
        newStart: await iso(page, day(-10)),
        newEnd: await iso(page, day(-5)),
        daysDelta: 1,
      });
      await expect.poll(async () => (await g.barVisual('scope')).width).toBe(v0.width + px);

      // Alt+← resizes the start one day earlier
      await page.keyboard.press('Enter');
      await page.keyboard.press('Alt+ArrowLeft');
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await g.events('task-resized')).length).toBe(2);
      expect((await g.events('task-resized'))[1].detail).toMatchObject({
        taskId: 'scope',
        handle: 'left',
        newStart: await iso(page, day(-11)),
        newEnd: await iso(page, day(-5)),
      });
      await expect
        .poll(async () => await g.barVisual('scope'))
        .toMatchObject({ x: v0.x + px, width: v0.width + 2 * px });

      // Esc cancels: nothing changes, nothing fires
      const v1 = await g.barVisual('scope');
      const fired = (await g.events()).filter(e => e.type !== 'selection-change').length;
      await page.keyboard.press('Enter');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await expect(chart.get('.gantt-drag-preview')).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(chart.get('.gantt-drag-preview')).toHaveCount(0);
      await expect.poll(() => g.liveText()).toContain('Edit of Scope cancelled');
      expect(await g.barVisual('scope')).toMatchObject({ x: v1.x, width: v1.width });
      expect((await g.events()).filter(e => e.type !== 'selection-change')).toHaveLength(fired);
      expect(await taskOf(chart)).toBe('scope');
    });

    test('Ctrl/⌘+A selects every task, Esc clears the selection', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open();
      await g.focusBefore();
      await g.tabTo('bar');

      await page.keyboard.press('ControlOrMeta+A');
      await expect(chart.get('.gantt-tl-row[aria-selected="true"]')).toHaveCount(PLAN.length);
      await expect(chart.get('.gantt-bars-layer > [aria-selected="true"]')).toHaveCount(PLAN.length);
      await expect
        .poll(async () => ((await g.events('selection-change')).at(-1)?.detail['selectedIds'] as string[]).length)
        .toBe(PLAN.length);
      await expect.poll(() => g.liveText()).toContain(`${PLAN.length} tasks selected`);

      // Esc (D24): the focused bar's tooltip closes first, then the selection is cleared
      const tooltip = chart.get('.gantt-tooltip');
      await expect(tooltip).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(tooltip).toBeHidden();
      await expect(chart.get('.gantt-tl-row[aria-selected="true"]')).toHaveCount(PLAN.length);
      await page.keyboard.press('Escape');
      await expect(chart.get('.gantt-tl-row[aria-selected="true"]')).toHaveCount(0);
      await expect.poll(async () => (await g.events('selection-change')).at(-1)?.detail['selectedIds']).toEqual([]);
    });

    test('+ − zoom, F fits the plan in view, T scrolls today into view', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open();
      await g.focusBefore();
      await g.tabTo('bar');

      await page.keyboard.press('+');
      await expect.poll(() => g.level()).toBe('Hour');
      expect((await focused(chart))?.kind).toBe('bar');
      await page.keyboard.press('-');
      await expect.poll(() => g.level()).toBe('Day');
      expect((await focused(chart))?.kind).toBe('bar');

      // T: today in the middle of the viewport (one cell either way)
      expect((await g.viewportMetrics()).scrollLeft).toBe(0);
      await page.keyboard.press('t');
      await expect
        .poll(async () => {
          const vp = await g.viewportMetrics();
          const today = await chart.box(chart.get('.gantt-today').first());
          return Math.abs(today.x - (vp.left + vp.clientWidth / 2));
        })
        .toBeLessThanOrEqual(LEVEL_PX_PER_DAY['Day']);
      expect((await focused(chart))?.kind).toBe('bar');

      // F: the finest level at which the whole plan fits, scrolled to it
      await page.keyboard.press('f');
      await expect.poll(() => g.level()).not.toBe('Day');
      await expect.poll(() => g.liveText()).toMatch(/^Zoom: /);
      await expect.poll(() => g.inView(PLAN.map(t => t.id))).toEqual([]);
    });

    test('keyboard.characterShortcuts: false turns + − T F off (Ctrl/⌘+A stays)', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      const off = { ...DEFAULT_OPTIONS, keyboard: { characterShortcuts: false } };
      await g.open({ options: off });
      await g.focusBefore();
      await g.tabTo('bar');
      const left0 = (await g.viewportMetrics()).scrollLeft;

      for (const key of ['+', '-', 'f', 'F', 't', 'T']) await page.keyboard.press(key);
      await settle(page);
      expect(await g.level()).toBe('Day');
      expect((await g.viewportMetrics()).scrollLeft).toBe(left0);
      expect(await g.events('view-mode-change')).toEqual([]);
      expect((await focused(chart))?.kind).toBe('bar');

      // Modified shortcuts are not character shortcuts
      await page.keyboard.press('ControlOrMeta+A');
      await expect(chart.get('.gantt-tl-row[aria-selected="true"]')).toHaveCount(PLAN.length);

      // Back on: the same keys work
      await g.set({ options: { ...DEFAULT_OPTIONS, keyboard: { characterShortcuts: true } } });
      await chart.get('.gantt-bars-layer > [tabindex="0"]').focus();
      await page.keyboard.press('-');
      await expect.poll(() => g.level()).toBe('Week');
    });

    test('the focus ring shows on the focused bar, which never scrolls under the sticky header (2.4.11)', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open({ tasks: [...PLAN, ...extraTasks(60)] });
      await g.focusBefore();
      await g.tabTo('bar');
      const rows = PLAN.length + 60;
      await expect.poll(() => ringInView(chart, 'bar')).toBe('ok');

      /** A key, then the bar it focuses (at `position`) is in view once the panes have scrolled. */
      const move = async (key: string, position?: number) => {
        await page.keyboard.press(key);
        if (position !== undefined) await expect.poll(() => g.focusedPosition()).toBe(position);
        await expect.poll(() => ringInView(chart, 'bar')).toBe('ok');
        await scrollSettled(chart);
        expect(await ringInView(chart, 'bar')).toBe('ok');
      };
      // Down a page, to the last row, back up row by row, a page up and to the first row: each
      // move scrolls the bar into view below the header
      await move('PageDown');
      await move('End', rows);
      expect((await g.viewportMetrics()).scrollTop).toBeGreaterThan(0);
      for (let i = 1; i <= 20; i++) await move('ArrowUp', rows - i);
      await move('PageUp');
      await move('Home', 1);
    });

    test('rapid ↑ presses (key-repeat speed) keep each focused bar out from under the header', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open({ tasks: [...PLAN, ...extraTasks(60)] });
      await g.focusBefore();
      await g.tabTo('bar');
      const rows = PLAN.length + 60;
      await page.keyboard.press('End');
      await expect.poll(() => g.focusedPosition()).toBe(rows);
      await scrollSettled(chart);
      // No waiting for the panes' scroll sync between presses
      for (let i = 1; i <= 40; i++) {
        await page.keyboard.press('ArrowUp');
        await expect.poll(() => g.focusedPosition()).toBe(rows - i);
        await expect.poll(() => ringInView(chart, 'bar'), { timeout: 2000 }).toBe('ok');
      }
    });

    test('the whole focus ring stays below the sticky header and inside the viewport', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open({ tasks: [...PLAN, ...extraTasks(60)] });
      await g.focusBefore();
      await g.tabTo('bar');
      for (const key of ['PageDown', 'End', ...Array<string>(20).fill('ArrowUp'), 'Home']) {
        await page.keyboard.press(key);
        await scrollSettled(chart);
        expect(await ringInView(chart, 'ring'), key).toBe('ok');
      }
    });
  });
}
