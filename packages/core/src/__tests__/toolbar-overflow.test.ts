// ─────────────────────────────────────────────────────────────
//  Tests — toolbar overflow (Phase 10, step 2.5): the width estimate,
//  `layoutToolbar` (zoom levels, then views, then today into the More
//  menu; 'wrap' never builds one), the More button and the menu model.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { DEFAULT_LABELS, type GanttOptions, type GanttView, type GanttZoomLevel } from '../types';
import { resolveConfig, type ResolvedToolbar } from '../render/config';
import {
  TOOLBAR_FONT_PX,
  TOOLBAR_OVERFLOW_ORDER,
  buildToolbar,
  estimateToolbarWidth,
  layoutToolbar,
  toolbarItems,
  toolbarMenuChecked,
  toolbarMenuItems,
  toolbarTabStop,
  type ToolbarGroup,
  type ToolbarLayoutInput,
} from '../state/toolbar';

/** The toolbar of a chart resolved from `options` (every built-in level, the three views). */
function defaults(options: GanttOptions = {}, view?: GanttView): { groups: ToolbarGroup[]; controlSize: number } {
  const cfg = resolveConfig(options);
  return {
    groups: buildToolbar({
      toolbar: cfg.toolbar,
      zoomLevels: cfg.zoomLevels,
      labels: DEFAULT_LABELS,
      viewMode: cfg.level.name,
      view: view ?? cfg.view,
    }),
    controlSize: cfg.controlSize,
  };
}

function layout(width: number, over: Partial<ToolbarLayoutInput> = {}, options: GanttOptions = {}) {
  const { groups, controlSize } = defaults(options);
  return layoutToolbar({ groups, width, controlSize, overflow: 'menu', labels: DEFAULT_LABELS, ...over });
}

const keys = (groups: readonly { key: string }[] | null): string[] | null => groups?.map(g => g.key) ?? null;

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
};
const LEVELS: GanttZoomLevel[] = ['Day', 'Week', 'Month'].map(name => ({ name, scales: [] }));
const small = (toolbar: ResolvedToolbar, view: GanttView = 'split'): ToolbarGroup[] =>
  buildToolbar({ toolbar, zoomLevels: LEVELS, labels: DEFAULT_LABELS, viewMode: 'Week', view });

// ─── Estimate ─────────────────────────────────────────────────

describe('estimateToolbarWidth', () => {
  const only = (toolbar: Partial<ResolvedToolbar>): ToolbarGroup[] =>
    small({ ...ALL, zoom: false, viewModes: false, today: false, viewToggle: false, fit: false, ...toolbar });

  it('is 0 without groups', () => {
    expect(estimateToolbarWidth([], { controlSize: 32 })).toBe(0);
  });

  it('counts the toolbar padding, the controls, their gaps and the separators between groups', () => {
    // 10 + fit (16 icon + 2 × 7 padding + 2 × 1 border = 32) + 10
    expect(estimateToolbarWidth(only({ fit: true }), { controlSize: 32 })).toBe(52);
    // + 2 more icon buttons and two 2 px gaps
    expect(estimateToolbarWidth(only({ zoom: true, fit: true }), { controlSize: 32 })).toBe(20 + 3 * 32 + 2 * 2);
    // Two groups: + 10 gap + 10 padding + 1 border
    expect(estimateToolbarWidth(only({ fit: true, viewToggle: true }), { controlSize: 32 })).toBe(
      20 + 32 + 21 + (3 * 32 + 2 * 2),
    );
  });

  it('sizes text by its glyphs at fontPx and keeps every control at least controlSize', () => {
    // Today: icon 16 + gap 6 + "Today" (5 × 0.6 em × 12 px = 36) + 16 = 74
    expect(estimateToolbarWidth(only({ today: true }), { controlSize: 32 })).toBe(20 + 74);
    // At 16 px: 5 × 0.6 × 16 = 48
    expect(estimateToolbarWidth(only({ today: true }), { controlSize: 32, fontPx: 16 })).toBe(20 + 16 + 6 + 48 + 16);
    expect(TOOLBAR_FONT_PX).toBe(12);
    // Icon buttons grow with the control size, never below it
    expect(estimateToolbarWidth(only({ fit: true }), { controlSize: 44 })).toBe(20 + 44);
    expect(estimateToolbarWidth(only({ fit: true }), { controlSize: 28 })).toBe(20 + 32);
  });

  it('counts wide (CJK) glyphs as 1 em and combining marks as nothing', () => {
    const today = (todayButton: string): number =>
      estimateToolbarWidth(
        buildToolbar({
          toolbar: { ...ALL, zoom: false, viewModes: false, viewToggle: false, fit: false },
          zoomLevels: LEVELS,
          labels: { ...DEFAULT_LABELS, todayButton },
          viewMode: 'Week',
          view: 'split',
        }),
        { controlSize: 32 },
      );
    expect(today('今日') - today('')).toBe(2 * 12 + 6);
    expect(today('é') - today('')).toBe(Math.ceil(0.6 * 12) + 6);
  });

  it('puts the default toolbar between the breakpoint and the widths of the paint snapshots', () => {
    const w = estimateToolbarWidth(defaults().groups, { controlSize: 32 });
    expect(w).toBeGreaterThan(600);
    expect(w).toBeLessThan(1100);
  });
});

// ─── Layout ───────────────────────────────────────────────────

describe('layoutToolbar — wide: the toolbar as built (paint snapshots unchanged)', () => {
  it.each([1400, 1150, 1100, 700])('%i px: every group, no More button, no menu', width => {
    const { groups } = defaults();
    const out = layout(width);
    expect(out.menu).toBeNull();
    expect(out.groups).toEqual(groups);
    expect(keys(out.groups)).toEqual(['zoom', 'levels', 'today', 'views']);
  });

  it('gives back the same group objects', () => {
    const { groups, controlSize } = defaults();
    const out = layoutToolbar({ groups, width: 1100, controlSize, overflow: 'menu', labels: DEFAULT_LABELS });
    out.groups.forEach((g, i) => expect(g).toBe(groups[i]));
  });

  it.each([0, -1, Number.NaN])('an unmeasured width (%s) shows every group', width => {
    const out = layout(width);
    expect(out.menu).toBeNull();
    expect(keys(out.groups)).toEqual(['zoom', 'levels', 'today', 'views']);
  });

  it('is identical in every density at 1100 px', () => {
    for (const density of ['compact', 'normal', 'comfortable'] as const) {
      expect(layout(1100, {}, { density }).menu).toBeNull();
    }
  });

  it('builds no layout for an empty toolbar', () => {
    expect(layoutToolbar({ groups: [], width: 10, controlSize: 32, overflow: 'menu', labels: DEFAULT_LABELS })).toEqual(
      { groups: [], menu: null, exportMenu: null },
    );
  });
});

describe('layoutToolbar — narrow: zoom levels, then views, then today into the More menu', () => {
  it('600 px: the zoom levels move', () => {
    const out = layout(600);
    expect(keys(out.groups)).toEqual(['zoom', 'today', 'views', 'more']);
    expect(keys(out.menu)).toEqual(['levels']);
  });

  it('380 px: the zoom levels and the views move', () => {
    const out = layout(380);
    expect(keys(out.groups)).toEqual(['zoom', 'today', 'more']);
    expect(keys(out.menu)).toEqual(['levels', 'views']);
  });

  it('200 px: today moves last; the menu keeps the display order', () => {
    const out = layout(200);
    expect(keys(out.groups)).toEqual(['zoom', 'more']);
    expect(keys(out.menu)).toEqual(['levels', 'today', 'views']);
    // `export` first (Phase 12): skipped while the toolbar has no export group
    expect(TOOLBAR_OVERFLOW_ORDER).toEqual(['export', 'levels', 'views', 'today']);
  });

  it("'wrap' never builds a menu", () => {
    for (const width of [1100, 600, 380, 200, 40]) {
      const { groups } = defaults();
      const out = layout(width, { overflow: 'wrap' });
      expect(out.menu).toBeNull();
      expect(out.groups).toEqual(groups);
    }
    // The resolved option
    expect(resolveConfig({ toolbar: { overflow: 'wrap' } }).toolbar).toMatchObject({ overflow: 'wrap' });
  });

  it('moves no more than needed: the rest and More fit, or everything movable has moved', () => {
    const { groups } = defaults();
    const more = layout(600).groups.at(-1)!;
    let movedBefore = 0;
    for (let width = 1200; width >= 120; width -= 10) {
      const out = layout(width);
      const moved = keys(out.menu) ?? [];
      // Narrower never moves fewer groups
      expect(moved.length).toBeGreaterThanOrEqual(movedBefore);
      movedBefore = moved.length;
      if (moved.length < 3) expect(estimateToolbarWidth(out.groups, { controlSize: 32 })).toBeLessThanOrEqual(width);
      if (moved.length) {
        // Keeping the group moved last would not fit
        const last = TOOLBAR_OVERFLOW_ORDER.filter(k => moved.includes(k)).at(-1);
        const fewer = groups.filter(g => g.key === last || !moved.includes(g.key));
        const withMore = moved.length > 1 ? [...fewer, more] : fewer;
        expect(estimateToolbarWidth(withMore, { controlSize: 32 })).toBeGreaterThan(width);
      }
    }
  });

  it('never moves the panel toggle or the zoom buttons', () => {
    const out = layout(100, {}, { toolbar: { panelToggle: true } });
    expect(keys(out.groups)).toEqual(['panel', 'zoom', 'more']);
    expect(keys(out.menu)).toEqual(['levels', 'today', 'views']);
  });

  it('skips groups that are turned off (views move first without zoom levels)', () => {
    const out = layout(200, {}, { toolbar: { viewModes: false } });
    expect(keys(out.menu)).toEqual(['today', 'views']);
    expect(keys(layout(300, {}, { toolbar: { viewModes: false } }).menu)).toEqual(['views']);
  });

  it('builds no menu when nothing can move', () => {
    const groups = small({ ...ALL, viewModes: false, today: false, viewToggle: false });
    const out = layoutToolbar({ groups, width: 40, controlSize: 32, overflow: 'menu', labels: DEFAULT_LABELS });
    expect(out.menu).toBeNull();
    expect(keys(out.groups)).toEqual(['zoom']);
  });

  it('moves earlier with bigger controls, bigger text or longer labels', () => {
    expect(layout(660).menu).toBeNull();
    expect(keys(layout(660, {}, { density: 'comfortable' }).menu)).toEqual(['levels']);
    expect(keys(layout(680, { fontPx: 14 }).menu)).toEqual(['levels']);
    const cfg = resolveConfig({});
    const long = buildToolbar({
      toolbar: cfg.toolbar,
      zoomLevels: cfg.zoomLevels,
      labels: { ...DEFAULT_LABELS, viewModes: { ...DEFAULT_LABELS.viewModes, Quarter: 'Trimestre fiscale' } },
      viewMode: 'Day',
      view: 'split',
    });
    const out = layoutToolbar({ groups: long, width: 660, controlSize: 32, overflow: 'menu', labels: DEFAULT_LABELS });
    expect(keys(out.menu)).toEqual(['levels']);
  });
});

// ─── More button ──────────────────────────────────────────────

describe('layoutToolbar — the More button', () => {
  it('is the last group: an icon menu button named by labels.more, collapsed by default', () => {
    const more = layout(600).groups.at(-1)!;
    expect(more).toEqual({
      key: 'more',
      className: 'gantt-tb-group gantt-tb-more-group',
      role: null,
      ariaLabel: null,
      menu: null,
      items: [
        {
          focusKey: 'more',
          className: 'gantt-tb-btn gantt-tb-more',
          role: null,
          checked: null,
          icon: 'more',
          text: null,
          ariaLabel: 'More',
          title: 'More',
          pressed: null,
          haspopup: 'menu',
          expanded: false,
          disabled: null,
          action: { type: 'menu' },
        },
      ],
    });
  });

  it('is expanded while the menu is open and reads its name from the labels', () => {
    const more = layout(600, { menuOpen: true, labels: { more: 'Altro' } }).groups.at(-1)!.items[0];
    expect([more.expanded, more.ariaLabel, more.title]).toEqual([true, 'Altro', 'Altro']);
  });

  it('joins the roving set last; a control that moved away leaves the tab stop to the first control', () => {
    const items = toolbarItems(layout(600).groups);
    expect(items.at(-1)!.focusKey).toBe('more');
    expect(toolbarTabStop(items, 'more')).toBe('more');
    expect(toolbarTabStop(items, 'zoom:Day')).toBe('zoom-out');
  });
});

// ─── Menu model ───────────────────────────────────────────────

describe('layoutToolbar — the menu sections and items', () => {
  it('turns zoom levels into menuitemradio items, the current level checked', () => {
    const [levels] = layout(380).menu!;
    const cfg = resolveConfig({});
    expect(levels.key).toBe('levels');
    expect(levels.className).toBe('gantt-tb-menu-group');
    expect(levels.ariaLabel).toBe('Zoom level');
    expect(levels.items.map(i => i.focusKey)).toEqual(cfg.zoomLevels.map(l => `menu:zoom:${l.name}`));
    expect(levels.items.map(i => i.text)).toEqual(cfg.zoomLevels.map(l => DEFAULT_LABELS.viewModes[l.name]));
    for (const item of levels.items) {
      expect(item).toMatchObject({ className: 'gantt-tb-menu-item', role: 'menuitemradio', icon: null });
      expect(item.action).toEqual({ type: 'zoomLevel', level: item.focusKey.slice('menu:zoom:'.length) });
    }
    expect(levels.items.filter(i => i.checked).map(i => i.focusKey)).toEqual([`menu:zoom:${cfg.level.name}`]);
    expect(levels.items.every(i => typeof i.checked === 'boolean')).toBe(true);
  });

  it('turns the views into menuitemradio items with their icon and name as text', () => {
    const { groups, controlSize } = defaults({}, 'table');
    const views = layoutToolbar({ groups, width: 380, controlSize, overflow: 'menu', labels: DEFAULT_LABELS }).menu![1];
    expect(views.key).toBe('views');
    expect(views.ariaLabel).toBe('View');
    expect(views.items).toEqual([
      {
        focusKey: 'menu:view:split',
        className: 'gantt-tb-menu-item',
        role: 'menuitemradio',
        checked: false,
        icon: 'viewSplit',
        text: 'Table and chart',
        action: { type: 'view', view: 'split' },
      },
      {
        focusKey: 'menu:view:table',
        className: 'gantt-tb-menu-item',
        role: 'menuitemradio',
        checked: true,
        icon: 'viewTable',
        text: 'Table only',
        action: { type: 'view', view: 'table' },
      },
      {
        focusKey: 'menu:view:chart',
        className: 'gantt-tb-menu-item',
        role: 'menuitemradio',
        checked: false,
        icon: 'viewChart',
        text: 'Chart only',
        action: { type: 'view', view: 'chart' },
      },
    ]);
  });

  it('turns today into a plain menuitem in an unnamed group', () => {
    const today = layout(200).menu!.find(s => s.key === 'today')!;
    expect(today.ariaLabel).toBeNull();
    expect(today.items).toEqual([
      {
        focusKey: 'menu:today',
        className: 'gantt-tb-menu-item',
        role: 'menuitem',
        checked: null,
        icon: 'today',
        text: 'Today',
        action: { type: 'today' },
      },
    ]);
  });

  it('turns a toggle button into a menuitemcheckbox checked while pressed', () => {
    const toggle: ToolbarGroup = {
      key: 'today',
      className: 'gantt-tb-group',
      role: null,
      ariaLabel: null,
      items: [{ ...defaults({ toolbar: { panelToggle: true } }).groups[0].items[0] }],
      menu: null,
    };
    const out = layoutToolbar({
      groups: [toggle],
      width: 10,
      controlSize: 32,
      overflow: 'menu',
      labels: DEFAULT_LABELS,
    });
    expect(out.menu![0].items[0]).toMatchObject({
      role: 'menuitemcheckbox',
      checked: true,
      text: 'Tasks',
      icon: 'panel',
      action: { type: 'togglePanel' },
    });
  });

  it('gives every menu item a unique focus key, apart from the toolbar keys', () => {
    const out = layout(100, {}, { toolbar: { panelToggle: true } });
    const menuKeys = toolbarMenuItems(out.menu).map(i => i.focusKey);
    const barKeys = toolbarItems(out.groups).map(i => i.focusKey);
    expect(new Set(menuKeys).size).toBe(menuKeys.length);
    expect(menuKeys.every(k => k.startsWith('menu:'))).toBe(true);
    expect(menuKeys.some(k => barKeys.includes(k))).toBe(false);
  });

  it('flattens the menu in display order and finds the checked item to open on', () => {
    const out = layout(200);
    const items = toolbarMenuItems(out.menu);
    const cfg = resolveConfig({});
    expect(items).toHaveLength(cfg.zoomLevels.length + 1 + 3);
    expect(toolbarMenuChecked(items)).toBe(cfg.zoomLevels.findIndex(l => l.name === cfg.level.name));
    expect(toolbarMenuItems(null)).toEqual([]);
    expect(toolbarMenuChecked(toolbarMenuItems(out.menu!.filter(s => s.key === 'today')))).toBe(-1);
  });
});
