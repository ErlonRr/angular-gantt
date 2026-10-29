import { describe, expect, it } from 'vitest';
import {
  computeResourceUtilization,
  dateReadingOf,
  indexResources,
  resolveConfig,
  resourceRowId,
} from '@gantryjs/core';
import { createDemoData } from '@gantryjs/core/demo';
import { loadResources } from '../gallery';
import {
  PLAYGROUND_DEFAULTS,
  PLAYGROUND_SECTIONS,
  changedKeys,
  controlEnabled,
  decodeState,
  encodeState,
  playgroundCode,
  playgroundOptions,
  playgroundResources,
  withPlaygroundResources,
  withValue,
  type PlaygroundKey,
  type PlaygroundState,
} from '../playground';
import { FRAMEWORKS } from '../site';

const TODAY = new Date(2026, 9, 14);
const SECTION = PLAYGROUND_SECTIONS.find(s => s.title === 'Resources');
const RESOURCES: PlaygroundState = { ...PLAYGROUND_DEFAULTS, rows: 'resources' };
/** Every Resources control away from its default. */
const CHANGED: PlaygroundState = {
  ...RESOURCES,
  resUnassigned: false,
  resOverallocation: false,
  rowsToggle: true,
};
const SUB_KEYS: PlaygroundKey[] = ['resUnassigned', 'resOverallocation'];
const control = (key: PlaygroundKey) => PLAYGROUND_SECTIONS.flatMap(s => s.controls).find(c => c.key === key)!;
const toolbarOf = (s: PlaygroundState) => {
  const toolbar = resolveConfig(playgroundOptions(s, TODAY)).toolbar;
  return toolbar === false ? null : toolbar;
};

describe('playground: Resources section', () => {
  it('follows Working calendar with the Rows switch, then one control per field', () => {
    const titles = PLAYGROUND_SECTIONS.map(s => s.title);
    expect(titles.indexOf('Resources')).toBe(titles.indexOf('Working calendar') + 1);
    expect(SECTION?.controls.map(c => [c.key, c.kind, c.option])).toEqual([
      ['rows', 'segmented', 'rows'],
      ['resUnassigned', 'check', 'resourceView.unassigned'],
      ['resOverallocation', 'check', 'resourceView.overallocation'],
      ['rowsToggle', 'check', 'toolbar.rowsToggle'],
    ]);
    const rows = control('rows');
    expect(rows.kind === 'segmented' && rows.choices).toEqual([
      ['tasks', 'Tasks'],
      ['resources', 'Resources'],
    ]);
  });

  it('starts from the core defaults: task rows, the Unassigned row and the highlight once the view is on, no toggle', () => {
    expect(PLAYGROUND_DEFAULTS.rows).toBe('tasks');
    const core = resolveConfig({ rows: 'resources' });
    expect(resolveConfig(playgroundOptions(PLAYGROUND_DEFAULTS, TODAY)).rows).toBe('tasks');
    expect(PLAYGROUND_DEFAULTS.resUnassigned).toBe(core.resourceView.unassigned);
    expect(PLAYGROUND_DEFAULTS.resOverallocation).toBe(core.resourceView.overallocation);
    const coreToolbar = resolveConfig({}).toolbar;
    expect(PLAYGROUND_DEFAULTS.rowsToggle).toBe(coreToolbar === false ? false : coreToolbar.rowsToggle);
    // Every default fits its control
    for (const c of SECTION?.controls ?? []) {
      expect(withValue(CHANGED, c.key, PLAYGROUND_DEFAULTS[c.key])[c.key], c.key).toBe(PLAYGROUND_DEFAULTS[c.key]);
    }
  });

  it('leaves the options of the defaults as they were: nothing set, the same row height', () => {
    const options = playgroundOptions(PLAYGROUND_DEFAULTS, TODAY);
    expect(options.rows).toBeUndefined();
    expect(Object.values(options.resourceView ?? {}).every(v => v === undefined)).toBe(true);
    expect(options.toolbar && options.toolbar.rowsToggle).toBeUndefined();
    const config = resolveConfig(options);
    expect(config.rowHeight).toBe(resolveConfig({ ...options, rows: undefined, resourceView: undefined }).rowHeight);
    expect(toolbarOf(PLAYGROUND_DEFAULTS)?.rowsToggle).toBe(false);
  });

  it('disables the sub-controls until the resource view can be shown', () => {
    for (const key of SUB_KEYS) {
      expect(controlEnabled(control(key), PLAYGROUND_DEFAULTS), key).toBe(false);
      expect(controlEnabled(control(key), RESOURCES), key).toBe(true);
      expect(controlEnabled(control(key), { ...PLAYGROUND_DEFAULTS, rowsToggle: true }), `${key} (toggle)`).toBe(true);
    }
    expect(controlEnabled(control('rows'), PLAYGROUND_DEFAULTS)).toBe(true);
    expect(controlEnabled(control('rowsToggle'), PLAYGROUND_DEFAULTS)).toBe(true);
  });

  it('maps each control to the option the chart resolves', () => {
    const config = resolveConfig(playgroundOptions(RESOURCES, TODAY));
    expect(config.rows).toBe('resources');
    // A resource row is 1.5 rows high
    expect(config.rowHeight).toBe(
      Math.round(resolveConfig(playgroundOptions(PLAYGROUND_DEFAULTS, TODAY)).rowHeight * 1.5),
    );
    expect(config.resourceView).toMatchObject({ unassigned: true, overallocation: true });
    const changed = playgroundOptions(CHANGED, TODAY);
    expect(changed.rows).toBe('resources');
    expect(changed.resourceView).toEqual({ unassigned: false, overallocation: false });
    expect(resolveConfig(changed).resourceView).toMatchObject({ unassigned: false, overallocation: false });
    expect(toolbarOf(CHANGED)?.rowsToggle).toBe(true);
    // Each field alone
    expect(playgroundOptions({ ...PLAYGROUND_DEFAULTS, resUnassigned: false }, TODAY).resourceView?.unassigned).toBe(
      false,
    );
    expect(
      playgroundOptions({ ...PLAYGROUND_DEFAULTS, resOverallocation: false }, TODAY).resourceView?.overallocation,
    ).toBe(false);
  });

  it('round-trips through a link and drops invalid values', () => {
    expect(changedKeys(CHANGED)).toEqual(['rows', 'resUnassigned', 'resOverallocation', 'rowsToggle']);
    expect(decodeState(encodeState(CHANGED))).toEqual(CHANGED);
    const forged = btoa(JSON.stringify({ rows: 'lanes', resUnassigned: 'no', resOverallocation: 0, rowsToggle: null }));
    expect(decodeState(forged)).toEqual(PLAYGROUND_DEFAULTS);
  });

  it('prints the section only once the resource view can be shown, then only the changed fields, in every framework', () => {
    for (const { id } of FRAMEWORKS) {
      const plain = playgroundCode(PLAYGROUND_DEFAULTS, id, TODAY);
      for (const word of ['rows', 'resourceView', 'rowsToggle', 'unassigned', 'overallocation']) {
        expect(plain, `${id} ${word}`).not.toMatch(new RegExp(`\\b${word}:`));
      }
      expect(plain, id).not.toMatch(/resources/i);
      expect(playgroundCode(RESOURCES, id, TODAY), id).toContain("rows: 'resources'");
      expect(playgroundCode(RESOURCES, id, TODAY), id).not.toContain('resourceView');
      expect(playgroundCode({ ...RESOURCES, resUnassigned: false }, id, TODAY), id).toContain(
        'resourceView: { unassigned: false }',
      );
      expect(playgroundCode({ ...RESOURCES, resOverallocation: false }, id, TODAY), id).toContain(
        'resourceView: { overallocation: false }',
      );
      expect(playgroundCode({ ...PLAYGROUND_DEFAULTS, rowsToggle: true }, id, TODAY), id).toContain('rowsToggle: true');
      const code = playgroundCode(CHANGED, id, TODAY);
      expect(code, id).toContain("rows: 'resources'");
      expect(code, id).toContain('resourceView: { unassigned: false, overallocation: false }');
      expect(code, id).toContain('toolbar: { rowsToggle: true }');
      expect(code, id).not.toContain('undefined');
    }
  });

  it('hands the chart its resources in the code, in the syntax of each framework', () => {
    const snippets: Record<string, RegExp[]> = {
      html: [/chart\.resources = resources;/],
      js: [/chart\.resources = resources;/],
      react: [/type GanttResource/, /resources: GanttResource\[\]/, /<Gantry tasks=\{tasks\} resources=\{resources\}/],
      vue: [/type GanttResource/, /resources: GanttResource\[\]/, /:resources="resources"/],
      angular: [
        /type GanttResource/,
        /\[resources\]="resources\(\)"/,
        /resources = input\.required<GanttResource\[\]>\(\)/,
      ],
      svelte: [/type GanttResource/, /resources: GanttResource\[\]/, /<Gantry \{tasks\} \{resources\}/],
    };
    expect(FRAMEWORKS.map(f => f.id).sort()).toEqual(Object.keys(snippets).sort());
    for (const { id } of FRAMEWORKS) {
      for (const state of [RESOURCES, { ...PLAYGROUND_DEFAULTS, rowsToggle: true }]) {
        const code = playgroundCode(state, id, TODAY);
        for (const snippet of snippets[id]) expect(code, `${id} ${snippet}`).toMatch(snippet);
      }
    }
  });
});

describe('playground: resources for the demo plan', () => {
  const demo = createDemoData();
  const tasks = withPlaygroundResources(demo.tasks);
  const resources = playgroundResources();

  it('are the gallery’s five, a fresh array each time', () => {
    expect(resources).toEqual(loadResources());
    expect(playgroundResources()).not.toBe(resources);
  });

  it('assign known resources to work tasks only, and leave the demo plan untouched', () => {
    const known = new Set(resources.map(r => r.id));
    for (const t of tasks) {
      for (const a of t.resources ?? []) expect(known.has(typeof a === 'string' ? a : a.resourceId), t.id).toBe(true);
    }
    expect(tasks.map(t => t.id)).toEqual(demo.tasks.map(t => t.id));
    expect(demo.tasks.every(t => t.resources === undefined)).toBe(true);
    // Groups and milestones carry no assignments
    for (const id of ['p1', 'p1-b', 'p2', 'ms-p1', 'ms-p2'])
      expect(tasks.find(t => t.id === id)?.resources, id).toBeUndefined();
    expect(tasks.find(t => t.id === 'p2-b')?.resources).toBeUndefined();
  });

  it('make the resource view worth looking at: over-allocated rows and an Unassigned row', () => {
    const options = playgroundOptions(RESOURCES, TODAY);
    const dates = dateReadingOf(resolveConfig(options));
    const { rows } = computeResourceUtilization(tasks, indexResources(resources), dates, { unassigned: true });
    const over = resources.filter(r => (rows.get(resourceRowId(r.id))?.overDays ?? 0) > 0).map(r => r.id);
    expect(over).toEqual(['ana', 'bo', 'di']);
    expect(rows.get('unassigned')?.tasks).toBe(1);
  });
});
