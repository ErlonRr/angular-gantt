// ─────────────────────────────────────────────────────────────
//  Tests — toolbar model (Phase 9, step 2.6): groups and classes (the
//  painters' paint keys), focus keys, radio semantics, icons, the roving
//  tab stop and the arrow-key moves. Phase 10 step 2.5: the panel toggle
//  group, the pressed / haspopup / expanded states and the new icons
//  (the overflow layout is in toolbar-overflow.test.ts).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { DEFAULT_LABELS, type GanttZoomLevel } from '../types';
import { resolveConfig, type ResolvedToolbar } from '../render/config';
import { resolveKey, type Command, type MoveCommand } from '../interaction/keymap';
import {
  TOOLBAR_ICONS,
  TOOLBAR_ICON_SIZE,
  TOOLBAR_ICON_STROKE,
  TOOLBAR_ICON_VIEWBOX,
  buildToolbar,
  taskListShown,
  togglePanelView,
  toolbarFocusMove,
  toolbarItems,
  toolbarTabStop,
  type ToolbarIcon,
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
  export: false,
};

const LEVELS: GanttZoomLevel[] = ['Hour', 'Day', 'Week', 'Month'].map(name => ({ name, scales: [] }));

const input = (over: Partial<ToolbarInput> = {}): ToolbarInput => ({
  toolbar: ALL,
  zoomLevels: LEVELS,
  labels: DEFAULT_LABELS,
  viewMode: 'Week',
  view: 'split',
  ...over,
});

const keysOf = (items: readonly ToolbarItem[]): string[] => items.map(i => i.focusKey);

describe('buildToolbar — groups', () => {
  it('lists the four groups in order with the paint-key classes and the radiogroup roles', () => {
    const groups = buildToolbar(input());
    expect(groups.map(g => [g.key, g.className, g.role, g.ariaLabel])).toEqual([
      ['zoom', 'gantt-tb-group', null, null],
      ['levels', 'gantt-tb-group gantt-tb-pills', 'radiogroup', 'Zoom level'],
      ['today', 'gantt-tb-group', null, null],
      ['views', 'gantt-tb-group gantt-tb-pills gantt-tb-views', 'radiogroup', 'View'],
    ]);
  });

  it('gives every control its data-focus-key and class, in display order', () => {
    const items = toolbarItems(buildToolbar(input()));
    expect(items.map(i => [i.focusKey, i.className])).toEqual([
      ['zoom-out', 'gantt-tb-btn'],
      ['zoom-in', 'gantt-tb-btn'],
      ['fit', 'gantt-tb-btn'],
      ['zoom:Day', 'gantt-tb-pill'],
      ['zoom:Week', 'gantt-tb-pill'],
      ['zoom:Month', 'gantt-tb-pill'],
      ['today', 'gantt-tb-btn gantt-tb-today'],
      ['view:split', 'gantt-tb-pill'],
      ['view:table', 'gantt-tb-pill'],
      ['view:chart', 'gantt-tb-pill'],
    ]);
    expect(new Set(keysOf(items)).size).toBe(items.length);
  });

  it('maps each control to its action', () => {
    const items = toolbarItems(buildToolbar(input()));
    expect(items.map(i => i.action)).toEqual([
      { type: 'zoomOut' },
      { type: 'zoomIn' },
      { type: 'fit' },
      { type: 'zoomLevel', level: 'Day' },
      { type: 'zoomLevel', level: 'Week' },
      { type: 'zoomLevel', level: 'Month' },
      { type: 'today' },
      { type: 'view', view: 'split' },
      { type: 'view', view: 'table' },
      { type: 'view', view: 'chart' },
    ]);
  });

  it('returns no group without a toolbar or with every part off', () => {
    expect(buildToolbar(input({ toolbar: false }))).toEqual([]);
    expect(
      buildToolbar(
        input({ toolbar: { ...ALL, zoom: false, viewModes: false, today: false, viewToggle: false, fit: false } }),
      ),
    ).toEqual([]);
  });

  it('keeps fit in the zoom group when zoom in / out are off, and drops it when fit is off', () => {
    const fitOnly = buildToolbar(input({ toolbar: { ...ALL, zoom: false } }));
    expect(fitOnly[0].key).toBe('zoom');
    expect(keysOf(fitOnly[0].items)).toEqual(['fit']);
    const noFit = buildToolbar(input({ toolbar: { ...ALL, fit: false } }));
    expect(keysOf(noFit[0].items)).toEqual(['zoom-out', 'zoom-in']);
    const none = buildToolbar(input({ toolbar: { ...ALL, zoom: false, fit: false } }));
    expect(none.map(g => g.key)).toEqual(['levels', 'today', 'views']);
  });

  it('leaves out each part that is turned off', () => {
    expect(buildToolbar(input({ toolbar: { ...ALL, today: false } })).map(g => g.key)).toEqual([
      'zoom',
      'levels',
      'views',
    ]);
    expect(buildToolbar(input({ toolbar: { ...ALL, viewToggle: false } })).map(g => g.key)).toEqual([
      'zoom',
      'levels',
      'today',
    ]);
    expect(buildToolbar(input({ toolbar: { ...ALL, viewModes: false } })).map(g => g.key)).toEqual([
      'zoom',
      'today',
      'views',
    ]);
    expect(buildToolbar(input({ toolbar: { ...ALL, viewModes: [] } })).map(g => g.key)).toEqual([
      'zoom',
      'today',
      'views',
    ]);
  });
});

describe('buildToolbar — controls', () => {
  it('draws zoom out / in and fit as icon buttons named by aria-label and title', () => {
    const [zoomOut, zoomIn, fit] = buildToolbar(input())[0].items;
    expect(zoomOut).toMatchObject({ icon: 'zoomOut', text: null, ariaLabel: 'Zoom out', title: 'Zoom out' });
    expect(zoomIn).toMatchObject({ icon: 'zoomIn', text: null, ariaLabel: 'Zoom in', title: 'Zoom in' });
    expect(fit).toMatchObject({ icon: 'fit', text: null, ariaLabel: 'Fit to screen', title: 'Fit to screen' });
    for (const b of [zoomOut, zoomIn, fit]) expect(b).toMatchObject({ role: null, checked: null });
  });

  it('draws today as icon + visible text, named by its text', () => {
    const today = toolbarItems(buildToolbar(input())).find(i => i.focusKey === 'today');
    expect(today).toEqual({
      focusKey: 'today',
      className: 'gantt-tb-btn gantt-tb-today',
      role: null,
      checked: null,
      icon: 'today',
      text: 'Today',
      ariaLabel: null,
      title: null,
      pressed: null,
      haspopup: null,
      expanded: null,
      disabled: null,
      action: { type: 'today' },
    });
  });

  it('leaves the toggle and popup states off every default control (no attribute: unchanged paint)', () => {
    for (const item of toolbarItems(buildToolbar(input()))) {
      expect([item.pressed, item.haspopup, item.expanded]).toEqual([null, null, null]);
    }
  });

  it('makes zoom levels text radios with exactly the current level checked', () => {
    const levels = buildToolbar(input({ viewMode: 'Month' }))[1].items;
    expect(levels.map(i => [i.text, i.role, i.checked, i.icon, i.ariaLabel, i.title])).toEqual([
      ['Day', 'radio', false, null, null, null],
      ['Week', 'radio', false, null, null, null],
      ['Month', 'radio', true, null, null, null],
    ]);
    // A current level that is not offered checks none
    expect(buildToolbar(input({ viewMode: 'Hour' }))[1].items.some(i => i.checked)).toBe(false);
  });

  it('labels a level by its own label, then labels.viewModes, then its name', () => {
    const levels: GanttZoomLevel[] = [
      { name: 'Sprint', scales: [], label: 'Sprints' },
      { name: 'Week', scales: [] },
      { name: 'Fortnight', scales: [] },
    ];
    const labels = { ...DEFAULT_LABELS, viewModes: { ...DEFAULT_LABELS.viewModes, Week: 'Settimana' } };
    const group = buildToolbar(
      input({ zoomLevels: levels, labels, toolbar: { ...ALL, viewModes: ['Sprint', 'Week', 'Fortnight'] } }),
    )[1];
    expect(group.items.map(i => i.text)).toEqual(['Sprints', 'Settimana', 'Fortnight']);
  });

  it('offers levels in viewModes order, skips unknown names and shows a repeated name once', () => {
    const group = buildToolbar(input({ toolbar: { ...ALL, viewModes: ['Month', 'Nope', 'Day', 'Month'] } }))[1];
    expect(keysOf(group.items)).toEqual(['zoom:Month', 'zoom:Day']);
    // Only unknown names: no levels group at all
    expect(buildToolbar(input({ toolbar: { ...ALL, viewModes: ['Nope'] } })).map(g => g.key)).not.toContain('levels');
  });

  it('makes the views icon-only radios named by aria-label and title, the current view checked', () => {
    const views = buildToolbar(input({ view: 'table' }))[3].items;
    expect(views.map(i => [i.icon, i.text, i.ariaLabel, i.title, i.role, i.checked])).toEqual([
      ['viewSplit', null, 'Table and chart', 'Table and chart', 'radio', false],
      ['viewTable', null, 'Table only', 'Table only', 'radio', true],
      ['viewChart', null, 'Chart only', 'Chart only', 'radio', false],
    ]);
  });

  it('reads every string from the labels', () => {
    const labels = {
      ...DEFAULT_LABELS,
      zoomIn: 'Ingrandisci',
      zoomOut: 'Riduci',
      fitToScreen: 'Adatta',
      todayButton: 'Oggi',
      viewSplit: 'Tabella e grafico',
      viewTable: 'Solo tabella',
      viewChart: 'Solo grafico',
      ariaZoomLevels: 'Livello di zoom',
      ariaViews: 'Vista',
    };
    const groups = buildToolbar(input({ labels }));
    const items = toolbarItems(groups);
    expect(items.map(i => i.ariaLabel ?? i.text)).toEqual([
      'Riduci',
      'Ingrandisci',
      'Adatta',
      'Day',
      'Week',
      'Month',
      'Oggi',
      'Tabella e grafico',
      'Solo tabella',
      'Solo grafico',
    ]);
    expect(groups.map(g => g.ariaLabel)).toEqual([null, 'Livello di zoom', null, 'Vista']);
  });

  it('gives every control an accessible name and uses only known icons', () => {
    for (const item of toolbarItems(buildToolbar(input()))) {
      expect(item.ariaLabel ?? item.text).toBeTruthy();
      if (item.text === null) expect(item.icon).not.toBeNull();
      if (item.icon !== null) expect(TOOLBAR_ICONS[item.icon]).toBeDefined();
      expect(item.checked === null).toBe(item.role === null);
    }
  });

  it('works on the resolved defaults: every built-in zoom level and the three views', () => {
    const cfg = resolveConfig({});
    const groups = buildToolbar({
      toolbar: cfg.toolbar,
      zoomLevels: cfg.zoomLevels,
      labels: DEFAULT_LABELS,
      viewMode: cfg.level.name,
      view: cfg.view,
    });
    expect(groups.map(g => g.key)).toEqual(['zoom', 'levels', 'today', 'views']);
    expect(groups[0].items.map(i => i.focusKey)).toEqual(['zoom-out', 'zoom-in', 'fit']);
    expect(groups[1].items.map(i => i.text)).toEqual(cfg.zoomLevels.map(l => DEFAULT_LABELS.viewModes[l.name]));
    expect(groups[1].items.filter(i => i.checked).map(i => i.focusKey)).toEqual([`zoom:${cfg.level.name}`]);
    expect(groups[3].items.filter(i => i.checked).map(i => i.focusKey)).toEqual(['view:split']);
    expect(buildToolbar({ ...input(), toolbar: resolveConfig({ toolbar: false }).toolbar })).toEqual([]);
  });

  it('is pure: the same input gives equal, independent groups', () => {
    const a = buildToolbar(input());
    const b = buildToolbar(input());
    expect(a).toEqual(b);
    a[0].items.pop();
    expect(buildToolbar(input())).toEqual(b);
  });
});

describe('buildToolbar — panel toggle (toolbar.panelToggle)', () => {
  const PANEL: ResolvedToolbar = { ...ALL, panelToggle: true };

  it('is off by default: no panel group, the four groups as before', () => {
    expect(buildToolbar(input()).map(g => g.key)).toEqual(['zoom', 'levels', 'today', 'views']);
    expect(resolveConfig({}).toolbar).toMatchObject({ panelToggle: false });
  });

  it('adds the panel group first, before the zoom buttons', () => {
    const groups = buildToolbar(input({ toolbar: PANEL }));
    expect(groups.map(g => [g.key, g.className, g.role, g.ariaLabel])).toEqual([
      ['panel', 'gantt-tb-group gantt-tb-panel-group', null, null],
      ['zoom', 'gantt-tb-group', null, null],
      ['levels', 'gantt-tb-group gantt-tb-pills', 'radiogroup', 'Zoom level'],
      ['today', 'gantt-tb-group', null, null],
      ['views', 'gantt-tb-group gantt-tb-pills gantt-tb-views', 'radiogroup', 'View'],
    ]);
    expect(keysOf(toolbarItems(groups))[0]).toBe('panel');
  });

  it('is an aria-pressed icon button named by ariaTaskList, titled hidePanel while the task list shows', () => {
    const split = buildToolbar(input({ toolbar: PANEL, view: 'split' }))[0].items;
    expect(split).toEqual([
      {
        focusKey: 'panel',
        className: 'gantt-tb-btn gantt-tb-panel',
        role: null,
        checked: null,
        icon: 'panel',
        text: null,
        ariaLabel: 'Tasks',
        title: 'Hide task list',
        pressed: true,
        haspopup: null,
        expanded: null,
        disabled: null,
        action: { type: 'togglePanel' },
      },
    ]);
    const chart = buildToolbar(input({ toolbar: PANEL, view: 'chart' }))[0].items[0];
    expect([chart.pressed, chart.title, chart.ariaLabel]).toEqual([false, 'Show task list', 'Tasks']);
    // The table view shows the task list too
    expect(buildToolbar(input({ toolbar: PANEL, view: 'table' }))[0].items[0].pressed).toBe(true);
  });

  it('says what a press does in every view: togglePanelView hides a shown task list, shows a hidden one', () => {
    expect(taskListShown('split')).toBe(true);
    expect(taskListShown('table')).toBe(true);
    expect(taskListShown('chart')).toBe(false);
    // From the table view, hiding the task list leaves the timeline alone (not the split view)
    expect(togglePanelView('split')).toBe('chart');
    expect(togglePanelView('table')).toBe('chart');
    expect(togglePanelView('chart')).toBe('split');
    for (const view of ['split', 'table', 'chart'] as const) {
      const [item] = buildToolbar(input({ toolbar: PANEL, view }))[0].items;
      const after = togglePanelView(view);
      // Pressed while the list shows, and a press hides it; not pressed, a press shows it
      expect(item.pressed, view).toBe(taskListShown(view));
      expect(taskListShown(after), view).toBe(!item.pressed);
      expect(item.title, view).toBe(item.pressed ? DEFAULT_LABELS.hidePanel : DEFAULT_LABELS.showPanel);
    }
  });

  it('reads its strings from the labels', () => {
    const labels = { ...DEFAULT_LABELS, ariaTaskList: 'Attività', showPanel: 'Mostra', hidePanel: 'Nascondi' };
    const [shown] = buildToolbar(input({ toolbar: PANEL, labels }))[0].items;
    const [hidden] = buildToolbar(input({ toolbar: PANEL, labels, view: 'chart' }))[0].items;
    expect([shown.ariaLabel, shown.title, hidden.title]).toEqual(['Attività', 'Nascondi', 'Mostra']);
  });

  it('stands alone when every other part is off, and joins the roving set first', () => {
    const lone = buildToolbar(
      input({ toolbar: { ...PANEL, zoom: false, viewModes: false, today: false, viewToggle: false, fit: false } }),
    );
    expect(lone.map(g => g.key)).toEqual(['panel']);
    const items = toolbarItems(buildToolbar(input({ toolbar: PANEL })));
    expect(toolbarTabStop(items, null)).toBe('panel');
    expect(toolbarFocusMove(items, 'panel', 'move.right')).toBe('zoom-out');
    expect(toolbarFocusMove(items, 'panel', 'move.left')).toBe('view:chart');
  });

  it('follows the resolved option', () => {
    const cfg = resolveConfig({ toolbar: { panelToggle: true } });
    const groups = buildToolbar({
      toolbar: cfg.toolbar,
      zoomLevels: cfg.zoomLevels,
      labels: DEFAULT_LABELS,
      viewMode: cfg.level.name,
      view: cfg.view,
    });
    expect(groups.map(g => g.key)).toEqual(['panel', 'zoom', 'levels', 'today', 'views']);
  });
});

// ─── Icons ────────────────────────────────────────────────────

type Point = [number, number];

/** Endpoints of an SVG path (absolute and relative M L H V A Z), plus the arc radii. */
function pathPoints(d: string): { points: Point[]; radii: number[] } {
  const tokens = d.match(/[MmLlHhVvAaZz]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  const points: Point[] = [];
  const radii: number[] = [];
  let x = 0;
  let y = 0;
  let start: Point = [0, 0];
  let cmd = '';
  let i = 0;
  const num = (): number => {
    const t = tokens[i++];
    const n = Number(t);
    if (t === undefined || Number.isNaN(n)) throw new Error(`bad path ${d}`);
    return n;
  };
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++]!;
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M':
      case 'L': {
        const nx = num();
        const ny = num();
        x = rel ? x + nx : nx;
        y = rel ? y + ny : ny;
        if (cmd.toUpperCase() === 'M') start = [x, y];
        // Pairs after a moveto are linetos
        if (cmd === 'M') cmd = 'L';
        if (cmd === 'm') cmd = 'l';
        break;
      }
      case 'H':
        x = rel ? x + num() : num();
        break;
      case 'V':
        y = rel ? y + num() : num();
        break;
      case 'A': {
        radii.push(num(), num());
        num();
        const large = num();
        const sweep = num();
        expect([0, 1]).toContain(large);
        expect([0, 1]).toContain(sweep);
        const nx = num();
        const ny = num();
        x = rel ? x + nx : nx;
        y = rel ? y + ny : ny;
        break;
      }
      case 'Z':
        [x, y] = start;
        break;
      default:
        throw new Error(`unsupported command ${cmd} in ${d}`);
    }
    points.push([x, y]);
  }
  return { points, radii };
}

describe('toolbar icons', () => {
  const ICONS: ToolbarIcon[] = [
    'zoomIn',
    'zoomOut',
    'fit',
    'today',
    'viewSplit',
    'viewTable',
    'viewChart',
    'panel',
    'more',
    'undo',
    'redo',
    'export',
  ];

  it('defines every icon on a 16 px grid, stroked with currentColor at 1.5 px', () => {
    expect(TOOLBAR_ICON_VIEWBOX).toBe('0 0 16 16');
    expect(TOOLBAR_ICON_SIZE).toBe(16);
    expect(TOOLBAR_ICON_STROKE).toEqual({ width: 1.5, linecap: 'round', linejoin: 'round' });
    expect(Object.keys(TOOLBAR_ICONS).sort()).toEqual([...ICONS].sort());
  });

  it.each(ICONS)('%s has at least one well-formed path inside the viewBox (stroke included)', icon => {
    const paths = TOOLBAR_ICONS[icon];
    expect(paths.length).toBeGreaterThan(0);
    for (const d of paths) {
      expect(typeof d).toBe('string');
      expect(d).toMatch(/^M/);
      const { points, radii } = pathPoints(d);
      expect(points.length).toBeGreaterThan(1);
      // Half the 1.5 px stroke must stay inside the 16 px box
      for (const [px, py] of points) {
        expect(px).toBeGreaterThanOrEqual(1);
        expect(px).toBeLessThanOrEqual(15);
        expect(py).toBeGreaterThanOrEqual(1);
        expect(py).toBeLessThanOrEqual(15);
      }
      for (const r of radii) expect(r).toBeLessThanOrEqual(6);
    }
  });

  it('gives each icon a different drawing (zoom in = zoom out + a vertical stroke)', () => {
    const drawings = ICONS.map(i => TOOLBAR_ICONS[i].join(' '));
    expect(new Set(drawings).size).toBe(ICONS.length);
    expect(TOOLBAR_ICONS.zoomIn.slice(0, TOOLBAR_ICONS.zoomOut.length)).toEqual(TOOLBAR_ICONS.zoomOut);
    expect(TOOLBAR_ICONS.zoomIn.length).toBe(TOOLBAR_ICONS.zoomOut.length + 1);
  });

  it('draws the panel as the view frame with a sidebar line, and More as three dots in a row', () => {
    expect(TOOLBAR_ICONS.panel[0]).toBe(TOOLBAR_ICONS.viewSplit[0]);
    expect(TOOLBAR_ICONS.panel).toHaveLength(2);
    expect(pathPoints(TOOLBAR_ICONS.panel[1]).points).toEqual([
      [6, 2.5],
      [6, 13.5],
    ]);
    const dots = TOOLBAR_ICONS.more.map(d => pathPoints(d));
    expect(dots).toHaveLength(3);
    for (const { points, radii } of dots) {
      // A closed circle (two half arcs) of radius 0.75: a solid 3 px dot once stroked at 1.5 px
      expect(points[0]).toEqual(points.at(-1));
      expect(radii).toEqual([0.75, 0.75, 0.75, 0.75]);
      expect(points.every(([, y]) => y === 8)).toBe(true);
    }
    // Evenly spaced, centred on the 16 px grid
    const centres = dots.map(({ points }) => points[0][0] + 0.75);
    expect(centres).toEqual([3.5, 8, 12.5]);
  });

  it('keeps the magnifier ring a closed circle around (7, 7)', () => {
    const { points } = pathPoints(TOOLBAR_ICONS.zoomIn[0]);
    expect(points[0]).toEqual([2.5, 7]);
    expect(points.at(-1)).toEqual([2.5, 7]);
  });
});

// ─── Roving ───────────────────────────────────────────────────

describe('toolbarTabStop', () => {
  const items = toolbarItems(buildToolbar(input()));

  it('is the control focused last while it is shown', () => {
    expect(toolbarTabStop(items, 'zoom:Month')).toBe('zoom:Month');
    expect(toolbarTabStop(items, 'view:chart')).toBe('view:chart');
  });

  it('falls back to the first control', () => {
    expect(toolbarTabStop(items, null)).toBe('zoom-out');
    expect(toolbarTabStop(items, undefined)).toBe('zoom-out');
    expect(toolbarTabStop(items, 'zoom:Year')).toBe('zoom-out');
    const noZoom = toolbarItems(buildToolbar(input({ toolbar: { ...ALL, zoom: false, fit: false } })));
    expect(toolbarTabStop(noZoom, 'zoom-in')).toBe('zoom:Day');
  });

  it('is null without controls', () => {
    expect(toolbarTabStop([], 'today')).toBeNull();
  });
});

describe('toolbarFocusMove', () => {
  const items = toolbarItems(buildToolbar(input()));

  it('steps left / right and wraps around', () => {
    expect(toolbarFocusMove(items, 'zoom-in', 'move.right')).toBe('fit');
    expect(toolbarFocusMove(items, 'fit', 'move.right')).toBe('zoom:Day');
    expect(toolbarFocusMove(items, 'view:chart', 'move.right')).toBe('zoom-out');
    expect(toolbarFocusMove(items, 'zoom-out', 'move.left')).toBe('view:chart');
    expect(toolbarFocusMove(items, 'today', 'move.left')).toBe('zoom:Month');
  });

  it('goes to the first / last control with Home / End', () => {
    expect(toolbarFocusMove(items, 'today', 'move.home')).toBe('zoom-out');
    expect(toolbarFocusMove(items, 'today', 'move.end')).toBe('view:chart');
    expect(toolbarFocusMove(items, null, 'move.end')).toBe('view:chart');
  });

  it('starts from the edges when the current control is unknown', () => {
    expect(toolbarFocusMove(items, 'gone', 'move.right')).toBe('zoom-out');
    expect(toolbarFocusMove(items, undefined, 'move.left')).toBe('view:chart');
  });

  it('stays on a lone control and ignores vertical moves and empty toolbars', () => {
    const lone = toolbarItems(
      buildToolbar(
        input({ toolbar: { ...ALL, zoom: false, viewModes: false, today: true, viewToggle: false, fit: false } }),
      ),
    );
    expect(toolbarFocusMove(lone, 'today', 'move.right')).toBe('today');
    expect(toolbarFocusMove(items, 'today', 'move.up')).toBeNull();
    expect(toolbarFocusMove(items, 'today', 'move.pageDown')).toBeNull();
    expect(toolbarFocusMove([], null, 'move.right')).toBeNull();
  });

  it('follows the toolbar keymap, RTL included', () => {
    const isMove = (c: Command | null): c is MoveCommand => c !== null && c.startsWith('move.');
    const move = (key: string, rtl = false): string | null => {
      const cmd = resolveKey({ key }, 'toolbar', { rtl });
      return isMove(cmd) ? toolbarFocusMove(items, 'today', cmd) : null;
    };
    expect(move('ArrowRight')).toBe('view:split');
    expect(move('ArrowLeft')).toBe('zoom:Month');
    expect(move('ArrowRight', true)).toBe('zoom:Month');
    expect(move('Home')).toBe('zoom-out');
    expect(move('End')).toBe('view:chart');
    expect(move('ArrowDown')).toBeNull();
  });
});
