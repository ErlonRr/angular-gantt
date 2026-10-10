// ─────────────────────────────────────────────────────────────
//  gantry · types.ts
//  Single source of truth for all domain types.
//  Framework-free — usable in Node / Vitest / SSR and by every
//  framework binding (Angular, Web Component, React, Vue, Svelte).
// ─────────────────────────────────────────────────────────────

import type { BarVisual } from './render/bars';

// ─── Enums ───────────────────────────────────────────────────

export enum ViewMode {
  Hour = 'Hour',
  Day = 'Day',
  Week = 'Week',
  Month = 'Month',
  Quarter = 'Quarter',
  Year = 'Year',
}

export enum DependencyType {
  FS = 'FS', // Finish → Start  (default)
  FF = 'FF', // Finish → Finish
  SF = 'SF', // Start  → Finish
  SS = 'SS', // Start  → Start
}

export enum TaskType {
  Task = 'task',
  Milestone = 'milestone',
  Group = 'group', // parent that collapses children
}

// ─── Core domain objects ──────────────────────────────────────

export interface GanttDependency {
  /** ID of the predecessor task */
  taskId: string;
  type?: DependencyType;
  /** Lag in days — positive = delay, negative = lead */
  lag?: number;
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
  progress?: number; // 0–100
  type?: TaskType;
  parentId?: string;
  collapsed?: boolean;
  dependency?: string | GanttDependency | GanttDependency[];

  /** Custom bar type key — resolved via GanttBarRegistry */
  barType?: string;

  /** Per-task style overrides */
  barColor?: string;
  rowColor?: string;
  /** Text colour of the bar label */
  textColor?: string;
  progressColor?: string;
  /** Extra CSS class on the bar element */
  className?: string;

  /** Planned baseline dates for variance visualisation */
  baseline?: GanttBaseline;

  /**
   * Timeline drag & resize for this row. Applies to any row (root, child, group).
   * When `false`, the bar does not move or resize; when omitted or `true`, the
   * global `enableDrag` / `enableResize` on the gantt apply.
   */
  draggable?: boolean;

  /**
   * Explicit status from your data; wins over the derived one (built-in `status` column).
   * Built-in values are translated (`labels.status*`), any other string is shown as is.
   * Default: derived from progress, dates and now (see `taskStatus`).
   */
  status?: TaskStatus | (string & {});

  /** Arbitrary extra data — passed through to bar components */
  data?: Record<string, unknown>;
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
  locale?: string;
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
  minWidth?: number;
  maxWidth?: number;
  /** Default visibility in both views (default true). A key listed in `panel.columns` / `table.columns` shows anyway. */
  visible?: boolean;
  sortable?: boolean;
  /** Custom cell renderer — returns the cell text */
  render?: ColumnRenderer;
  /** Value the column sorts by. Default: the built-in rule for built-in keys, else `task[key]`. Empty values sort last. */
  sortValue?: (row: GanttFlatRow, ctx: ColumnContext) => ColumnSortValue;
  /** Framework-specific cell template (e.g. Angular `<ng-template ganttColumn>`) */
  cellTemplate?: TTemplate;
  /** Used internally to mark built-in columns */
  builtin?: boolean;
  /** Allow resizing by dragging the header edge (default true) */
  resizable?: boolean;
  /** Cell text alignment (default 'start') */
  align?: 'start' | 'center' | 'end';
  /**
   * When you pass `columns` without `panel.columns`: leave this column out of the split-view
   * panel (it still shows in `view: 'table'`). Ignored for keys listed explicitly. Default false.
   */
  tableOnly?: boolean;
  /** Grow to fill the remaining panel width (default: the last column grows) */
  flex?: boolean;
}

// ─── Annotations ─────────────────────────────────────────────

export interface AnnotationLabel {
  text: string;
  color?: string;
  fontSize?: string;
  fontWeight?: string;
  offsetY?: number;
}

export interface GanttAnnotation {
  /** Start date (draws a vertical line) */
  x1: Date;
  /** Optional end date (draws a shaded region x1 → x2) */
  x2?: Date;
  color?: string;
  opacity?: number;
  label?: AnnotationLabel;
  /** true = today marker special styling */
  isToday?: boolean;
}

// ─── Theme ───────────────────────────────────────────────────

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
  top?: HeaderFormatFn;
  bottom?: HeaderFormatFn;
}

export interface GanttFormats {
  /** dayjs format string for dates in columns & tooltip */
  dateFormat: string;
  /** Per-view header label overrides — omitted rows use the built-in formatter */
  header?: Partial<Record<ViewMode, GanttHeaderFormats>>;
}

export const DEFAULT_FORMATS: GanttFormats = {
  dateFormat: 'MMM D, YYYY',
};

/** Resolved i18n bundle passed to the pure header/date formatters. */
export interface GanttI18n {
  locale?: string;
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
  locale?: string;
  labels: GanttLabels;
  weekStart: 0 | 1;
}

/** dayjs format string (e.g. `'MMM YYYY'`, `'[W]W'`) or a function of the cell's period. */
export type ScaleFormat = string | ((start: Date, end: Date, ctx: ScaleFormatContext) => string);

/** One header tier ("scale"), DHTMLX/SVAR style. Tiers are listed top → bottom. */
export interface GanttScale {
  unit: TimeUnit;
  /** Cell size in `unit`s (e.g. 6 hours, 2 weeks). Default 1 */
  step?: number;
  format?: ScaleFormat;
  /** Tier height in px */
  height?: number;
  /** Extra CSS class for a cell (also used to colour it via your stylesheet) */
  className?: (start: Date, end: Date) => string | undefined;
  /** `'start'` keeps labels pinned to the left edge while scrolling (default for upper tiers) */
  align?: 'center' | 'start';
}

/** A named zoom preset: header tiers + horizontal density. */
export interface GanttZoomLevel {
  name: string;
  /** Header tiers, top → bottom; the last one is the finest */
  scales: GanttScale[];
  /** Width of one bottom-tier cell in px (alternative: `pxPerDay`) */
  cellWidth?: number;
  pxPerDay?: number;
  /** Toolbar label (default: `labels.viewModes[name]` or `name`) */
  label?: string;
}

export interface GanttLineStyle {
  color?: string;
  width?: number;
  /** SVG dash array, e.g. `'4 3'` */
  dash?: string;
}

export interface GanttGridLines {
  /** Lines between bottom-tier cells (days, weeks…) */
  minor?: GanttLineStyle | false;
  /** Period delimiters (month / year / day…) drawn through header and body */
  major?: GanttLineStyle | false;
  /** Row separators */
  horizontal?: GanttLineStyle | false;
  /** Unit of the major delimiters (default: the tier above the bottom one) */
  majorUnit?: TimeUnit;
}

export interface GanttHoliday {
  start: Date;
  /** Inclusive last day (default: same day) */
  end?: Date;
  label?: string;
  color?: string;
}

export interface GanttHourRange {
  /** Hour of day, fractional allowed (8.5 = 08:30) */
  start: number;
  end: number;
}

export interface GanttNonWorkingTime {
  /** `true` = Saturday & Sunday; or a list of weekday numbers (0 = Sunday). Default `true` */
  weekends?: boolean | number[];
  holidays?: (Date | GanttHoliday)[];
  /** Working hours; time outside is shaded in hour scales. Per-weekday map allowed. */
  workingHours?: GanttHourRange | GanttHourRange[] | Partial<Record<number, GanttHourRange[]>>;
  /** Highlighted "intensive" hours, drawn in their own colour */
  intensiveHours?: (GanttHourRange & { color?: string; label?: string })[];
  /** `'shade'` = tinted, `'hatch'` = diagonal stripes, `'disabled'` = greyed out */
  style?: 'shade' | 'hatch' | 'disabled';
  /** Tint the matching header cells too (default true) */
  showInHeader?: boolean;
  /** Hide day shading below this density (default 12 px/day: shown in Day / Week views) */
  minPxPerDay?: number;
}

export interface GanttTimeHighlight {
  color?: string;
  className?: string;
  label?: string;
}

export interface GanttBarOptions {
  /** Bar height: px or % of the row height (default `'60%'`) */
  height?: GanttLength;
  /** Corner radius in px (default: theme `barRadius`) */
  radius?: number;
  minWidth?: number;
  progress?: {
    show?: boolean;
    color?: string;
    opacity?: number;
  };
  label?: {
    /** `'auto'` = inside when it fits, otherwise to the right */
    position?: 'inside' | 'left' | 'right' | 'auto' | 'none';
    template?: (task: GanttTask) => string;
    color?: string;
  };
}

export interface GanttMilestoneOptions {
  /** Diamond/circle size in px (default: 50% of the row height) */
  size?: number;
  shape?: 'diamond' | 'circle' | 'square';
}

export interface GanttGroupBarOptions {
  height?: GanttLength;
  /** `'summary'` = thin bracket bar with end caps, `'bar'` = regular bar */
  style?: 'summary' | 'bar';
  showProgress?: boolean;
}

export interface GanttArrowOptions {
  width?: number;
  headSize?: number;
  /** Corner radius of the orthogonal path */
  radius?: number;
  color?: string;
  /** Horizontal clearance before the first bend */
  offset?: number;
}

export interface GanttPanelOptions {
  /** Initial width: px or % of the chart (default `'30%'`) */
  width?: GanttLength;
  minWidth?: number;
  maxWidth?: GanttLength;
  /** Drag the splitter to resize — also past the last column (default true) */
  resizable?: boolean;
  /** Show the collapse/expand toggle on the splitter (default true) */
  collapsible?: boolean;
  collapsed?: boolean;
  /**
   * Ordered column keys (built-in keys or keys of `columns`) for the split-view panel.
   * Default `['name', 'start', 'end', 'progress']`; with `columns` and no list: the
   * `columns` entries that are not `tableOnly` / `visible: false`.
   */
  columns?: string[];
}

export interface GanttTableOptions {
  /**
   * Ordered column keys for `view: 'table'`. Default `['name', 'type', 'status', 'start', 'end',
   * 'duration', 'progress', 'predecessors']`, plus `['baselineStart', 'baselineEnd', 'variance']`
   * when `baseline` is on; with `columns` and no list: every `columns` entry not `visible: false`.
   */
  columns?: string[];
}

export type GanttView = 'split' | 'table' | 'chart';

export interface GanttToolbarOptions {
  zoom?: boolean;
  /** Zoom levels offered as pills (default: all) — `false` hides them */
  viewModes?: string[] | false;
  today?: boolean;
  /** Split / table / chart switch */
  viewToggle?: boolean;
}

/** UI state that can be persisted (`stateKey`) or restored (`setState`). */
export interface GanttState {
  panelWidth?: number;
  panelCollapsed?: boolean;
  view?: GanttView;
  viewMode?: string;
  columnWidths?: Record<string, number>;
  collapsedIds?: string[];
  sort?: { key: string; dir: 'asc' | 'desc' } | null;
}

// ─── Global options ───────────────────────────────────────────

export interface GanttOptions {
  /** Active zoom level: a `ViewMode` or the `name` of a custom `zoomLevels` entry */
  viewMode?: ViewMode | (string & {});
  rowHeight?: number;
  headerHeight?: number;
  subHeaderHeight?: number;
  panelWidth?: number;
  panelVisible?: boolean;

  /** Column definitions — overrides defaults */
  columns?: ColumnDef[];

  theme?: Partial<GanttTheme>;
  darkMode?: boolean | 'auto';

  /** Show baseline bars */
  baseline?: boolean;
  /** Show critical path */
  criticalPath?: boolean;
  /** Show today annotation */
  showToday?: boolean;

  /** Extra padding (days) added before first task and after last */
  timelinePadding?: number;

  // ── i18n / formatting ──
  /**
   * dayjs locale id (e.g. `'it'`). Month/day names in the header follow it.
   * Load the locale first in your app: `import 'dayjs/locale/it';`
   */
  locale?: string;
  /** Override any subset of the UI strings */
  labels?: Partial<GanttLabels>;
  /** Override date / header formats */
  formats?: Partial<GanttFormats>;

  /** Drag & resize */
  enableDrag?: boolean;
  enableResize?: boolean;
  enableSelection?: boolean;
  multiSelect?: boolean;

  annotations?: GanttAnnotation[];

  // ── Timeline ──
  /** Zoom presets (replace the built-in Hour…Year levels) */
  zoomLevels?: GanttZoomLevel[];
  /** Header tiers for the current level (overrides the level's own scales) */
  scales?: GanttScale[];
  /** First day of the week: 1 = Monday (ISO, default), 0 = Sunday */
  weekStart?: 0 | 1;
  /** Stretch the timeline so it always fills the viewport (default true) */
  fitToWidth?: boolean;
  /**
   * Where the timeline scrolls on the first render with data. Default `'auto'`: today when
   * it is near the tasks, otherwise the earliest task. `'today'`, `'start'` (earliest task),
   * a `Date` (centred), or `false` to stay at the timeline start.
   */
  initialScroll?: 'auto' | 'today' | 'start' | Date | false;
  gridLines?: GanttGridLines;
  /** Weekends, holidays, working / intensive hours (visual only) */
  nonWorkingTime?: GanttNonWorkingTime | false;
  /** Custom shading per day / hour cell */
  highlightTime?: (start: Date, unit: 'day' | 'hour') => GanttTimeHighlight | null | undefined;
  /**
   * How `task.end` is read: `'exclusive'` (default) — the bar ends at that instant;
   * `'inclusive'` — a date-only end covers that whole day.
   */
  endDateMode?: 'exclusive' | 'inclusive';
  /**
   * Treat `new Date('2026-01-05')` (UTC midnight) as a local calendar day, so bars
   * line up with day cells in every time zone. Default true.
   */
  normalizeDateOnly?: boolean;

  // ── Elements ──
  bar?: GanttBarOptions;
  milestone?: GanttMilestoneOptions;
  groupBar?: GanttGroupBarOptions;
  arrows?: GanttArrowOptions;
  /** Tree indentation per level in px (default 16) */
  indentSize?: number;

  // ── Layout ──
  panel?: GanttPanelOptions;
  /** Columns of the full table view (`view: 'table'`) */
  table?: GanttTableOptions;
  view?: GanttView;
  toolbar?: GanttToolbarOptions | false;
  /** Persist UI state (panel width, view, zoom, column widths…) in localStorage */
  stateKey?: string;
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
  isCritical?: boolean;
  /** Whether this task row is currently selected */
  isSelected?: boolean;
  /** Whether drag-resize handles should be shown */
  enableResize?: boolean;
  /** Whether baseline bar should be rendered */
  showBaseline?: boolean;
  /**
   * Effective drag/resize for this row (`enableDrag` ∧ `task.draggable` ∧ resize option).
   * Drives cursor and interaction affordances on the bar.
   */
  draggable?: boolean;
  /** Geometry computed by the core render model (position, size, label…) */
  visual?: BarVisual;
}
