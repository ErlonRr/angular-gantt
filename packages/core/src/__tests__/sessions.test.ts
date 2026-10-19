// ─────────────────────────────────────────────────────────────
//  Tests — editing/sessions.ts (Phase 11 step 2.6): the progress grip
//  session (snap, clamp, the own value kept, no-op drops) and the link
//  session (type inference × 4, target side, drag / click / keyboard
//  modes, invalid targets with their reasons, finish / cancel).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { DEFAULT_LABELS, type GanttLabels, type GanttTask } from '../types';
import { resolveConfig } from '../render/config';
import type { BarConnector, BarVisual } from '../render/bars';
import { linkPreviewPath } from '../render/links';
import { linkChange } from '../editing/changes';
import {
  LinkSession,
  ProgressSession,
  inferLinkType,
  linkTargetSide,
  type LinkEndpoint,
  type LinkMode,
} from '../editing/sessions';

// ─── Progress grip ────────────────────────────────────────────

describe('ProgressSession', () => {
  const bar = { x: 100, width: 200 };
  /** Content x of `pct` % of the bar */
  const at = (pct: number) => bar.x + (bar.width * pct) / 100;

  it('follows the pointer, snapped to the step, with the grip on the snapped edge', () => {
    const s = new ProgressSession({ id: 'a', progress: 40 }, bar, { step: 5 });
    expect(s.taskId).toBe('a');
    expect(s.preview(at(47))).toEqual({ taskId: 'a', progress: 45, x: at(45) });
    expect(s.preview(at(48))).toEqual({ taskId: 'a', progress: 50, x: at(50) });
    expect(s.preview(at(62.4)).progress).toBe(60);
  });

  it('clamps to 0–100 beyond the bar', () => {
    const s = new ProgressSession({ id: 'a', progress: 40 }, bar, { step: 5 });
    expect(s.preview(bar.x - 50)).toEqual({ taskId: 'a', progress: 0, x: bar.x });
    expect(s.preview(bar.x + bar.width + 80)).toEqual({ taskId: 'a', progress: 100, x: bar.x + bar.width });
  });

  it('reaches 100 with a step that does not divide it', () => {
    const s = new ProgressSession({ id: 'a', progress: 0 }, bar, { step: 15 });
    expect(s.preview(at(97)).progress).toBe(90);
    expect(s.preview(at(98)).progress).toBe(100);
    expect(s.preview(at(100)).progress).toBe(100);
  });

  it('keeps the own progress within half a step of it, even off the step grid', () => {
    const s = new ProgressSession({ id: 'a', progress: 47 }, bar, { step: 5 });
    expect(s.preview(at(47)).progress).toBe(47);
    expect(s.preview(at(44.6)).progress).toBe(47);
    expect(s.preview(at(49.4)).progress).toBe(47);
    expect(s.preview(at(44.4)).progress).toBe(45);
    expect(s.preview(at(49.6)).progress).toBe(50);
    // Monotonic: never goes back while the pointer moves one way
    const seq = Array.from({ length: 101 }, (_, i) => s.preview(at(i)).progress);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
  });

  it('gives clean values for fractional steps', () => {
    expect(new ProgressSession({ id: 'a', progress: 0 }, bar, { step: 2.5 }).preview(at(33.8)).progress).toBe(35);
    expect(new ProgressSession({ id: 'a', progress: 0 }, bar, { step: 0.1 }).preview(at(33.33)).progress).toBe(33.3);
  });

  it('snaps to whole percent when the step is not positive', () => {
    for (const step of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(new ProgressSession({ id: 'a', progress: 0 }, bar, { step }).preview(at(33.4)).progress).toBe(33);
    }
  });

  it('finish: the progress event, or null when the progress did not change', () => {
    const s = new ProgressSession({ id: 'a', progress: 40 }, bar, { step: 5 });
    expect(s.finish(at(41))).toBeNull();
    expect(s.finish(at(61))).toEqual({ taskId: 'a', oldProgress: 40, newProgress: 60 });
    expect(s.finish(bar.x - 10)).toEqual({ taskId: 'a', oldProgress: 40, newProgress: 0 });
  });

  it('reads a missing progress as 0', () => {
    const s = new ProgressSession({ id: 'a' }, bar, { step: 5 });
    expect(s.finish(at(1))).toBeNull();
    expect(s.finish(at(25))).toEqual({ taskId: 'a', oldProgress: 0, newProgress: 25 });
  });

  it('a bar without width keeps the progress', () => {
    const s = new ProgressSession({ id: 'a', progress: 30 }, { x: 50, width: 0 }, { step: 5 });
    expect(s.preview(400)).toEqual({ taskId: 'a', progress: 30, x: 50 });
    expect(s.finish(400)).toBeNull();
  });
});

// ─── Links ────────────────────────────────────────────────────

describe('inferLinkType', () => {
  it('reads the type from the two ends', () => {
    expect(inferLinkType('end', 'start')).toBe('FS');
    expect(inferLinkType('start', 'start')).toBe('SS');
    expect(inferLinkType('end', 'end')).toBe('FF');
    expect(inferLinkType('start', 'end')).toBe('SF');
  });
});

/** A connector centred at (cx, cy), with a 24 px target and a 10 px dot. */
const connector = (side: 'start' | 'end', cx: number, cy: number): BarConnector => ({
  side,
  cx,
  cy,
  hit: { x: cx - 12, y: cy - 12, width: 24, height: 24 },
  dot: { x: cx - 5, y: cy - 5, width: 10, height: 10, rx: 5 },
});

/** A task bar visual at x…x+width in the row whose centre line is `cy` (what the sessions read). */
function visual(x: number, width: number, cy: number, connectors = true): BarVisual {
  return {
    x,
    width,
    y: cy - 10,
    height: 20,
    cy,
    connectors: connectors ? { start: connector('start', x - 8, cy), end: connector('end', x + width + 8, cy) } : null,
  } as BarVisual;
}

describe('linkTargetSide', () => {
  const v = visual(100, 60, 50);

  it('picks the connector whose centre is nearer (ties: the end)', () => {
    expect(linkTargetSide(v, 92)).toBe('start');
    expect(linkTargetSide(v, 40)).toBe('start');
    expect(linkTargetSide(v, 129)).toBe('start');
    expect(linkTargetSide(v, 130)).toBe('end');
    expect(linkTargetSide(v, 168)).toBe('end');
    expect(linkTargetSide(v, 400)).toBe('end');
  });

  it('without connectors: the nearer half of the bar', () => {
    const bare = visual(100, 60, 50, false);
    expect(linkTargetSide(bare, 101)).toBe('start');
    expect(linkTargetSide(bare, 129.9)).toBe('start');
    expect(linkTargetSide(bare, 130)).toBe('end');
    expect(linkTargetSide(bare, 159)).toBe('end');
  });
});

describe('LinkSession', () => {
  const day = (d: number) => new Date(2026, 0, d);
  const task = (id: string, s: number, e: number, extra: Partial<GanttTask> = {}): GanttTask => ({
    id,
    name: `Task ${id}`,
    start: day(s),
    end: day(e),
    ...extra,
  });
  const TASKS: GanttTask[] = [
    task('a', 5, 9),
    task('b', 12, 15),
    task('c', 16, 20, { dependency: 'b' }),
    task('g', 5, 25, { type: 'group' }),
    task('d', 6, 8, { parentId: 'g' }),
    task('ro', 10, 12, { editable: false }),
  ];
  const config = resolveConfig({ editing: true });
  const VIS: Record<string, BarVisual> = {
    a: visual(80, 80, 18),
    b: visual(220, 60, 54),
    c: visual(300, 80, 90),
    g: visual(80, 400, 126),
    d: visual(100, 40, 162),
    ro: visual(180, 40, 198),
  };
  /** The connector centre of `id`'s `side` */
  const end = (id: string, side: 'start' | 'end') => {
    const c = VIS[id].connectors![side];
    return { x: c.cx, y: c.cy };
  };
  const from = (id: string, side: 'start' | 'end'): LinkEndpoint => ({ taskId: id, side, ...end(id, side) });
  const session = (id: string, side: 'start' | 'end', mode: LinkMode = 'drag', labels?: GanttLabels) =>
    new LinkSession(from(id, side), { tasks: TASKS, config, mode, labels });
  const over = (id: string) => ({ taskId: id, visual: VIS[id] });

  it('keeps its start and mode', () => {
    const s = session('a', 'end', 'click');
    expect(s.from).toEqual(from('a', 'end'));
    expect(s.mode).toBe('click');
    expect(s.finished).toBe(false);
  });

  it.each([
    ['end', 'start', 'FS'],
    ['start', 'start', 'SS'],
    ['end', 'end', 'FF'],
    ['start', 'end', 'SF'],
  ] as const)('drag from the %s connector to the target %s: %s, previewed to the target connector', (fs, ts, type) => {
    const s = session('a', fs);
    const pointer = { x: end('b', ts).x + (ts === 'start' ? 3 : -3), y: 54 };
    expect(s.hover(over('b'), pointer)).toEqual({
      d: linkPreviewPath(from('a', fs), end('b', ts)),
      valid: true,
      targetId: 'b',
      targetSide: ts,
      type,
      reason: null,
    });
    const change = s.finish();
    expect(change).toEqual(linkChange(TASKS, { fromId: 'a', toId: 'b', type }, 'link', 'link'));
    expect(change?.source).toBe('link');
    expect(change?.ops).toEqual([{ op: 'link', event: { fromId: 'a', toId: 'b', type, lag: 0 } }]);
    expect(change?.updates).toEqual([
      { taskId: 'b', before: { dependency: undefined }, after: { dependency: [{ taskId: 'a', type, lag: 0 }] } },
    ]);
    expect(s.finished).toBe(true);
  });

  it('no bar under the pointer: the preview goes to the pointer and finish() gives nothing', () => {
    const s = session('a', 'end');
    const pointer = { x: 500, y: 300 };
    expect(s.hover(null, pointer)).toEqual({
      d: linkPreviewPath(from('a', 'end'), pointer),
      valid: false,
      targetId: null,
      targetSide: null,
      type: null,
      reason: null,
    });
    expect(s.finish()).toBeNull();
  });

  it('the source bar is no target (the pointer starts there)', () => {
    const s = session('a', 'end');
    const pointer = { x: 120, y: 18 };
    expect(s.hover(over('a'), pointer)).toMatchObject({ valid: false, targetId: null, reason: null });
    expect(s.hover(over('a'), pointer).d).toBe(linkPreviewPath(from('a', 'end'), pointer));
    expect(s.finish()).toBeNull();
  });

  it.each([
    ['a duplicate (any type)', 'b', 'c', 'start', DEFAULT_LABELS.errorDuplicateLink],
    ['a duplicate of another type', 'b', 'c', 'end', DEFAULT_LABELS.errorDuplicateLink],
    ['a cycle', 'c', 'b', 'start', DEFAULT_LABELS.errorCycle],
    ['a parent to its child', 'g', 'd', 'start', DEFAULT_LABELS.errorParentChild],
    ['a child to its parent', 'd', 'g', 'start', DEFAULT_LABELS.errorParentChild],
    ['a read-only task', 'a', 'ro', 'start', DEFAULT_LABELS.errorReadOnly],
  ] as const)('rejects %s with the reason, still previewed to its connector', (_, src, dst, side, reason) => {
    const s = session(src, 'end');
    const p = s.hover(over(dst), end(dst, side));
    expect(p).toEqual({
      d: linkPreviewPath(from(src, 'end'), end(dst, side)),
      valid: false,
      targetId: dst,
      targetSide: side,
      type: inferLinkType('end', side),
      reason,
    });
    expect(s.finish()).toBeNull();
  });

  it('allows parent ↔ child links with editing.dependencies.parentChild', () => {
    const cfg = resolveConfig({ editing: { dependencies: { parentChild: true } } });
    const s = new LinkSession(from('g', 'end'), { tasks: TASKS, config: cfg, mode: 'drag' });
    expect(s.hover(over('d'), end('d', 'start'))).toMatchObject({ valid: true, reason: null, type: 'FS' });
    expect(s.finish()?.ops).toEqual([{ op: 'link', event: { fromId: 'g', toId: 'd', type: 'FS', lag: 0 } }]);
  });

  it('a target that refuses links (editRules linkTo false) is read-only', () => {
    const s = session('a', 'end');
    expect(s.hover({ ...over('b'), linkTo: false }, end('b', 'start'))).toMatchObject({
      valid: false,
      targetId: 'b',
      reason: DEFAULT_LABELS.errorReadOnly,
    });
    expect(s.finish()).toBeNull();
  });

  it('takes the reasons from its labels', () => {
    const labels: GanttLabels = { ...DEFAULT_LABELS, errorCycle: 'Boucle', errorReadOnly: 'Lecture seule' };
    const s = session('c', 'end', 'drag', labels);
    expect(s.hover(over('b'), end('b', 'start')).reason).toBe('Boucle');
    expect(s.hover({ ...over('a'), linkTo: false }, end('a', 'start')).reason).toBe('Lecture seule');
  });

  it('finish() links the last hovered target: valid after invalid links, invalid or nothing after valid does not', () => {
    const a = session('a', 'end');
    a.hover(over('ro'), end('ro', 'start'));
    a.hover(over('b'), end('b', 'start'));
    expect(a.finish()?.ops).toEqual([{ op: 'link', event: { fromId: 'a', toId: 'b', type: 'FS', lag: 0 } }]);

    const b = session('a', 'end');
    b.hover(over('b'), end('b', 'start'));
    b.hover(over('ro'), end('ro', 'start'));
    expect(b.finish()).toBeNull();

    const c = session('a', 'end');
    c.hover(over('b'), end('b', 'start'));
    c.hover(null, { x: 0, y: 0 });
    expect(c.finish()).toBeNull();
  });

  it('click mode: a connector click, then a click on a bar (WCAG 2.5.7) — the side from the pointer', () => {
    const s = session('b', 'end', 'click');
    expect(s.hover(over('d'), { x: 140, y: 162 })).toMatchObject({ valid: true, targetSide: 'end', type: 'FF' });
    expect(s.hover(over('a'), { x: 81, y: 18 })).toMatchObject({ valid: true, targetSide: 'start', type: 'FS' });
    expect(s.finish()?.ops).toEqual([{ op: 'link', event: { fromId: 'b', toId: 'a', type: 'FS', lag: 0 } }]);
  });

  it('keyboard mode: always to the target start (FS from the end), wherever the pointer is', () => {
    const s = session('a', 'end', 'keyboard');
    const p = s.hover(over('b'), end('b', 'end'));
    expect(p).toMatchObject({ valid: true, targetId: 'b', targetSide: 'start', type: 'FS' });
    expect(p.d).toBe(linkPreviewPath(from('a', 'end'), end('b', 'start')));
    expect(s.finish()?.ops).toEqual([{ op: 'link', event: { fromId: 'a', toId: 'b', type: 'FS', lag: 0 } }]);
  });

  it('a target without connectors ends the preview on the bar edge at its centre line', () => {
    const s = session('a', 'end');
    const bare = { taskId: 'b', visual: visual(220, 60, 54, false) };
    expect(s.hover(bare, { x: 225, y: 54 }).d).toBe(linkPreviewPath(from('a', 'end'), { x: 220, y: 54 }));
    expect(s.hover(bare, { x: 275, y: 54 }).d).toBe(linkPreviewPath(from('a', 'end'), { x: 280, y: 54 }));
  });

  it('cancel() ends the session: no target any more and finish() gives nothing', () => {
    const s = session('a', 'end');
    s.hover(over('b'), end('b', 'start'));
    s.cancel();
    expect(s.finished).toBe(true);
    expect(s.finish()).toBeNull();
    expect(s.hover(over('b'), end('b', 'start'))).toMatchObject({ valid: false, targetId: null });
  });

  it('finish() ends the session once', () => {
    const s = session('a', 'end');
    s.hover(over('b'), end('b', 'start'));
    expect(s.finish()).not.toBeNull();
    expect(s.finish()).toBeNull();
  });

  it('checks a target once, then keeps its verdict while the session lasts', () => {
    const tasks = TASKS.map(t => ({ ...t }));
    const s = new LinkSession(from('a', 'end'), { tasks, config, mode: 'drag' });
    expect(s.hover(over('b'), end('b', 'start')).valid).toBe(true);
    // The tasks don't change during a session: a later edit of the array is not read again
    tasks[1] = { ...tasks[1], editable: false };
    expect(s.hover(over('b'), end('b', 'end')).valid).toBe(true);
  });
});
