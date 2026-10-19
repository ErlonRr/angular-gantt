// The bar overlay (D11, `computeBarOverlay`): without editing it is exactly the ring and the grips
// both bindings drew before Phase 11 (keys, classes, order, rects); with editing it adds the
// progress grip and the link connectors, and a link session's modifiers.
import { describe, it, expect } from 'vitest';
import {
  buildTimeline,
  computeBarOverlay,
  computeBarVisual,
  computeRowGeometries,
  filterVisible,
  flattenTree,
  reindexVisible,
  resolveConfig,
  ViewMode,
  type BarOverlayInput,
  type BarVisual,
  type GanttTask,
  type OverlayShape,
  type Rect,
  type RowGeometry,
} from '../index';

const t = (id: string, s: Date, e: Date, extra: Partial<GanttTask> = {}): GanttTask => ({
  id,
  name: `Task ${id}`,
  start: s,
  end: e,
  ...extra,
});

const TASKS: GanttTask[] = [
  t('a', new Date(2026, 0, 5), new Date(2026, 0, 20), { progress: 40 }),
  t('g', new Date(2026, 0, 5), new Date(2026, 0, 25), { type: 'group' as never }),
  t('c', new Date(2026, 0, 6), new Date(2026, 0, 9), { parentId: 'g', progress: 10 }),
  t('n', new Date(2026, 0, 7), new Date(2026, 0, 7)),
  t('m', new Date(2026, 0, 26), new Date(2026, 0, 26), { type: 'milestone' as never }),
];

function rowsOf(edit: boolean, resizable = true) {
  const cfg = resolveConfig({ viewMode: ViewMode.Day, showToday: false });
  const flat = reindexVisible(filterVisible(flattenTree(TASKS, new Set())));
  const tl = buildTimeline({ tasks: TASKS, config: cfg });
  const geos = computeRowGeometries(flat, tl, cfg);
  const of = (geo: RowGeometry): BarVisual =>
    computeBarVisual({ geo, cfg, toX: tl.toX, resizable, progressEditable: edit, linkable: edit });
  return { geos, of, rows: geos.map(geo => ({ id: geo.row.task.id, visual: of(geo) })) };
}

// ─── Before Phase 11: the two bindings' own overlay code, copied verbatim in spirit ─────

interface LegacyShape {
  key: string;
  className: string;
  rect: Rect & { rx: number };
}

/** WC `layers/bars.ts` `paintOverlay` (keys from `rowKeys`: a repeated id gets `\u0000n`). */
function legacyWc(
  geos: readonly RowGeometry[],
  visualOf: (geo: RowGeometry) => BarVisual,
  ringId: string | null,
  hoverId: string | null,
  selected: ReadonlySet<string>,
  coarse: boolean,
): LegacyShape[] {
  const seen = new Set<string>();
  const keys = geos.map(geo => {
    const id = geo.row.task.id;
    let key = id;
    for (let n = 2; seen.has(key); n++) key = `${id}\u0000${n}`;
    seen.add(key);
    return key;
  });
  const shapes: LegacyShape[] = [];
  geos.forEach((geo, i) => {
    const id = geo.row.task.id;
    const ring = id === ringId;
    if (!ring && id !== hoverId && !(coarse && selected.has(id))) return;
    const v = visualOf(geo);
    const key = keys[i];
    if (ring) shapes.push({ key: `${key}\u0001ring`, className: 'gantt-bar-focus-ring', rect: v.focusRect });
    if (!v.handles) return;
    shapes.push({ key: `${key}\u0001left`, className: 'gantt-bar-grip', rect: v.handles.left.grip });
    shapes.push({ key: `${key}\u0001right`, className: 'gantt-bar-grip', rect: v.handles.right.grip });
  });
  return shapes;
}

/** Angular `GanttBarFocusService.overlay` (keys from the task id). */
function legacyNg(
  geos: readonly RowGeometry[],
  visualOf: (geo: RowGeometry) => BarVisual,
  ringId: string | null,
  hoverId: string | null,
  selectedIds: ReadonlySet<string>,
  coarse: boolean,
): LegacyShape[] {
  const selected = coarse ? selectedIds : new Set<string>();
  if (ringId === null && hoverId === null && selected.size === 0) return [];
  const shapes: LegacyShape[] = [];
  for (const geo of geos) {
    const id = geo.row.task.id;
    const ring = id === ringId;
    if (!ring && id !== hoverId && !selected.has(id)) continue;
    const v = visualOf(geo);
    if (ring) shapes.push({ key: `${id}\u0001ring`, className: 'gantt-bar-focus-ring', rect: v.focusRect });
    if (!v.handles) continue;
    shapes.push({ key: `${id}\u0001left`, className: 'gantt-bar-grip', rect: v.handles.left.grip });
    shapes.push({ key: `${id}\u0001right`, className: 'gantt-bar-grip', rect: v.handles.right.grip });
  }
  return shapes;
}

const input = (rows: BarOverlayInput['rows'], over: Partial<BarOverlayInput> = {}): BarOverlayInput => ({
  rows,
  focusVisibleId: null,
  hoveredId: null,
  selected: new Set(),
  coarse: false,
  link: null,
  progressPreview: null,
  ...over,
});

const IDS = [null, 'a', 'g', 'c', 'n', 'm', 'zz'];
const SELECTIONS: ReadonlySet<string>[] = [new Set(), new Set(['a']), new Set(['a', 'c', 'm']), new Set(['g', 'n'])];

describe('computeBarOverlay without editing = the ring and grips of before (both bindings)', () => {
  for (const resizable of [true, false]) {
    it(`every focus / hover / selection / pointer combination${resizable ? '' : ' (no handles)'}`, () => {
      const { geos, of, rows } = rowsOf(false, resizable);
      // A repeated id (both bindings key it apart in the WC: `\u0000n`)
      const dupGeos = [...geos, geos[0]];
      const dupRows = [...rows, { id: rows[0].id, visual: rows[0].visual }];
      for (const ring of IDS)
        for (const hover of IDS)
          for (const selected of SELECTIONS)
            for (const coarse of [false, true]) {
              const over = { focusVisibleId: ring, hoveredId: hover, selected, coarse };
              const out = computeBarOverlay(input(rows, over));
              expect(out).toEqual(legacyWc(geos, of, ring, hover, selected, coarse));
              expect(out).toEqual(legacyNg(geos, of, ring, hover, selected, coarse));
              expect(computeBarOverlay(input(dupRows, over))).toEqual(
                legacyWc(dupGeos, of, ring, hover, selected, coarse),
              );
            }
    });
  }

  it("hands out the visual's own rects (no copies)", () => {
    const { rows } = rowsOf(false);
    const a = rows[0].visual;
    const out = computeBarOverlay(input(rows, { focusVisibleId: 'a' }));
    expect(out.map(s => s.rect)).toEqual([a.focusRect, a.handles!.left.grip, a.handles!.right.grip]);
    expect(out[0].rect).toBe(a.focusRect);
    expect(out[1].rect).toBe(a.handles!.left.grip);
  });

  it('is empty when nothing is focused, hovered or (coarse) selected', () => {
    const { rows } = rowsOf(false);
    expect(computeBarOverlay(input(rows))).toEqual([]);
    expect(computeBarOverlay(input(rows, { selected: new Set(['a']) }))).toEqual([]);
  });
});

const keysOf = (shapes: OverlayShape[]) => shapes.map(s => s.key.replace('\u0001', ':'));
const classesOf = (shapes: OverlayShape[]) => shapes.map(s => s.className);

describe('computeBarOverlay with editing', () => {
  const { rows } = rowsOf(true);
  const a = rows.find(r => r.id === 'a')!.visual;

  it('per bar: ring, grip left, grip right, progress grip, connector start, connector end', () => {
    expect(a.progressGrip).not.toBeNull();
    const out = computeBarOverlay(input(rows, { focusVisibleId: 'a' }));
    expect(keysOf(out)).toEqual(['a:ring', 'a:left', 'a:right', 'a:progress', 'a:link-start', 'a:link-end']);
    expect(classesOf(out)).toEqual([
      'gantt-bar-focus-ring',
      'gantt-bar-grip',
      'gantt-bar-grip',
      'gantt-progress-grip',
      'gantt-link-connector',
      'gantt-link-connector',
    ]);
    expect(out.map(s => s.rect)).toEqual([
      a.focusRect,
      a.handles!.left.grip,
      a.handles!.right.grip,
      a.progressGrip!.grip,
      a.connectors!.start.dot,
      a.connectors!.end.dot,
    ]);
  });

  it('shows the same bars as before: hovered, focus-visible, coarse selection; rows in order', () => {
    const hover = computeBarOverlay(input(rows, { hoveredId: 'm' }));
    // A milestone: no grips, connectors only
    expect(keysOf(hover)).toEqual(['m:link-start', 'm:link-end']);
    const coarse = computeBarOverlay(input(rows, { selected: new Set(['m', 'n']), coarse: true }));
    expect(keysOf(coarse).filter(k => k.endsWith('link-start'))).toEqual(['n:link-start', 'm:link-start']);
    expect(computeBarOverlay(input(rows, { selected: new Set(['m']), coarse: false }))).toEqual([]);
  });

  it('keeps the grips of the bar whose progress is dragged, pointer off it', () => {
    const out = computeBarOverlay(input(rows, { progressPreview: { taskId: 'a', progress: 70 } }));
    expect(keysOf(out)).toEqual(['a:left', 'a:right', 'a:progress', 'a:link-start', 'a:link-end']);
  });

  it('a link session: grips hidden, connectors on the source and the target with modifiers', () => {
    const link = { sourceId: 'a', sourceSide: 'end', targetId: 'c', targetSide: 'start', valid: true } as const;
    const out = computeBarOverlay(input(rows, { link, hoveredId: 'c' }));
    expect(keysOf(out)).toEqual(['a:link-start', 'a:link-end', 'c:link-start', 'c:link-end']);
    expect(classesOf(out)).toEqual([
      'gantt-link-connector',
      'gantt-link-connector gantt-link-connector--source',
      'gantt-link-connector gantt-link-connector--target',
      'gantt-link-connector',
    ]);
    const invalid = computeBarOverlay(input(rows, { link: { ...link, valid: false } }));
    expect(classesOf(invalid)[2]).toBe('gantt-link-connector gantt-link-connector--invalid');
    // No target yet: the source only
    const none = computeBarOverlay(input(rows, { link: { ...link, targetId: null, targetSide: null } }));
    expect(keysOf(none)).toEqual(['a:link-start', 'a:link-end']);
    // A target whose side is undecided: no target modifier
    const undecided = computeBarOverlay(input(rows, { link: { ...link, targetSide: null } }));
    expect(classesOf(undecided).slice(2)).toEqual(['gantt-link-connector', 'gantt-link-connector']);
  });

  it('a link session keeps the focus ring (keyboard link mode)', () => {
    const link = { sourceId: 'a', sourceSide: 'end', targetId: 'n', targetSide: 'start', valid: true } as const;
    const out = computeBarOverlay(input(rows, { link, focusVisibleId: 'n' }));
    expect(keysOf(out)).toEqual(['a:link-start', 'a:link-end', 'n:ring', 'n:link-start', 'n:link-end']);
  });

  it('a self link onto its own source connector carries both modifiers', () => {
    const link = { sourceId: 'a', sourceSide: 'end', targetId: 'a', targetSide: 'end', valid: false } as const;
    const out = computeBarOverlay(input(rows, { link }));
    expect(classesOf(out)).toEqual([
      'gantt-link-connector',
      'gantt-link-connector gantt-link-connector--source gantt-link-connector--invalid',
    ]);
  });

  it('bars without connectors (not linkable) show no connector, even as the link target', () => {
    const plain = rowsOf(false).rows;
    const link = { sourceId: 'a', sourceSide: 'end', targetId: 'c', targetSide: 'start', valid: false } as const;
    expect(computeBarOverlay(input(plain, { link }))).toEqual([]);
  });
});
