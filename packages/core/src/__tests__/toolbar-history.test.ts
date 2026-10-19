// ─────────────────────────────────────────────────────────────
//  Tests — the toolbar's history group (Phase 11 step 2.6, D17): Undo /
//  Redo after the panel toggle while the chart keeps history,
//  aria-disabled from the history state, part of the roving set, counted
//  by the width estimate and never moved into the More menu.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { DEFAULT_LABELS, type GanttHistoryState, type GanttOptions, type GanttZoomLevel } from '../types';
import { resolveConfig, type ResolvedToolbar } from '../render/config';
import { resolveKey } from '../interaction/keymap';
import {
  TOOLBAR_ICONS,
  TOOLBAR_OVERFLOW_ORDER,
  buildToolbar,
  estimateToolbarWidth,
  layoutToolbar,
  toolbarFocusMove,
  toolbarItems,
  toolbarMenuItems,
  toolbarTabStop,
  type ToolbarGroup,
  type ToolbarInput,
  type ToolbarItem,
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
};
const LEVELS: GanttZoomLevel[] = ['Day', 'Week', 'Month'].map(name => ({ name, scales: [] }));

const state = (canUndo: boolean, canRedo: boolean): GanttHistoryState => ({
  canUndo,
  canRedo,
  undoLabel: canUndo ? 'Design moved 2 days later' : null,
  redoLabel: canRedo ? 'Build moved 1 day earlier' : null,
  undoCount: canUndo ? 1 : 0,
  redoCount: canRedo ? 1 : 0,
});
const EMPTY = state(false, false);

const input = (over: Partial<ToolbarInput> = {}): ToolbarInput => ({
  toolbar: ALL,
  zoomLevels: LEVELS,
  labels: DEFAULT_LABELS,
  viewMode: 'Week',
  view: 'split',
  history: EMPTY,
  ...over,
});
const history = (groups: readonly ToolbarGroup[]) => groups.find(g => g.key === 'history');
const keysOf = (items: readonly { focusKey: string }[]): string[] => items.map(i => i.focusKey);

describe('history group: when it shows', () => {
  it('needs toolbar.undo and a history state (the chart keeps history)', () => {
    expect(history(buildToolbar(input()))).toBeDefined();
    expect(history(buildToolbar(input({ history: null })))).toBeUndefined();
    expect(history(buildToolbar(input({ history: undefined })))).toBeUndefined();
    const { history: _, ...without } = input();
    expect(history(buildToolbar(without))).toBeUndefined();
    expect(history(buildToolbar(input({ toolbar: { ...ALL, undo: false } })))).toBeUndefined();
    expect(buildToolbar(input({ toolbar: false }))).toEqual([]);
  });

  it('follows the resolved config: editing with history yes; editing off, history: false or controlled no', () => {
    const groupsFor = (options: GanttOptions) => {
      const cfg = resolveConfig(options);
      return buildToolbar({
        toolbar: cfg.toolbar,
        zoomLevels: cfg.zoomLevels,
        labels: DEFAULT_LABELS,
        viewMode: cfg.level.name,
        view: cfg.view,
        // What the bindings pass: the history state only while the chart keeps history
        history: cfg.editing.history ? EMPTY : null,
      });
    };
    expect(history(groupsFor({ editing: true }))).toBeDefined();
    expect(history(groupsFor({ editing: { cells: false } }))).toBeDefined();
    expect(history(groupsFor({}))).toBeUndefined();
    expect(history(groupsFor({ editing: { history: false } }))).toBeUndefined();
    expect(history(groupsFor({ editing: { controlled: true } }))).toBeUndefined();
    expect(history(groupsFor({ editing: true, toolbar: { undo: false } }))).toBeUndefined();
  });
});

describe('history group: order and controls', () => {
  it('sits after the panel toggle and before the zoom group', () => {
    expect(buildToolbar(input({ toolbar: { ...ALL, panelToggle: true } })).map(g => g.key)).toEqual([
      'panel',
      'history',
      'zoom',
      'levels',
      'today',
      'views',
    ]);
    expect(buildToolbar(input()).map(g => g.key)).toEqual(['history', 'zoom', 'levels', 'today', 'views']);
    // Alone, when nothing else is on
    const alone = { ...ALL, zoom: false, fit: false, viewModes: false, today: false, viewToggle: false } as const;
    expect(buildToolbar(input({ toolbar: alone })).map(g => g.key)).toEqual(['history']);
  });

  it('is a plain group div with two icon buttons: classes, focus keys, names and actions', () => {
    const group = history(buildToolbar(input({ history: state(true, true) })))!;
    expect([group.className, group.role, group.ariaLabel]).toEqual(['gantt-tb-group gantt-tb-history', null, null]);
    const base = { role: null, checked: null, text: null, pressed: null, haspopup: null, expanded: null };
    expect(group.items).toEqual<ToolbarItem[]>([
      {
        ...base,
        focusKey: 'undo',
        className: 'gantt-tb-btn gantt-tb-undo',
        icon: 'undo',
        ariaLabel: 'Undo',
        title: 'Undo',
        disabled: null,
        action: { type: 'undo' },
      },
      {
        ...base,
        focusKey: 'redo',
        className: 'gantt-tb-btn gantt-tb-redo',
        icon: 'redo',
        ariaLabel: 'Redo',
        title: 'Redo',
        disabled: null,
        action: { type: 'redo' },
      },
    ]);
    for (const item of group.items) expect(TOOLBAR_ICONS[item.icon!].length).toBeGreaterThan(0);
  });

  it.each([
    [false, false, true, true],
    [true, false, null, true],
    [false, true, true, null],
    [true, true, null, null],
  ] as const)('canUndo %s, canRedo %s → aria-disabled %s / %s (never false)', (canUndo, canRedo, undo, redo) => {
    const [u, r] = history(buildToolbar(input({ history: state(canUndo, canRedo) })))!.items;
    expect([u.disabled, r.disabled]).toEqual([undo, redo]);
  });

  it('names the buttons from the labels', () => {
    const labels = { ...DEFAULT_LABELS, undo: 'Annuler', redo: 'Rétablir' };
    const [u, r] = history(buildToolbar(input({ labels })))!.items;
    expect([u.ariaLabel, u.title, r.ariaLabel, r.title]).toEqual(['Annuler', 'Annuler', 'Rétablir', 'Rétablir']);
  });

  it('leaves every other control without aria-disabled', () => {
    for (const item of toolbarItems(buildToolbar(input({ toolbar: { ...ALL, panelToggle: true } })))) {
      if (item.focusKey !== 'undo' && item.focusKey !== 'redo') expect(item.disabled).toBeNull();
    }
  });

  it('is pure: the same input gives the same groups', () => {
    expect(buildToolbar(input({ history: state(true, false) }))).toEqual(
      buildToolbar(input({ history: state(true, false) })),
    );
  });
});

describe('history group: roving focus', () => {
  const items = (h: GanttHistoryState, toolbar: ResolvedToolbar = ALL) =>
    toolbarItems(buildToolbar(input({ history: h, toolbar })));

  it('belongs to the roving set: arrows move through Undo and Redo, disabled or not', () => {
    const list = items(EMPTY, { ...ALL, panelToggle: true });
    expect(keysOf(list).slice(0, 4)).toEqual(['panel', 'undo', 'redo', 'zoom-out']);
    const move = (from: string, key: string) => toolbarFocusMove(list, from, resolveKey({ key }, 'toolbar') as never);
    expect(move('panel', 'ArrowRight')).toBe('undo');
    expect(move('undo', 'ArrowRight')).toBe('redo');
    expect(move('redo', 'ArrowRight')).toBe('zoom-out');
    expect(move('zoom-out', 'ArrowLeft')).toBe('redo');
    expect(move('panel', 'ArrowLeft')).toBe(list.at(-1)!.focusKey);
  });

  it('the tab stop skips an unavailable Undo / Redo until something was focused', () => {
    expect(toolbarTabStop(items(EMPTY), null)).toBe('zoom-out');
    expect(toolbarTabStop(items(state(false, true)), null)).toBe('redo');
    expect(toolbarTabStop(items(state(true, false)), undefined)).toBe('undo');
    // The control focused last stays the tab stop, even when it became unavailable
    expect(toolbarTabStop(items(EMPTY), 'undo')).toBe('undo');
    // Only disabled controls: the first one
    const alone = { ...ALL, zoom: false, fit: false, viewModes: false, today: false, viewToggle: false } as const;
    expect(toolbarTabStop(items(EMPTY, alone), null)).toBe('undo');
    // The panel toggle still comes first
    expect(toolbarTabStop(items(EMPTY, { ...ALL, panelToggle: true }), null)).toBe('panel');
  });
});

describe('history group: width and overflow', () => {
  const controlSize = 32;

  it('estimateToolbarWidth counts the group: separator + two icon buttons + one gap', () => {
    const groups = buildToolbar(input());
    const without = buildToolbar(input({ history: null }));
    // Group gap 10 + separator 11, two 32 px icon buttons, one 2 px gap between them
    expect(estimateToolbarWidth(groups, { controlSize }) - estimateToolbarWidth(without, { controlSize })).toBe(
      10 + 11 + 2 * 32 + 2,
    );
    // Alone: the toolbar padding and the two buttons
    const alone = { ...ALL, zoom: false, fit: false, viewModes: false, today: false, viewToggle: false } as const;
    expect(estimateToolbarWidth(buildToolbar(input({ toolbar: alone })), { controlSize })).toBe(20 + 2 * 32 + 2);
    expect(estimateToolbarWidth(buildToolbar(input({ toolbar: alone })), { controlSize: 36 })).toBe(20 + 2 * 36 + 2);
  });

  it('is never in the overflow order', () => {
    expect(TOOLBAR_OVERFLOW_ORDER).not.toContain('history');
  });

  it('never moves into the More menu, at any width', () => {
    const groups = buildToolbar(input({ toolbar: { ...ALL, panelToggle: true }, history: state(true, false) }));
    const full = estimateToolbarWidth(groups, { controlSize });
    for (let width = 1; width <= full + 40; width += 7) {
      const out = layoutToolbar({ groups, width, controlSize, overflow: 'menu', labels: DEFAULT_LABELS });
      expect(out.groups.slice(0, 3).map(g => g.key)).toEqual(['panel', 'history', 'zoom']);
      expect(history(out.groups)).toBe(history(groups));
      expect(out.menu?.some(s => s.key === 'history') ?? false).toBe(false);
      expect(keysOf(toolbarMenuItems(out.menu)).some(k => k === 'menu:undo' || k === 'menu:redo')).toBe(false);
    }
  });

  it('its width can push other groups into the menu (the estimate includes it)', () => {
    const groups = buildToolbar(input());
    const without = buildToolbar(input({ history: null }));
    const width = estimateToolbarWidth(without, { controlSize });
    const fits = layoutToolbar({ groups: without, width, controlSize, overflow: 'menu', labels: DEFAULT_LABELS });
    expect(fits.menu).toBeNull();
    const out = layoutToolbar({ groups, width, controlSize, overflow: 'menu', labels: DEFAULT_LABELS });
    expect(out.menu?.map(s => s.key)).toEqual(['levels']);
    expect(out.groups.map(g => g.key)).toEqual(['history', 'zoom', 'today', 'views', 'more']);
    expect(estimateToolbarWidth(out.groups, { controlSize })).toBeLessThanOrEqual(width);
  });

  it("'wrap' keeps every group, history included", () => {
    const groups = buildToolbar(input());
    const out = layoutToolbar({ groups, width: 50, controlSize, overflow: 'wrap', labels: DEFAULT_LABELS });
    expect(out).toEqual({ groups, menu: null });
  });
});
