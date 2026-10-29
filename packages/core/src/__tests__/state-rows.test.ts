// ─────────────────────────────────────────────────────────────
//  Tests — `GanttState.rows` (Phase 14 step 1.1, D4, D16): an additive,
//  validated key of the persisted state. The version stays 2 and a
//  state without `rows` serialises exactly as before (D18).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  GANTT_STATE_VERSION,
  normalizeState,
  parseState,
  readStoredState,
  serializeState,
  writeStoredState,
  type GanttState,
  type GanttStateStorage,
} from '../index';

const memory = (): GanttStateStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

describe('GanttState.rows', () => {
  it('keeps the version at 2 (an additive key: no migration)', () => {
    expect(GANTT_STATE_VERSION).toBe(2);
    expect(JSON.parse(serializeState({ rows: 'resources' }))).toEqual({ v: 2, rows: 'resources' });
  });

  it('serialises a state without `rows` exactly as before (D18)', () => {
    expect(serializeState({})).toBe('{"v":2}');
    expect(serializeState({ view: 'chart', panelWidth: 300 })).toBe('{"v":2,"panelWidth":300,"view":"chart"}');
    expect(serializeState({ rows: undefined })).toBe('{"v":2}');
  });

  it('round-trips both values', () => {
    for (const rows of ['tasks', 'resources'] as const) {
      const state: GanttState = { view: 'split', viewMode: 'Week', rows };
      expect(parseState(serializeState(state))).toEqual(state);
      expect(normalizeState(state)).toEqual(state);
    }
  });

  it('drops anything else', () => {
    for (const rows of ['Resources', 'task', '', 1, true, null, {}, [], 'constructor', '__proto__']) {
      expect(normalizeState({ rows }), JSON.stringify(rows)).toEqual({});
      expect(parseState(JSON.stringify({ v: 2, rows, view: 'chart' })), JSON.stringify(rows)).toEqual({
        view: 'chart',
      });
    }
  });

  it('a v2 snapshot saved before Phase 14 still loads, and a legacy one too', () => {
    expect(parseState('{"v":2,"view":"table","viewMode":"Month"}')).toEqual({ view: 'table', viewMode: 'Month' });
    expect(parseState('{"panelCollapsed":true}')).toEqual({ panelCollapsed: true, view: 'chart' });
    expect(parseState('{"v":1,"rows":"resources"}')).toEqual({ rows: 'resources' });
  });

  it('is stored and read back under a state key', () => {
    const storage = memory();
    expect(writeStoredState(storage, 'plan', { rows: 'resources', collapsedIds: ['team:eng'] })).toBe(true);
    expect(readStoredState(storage, 'plan')).toEqual({ rows: 'resources', collapsedIds: ['team:eng'] });
    expect(storage.data.get('gantry:plan')).toBe('{"v":2,"collapsedIds":["team:eng"],"rows":"resources"}');
  });

  it('puts `rows` last among the keys, so older snapshots keep their order', () => {
    expect(serializeState({ rows: 'tasks', sort: null, view: 'split' })).toBe(
      '{"v":2,"view":"split","sort":null,"rows":"tasks"}',
    );
  });
});
