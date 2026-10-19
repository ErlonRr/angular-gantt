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

describe('seedCollapsed — groupBar.collapsed', () => {
  const c = (id: string, parentId?: string, collapsed?: boolean) => ({ id, parentId, collapsed });

  it('collapses the new ids that have a child, in task order, with collapseGroups', () => {
    const tasks = [c('a', 'g'), c('g'), c('h'), c('b', 'h'), c('x', 'b'), c('leaf')];
    expect(seedCollapsed(tasks, undefined, true).collapse).toEqual(['g', 'h', 'b']);
    // Off (the default): only `collapsed: true`
    expect(seedCollapsed(tasks).collapse).toEqual([]);
    expect(seedCollapsed(tasks, undefined, false).collapse).toEqual([]);
  });

  it('lets an explicit collapsed: false keep a parent expanded, and collapsed: true still collapse a leaf', () => {
    const tasks = [c('g', undefined, false), c('a', 'g'), c('h'), c('b', 'h'), c('leaf', undefined, true)];
    expect(seedCollapsed(tasks, undefined, true).collapse).toEqual(['h', 'leaf']);
  });

  it('ignores a task that is its own parent and a parent id that is not in the list', () => {
    const tasks = [c('self', 'self'), c('orphan', 'missing'), c('', undefined)];
    expect(seedCollapsed(tasks, undefined, true).collapse).toEqual([]);
  });

  it('seeds only ids never seen: a parent seen before its first child stays expanded', () => {
    const page1 = seedCollapsed([c('g'), c('h'), c('b', 'h')], undefined, true);
    expect(page1.collapse).toEqual(['h']);
    // The next page brings g's children and a new group: only the new group collapses
    const page2 = seedCollapsed([c('g'), c('h'), c('b', 'h'), c('a', 'g'), c('k'), c('d', 'k')], page1.seen, true);
    expect(page2.collapse).toEqual(['k']);
    // The same list again (the user expanded k meanwhile): nothing to seed
    expect(seedCollapsed([c('k'), c('d', 'k')], page2.seen, true).collapse).toEqual([]);
  });
});
