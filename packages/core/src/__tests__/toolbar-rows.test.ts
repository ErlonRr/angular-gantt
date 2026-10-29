// ─────────────────────────────────────────────────────────────
//  Tests — the toolbar's rows toggle (Phase 14 step 1.1, D4, D24): one
//  aria-pressed icon button after the panel toggle, only with
//  `toolbar.rowsToggle` and resources, in the roving set, counted by the
//  width estimate and never moved into the More menu. Everything is
//  unchanged while the toggle is off (D18).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { DEFAULT_LABELS, type GanttZoomLevel } from '../types';
import { resolveConfig, type ResolvedToolbar } from '../render/config';
import { resolveKey } from '../interaction/keymap';
import {
  TOOLBAR_ICONS,
  TOOLBAR_OVERFLOW_ORDER,
  buildToolbar,
  estimateToolbarWidth,
  layoutToolbar,
  toggleRowsMode,
  toolbarFocusMove,
  toolbarItems,
  toolbarMenuItems,
  toolbarTabStop,
  type ToolbarGroup,
  type ToolbarInput,
} from '../state/toolbar';

const ALL: ResolvedToolbar = {
  zoom: true,
  viewModes: ['Day', 'Week', 'Month'],
  today: true,
  viewToggle: true,
  fit: true,
  panelToggle: false,
  overflow: 'menu',
  undo: true,
  export: false,
  rowsToggle: true,
};
const LEVELS: GanttZoomLevel[] = ['Day', 'Week', 'Month'].map(name => ({ name, scales: [] }));

const input = (over: Partial<ToolbarInput> = {}): ToolbarInput => ({
  toolbar: ALL,
  zoomLevels: LEVELS,
  labels: DEFAULT_LABELS,
  viewMode: 'Week',
  view: 'split',
  hasResources: true,
  rows: 'tasks',
  ...over,
});
const rowsGroup = (groups: readonly ToolbarGroup[]) => groups.find(g => g.key === 'rows');
const keysOf = (items: readonly { focusKey: string }[]): string[] => items.map(i => i.focusKey);

describe('rows toggle: when it shows', () => {
  it('needs toolbar.rowsToggle and resources', () => {
    expect(rowsGroup(buildToolbar(input()))).toBeDefined();
    expect(rowsGroup(buildToolbar(input({ hasResources: false })))).toBeUndefined();
    expect(rowsGroup(buildToolbar(input({ hasResources: undefined })))).toBeUndefined();
    expect(rowsGroup(buildToolbar(input({ toolbar: { ...ALL, rowsToggle: false } })))).toBeUndefined();
    expect(buildToolbar(input({ toolbar: false }))).toEqual([]);
  });

  it('is off by default: the resolved toolbar has rowsToggle false', () => {
    const toolbar = resolveConfig({}).toolbar;
    expect(toolbar === false ? null : toolbar.rowsToggle).toBe(false);
    expect(resolveConfig({ toolbar: { rowsToggle: true } }).toolbar).toMatchObject({ rowsToggle: true });
    expect(resolveConfig({ toolbar: { rowsToggle: undefined } }).toolbar).toMatchObject({ rowsToggle: false });
  });

  it('leaves the toolbar of today untouched while it is off (D18)', () => {
    const off = { ...ALL, rowsToggle: false };
    const plain: ToolbarInput = {
      toolbar: off,
      zoomLevels: LEVELS,
      labels: DEFAULT_LABELS,
      viewMode: 'Week',
      view: 'split',
    };
    const groups = buildToolbar(plain);
    expect(groups.map(g => g.key)).toEqual(['zoom', 'levels', 'today', 'views']);
    // `rows` / `hasResources` alone change nothing
    expect(buildToolbar({ ...plain, rows: 'resources', hasResources: true })).toEqual(groups);
  });
});

describe('rows toggle: the button', () => {
  it('is one pressed-state icon button in its own group right after the panel group', () => {
    const groups = buildToolbar(input({ toolbar: { ...ALL, panelToggle: true } }));
    expect(groups.map(g => g.key).slice(0, 3)).toEqual(['panel', 'rows', 'zoom']);
    const group = rowsGroup(groups)!;
    expect(group).toMatchObject({
      className: 'gantt-tb-group gantt-tb-rows-group',
      role: null,
      ariaLabel: null,
      menu: null,
    });
    expect(group.items).toEqual([
      {
        focusKey: 'rows',
        className: 'gantt-tb-btn gantt-tb-rows',
        role: null,
        checked: null,
        icon: 'resources',
        text: null,
        ariaLabel: 'Show resources',
        title: 'Show resources',
        pressed: false,
        haspopup: null,
        expanded: null,
        disabled: null,
        action: { type: 'rows' },
      },
    ]);
    expect(TOOLBAR_ICONS.resources.length).toBeGreaterThan(0);
  });

  it('comes first without the panel toggle, and before Undo / Redo', () => {
    const history = { canUndo: true, canRedo: false, undoLabel: 'x', redoLabel: null, undoCount: 1, redoCount: 0 };
    expect(buildToolbar(input()).map(g => g.key)).toEqual(['rows', 'zoom', 'levels', 'today', 'views']);
    expect(buildToolbar(input({ history, toolbar: { ...ALL, panelToggle: true } })).map(g => g.key)).toEqual([
      'panel',
      'rows',
      'history',
      'zoom',
      'levels',
      'today',
      'views',
    ]);
  });

  it('is pressed in resource mode; its name and title stay the same', () => {
    const tasks = rowsGroup(buildToolbar(input({ rows: 'tasks' })))!.items[0];
    const resources = rowsGroup(buildToolbar(input({ rows: 'resources' })))!.items[0];
    expect([tasks.pressed, tasks.title, tasks.ariaLabel]).toEqual([false, 'Show resources', 'Show resources']);
    expect([resources.pressed, resources.title, resources.ariaLabel]).toEqual([
      true,
      'Show resources',
      'Show resources',
    ]);
    // Omitted `rows` is tasks mode
    expect(rowsGroup(buildToolbar(input({ rows: undefined })))!.items[0].pressed).toBe(false);
  });

  it('names the button from the labels', () => {
    const labels = { ...DEFAULT_LABELS, showResources: 'Risorse', showTasks: 'Attività' };
    const tasks = rowsGroup(buildToolbar(input({ labels })))!.items[0];
    const resources = rowsGroup(buildToolbar(input({ labels, rows: 'resources' })))!.items[0];
    expect([tasks.ariaLabel, tasks.title, resources.ariaLabel, resources.title]).toEqual([
      'Risorse',
      'Risorse',
      'Risorse',
      'Risorse',
    ]);
  });

  it('toggleRowsMode flips between the two modes', () => {
    expect(toggleRowsMode('tasks')).toBe('resources');
    expect(toggleRowsMode('resources')).toBe('tasks');
  });

  it('is pure: the same input gives the same groups', () => {
    expect(buildToolbar(input({ rows: 'resources' }))).toEqual(buildToolbar(input({ rows: 'resources' })));
  });

  it('leaves every other control without a pressed state, but the panel toggle', () => {
    for (const item of toolbarItems(buildToolbar(input({ toolbar: { ...ALL, panelToggle: true } })))) {
      if (item.focusKey !== 'rows' && item.focusKey !== 'panel') expect(item.pressed).toBeNull();
    }
  });
});

describe('rows toggle: roving focus', () => {
  it('belongs to the roving set, after the panel toggle', () => {
    const list = toolbarItems(buildToolbar(input({ toolbar: { ...ALL, panelToggle: true } })));
    expect(keysOf(list).slice(0, 3)).toEqual(['panel', 'rows', 'zoom-out']);
    const move = (from: string, key: string) => toolbarFocusMove(list, from, resolveKey({ key }, 'toolbar') as never);
    expect(move('panel', 'ArrowRight')).toBe('rows');
    expect(move('rows', 'ArrowRight')).toBe('zoom-out');
    expect(move('zoom-out', 'ArrowLeft')).toBe('rows');
    expect(move('rows', 'ArrowLeft')).toBe('panel');
  });

  it('is the tab stop when it is the first control', () => {
    expect(toolbarTabStop(toolbarItems(buildToolbar(input())), null)).toBe('rows');
    expect(toolbarTabStop(toolbarItems(buildToolbar(input())), 'today')).toBe('today');
  });
});

describe('rows toggle: width and overflow', () => {
  const controlSize = 32;

  it('estimateToolbarWidth counts the group: separator + one icon button', () => {
    const groups = buildToolbar(input());
    const without = buildToolbar(input({ hasResources: false }));
    // Group gap 10 + separator 11, one 32 px icon button
    expect(estimateToolbarWidth(groups, { controlSize }) - estimateToolbarWidth(without, { controlSize })).toBe(
      10 + 11 + 32,
    );
  });

  it('is never in the overflow order', () => {
    expect(TOOLBAR_OVERFLOW_ORDER).not.toContain('rows');
  });

  it('never moves into the More menu, at any width', () => {
    const groups = buildToolbar(input({ toolbar: { ...ALL, panelToggle: true } }));
    const full = estimateToolbarWidth(groups, { controlSize });
    for (let width = 1; width <= full + 40; width += 7) {
      const out = layoutToolbar({ groups, width, controlSize, overflow: 'menu', labels: DEFAULT_LABELS });
      expect(out.groups.slice(0, 2).map(g => g.key)).toEqual(['panel', 'rows']);
      expect(rowsGroup(out.groups)).toBe(rowsGroup(groups));
      expect(out.menu?.some(s => s.key === 'rows') ?? false).toBe(false);
      expect(keysOf(toolbarMenuItems(out.menu)).includes('menu:rows')).toBe(false);
    }
  });

  it('its width can push other groups into the menu (the estimate includes it)', () => {
    const groups = buildToolbar(input());
    const without = buildToolbar(input({ hasResources: false }));
    const width = estimateToolbarWidth(without, { controlSize });
    const fits = layoutToolbar({ groups: without, width, controlSize, overflow: 'menu', labels: DEFAULT_LABELS });
    expect(fits.menu).toBeNull();
    const out = layoutToolbar({ groups, width, controlSize, overflow: 'menu', labels: DEFAULT_LABELS });
    expect(out.menu?.length).toBeGreaterThan(0);
    expect(out.groups.some(g => g.key === 'rows')).toBe(true);
    expect(estimateToolbarWidth(out.groups, { controlSize })).toBeLessThanOrEqual(width);
  });

  it("'wrap' keeps every group, rows included", () => {
    const groups = buildToolbar(input());
    const out = layoutToolbar({ groups, width: 50, controlSize, overflow: 'wrap', labels: DEFAULT_LABELS });
    expect(out).toEqual({ groups, menu: null, exportMenu: null });
  });
});
