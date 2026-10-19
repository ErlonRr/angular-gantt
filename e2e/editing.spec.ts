// Interactive editing (Gantry 2 phase 11) in both bindings, with the same test body for the Web
// Component (`<gantry-element>` in the playground page) and Angular (the showcase's `/fixture`
// route), through the `Gantt` harness of ./fixtures (`options.editing: true`, Day view: 48 px a day):
// - one pipeline (D5): a pointer drag fires before-change → task-dragged → task-updated →
//   tasks-change → history-change; Ctrl+Z / Ctrl+Y and the toolbar's Undo / Redo (aria-disabled)
//   undo and redo it with the inverse events;
// - the progress grip (snapped to the step, a "40%" readout) and ↑ / ↓ in move mode;
// - links: drag from a connector (end → start = FS), click a connector then a bar (start → start =
//   SS), L then Enter; a cycle or a duplicate shows the invalid preview and creates nothing; an
//   arrow is selected by a click, removed with Delete and restored by undo;
// - cells: F2, typing, Enter, Esc, Tab to the next editor, an invalid value kept open with
//   aria-invalid and its message, predecessors typed as text;
// - a veto in before-change, controlled mode (applied: false), and a data source whose next page
//   keeps the edit (ds.patch);
// - forced colours reach the new shapes (connectors, progress grip, invalid preview, selected link,
//   invalid editor).
// Each test opens a fresh chart; the pointer tests run with --repeat-each=3 in the gate.
import type { Locator, Page } from '@playwright/test';
import { test, expect, BINDINGS, Gantt, PLAN, arrowPoint, extraTasks, focused, frames, type Chart } from './fixtures';
import { day } from './paint-fixture';

/** px per day in the Day view */
const PX = 48;
const OPTIONS: Record<string, unknown> = { viewMode: 'Day', initialScroll: false, editing: true };
/** The cells tests: the editable columns, in a panel wide enough to show them */
const CELL_OPTIONS: Record<string, unknown> = {
  ...OPTIONS,
  panel: { width: 640, columns: ['name', 'start', 'end', 'progress', 'predecessors'] },
};
const CELL_BOX = { width: 1400, height: 700 };

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** `local` (a local ISO date-time of the fixture) as the page's `Date#toISOString()`. */
const iso = (page: Page, local: string) => page.evaluate(s => new Date(s).toISOString(), local);

/** The editing events recorded so far (no selection or view events), oldest first. */
async function edits(g: Gantt) {
  return (await g.events()).filter(e => e.type !== 'selection-change' && e.type !== 'view-mode-change');
}
const types = async (g: Gantt) => (await edits(g)).map(e => e.type);

/** The bar body of `id` (client box, retried). */
function body(g: Gantt, id: string): Locator {
  return g.bar(id).locator('.gantt-bar-body');
}

/** Give the chart time to react to input that should change nothing (two frames and the 250 ms announcement debounce). */
async function settle(page: Page): Promise<void> {
  await frames(page);
  await page.waitForTimeout(300);
  await frames(page);
}

/** Move the pointer to a spot of the toolbar row with nothing under it: no bar is hovered. */
async function pointerAway(g: Gantt): Promise<void> {
  const tb = await g.chart.box(g.chart.get('.gantt-toolbar').first());
  await g.page.mouse.move(tb.x + tb.width - 4, tb.y + tb.height / 2);
}

/** Hover the body of `id` and wait for its overlay shapes (grips, progress grip, connectors). */
async function hover(g: Gantt, id: string): Promise<Box> {
  const b = await g.chart.box(body(g, id));
  await g.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await expect(g.chart.get('.gantt-bar-overlay .gantt-link-connector')).toHaveCount(2);
  return b;
}

/** Client boxes of the overlay shapes with `cls` (classes included). */
function shapes(chart: Chart, cls: string): Promise<(Box & { cls: string })[]> {
  return chart.evalRoot(
    (root, c) =>
      [...root.querySelectorAll(`.gantt-bar-overlay .${c}`)].map(r => {
        const b = r.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height, cls: r.getAttribute('class') ?? '' };
      }),
    cls,
  );
}

/** The centre of the hovered bar's `side` connector (`hover` first). */
async function connector(g: Gantt, bar: Box, side: 'start' | 'end'): Promise<{ x: number; y: number }> {
  const mid = bar.y + bar.height / 2;
  const dots = (await shapes(g.chart, 'gantt-link-connector')).filter(s => Math.abs(s.y + s.height / 2 - mid) < 8);
  expect(dots).toHaveLength(2);
  dots.sort((a, b) => a.x - b.x);
  return centre(side === 'start' ? dots[0] : dots[1]);
}

/** A point near the start (`start`) of a bar's body: the nearer half picks the target side. */
const nearStart = (b: Box) => ({ x: b.x + Math.min(10, b.width / 4), y: b.y + b.height / 2 });

/** Mouse drag from `from` to `to` in steps, pressed and released. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

/** The number of dependency arrows painted. */
const arrows = (chart: Chart) => chart.get('g.gantt-arrow').count();

/** The dependency ids of `id` in the latest task list a `tasks-change` carried. */
async function dependenciesOf(g: Gantt, id: string): Promise<unknown> {
  const changes = (await g.events('tasks-change')).map(
    e => e.detail as { tasks: { id: string; dependency?: unknown }[] },
  );
  return changes.at(-1)?.tasks.find(t => t.id === id)?.dependency;
}

/** The cell of `id` in `column` (`data-focus-key="cell:<id>:<column>"`). */
function cell(g: Gantt, id: string, column: string): Locator {
  return g.chart.get(`.gantt-tl-cell[data-focus-key="cell:${id}:${column}"]`);
}

/** Focus a cell, press F2 and wait until its editor has focus. */
async function editCell(g: Gantt, id: string, column: string): Promise<void> {
  await cell(g, id, column).focus();
  await g.page.keyboard.press('F2');
  await expect.poll(() => g.chart.focusedKey()).toBe(`editor:${id}:${column}`);
}

/**
 * `canUndo` / `canRedo` of the chart: the Web Component's read-only getters, Angular's signals
 * (through `__GANTRY_API__.chart`).
 */
function historyFlags(g: Gantt): Promise<{ canUndo: boolean; canRedo: boolean }> {
  return g.page.evaluate(() => {
    const api = (window as unknown as { __GANTRY_API__?: { chart: Record<string, () => boolean> } }).__GANTRY_API__;
    if (api) return { canUndo: api.chart['canUndo'](), canRedo: api.chart['canRedo']() };
    const el = document.querySelector('gantry-element') as unknown as { canUndo: boolean; canRedo: boolean };
    return { canUndo: el.canUndo, canRedo: el.canRedo };
  });
}

/** The computed value of each system colour the forced-colours rules use (the emulated palette). */
type SystemColor = 'Canvas' | 'CanvasText' | 'Highlight' | 'Field' | 'FieldText';
function systemColors(page: Page): Promise<Record<SystemColor, string>> {
  return page.evaluate(() => {
    const probe = document.body.appendChild(document.createElement('div'));
    const out = { Canvas: '', CanvasText: '', Highlight: '', Field: '', FieldText: '' };
    for (const name of Object.keys(out) as (keyof typeof out)[]) {
      probe.style.setProperty('color', name);
      out[name] = getComputedStyle(probe).color;
    }
    probe.remove();
    return out;
  });
}

/** Computed paint of the first element matching `selector` in the chart. */
function paintOf(chart: Chart, selector: string) {
  return chart.evalRoot((root, sel) => {
    const el = root.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      fill: cs.fill,
      stroke: cs.stroke,
      dash: cs.strokeDasharray,
      color: cs.color,
      background: cs.backgroundColor,
      outlineColor: cs.outlineColor,
      outlineStyle: cs.outlineStyle,
    };
  }, selector);
}

/** The open cell editor's field. */
const editor = (chart: Chart) => chart.get('.gantt-tl-cell--editing .gantt-tl-editor');

for (const binding of BINDINGS) {
  test.describe(`editing · ${binding}`, () => {
    test('a pointer drag: events in D5 order, Ctrl+Z restores the bar, Ctrl+Y moves it again', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open({ options: OPTIONS });
      const v0 = await g.barVisual('scope');
      const b = await chart.box(body(g, 'scope'));

      await drag(page, centre(b), { x: centre(b).x + 2 * PX, y: centre(b).y });
      await expect
        .poll(() => types(g))
        .toEqual(['before-change', 'task-dragged', 'task-updated', 'tasks-change', 'history-change']);
      await expect.poll(async () => (await g.barVisual('scope')).x).toBe(v0.x + 2 * PX);
      const [before, dragged, updated, changed, history] = await edits(g);
      expect(before.detail).toMatchObject({
        change: { source: 'drag', ops: [{ op: 'move' }] },
        defaultPrevented: false,
      });
      expect(dragged.detail).toEqual({
        taskId: 'scope',
        oldStart: await iso(page, day(-12)),
        oldEnd: await iso(page, day(-8)),
        newStart: await iso(page, day(-10)),
        newEnd: await iso(page, day(-6)),
        daysMoved: 2,
      });
      expect(updated.detail).toMatchObject({ taskId: 'scope', fields: ['start', 'end'], source: 'drag' });
      expect(changed.detail).toMatchObject({ applied: true, change: { source: 'drag' } });
      expect((changed.detail as { tasks: unknown[] }).tasks).toHaveLength(PLAN.length);
      expect(history.detail).toMatchObject({ canUndo: true, canRedo: false, undoCount: 1, redoCount: 0 });

      // The pressed bar has focus: Ctrl+Z undoes (the inverse events), Ctrl+Y redoes
      expect((await focused(chart))?.taskId).toBe('scope');
      await g.clearEvents();
      await page.keyboard.press('Control+z');
      await expect.poll(async () => (await g.barVisual('scope')).x).toBe(v0.x);
      await expect
        .poll(() => types(g))
        .toEqual(['before-change', 'task-dragged', 'task-updated', 'tasks-change', 'history-change']);
      const undone = await edits(g);
      expect(undone[0].detail).toMatchObject({ change: { source: 'undo' } });
      expect(undone[1].detail).toMatchObject({ taskId: 'scope', daysMoved: -2 });
      expect(undone[4].detail).toMatchObject({ canUndo: false, canRedo: true });
      await expect.poll(() => g.liveText()).toContain('Undone:');

      await g.clearEvents();
      await page.keyboard.press('Control+y');
      await expect.poll(async () => (await g.barVisual('scope')).x).toBe(v0.x + 2 * PX);
      await expect
        .poll(async () => (await g.events('task-dragged')).map(e => e.detail))
        .toMatchObject([{ taskId: 'scope', daysMoved: 2 }]);
      expect((await g.events('before-change'))[0].detail).toMatchObject({ change: { source: 'redo' } });
      await expect.poll(() => g.liveText()).toContain('Redone:');
      expect(await historyFlags(g)).toEqual({ canUndo: true, canRedo: false });
    });

    test('toolbar Undo / Redo: aria-disabled until there is something to undo or redo', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open({ options: OPTIONS });
      const undo = chart.get('.gantt-tb-history .gantt-tb-undo');
      const redo = chart.get('.gantt-tb-history .gantt-tb-redo');
      await expect(undo).toHaveAttribute('aria-disabled', 'true');
      await expect(redo).toHaveAttribute('aria-disabled', 'true');
      await expect(undo).toHaveAttribute('aria-label', 'Undo');
      await expect(redo).toHaveAttribute('aria-label', 'Redo');

      // A disabled button stays focusable (in the roving set) and does nothing
      await undo.focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Space');
      await settle(page);
      expect(await types(g)).toEqual([]);
      expect((await focused(chart))?.key).toBe('undo');

      const v0 = await g.barVisual('scope');
      const b = await chart.box(body(g, 'scope'));
      await drag(page, centre(b), { x: centre(b).x + 2 * PX, y: centre(b).y });
      await expect.poll(async () => (await g.barVisual('scope')).x).toBe(v0.x + 2 * PX);
      await expect(undo).not.toHaveAttribute('aria-disabled');
      await expect(redo).toHaveAttribute('aria-disabled', 'true');

      await undo.click();
      await expect.poll(async () => (await g.barVisual('scope')).x).toBe(v0.x);
      await expect(undo).toHaveAttribute('aria-disabled', 'true');
      await expect(redo).not.toHaveAttribute('aria-disabled');
      // Focus stays on the button (it is never natively disabled)
      expect((await focused(chart))?.key).toBe('undo');

      await redo.click();
      await expect.poll(async () => (await g.barVisual('scope')).x).toBe(v0.x + 2 * PX);
      await expect(undo).not.toHaveAttribute('aria-disabled');
      await expect(redo).toHaveAttribute('aria-disabled', 'true');
      expect(
        (await g.events('before-change')).map(e => (e.detail as { change: { source: string } }).change.source),
      ).toEqual(['drag', 'undo', 'redo']);
    });

    test('the progress grip: a drag snaps to the step, shows "40%" and fires task-progress-changed', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open({ options: OPTIONS });
      await hover(g, 'research');
      const [grip] = await shapes(chart, 'gantt-progress-grip');
      expect(grip).toBeDefined();
      const from = centre(grip);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      // 2 days of a 5-day bar: 40 %
      await page.mouse.move(from.x + 2 * PX + 3, from.y, { steps: 8 });
      await expect(chart.get('.gantt-drag-readout')).toHaveText('40%');
      await page.mouse.up();
      await expect
        .poll(async () => (await g.events('task-progress-changed')).map(e => e.detail))
        .toEqual([{ taskId: 'research', oldProgress: 0, newProgress: 40 }]);
      expect(await types(g)).toEqual([
        'before-change',
        'task-progress-changed',
        'task-updated',
        'tasks-change',
        'history-change',
      ]);
      expect((await g.events('before-change'))[0].detail).toMatchObject({ change: { source: 'progress' } });
      await expect(chart.get('.gantt-drag-readout')).toHaveCount(0);
      await expect.poll(() => g.liveText()).toContain('Research 40% complete');
    });

    test('move mode: ↑ / ↓ change the progress by the step, Enter commits', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open({ options: { ...OPTIONS, editing: { progress: { step: 10 } } } });
      await g.focusBefore();
      await g.tabTo('bar');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      expect((await focused(chart))?.taskId).toBe('research');
      await page.keyboard.press('Enter');
      await expect.poll(() => g.liveText()).toContain('Up and Down change the progress.');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowDown');
      // The readout keeps the dates in move mode
      await expect(chart.get('.gantt-drag-readout')).toContainText('·');
      await page.keyboard.press('Enter');
      await expect
        .poll(async () => (await g.events('task-progress-changed')).map(e => e.detail))
        .toEqual([{ taskId: 'research', oldProgress: 0, newProgress: 20 }]);
      expect((await g.events('before-change'))[0].detail).toMatchObject({
        change: { source: 'keyboard', ops: [{ op: 'progress' }] },
      });
      expect(await g.events('task-dragged')).toEqual([]);
      expect((await focused(chart))?.taskId).toBe('research');
    });

    test('links: a drag from the end connector to a bar start makes FS; click, click start → start makes SS', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open({ options: OPTIONS });
      const before = await arrows(chart);

      // Drag: Scope's end → near Documentation's start
      const scope = await hover(g, 'scope');
      const end = await connector(g, scope, 'end');
      const docs = await chart.box(body(g, 'docs'));
      await page.mouse.move(end.x, end.y);
      await page.mouse.down();
      await page.mouse.move(nearStart(docs).x, nearStart(docs).y, { steps: 8 });
      // The preview path and the target connector, both valid
      await expect(chart.get('path.gantt-link-preview')).toHaveCount(1);
      await expect(chart.get('path.gantt-link-preview--invalid')).toHaveCount(0);
      await expect(chart.get('.gantt-link-connector--target')).toHaveCount(1);
      await page.mouse.up();
      await expect
        .poll(async () => (await g.events('dependency-created')).map(e => e.detail))
        .toEqual([{ fromId: 'scope', toId: 'docs', type: 'FS', lag: 0 }]);
      await expect(chart.get('path.gantt-link-preview')).toHaveCount(0);
      await expect.poll(() => arrows(chart)).toBe(before + 1);
      expect((await g.events('before-change'))[0].detail).toMatchObject({ change: { source: 'link' } });
      await expect.poll(() => g.liveText()).toContain('Linked Scope to Documentation');

      // Click, click: Research's start connector, then near Documentation's start
      await pointerAway(g);
      const research = await hover(g, 'research');
      const start = await connector(g, research, 'start');
      await page.mouse.click(start.x, start.y);
      await expect(chart.get('.gantt-link-connector--source')).toHaveCount(1);
      await expect.poll(() => g.liveText()).toContain('Linking from Research');
      const docs2 = await chart.box(body(g, 'docs'));
      await page.mouse.move(nearStart(docs2).x, nearStart(docs2).y, { steps: 4 });
      await expect(chart.get('path.gantt-link-preview')).toHaveCount(1);
      await page.mouse.click(nearStart(docs2).x, nearStart(docs2).y);
      await expect
        .poll(async () => (await g.events('dependency-created')).map(e => e.detail))
        .toEqual([
          { fromId: 'scope', toId: 'docs', type: 'FS', lag: 0 },
          { fromId: 'research', toId: 'docs', type: 'SS', lag: 0 },
        ]);
      await expect(chart.get('path.gantt-link-preview')).toHaveCount(0);
      await expect.poll(() => arrows(chart)).toBe(before + 2);
      expect(await dependenciesOf(g, 'docs')).toEqual([
        { taskId: 'scope', type: 'FS', lag: 0 },
        { taskId: 'research', type: 'SS', lag: 0 },
      ]);
    });

    test('links: a cycle shows the invalid preview and creates nothing; the source bar is no target', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open({ options: OPTIONS });
      const before = await arrows(chart);

      // Research's start → Scope's start (SS) would loop: Scope → Research exists
      const research = await hover(g, 'research');
      const start = await connector(g, research, 'start');
      const scope = await chart.box(body(g, 'scope'));
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(nearStart(scope).x, nearStart(scope).y, { steps: 8 });
      await expect(chart.get('path.gantt-link-preview.gantt-link-preview--invalid')).toHaveCount(1);
      await expect(chart.get('.gantt-link-connector--invalid')).toHaveCount(1);
      await page.mouse.up();
      await expect.poll(() => g.liveText()).toContain('Not changed: This link would make a loop');
      await expect(chart.get('path.gantt-link-preview')).toHaveCount(0);

      // Back onto its own bar: no target (a plain preview), nothing on release
      await pointerAway(g);
      const scope2 = await hover(g, 'scope');
      const end = await connector(g, scope2, 'end');
      await page.mouse.move(end.x, end.y);
      await page.mouse.down();
      await page.mouse.move(centre(scope2).x, centre(scope2).y, { steps: 8 });
      await expect(chart.get('path.gantt-link-preview')).toHaveCount(1);
      await expect(chart.get('path.gantt-link-preview--invalid')).toHaveCount(0);
      await page.mouse.up();
      await expect(chart.get('path.gantt-link-preview')).toHaveCount(0);
      await settle(page);
      expect(await types(g)).toEqual([]);
      expect(await arrows(chart)).toBe(before);
    });

    test('links with the keyboard: L, ↓ to a linked task (invalid), ↓ ↓, Enter makes FS', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open({ options: OPTIONS });
      await g.focusBefore();
      await g.tabTo('bar');
      await page.keyboard.press('ArrowDown');
      expect((await focused(chart))?.taskId).toBe('scope');
      await page.keyboard.press('l');
      await expect.poll(() => g.liveText()).toContain('Linking from Scope');
      await page.keyboard.press('ArrowDown');
      expect((await focused(chart))?.taskId).toBe('research');
      // Already linked: the preview runs to Research, invalid
      await expect(chart.get('path.gantt-link-preview.gantt-link-preview--invalid')).toHaveCount(1);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      expect((await focused(chart))?.taskId).toBe('docs');
      await expect(chart.get('path.gantt-link-preview')).toHaveCount(1);
      await expect(chart.get('path.gantt-link-preview--invalid')).toHaveCount(0);
      await page.keyboard.press('Enter');
      await expect
        .poll(async () => (await g.events('dependency-created')).map(e => e.detail))
        .toEqual([{ fromId: 'scope', toId: 'docs', type: 'FS', lag: 0 }]);
      await expect(chart.get('path.gantt-link-preview')).toHaveCount(0);
      expect((await focused(chart))?.taskId).toBe('docs');

      // Esc cancels a session (announced), nothing created
      await page.keyboard.press('l');
      await expect.poll(() => g.liveText()).toContain('Linking from Documentation');
      // The focus tooltip (opened by keyboard focus) takes the first Escape (phase 9 D24)
      const tip = chart.get('.gantt-tooltip').filter({ visible: true });
      if ((await tip.count()) > 0) {
        await page.keyboard.press('Escape');
        await expect(tip).toHaveCount(0);
      }
      await page.keyboard.press('Escape');
      await expect.poll(() => g.liveText()).toContain('Linking cancelled');
      expect(await g.events('dependency-created')).toHaveLength(1);
    });

    test('an arrow: a click selects it, Delete removes it, Ctrl+Z brings it back', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open({ options: OPTIONS });
      const before = await arrows(chart);
      await pointerAway(g);
      const at = await arrowPoint(chart, 'scope', 'research');
      expect(at.clear, 'a point of the arrow away from every bar').toBeGreaterThan(2);
      await page.mouse.click(at.x, at.y);
      await expect(chart.get('g.gantt-arrow.gantt-arrow--selected')).toHaveCount(1);
      await expect.poll(() => g.liveText()).toContain('Link from Scope to Research selected');
      // Selecting is no row click: no selection change
      expect(await g.events('selection-change')).toEqual([]);

      await page.keyboard.press('Delete');
      await expect
        .poll(async () => (await g.events('dependency-deleted')).map(e => e.detail))
        .toEqual([{ fromId: 'scope', toId: 'research', type: 'FS', lag: 0 }]);
      await expect.poll(() => arrows(chart)).toBe(before - 1);
      await expect(chart.get('g.gantt-arrow--selected')).toHaveCount(0);
      expect((await g.events('before-change'))[0].detail).toMatchObject({
        change: { source: 'delete', ops: [{ op: 'unlink' }] },
      });
      await expect.poll(() => g.liveText()).toContain('Removed the link from Scope to Research');

      await page.keyboard.press('Control+z');
      await expect
        .poll(async () => (await g.events('dependency-created')).map(e => e.detail))
        .toEqual([{ fromId: 'scope', toId: 'research', type: 'FS', lag: 0 }]);
      await expect.poll(() => arrows(chart)).toBe(before);
    });

    test('cells: F2, type, Enter saves; Esc cancels; Tab saves and edits the next cell', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open({ options: CELL_OPTIONS, box: CELL_BOX });
      await expect(cell(g, 'scope', 'name')).toHaveAttribute('aria-readonly', 'false');

      await editCell(g, 'scope', 'name');
      await expect(editor(chart)).toHaveAttribute('aria-label', 'Task Name, Scope');
      await page.keyboard.type('Scope v2');
      await page.keyboard.press('Enter');
      await expect(cell(g, 'scope', 'name')).toContainText('Scope v2');
      await expect(editor(chart)).toHaveCount(0);
      expect(await chart.focusedKey()).toBe('cell:scope:name');
      expect(await types(g)).toEqual(['before-change', 'task-updated', 'tasks-change', 'history-change']);
      expect((await g.events('before-change'))[0].detail).toMatchObject({
        change: { source: 'cell', column: 'name', updates: [{ taskId: 'scope', after: { name: 'Scope v2' } }] },
      });

      // Esc cancels: the cell keeps its text, nothing fires
      await editCell(g, 'scope', 'name');
      await page.keyboard.type('zzz');
      await page.keyboard.press('Escape');
      await expect(editor(chart)).toHaveCount(0);
      await expect(cell(g, 'scope', 'name')).toContainText('Scope v2');
      expect(await chart.focusedKey()).toBe('cell:scope:name');
      await settle(page);
      expect(await g.events('before-change')).toHaveLength(1);

      // Tab saves and opens the next editable cell's editor
      await editCell(g, 'research', 'name');
      await page.keyboard.type('Research v2');
      await page.keyboard.press('Tab');
      await expect.poll(() => chart.focusedKey()).toBe('editor:research:start');
      await expect(cell(g, 'research', 'name')).toContainText('Research v2');
      expect(await g.events('task-updated')).toHaveLength(2);
      await page.keyboard.press('Escape');
      await expect(editor(chart)).toHaveCount(0);
      expect(await chart.focusedKey()).toBe('cell:research:start');
    });

    test('cells: 150 in % stays open with aria-invalid and its message; a self link is refused', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open({ options: CELL_OPTIONS, box: CELL_BOX });

      await editCell(g, 'scope', 'progress');
      await page.keyboard.type('150');
      await page.keyboard.press('Enter');
      const field = editor(chart);
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      const error = chart.get('.gantt-tl-editor-error');
      await expect(error).toHaveText('Enter a number from 0 to 100');
      expect(await field.getAttribute('aria-describedby')).toBe(await error.getAttribute('id'));
      await expect(chart.get('.gantt-sr-alert')).toHaveText('Enter a number from 0 to 100');
      expect(await chart.focusedKey()).toBe('editor:scope:progress');
      // Typing clears the error; Esc cancels
      await page.keyboard.press('Backspace');
      await expect(error).toHaveCount(0);
      await expect(field).not.toHaveAttribute('aria-invalid');
      await page.keyboard.press('Escape');
      await expect(editor(chart)).toHaveCount(0);
      await expect(cell(g, 'scope', 'progress')).toHaveText('100%');
      expect(await types(g)).toEqual([]);

      // A task can't be its own predecessor
      await editCell(g, 'scope', 'predecessors');
      await page.keyboard.type('scope');
      await page.keyboard.press('Enter');
      await expect(chart.get('.gantt-tl-editor-error')).toHaveText('A task can’t depend on itself');
      await expect(editor(chart)).toHaveAttribute('aria-invalid', 'true');
      await page.keyboard.press('Escape');
      await settle(page);
      expect(await types(g)).toEqual([]);
    });

    test('cells: "research FS+2d; scope SS" in Predecessors makes two links in one change', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open({ options: CELL_OPTIONS, box: CELL_BOX });
      await editCell(g, 'docs', 'predecessors');
      await page.keyboard.type('research FS+2d; scope SS');
      await page.keyboard.press('Enter');
      await expect(editor(chart)).toHaveCount(0);
      await expect
        .poll(async () => (await g.events('dependency-created')).map(e => e.detail))
        .toEqual([
          { fromId: 'research', toId: 'docs', type: 'FS', lag: 2 },
          { fromId: 'scope', toId: 'docs', type: 'SS', lag: 0 },
        ]);
      expect(await g.events('before-change')).toHaveLength(1);
      await expect(cell(g, 'docs', 'predecessors')).toContainText('Research');
      await expect(cell(g, 'docs', 'predecessors')).toContainText('Scope');
      expect(await historyFlags(g)).toEqual({ canUndo: true, canRedo: false });
    });

    test('a veto in before-change: nothing is applied, the rejection is announced', async ({ chart, page }) => {
      const g = new Gantt(chart, binding);
      await g.open({ options: OPTIONS, veto: true });
      const v0 = await g.barVisual('scope');
      const b = await chart.box(body(g, 'scope'));
      await drag(page, centre(b), { x: centre(b).x + 2 * PX, y: centre(b).y });
      await expect.poll(() => types(g)).toEqual(['before-change']);
      await expect.poll(() => g.liveText()).toContain('Not changed: the change was not accepted');
      expect((await g.barVisual('scope')).x).toBe(v0.x);
      await expect(chart.get('.gantt-tb-undo')).toHaveAttribute('aria-disabled', 'true');

      // Without the veto the same drag applies
      await g.set({ veto: false });
      await drag(page, centre(b), { x: centre(b).x + 2 * PX, y: centre(b).y });
      await expect.poll(async () => (await g.barVisual('scope')).x).toBe(v0.x + 2 * PX);
      expect((await g.events('tasks-change'))[0].detail).toMatchObject({ applied: true });
    });

    test('controlled: the events carry the proposed tasks (applied: false), the bar stays, no history', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open({ options: { ...OPTIONS, editing: { controlled: true } } });
      await expect(chart.get('.gantt-tb-history')).toHaveCount(0);
      const v0 = await g.barVisual('scope');
      const b = await chart.box(body(g, 'scope'));
      await drag(page, centre(b), { x: centre(b).x + 2 * PX, y: centre(b).y });
      await expect.poll(() => types(g)).toEqual(['before-change', 'task-dragged', 'task-updated', 'tasks-change']);
      const [changed] = await g.events('tasks-change');
      expect(changed.detail).toMatchObject({ applied: false, change: { source: 'drag' } });
      const proposed = (changed.detail as { tasks: { id: string; start: string }[] }).tasks.find(t => t.id === 'scope');
      expect(proposed?.start).toBe(await iso(page, day(-10)));
      await settle(page);
      expect((await g.barVisual('scope')).x).toBe(v0.x);
      expect(await g.call('undo')).toBe(false);
      expect(await historyFlags(g)).toEqual({ canUndo: false, canRedo: false });
    });

    test('a data source: a dragged task keeps its new dates when the next page loads, and undo still works', async ({
      chart,
      page,
    }) => {
      const g = new Gantt(chart, binding);
      await g.open({
        tasks: [...PLAN, ...extraTasks(40)],
        dataSource: { failures: 0, pageSize: 30 },
        options: OPTIONS,
      });
      await expect(chart.get('.gantt-bars-layer > [data-task-id="scope"]')).toBeVisible();
      await settle(page);
      expect(await g.fetches()).toBe(1);
      const v0 = await g.barVisual('scope');
      const b = await chart.box(body(g, 'scope'));
      await drag(page, centre(b), { x: centre(b).x + 2 * PX, y: centre(b).y });
      await expect.poll(async () => (await g.barVisual('scope')).x).toBe(v0.x + 2 * PX);

      // Load more, pressed without scrolling it into view (the scroll alone would load the page too)
      await chart.get('.gantt-load-more-btn').dispatchEvent('click');
      await expect.poll(() => g.fetches()).toBe(2);
      await expect.poll(async () => (await g.events('tasks-change')).length).toBe(1);
      await expect(chart.get('.gantt-load-more-btn')).toHaveCount(0);
      expect((await g.barVisual('scope')).x).toBe(v0.x + 2 * PX);
      expect((await g.barVisual('extra-39')).width).toBeGreaterThan(0);

      expect(await g.call('undo')).toBe(true);
      await expect.poll(async () => (await g.barVisual('scope')).x).toBe(v0.x);
    });

    test('forced colours: connectors, progress grip, invalid preview, selected link and invalid editor use system colours', async ({
      chart,
      page,
    }) => {
      await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      const g = new Gantt(chart, binding);
      await g.open({ options: CELL_OPTIONS, box: CELL_BOX });
      const sys = await systemColors(page);

      await hover(g, 'research');
      expect(await paintOf(chart, '.gantt-bar-overlay .gantt-link-connector')).toMatchObject({
        stroke: sys.Highlight,
        fill: sys.Canvas,
      });
      expect(await paintOf(chart, '.gantt-bar-overlay .gantt-progress-grip')).toMatchObject({ stroke: sys.Highlight });

      // A link drag over a target that would loop: the preview and the target connector dashed CanvasText
      const research = await chart.box(body(g, 'research'));
      const start = await connector(g, research, 'start');
      const scope = await chart.box(body(g, 'scope'));
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(nearStart(scope).x, nearStart(scope).y, { steps: 8 });
      await expect(chart.get('path.gantt-link-preview--invalid')).toHaveCount(1);
      expect(await paintOf(chart, 'path.gantt-link-preview--invalid')).toMatchObject({
        stroke: sys.CanvasText,
        dash: '4px, 2px',
      });
      expect(await paintOf(chart, '.gantt-link-connector--invalid')).toMatchObject({
        stroke: sys.CanvasText,
        dash: '4px, 2px',
      });
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect(chart.get('path.gantt-link-preview')).toHaveCount(0);

      // The selected link
      await pointerAway(g);
      const at = await arrowPoint(chart, 'scope', 'research');
      await page.mouse.click(at.x, at.y);
      await expect(chart.get('g.gantt-arrow--selected')).toHaveCount(1);
      expect(await paintOf(chart, 'g.gantt-arrow--selected > path')).toMatchObject({ stroke: sys.Highlight });

      // An invalid editor: Field / FieldText, a dashed CanvasText outline, the message in CanvasText on Canvas
      await editCell(g, 'scope', 'progress');
      await page.keyboard.type('150');
      await page.keyboard.press('Enter');
      await expect(editor(chart)).toHaveAttribute('aria-invalid', 'true');
      expect(await paintOf(chart, '.gantt-tl-editor')).toMatchObject({
        outlineColor: sys.CanvasText,
        outlineStyle: 'dashed',
        color: sys.FieldText,
        background: sys.Field,
      });
      expect(await paintOf(chart, '.gantt-tl-editor-error')).toMatchObject({
        color: sys.CanvasText,
        background: sys.Canvas,
      });
    });
  });
}
