// ─────────────────────────────────────────────────────────────
//  Tests — versioned UI state persistence
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  GANTT_STATE_VERSION,
  normalizeState,
  parseState,
  readStoredState,
  serializeState,
  stateStorageKey,
  writeStoredState,
  type GanttStateStorage,
} from '../state/persistence';
import type { GanttState } from '../types';

const FULL: GanttState = {
  panelWidth: 320,
  panelCollapsed: false,
  view: 'split',
  viewMode: 'week',
  columnWidths: { name: 200, start: 96.5 },
  collapsedIds: ['p1', 'p2'],
  sort: { key: 'start', dir: 'desc' },
};

function memoryStorage(): GanttStateStorage & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

describe('stateStorageKey', () => {
  it('prefixes the key with gantry:', () => {
    expect(stateStorageKey('plan')).toBe('gantry:plan');
  });
});

describe('serializeState / parseState round trip', () => {
  it('writes version 2 and restores every field', () => {
    const raw = serializeState(FULL);
    expect(JSON.parse(raw)).toMatchObject({ v: 2 });
    expect(GANTT_STATE_VERSION).toBe(2);
    expect(parseState(raw)).toEqual(FULL);
  });

  it('keeps sort: null and omits undefined fields', () => {
    const state: GanttState = { view: 'table', sort: null, panelWidth: undefined };
    const raw = serializeState(state);
    expect(JSON.parse(raw)).toEqual({ v: 2, view: 'table', sort: null });
    expect(parseState(raw)).toEqual({ view: 'table', sort: null });
  });

  it('round-trips an empty state', () => {
    expect(parseState(serializeState({}))).toEqual({});
  });

  it('drops invalid fields when serialising', () => {
    const bad = { ...FULL, panelWidth: Number.NaN } as GanttState;
    expect(JSON.parse(serializeState(bad))).not.toHaveProperty('panelWidth');
  });

  it('rejects invalid in-memory input on the write path, then round-trips the rest', () => {
    const bad = {
      panelWidth: -1,
      panelCollapsed: 'no',
      view: 'grid',
      viewMode: '',
      columnWidths: { name: 120, start: Number.POSITIVE_INFINITY },
      collapsedIds: ['a', 1],
      sort: { key: 'name', dir: 'sideways' },
      v: 9,
      extra: true,
    } as unknown as GanttState;
    const raw = serializeState(bad);
    expect(JSON.parse(raw)).toEqual({ v: 2, columnWidths: { name: 120 }, collapsedIds: ['a'] });
    expect(parseState(raw)).toEqual({ columnWidths: { name: 120 }, collapsedIds: ['a'] });
  });

  it('is stable: serialise -> parse -> serialise gives the same JSON', () => {
    const raw = serializeState(FULL);
    const again = parseState(raw);
    expect(again).not.toBeNull();
    expect(serializeState(again ?? {})).toBe(raw);
  });
});

describe('parseState — legacy input', () => {
  it('accepts an unversioned v1 snapshot (raw JSON.stringify of GanttState)', () => {
    expect(parseState(JSON.stringify(FULL))).toEqual(FULL);
  });

  it('accepts an explicit v: 1 snapshot', () => {
    expect(parseState(JSON.stringify({ v: 1, ...FULL }))).toEqual(FULL);
  });

  it('derives view from panelCollapsed when a v1 snapshot has no view', () => {
    expect(parseState(JSON.stringify({ panelCollapsed: true }))).toEqual({ panelCollapsed: true, view: 'chart' });
    expect(parseState(JSON.stringify({ panelCollapsed: false }))).toEqual({ panelCollapsed: false, view: 'split' });
  });

  it('derives view the same way for v2 snapshots, and never overrides a stored view', () => {
    expect(parseState(JSON.stringify({ v: 2, panelCollapsed: true }))).toEqual({ panelCollapsed: true, view: 'chart' });
    expect(parseState(JSON.stringify({ v: 2, panelCollapsed: true, view: 'table' }))).toEqual({
      panelCollapsed: true,
      view: 'table',
    });
  });
});

describe('parseState — corrupted input', () => {
  it.each([null, undefined, '', '{', 'not json', 'null', '42', '"text"', 'true', '[1,2]'])(
    'returns null for %j',
    raw => {
      expect(parseState(raw)).toBeNull();
    },
  );

  it('returns null for unknown versions', () => {
    expect(parseState(JSON.stringify({ v: 3, view: 'split' }))).toBeNull();
    expect(parseState(JSON.stringify({ v: '2', view: 'split' }))).toBeNull();
    expect(parseState(JSON.stringify({ v: 0 }))).toBeNull();
    expect(parseState('{"v":null}')).toBeNull();
    expect(parseState('{"v":null,"view":"split"}')).toBeNull();
  });
});

describe('parseState — partially invalid fields', () => {
  it('drops each invalid field and keeps the valid ones', () => {
    const raw = JSON.stringify({
      v: 2,
      panelWidth: -10,
      panelCollapsed: 'yes',
      view: 'grid',
      viewMode: 'month',
      columnWidths: { name: 180, start: 0, end: -5, progress: 'wide', owner: null },
      collapsedIds: ['a', 7, null, 'b'],
      sort: { key: 'name', dir: 'up' },
      extra: 'ignored',
    });
    expect(parseState(raw)).toEqual({
      viewMode: 'month',
      columnWidths: { name: 180 },
      collapsedIds: ['a', 'b'],
    });
  });

  it.each([0, -1, '320', null, true])('drops panelWidth %j', panelWidth => {
    expect(parseState(JSON.stringify({ v: 2, panelWidth, view: 'chart' }))).toEqual({ view: 'chart' });
  });

  it('drops non-finite panelWidth from in-memory values', () => {
    expect(normalizeState({ panelWidth: Number.POSITIVE_INFINITY })).toEqual({});
    expect(normalizeState({ panelWidth: Number.NaN })).toEqual({});
  });

  it('drops an empty viewMode and non-string viewMode', () => {
    expect(parseState(JSON.stringify({ v: 2, viewMode: '' }))).toEqual({});
    expect(parseState(JSON.stringify({ v: 2, viewMode: 3 }))).toEqual({});
  });

  it('drops non-object columnWidths and non-array collapsedIds', () => {
    expect(parseState(JSON.stringify({ v: 2, columnWidths: [100], collapsedIds: 'a' }))).toEqual({});
    expect(parseState(JSON.stringify({ v: 2, columnWidths: 100, collapsedIds: { 0: 'a' } }))).toEqual({});
  });

  it('accepts both sort directions and null, rejects malformed sort', () => {
    expect(parseState(JSON.stringify({ v: 2, sort: { key: 'a', dir: 'asc' } }))).toEqual({
      sort: { key: 'a', dir: 'asc' },
    });
    expect(parseState(JSON.stringify({ v: 2, sort: null }))).toEqual({ sort: null });
    expect(parseState(JSON.stringify({ v: 2, sort: { key: 1, dir: 'asc' } }))).toEqual({});
    expect(parseState(JSON.stringify({ v: 2, sort: 'name' }))).toEqual({});
  });

  it('strips extra keys from sort', () => {
    expect(parseState(JSON.stringify({ v: 2, sort: { key: 'a', dir: 'desc', x: 1 } }))).toEqual({
      sort: { key: 'a', dir: 'desc' },
    });
  });

  it('drops a __proto__ column key and keeps a plain prototype', () => {
    // numeric, so it would survive the width filter if the key were not dropped explicitly
    const state = parseState('{"v":2,"columnWidths":{"__proto__":50,"name":90}}');
    expect(state).toEqual({ columnWidths: { name: 90 } });
    expect(Object.getPrototypeOf(state?.columnWidths)).toBe(Object.prototype);
    expect(Object.hasOwn(state?.columnWidths ?? {}, '__proto__')).toBe(false);
  });
});

describe('readStoredState / writeStoredState', () => {
  it('writes versioned JSON under the prefixed key and reads it back', () => {
    const storage = memoryStorage();
    expect(writeStoredState(storage, 'plan', FULL)).toBe(true);
    expect(JSON.parse(storage.items.get('gantry:plan') ?? '')).toMatchObject({ v: 2 });
    expect(readStoredState(storage, 'plan')).toEqual(FULL);
    expect(readStoredState(() => storage, 'plan')).toEqual(FULL);
  });

  it('reads a legacy snapshot written by older releases', () => {
    const storage = memoryStorage();
    storage.setItem('gantry:plan', JSON.stringify({ panelWidth: 280, panelCollapsed: true }));
    expect(readStoredState(storage, 'plan')).toEqual({ panelWidth: 280, panelCollapsed: true, view: 'chart' });
  });

  it('returns null / false when storage is missing or throws', () => {
    const throwing: GanttStateStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(readStoredState(undefined, 'plan')).toBeNull();
    expect(readStoredState(() => null, 'plan')).toBeNull();
    expect(readStoredState(throwing, 'plan')).toBeNull();
    expect(
      readStoredState(() => {
        throw new Error('SecurityError');
      }, 'plan'),
    ).toBeNull();
    expect(writeStoredState(null, 'plan', FULL)).toBe(false);
    expect(writeStoredState(throwing, 'plan', FULL)).toBe(false);
  });

  it('writes through a getter source and returns false when the getter fails (SSR)', () => {
    const storage = memoryStorage();
    expect(writeStoredState(() => storage, 'plan', FULL)).toBe(true);
    expect(readStoredState(() => storage, 'plan')).toEqual(FULL);
    expect(
      writeStoredState(
        () => {
          throw new ReferenceError('window is not defined');
        },
        'plan',
        FULL,
      ),
    ).toBe(false);
    expect(writeStoredState(() => undefined, 'plan', FULL)).toBe(false);
  });

  it('writes a validated snapshot: invalid fields never reach storage', () => {
    const storage = memoryStorage();
    const bad = { view: 'grid', panelWidth: 0, viewMode: 'day' } as unknown as GanttState;
    expect(writeStoredState(storage, 'plan', bad)).toBe(true);
    expect(JSON.parse(storage.items.get('gantry:plan') ?? '')).toEqual({ v: 2, viewMode: 'day' });
    expect(readStoredState(storage, 'plan')).toEqual({ viewMode: 'day' });
  });

  it('returns null for a missing key', () => {
    expect(readStoredState(memoryStorage(), 'none')).toBeNull();
  });
});
