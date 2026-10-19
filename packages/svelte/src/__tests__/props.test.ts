// @vitest-environment node
// `Gantry.svelte` destructures its props explicitly (bindings rule): every name of
// GANTRY_PROPERTIES and GANTRY_EVENTS must be there, or it would fall into `...rest` and reach the
// element as a stray attribute / an `on…` listener that never fires.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GANTRY_EVENTS, GANTRY_PROPERTIES } from '@gantryjs/vanilla';
import * as api from '../index';

const source = readFileSync(new URL('../Gantry.svelte', import.meta.url), 'utf8');

/** The names destructured from `$props()` */
function destructured(): string[] {
  const match = /let\s*\{([^}]*)\}\s*:\s*Props\s*=\s*\$props\(\)/.exec(source);
  if (!match) throw new Error('no `let { … }: Props = $props()` in Gantry.svelte');
  return match[1]!
    .split(',')
    .map(entry => /^\s*(?:\.\.\.)?\s*([A-Za-z_$][\w$]*)/.exec(entry)?.[1])
    .filter((name): name is string => name !== undefined);
}

describe('Gantry.svelte props', () => {
  it('destructures every GANTRY_PROPERTIES name', () => {
    const names = destructured();
    expect(GANTRY_PROPERTIES.filter(name => !names.includes(name))).toEqual([]);
  });

  it('destructures every GANTRY_EVENTS callback', () => {
    const names = destructured();
    expect(Object.values(GANTRY_EVENTS).filter(name => !names.includes(name))).toEqual([]);
  });

  it('destructures the Phase 11 editing callbacks', () => {
    expect(destructured()).toEqual(
      expect.arrayContaining([
        'onBeforeChange',
        'onTasksChange',
        'onTaskUpdated',
        'onTaskProgressChanged',
        'onDependencyCreated',
        'onDependencyDeleted',
        'onHistoryChange',
      ]),
    );
  });

  it('destructures the Phase 12 export callbacks', () => {
    expect(destructured()).toEqual(expect.arrayContaining(['onBeforeExport', 'onExport']));
  });

  it('destructures nothing else but element, the empty and children snippets, and the rest', () => {
    const known = new Set<string>([
      ...GANTRY_PROPERTIES,
      ...Object.values(GANTRY_EVENTS),
      'element',
      'empty',
      'children',
      'rest',
    ]);
    expect(destructured().filter(name => !known.has(name))).toEqual([]);
  });

  it('maps every GANTRY_PROPERTIES name to its own prop in the `properties` record', () => {
    for (const name of GANTRY_PROPERTIES) {
      expect(source, name).toMatch(new RegExp(`\\n\\s*${name}: \\(\\) => ${name},`));
    }
  });

  it('maps every GANTRY_EVENTS callback to its own prop in the `callbacks` record', () => {
    for (const name of Object.values(GANTRY_EVENTS)) {
      expect(source, name).toMatch(new RegExp(`\\n\\s*${name}: \\(\\) => ${name},`));
    }
  });

  it('copies only the data props: syncGroup and the others pass by identity', () => {
    const match = /const COPIED[^=]*=\s*new Set\(\[([^\]]*)\]\)/.exec(source);
    if (!match) throw new Error('no `const COPIED = new Set([…])` in Gantry.svelte');
    const copied = match[1]!.split(',').map(entry => entry.trim().replace(/^'|'$/g, ''));
    expect(copied).toEqual(['tasks', 'columns', 'annotations', 'options']);
    expect(copied).not.toContain('syncGroup');
  });

  it('destructures the snippets (never attributes) and leaves style to the rest', () => {
    const names = destructured();
    expect(names).toEqual(expect.arrayContaining(['empty', 'children']));
    // No default inline style to merge with: `style` reaches the element like any other attribute
    expect(names).not.toContain('style');
  });
});

describe('public API', () => {
  it('has named exports only: the component, the data source and @gantryjs/core', () => {
    expect(api).not.toHaveProperty('default');
    expect(typeof api.Gantry).toBe('function');
    expect(typeof api.GanttDataSource).toBe('function');
    expect(api.ViewMode.Week).toBe('Week');
    expect(typeof api.buildTimeline).toBe('function');
  });
});
