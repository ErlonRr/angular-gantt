// ─────────────────────────────────────────────────────────────
//  Tests — the toolbar's export group (Phase 12 step 2.6, D16): the
//  Export menu button after the views (`toolbar.export`), its format
//  items in `export.formats` order, `aria-expanded` from
//  `exportMenuOpen`, the Export menu model, the width estimate, and the
//  first group to move into More, where its items become a section
//  (never a nested menu). With `toolbar.export` off the model is the one
//  before Phase 12.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LABELS,
  type GanttExportFormat,
  type GanttOptions,
  type GanttView,
  type GanttZoomLevel,
} from '../types';
import { resolveConfig, type ResolvedToolbar } from '../render/config';
import { reduceMenu, toolbarMenuKey, TOOLBAR_MENU_CLOSED } from '../state/menu';
import {
  TOOLBAR_ICONS,
  TOOLBAR_OVERFLOW_ORDER,
  buildToolbar,
  estimateToolbarWidth,
  exportMenuSections,
  layoutToolbar,
  toolbarFocusMove,
  toolbarItems,
  toolbarMenuChecked,
  toolbarMenuItems,
  toolbarTabStop,
  type ToolbarGroup,
  type ToolbarInput,
  type ToolbarItem,
  type ToolbarLayout,
  type ToolbarLayoutInput,
  type ToolbarMenuSection,
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
  export: true,
  rowsToggle: false,
};
const LEVELS: GanttZoomLevel[] = ['Day', 'Week', 'Month'].map(name => ({ name, scales: [] }));
const FORMATS: readonly GanttExportFormat[] = ['svg', 'png', 'csv', 'print'];
const LABEL_OF = { svg: 'SVG image', png: 'PNG image', csv: 'CSV table', print: 'Print…' } as const;

const input = (over: Partial<ToolbarInput> = {}): ToolbarInput => ({
  toolbar: ALL,
  zoomLevels: LEVELS,
  labels: DEFAULT_LABELS,
  viewMode: 'Week',
  view: 'split',
  export: { formats: FORMATS },
  ...over,
});
const only = (toolbar: Partial<ResolvedToolbar>): ResolvedToolbar => ({
  ...ALL,
  zoom: false,
  viewModes: false,
  today: false,
  viewToggle: false,
  fit: false,
  undo: false,
  ...toolbar,
});

function layout(
  width: number,
  over: Partial<ToolbarLayoutInput> = {},
  build: Partial<ToolbarInput> = {},
): ToolbarLayout {
  return layoutToolbar({
    groups: buildToolbar(input(build)),
    width,
    controlSize: 32,
    overflow: 'menu',
    labels: DEFAULT_LABELS,
    ...over,
  });
}

/** The toolbar of a chart resolved from `options`, with the export input a binding passes. */
function fromOptions(options: GanttOptions, view?: GanttView): ToolbarGroup[] {
  const cfg = resolveConfig(options);
  return buildToolbar({
    toolbar: cfg.toolbar,
    zoomLevels: cfg.zoomLevels,
    labels: DEFAULT_LABELS,
    viewMode: cfg.level.name,
    view: view ?? cfg.view,
    export: { formats: cfg.export.formats },
  });
}

const exportGroup = (groups: readonly ToolbarGroup[]): ToolbarGroup | undefined => groups.find(g => g.key === 'export');
const exportButton = (groups: readonly ToolbarGroup[]): ToolbarItem | undefined => exportGroup(groups)?.items[0];
const keys = (groups: readonly { key: string }[] | null): string[] | null => groups?.map(g => g.key) ?? null;
const focusKeys = (items: readonly { focusKey: string }[]): string[] => items.map(i => i.focusKey);
const section = (menu: readonly ToolbarMenuSection[] | null, key: string): ToolbarMenuSection | undefined =>
  menu?.find(s => s.key === key);

// ─── When it shows ────────────────────────────────────────────

describe('export group: when it shows', () => {
  it('needs toolbar.export and at least one format', () => {
    expect(exportGroup(buildToolbar(input()))).toBeDefined();
    expect(exportGroup(buildToolbar(input({ export: { formats: ['csv'] } })))).toBeDefined();
    expect(exportGroup(buildToolbar(input({ export: null })))).toBeUndefined();
    expect(exportGroup(buildToolbar(input({ export: undefined })))).toBeUndefined();
    const { export: _, ...without } = input();
    expect(exportGroup(buildToolbar(without))).toBeUndefined();
    expect(exportGroup(buildToolbar(input({ export: { formats: [] } })))).toBeUndefined();
    expect(exportGroup(buildToolbar(input({ toolbar: { ...ALL, export: false } })))).toBeUndefined();
    expect(buildToolbar(input({ toolbar: false }))).toEqual([]);
  });

  it('follows the resolved config: toolbar.export (default off) and export.formats', () => {
    expect(exportGroup(fromOptions({}))).toBeUndefined();
    expect(exportGroup(fromOptions({ toolbar: { export: false } }))).toBeUndefined();
    expect(exportGroup(fromOptions({ toolbar: { export: true } }))?.menu?.map(i => i.focusKey)).toEqual([
      'export:svg',
      'export:png',
      'export:csv',
      'export:print',
    ]);
    expect(exportGroup(fromOptions({ toolbar: { export: true }, export: { formats: [] } }))).toBeUndefined();
    expect(
      exportGroup(fromOptions({ toolbar: { export: true }, export: { formats: ['print', 'csv'] } }))?.menu?.map(
        i => i.focusKey,
      ),
    ).toEqual(['export:print', 'export:csv']);
  });

  it('with toolbar.export off the groups and every layout are the ones before Phase 12', () => {
    const off: ResolvedToolbar = { ...ALL, export: false };
    const { export: _, ...plain } = input({ toolbar: off });
    for (const toolbar of [off, { ...off, panelToggle: true }, { ...off, viewModes: false as const }]) {
      const withInput = buildToolbar(input({ toolbar }));
      const before = buildToolbar({ ...plain, toolbar });
      expect(withInput).toEqual(before);
      expect(withInput.every(g => g.menu === null)).toBe(true);
      for (const width of [0, 40, 120, 200, 380, 600, 1100, 1400]) {
        for (const overflow of ['menu', 'wrap'] as const) {
          const base = { width, controlSize: 32, overflow, labels: DEFAULT_LABELS };
          const now = layoutToolbar({ ...base, groups: withInput, exportMenuOpen: true });
          expect(now).toEqual(layoutToolbar({ ...base, groups: before }));
          expect(now.exportMenu).toBeNull();
        }
      }
    }
    // The resolved default is off, so a chart's toolbar is unchanged
    expect(resolveConfig({}).toolbar).toMatchObject({ export: false });
    expect(fromOptions({})).toEqual(fromOptions({ export: { formats: ['svg'] } }));
  });
});

// ─── The button ───────────────────────────────────────────────

describe('export group: the Export button', () => {
  it('is the last group, after the views: a plain group with one icon menu button', () => {
    const groups = buildToolbar(input());
    expect(keys(groups)).toEqual(['zoom', 'levels', 'today', 'views', 'export']);
    const group = exportGroup(groups)!;
    expect(group).toMatchObject({
      key: 'export',
      className: 'gantt-tb-group gantt-tb-export-group',
      role: null,
      ariaLabel: null,
    });
    expect(group.items).toEqual([
      {
        focusKey: 'export',
        className: 'gantt-tb-btn gantt-tb-export',
        role: null,
        checked: null,
        icon: 'export',
        text: null,
        ariaLabel: 'Export',
        title: 'Export',
        pressed: null,
        haspopup: 'menu',
        expanded: false,
        disabled: null,
        action: { type: 'exportMenu' },
      },
    ]);
    expect(TOOLBAR_ICONS.export).toHaveLength(3);
  });

  it('follows whatever group comes last, and stands alone in a toolbar of its own', () => {
    expect(keys(buildToolbar(input({ toolbar: { ...ALL, viewToggle: false } })))).toEqual([
      'zoom',
      'levels',
      'today',
      'export',
    ]);
    const history = { canUndo: true, canRedo: false, undoLabel: 'x', redoLabel: null, undoCount: 1, redoCount: 0 };
    expect(keys(buildToolbar(input({ toolbar: { ...ALL, panelToggle: true }, history })))).toEqual([
      'panel',
      'history',
      'zoom',
      'levels',
      'today',
      'views',
      'export',
    ]);
    expect(keys(buildToolbar(input({ toolbar: only({}) })))).toEqual(['export']);
  });

  it('is named and titled by labels.exportMenu', () => {
    const labels = { ...DEFAULT_LABELS, exportMenu: 'Esporta' };
    expect(exportButton(buildToolbar(input({ labels })))).toMatchObject({ ariaLabel: 'Esporta', title: 'Esporta' });
  });

  it('joins the roving set (before More); its menu items do not', () => {
    const items = toolbarItems(buildToolbar(input()));
    expect(focusKeys(items).at(-1)).toBe('export');
    expect(focusKeys(items).some(k => k.startsWith('export:'))).toBe(false);
    expect(toolbarFocusMove(items, 'view:chart', 'move.right')).toBe('export');
    expect(toolbarFocusMove(items, 'export', 'move.right')).toBe('zoom-out');
    expect(toolbarFocusMove(items, 'zoom-out', 'move.end')).toBe('export');
    expect(toolbarTabStop(items, 'export')).toBe('export');
    expect(toolbarTabStop(toolbarItems(buildToolbar(input({ toolbar: only({}) }))), null)).toBe('export');
    // With More: More is last, Export before it while it still shows
    const narrow = layout(0);
    expect(focusKeys(toolbarItems(narrow.groups)).at(-1)).toBe('export');
  });
});

// ─── The menu items ───────────────────────────────────────────

describe('export group: the menu items', () => {
  it('one plain item per format, in formats order, named by the format labels', () => {
    const menu = exportGroup(buildToolbar(input({ export: { formats: ['print', 'csv', 'svg'] } })))!.menu!;
    expect(focusKeys(menu)).toEqual(['export:print', 'export:csv', 'export:svg']);
    expect(menu.map(i => i.text)).toEqual(['Print…', 'CSV table', 'SVG image']);
    expect(menu.map(i => i.action)).toEqual([
      { type: 'export', format: 'print' },
      { type: 'export', format: 'csv' },
      { type: 'export', format: 'svg' },
    ]);
    expect(menu[0]).toEqual({
      focusKey: 'export:print',
      className: 'gantt-tb-menu-item',
      role: null,
      checked: null,
      icon: null,
      text: 'Print…',
      ariaLabel: null,
      title: null,
      pressed: null,
      haspopup: null,
      expanded: null,
      disabled: null,
      action: { type: 'export', format: 'print' },
    });
  });

  it.each(FORMATS)('%s reads its own label', format => {
    const italian = { svg: 'Immagine SVG', png: 'Immagine PNG', csv: 'Tabella CSV', print: 'Stampa…' } as const;
    const labels = {
      ...DEFAULT_LABELS,
      exportSvg: italian.svg,
      exportPng: italian.png,
      exportCsv: italian.csv,
      exportPrint: italian.print,
    };
    const item = exportGroup(buildToolbar(input({ labels, export: { formats: [format] } })))!.menu![0];
    expect(item.text).toBe(italian[format]);
    expect(exportGroup(buildToolbar(input({ export: { formats: [format] } })))!.menu![0].text).toBe(LABEL_OF[format]);
  });

  it('skips repeated and unknown formats (focus keys stay unique)', () => {
    const formats = ['csv', 'pdf', 'csv', 'png'] as unknown as GanttExportFormat[];
    const menu = exportGroup(buildToolbar(input({ export: { formats } })))!.menu!;
    expect(focusKeys(menu)).toEqual(['export:csv', 'export:png']);
    expect(exportGroup(buildToolbar(input({ export: { formats: ['pdf'] as unknown as GanttExportFormat[] } })))).toBe(
      undefined,
    );
  });

  it('every other group has no menu', () => {
    const groups = buildToolbar(input({ toolbar: { ...ALL, panelToggle: true } }));
    expect(groups.filter(g => g.menu !== null).map(g => g.key)).toEqual(['export']);
    expect(layout(200).groups.find(g => g.key === 'more')?.menu).toBeNull();
  });
});

// ─── The Export menu ──────────────────────────────────────────

describe('layoutToolbar — the Export menu', () => {
  const expected: ToolbarMenuSection[] = [
    {
      key: 'export',
      className: 'gantt-tb-menu-group',
      ariaLabel: null,
      items: FORMATS.map(format => ({
        focusKey: `menu:export:${format}`,
        className: 'gantt-tb-menu-item',
        role: 'menuitem' as const,
        checked: null,
        icon: null,
        text: LABEL_OF[format],
        action: { type: 'export' as const, format },
      })),
    },
  ];

  it.each([1400, 1100, 0, Number.NaN])('%s px: one unnamed section of menuitems, the More menu stays null', width => {
    const out = layout(width);
    expect(out.exportMenu).toEqual(expected);
    expect(out.menu).toBeNull();
    expect(keys(out.groups)).toEqual(['zoom', 'levels', 'today', 'views', 'export']);
  });

  it("'wrap' keeps the Export menu at every width (nothing moves)", () => {
    for (const width of [1400, 600, 200, 40]) {
      const out = layout(width, { overflow: 'wrap' });
      expect(out.exportMenu).toEqual(expected);
      expect(out.menu).toBeNull();
    }
  });

  it('is exportMenuSections(the export group); [] for a group without a menu', () => {
    const groups = buildToolbar(input());
    expect(exportMenuSections(exportGroup(groups)!)).toEqual(expected);
    for (const g of groups.filter(g => g.key !== 'export')) expect(exportMenuSections(g)).toEqual([]);
  });

  it('opens on the first item (nothing is checked) and moves with the More menu reducer and keys', () => {
    const items = toolbarMenuItems(layout(1100).exportMenu);
    expect(focusKeys(items)).toEqual(FORMATS.map(f => `menu:export:${f}`));
    expect(toolbarMenuChecked(items)).toBe(-1);
    const n = items.length;
    const open = reduceMenu(TOOLBAR_MENU_CLOSED, { type: 'open', via: 'click', checked: -1 }, n);
    expect(open).toEqual({ state: { open: true, active: 0 }, focus: 'item' });
    const up = reduceMenu(TOOLBAR_MENU_CLOSED, toolbarMenuKey({ key: 'ArrowUp' }, 'button')!, n);
    expect(up.state.active).toBe(n - 1);
    const wrap = reduceMenu(up.state, toolbarMenuKey({ key: 'ArrowDown' }, 'menu')!, n);
    expect(wrap.state.active).toBe(0);
    expect(reduceMenu(wrap.state, { type: 'select' }, n)).toEqual({ state: TOOLBAR_MENU_CLOSED, focus: 'button' });
  });

  it('aria-expanded follows exportMenuOpen; the other groups stay the same objects', () => {
    const groups = buildToolbar(input());
    const base = { groups, width: 1100, controlSize: 32, overflow: 'menu' as const, labels: DEFAULT_LABELS };
    const closed = layoutToolbar(base);
    closed.groups.forEach((g, i) => expect(g).toBe(groups[i]));
    expect(exportButton(closed.groups)?.expanded).toBe(false);
    expect(exportButton(layoutToolbar({ ...base, exportMenuOpen: false }).groups)?.expanded).toBe(false);

    const open = layoutToolbar({ ...base, exportMenuOpen: true });
    expect(exportButton(open.groups)?.expanded).toBe(true);
    open.groups.filter(g => g.key !== 'export').forEach(g => expect(groups).toContain(g));
    expect(exportButton(groups)?.expanded).toBe(false); // the input is not mutated
    expect(open.exportMenu).toEqual(closed.exportMenu);
    // Independent of the More menu's flag, also while unmeasured
    expect(exportButton(layoutToolbar({ ...base, menuOpen: true }).groups)?.expanded).toBe(false);
    expect(exportButton(layoutToolbar({ ...base, width: 0, exportMenuOpen: true }).groups)?.expanded).toBe(true);
    // An expanded input is closed again when the menu is not open
    expect(exportButton(layoutToolbar({ ...base, groups: open.groups }).groups)?.expanded).toBe(false);
  });
});

// ─── Overflow ─────────────────────────────────────────────────

describe('estimateToolbarWidth — the export group', () => {
  it('counts one separator and one icon button; the formats (a popup) count nothing', () => {
    for (const controlSize of [28, 32, 36]) {
      const m = { controlSize };
      const without = estimateToolbarWidth(buildToolbar(input({ export: null })), m);
      const one = estimateToolbarWidth(buildToolbar(input({ export: { formats: ['svg'] } })), m);
      expect(one - without).toBe(10 + 11 + Math.max(controlSize, 16 + 2 * 8));
      expect(estimateToolbarWidth(buildToolbar(input()), m)).toBe(one);
    }
    // Alone: the toolbar's padding and the button
    expect(estimateToolbarWidth(buildToolbar(input({ toolbar: only({}) })), { controlSize: 32 })).toBe(20 + 32);
  });

  it('a toolbar that fits by the estimate keeps the Export button; one px less moves it first', () => {
    const groups = buildToolbar(input());
    const fit = estimateToolbarWidth(groups, { controlSize: 32 });
    expect(layout(fit).menu).toBeNull();
    expect(keys(layout(fit).groups)).toContain('export');
    const out = layout(fit - 1);
    // Export and More are the same size, so swapping one for the other frees nothing: the zoom
    // levels follow it. The sections keep the display order.
    expect(keys(out.menu)).toEqual(['levels', 'export']);
    expect(keys(out.groups)).toEqual(['zoom', 'today', 'views', 'more']);
    expect(out.exportMenu).toBeNull();
  });
});

describe('layoutToolbar — narrow: the export group moves into More first, as a section', () => {
  it('becomes a section named by the Export button, with the Export menu items', () => {
    const labels = { ...DEFAULT_LABELS, exportMenu: 'Esporta', exportCsv: 'Tabella CSV' };
    const wide = layout(1400, {}, { labels });
    const out = layout(200, { labels: { more: 'Altro' } }, { labels });
    const moved = section(out.menu, 'export')!;
    expect(moved).toEqual({
      key: 'export',
      className: 'gantt-tb-menu-group',
      ariaLabel: 'Esporta',
      items: wide.exportMenu![0].items,
    });
    expect(moved.items.find(i => i.focusKey === 'menu:export:csv')?.text).toBe('Tabella CSV');
    expect(out.groups.at(-1)?.items[0]).toMatchObject({ focusKey: 'more', ariaLabel: 'Altro' });
  });

  it('never nests a menu: no Export button in the toolbar, the roving set or the More menu', () => {
    for (let width = 1400; width >= 40; width -= 20) {
      const out = layout(width, { exportMenuOpen: true });
      const items = toolbarMenuItems(out.menu);
      expect(items.some(i => i.action.type === 'exportMenu')).toBe(false);
      expect(focusKeys(items)).not.toContain('menu:export');
      const inToolbar = exportGroup(out.groups) !== undefined;
      expect(inToolbar).toBe(out.exportMenu !== null);
      expect(inToolbar).toBe(section(out.menu, 'export') === undefined);
      if (!inToolbar) expect(focusKeys(toolbarItems(out.groups))).not.toContain('export');
      // Only the menu buttons have a popup
      for (const item of toolbarItems(out.groups)) {
        expect(item.haspopup !== null).toBe(item.focusKey === 'export' || item.focusKey === 'more');
      }
    }
  });

  it('moves first and no more than needed; the More sections keep the display order', () => {
    const groups = buildToolbar(input());
    let movedBefore = 0;
    for (let width = 1400; width >= 40; width -= 10) {
      const out = layout(width);
      const moved = keys(out.menu) ?? [];
      expect(moved.length).toBeGreaterThanOrEqual(movedBefore);
      movedBefore = moved.length;
      if (!moved.length) continue;
      // A prefix of the overflow order, the export group first
      const order = TOOLBAR_OVERFLOW_ORDER.filter(k => groups.some(g => g.key === k));
      expect(order.slice(0, moved.length).sort()).toEqual([...moved].sort());
      expect(moved).toContain('export');
      // Display order
      expect(moved).toEqual(groups.map(g => g.key).filter(k => moved.includes(k)));
    }
    expect(keys(layout(40).menu)).toEqual(['levels', 'today', 'views', 'export']);
    expect(keys(layout(40).groups)).toEqual(['zoom', 'more']);
  });

  it('moves alone when nothing else can (and the rest wraps)', () => {
    const toolbar = only({ zoom: true, fit: true });
    const out = layout(60, {}, { toolbar });
    expect(keys(out.groups)).toEqual(['zoom', 'more']);
    expect(keys(out.menu)).toEqual(['export']);
    expect(focusKeys(toolbarMenuItems(out.menu))).toEqual(FORMATS.map(f => `menu:export:${f}`));
  });

  it('closes nothing by itself: an open Export menu that moved simply has no menu to show', () => {
    const out = layout(200, { exportMenuOpen: true, menuOpen: true });
    expect(out.exportMenu).toBeNull();
    expect(out.groups.at(-1)?.items[0]?.expanded).toBe(true);
  });

  it('keeps every focus key unique across the toolbar, the More menu and the Export menu', () => {
    for (let width = 1400; width >= 40; width -= 20) {
      const out = layout(width, {}, { toolbar: { ...ALL, panelToggle: true } });
      const all = [
        ...focusKeys(toolbarItems(out.groups)),
        ...focusKeys(toolbarMenuItems(out.menu)),
        ...focusKeys(toolbarMenuItems(out.exportMenu)),
      ];
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('works on the resolved config in every density', () => {
    for (const density of ['compact', 'normal', 'comfortable'] as const) {
      const cfg = resolveConfig({ density, toolbar: { export: true } });
      const groups = fromOptions({ density, toolbar: { export: true } });
      const base = { groups, controlSize: cfg.controlSize, overflow: cfg.toolbar ? cfg.toolbar.overflow : 'menu' };
      const wide = layoutToolbar({ ...base, width: 1400, labels: DEFAULT_LABELS });
      expect(wide.menu).toBeNull();
      expect(toolbarMenuItems(wide.exportMenu)).toHaveLength(4);
      const narrow = layoutToolbar({ ...base, width: 300, labels: DEFAULT_LABELS });
      expect(keys(narrow.menu)).toContain('export');
      expect(narrow.exportMenu).toBeNull();
    }
  });
});
