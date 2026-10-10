// ─────────────────────────────────────────────────────────────
//  gantry · types.ts
//  Single source of truth for all domain types.
//  Framework-free — usable in Node / Vitest / SSR and by every
//  framework binding (Angular, Web Component, React, Vue, Svelte).
// ─────────────────────────────────────────────────────────────

import type { BarVisual } from './render/bars';

// ─── Enums ───────────────────────────────────────────────────

// Erasable `as const` objects (not TS enums): `ViewMode.Week` reads the same, the type is the
// union of the values, and plain strings such as `'Week'` are accepted too.

export const ViewMode = {
  Hour: 'Hour',
  Day: 'Day',
  Week: 'Week',
  Month: 'Month',
  Quarter: 'Quarter',
  Year: 'Year',
} as const;
export type ViewMode = (typeof ViewMode)[keyof typeof ViewMode];
// Type-only namespace (erased at build): keeps member types such as `let m: ViewMode.Week` working
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace ViewMode {
  type Hour = typeof ViewMode.Hour;
  type Day = typeof ViewMode.Day;
  type Week = typeof ViewMode.Week;
  type Month = typeof ViewMode.Month;
  type Quarter = typeof ViewMode.Quarter;
  type Year = typeof ViewMode.Year;
}

export const DependencyType = {
  /** Finish → Start (default) */
  FS: 'FS',
  /** Finish → Finish */
  FF: 'FF',
  /** Start → Finish */
  SF: 'SF',
  /** Start → Start */
  SS: 'SS',
} as const;
export type DependencyType = (typeof DependencyType)[keyof typeof DependencyType];
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace DependencyType {
  type FS = typeof DependencyType.FS;
  type FF = typeof DependencyType.FF;
  type SF = typeof DependencyType.SF;
  type SS = typeof DependencyType.SS;
}

export const TaskType = {
  Task: 'task',
  Milestone: 'milestone',
  /** Parent that collapses children */
  Group: 'group',
} as const;
export type TaskType = (typeof TaskType)[keyof typeof TaskType];
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace TaskType {
  type Task = typeof TaskType.Task;
  type Milestone = typeof TaskType.Milestone;
  type Group = typeof TaskType.Group;
}

// ─── Core domain objects ──────────────────────────────────────

export interface GanttDependency {
  /** ID of the predecessor task */
  taskId: string;
  type?: DependencyType | undefined;
  /** Lag in days — positive = delay, negative = lead */
  lag?: number | undefined;
}

export interface GanttBaseline {
  start: Date;
  end: Date;
}

/**
 * Raw task as provided by the consumer.
 * Dates are native `Date` objects — no format strings needed.
 */
export interface GanttTask {
  id: string;
  name: string;
  start: Date;
  end: Date;
  progress?: number | undefined; // 0–100
  type?: TaskType | undefined;
  parentId?: string | undefined;
  collapsed?: boolean | undefined;
  dependency?: string | GanttDependency | GanttDependency[] | undefined;

  /** Custom bar type key — resolved via GanttBarRegistry */
  barType?: string | undefined;

  /** Per-task style overrides */
  barColor?: string | undefined;
  rowColor?: string | undefined;
  /** Text colour of the bar label */
  textColor?: string | undefined;
  progressColor?: string | undefined;
  /** Extra CSS class on the bar element */
  className?: string | undefined;

  /** Planned baseline dates for variance visualisation */
  baseline?: GanttBaseline | undefined;

  /**
   * Timeline drag & resize for this row. Applies to any row (root, child, group).
   * When `false`, the bar does not move or resize; when omitted or `true`, the
   * global `enableDrag` / `enableResize` on the gantt apply.
   */
  draggable?: boolean | undefined;

  /**
   * Explicit status from your data; wins over the derived one (built-in `status` column).
   * Built-in values are translated (`labels.status*`), any other string is shown as is.
   * Default: derived from progress, dates and now (see `taskStatus`).
   */
  status?: TaskStatus | (string & {}) | undefined;

  /** Arbitrary extra data — passed through to bar components */
  data?: Record<string, unknown> | undefined;
}

/** Lifecycle status of a task (built-in `status` column). */
export type TaskStatus = 'notStarted' | 'inProgress' | 'overdue' | 'done';

// ─── Flat model (internal, after tree processing) ─────────────

export interface GanttFlatRow {
  task: GanttTask;
  level: number;
  /** Index in the fully-visible flat array (used for Y coordinate) */
  visibleIndex: number;
  hasChildren: boolean;
  isCollapsed: boolean;
  /** true when any ancestor is collapsed — row is hidden */
  hidden: boolean;
  /** Resolved bar type (task.barType ?? TaskType.Task) */
  barType: string;
}

// ─── Geometry (computed by GanttLayoutService) ────────────────

export interface RowGeometry {
  row: GanttFlatRow;
  /** Top-left Y of the row in the SVG canvas */
  y: number;
  /** Height of the row (= rowHeight option) */
  height: number;
  /** Left edge of the task bar in SVG x-coordinates */
  barX: number;
  /** Width of the task bar */
  barWidth: number;
  /** Width of the progress fill (barWidth * progress / 100) */
  progressWidth: number;
}

// ─── Header cells ─────────────────────────────────────────────

export interface HeaderCell {
  label: string;
  /** SVG x start */
  x: number;
  width: number;
  /** ISO date string of the period start */
  dateKey: string;
}

export interface HeaderRow {
  cells: HeaderCell[];
  /** Row height in px */
  height: number;
}

// ─── Columns ─────────────────────────────────────────────────

/** Keys of the built-in columns, usable in `panel.columns` / `table.columns` without a ColumnDef. */
export type BuiltinColumnKey =
  | 'id'
  | 'name'
  | 'type'
  | 'status'
  | 'start'
  | 'end'
  | 'duration'
  | 'progress'
  | 'predecessors'
  | 'baselineStart'
  | 'baselineEnd'
  | 'variance';

/** Per-render values for time- and data-dependent cells (built by `buildColumnContext`). */
export interface ColumnContext {
  /** The instant cells are evaluated at (the bindings' per-minute clock) */
  now: Date;
  endDateMode: 'exclusive' | 'inclusive';
  normalizeDateOnly: boolean;
  locale?: string | undefined;
  /** Every loaded task by id (predecessor names) */
  taskById: ReadonlyMap<string, GanttTask>;
  /** Numeric, locale-aware string comparison ("Task 2" < "Task 10") */
  collator: Intl.Collator;
}

/** Cell text. `ctx` carries "now", the date reading and the task index (always passed by the bindings). */
export type ColumnRenderer = (row: GanttFlatRow, ctx?: ColumnContext) => string;

/** Value a column sorts by; `null` / `undefined` sort last. */
export type ColumnSortValue = string | number | Date | boolean | null | undefined;

/** Context bound to a `<ng-template ganttColumn>` cell: `let-row` / `let-row="row"` / `let-ctx="ctx"` */
export interface ColumnCellContext {
  $implicit: GanttFlatRow;
  row: GanttFlatRow;
  ctx: ColumnContext;
}

/**
 * Column definition. `TTemplate` is the framework-specific cell template
 * type (e.g. Angular's `TemplateRef<ColumnCellContext>`); framework-free
 * consumers can ignore it and use `render` instead.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ColumnDef<TTemplate = any> {
  key: string;
  label: string;
  /** Initial width in px */
  width: number;
  minWidth?: number | undefined;
  maxWidth?: number | undefined;
  /** Default visibility in both views (default true). A key listed in `panel.columns` / `table.columns` shows anyway. */
  visible?: boolean | undefined;
  sortable?: boolean | undefined;
  /** Custom cell renderer — returns the cell text */
  render?: ColumnRenderer | undefined;
  /** Value the column sorts by. Default: the built-in rule for built-in keys, else `task[key]`. Empty values sort last. */
  sortValue?: ((row: GanttFlatRow, ctx: ColumnContext) => ColumnSortValue) | undefined;
  /** Framework-specific cell template (e.g. Angular `<ng-template ganttColumn>`) */
  cellTemplate?: TTemplate | undefined;
  /** Used internally to mark built-in columns */
  builtin?: boolean | undefined;
  /** Allow resizing by dragging the header edge (default true) */
  resizable?: boolean | undefined;
  /** Cell text alignment (default 'start') */
  align?: 'start' | 'center' | 'end' | undefined;
  /**
   * When you pass `columns` without `panel.columns`: leave this column out of the split-view
   * panel (it still shows in `view: 'table'`). Ignored for keys listed explicitly. Default false.
   */
  tableOnly?: boolean | undefined;
  /** Grow to fill the remaining panel width (default: the last column grows) */
  flex?: boolean | undefined;
}

// ─── Annotations ─────────────────────────────────────────────

export interface AnnotationLabel {
  text: string;
  color?: string | undefined;
  fontSize?: string | undefined;
  fontWeight?: string | undefined;
  offsetY?: number | undefined;
}

export interface GanttAnnotation {
  /** Start date (draws a vertical line) */
  x1: Date;
  /** Optional end date (draws a shaded region x1 → x2) */
  x2?: Date | undefined;
  color?: string | undefined;
  opacity?: number | undefined;
  label?: AnnotationLabel | undefined;
  /** true = today marker special styling */
  isToday?: boolean | undefined;
}

// ─── Theme ───────────────────────────────────────────────────

/** Theme overrides: any subset of tokens; an `undefined` token keeps the built-in value. */
export type GanttThemeOverrides = { [K in keyof GanttTheme]?: GanttTheme[K] | undefined };

export interface GanttTheme {
  // Surfaces
  backgroundColor: string;
  headerBackground: string;
  rowBg: string;
  rowBgAlt: string;

  // Bars
  barColor: string;
  barTextColor: string;
  barRadius: string;
  milestoneColor: string;
  baselineColor: string;
  criticalColor: string;

  // Task list
  panelBg: string;
  panelBorder: string;

  // Grid
  borderColor: string;
  gridLine: string;
  todayColor: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  fontFamily: string;
  fontSize: string;

  // Arrows
  arrowColor: string;

  // Tooltip
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;

  // Selection
  selectionBg: string;
  selectionBorder: string;

  // Scrollbar
  scrollbarTrack: string;
  scrollbarThumb: string;

  // Timeline delimiters & non-working time (optional: fall back to the built-in palette)
  /** Strong vertical delimiter between periods (month/year/day boundaries) */
  gridLineMajor?: string;
  weekendBg?: string;
  holidayBg?: string;
  offHoursBg?: string;
  intensiveBg?: string;
  /** Status dots of the built-in `status` column */
  statusNotStarted?: string;
  statusInProgress?: string;
  statusOverdue?: string;
  statusDone?: string;
}

// ─── i18n: UI labels ─────────────────────────────────────────

/**
 * Every user-facing string in the chart. Override any subset via
 * `GanttOptions.labels` (per instance) or `provideGanttLib({ labels })` (global).
 * Interpolated strings are functions so translators keep full control.
 */
export interface GanttLabels {
  // Load-more (lazy datasource)
  loading: string;
  loadMore: string;
  allLoaded: (count: number) => string;
  /** A page of the data source failed to load */
  loadError: string;
  retry: string;
  // Toolbar
  zoomIn: string;
  zoomOut: string;
  todayButton: string;
  /** Toolbar labels per zoom level (built-in `ViewMode`s and custom level names) */
  viewModes: Partial<Record<ViewMode | (string & {}), string>>;
  /** Toolbar: split / table / chart view toggle */
  viewSplit: string;
  viewTable: string;
  viewChart: string;
  /** Splitter toggle button */
  showPanel: string;
  hidePanel: string;
  /** Week label used by `WEEK_FORMATS.label` ("Week 12") */
  week: string;
  // Legend
  legend: string;
  today: string;
  annotation: string;
  // Tooltip
  ttStart: string;
  ttEnd: string;
  ttDuration: string;
  ttProgress: string;
  ttMilestone: string;
  // Header period prefixes (e.g. W12, Q2, H1)
  weekPrefix: string;
  quarterPrefix: string;
  halfPrefix: string;
  // Duration label (tooltip + Duration column)
  durationLessThanDay: string;
  durationDay: string;
  durationDays: (n: number) => string;
  durationWeeks: (w: number) => string;
  durationWeeksDays: (w: number, d: number) => string;
  // Default column headers
  colName: string;
  colStart: string;
  colEnd: string;
  colDuration: string;
  colProgress: string;
  // Table-view columns
  colId: string;
  colType: string;
  colStatus: string;
  colPredecessors: string;
  colBaselineStart: string;
  colBaselineEnd: string;
  colVariance: string;
  statusNotStarted: string;
  statusInProgress: string;
  statusOverdue: string;
  statusDone: string;
  typeTask: string;
  typeMilestone: string;
  typeGroup: string;
  /** Predecessor in the `predecessors` column, e.g. "Design (SS+2d)" */
  dependency: (name: string, type: DependencyType, lagDays: number) => string;
  /** Finish variance against the baseline, e.g. "+3d" / "On schedule" */
  varianceDays: (days: number) => string;
  // Accessibility
  ariaChart: string;
  /** Accessible name of the task list (split panel and table view) */
  ariaTaskList: string;
  ariaExpand: (name: string) => string;
  ariaCollapse: (name: string) => string;
}

export const DEFAULT_LABELS: GanttLabels = {
  loading: 'Loading…',
  loadMore: 'Load more',
  allLoaded: n => `All ${n} tasks loaded`,
  loadError: 'Couldn’t load tasks',
  retry: 'Retry',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  todayButton: 'Today',
  viewModes: {
    [ViewMode.Hour]: 'Hour',
    [ViewMode.Day]: 'Day',
    [ViewMode.Week]: 'Week',
    [ViewMode.Month]: 'Month',
    [ViewMode.Quarter]: 'Quarter',
    [ViewMode.Year]: 'Year',
  },
  viewSplit: 'Gantt',
  viewTable: 'Table',
  viewChart: 'Chart',
  showPanel: 'Show task list',
  hidePanel: 'Hide task list',
  week: 'Week',
  legend: 'Legend',
  today: 'Today',
  annotation: 'Annotation',
  ttStart: 'Start',
  ttEnd: 'End',
  ttDuration: 'Duration',
  ttProgress: 'Progress',
  ttMilestone: 'Milestone',
  weekPrefix: 'W',
  quarterPrefix: 'Q',
  halfPrefix: 'H',
  durationLessThanDay: '< 1 day',
  durationDay: '1 day',
  durationDays: n => `${n} days`,
  durationWeeks: w => `${w}w`,
  durationWeeksDays: (w, d) => `${w}w ${d}d`,
  colName: 'Task Name',
  colStart: 'Start',
  colEnd: 'End',
  colDuration: 'Duration',
  colProgress: '%',
  colId: 'ID',
  colType: 'Type',
  colStatus: 'Status',
  colPredecessors: 'Predecessors',
  colBaselineStart: 'Baseline start',
  colBaselineEnd: 'Baseline end',
  colVariance: 'Variance',
  statusNotStarted: 'Not started',
  statusInProgress: 'In progress',
  statusOverdue: 'Overdue',
  statusDone: 'Done',
  typeTask: 'Task',
  typeMilestone: 'Milestone',
  typeGroup: 'Group',
  dependency: (name, type, lag) =>
    type === DependencyType.FS && !lag
      ? name
      : `${name} (${type}${lag ? `${lag > 0 ? '+' : '−'}${Math.abs(lag)}d` : ''})`,
  varianceDays: days => (days === 0 ? 'On schedule' : `${days > 0 ? '+' : '−'}${Math.abs(days)}d`),
  ariaChart: 'Gantt chart timeline',
  ariaTaskList: 'Tasks',
  ariaExpand: name => `Expand ${name}`,
  ariaCollapse: name => `Collapse ${name}`,
};

// ─── i18n: date & header formats ─────────────────────────────

/** Builds a header label for a given period start date. */
export type HeaderFormatFn = (date: Date) => string;

export interface GanttHeaderFormats {
  top?: HeaderFormatFn | undefined;
  bottom?: HeaderFormatFn | undefined;
}

export interface GanttFormats {
  /** dayjs format string for dates in columns & tooltip */
  dateFormat: string;
  /** Per-view header label overrides — omitted rows use the built-in formatter */
  header?: Partial<Record<ViewMode, GanttHeaderFormats>> | undefined;
}

export const DEFAULT_FORMATS: GanttFormats = {
  dateFormat: 'MMM D, YYYY',
};

/** Resolved i18n bundle passed to the pure header/date formatters. */
export interface GanttI18n {
  locale?: string | undefined;
  labels: GanttLabels;
  formats: GanttFormats;
}

// ─── Configuration building blocks ───────────────────────────

/** px, or a percentage string such as `'60%'` (of the row / container) */
export type GanttLength = number | `${number}%`;

export type TimeUnit = 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface ScaleFormatContext {
  unit: TimeUnit;
  step: number;
  locale?: string | undefined;
  labels: GanttLabels;
  weekStart: 0 | 1;
}

/** dayjs format string (e.g. `'MMM YYYY'`, `'[W]W'`) or a function of the cell's period. */
export type ScaleFormat = string | ((start: Date, end: Date, ctx: ScaleFormatContext) => string);

/** One header tier ("scale"), DHTMLX/SVAR style. Tiers are listed top → bottom. */
export interface GanttScale {
  unit: TimeUnit;
  /** Cell size in `unit`s (e.g. 6 hours, 2 weeks). Default 1 */
  step?: number | undefined;
  format?: ScaleFormat | undefined;
  /** Tier height in px */
  height?: number | undefined;
  /** Extra CSS class for a cell (also used to colour it via your stylesheet) */
  className?: ((start: Date, end: Date) => string | undefined) | undefined;
  /** `'start'` keeps labels pinned to the left edge while scrolling (default for upper tiers) */
  align?: 'center' | 'start' | undefined;
}

/** A named zoom preset: header tiers + horizontal density. */
export interface GanttZoomLevel {
  name: string;
  /** Header tiers, top → bottom; the last one is the finest */
  scales: GanttScale[];
  /** Width of one bottom-tier cell in px (alternative: `pxPerDay`) */
  cellWidth?: number | undefined;
  pxPerDay?: number | undefined;
  /** Toolbar label (default: `labels.viewModes[name]` or `name`) */
  label?: string | undefined;
}

export interface GanttLineStyle {
  color?: string | undefined;
  width?: number | undefined;
  /** SVG dash array, e.g. `'4 3'` */
  dash?: string | undefined;
}

export interface GanttGridLines {
  /** Lines between bottom-tier cells (days, weeks…) */
  minor?: GanttLineStyle | false | undefined;
  /** Period delimiters (month / year / day…) drawn through header and body */
  major?: GanttLineStyle | false | undefined;
  /** Row separators */
  horizontal?: GanttLineStyle | false | undefined;
  /** Unit of the major delimiters (default: the tier above the bottom one) */
  majorUnit?: TimeUnit | undefined;
}

export interface GanttHoliday {
  start: Date;
  /** Inclusive last day (default: same day) */
  end?: Date | undefined;
  label?: string | undefined;
  color?: string | undefined;
}

export interface GanttHourRange {
  /** Hour of day, fractional allowed (8.5 = 08:30) */
  start: number;
  end: number;
}

export interface GanttNonWorkingTime {
  /** `true` = Saturday & Sunday; or a list of weekday numbers (0 = Sunday). Default `true` */
  weekends?: boolean | number[] | undefined;
  holidays?: (Date | GanttHoliday)[] | undefined;
  /** Working hours; time outside is shaded in hour scales. Per-weekday map allowed. */
  workingHours?: GanttHourRange | GanttHourRange[] | Partial<Record<number, GanttHourRange[]>> | undefined;
  /** Highlighted "intensive" hours, drawn in their own colour */
  intensiveHours?: (GanttHourRange & { color?: string | undefined; label?: string | undefined })[] | undefined;
  /** `'shade'` = tinted, `'hatch'` = diagonal stripes, `'disabled'` = greyed out */
  style?: 'shade' | 'hatch' | 'disabled' | undefined;
  /** Tint the matching header cells too (default true) */
  showInHeader?: boolean | undefined;
  /** Hide day shading below this density (default 12 px/day: shown in Day / Week views) */
  minPxPerDay?: number | undefined;
}

export interface GanttTimeHighlight {
  color?: string | undefined;
  className?: string | undefined;
  label?: string | undefined;
}

export interface GanttBarOptions {
  /** Bar height: px or % of the row height (default `'60%'`) */
  height?: GanttLength | undefined;
  /** Corner radius in px (default: theme `barRadius`) */
  radius?: number | undefined;
  minWidth?: number | undefined;
  progress?:
    | {
        show?: boolean | undefined;
        color?: string | undefined;
        opacity?: number | undefined;
      }
    | undefined;
  label?:
    | {
        /** `'auto'` = inside when it fits, otherwise to the right */
        position?: 'inside' | 'left' | 'right' | 'auto' | 'none' | undefined;
        template?: ((task: GanttTask) => string) | undefined;
        color?: string | undefined;
      }
    | undefined;
}

export interface GanttMilestoneOptions {
  /** Diamond/circle size in px (default: 50% of the row height) */
  size?: number | undefined;
  shape?: 'diamond' | 'circle' | 'square' | undefined;
}

export interface GanttGroupBarOptions {
  height?: GanttLength | undefined;
  /** `'summary'` = thin bracket bar with end caps, `'bar'` = regular bar */
  style?: 'summary' | 'bar' | undefined;
  showProgress?: boolean | undefined;
}

export interface GanttArrowOptions {
  width?: number | undefined;
  headSize?: number | undefined;
  /** Corner radius of the orthogonal path */
  radius?: number | undefined;
  color?: string | undefined;
  /** Horizontal clearance before the first bend */
  offset?: number | undefined;
}

export interface GanttPanelOptions {
  /** Initial width: px or % of the chart (default `'30%'`) */
  width?: GanttLength | undefined;
  minWidth?: number | undefined;
  maxWidth?: GanttLength | undefined;
  /** Drag the splitter to resize — also past the last column (default true) */
  resizable?: boolean | undefined;
  /** Show the collapse/expand toggle on the splitter (default true) */
  collapsible?: boolean | undefined;
  collapsed?: boolean | undefined;
  /**
   * Ordered column keys (built-in keys or keys of `columns`) for the split-view panel.
   * Default `['name', 'start', 'end', 'progress']`; with `columns` and no list: the
   * `columns` entries that are not `tableOnly` / `visible: false`.
   */
  columns?: string[] | undefined;
}

export interface GanttTableOptions {
  /**
   * Ordered column keys for `view: 'table'`. Default `['name', 'type', 'status', 'start', 'end',
   * 'duration', 'progress', 'predecessors']`, plus `['baselineStart', 'baselineEnd', 'variance']`
   * when `baseline` is on; with `columns` and no list: every `columns` entry not `visible: false`.
   */
  columns?: string[] | undefined;
}

export type GanttView = 'split' | 'table' | 'chart';

export interface GanttToolbarOptions {
  zoom?: boolean | undefined;
  /** Zoom levels offered as pills (default: all) — `false` hides them */
  viewModes?: string[] | false | undefined;
  today?: boolean | undefined;
  /** Split / table / chart switch */
  viewToggle?: boolean | undefined;
}

/** UI state that can be persisted (`stateKey`) or restored (`setState`). */
export interface GanttState {
  panelWidth?: number | undefined;
  panelCollapsed?: boolean | undefined;
  view?: GanttView | undefined;
  viewMode?: string | undefined;
  columnWidths?: Record<string, number> | undefined;
  collapsedIds?: string[] | undefined;
  sort?: { key: string; dir: 'asc' | 'desc' } | null | undefined;
}

// ─── Global options ───────────────────────────────────────────

export interface GanttOptions {
  /** Active zoom level: a `ViewMode` or the `name` of a custom `zoomLevels` entry */
  viewMode?: ViewMode | (string & {}) | undefined;
  rowHeight?: number | undefined;
  headerHeight?: number | undefined;
  subHeaderHeight?: number | undefined;
  panelWidth?: number | undefined;
  panelVisible?: boolean | undefined;

  /** Column definitions — overrides defaults */
  columns?: ColumnDef[] | undefined;

  theme?: GanttThemeOverrides | undefined;
  darkMode?: boolean | 'auto' | undefined;

  /** Show baseline bars */
  baseline?: boolean | undefined;
  /** Show critical path */
  criticalPath?: boolean | undefined;
  /** Show today annotation */
  showToday?: boolean | undefined;

  /** Extra padding (days) added before first task and after last */
  timelinePadding?: number | undefined;

  // ── i18n / formatting ──
  /**
   * dayjs locale id (e.g. `'it'`). Month/day names in the header follow it.
   * Load the locale first in your app: `import 'dayjs/locale/it';`
   */
  locale?: string | undefined;
  /** Override any subset of the UI strings */
  labels?: Partial<GanttLabels> | undefined;
  /** Override date / header formats */
  formats?: Partial<GanttFormats> | undefined;

  /** Drag & resize */
  enableDrag?: boolean | undefined;
  enableResize?: boolean | undefined;
  enableSelection?: boolean | undefined;
  multiSelect?: boolean | undefined;

  annotations?: GanttAnnotation[] | undefined;

  // ── Timeline ──
  /** Zoom presets (replace the built-in Hour…Year levels) */
  zoomLevels?: GanttZoomLevel[] | undefined;
  /** Header tiers for the current level (overrides the level's own scales) */
  scales?: GanttScale[] | undefined;
  /** First day of the week: 1 = Monday (ISO, default), 0 = Sunday */
  weekStart?: 0 | 1 | undefined;
  /** Stretch the timeline so it always fills the viewport (default true) */
  fitToWidth?: boolean | undefined;
  /**
   * Where the timeline scrolls on the first render with data. Default `'auto'`: today when
   * it is near the tasks, otherwise the earliest task. `'today'`, `'start'` (earliest task),
   * a `Date` (centred), or `false` to stay at the timeline start.
   */
  initialScroll?: 'auto' | 'today' | 'start' | Date | false | undefined;
  gridLines?: GanttGridLines | undefined;
  /** Weekends, holidays, working / intensive hours (visual only) */
  nonWorkingTime?: GanttNonWorkingTime | false | undefined;
  /** Custom shading per day / hour cell */
  highlightTime?: ((start: Date, unit: 'day' | 'hour') => GanttTimeHighlight | null | undefined) | undefined;
  /**
   * How `task.end` is read: `'exclusive'` (default) — the bar ends at that instant;
   * `'inclusive'` — a date-only end covers that whole day.
   */
  endDateMode?: 'exclusive' | 'inclusive' | undefined;
  /**
   * Treat `new Date('2026-01-05')` (UTC midnight) as a local calendar day, so bars
   * line up with day cells in every time zone. Default true.
   */
  normalizeDateOnly?: boolean | undefined;

  // ── Elements ──
  bar?: GanttBarOptions | undefined;
  milestone?: GanttMilestoneOptions | undefined;
  groupBar?: GanttGroupBarOptions | undefined;
  arrows?: GanttArrowOptions | undefined;
  /** Tree indentation per level in px (default 16) */
  indentSize?: number | undefined;

  // ── Layout ──
  panel?: GanttPanelOptions | undefined;
  /** Columns of the full table view (`view: 'table'`) */
  table?: GanttTableOptions | undefined;
  view?: GanttView | undefined;
  toolbar?: GanttToolbarOptions | false | undefined;
  /** Persist UI state (panel width, view, zoom, column widths…) in localStorage */
  stateKey?: string | undefined;
}

// ─── Events emitted by the component ─────────────────────────

export interface TaskDragEvent {
  taskId: string;
  oldStart: Date;
  oldEnd: Date;
  newStart: Date;
  newEnd: Date;
  daysMoved: number;
}

export interface TaskResizeEvent {
  taskId: string;
  handle: 'left' | 'right';
  oldStart: Date;
  oldEnd: Date;
  newStart: Date;
  newEnd: Date;
  daysDelta: number;
}

export interface SelectionChangeEvent {
  selectedIds: string[];
}

export interface DependencyChangeEvent {
  fromId: string;
  toId: string;
  type: DependencyType;
  lag: number;
}

// ─── Bar registry ─────────────────────────────────────────────

/** Layout params needed by bar components to compute baseline geometry */
export interface GanttLayoutParams {
  /** The Date that maps to SVG x=0 */
  origin: Date;
  pxPerDay: number;
  rowHeight: number;
}

export interface GanttBarContext {
  row: GanttFlatRow;
  geometry: RowGeometry;
  theme: GanttTheme;
  layoutParams: GanttLayoutParams;
  /** Whether this task is on the critical path */
  isCritical?: boolean | undefined;
  /** Whether this task row is currently selected */
  isSelected?: boolean | undefined;
  /** Whether drag-resize handles should be shown */
  enableResize?: boolean | undefined;
  /** Whether baseline bar should be rendered */
  showBaseline?: boolean | undefined;
  /**
   * Effective drag/resize for this row (`enableDrag` ∧ `task.draggable` ∧ resize option).
   * Drives cursor and interaction affordances on the bar.
   */
  draggable?: boolean | undefined;
  /** Geometry computed by the core render model (position, size, label…) */
  visual?: BarVisual | undefined;
}
