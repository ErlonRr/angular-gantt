// ─────────────────────────────────────────────────────────────
//  Tests — vertical virtual-scroll window (render/virtual.ts)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { computeVirtualWindow, isIndexMounted, virtualIndexes } from '../render/virtual';

describe('computeVirtualWindow', () => {
  it('mounts the viewport plus overscan and sizes the spacers', () => {
    // rows 10..15 visible (scrollTop 400 / 40 = 10, (400 + 200) / 40 = 15), overscan 4
    expect(computeVirtualWindow(400, 40, 200, 100, 4)).toEqual({
      first: 6,
      last: 19,
      paddingTop: 6 * 40,
      paddingBottom: (100 - 19 - 1) * 40,
      pinnedBefore: [],
      pinnedAfter: [],
    });
  });

  it('defaults the overscan to 4 rows', () => {
    const w = computeVirtualWindow(400, 40, 200, 100);
    expect([w.first, w.last]).toEqual([6, 19]);
  });

  it('clamps at the top and the bottom of the list', () => {
    const top = computeVirtualWindow(0, 40, 200, 100, 4);
    expect([top.first, top.paddingTop]).toEqual([0, 0]);
    const bottom = computeVirtualWindow(100 * 40, 40, 200, 100, 4);
    expect([bottom.last, bottom.paddingBottom]).toEqual([99, 0]);
  });

  it('keeps first..last plus the spacers equal to the full list height', () => {
    for (const scrollTop of [0, 13, 399, 400, 401, 2500, 3999]) {
      const w = computeVirtualWindow(scrollTop, 40, 300, 100, 3);
      expect(w.paddingTop + (w.last - w.first + 1) * 40 + w.paddingBottom).toBe(100 * 40);
    }
  });

  it('mounts everything for empty lists or a non-positive item height', () => {
    expect(computeVirtualWindow(0, 40, 200, 0)).toEqual({
      first: 0,
      last: 0,
      paddingTop: 0,
      paddingBottom: 0,
      pinnedBefore: [],
      pinnedAfter: [],
    });
    expect(computeVirtualWindow(500, 0, 200, 12, 4, [11])).toEqual({
      first: 0,
      last: 11,
      paddingTop: 0,
      paddingBottom: 0,
      pinnedBefore: [],
      pinnedAfter: [],
    });
  });

  it('reports pinned rows outside the window, sorted and unique', () => {
    const w = computeVirtualWindow(400, 40, 200, 100, 4, [90, 2, 10, 2, 0, 19, 20, 6, 5]);
    expect([w.first, w.last]).toEqual([6, 19]);
    expect(w.pinnedBefore).toEqual([0, 2, 5]);
    expect(w.pinnedAfter).toEqual([20, 90]);
  });

  it('accepts any iterable and ignores out-of-range or fractional indexes', () => {
    const w = computeVirtualWindow(400, 40, 200, 100, 4, new Set([-1, 1.5, 100, Number.NaN, 3, 99]));
    expect(w.pinnedBefore).toEqual([3]);
    expect(w.pinnedAfter).toEqual([99]);
  });

  it('does not change the spacers when rows are pinned', () => {
    const plain = computeVirtualWindow(1200, 32, 480, 500, 4);
    const pinned = computeVirtualWindow(1200, 32, 480, 500, 4, [0, 499]);
    expect({ ...pinned, pinnedBefore: [], pinnedAfter: [] }).toEqual(plain);
  });
});

describe('virtualIndexes / isIndexMounted', () => {
  it('lists pinned-before, the window, then pinned-after', () => {
    const w = computeVirtualWindow(400, 40, 200, 100, 0, [1, 50]);
    expect(virtualIndexes(w, 100)).toEqual([1, 10, 11, 12, 13, 14, 15, 50]);
  });

  it('mounts nothing for an empty list and everything for a short one', () => {
    expect(virtualIndexes(computeVirtualWindow(0, 40, 200, 0), 0)).toEqual([]);
    expect(virtualIndexes(computeVirtualWindow(0, 40, 200, 3), 3)).toEqual([0, 1, 2]);
  });

  it('answers mount membership', () => {
    const w = computeVirtualWindow(400, 40, 200, 100, 0, [1, 50]);
    expect([1, 10, 15, 50].every(i => isIndexMounted(w, i, 100))).toBe(true);
    expect([0, 2, 9, 16, 49, 51].some(i => isIndexMounted(w, i, 100))).toBe(false);
  });

  it('mounts nothing outside the list, matching virtualIndexes', () => {
    const empty = computeVirtualWindow(0, 40, 200, 0);
    expect(isIndexMounted(empty, 0, 0)).toBe(false);
    const short = computeVirtualWindow(0, 40, 200, 3);
    expect([0, 1, 2].every(i => isIndexMounted(short, i, 3))).toBe(true);
    expect([-1, 3, Number.NaN].some(i => isIndexMounted(short, i, 3))).toBe(false);
  });
});
