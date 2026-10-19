// ─────────────────────────────────────────────────────────────
//  gantry · state/toolbar.ts
//  Toolbar model: groups, items, icons and the roving tab stop (Phase 9
//  step 2.6), the panel toggle and the overflow layout with its "More"
//  menu (Phase 10 step 2.5), the undo / redo group (Phase 11 step 2.6),
//  the export group and its menu (Phase 12: types in step 1.0, model in
//  step 2.6).
//  Both painters render `layoutToolbar()` (of `buildToolbar()`) as is,
//  so they show the same controls in the same order with the same
//  classes, roles and names:
//
//    div.gantt-toolbar[role=toolbar]
//      div.gantt-tb-group.gantt-tb-panel-group      task list toggle            (aria-pressed, `panelToggle`)
//      div.gantt-tb-group.gantt-tb-history          undo · redo                 (icon buttons, aria-disabled,
//                                                                                while the chart keeps history)
//      div.gantt-tb-group                           zoom out · zoom in · fit    (icon buttons)
//      div.gantt-tb-group.gantt-tb-pills            zoom levels                 (text radios)
//      div.gantt-tb-group                           today                       (icon + text)
//      div.gantt-tb-group.gantt-tb-pills.gantt-tb-views
//                                                   split · table · chart       (icon radios)
//      div.gantt-tb-group.gantt-tb-export-group     Export                      (menu button, `toolbar.export`)
//      div.gantt-tb-group.gantt-tb-more-group       More                        (menu button, while needed)
//      div.gantt-tb-menu[role=menu]                 the export formats (`ToolbarLayout.exportMenu`) or
//                                                   the controls that don't fit (`ToolbarLayout.menu`):
//                                                   one menu at a time, while open, after the group of
//                                                   the button that opened it
//
//  The built-in controls form one roving set (WAI-ARIA toolbar): one
//  tab stop (`toolbarTabStop`), arrow keys move and wrap
//  (`toolbarFocusMove`), and a radio is checked by Space / Enter / click,
//  never by moving focus onto it. More and Export are part of the set;
//  their menu items are not (`reduceMenu` in state/menu.ts moves inside
//  the menu). The export group is the first to move into More, where its
//  format items become a section: a menu is never nested in another.
// ─────────────────────────────────────────────────────────────

import type { GanttExportFormat, GanttHistoryState, GanttLabels, GanttView, GanttZoomLevel } from '../types';
import type { ResolvedToolbar } from '../render/config';
import type { MoveCommand } from '../interaction/keymap';

// ─── Icons ────────────────────────────────────────────────────

/** The toolbar's built-in icons. */
export type ToolbarIcon =
  | 'zoomIn'
  | 'zoomOut'
  | 'fit'
  | 'today'
  | 'viewSplit'
  | 'viewTable'
  | 'viewChart'
  | 'panel'
  | 'more'
  | 'undo'
  | 'redo'
  | 'export';

/** `viewBox` of every toolbar icon (a 16 px grid). */
export const TOOLBAR_ICON_VIEWBOX = '0 0 16 16';

/** Rendered size of a toolbar icon in px (`width` / `height` of `svg.gantt-tb-icon`). */
export const TOOLBAR_ICON_SIZE = 16;

/**
 * How every toolbar icon path is stroked: `fill="none"`, `stroke="currentColor"` and these
 * attributes, so an icon takes the button's text colour (and forced-colors `ButtonText`).
 */
export const TOOLBAR_ICON_STROKE = { width: 1.5, linecap: 'round', linejoin: 'round' } as const;

/** Magnifier ring and handle, shared by zoom in / out */
const MAGNIFIER = ['M2.5 7a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0', 'M10.25 10.25L13.5 13.5'] as const;
/** Rounded frame of the view and panel icons */
const FRAME = 'M3 2.5h10a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z';

/**
 * The `d` of each path of each icon, in paint order: stroked 16 px line art, no DOM. A painter
 * draws `svg.gantt-tb-icon[viewBox=TOOLBAR_ICON_VIEWBOX][aria-hidden=true]` with one `path` per
 * entry, stroked per `TOOLBAR_ICON_STROKE`.
 */
export const TOOLBAR_ICONS: Readonly<Record<ToolbarIcon, readonly string[]>> = {
  zoomOut: [...MAGNIFIER, 'M5 7h4'],
  zoomIn: [...MAGNIFIER, 'M5 7h4', 'M7 5v4'],
  // Four frame corners and a double arrow: "fit the tasks to the width"
  fit: [
    'M2 5.5V3a1 1 0 0 1 1-1h2.5',
    'M10.5 2H13a1 1 0 0 1 1 1v2.5',
    'M14 10.5V13a1 1 0 0 1-1 1h-2.5',
    'M5.5 14H3a1 1 0 0 1-1-1v-2.5',
    'M5 8h6',
    'M6.5 6.5L5 8l1.5 1.5',
    'M9.5 6.5L11 8l-1.5 1.5',
  ],
  // A calendar page with its rings and a dot on the current day
  today: [
    'M3.5 3.5h9a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z',
    'M2.5 6.5h11',
    'M5.5 2v3',
    'M10.5 2v3',
    'M7 10a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  ],
  // A frame split in two columns, bars on the right
  viewSplit: [FRAME, 'M6.5 2.5v11', 'M8.75 6.25h2.5', 'M9.75 9.75h2.5'],
  // A frame with a header row, a row line and a column line
  viewTable: [FRAME, 'M2 6h12', 'M2 9.75h12', 'M6.5 6v7.5'],
  // Three staggered task bars
  viewChart: [
    'M3 3.5h4a1 1 0 0 1 0 2H3a1 1 0 0 1 0-2Z',
    'M6 7h6a1 1 0 0 1 0 2H6a1 1 0 0 1 0-2Z',
    'M9 10.5h3.5a1 1 0 0 1 0 2H9a1 1 0 0 1 0-2Z',
  ],
  // A frame with a sidebar: "show / hide the task list"
  panel: [FRAME, 'M6 2.5v11'],
  // Three dots in a row (circles of radius 0.75: solid 3 px dots once stroked)
  more: [
    'M2.75 8a0.75 0.75 0 1 0 1.5 0a0.75 0.75 0 1 0-1.5 0',
    'M7.25 8a0.75 0.75 0 1 0 1.5 0a0.75 0.75 0 1 0-1.5 0',
    'M11.75 8a0.75 0.75 0 1 0 1.5 0a0.75 0.75 0 1 0-1.5 0',
  ],
  // An arrowhead pointing left on a line that turns back along a half circle: "go back a step".
  // Centred on the 16 px grid (x 2.5–13.5, y 3–13); the bottom stroke ends under the arrowhead.
  undo: ['M5.5 3L2.5 6l3 3', 'M2.5 6H10a3.5 3.5 0 0 1 0 7H5.5'],
  // Undo mirrored about x = 8
  redo: ['M10.5 3l3 3-3 3', 'M13.5 6H6a3.5 3.5 0 0 0 0 7h4.5'],
  // An arrow pointing down into an open tray: "save a copy"
  export: ['M8 2.5v7', 'M5 6.5l3 3 3-3', 'M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2'],
};

// ─── Model ────────────────────────────────────────────────────

/** Strings the toolbar reads (part of `GanttLabels`). */
export type ToolbarLabels = Pick<
  GanttLabels,
  | 'zoomIn'
  | 'zoomOut'
  | 'fitToScreen'
  | 'todayButton'
  | 'viewModes'
  | 'viewSplit'
  | 'viewTable'
  | 'viewChart'
  | 'ariaZoomLevels'
  | 'ariaViews'
  | 'ariaTaskList'
  | 'showPanel'
  | 'hidePanel'
  | 'more'
  | 'undo'
  | 'redo'
  | 'exportMenu'
  | 'exportSvg'
  | 'exportPng'
  | 'exportCsv'
  | 'exportPrint'
>;

/** What a toolbar control does when pressed (or, for a radio, checked). */
export type ToolbarAction =
  | { type: 'zoomOut' }
  | { type: 'zoomIn' }
  | { type: 'fit' }
  | { type: 'today' }
  | { type: 'zoomLevel'; level: string }
  | { type: 'view'; view: GanttView }
  /** The task list toggle (`toolbar.panelToggle`): the binding runs `togglePanel()` (`togglePanelView`) */
  | { type: 'togglePanel' }
  /** The More button: the binding opens / closes its menu (`reduceMenu`) */
  | { type: 'menu' }
  /** Undo / Redo (`toolbar.undo`): the binding runs `undo()` / `redo()` */
  | { type: 'undo' }
  | { type: 'redo' }
  /** The Export button (`toolbar.export`): the binding opens / closes the Export menu (`reduceMenu`) */
  | { type: 'exportMenu' }
  /**
   * An Export menu item (or its copy in the More menu): the binding runs `download(format)`, or
   * `print()` for `'print'`, with `trigger: 'toolbar'`
   */
  | { type: 'export'; format: GanttExportFormat };

/** One built-in control: a `button` element. */
export interface ToolbarItem {
  /**
   * `data-focus-key` of the button, unique in the toolbar and stable across paints (also the
   * key for keyed lists): `panel`, `undo`, `redo`, `zoom-out`, `zoom-in`, `fit`,
   * `zoom:<level name>`, `today`, `view:<view>`, `export`, `more`; an Export menu item
   * (`ToolbarGroup.menu`) `export:<format>`.
   */
  focusKey: string;
  /**
   * `class` of the button: `gantt-tb-btn`, `gantt-tb-btn gantt-tb-today`, `gantt-tb-pill`,
   * `gantt-tb-btn gantt-tb-panel`, `gantt-tb-btn gantt-tb-undo`, `gantt-tb-btn gantt-tb-redo`,
   * `gantt-tb-btn gantt-tb-export` or `gantt-tb-btn gantt-tb-more`; an Export menu item
   * `gantt-tb-menu-item` (painted as its `ToolbarMenuItem`)
   */
  className: string;
  /** `role` attribute: `'radio'` for zoom levels and views, `null` for plain buttons (no attribute) */
  role: 'radio' | null;
  /** `aria-checked` of a radio (`null` on plain buttons: no attribute) */
  checked: boolean | null;
  /** Icon drawn first inside the button (`TOOLBAR_ICONS[icon]`), or none */
  icon: ToolbarIcon | null;
  /**
   * Visible text: the zoom level's label, or the today label in `span.gantt-tb-label` after the
   * icon. `null` for icon-only controls, which carry `ariaLabel` and `title` instead.
   */
  text: string | null;
  /** `aria-label` (icon-only controls), or `null` when the visible text names the control */
  ariaLabel: string | null;
  /** `title` tooltip (icon-only controls), or `null` for no attribute */
  title: string | null;
  /** `aria-pressed` of a toggle button (the panel toggle: the task list shows), `null` for no attribute */
  pressed: boolean | null;
  /** `aria-haspopup` (`'menu'` on the More and Export buttons), `null` for no attribute */
  haspopup: 'menu' | null;
  /** `aria-expanded` of the More and Export buttons (their menu is open), `null` for no attribute */
  expanded: boolean | null;
  /**
   * `aria-disabled`: `true` on Undo / Redo while there is nothing to undo / redo (the button stays
   * focusable and in the roving set; pressing it does nothing), otherwise `null` for no attribute.
   * The model never sets `false`.
   */
  disabled: boolean | null;
  action: ToolbarAction;
}

/**
 * Which built-in group: `panel` (the task list toggle), `history` (undo · redo), `zoom` (out · in ·
 * fit), `levels`, `today`, `views`, `export` (the Export menu button, `toolbar.export`), `more`
 * (the More menu button, added by `layoutToolbar`).
 */
export type ToolbarGroupKey = 'panel' | 'history' | 'zoom' | 'levels' | 'today' | 'views' | 'export' | 'more';

/** One `div` of the toolbar, holding its controls in order. */
export interface ToolbarGroup {
  key: ToolbarGroupKey;
  /** `class` of the group div (today's paint keys) */
  className: string;
  /** `role` attribute: `'radiogroup'` for zoom levels and views, otherwise `null` (no attribute) */
  role: 'radiogroup' | null;
  /** `aria-label` of a radio group, otherwise `null` */
  ariaLabel: string | null;
  /** Never empty: a group with no control is left out */
  items: ToolbarItem[];
  /**
   * The items of the menu the group's button opens: the export group's format items (`export`
   * actions, in `export.formats` order), `null` on every other group. A group moved into the More
   * menu becomes a section of these items (`menu ?? items`)
   */
  menu: readonly ToolbarItem[] | null;
}

export interface ToolbarInput {
  /** Resolved `options.toolbar` (`false` = no toolbar: no groups) */
  toolbar: ResolvedToolbar | false;
  /** Resolved zoom levels; `toolbar.viewModes` names those offered as radios */
  zoomLevels: readonly GanttZoomLevel[];
  labels: ToolbarLabels;
  /** Name of the current zoom level (checks its radio) */
  viewMode: string;
  /** Current view (checks its radio; the panel toggle is pressed unless it is `'chart'`) */
  view: GanttView;
  /**
   * The chart's undo / redo state while it keeps history (`ResolvedEditing.history`), else `null`
   * or omitted: no Undo / Redo buttons. Read by the `history` group (Phase 11 step 2.6).
   */
  history?: GanttHistoryState | null | undefined;
  /**
   * With `toolbar.export` on: the formats of the Export menu (`ResolvedExport.formats`); `null` or
   * omitted: no export group. Read by the `export` group (Phase 12 step 2.6).
   */
  export?: { formats: readonly GanttExportFormat[] } | null | undefined;
}

const VIEWS: readonly { view: GanttView; icon: ToolbarIcon; label: 'viewSplit' | 'viewTable' | 'viewChart' }[] = [
  { view: 'split', icon: 'viewSplit', label: 'viewSplit' },
  { view: 'table', icon: 'viewTable', label: 'viewTable' },
  { view: 'chart', icon: 'viewChart', label: 'viewChart' },
];

/** The label of each Export menu item, by format (`export.formats`). */
const EXPORT_LABELS: Readonly<
  Record<GanttExportFormat, keyof Pick<ToolbarLabels, 'exportSvg' | 'exportPng' | 'exportCsv' | 'exportPrint'>>
> = { svg: 'exportSvg', png: 'exportPng', csv: 'exportCsv', print: 'exportPrint' };

/** The ARIA states a control does not use: no attribute. */
const NO_STATE = { pressed: null, haspopup: null, expanded: null, disabled: null } as const;

const iconButton = (focusKey: string, icon: ToolbarIcon, label: string, action: ToolbarAction): ToolbarItem => ({
  focusKey,
  className: 'gantt-tb-btn',
  role: null,
  checked: null,
  icon,
  text: null,
  ariaLabel: label,
  title: label,
  ...NO_STATE,
  action,
});

/** Undo or Redo: an icon button, `aria-disabled` while there is nothing to undo / redo. */
const historyButton = (kind: 'undo' | 'redo', label: string, available: boolean): ToolbarItem => ({
  ...iconButton(kind, kind, label, { type: kind }),
  className: `gantt-tb-btn gantt-tb-${kind}`,
  disabled: available ? null : true,
});

/**
 * Whether the task list shows in `view`: in `'split'` and `'table'`, not in `'chart'`. The task
 * list toggle (`toolbar.panelToggle`) is pressed, and titled `labels.hidePanel`, exactly then.
 */
export function taskListShown(view: GanttView): boolean {
  return view !== 'chart';
}

/**
 * The view the task list toggle switches to (`togglePanel()`, the toolbar's task list button, the
 * splitter's toggle): from a view that shows the task list (`'split'`, `'table'`) to the timeline
 * alone (`'chart'`), and from `'chart'` back to `'split'` (the panel at its last width). So the
 * toggle's pressed state and title (`taskListShown`) always say what a press does.
 */
export function togglePanelView(view: GanttView): GanttView {
  return taskListShown(view) ? 'chart' : 'split';
}

/** The configured zoom levels offered as radios, in `viewModes` order: unknown names are skipped, repeats shown once. */
function offeredLevels(names: readonly string[], levels: readonly GanttZoomLevel[]): GanttZoomLevel[] {
  const seen = new Set<string>();
  const out: GanttZoomLevel[] = [];
  for (const name of names) {
    if (seen.has(name)) continue;
    const level = levels.find(l => l.name === name);
    if (!level) continue;
    seen.add(name);
    out.push(level);
  }
  return out;
}

/**
 * A zoom level's name as the toolbar shows it and the live region announces it: its `label`,
 * else `labels.viewModes[name]`, else the name.
 */
export function zoomLevelLabel(
  level: Pick<GanttZoomLevel, 'name' | 'label'>,
  labels: Pick<GanttLabels, 'viewModes'>,
): string {
  return level.label ?? (labels.viewModes as Partial<Record<string, string>>)[level.name] ?? level.name;
}

/**
 * The toolbar's groups in display order, each with its controls; groups that are turned off (or
 * have no control) are left out, so the result is `[]` when nothing is configured. Pure: the same
 * input gives the same groups. The Angular `[ganttToolbar]` content (`div.gantt-tb-slot`) goes
 * between the `today` and `views` groups and is not part of the model nor of the roving set.
 *
 * With `toolbar.panelToggle` the `panel` group comes first: one `aria-pressed` icon button named
 * `labels.ariaTaskList`, pressed while the task list shows (`taskListShown`: any view but
 * `'chart'`) and titled `labels.hidePanel` then, `labels.showPanel` otherwise; pressing it switches
 * to `togglePanelView(view)` (shown → `'chart'`, hidden → `'split'`). Pass the groups to
 * `layoutToolbar` to fit them to the toolbar's width.
 *
 * With `toolbar.undo` and a `history` state (the chart keeps history: `editing.history`, not
 * controlled) the `history` group follows: Undo and Redo icon buttons (`gantt-tb-undo` /
 * `gantt-tb-redo`, focus keys `undo` / `redo`, named by `labels.undo` / `labels.redo`), each
 * `aria-disabled` (`disabled: true`) while `canUndo` / `canRedo` is false. They stay in the roving
 * set and never move into the More menu.
 *
 * With `toolbar.export` and at least one format in `export.formats` the `export` group comes last
 * (after the views): one icon menu button (`gantt-tb-btn gantt-tb-export`, focus key `export`,
 * named and titled by `labels.exportMenu`, `aria-haspopup="menu"`, `aria-expanded` set by
 * `layoutToolbar` from `exportMenuOpen`) in `div.gantt-tb-group.gantt-tb-export-group`. Its `menu`
 * holds one item per format in `formats` order (focus key `export:<format>`, text
 * `labels.exportSvg` / `exportPng` / `exportCsv` / `exportPrint`, action `{ type: 'export', format }`),
 * painted through `ToolbarLayout.exportMenu`. Without them the toolbar is unchanged.
 */
export function buildToolbar(input: ToolbarInput): ToolbarGroup[] {
  const { toolbar, labels, viewMode, view } = input;
  if (toolbar === false) return [];
  const groups: ToolbarGroup[] = [];
  const push = (group: Omit<ToolbarGroup, 'items' | 'menu'>, items: ToolbarItem[]): void => {
    if (items.length) groups.push({ ...group, items, menu: null });
  };

  if (toolbar.panelToggle) {
    const shown = taskListShown(view);
    push({ key: 'panel', className: 'gantt-tb-group gantt-tb-panel-group', role: null, ariaLabel: null }, [
      {
        focusKey: 'panel',
        className: 'gantt-tb-btn gantt-tb-panel',
        role: null,
        checked: null,
        icon: 'panel',
        text: null,
        ariaLabel: labels.ariaTaskList,
        title: shown ? labels.hidePanel : labels.showPanel,
        pressed: shown,
        haspopup: null,
        expanded: null,
        disabled: null,
        action: { type: 'togglePanel' },
      },
    ]);
  }

  const history = input.history;
  if (toolbar.undo && history) {
    push({ key: 'history', className: 'gantt-tb-group gantt-tb-history', role: null, ariaLabel: null }, [
      historyButton('undo', labels.undo, history.canUndo),
      historyButton('redo', labels.redo, history.canRedo),
    ]);
  }

  const zoom: ToolbarItem[] = [];
  if (toolbar.zoom) {
    zoom.push(iconButton('zoom-out', 'zoomOut', labels.zoomOut, { type: 'zoomOut' }));
    zoom.push(iconButton('zoom-in', 'zoomIn', labels.zoomIn, { type: 'zoomIn' }));
  }
  if (toolbar.fit) zoom.push(iconButton('fit', 'fit', labels.fitToScreen, { type: 'fit' }));
  push({ key: 'zoom', className: 'gantt-tb-group', role: null, ariaLabel: null }, zoom);

  const levels =
    toolbar.viewModes === false
      ? []
      : offeredLevels(toolbar.viewModes, input.zoomLevels).map((level): ToolbarItem => ({
          focusKey: `zoom:${level.name}`,
          className: 'gantt-tb-pill',
          role: 'radio',
          checked: level.name === viewMode,
          icon: null,
          text: zoomLevelLabel(level, labels),
          ariaLabel: null,
          title: null,
          ...NO_STATE,
          action: { type: 'zoomLevel', level: level.name },
        }));
  push(
    { key: 'levels', className: 'gantt-tb-group gantt-tb-pills', role: 'radiogroup', ariaLabel: labels.ariaZoomLevels },
    levels,
  );

  if (toolbar.today) {
    push({ key: 'today', className: 'gantt-tb-group', role: null, ariaLabel: null }, [
      {
        focusKey: 'today',
        className: 'gantt-tb-btn gantt-tb-today',
        role: null,
        checked: null,
        icon: 'today',
        text: labels.todayButton,
        ariaLabel: null,
        title: null,
        ...NO_STATE,
        action: { type: 'today' },
      },
    ]);
  }

  if (toolbar.viewToggle) {
    push(
      {
        key: 'views',
        className: 'gantt-tb-group gantt-tb-pills gantt-tb-views',
        role: 'radiogroup',
        ariaLabel: labels.ariaViews,
      },
      VIEWS.map(v => ({
        focusKey: `view:${v.view}`,
        className: 'gantt-tb-pill',
        role: 'radio',
        checked: v.view === view,
        icon: v.icon,
        text: null,
        ariaLabel: labels[v.label],
        title: labels[v.label],
        ...NO_STATE,
        action: { type: 'view', view: v.view },
      })),
    );
  }

  // Known formats, each once, in the given order (`resolveConfig` already filters them)
  const formats = toolbar.export
    ? (input.export?.formats ?? []).filter((f, i, all) => Object.hasOwn(EXPORT_LABELS, f) && all.indexOf(f) === i)
    : [];
  if (formats.length) {
    groups.push({
      key: 'export',
      className: 'gantt-tb-group gantt-tb-export-group',
      role: null,
      ariaLabel: null,
      items: [
        {
          ...iconButton('export', 'export', labels.exportMenu, { type: 'exportMenu' }),
          className: 'gantt-tb-btn gantt-tb-export',
          haspopup: 'menu',
          expanded: false,
        },
      ],
      menu: formats.map((format): ToolbarItem => ({
        focusKey: `export:${format}`,
        className: 'gantt-tb-menu-item',
        role: null,
        checked: null,
        icon: null,
        text: labels[EXPORT_LABELS[format]],
        ariaLabel: null,
        title: null,
        ...NO_STATE,
        action: { type: 'export', format },
      })),
    });
  }
  return groups;
}

/** Every control of `groups` in display (and roving) order. */
export function toolbarItems(groups: readonly ToolbarGroup[]): ToolbarItem[] {
  return groups.flatMap(g => g.items);
}

/**
 * The `focusKey` of the toolbar's single tab stop (`tabindex=0`; every other control gets `-1`):
 * the control focused last while it is still shown, otherwise the first control that is not
 * `aria-disabled` (so Tab doesn't land on an unavailable Undo), else the first control. `null`
 * when the toolbar has no control.
 */
export function toolbarTabStop(items: readonly ToolbarItem[], lastFocusKey: string | null | undefined): string | null {
  if (lastFocusKey != null && items.some(i => i.focusKey === lastFocusKey)) return lastFocusKey;
  return (items.find(i => i.disabled !== true) ?? items[0])?.focusKey ?? null;
}

/**
 * Where a roving key moves the focus from `currentKey`: `move.left` / `move.right` step to the
 * previous / next control and wrap around, `move.home` / `move.end` go to the first / last
 * control (resolve the key with `resolveKey(event, 'toolbar')`, which already swaps the arrows
 * in RTL). Returns the target `focusKey` (possibly `currentKey` itself), or `null` for any other
 * command or an empty toolbar. A `currentKey` not in `items` moves as if before the first control.
 */
export function toolbarFocusMove(
  items: readonly ToolbarItem[],
  currentKey: string | null | undefined,
  command: MoveCommand,
): string | null {
  const n = items.length;
  if (!n) return null;
  const at = items.findIndex(i => i.focusKey === currentKey);
  let next: number;
  switch (command) {
    case 'move.left':
      next = at < 0 ? n - 1 : (at - 1 + n) % n;
      break;
    case 'move.right':
      next = at < 0 ? 0 : (at + 1) % n;
      break;
    case 'move.home':
      next = 0;
      break;
    case 'move.end':
      next = n - 1;
      break;
    default:
      return null;
  }
  return items[next]?.focusKey ?? null;
}

// ─── Overflow: width estimate, layout and the More menu ───────

/** `font-size` of the toolbar's text in px (`.gantt-tb-btn`, `.gantt-tb-pill`): `fontPx` of `layoutToolbar`. */
export const TOOLBAR_FONT_PX = 12;

/**
 * The toolbar CSS the estimate mirrors (both painters' `.gantt-toolbar` rules): inline padding of
 * the toolbar, the column gap and the separator (padding + border) before every group but the
 * first, the gap between a group's controls, a control's inline padding and border, the icon and
 * the icon-to-label gap. `charEm` is the advance of an average Latin glyph in em, on the generous
 * side; wide (CJK, full-width) glyphs count 1 em and combining marks 0.
 */
const METRICS = {
  padInline: 10,
  groupGap: 10,
  groupSep: 11,
  itemGap: 2,
  ctrlPad: 7,
  ctrlBorder: 1,
  icon: TOOLBAR_ICON_SIZE,
  iconGap: 6,
  charEm: 0.6,
} as const;

/**
 * Groups moved into the More menu while the toolbar is too narrow, in this order: the Export
 * button first (its items become a More section, never a nested menu), then the zoom levels, the
 * views and today. The panel toggle, the history group (undo · redo) and the zoom buttons never
 * move. A group the toolbar doesn't have is skipped.
 */
export const TOOLBAR_OVERFLOW_ORDER: readonly ToolbarGroupKey[] = ['export', 'levels', 'views', 'today'];

/** Sizes `estimateToolbarWidth` reads. */
export interface ToolbarMetricsInput {
  /** Minimum control size in px (`ResolvedGanttConfig.controlSize`: 28 / 32 / 36 by density) */
  controlSize: number;
  /** Text size in px (default `TOOLBAR_FONT_PX`) */
  fontPx?: number | undefined;
}

/** Width of `text` in em: wide glyphs 1, combining marks 0, everything else `METRICS.charEm`. */
function textEm(text: string): number {
  let em = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0x300 && c <= 0x36f) || (c >= 0x200b && c <= 0x200f) || c === 0xfe0f) continue;
    const wide =
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe4f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) ||
      c >= 0x1f300;
    em += wide ? 1 : METRICS.charEm;
  }
  return em;
}

/** Estimated border-box width of one control: icon, label and padding, at least `controlSize`. */
function controlWidth(item: ToolbarItem, controlSize: number, fontPx: number): number {
  const icon = item.icon ? METRICS.icon : 0;
  const text = item.text === null ? 0 : textEm(item.text) * fontPx;
  const gap = icon && text ? METRICS.iconGap : 0;
  const content = icon + gap + text;
  return Math.max(controlSize, content + 2 * (METRICS.ctrlPad + METRICS.ctrlBorder));
}

/**
 * Estimated width in px the toolbar needs to show `groups` on one line: its inline padding, the
 * gap and separator between groups and every control (icons, labels at `fontPx` with an average
 * glyph width, padding, at least `controlSize` square). Deterministic and DOM-free, on the generous
 * side so a toolbar estimated to fit does fit; `0` for no group. Content outside the model (the
 * legend in the toolbar, Angular's `[ganttToolbar]` slot) is not counted, nor are menu items
 * (`ToolbarGroup.menu`: the export formats open in a popup; the Export button is counted).
 */
export function estimateToolbarWidth(groups: readonly ToolbarGroup[], metrics: ToolbarMetricsInput): number {
  if (!groups.length) return 0;
  const fontPx = metrics.fontPx ?? TOOLBAR_FONT_PX;
  let width = 2 * METRICS.padInline + (groups.length - 1) * (METRICS.groupGap + METRICS.groupSep);
  for (const group of groups) {
    width += Math.max(0, group.items.length - 1) * METRICS.itemGap;
    for (const item of group.items) width += controlWidth(item, metrics.controlSize, fontPx);
  }
  return Math.ceil(width);
}

/** One item of the More menu: a moved control. */
export interface ToolbarMenuItem {
  /**
   * `data-focus-key`: `menu:` + the control's toolbar focus key (`menu:zoom:Day`, `menu:view:table`,
   * `menu:today`, `menu:export:svg`)
   */
  focusKey: string;
  /** `class` of the `button`: always `gantt-tb-menu-item` */
  className: string;
  /**
   * `role`: `'menuitemradio'` for a radio (zoom levels, views), `'menuitemcheckbox'` for a toggle
   * button, `'menuitem'` for a plain button (today)
   */
  role: 'menuitem' | 'menuitemradio' | 'menuitemcheckbox';
  /** `aria-checked` (radios and toggles), `null` on a plain `menuitem` (no attribute) */
  checked: boolean | null;
  /** Icon drawn first (`TOOLBAR_ICONS[icon]`), or none */
  icon: ToolbarIcon | null;
  /** Visible text, `span.gantt-tb-label` after an icon: the control's text, else its accessible name */
  text: string;
  /** Run on activation (Enter / Space / click), like the toolbar control it stands for */
  action: ToolbarAction;
}

/** One `div.gantt-tb-menu-group[role=group]` of the More menu: a moved toolbar group. */
export interface ToolbarMenuSection {
  /** The toolbar group it comes from */
  key: ToolbarGroupKey;
  /** `class` of the group div: always `gantt-tb-menu-group` */
  className: string;
  /**
   * `aria-label` of the group (the radio groups' labels; the export section of the More menu: the
   * Export button's name, `labels.exportMenu`), `null` for no attribute (today; the Export menu's
   * own section, as the menu is named)
   */
  ariaLabel: string | null;
  items: ToolbarMenuItem[];
}

export interface ToolbarLayoutInput {
  /** `buildToolbar()` */
  groups: readonly ToolbarGroup[];
  /**
   * Width in px the toolbar has for its built-in groups: the chart's width (the toolbar's border
   * box) minus content outside the model (the legend in the toolbar, Angular's slot). `0` or less
   * (not measured yet, hidden, SSR): every group shows.
   */
  width: number;
  /** `ResolvedGanttConfig.controlSize` */
  controlSize: number;
  /** Text size in px (default `TOOLBAR_FONT_PX`) */
  fontPx?: number | undefined;
  /** `ResolvedToolbar.overflow`: `'wrap'` never builds a menu */
  overflow: 'menu' | 'wrap';
  labels: Pick<GanttLabels, 'more'>;
  /** The More menu is open: `aria-expanded` of the More button (default `false`) */
  menuOpen?: boolean | undefined;
  /** The Export menu is open: `aria-expanded` of the Export button (default `false`) */
  exportMenuOpen?: boolean | undefined;
}

export interface ToolbarLayout {
  /** The groups to paint: `groups` without the moved ones, plus the `more` group last */
  groups: ToolbarGroup[];
  /** The More menu's sections in display order, or `null` when every group shows (no More button) */
  menu: ToolbarMenuSection[] | null;
  /**
   * The Export menu: one section (the export group's `menu` items) while the export group shows
   * in the toolbar, `null` otherwise (no export group, or moved into More)
   */
  exportMenu: ToolbarMenuSection[] | null;
}

/** The More button's group (`div.gantt-tb-group.gantt-tb-more-group`). */
function moreGroup(labels: Pick<GanttLabels, 'more'>, open: boolean): ToolbarGroup {
  return {
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
        ariaLabel: labels.more,
        title: labels.more,
        pressed: null,
        haspopup: 'menu',
        expanded: open,
        disabled: null,
        action: { type: 'menu' },
      },
    ],
  };
}

/** A toolbar control as a menu item. */
function menuItem(item: ToolbarItem): ToolbarMenuItem {
  const role = item.role === 'radio' ? 'menuitemradio' : item.pressed !== null ? 'menuitemcheckbox' : 'menuitem';
  return {
    focusKey: `menu:${item.focusKey}`,
    className: 'gantt-tb-menu-item',
    role,
    checked: role === 'menuitemradio' ? item.checked === true : role === 'menuitemcheckbox' ? item.pressed : null,
    icon: item.icon,
    text: item.text ?? item.ariaLabel ?? item.title ?? '',
    action: item.action,
  };
}

/**
 * The Export menu of a group with a menu (the export group, `ToolbarGroup.menu`): one
 * `gantt-tb-menu-group` section of its format items as menu items (`menuitem`, focus keys
 * `menu:export:<format>`), unnamed (the menu itself carries `labels.exportMenu`). `[]` for a group
 * without a menu. `layoutToolbar` returns it as `ToolbarLayout.exportMenu` while the group shows.
 */
export function exportMenuSections(group: ToolbarGroup): ToolbarMenuSection[] {
  if (!group.menu?.length) return [];
  return [{ key: group.key, className: 'gantt-tb-menu-group', ariaLabel: null, items: group.menu.map(menuItem) }];
}

/**
 * A group moved into the More menu as one section: its menu's items when it has one (the export
 * formats, named by the group's button: a menu is never nested), else its controls.
 */
function moreSection(group: ToolbarGroup): ToolbarMenuSection {
  return {
    key: group.key,
    className: 'gantt-tb-menu-group',
    ariaLabel: group.menu ? (group.ariaLabel ?? group.items[0]?.ariaLabel ?? null) : group.ariaLabel,
    items: (group.menu ?? group.items).map(menuItem),
  };
}

/** `groups` with the Export button's `aria-expanded` set to `open` (the same group objects where it already is). */
function withExportExpanded(groups: readonly ToolbarGroup[], open: boolean): ToolbarGroup[] {
  return groups.map(g =>
    g.key === 'export' && g.items[0]?.expanded !== open
      ? { ...g, items: g.items.map(i => (i.action.type === 'exportMenu' ? { ...i, expanded: open } : i)) }
      : g,
  );
}

/** `ToolbarLayout.exportMenu` for the groups that show: the export group's menu, else `null`. */
function exportMenuOf(shown: readonly ToolbarGroup[]): ToolbarMenuSection[] | null {
  const group = shown.find(g => g.key === 'export');
  return group ? exportMenuSections(group) : null;
}

/**
 * Fit the toolbar to `width`: with `overflow: 'menu'`, while the groups don't fit
 * (`estimateToolbarWidth`), move the export group, then the zoom levels, then the views, then today
 * into a More menu (`TOOLBAR_OVERFLOW_ORDER`), stopping as soon as the rest and the More button fit.
 * The panel toggle, Undo / Redo and the zoom buttons always stay (`estimateToolbarWidth` counts
 * them); whatever still doesn't fit wraps (CSS). A toolbar that fits, an unmeasured width and
 * `overflow: 'wrap'` give the groups as they are and no menu, so the output only changes while the
 * toolbar is too narrow. The More sections keep the display order; a moved export group becomes a
 * section of its format items named `labels.exportMenu` (never a nested menu).
 *
 * The export group (`toolbar.export`): its button's `aria-expanded` follows `exportMenuOpen`, and
 * `exportMenu` holds its menu (`exportMenuSections`) while it shows in the toolbar; `null` without
 * it or once it has moved into More. Without an export group the layout is the one before Phase 12.
 */
export function layoutToolbar(input: ToolbarLayoutInput): ToolbarLayout {
  const { width } = input;
  const groups = withExportExpanded(input.groups, input.exportMenuOpen === true);
  const all: ToolbarLayout = { groups, menu: null, exportMenu: exportMenuOf(groups) };
  if (input.overflow !== 'menu' || !(width > 0) || !groups.length) return all;
  const metrics: ToolbarMetricsInput = { controlSize: input.controlSize, fontPx: input.fontPx };
  if (estimateToolbarWidth(groups, metrics) <= width) return all;

  const more = moreGroup(input.labels, input.menuOpen === true);
  const moved = new Set<ToolbarGroupKey>();
  for (const key of TOOLBAR_OVERFLOW_ORDER) {
    if (!groups.some(g => g.key === key)) continue;
    moved.add(key);
    const kept = groups.filter(g => !moved.has(g.key));
    if (estimateToolbarWidth([...kept, more], metrics) <= width) break;
  }
  if (!moved.size) return all;
  const kept = groups.filter(g => !moved.has(g.key));
  return {
    groups: [...kept, more],
    menu: groups.filter(g => moved.has(g.key)).map(moreSection),
    exportMenu: exportMenuOf(kept),
  };
}

/**
 * Every item of a menu (`ToolbarLayout.menu`: More, or `ToolbarLayout.exportMenu`: Export) in
 * display (and arrow-key) order: `reduceMenu`'s `count` and indexes.
 */
export function toolbarMenuItems(menu: readonly ToolbarMenuSection[] | null): ToolbarMenuItem[] {
  return menu ? menu.flatMap(s => s.items) : [];
}

/** Index of the first checked menu item (where the menu opens), or `-1`. */
export function toolbarMenuChecked(items: readonly ToolbarMenuItem[]): number {
  return items.findIndex(i => i.checked === true);
}
