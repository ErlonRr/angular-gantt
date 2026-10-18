// ─────────────────────────────────────────────────────────────
//  gantry · state/toolbar.ts
//  Toolbar model: groups, items, icons and the roving tab stop (step 2.6).
//  Both painters render `buildToolbar()` as is, so they show the same
//  controls in the same order with the same classes, roles and names:
//
//    div.gantt-toolbar[role=toolbar]
//      div.gantt-tb-group                           zoom out · zoom in · fit    (icon buttons)
//      div.gantt-tb-group.gantt-tb-pills            zoom levels                 (text radios)
//      div.gantt-tb-group                           today                       (icon + text)
//      div.gantt-tb-group.gantt-tb-pills.gantt-tb-views
//                                                   split · table · chart       (icon radios)
//
//  The built-in controls form one roving set (WAI-ARIA toolbar): one
//  tab stop (`toolbarTabStop`), arrow keys move and wrap
//  (`toolbarFocusMove`), and a radio is checked by Space / Enter / click,
//  never by moving focus onto it.
// ─────────────────────────────────────────────────────────────

import type { GanttLabels, GanttView, GanttZoomLevel } from '../types';
import type { ResolvedToolbar } from '../render/config';
import type { MoveCommand } from '../interaction/keymap';

// ─── Icons ────────────────────────────────────────────────────

/** The toolbar's built-in icons. */
export type ToolbarIcon = 'zoomIn' | 'zoomOut' | 'fit' | 'today' | 'viewSplit' | 'viewTable' | 'viewChart';

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
/** Rounded frame of the view icons */
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
>;

/** What a toolbar control does when pressed (or, for a radio, checked). */
export type ToolbarAction =
  | { type: 'zoomOut' }
  | { type: 'zoomIn' }
  | { type: 'fit' }
  | { type: 'today' }
  | { type: 'zoomLevel'; level: string }
  | { type: 'view'; view: GanttView };

/** One built-in control: a `button` element. */
export interface ToolbarItem {
  /**
   * `data-focus-key` of the button, unique in the toolbar and stable across paints (also the
   * key for keyed lists): `zoom-out`, `zoom-in`, `fit`, `zoom:<level name>`, `today`, `view:<view>`.
   */
  focusKey: string;
  /** `class` of the button: `gantt-tb-btn`, `gantt-tb-btn gantt-tb-today` or `gantt-tb-pill` */
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
  action: ToolbarAction;
}

/** Which built-in group: `zoom` (out · in · fit), `levels`, `today`, `views`. */
export type ToolbarGroupKey = 'zoom' | 'levels' | 'today' | 'views';

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
}

export interface ToolbarInput {
  /** Resolved `options.toolbar` (`false` = no toolbar: no groups) */
  toolbar: ResolvedToolbar | false;
  /** Resolved zoom levels; `toolbar.viewModes` names those offered as radios */
  zoomLevels: readonly GanttZoomLevel[];
  labels: ToolbarLabels;
  /** Name of the current zoom level (checks its radio) */
  viewMode: string;
  /** Current view (checks its radio) */
  view: GanttView;
}

const VIEWS: readonly { view: GanttView; icon: ToolbarIcon; label: 'viewSplit' | 'viewTable' | 'viewChart' }[] = [
  { view: 'split', icon: 'viewSplit', label: 'viewSplit' },
  { view: 'table', icon: 'viewTable', label: 'viewTable' },
  { view: 'chart', icon: 'viewChart', label: 'viewChart' },
];

const iconButton = (focusKey: string, icon: ToolbarIcon, label: string, action: ToolbarAction): ToolbarItem => ({
  focusKey,
  className: 'gantt-tb-btn',
  role: null,
  checked: null,
  icon,
  text: null,
  ariaLabel: label,
  title: label,
  action,
});

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
 */
export function buildToolbar(input: ToolbarInput): ToolbarGroup[] {
  const { toolbar, labels, viewMode, view } = input;
  if (toolbar === false) return [];
  const groups: ToolbarGroup[] = [];
  const push = (group: Omit<ToolbarGroup, 'items'>, items: ToolbarItem[]): void => {
    if (items.length) groups.push({ ...group, items });
  };

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
        action: { type: 'view', view: v.view },
      })),
    );
  }
  return groups;
}

/** Every control of `groups` in display (and roving) order. */
export function toolbarItems(groups: readonly ToolbarGroup[]): ToolbarItem[] {
  return groups.flatMap(g => g.items);
}

/**
 * The `focusKey` of the toolbar's single tab stop (`tabindex=0`; every other control gets `-1`):
 * the control focused last while it is still shown, otherwise the first control. `null` when
 * the toolbar has no control.
 */
export function toolbarTabStop(items: readonly ToolbarItem[], lastFocusKey: string | null | undefined): string | null {
  if (lastFocusKey != null && items.some(i => i.focusKey === lastFocusKey)) return lastFocusKey;
  return items[0]?.focusKey ?? null;
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
