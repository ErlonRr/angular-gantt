// ─────────────────────────────────────────────────────────────
//  gantry · types.ts
//  Single source of truth for all domain types.
//  Framework-free — usable in Node / Vitest / SSR and by every
//  framework binding (Angular, Web Component, React, Vue, Svelte).
// ─────────────────────────────────────────────────────────────

// ─── Enums ───────────────────────────────────────────────────

export enum ViewMode {
  Day     = 'Day',
  Week    = 'Week',
  Month   = 'Month',
  Quarter = 'Quarter',
  Year    = 'Year',
}

export enum DependencyType {
  FS = 'FS', // Finish → Start  (default)
  FF = 'FF', // Finish → Finish
  SF = 'SF', // Start  → Finish
  SS = 'SS', // Start  → Start
}

export enum TaskType {
  Task      = 'task',
  Milestone = 'milestone',
  Group     = 'group',  // parent that collapses children
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
  end:   Date;
}

/**
 * Raw task as provided by the consumer.
 * Dates are native `Date` objects — no format strings needed.
 */
export interface GanttTask {
  id:        string;
  name:      string;
  start:     Date;
  end:       Date;
  progress?: number;          // 0–100
  type?:     TaskType;
  parentId?: string;
  collapsed?: boolean;
  dependency?: string | GanttDependency | GanttDependency[];

  /** Custom bar type key — resolved via GanttBarRegistry */
  barType?:  string;

  /** Per-task style overrides */
  barColor?:  string;
  rowColor?:  string;

  /** Planned baseline dates for variance visualisation */
  baseline?: GanttBaseline;

  /**
   * Timeline drag & resize for this row. Applies to any row (root, child, group).
   * When `false`, the bar does not move or resize; when omitted or `true`, the
   * global `enableDrag` / `enableResize` on the gantt apply.
   */
  draggable?: boolean;

  /** Arbitrary extra data — passed through to bar components */
  data?: Record<string, unknown>;
}

// ─── Flat model (internal, after tree processing) ─────────────

export interface GanttFlatRow {
  task:        GanttTask;
  level:       number;
  /** Index in the fully-visible flat array (used for Y coordinate) */
  visibleIndex: number;
  hasChildren:  boolean;
  isCollapsed:  boolean;
  /** true when any ancestor is collapsed — row is hidden */
  hidden:       boolean;
  /** Resolved bar type (task.barType ?? TaskType.Task) */
  barType:      string;
}

// ─── Geometry (computed by GanttLayoutService) ────────────────

export interface RowGeometry {
  row:      GanttFlatRow;
  /** Top-left Y of the row in the SVG canvas */
  y:        number;
  /** Height of the row (= rowHeight option) */
  height:   number;
  /** Left edge of the task bar in SVG x-coordinates */
  barX:     number;
  /** Width of the task bar */
  barWidth: number;
  /** Width of the progress fill (barWidth * progress / 100) */
  progressWidth: number;
}

// ─── Header cells ─────────────────────────────────────────────

export interface HeaderCell {
  label:   string;
  /** SVG x start */
  x:       number;
  width:   number;
  /** ISO date string of the period start */
  dateKey: string;
}

export interface HeaderRow {
  cells: HeaderCell[];
  /** Row height in px */
  height: number;
}

// ─── Columns ─────────────────────────────────────────────────

export type ColumnRenderer = (row: GanttFlatRow) => string;

/** Context bound to a `<ng-template ganttColumn>` cell: `let-row` / `let-row="row"` */
export interface ColumnCellContext {
  $implicit: GanttFlatRow;
  row:       GanttFlatRow;
}

/**
 * Column definition. `TTemplate` is the framework-specific cell template
 * type (e.g. Angular's `TemplateRef<ColumnCellContext>`); framework-free
 * consumers can ignore it and use `render` instead.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ColumnDef<TTemplate = any> {
  key:        string;
  label:      string;
  /** Initial width in px */
  width:      number;
  minWidth?:  number;
  maxWidth?:  number;
  visible?:   boolean;
  sortable?:  boolean;
  /** Custom cell renderer — returns an HTML string */
  render?:    ColumnRenderer;
  /** Framework-specific cell template (e.g. Angular `<ng-template ganttColumn>`) */
  cellTemplate?: TTemplate;
  /** Used internally to mark built-in columns */
  builtin?:   boolean;
}

// ─── Annotations ─────────────────────────────────────────────

export interface AnnotationLabel {
  text:       string;
  color?:     string;
  fontSize?:  string;
  fontWeight?: string;
  offsetY?:   number;
}

export interface GanttAnnotation {
  /** Start date (draws a vertical line) */
  x1:      Date;
  /** Optional end date (draws a shaded region x1 → x2) */
  x2?:     Date;
  color?:  string;
  opacity?: number;
  label?:  AnnotationLabel;
  /** true = today marker special styling */
  isToday?: boolean;
}

// ─── Theme ───────────────────────────────────────────────────

export interface GanttTheme {
  // Surfaces
  backgroundColor:  string;
  headerBackground: string;
  rowBg:            string;
  rowBgAlt:         string;

  // Bars
  barColor:         string;
  barTextColor:     string;
  barRadius:        string;
  milestoneColor:   string;
  baselineColor:    string;
  criticalColor:    string;

  // Task list
  panelBg:          string;
  panelBorder:      string;

  // Grid
  borderColor:      string;
  gridLine:         string;
  todayColor:       string;

  // Text
  textPrimary:      string;
  textSecondary:    string;
  textMuted:        string;
  fontFamily:       string;
  fontSize:         string;

  // Arrows
  arrowColor:       string;

  // Tooltip
  tooltipBg:        string;
  tooltipBorder:    string;
  tooltipText:      string;

  // Selection
  selectionBg:      string;
  selectionBorder:  string;

  // Scrollbar
  scrollbarTrack:   string;
  scrollbarThumb:   string;
}

// ─── i18n: UI labels ─────────────────────────────────────────

/**
 * Every user-facing string in the chart. Override any subset via
 * `GanttOptions.labels` (per instance) or `provideGanttLib({ labels })` (global).
 * Interpolated strings are functions so translators keep full control.
 */
export interface GanttLabels {
  // Load-more (lazy datasource)
  loading:    string;
  loadMore:   string;
  allLoaded:  (count: number) => string;
  // Toolbar
  zoomIn:     string;
  zoomOut:    string;
  todayButton: string;
  viewModes:  Record<ViewMode, string>;
  // Legend
  legend:     string;
  today:      string;
  annotation: string;
  // Tooltip
  ttStart:    string;
  ttEnd:      string;
  ttDuration: string;
  ttProgress: string;
  ttMilestone: string;
  // Header period prefixes (e.g. W12, Q2, H1)
  weekPrefix:    string;
  quarterPrefix: string;
  halfPrefix:    string;
  // Duration label (tooltip + Duration column)
  durationLessThanDay: string;
  durationDay:  string;
  durationDays: (n: number) => string;
  durationWeeks: (w: number) => string;
  durationWeeksDays: (w: number, d: number) => string;
  // Default column headers
  colName:     string;
  colStart:    string;
  colEnd:      string;
  colDuration: string;
  colProgress: string;
  // Accessibility
  ariaChart:    string;
  ariaExpand:   (name: string) => string;
  ariaCollapse: (name: string) => string;
}

export const DEFAULT_LABELS: GanttLabels = {
  loading:   'Loading…',
  loadMore:  'Load more',
  allLoaded: (n) => `All ${n} tasks loaded`,
  zoomIn:    'Zoom in',
  zoomOut:   'Zoom out',
  todayButton: 'Today',
  viewModes: {
    [ViewMode.Day]:     'Day',
    [ViewMode.Week]:    'Week',
    [ViewMode.Month]:   'Month',
    [ViewMode.Quarter]: 'Quarter',
    [ViewMode.Year]:    'Year',
  },
  legend:     'Legend',
  today:      'Today',
  annotation: 'Annotation',
  ttStart:    'Start',
  ttEnd:      'End',
  ttDuration: 'Duration',
  ttProgress: 'Progress',
  ttMilestone: 'Milestone',
  weekPrefix:    'W',
  quarterPrefix: 'Q',
  halfPrefix:    'H',
  durationLessThanDay: '< 1 day',
  durationDay:  '1 day',
  durationDays: (n) => `${n} days`,
  durationWeeks: (w) => `${w}w`,
  durationWeeksDays: (w, d) => `${w}w ${d}d`,
  colName:     'Task Name',
  colStart:    'Start',
  colEnd:      'End',
  colDuration: 'Duration',
  colProgress: '%',
  ariaChart:    'Gantt chart timeline',
  ariaExpand:   (name) => `Expand ${name}`,
  ariaCollapse: (name) => `Collapse ${name}`,
};

// ─── i18n: date & header formats ─────────────────────────────

/** Builds a header label for a given period start date. */
export type HeaderFormatFn = (date: Date) => string;

export interface GanttHeaderFormats {
  top?:    HeaderFormatFn;
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
  labels:  GanttLabels;
  formats: GanttFormats;
}

// ─── Global options ───────────────────────────────────────────

export interface GanttOptions {
  viewMode?:       ViewMode;
  rowHeight?:      number;
  headerHeight?:   number;
  subHeaderHeight?: number;
  panelWidth?:     number;
  panelVisible?:   boolean;

  /** Column definitions — overrides defaults */
  columns?:        ColumnDef[];

  theme?:          Partial<GanttTheme>;
  darkMode?:       boolean | 'auto';

  /** Show baseline bars */
  baseline?:       boolean;
  /** Show critical path */
  criticalPath?:   boolean;
  /** Show today annotation */
  showToday?:      boolean;

  /** Extra padding (days) added before first task and after last */
  timelinePadding?: number;

  // ── i18n / formatting ──
  /**
   * dayjs locale id (e.g. `'it'`). Month/day names in the header follow it.
   * Load the locale first in your app: `import 'dayjs/locale/it';`
   */
  locale?:  string;
  /** Override any subset of the UI strings */
  labels?:  Partial<GanttLabels>;
  /** Override date / header formats */
  formats?: Partial<GanttFormats>;

  /** Drag & resize */
  enableDrag?:      boolean;
  enableResize?:    boolean;
  enableSelection?:  boolean;
  multiSelect?:     boolean;

  annotations?:    GanttAnnotation[];
}

// ─── Events emitted by the component ─────────────────────────

export interface TaskDragEvent {
  taskId:       string;
  oldStart:     Date;
  oldEnd:       Date;
  newStart:     Date;
  newEnd:       Date;
  daysMoved:    number;
}

export interface TaskResizeEvent {
  taskId:       string;
  handle:       'left' | 'right';
  oldStart:     Date;
  oldEnd:       Date;
  newStart:     Date;
  newEnd:       Date;
  daysDelta:    number;
}

export interface SelectionChangeEvent {
  selectedIds:  string[];
}

export interface DependencyChangeEvent {
  fromId:  string;
  toId:    string;
  type:    DependencyType;
  lag:     number;
}

// ─── Bar registry ─────────────────────────────────────────────

/** Layout params needed by bar components to compute baseline geometry */
export interface GanttLayoutParams {
  /** The Date that maps to SVG x=0 */
  origin:    Date;
  pxPerDay:  number;
  rowHeight: number;
}

export interface GanttBarContext {
  row:          GanttFlatRow;
  geometry:     RowGeometry;
  theme:        GanttTheme;
  layoutParams: GanttLayoutParams;
  /** Whether this task is on the critical path */
  isCritical?:  boolean;
  /** Whether this task row is currently selected */
  isSelected?:  boolean;
  /** Whether drag-resize handles should be shown */
  enableResize?: boolean;
  /** Whether baseline bar should be rendered */
  showBaseline?: boolean;
  /**
   * Effective drag/resize for this row (`enableDrag` ∧ `task.draggable` ∧ resize option).
   * Drives cursor and interaction affordances on the bar.
   */
  draggable?: boolean;
}
