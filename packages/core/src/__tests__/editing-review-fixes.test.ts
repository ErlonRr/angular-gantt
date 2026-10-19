// ─────────────────────────────────────────────────────────────
//  Tests — the Phase 11 review fixes in core (step 7.1):
//  - `prepareChange` with `raw`: the events carry the app's own tasks
//    (`rawProposed`, `task-updated`), validation the normalised ones;
//  - the predecessors cell is editable with links created or deleted,
//    and a cell edit adds links only with `create`, removes them only
//    with `delete` (`validateChange`, labels `errorLinkCreate` /
//    `errorLinkDelete`);
//  - a link target named by a key is linked at its start (`hover(…,
//    'key')`), and the preview follows the bars (`linkPreviewPathOf`);
//  - the selected arrow's halo (`selectedArrowVisual`).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { flattenTree, normalizeTasks } from '../gantt-data';
import { DEFAULT_LABELS, type GanttOptions, type GanttTask } from '../types';
import { resolveConfig } from '../render/config';
import type { BarConnector, BarVisual } from '../render/bars';
import { linkPreviewPath } from '../render/links';
import {
  computeArrowVisual,
  selectedArrowVisual,
  SELECTED_ARROW_HALO,
  SELECTED_ARROW_HALO_OPACITY,
} from '../render/arrows';
import { applyChange, linkChange, taskChange } from '../editing/changes';
import { prepareChange, createBeforeChangeDetail, type PreparedChange, type RejectedChange } from '../editing/pipeline';
import { validateChange } from '../editing/validate';
import { cellEditable, editRules } from '../editing/permissions';
import { LinkSession, linkEndPoint, linkPreviewPathOf } from '../editing/sessions';

const d = (day: number) => new Date(2026, 2, day);

function ok(r: PreparedChange | RejectedChange): PreparedChange {
  if (!r.ok) throw new Error(`rejected: ${r.code} ${r.message}`);
  return r;
}

describe('prepareChange: the events carry the app’s own tasks (raw)', () => {
  // A child whose parent is not loaded (a lazy page) and a task without an end: normalising drops
  // the parent and sets end = start, which the app must never get back
  const RAW: GanttTask[] = [
    { id: 'a', name: 'A', start: d(2), end: d(6) },
    { id: 'kid', name: 'Kid', start: d(3), end: d(5), parentId: 'not-loaded' },
    // No end (the data may omit it: the chart reads the start)
    { id: 'm', name: 'Milestone', start: d(9) } as GanttTask,
  ];
  const NORMALISED = normalizeTasks(RAW);
  const ctx = (options: GanttOptions = { editing: true }) => ({
    tasks: NORMALISED,
    raw: RAW,
    config: resolveConfig(options),
    labels: DEFAULT_LABELS,
  });

  it('the fixture: normalising drops the missing parent and gives the milestone an end', () => {
    expect(NORMALISED.find(t => t.id === 'kid')?.parentId).toBeUndefined();
    expect(NORMALISED.find(t => t.id === 'm')?.end).toEqual(d(9));
  });

  it('rawProposed is the raw tasks with the change: the parent and the missing end are kept', () => {
    const r = ok(prepareChange(linkChange(RAW, { fromId: 'a', toId: 'kid' }, 'link', 'api'), ctx()));
    const kid = r.rawProposed.find(t => t.id === 'kid')!;
    expect(kid.parentId).toBe('not-loaded');
    expect(kid.dependency).toEqual([{ taskId: 'a', type: 'FS', lag: 0 }]);
    // Untouched tasks are the app's own objects
    expect(r.rawProposed[0]).toBe(RAW[0]);
    expect(r.rawProposed[2]).toBe(RAW[2]);
    expect('end' in r.rawProposed[2]).toBe(false);
    expect(r.rawProposed).toEqual(applyChange(RAW, r.change));
    // Validation read the normalised ones
    expect(r.proposed.find(t => t.id === 'm')?.end).toEqual(d(9));
    // What `before-change` carries
    expect(createBeforeChangeDetail(r.change, r.rawProposed).tasks).toBe(r.rawProposed);
  });

  it('task-updated carries the raw task and its raw previous object', () => {
    const r = ok(prepareChange(taskChange(RAW[1], { name: 'Child' }, 'cell', { column: 'name' }), ctx()));
    const updated = r.events.find(e => e.type === 'task-updated')!.detail as { task: GanttTask; previous: GanttTask };
    expect(updated.previous).toBe(RAW[1]);
    expect(updated.task).toBe(r.rawProposed[1]);
    expect(updated.task).toMatchObject({ name: 'Child', parentId: 'not-loaded' });
  });

  it('without raw: the normalised tasks, as before (rawProposed is proposed)', () => {
    const r = ok(
      prepareChange(taskChange(NORMALISED[0], { name: 'Alpha' }, 'api'), {
        tasks: NORMALISED,
        config: resolveConfig({}),
        labels: DEFAULT_LABELS,
      }),
    );
    expect(r.rawProposed).toBe(r.proposed);
  });
});

describe('predecessors: editable with links created or deleted; a cell edit keeps to its rights', () => {
  const TASKS: GanttTask[] = [
    { id: 'a', name: 'A', start: d(2), end: d(4) },
    { id: 'b', name: 'B', start: d(5), end: d(7) },
    { id: 'c', name: 'C', start: d(8), end: d(9), dependency: [{ taskId: 'a', type: 'FS' }] },
  ];
  const rowOf = (id: string) => flattenTree(TASKS, new Set()).find(r => r.task.id === id)!;
  const col = { key: 'predecessors', label: 'Predecessors', width: 120 };
  const editable = (options: GanttOptions) => {
    const config = resolveConfig(options);
    const row = rowOf('c');
    return cellEditable(col, row, editRules(row, { config, enableDrag: true, enableResize: true }), config);
  };
  const validate = (dependency: GanttTask['dependency'], options: GanttOptions, source: 'cell' | 'api' = 'cell') => {
    const change = taskChange(TASKS[2], { dependency }, source, { column: 'predecessors' });
    return validateChange(change, {
      tasks: TASKS,
      proposed: applyChange(TASKS, change),
      config: resolveConfig(options),
    });
  };

  it('the cell is editable with create or delete (the keyboard path to remove a link, D13)', () => {
    expect(editable({ editing: true })).toBe(true);
    expect(editable({ editing: { dependencies: { create: false } } })).toBe(true);
    expect(editable({ editing: { dependencies: { delete: false } } })).toBe(true);
    expect(editable({ editing: { dependencies: { create: false, delete: false } } })).toBe(false);
    expect(editable({ editing: { dependencies: false } })).toBe(false);
  });

  it('create off: adding a link is rejected (errorLinkCreate); removing one is fine', () => {
    const options = { editing: { dependencies: { create: false } } };
    expect(validate([{ taskId: 'a' }, { taskId: 'b' }], options)).toEqual({
      code: 'read-only',
      message: DEFAULT_LABELS.errorLinkCreate,
    });
    expect(validate(undefined, options)).toBeNull();
  });

  it('delete off: removing a link is rejected (errorLinkDelete); adding one is fine', () => {
    const options = { editing: { dependencies: { delete: false } } };
    expect(validate(undefined, options)).toEqual({ code: 'read-only', message: DEFAULT_LABELS.errorLinkDelete });
    // Replacing a by b removes a
    expect(validate([{ taskId: 'b' }], options)?.message).toBe(DEFAULT_LABELS.errorLinkDelete);
    expect(validate([{ taskId: 'a' }, { taskId: 'b' }], options)).toBeNull();
  });

  it('a new type or lag of an existing link needs neither right', () => {
    expect(
      validate([{ taskId: 'a', type: 'SS', lag: 2 }], { editing: { dependencies: { create: false, delete: false } } }),
    ).toBeNull();
  });

  it('the rights come first: no cycle or self-link message for a link that can’t be added at all', () => {
    expect(
      validate([{ taskId: 'a' }, { taskId: 'c' }], { editing: { dependencies: { create: false } } })?.message,
    ).toBe(DEFAULT_LABELS.errorLinkCreate);
  });

  it('other sources keep the API’s own rules (addDependency() works with create off)', () => {
    expect(
      validate([{ taskId: 'a' }, { taskId: 'b' }], { editing: { dependencies: { create: false } } }, 'api'),
    ).toBeNull();
  });

  it('the two labels', () => {
    expect(DEFAULT_LABELS.errorLinkCreate).toBe('New links can’t be added here');
    expect(DEFAULT_LABELS.errorLinkDelete).toBe('Links can’t be removed here');
  });
});

/** A connector centred at (cx, cy). */
const connector = (side: 'start' | 'end', cx: number, cy: number): BarConnector => ({
  side,
  cx,
  cy,
  hit: { x: cx - 12, y: cy - 12, width: 24, height: 24 },
  dot: { x: cx - 5, y: cy - 5, width: 10, height: 10, rx: 5 },
});
/** A bar at x…x+width on the centre line `cy`, with its connectors 8 px outside its ends. */
const visual = (x: number, width: number, cy: number, connectors = true): BarVisual =>
  ({
    x,
    width,
    y: cy - 10,
    height: 20,
    cy,
    connectors: connectors ? { start: connector('start', x - 8, cy), end: connector('end', x + width + 8, cy) } : null,
  }) as BarVisual;

describe('LinkSession: a target named by a key is linked at its start', () => {
  const TASKS: GanttTask[] = [
    { id: 'a', name: 'A', start: d(2), end: d(4) },
    { id: 'b', name: 'B', start: d(5), end: d(7) },
  ];
  const config = resolveConfig({ editing: true });
  const A = visual(80, 80, 18);
  const B = visual(220, 60, 54);
  const from = { taskId: 'a', side: 'end' as const, x: A.connectors!.end.cx, y: A.connectors!.end.cy };

  it('click mode: the stale pointer near the target’s end does not decide the side of a key finish', () => {
    const s = new LinkSession(from, { tasks: TASKS, config, mode: 'click' });
    // The pointer was last near b's end (FF by the pointer)
    const pointer = { x: B.connectors!.end.cx, y: B.cy };
    expect(s.hover({ taskId: 'b', visual: B }, pointer).type).toBe('FF');
    // Enter / F2 / L on the focused bar: its start (FS)
    const byKey = s.hover({ taskId: 'b', visual: B }, pointer, 'key');
    expect(byKey).toMatchObject({ targetSide: 'start', type: 'FS', valid: true });
    expect(byKey.d).toBe(linkPreviewPath(from, linkEndPoint(B, 'start')));
    expect(s.finish()?.ops[0]).toMatchObject({ op: 'link', event: { fromId: 'a', toId: 'b', type: 'FS' } });
  });

  it('keyboard mode is always the start, whatever the pointer', () => {
    const s = new LinkSession(from, { tasks: TASKS, config, mode: 'keyboard' });
    expect(s.hover({ taskId: 'b', visual: B }, { x: 999, y: 0 }).targetSide).toBe('start');
  });
});

describe('linkEndPoint / linkPreviewPathOf: the preview from the bars as they are now', () => {
  it('a connector’s centre, else the bar’s edge on its centre line', () => {
    const v = visual(100, 60, 50);
    expect(linkEndPoint(v, 'start')).toEqual({ x: 92, y: 50 });
    expect(linkEndPoint(v, 'end')).toEqual({ x: 168, y: 50 });
    const bare = visual(100, 60, 50, false);
    expect(linkEndPoint(bare, 'start')).toEqual({ x: 100, y: 50 });
    expect(linkEndPoint(bare, 'end')).toEqual({ x: 160, y: 50 });
  });

  it('to a target’s connector, or to a point; a zoom (wider bars) moves both ends', () => {
    const src = visual(80, 80, 18);
    const tgt = visual(220, 60, 54);
    expect(linkPreviewPathOf(src, 'end', { visual: tgt, side: 'start' })).toBe(
      linkPreviewPath({ x: 168, y: 18 }, { x: 212, y: 54 }),
    );
    expect(linkPreviewPathOf(src, 'end', { x: 400, y: 70 })).toBe(
      linkPreviewPath({ x: 168, y: 18 }, { x: 400, y: 70 }),
    );
    // Zoomed in 2×: the same session's preview follows the bars
    const zoomed = linkPreviewPathOf(visual(160, 160, 18), 'end', { visual: visual(440, 120, 54), side: 'start' });
    expect(zoomed).toBe(linkPreviewPath({ x: 328, y: 18 }, { x: 432, y: 54 }));
  });
});

describe('selectedArrowVisual: a halo behind the selected link', () => {
  const config = resolveConfig({});
  const rows = { fromTop: 0, fromBottom: 36 };

  it('a translucent focus-ring stroke 6 px wider than the link, only while selected', () => {
    const a = computeArrowVisual(visual(0, 100, 18), visual(200, 80, 54), {}, config, rows);
    expect(a.halo).toBeNull();
    const s = selectedArrowVisual(a);
    expect(SELECTED_ARROW_HALO).toBe(6);
    expect(SELECTED_ARROW_HALO_OPACITY).toBe(0.3);
    expect(s.halo).toEqual({ paint: 'var(--gantt-focus-ring)', width: a.width + 6, opacity: 0.3 });
    // The line keeps its own look (focus ring, 1 px wider): the halo is what tells it apart where
    // the arrows are already painted in the focus ring's colour
    expect(s.width).toBe(a.width + 1);
    expect(s.halo!.width).toBeGreaterThan(s.width);
  });
});
