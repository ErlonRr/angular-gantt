// The working calendar (Gantry 2 phase 13) in both bindings, with the same test body for the Web
// Component (`<gantry-element>` in the playground page) and Angular (the showcase's `/fixture` route),
// through the `Gantt` harness of ./fixtures. The week of Monday 2026-10-12 (Day view: 48 px a day),
// `calendar: true` (Mon–Fri), a holiday on Wed 2026-10-21, `editing: true`:
// - a pointer drag of a Friday task by one day starts on Monday and keeps its working day, and a
//   task whose two edges shift by different calendar amounts (Thu–Fri) is still ONE move: one
//   `task-dragged`, no `task-resized`;
// - a resize onto Sunday snaps the end back to the end of Friday's working time;
// - move mode steps one working day, over the holiday and back;
// - the Duration column counts working days, the duration cell parses `3d` / `5d` into a working end;
// - the tooltip's float row counts working days with `criticalPath`;
// - `nonWorkingTime.style: 'none'` paints no band and keeps the calendar;
// - both bindings end up with the same tasks after the same gestures;
// - in America/New_York, across the 2026-11-01 DST change, a Friday task moves to Monday's local
//   midnight and its bar sits on that day's x.
// Each test opens a fresh chart; the pointer tests run with --repeat-each=3 in the gate.
import type { Locator, Page } from '@playwright/test';
import { test, expect, BINDINGS, Gantt, focused, type Binding, type Chart } from './fixtures';
import { day, type FixtureTask } from './paint-fixture';

/** px per day in the Day view */
const PX = 48;
const BOX = { width: 1400, height: 700 };

/** `month`/`dom` of 2026 (and `hour`) as the fixture's local ISO date-time. */
const at = (month: number, dom: number, hour = 0): string =>
  day(Math.round((Date.UTC(2026, month - 1, dom) - Date.UTC(2026, 9, 14)) / 86_400_000), hour);

const OPTIONS: Record<string, unknown> = {
  viewMode: 'Day',
  initialScroll: false,
  editing: true,
  calendar: true,
  nonWorkingTime: { holidays: [{ start: at(10, 21), label: 'Holiday' }] },
  panel: { width: 640, columns: ['name', 'start', 'end', 'duration'] },
};

/** Working days: fri 1, thufri 2, wk 4, hop 1, across 2 (Tue, Thu: Wed 21 is the holiday). */
const TASKS: FixtureTask[] = [
  { id: 'fri', name: 'Friday job', start: at(10, 16), end: at(10, 17) },
  { id: 'thufri', name: 'Thursday to Friday', start: at(10, 15), end: at(10, 17) },
  { id: 'wk', name: 'Work week', start: at(10, 12), end: at(10, 16) },
  { id: 'hop', name: 'Holiday hop', start: at(10, 20), end: at(10, 21) },
  { id: 'across', name: 'Across the holiday', start: at(10, 20), end: at(10, 23) },
];

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** `local` (a local ISO date-time of the fixture) as the page's `Date#toISOString()`. */
const iso = (page: Page, local: string) => page.evaluate(s => new Date(s).toISOString(), local);

/** The bar body of `id` (client box, retried). */
const body = (g: Gantt, id: string): Locator => g.bar(id).locator('.gantt-bar-body');

/** The cell of `id` in `column` (`data-focus-key="cell:<id>:<column>"`). */
const cell = (g: Gantt, id: string, column: string): Locator =>
  g.chart.get(`.gantt-tl-cell[data-focus-key="cell:${id}:${column}"]`);

/** Mouse drag from `from` to `to` in steps, pressed and released. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

/** The task `id` in the latest task list a `tasks-change` carried (dates as the page's ISO strings). */
async function latest(g: Gantt, id: string): Promise<{ start: string; end: string }> {
  const changes = await g.events('tasks-change');
  const tasks = (changes.at(-1)?.detail as { tasks: { id: string; start: string; end: string }[] }).tasks;
  const { start, end } = tasks.find(t => t.id === id)!;
  return { start, end };
}

/** Focus a cell, press F2 and wait until its editor has focus. */
async function editCell(g: Gantt, id: string, column: string): Promise<void> {
  await cell(g, id, column).focus();
  await g.page.keyboard.press('F2');
  await expect.poll(() => g.chart.focusedKey()).toBe(`editor:${id}:${column}`);
}

/** Keyboard move mode: focus the bar of `id`, Enter, each of `keys`, Enter. */
async function moveMode(g: Gantt, id: string, ...keys: string[]): Promise<void> {
  await g.bar(id).focus();
  await expect.poll(async () => (await focused(g.chart))?.taskId).toBe(id);
  await g.page.keyboard.press('Enter');
  for (const key of keys) await g.page.keyboard.press(key);
  await g.page.keyboard.press('Enter');
}

/** The open tooltip's rows, `label → value`. */
function tooltipRows(chart: Chart): Promise<Record<string, string>> {
  return chart.evalRoot(root => {
    const rows: Record<string, string> = {};
    for (const dt of root.querySelectorAll('.gantt-tooltip dl dt')) {
      rows[dt.textContent?.trim() ?? ''] = dt.nextElementSibling?.textContent?.trim() ?? '';
    }
    return rows;
  });
}

for (const binding of BINDINGS) {
  test.describe(`calendar · ${binding}`, () => {
    test('a pointer drag of a Friday task by one day starts on Monday and keeps its working day', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open({ tasks: TASKS, options: OPTIONS, box: BOX });
      const v0 = await g.barVisual('fri');
      expect(v0.width).toBe(PX);
      const c = centre(await chart.box(body(g, 'fri')));

      await drag(page, c, { x: c.x + PX, y: c.y });
      await expect.poll(async () => (await g.events('task-dragged')).length).toBe(1);
      const [moved] = await g.events('task-dragged');
      // Saturday is skipped (start → Monday); the end is the same working length (one day) later
      expect(moved.detail).toEqual({
        taskId: 'fri',
        oldStart: await iso(page, at(10, 16)),
        oldEnd: await iso(page, at(10, 17)),
        newStart: await iso(page, at(10, 19)),
        newEnd: await iso(page, at(10, 20)),
        daysMoved: 3,
      });
      expect(await g.events('task-dragged')).toHaveLength(1);
      expect(await g.events('task-resized')).toHaveLength(0);
      expect(await latest(g, 'fri')).toEqual({
        start: await iso(page, at(10, 19)),
        end: await iso(page, at(10, 20)),
      });
      await expect.poll(async () => (await g.barVisual('fri')).x).toBe(v0.x + 3 * PX);
      expect((await g.barVisual('fri')).width).toBe(PX);
      await expect(cell(g, 'fri', 'duration')).toHaveText('1 day');
    });

    test('a task whose edges shift by different calendar amounts is still one move', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open({ tasks: TASKS, options: OPTIONS, box: BOX });
      const v0 = await g.barVisual('thufri');
      const c = centre(await chart.box(body(g, 'thufri')));

      await drag(page, c, { x: c.x + PX, y: c.y });
      await expect.poll(async () => (await g.events('task-dragged')).length).toBe(1);
      // Thu → Fri (+1 day) and the end Sat → Tue (+3 days): the same two working days
      const [moved] = await g.events('task-dragged');
      expect(moved.detail).toEqual({
        taskId: 'thufri',
        oldStart: await iso(page, at(10, 15)),
        oldEnd: await iso(page, at(10, 17)),
        newStart: await iso(page, at(10, 16)),
        newEnd: await iso(page, at(10, 20)),
        daysMoved: 1,
      });
      expect(await g.events('task-resized')).toHaveLength(0);
      const [before] = await g.events('before-change');
      expect(before.detail).toMatchObject({ change: { source: 'drag', ops: [{ op: 'move' }] } });
      await expect.poll(async () => (await g.barVisual('thufri')).x).toBe(v0.x + PX);
      expect((await g.barVisual('thufri')).width).toBe(4 * PX);
      await expect(cell(g, 'thufri', 'duration')).toHaveText('2 days');
    });

    test('a resize onto Sunday snaps the end back to the end of Friday', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open({ tasks: TASKS, options: OPTIONS, box: BOX });
      const v0 = await g.barVisual('wk');
      const b = await chart.box(body(g, 'wk'));
      const mid = b.y + b.height / 2;

      // The right handle: two days later is Sunday 00:00, which is not the end of a working day
      await drag(page, { x: b.x + b.width - 2, y: mid }, { x: b.x + b.width - 2 + 2 * PX, y: mid });
      await expect.poll(async () => (await g.events('task-resized')).length).toBe(1);
      expect((await g.events('task-resized'))[0].detail).toMatchObject({
        taskId: 'wk',
        handle: 'right',
        newStart: await iso(page, at(10, 12)),
        newEnd: await iso(page, at(10, 17)),
      });
      expect(await g.events('task-dragged')).toHaveLength(0);
      // Saturday 00:00: Monday to Friday, five days
      await expect.poll(async () => (await g.barVisual('wk')).width).toBe(v0.width + PX);
      await expect(cell(g, 'wk', 'duration')).toHaveText('5 days');
    });

    test('move mode steps one working day over the holiday and back', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open({ tasks: TASKS, options: OPTIONS, box: BOX });
      const v0 = await g.barVisual('hop');

      // Tue 20 → Thu 22: Wednesday is the holiday
      await moveMode(g, 'hop', 'ArrowRight');
      await expect.poll(async () => (await g.events('task-dragged')).length).toBe(1);
      expect((await g.events('task-dragged'))[0].detail).toEqual({
        taskId: 'hop',
        oldStart: await iso(page, at(10, 20)),
        oldEnd: await iso(page, at(10, 21)),
        newStart: await iso(page, at(10, 22)),
        newEnd: await iso(page, at(10, 23)),
        daysMoved: 2,
      });
      await expect.poll(async () => (await g.barVisual('hop')).x).toBe(v0.x + 2 * PX);
      await expect.poll(() => g.liveText()).toContain('Holiday hop moved 2 days later');
      await expect(cell(g, 'hop', 'duration')).toHaveText('1 day');

      // ← steps back over the holiday to the original day
      await page.keyboard.press('Enter');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await g.events('task-dragged')).length).toBe(2);
      expect((await g.events('task-dragged'))[1].detail).toMatchObject({
        newStart: await iso(page, at(10, 20)),
        newEnd: await iso(page, at(10, 21)),
        daysMoved: -2,
      });
      await expect.poll(async () => (await g.barVisual('hop')).x).toBe(v0.x);
      expect(await g.events('task-resized')).toHaveLength(0);
    });

    test('the Duration column counts working days; with the calendar off it counts calendar days', async ({
      chart,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open({ tasks: TASKS, options: OPTIONS, box: BOX });
      const durations = async () =>
        Object.fromEntries(
          await Promise.all(TASKS.map(async t => [t.id, (await cell(g, t.id, 'duration').innerText()).trim()])),
        );
      await expect.poll(durations).toEqual({
        fri: '1 day',
        thufri: '2 days',
        wk: '4 days',
        hop: '1 day',
        across: '2 days',
      });

      // Without a calendar the same task reads its three calendar days
      await g.set({ options: { ...OPTIONS, calendar: false } });
      await expect(cell(g, 'across', 'duration')).toHaveText('3 days');
      await g.set({ options: OPTIONS });
      await expect(cell(g, 'across', 'duration')).toHaveText('2 days');
    });

    test('the duration cell parses 3d / 5d in working days and writes a working end', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open({ tasks: TASKS, options: OPTIONS, box: BOX });

      // Mon 12 + 3 working days: Thu 15 00:00
      await editCell(g, 'wk', 'duration');
      await page.keyboard.type('3d');
      await page.keyboard.press('Enter');
      await expect(cell(g, 'wk', 'duration')).toHaveText('3 days');
      expect(await latest(g, 'wk')).toEqual({
        start: await iso(page, at(10, 12)),
        end: await iso(page, at(10, 15)),
      });

      // Tue 20 + 5 working days (Wed 21 is the holiday, the weekend is off): Wed 28 00:00
      await editCell(g, 'across', 'duration');
      await page.keyboard.type('5d');
      await page.keyboard.press('Enter');
      await expect(cell(g, 'across', 'duration')).toHaveText('5 days');
      expect(await latest(g, 'across')).toEqual({
        start: await iso(page, at(10, 20)),
        end: await iso(page, at(10, 28)),
      });
    });

    test('the tooltip reads the float in working days (calendar days with durations: calendar)', async ({ chart }) => {
      const tasks: FixtureTask[] = [
        { id: 'crit-a', name: 'Crit A', start: at(10, 12), end: at(10, 14) },
        { id: 'crit-b', name: 'Crit B', start: at(10, 14), end: at(10, 20), dependency: 'crit-a' },
        { id: 'side', name: 'Side', start: at(10, 12), end: at(10, 13) },
      ];
      const g = new Gantt(chart, binding);
      // The longest chain is 2 + 4 working days (Wed, Thu, Fri, Mon); Side takes 1: a float of 5
      await g.open({ tasks, options: { ...OPTIONS, criticalPath: true }, box: BOX });
      await body(g, 'side').hover();
      await expect(chart.get('.gantt-tooltip')).toBeVisible();
      await expect.poll(() => tooltipRows(chart)).toMatchObject({ Duration: '1 day', Float: '5d' });

      // The same plan counted in calendar days: 2 + 6 days against 1
      await g.open({
        tasks,
        options: { ...OPTIONS, criticalPath: true, calendar: { durations: 'calendar' } },
        box: BOX,
      });
      await body(g, 'side').hover();
      await expect(chart.get('.gantt-tooltip')).toBeVisible();
      await expect.poll(() => tooltipRows(chart)).toMatchObject({ Duration: '1 day', Float: '7d' });
    });

    test("nonWorkingTime.style 'none' paints no band and keeps the calendar", async ({ chart }) => {
      const bands = () => chart.get('g.gantt-bands rect').count();
      const headerBands = () => chart.get('.g-header .g-band').count();
      const g = new Gantt(chart, binding);
      await g.open({ tasks: TASKS, options: OPTIONS, box: BOX });
      // The default shading paints weekends and the holiday (the selectors are the right ones)
      expect(await bands()).toBeGreaterThan(0);
      expect(await headerBands()).toBeGreaterThan(0);

      await g.set({
        options: {
          ...OPTIONS,
          nonWorkingTime: { style: 'none', holidays: [{ start: at(10, 21), label: 'Holiday' }] },
        },
      });
      await expect.poll(bands).toBe(0);
      expect(await headerBands()).toBe(0);
      // Still a working calendar: the holiday is skipped by durations
      await expect(cell(g, 'across', 'duration')).toHaveText('2 days');
    });
  });
}

/** The gestures of the parity test, in order, on one chart. */
async function gestures(g: Gantt): Promise<void> {
  const { page, chart } = g;
  const fri = centre(await chart.box(body(g, 'fri')));
  await drag(page, fri, { x: fri.x + PX, y: fri.y });
  await expect.poll(async () => (await g.events('task-dragged')).length).toBe(1);

  const wk = await chart.box(body(g, 'wk'));
  await drag(
    page,
    { x: wk.x + wk.width - 2, y: wk.y + wk.height / 2 },
    { x: wk.x + wk.width - 2 + 2 * PX, y: wk.y + wk.height / 2 },
  );
  await expect.poll(async () => (await g.events('task-resized')).length).toBe(1);

  await moveMode(g, 'hop', 'ArrowRight');
  await expect.poll(async () => (await g.events('task-dragged')).length).toBe(2);

  await editCell(g, 'across', 'duration');
  await page.keyboard.type('5d');
  await page.keyboard.press('Enter');
  await expect(cell(g, 'across', 'duration')).toHaveText('5 days');
}

/** What a binding ended up with after `gestures`: the tasks of the last change and the event names. */
async function outcome(g: Gantt): Promise<{ tasks: unknown; events: string[] }> {
  const changes = await g.events('tasks-change');
  const events = (await g.events()).filter(e => e.type !== 'selection-change').map(e => e.type);
  return { tasks: (changes.at(-1)?.detail as { tasks: unknown }).tasks, events };
}

test.describe('calendar · parity', () => {
  test('the same gestures give the same tasks and the same events in both bindings', async ({ chart }) => {
    const results: Partial<Record<Binding, { tasks: unknown; events: string[] }>> = {};
    for (const binding of BINDINGS) {
      const g = new Gantt(chart, binding);
      await g.open({ tasks: TASKS, options: OPTIONS, box: BOX });
      await gestures(g);
      results[binding] = await outcome(g);
    }
    expect(results.angular).toEqual(results.vanilla);
    // Two moves (the drag and the move mode: never also a resize) and two end changes: the handle
    // and the duration cell, which writes only the end
    expect(results.vanilla?.events.filter(e => e === 'task-dragged')).toHaveLength(2);
    expect(results.vanilla?.events.filter(e => e === 'task-resized')).toHaveLength(2);
  });
});

// US daylight saving time ends on Sunday 2026-11-01: Friday 30 Oct → Monday 2 Nov is 73 elapsed
// hours but three local days, and the bar must land on Monday's x, not an hour off
test.describe('calendar · America/New_York across the DST change', () => {
  test.use({ timezoneId: 'America/New_York' });

  for (const binding of BINDINGS) {
    test(`move mode from Friday lands on Monday's local midnight · ${binding}`, async ({ chart, page }) => {
      const tasks: FixtureTask[] = [
        { id: 'fri-ny', name: 'Friday job', start: at(10, 30), end: at(10, 31) },
        // A task that starts on Monday 2 November: its x is that day's cell
        { id: 'ref', name: 'Reference', start: at(11, 2), end: at(11, 3) },
      ];
      const g = new Gantt(chart, binding);
      await g.open({ tasks, options: { ...OPTIONS, nonWorkingTime: { holidays: [] } }, box: BOX });
      const v0 = await g.barVisual('fri-ny');
      const ref = await g.barVisual('ref');
      expect(ref.x).toBe(v0.x + 3 * PX);

      await moveMode(g, 'fri-ny', 'ArrowRight');
      await expect.poll(async () => (await g.events('task-dragged')).length).toBe(1);
      expect((await g.events('task-dragged'))[0].detail).toEqual({
        taskId: 'fri-ny',
        oldStart: await iso(page, at(10, 30)),
        oldEnd: await iso(page, at(10, 31)),
        newStart: await iso(page, at(11, 2)),
        newEnd: await iso(page, at(11, 3)),
        daysMoved: 3,
      });
      // The local midnight of Monday, 05:00 UTC now that daylight saving time is over
      expect(((await g.events('task-dragged'))[0].detail as { newStart: string }).newStart).toBe(
        '2026-11-02T05:00:00.000Z',
      );
      await expect.poll(async () => (await g.barVisual('fri-ny')).x).toBe(ref.x);
      expect((await g.barVisual('fri-ny')).width).toBe(PX);
    });
  }
});
