// ─────────────────────────────────────────────────────────────
//  Tests — Phase 14 contract (step 1.1): the `rows` / `resourceView` /
//  `toolbar.rowsToggle` options and their resolved defaults, the row height
//  of the resource rows (D2), the `overallocatedColor` theme token (D10),
//  the new labels (D20) and the types at the package root. `rows` unset
//  keeps the resolved config of Phase 13 (D18).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, expectTypeOf } from 'vitest';
import * as core from '../index';
import {
  DEFAULT_LABELS,
  DarkTheme,
  LegacyDarkTheme,
  LegacyLightTheme,
  LightTheme,
  MIN_RESOURCE_ROW_HEIGHT,
  THEME_CSS_VARS,
  contrastRatio,
  resolveConfig,
  resolvePaint,
  resolveTheme,
  themeToCss,
  themeVar,
  type BuiltinColumnKey,
  type GanttAssignment,
  type GanttDensity,
  type GanttLabels,
  type GanttOptions,
  type GanttResource,
  type GanttResourceViewOptions,
  type GanttRowsMode,
  type GanttState,
  type GanttTask,
  type GanttTheme,
  type ResolvedResourceView,
  type TooltipModel,
} from '../index';

const DENSITIES: [GanttDensity, number, number][] = [
  ['compact', 28, 42],
  ['normal', 36, 54],
  ['comfortable', 44, 66],
];

describe('rows: defaults (D4, D18)', () => {
  it('is tasks mode with the resource view on, and no rows toggle', () => {
    const cfg = resolveConfig({});
    expect(cfg.rows).toBe('tasks');
    expect(cfg.resourceView).toEqual({ unassigned: true, overallocation: true, rowHeight: 54 });
    expect(cfg.toolbar === false ? null : cfg.toolbar.rowsToggle).toBe(false);
    expect(cfg.rowHeight).toBe(36);
  });

  it.each(DENSITIES)(
    "%s: the row height is the density's, %i px, whatever the resource options say",
    (density, row) => {
      expect(resolveConfig({ density }).rowHeight).toBe(row);
      expect(resolveConfig({ density, rows: 'tasks' }).rowHeight).toBe(row);
      expect(resolveConfig({ density, resourceView: { rowHeight: 90, unassigned: false } }).rowHeight).toBe(row);
      expect(resolveConfig({ density, toolbar: { rowsToggle: true } }).rowHeight).toBe(row);
      // An explicit `rowHeight` still wins in tasks mode
      expect(resolveConfig({ density, rowHeight: 50 }).rowHeight).toBe(50);
    },
  );

  it('rows unset is rows: tasks: the same resolved config', () => {
    for (const options of [{}, { density: 'compact' }, { rowHeight: 40, view: 'chart' }] as GanttOptions[]) {
      expect(resolveConfig({ ...options, rows: 'tasks' })).toEqual(resolveConfig(options));
      expect(resolveConfig({ ...options, rows: undefined })).toEqual(resolveConfig(options));
    }
  });

  it('reads an unknown `rows` as tasks', () => {
    for (const rows of ['Resources', 'resource', '', null, 1, {}, true]) {
      expect(resolveConfig({ rows: rows as never }).rows, JSON.stringify(rows)).toBe('tasks');
    }
  });
});

describe('rows: resources (D2)', () => {
  it.each(DENSITIES)('%s: a resource row is 1.5 × the row height, %i → %i px', (density, row, resource) => {
    const cfg = resolveConfig({ density, rows: 'resources' });
    expect(cfg.rows).toBe('resources');
    expect(cfg.resourceView.rowHeight).toBe(resource);
    expect(cfg.rowHeight).toBe(resource);
  });

  it('1.5 × an explicit rowHeight, rounded, 28 px at least', () => {
    expect(resolveConfig({ rows: 'resources', rowHeight: 40 }).rowHeight).toBe(60);
    expect(resolveConfig({ rows: 'resources', rowHeight: 33 }).rowHeight).toBe(50);
    expect(resolveConfig({ rows: 'resources', rowHeight: 20 }).rowHeight).toBe(30);
    expect(resolveConfig({ rows: 'resources', rowHeight: 10 }).rowHeight).toBe(MIN_RESOURCE_ROW_HEIGHT);
    expect(MIN_RESOURCE_ROW_HEIGHT).toBe(28);
  });

  it('keeps an explicit resourceView.rowHeight of 28 px or more', () => {
    expect(resolveConfig({ rows: 'resources', resourceView: { rowHeight: 80 } }).rowHeight).toBe(80);
    expect(resolveConfig({ rows: 'resources', resourceView: { rowHeight: 28 } }).rowHeight).toBe(28);
    expect(resolveConfig({ rows: 'resources', resourceView: { rowHeight: 28.5 } }).rowHeight).toBe(28.5);
    expect(resolveConfig({ resourceView: { rowHeight: 80 } }).resourceView.rowHeight).toBe(80);
  });

  it.each([27.9, 0, -40, NaN, Infinity, -Infinity, '60', null, {}])(
    'falls back to the default for a resourceView.rowHeight of %s',
    value => {
      const cfg = resolveConfig({ rows: 'resources', resourceView: { rowHeight: value as never } });
      expect(cfg.resourceView.rowHeight).toBe(54);
      expect(cfg.rowHeight).toBe(54);
    },
  );

  it('the options of the resource view are booleans that default to true', () => {
    expect(resolveConfig({ resourceView: {} }).resourceView).toMatchObject({ unassigned: true, overallocation: true });
    expect(resolveConfig({ resourceView: { unassigned: false } }).resourceView).toMatchObject({
      unassigned: false,
      overallocation: true,
    });
    expect(resolveConfig({ resourceView: { overallocation: false } }).resourceView).toMatchObject({
      unassigned: true,
      overallocation: false,
    });
    expect(resolveConfig({ resourceView: { unassigned: undefined, overallocation: undefined } }).resourceView).toEqual({
      unassigned: true,
      overallocation: true,
      rowHeight: 54,
    });
  });

  it('is orthogonal to the view and the zoom level', () => {
    const cfg = resolveConfig({ rows: 'resources', view: 'table', viewMode: 'Month' });
    expect(cfg).toMatchObject({ rows: 'resources', view: 'table' });
    expect(cfg.level.name).toBe('Month');
  });

  it('the toolbar flag follows toolbar.rowsToggle', () => {
    const on = resolveConfig({ toolbar: { rowsToggle: true } }).toolbar;
    expect(on === false ? null : on.rowsToggle).toBe(true);
    expect(resolveConfig({ toolbar: false }).toolbar).toBe(false);
  });
});

describe('theme: overallocatedColor (D10)', () => {
  it('is the last theme token, --gantt-overallocated', () => {
    expect(THEME_CSS_VARS.at(-1)).toEqual(['overallocatedColor', '--gantt-overallocated']);
    expect(themeVar('overallocatedColor')).toBe('var(--gantt-overallocated)');
  });

  it('has a light and a dark colour, kept by the legacy palettes', () => {
    expect(LightTheme.overallocatedColor).toBe('#C2410C');
    expect(DarkTheme.overallocatedColor).toBe('#FB923C');
    expect(LegacyLightTheme.overallocatedColor).toBe(LightTheme.overallocatedColor);
    expect(LegacyDarkTheme.overallocatedColor).toBe(DarkTheme.overallocatedColor);
  });

  it('reaches the CSS variables and resolves as a paint', () => {
    for (const theme of [LightTheme, DarkTheme, LegacyLightTheme, LegacyDarkTheme]) {
      expect(new Map(themeToCss(theme)).get('--gantt-overallocated')).toBe(theme.overallocatedColor);
      expect(resolvePaint(themeVar('overallocatedColor'), theme)).toBe(theme.overallocatedColor);
    }
  });

  it('is overridable, and an undefined override keeps the palette colour', () => {
    expect(resolveTheme(false, { overallocatedColor: '#FF0000' }).overallocatedColor).toBe('#FF0000');
    expect(resolveTheme(true, { overallocatedColor: undefined }).overallocatedColor).toBe(DarkTheme.overallocatedColor);
    expect(resolveTheme(false).overallocatedColor).toBe(LightTheme.overallocatedColor);
  });

  it.each([
    ['LightTheme', LightTheme],
    ['DarkTheme', DarkTheme],
    ['LegacyLightTheme', LegacyLightTheme],
    ['LegacyDarkTheme', LegacyDarkTheme],
  ])('%s: at least 3:1 (WCAG 1.4.11) on the row and chart backgrounds', (_, theme) => {
    for (const bg of [theme.rowBg, theme.rowBgAlt, theme.backgroundColor]) {
      expect(contrastRatio(theme.overallocatedColor, bg), bg).toBeGreaterThanOrEqual(3);
    }
  });

  it('differs from the bar colour, so the load above capacity stands out', () => {
    for (const theme of [LightTheme, DarkTheme]) expect(theme.overallocatedColor).not.toBe(theme.barColor);
  });
});

describe('labels (D20)', () => {
  it('has the new texts', () => {
    expect(DEFAULT_LABELS).toMatchObject({
      colResources: 'Resources',
      colCapacity: 'Capacity',
      colLoad: 'Peak load',
      resUnassigned: 'Unassigned',
      showResources: 'Show resources',
      showTasks: 'Show tasks',
      ttResLoad: 'Load',
      ttResCapacity: 'Capacity',
      ttResOver: 'Over capacity',
    });
  });

  it('words the "+n more" row, the errors and the accessible name of a resource row', () => {
    expect(DEFAULT_LABELS.ttResMore(3)).toBe('+3 more');
    expect(DEFAULT_LABELS.errorUnknownResource('Zed')).toBe('No resource “Zed”');
    expect(DEFAULT_LABELS.errorAmbiguousResource('Sam')).toBe('More than one resource is called “Sam”: use its ID');
    expect(DEFAULT_LABELS.describeResource('Ana', 100, 150, 0)).toBe(
      'Ana, capacity 100%, peak load 150%, never over capacity',
    );
    expect(DEFAULT_LABELS.describeResource('Ana', 100, 150, 1)).toBe(
      'Ana, capacity 100%, peak load 150%, 1 day over capacity',
    );
    expect(DEFAULT_LABELS.describeResource('Bo', 50, 100, 12)).toBe(
      'Bo, capacity 50%, peak load 100%, 12 days over capacity',
    );
  });

  it('resolveConfig and the options accept them as partial labels', () => {
    const options: GanttOptions = { labels: { showResources: 'Risorse', ttResMore: n => `altri ${n}` } };
    expect(options.labels?.ttResMore?.(2)).toBe('altri 2');
    expect(resolveConfig(options).rows).toBe('tasks');
  });
});

describe('types and package root', () => {
  it('the resource model', () => {
    expectTypeOf<GanttResource>().toEqualTypeOf<{
      id: string;
      name: string;
      capacity?: number | undefined;
      group?: string | undefined;
      color?: string | undefined;
      data?: Record<string, unknown> | undefined;
    }>();
    expectTypeOf<GanttAssignment>().toEqualTypeOf<string | { resourceId: string; units?: number | undefined }>();
    expectTypeOf<GanttTask['resources']>().toEqualTypeOf<GanttAssignment[] | undefined>();
    expectTypeOf<GanttRowsMode>().toEqualTypeOf<'tasks' | 'resources'>();
  });

  it('the options, the resolved config and the state', () => {
    expectTypeOf<GanttOptions['rows']>().toEqualTypeOf<GanttRowsMode | undefined>();
    expectTypeOf<GanttOptions['resourceView']>().toEqualTypeOf<GanttResourceViewOptions | undefined>();
    expectTypeOf<GanttState['rows']>().toEqualTypeOf<GanttRowsMode | undefined>();
    expectTypeOf(resolveConfig({}).rows).toEqualTypeOf<GanttRowsMode>();
    expectTypeOf(resolveConfig({}).resourceView).toEqualTypeOf<ResolvedResourceView>();
    expectTypeOf<ResolvedResourceView>().toEqualTypeOf<{
      unassigned: boolean;
      overallocation: boolean;
      rowHeight: number;
    }>();
  });

  it('the columns, the tooltip, the theme and the labels', () => {
    expectTypeOf<'resources' | 'capacity' | 'load'>().toExtend<BuiltinColumnKey>();
    expectTypeOf<'resource'>().toExtend<TooltipModel['kind']>();
    expectTypeOf<GanttTheme['overallocatedColor']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<GanttLabels['describeResource']>().toEqualTypeOf<
      (name: string, capacity: number, peak: number, overDays: number) => string
    >();
    expectTypeOf<GanttLabels['ttResMore']>().toEqualTypeOf<(n: number) => string>();
    expectTypeOf<GanttLabels['errorUnknownResource']>().toEqualTypeOf<(ref: string) => string>();
  });

  it('the helpers are exported at the package root', () => {
    expect(typeof core.toggleRowsMode).toBe('function');
    expect(typeof core.flattenTree).toBe('function');
    expect(core.MIN_RESOURCE_ROW_HEIGHT).toBe(28);
    expect(core.RESOURCE_ROW_HEIGHT_FACTOR).toBe(1.5);
  });
});
