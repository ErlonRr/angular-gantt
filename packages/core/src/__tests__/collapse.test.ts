// ─────────────────────────────────────────────────────────────
//  Tests — `task.collapsed` seeds the ids a chart has never seen
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { seedCollapsed } from '../state/collapse';

const t = (id: string, collapsed?: boolean) => ({ id, collapsed });

describe('seedCollapsed', () => {
  it('collapses the new ids with collapsed: true, in task order, and records every id', () => {
    const seed = seedCollapsed([t('g', true), t('a'), t('h', true), t('b', false)]);
    expect(seed.collapse).toEqual(['g', 'h']);
    expect([...seed.seen]).toEqual(['g', 'a', 'h', 'b']);
  });

  it('leaves an id seen before alone: a new array, a reset or an empty list in between', () => {
    const first = seedCollapsed([t('g', true), t('a')]);
    // The same tasks again (a new array, a data-source reset)
    const again = seedCollapsed([t('g', true), t('a')], first.seen);
    expect(again.collapse).toEqual([]);
    expect(again.seen).toBe(first.seen);

    // Through an empty list: 'g' is still known, so the user's expand state stays
    const empty = seedCollapsed([], again.seen);
    expect(empty.collapse).toEqual([]);
    expect(empty.seen).toBe(first.seen);
    expect(seedCollapsed([t('g', true), t('a')], empty.seen).collapse).toEqual([]);
  });

  it('seeds only the new ids of a later list, without changing the set passed in', () => {
    const first = seedCollapsed([t('g', true)]);
    const next = seedCollapsed([t('g', true), t('h', true), t('c')], first.seen);
    expect(next.collapse).toEqual(['h']);
    expect([...next.seen]).toEqual(['g', 'h', 'c']);
    expect([...first.seen]).toEqual(['g']);
  });

  it('reads a repeated id once (its first occurrence)', () => {
    const seed = seedCollapsed([t('g', true), t('g', true), t('x'), t('x', true)]);
    expect(seed.collapse).toEqual(['g']);
    expect([...seed.seen]).toEqual(['g', 'x']);
  });
});
