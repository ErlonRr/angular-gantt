// ─────────────────────────────────────────────────────────────
//  gantry · types.ts
//  Single source of truth for all domain types.
//  Framework-free — usable in Node / Vitest / SSR and by every
//  framework binding (Angular, Web Component, React, Vue, Svelte).
// ─────────────────────────────────────────────────────────────

import type { BarVisual } from './render/bars';
import type { TooltipModel } from './state/tooltip';
import type { ResolvedCalendar } from './render/config';
import type { WorkingCalendar } from './calendar/working-calendar';

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

  /**
   * Style of this task's bar and row: the last layer of the style cascade, over the theme,
   * `options.styles` (kind, parent, level, rule), the rolled-up colour and the flat fields below.
   */
  style?: GanttTaskStyle | undefined;

  /**
   * Bar fill.
   * @deprecated Use `style.color` (it wins when both are set).
   */
  barColor?: string | undefined;
  /**
   * Row background.
   * @deprecated Use `style.rowColor` (it wins when both are set).
   */
  rowColor?: string | undefined;
  /**
   * Text colour of the bar label.
   * @deprecated Use `style.textColor` (it wins when both are set).
   */
  textColor?: string | undefined;
  /**
   * Progress fill.
   * @deprecated Use `style.progressColor` (it wins when both are set).
   */
  progressColor?: string | undefined;
  /**
   * Extra CSS class on the bar element.
   * @deprecated Use `style.className` (the classes of both are applied).
   */
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
   * `false`: a read-only row — its dates, progress, cells and links can't be changed by the user
   * (pointer, keyboard or cell). `draggable: false` locks the dates only. Default: editable, as far
   * as `editing`, `enableDrag` and `enableResize` allow.
   */
  editable?: boolean | undefined;

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

// ─── Task styles and rollup ──────────────────────────────────

/**
 * Style of a bar and its row. Every field is optional: an unset field falls through to the layer
 * below (see `GanttStyleOptions` for the cascade).
 */
export interface GanttTaskStyle {
  /** Bar fill (the critical path still paints its own colour) */
  color?: string | undefined;
  /** Progress fill, at full opacity */
  progressColor?: string | undefined;
  /** Text colour of the label inside the bar */
  textColor?: string | undefined;
  /** Row background in both panes (selection and hover still show over it) */
  rowColor?: string | undefined;
  /** Extra CSS class on the bar element; the classes of every layer are applied */
  className?: string | undefined;
  /** Bar height: px or % of the row height (default: `bar.height` / `groupBar.height`); a milestone's size (default `milestone.size`) */
  height?: GanttLength | undefined;
  /** Corner radius in px (default: `bar.radius`); summary bars cap it at 2 px, milestones at a quarter of their size */
  radius?: number | undefined;
  /** Label position (default: `bar.label.position`) */
  label?: 'inside' | 'left' | 'right' | 'auto' | 'none' | undefined;
}

/** A style after the cascade: what painters and custom bars (`GanttBarContext.style`) receive. */
export type ResolvedTaskStyle = Readonly<GanttTaskStyle>;

/** What `styles.rule` receives besides the row. */
export interface GanttStyleRuleContext {
  /** The rolled-up values of a parent row (`rollup` on), else `null` */
  rollup: GanttRollupInfo | null;
  /** The task is on the critical path (`criticalPath` on) */
  critical: boolean;
  /** The task's status: `task.status`, else derived from progress, dates and now */
  status: TaskStatus | (string & {});
}

/**
 * Default styles by kind, parent, level and rule. Field by field, later layers win:
 * theme < `task` / `group` / `milestone` (by bar kind) < `parent` < `levels[depth]` < the rolled-up
 * colour < `rule(row, ctx)` < the task's flat fields (`barColor`…) < `task.style`. `className`
 * accumulates across layers. The critical path still overrides the fill.
 */
export interface GanttStyleOptions {
  /** Task bars */
  task?: GanttTaskStyle | undefined;
  /** Group (summary) bars */
  group?: GanttTaskStyle | undefined;
  /** Milestones */
  milestone?: GanttTaskStyle | undefined;
  /** Rows with children, whatever their kind */
  parent?: GanttTaskStyle | undefined;
  /** By exact depth: index 0 styles the root rows, 1 their children… */
  levels?: (GanttTaskStyle | null | undefined)[] | undefined;
  /** Per-row style, computed once per row object */
  rule?: ((row: GanttFlatRow, ctx: GanttStyleRuleContext) => GanttTaskStyle | null | undefined) | undefined;
}

/**
 * What a parent row rolls up from its direct children (`rollup: true` =
 * `{ progress: 'duration', dates: true, color: false, segments: false }`).
 */
export interface GanttRollupOptions {
  /**
   * Parent progress: `'duration'` = the mean of the children's progress weighted by duration
   * (milestones weigh 0), `'count'` = the plain mean, `false` = the parent's own. Default `'duration'`.
   */
  progress?: 'duration' | 'count' | false | undefined;
  /** Parent dates: the earliest child start and the latest child end (the bar can't be dragged). Default true */
  dates?: boolean | undefined;
  /**
   * Parent colour: `'status'` paints the summary status of the children, a function returns a colour
   * (or nothing for the default), `false` keeps the styles. Default false.
   */
  color?:
    'status' | false | ((children: readonly GanttTask[], parent: GanttTask) => string | null | undefined) | undefined;
  /** A collapsed parent draws its children as segments in their own colours. Default false */
  segments?: boolean | undefined;
}

/** The rolled-up values of one parent row. */
export interface GanttRollupInfo {
  /** Rolled-up progress 0–100, or `null` when progress is not rolled up */
  progress: number | null;
  /** Earliest child start, or `null` when dates are not rolled up */
  start: Date | null;
  /** Latest child end, or `null` when dates are not rolled up */
  end: Date | null;
  /** Summary status of the children */
  status: TaskStatus;
  /** Rolled-up colour, or `null` */
  color: string | null;
  /** The direct children, in task order */
  children: readonly GanttTask[];
}

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
  /** 1-based position among the visible rows that share its parent (`aria-posinset`); set by `reindexVisible` */
  posInSet?: number | undefined;
  /** Number of visible rows that share its parent (`aria-setsize`); set by `reindexVisible` */
  setSize?: number | undefined;
  /** `visibleIndex` of its parent row; `undefined` for a root row. Set by `reindexVisible` */
  parentIndex?: number | undefined;
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
  /**
   * The chart's working calendar (`ResolvedGanttConfig.calendar`), or `null` / unset without
   * one: a context is a `DateReading`, so `formatDuration(span, ctx)` measures like the chart
   */
  calendar?: ResolvedCalendar | null | undefined;
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
 * A built-in cell editor: `input[type=text|number|date|datetime-local]`, or a `select` over
 * `editorOptions.options`.
 */
export type CellEditorKind = 'text' | 'number' | 'date' | 'datetime-local' | 'select';

/** Settings of a built-in cell editor (`ColumnDef.editorOptions`). */
export interface CellEditorOptions {
  /** `number`: the smallest value */
  min?: number | undefined;
  /** `number`: the largest value */
  max?: number | undefined;
  /** `number`: the step of the spin buttons */
  step?: number | undefined;
  /** `select`: the choices, in order */
  options?: readonly { value: string; label: string }[] | undefined;
}

/**
 * What a custom cell editor receives (`ColumnDef.editor` as a function; Angular's
 * `<ng-template ganttCellEditor let-edit>`). DOM-free: each binding decides the editor's node type.
 * The chart focuses the editor and handles Enter (commit), Tab / Shift+Tab (commit and edit the
 * next / previous editable cell of the row) and Escape (cancel) unless the editor prevented them.
 */
export interface CellEditorContext {
  readonly row: GanttFlatRow;
  readonly column: ColumnDef;
  /** The editor's text: the start value (`exportValue`, else the cell text, or the typed character) until `setValue` */
  readonly value: string;
  readonly labels: GanttLabels;
  /** The current error message (shown under the cell, `aria-invalid`), or `null` */
  readonly invalid: string | null;
  /** Set the editor's text: what `commit()` parses */
  setValue(value: string): void;
  /** Parse, validate and apply; `'next'` / `'prev'` then edits the next / previous editable cell of the row */
  commit(move?: 'next' | 'prev'): void;
  /** Close the editor without a change */
  cancel(): void;
}

/**
 * Column definition. `TTemplate` is the framework-specific cell template
 * type (e.g. Angular's `TemplateRef<ColumnCellContext>`); framework-free
 * consumers can ignore it and use `render` instead. `TEditor` is the
 * framework-specific custom cell editor (`editor`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ColumnDef<TTemplate = any, TEditor = any> {
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
  /**
   * The cell can be edited (with `editing.cells` on): `true`, `false`, or per row. Default: `false`
   * for custom columns; the built-in `name`, `start`, `end`, `duration`, `progress` and
   * `predecessors` columns are editable, the other built-ins read-only. A read-only row
   * (`task.editable: false`) is never edited.
   */
  editable?: boolean | ((row: GanttFlatRow) => boolean) | undefined;
  /**
   * The cell editor: a built-in kind, or a custom editor (`TEditor`: a function returning a DOM
   * node in the Web Component and the React / Vue / Svelte wrappers; a template or a function in
   * Angular). Default: the built-in column's editor, `'text'` for custom columns.
   */
  editor?: CellEditorKind | TEditor | undefined;
  /** Settings of a built-in editor (`min` / `max` / `step`, the `select` options) */
  editorOptions?: CellEditorOptions | undefined;
  /** The cell's value as text: the editor's first value (and the CSV export's). Default: `render`, else the field's value */
  exportValue?: ((row: GanttFlatRow, ctx: ColumnContext) => string) | undefined;
  /**
   * The editor's text → the task fields to change; throw `new Error(message)` to reject it (the
   * message shows under the cell). Default: the built-in column's parser; for a custom column the
   * text, written to `task[key]` when `key` is a `GanttTask` field, else to `data[key]`.
   */
  parse?: ((value: string, row: GanttFlatRow, ctx: ColumnContext) => Partial<GanttTask>) | undefined;
  /** Checks the parsed fields: return a message to reject them, or nothing to accept */
  validate?:
    ((patch: Partial<GanttTask>, row: GanttFlatRow, ctx: ColumnContext) => string | null | undefined) | undefined;
}

// ─── Annotations ─────────────────────────────────────────────

export interface AnnotationLabel {
  text: string;
  color?: string | undefined;
  fontSize?: string | undefined;
  fontWeight?: string | undefined;
  /** Extra vertical offset (px) of the label drawn in the canvas while the marker lane is off; positive moves it down. Default 0 */
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
  /**
   * Fill of the progress overlay inside theme-coloured bars, drawn at `bar.progress.opacity`
   * (`task.progressColor` and `bar.progress.color` win, at full opacity). Default `'#000000'`.
   */
  progressOverlay?: string;
  /** Keyboard focus rings (bars, task list, toolbar). Default `'#2563EB'` (light), `'#60A5FA'` (dark) */
  focusRing?: string;
  /**
   * Tint over the row under the mouse, in both panes (`'transparent'` turns the hover off).
   * Default `'rgba(15, 23, 42, 0.04)'` (light), `'rgba(148, 163, 184, 0.08)'` (dark)
   */
  rowHoverBg?: string;
}

// ─── i18n: UI labels ─────────────────────────────────────────

/** Unit of a date change in announcements: whole days, or hours on hour scales. */
export type AnnounceUnit = 'day' | 'hour';

/**
 * Every user-facing string in the chart. Override any subset via
 * `GanttOptions.labels` (per instance) or `provideGantt({ labels })` (global).
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
  // Chart states
  /** Empty state when there are no tasks (and no `empty` slot / `[ganttEmpty]` content) */
  emptyState: string;
  /** Title of the error state; the `errorMessage` is shown under it */
  errorTitle: string;
  // Toolbar
  zoomIn: string;
  zoomOut: string;
  /** Toolbar button: the finest zoom level that shows every task */
  fitToScreen: string;
  todayButton: string;
  /** Toolbar labels per zoom level (built-in `ViewMode`s and custom level names) */
  viewModes: Partial<Record<ViewMode | (string & {}), string>>;
  /** Toolbar: split / table / chart view toggle (accessible name and tooltip of the icon buttons) */
  viewSplit: string;
  viewTable: string;
  viewChart: string;
  /** Splitter toggle button */
  showPanel: string;
  hidePanel: string;
  /** Toolbar: the menu button holding the controls that don't fit (`toolbar.overflow: 'menu'`) */
  more: string;
  /** Toolbar: undo the last change (`toolbar.undo`, while the chart keeps history) */
  undo: string;
  /** Toolbar: redo the last undone change */
  redo: string;
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
  /** A working duration under one working day of an hour calendar (`calendar.unit: 'hour'`): "6 hours" */
  durationHours: (hours: number) => string;
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
  /** Accessible name of the chart (the element's region) and of its timeline viewport */
  ariaChart: string;
  /** Accessible name of the task list (split panel and table view) */
  ariaTaskList: string;
  /** Accessible name of the toolbar */
  ariaToolbar: string;
  /** Accessible name of the toolbar's zoom-level radio group */
  ariaZoomLevels: string;
  /** Accessible name of the toolbar's view radio group */
  ariaViews: string;
  /** Accessible name of the timeline's bar list */
  ariaBars: string;
  /** Role description of a task bar (`aria-roledescription`) */
  ariaTask: string;
  /** Role description of a milestone */
  ariaMilestone: string;
  /** Role description of a group's summary bar */
  ariaGroup: string;
  /** Role description of a bar of a custom `barType` */
  ariaBarRole: string;
  ariaExpand: (name: string) => string;
  ariaCollapse: (name: string) => string;
  /** Accessible name of a cell editor: the column's label and the task's name ("Start, Design") */
  ariaCellEditor: (column: string, name: string) => string;
  // Accessible names of bars (`taskAccessibleName`)
  /** "65% complete" */
  ariaProgress: (progress: number) => string;
  /** The task is on the critical path */
  ariaCritical: string;
  /** A baseline bar is drawn for the task */
  ariaBaseline: string;
  /** Joins the formatted start and end ("10 Feb – 20 Mar 2026") */
  ariaDateRange: (start: string, end: string) => string;
  /** Format of the start when both dates are in the same year ("10 Feb") */
  ariaDateFormatShort: string;
  /** Format of a full date ("20 Mar 2026") */
  ariaDateFormatLong: string;
  /** Format appended to both dates when either is not at local midnight ("09:00") */
  ariaTimeFormat: string;
  /** Joins the parts of the name */
  ariaListSeparator: string;
  // Screen-reader announcements (aria-live)
  /** Selection changed; `0` means it was cleared */
  announceSelection: (count: number) => string;
  /** A page of the data source loaded and more remain; `count` tasks are loaded so far (the last page reads `allLoaded`) */
  announceLoaded: (count: number) => string;
  /** Bar moved by `amount` (> 0 later, < 0 earlier) */
  announceMoved: (name: string, amount: number, unit: AnnounceUnit) => string;
  /** Bar start (`edge: 'start'`) or end moved by `amount` */
  announceResized: (name: string, edge: 'start' | 'end', amount: number, unit: AnnounceUnit) => string;
  announceProgress: (name: string, progress: number) => string;
  /** Zoom changed; `level` is the toolbar label of the new level */
  announceZoom: (level: string) => string;
  /** Keyboard edit mode entered: name plus the key help */
  announceEditStart: (name: string) => string;
  /** Added to `announceEditStart` when the progress can be edited too (↑ / ↓ in move mode) */
  announceEditProgressHelp: string;
  announceEditCancel: (name: string) => string;
  /** Committed without any change */
  announceEditNoChange: (name: string) => string;
  announceExpanded: (name: string) => string;
  announceCollapsed: (name: string) => string;
  /** Link mode: pick the successor of `name` */
  announceLinkStart: (name: string) => string;
  announceLinkCreated: (from: string, to: string) => string;
  announceLinkCancel: string;
  /** A link was selected (a click on its arrow): it can be deleted */
  announceLinkSelected: (from: string, to: string) => string;
  /** A link was deleted */
  announceLinkDeleted: (from: string, to: string) => string;
  /** A change was undone; `what` describes it (`describeChange`) */
  announceUndo: (what: string) => string;
  /** A change was redone */
  announceRedo: (what: string) => string;
  /** A change was rejected (validation, `before-change` veto); `reason` is the error message */
  announceChangeRejected: (reason: string) => string;
  /**
   * Movement of a drag, e.g. "+3d" / "-2h" (`amount` in snap units).
   * @deprecated Not shown since 2.0: the drag readout (`dragReadout`) shows the new dates and duration.
   */
  dragDelta: (amount: number, unit: AnnounceUnit) => string;
  /** Readout next to a dragged bar: its formatted date range and duration, e.g. "3 Mar – 6 Mar · 3 days" */
  dragReadout: (range: string, duration: string) => string;
  // Tooltip rows
  /** Label of the critical-path row */
  ttCritical: string;
  /** Value of the critical-path row */
  ttCriticalValue: string;
  /** Label of the total-float row */
  ttFloat: string;
  /** Total float in days, e.g. "2d" */
  ttFloatDays: (days: number) => string;
  /** Total float under one working day of an hour calendar (`calendar.unit: 'hour'`), e.g. "4h" */
  ttFloatHours: (hours: number) => string;
  /** Label of the successors row */
  ttSuccessors: string;
  // Legend
  legendCritical: string;
  legendBaseline: string;
  // Editing: change descriptions and error messages
  /** A cell edit, in announcements and the history ("Edited Start of Design") */
  describeEdit: (name: string, column: string) => string;
  /** A required value (the name) is empty */
  errorRequired: string;
  /** Not a number */
  errorNumber: string;
  /** A number out of range */
  errorRange: (min: number, max: number) => string;
  /** Not a date */
  errorDate: string;
  /** Not a duration */
  errorDuration: string;
  /** The end would come before the start */
  errorEndBeforeStart: string;
  /** A predecessor reference matches no task */
  errorUnknownTask: (ref: string) => string;
  /** A predecessor name matches more than one task */
  errorAmbiguousTask: (ref: string) => string;
  /** A link from a task to itself */
  errorSelfLink: string;
  /** The link already exists */
  errorDuplicateLink: string;
  /** The link would close a loop of dependencies */
  errorCycle: string;
  /** A link between a task and its own ancestor or descendant (`editing.dependencies.parentChild` off) */
  errorParentChild: string;
  /** A predecessors edit adds a link while `editing.dependencies.create` is off */
  errorLinkCreate: string;
  /** A predecessors edit removes a link while `editing.dependencies.delete` is off */
  errorLinkDelete: string;
  /** The task is read-only (`task.editable: false`, or a rolled-up field) */
  errorReadOnly: string;
  /** The app vetoed the change (`before-change`); read after `announceChangeRejected` */
  errorRejected: string;
  // Export and print
  /** Toolbar: the Export menu button (`toolbar.export`), its menu and its section in the More menu */
  exportMenu: string;
  /** Export menu item: download an SVG image */
  exportSvg: string;
  /** Export menu item: download a PNG image */
  exportPng: string;
  /** Export menu item: download a CSV table */
  exportCsv: string;
  /** Export menu item: print the chart */
  exportPrint: string;
  /**
   * `<desc>` of an exported image: the task count and the first and last date drawn, formatted
   * with `formats.dateFormat` ("12 tasks from Mar 2, 2026 to Apr 30, 2026")
   */
  exportDescription: (count: number, start: string, end: string) => string;
  /** Footer of a printed page, after the title ("Page 2 of 5") */
  printPage: (page: number, total: number) => string;
  /** A download is ready (`download()`, the toolbar): the file's name */
  announceExportReady: (fileName: string) => string;
  /** `print()` opened the print dialog with `pages` pages */
  announcePrintReady: (pages: number) => string;
  /**
   * A file export started from the toolbar failed (alert region); `what` is the format's label
   * (`exportSvg`, `exportPng`, `exportCsv`)
   */
  announceExportFailed: (what: string) => string;
  /** A print started from the toolbar failed (alert region) */
  announcePrintFailed: string;
}

const unitCount = (n: number, unit: AnnounceUnit) => `${n} ${unit}${n === 1 ? '' : 's'}`;
const later = (amount: number) => (amount > 0 ? 'later' : 'earlier');

export const DEFAULT_LABELS: GanttLabels = {
  loading: 'Loading…',
  loadMore: 'Load more',
  allLoaded: n => `All ${n} tasks loaded`,
  loadError: 'Couldn’t load tasks',
  retry: 'Retry',
  emptyState: 'No tasks to show',
  errorTitle: 'Couldn’t show the chart',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fitToScreen: 'Fit to screen',
  todayButton: 'Today',
  viewModes: {
    [ViewMode.Hour]: 'Hour',
    [ViewMode.Day]: 'Day',
    [ViewMode.Week]: 'Week',
    [ViewMode.Month]: 'Month',
    [ViewMode.Quarter]: 'Quarter',
    [ViewMode.Year]: 'Year',
  },
  viewSplit: 'Table and chart',
  viewTable: 'Table only',
  viewChart: 'Chart only',
  showPanel: 'Show task list',
  hidePanel: 'Hide task list',
  more: 'More',
  undo: 'Undo',
  redo: 'Redo',
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
  durationHours: h => (h === 1 ? '1 hour' : `${h} hours`),
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
  ariaToolbar: 'Chart toolbar',
  ariaZoomLevels: 'Zoom level',
  ariaViews: 'View',
  ariaBars: 'Task bars',
  ariaTask: 'task bar',
  ariaMilestone: 'milestone',
  ariaGroup: 'summary bar',
  ariaBarRole: 'bar',
  ariaExpand: name => `Expand ${name}`,
  ariaCollapse: name => `Collapse ${name}`,
  ariaCellEditor: (column, name) => `${column}, ${name}`,
  ariaProgress: p => `${p}% complete`,
  ariaCritical: 'critical',
  ariaBaseline: 'planned baseline shown',
  ariaDateRange: (start, end) => `${start} – ${end}`,
  ariaDateFormatShort: 'D MMM',
  ariaDateFormatLong: 'D MMM YYYY',
  ariaTimeFormat: 'HH:mm',
  ariaListSeparator: ', ',
  announceSelection: n => (n === 0 ? 'Selection cleared' : n === 1 ? '1 task selected' : `${n} tasks selected`),
  announceLoaded: n => `${n} tasks loaded`,
  announceMoved: (name, amount, unit) => `${name} moved ${unitCount(Math.abs(amount), unit)} ${later(amount)}`,
  announceResized: (name, edge, amount, unit) =>
    `${name} ${edge} moved ${unitCount(Math.abs(amount), unit)} ${later(amount)}`,
  announceProgress: (name, p) => `${name} ${p}% complete`,
  announceZoom: level => `Zoom: ${level}`,
  announceEditStart: name =>
    `Editing ${name}. Arrow keys move, Shift+Arrow resizes the end, Alt+Arrow resizes the start, ` +
    `Enter saves, Escape cancels.`,
  announceEditProgressHelp: 'Up and Down change the progress.',
  announceEditCancel: name => `Edit of ${name} cancelled`,
  announceEditNoChange: name => `${name} unchanged`,
  announceExpanded: name => `${name} expanded`,
  announceCollapsed: name => `${name} collapsed`,
  announceLinkStart: name => `Linking from ${name}. Move to another task and press Enter, or Escape to cancel.`,
  announceLinkCreated: (from, to) => `Linked ${from} to ${to}`,
  announceLinkCancel: 'Linking cancelled',
  announceLinkSelected: (from, to) => `Link from ${from} to ${to} selected. Press Delete to remove it.`,
  announceLinkDeleted: (from, to) => `Removed the link from ${from} to ${to}`,
  announceUndo: what => `Undone: ${what}`,
  announceRedo: what => `Redone: ${what}`,
  announceChangeRejected: reason => `Not changed: ${reason}`,
  dragDelta: (amount, unit) => `${amount > 0 ? '+' : ''}${amount}${unit === 'hour' ? 'h' : 'd'}`,
  dragReadout: (range, duration) => `${range} · ${duration}`,
  ttCritical: 'Critical path',
  ttCriticalValue: 'Yes',
  ttFloat: 'Float',
  ttFloatDays: days => `${days}d`,
  ttFloatHours: hours => `${hours}h`,
  ttSuccessors: 'Successors',
  legendCritical: 'Critical path',
  legendBaseline: 'Baseline',
  describeEdit: (name, column) => `Edited ${column} of ${name}`,
  errorRequired: 'Enter a value',
  errorNumber: 'Enter a number',
  errorRange: (min, max) => `Enter a number from ${min} to ${max}`,
  errorDate: 'Enter a valid date',
  errorDuration: 'Enter a duration such as 5d, 2w or 4h',
  errorEndBeforeStart: 'The end can’t be before the start',
  errorUnknownTask: ref => `No task “${ref}”`,
  errorAmbiguousTask: ref => `More than one task is called “${ref}”: use its ID`,
  errorSelfLink: 'A task can’t depend on itself',
  errorDuplicateLink: 'These tasks are already linked',
  errorCycle: 'This link would make a loop',
  errorParentChild: 'A task can’t be linked to its own parent or child',
  errorLinkCreate: 'New links can’t be added here',
  errorLinkDelete: 'Links can’t be removed here',
  errorReadOnly: 'This task can’t be edited',
  errorRejected: 'the change was not accepted',
  exportMenu: 'Export',
  exportSvg: 'SVG image',
  exportPng: 'PNG image',
  exportCsv: 'CSV table',
  exportPrint: 'Print…',
  exportDescription: (count, start, end) =>
    count === 1 ? `1 task from ${start} to ${end}` : `${count} tasks from ${start} to ${end}`,
  printPage: (page, total) => `Page ${page} of ${total}`,
  announceExportReady: fileName => `${fileName} is ready`,
  announcePrintReady: pages => (pages === 1 ? 'Printing 1 page' : `Printing ${pages} pages`),
  announceExportFailed: what => `Couldn’t export the ${what}`,
  announcePrintFailed: 'Couldn’t print the chart',
};

// ─── i18n: date & header formats ─────────────────────────────

/** Builds a header label for a given period start date. */
export type HeaderFormatFn = (date: Date) => string;

export interface GanttHeaderFormats {
  top?: HeaderFormatFn | undefined;
  bottom?: HeaderFormatFn | undefined;
}

export interface GanttFormats {
  /** Format string (dayjs-compatible tokens) for dates in columns & tooltip */
  dateFormat: string;
  /** Per-view header label overrides — omitted rows use the built-in formatter */
  header?: Partial<Record<ViewMode, GanttHeaderFormats>> | undefined;
  /**
   * Format of the dates in the drag readout (dayjs-compatible tokens). Default: by scale unit,
   * `DRAG_READOUT_FORMAT` (`'D MMM'`) on day scales and `DRAG_READOUT_HOUR_FORMAT` on hour scales.
   */
  readoutFormat?: string | undefined;
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

/** First day of the week: 0 = Sunday, 1 = Monday, 6 = Saturday. */
export type WeekStart = 0 | 1 | 6;

/**
 * How weeks are numbered: `'iso'` (ISO-8601: Monday, week 1 holds the year's first Thursday),
 * `'us'` (Sunday, week 1 holds January 1) or `'locale'` (the locale's own rule through `Intl`,
 * falling back to ISO).
 */
export type WeekNumbering = 'iso' | 'us' | 'locale';

/** A week-numbering rule, as in `Intl.Locale#getWeekInfo()` (with Sunday as 0). */
export interface WeekRule {
  /** First day of the week, 0–6 (0 = Sunday) */
  firstDay: number;
  /** Days of the new year week 1 must hold, 1–7 (ISO 4, US 1) */
  minimalDays: number;
}

/** Row and header heights and the toolbar control size: compact 28 / normal 36 / comfortable 44 px rows. */
export type GanttDensity = 'compact' | 'normal' | 'comfortable';

export interface ScaleFormatContext {
  unit: TimeUnit;
  step: number;
  locale?: string | undefined;
  labels: GanttLabels;
  /** First day of the week of the chart */
  weekStart: WeekStart;
  /** Week-numbering rule of the chart (`weekNumbering` and `weekStart`) */
  week: WeekRule;
}

/** Format string with dayjs-compatible tokens (e.g. `'MMM YYYY'`, `'[W]W'`) or a function of the cell's period. */
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
  /**
   * `'shade'` = tinted by kind (`weekendBg`, `holidayBg`, `offHoursBg`), `'hatch'` = the tint plus
   * diagonal stripes, `'disabled'` = greyed out: weekends, holidays without their own colour and
   * off-hours in one neutral grey (`borderColor`, `--gantt-border`), `'none'` = no weekend, holiday
   * or off-hours band (the non-working time still counts for `calendar`; intensive hours and
   * `highlightTime` still paint). Default `'shade'`; an unknown value reads as `'shade'`.
   */
  style?: 'shade' | 'hatch' | 'disabled' | 'none' | undefined;
  /** Tint the matching header cells too (default true) */
  showInHeader?: boolean | undefined;
  /** Hide day shading below this density (default 12 px/day: shown in Day / Week views) */
  minPxPerDay?: number | undefined;
}

/** What durations count: working time (`'working'`) or calendar time (`'calendar'`). */
export type GanttDurationMode = 'calendar' | 'working';

/** The unit of working time: whole working days, or the working hours of each day. */
export type GanttCalendarUnit = 'day' | 'hour';

/** `options.calendar`: how working time is counted and edited. */
export interface GanttCalendarOptions {
  /**
   * What durations count — the Duration column, tooltip, drag readout, duration cells, CSV
   * values, rollup weights, the critical path, lags and float: working time (`'working'`) or
   * calendar days (`'calendar'`, the texts of a chart without a calendar). Default `'working'`
   */
  durations?: GanttDurationMode | undefined;
  /**
   * Working time in whole days (`'day'`: a working day counts all day), or the hours of
   * `nonWorkingTime.workingHours` (`'hour'`; 09:00–17:00 when they are not set). Default `'day'`
   */
  unit?: GanttCalendarUnit | undefined;
  /**
   * Edits (drag, resize, move mode, date and duration cells) never start or end a task on
   * non-working time: starts move forward, ends back. The app's own data is never moved.
   * Default true
   */
  skipNonWorking?: boolean | undefined;
  /**
   * Working hours in one day with `unit: 'hour'`: what `1d` means in a duration (more than 0, at
   * most 24). Default 8
   */
  hoursPerDay?: number | undefined;
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
  /** Resize handles at the bar's ends */
  handles?:
    | {
        /**
         * Width of each pointer target in px, centred on the bar edge (default 24, WCAG 2.5.8).
         * A target never reaches more than a third of the bar inward and the two never overlap.
         */
        hitSize?: number | undefined;
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
  /**
   * Every parent row starts collapsed (ids the chart has not seen before, like `task.collapsed`).
   * With `rollup` this is the "only parents" view. Default false.
   */
  collapsed?: boolean | undefined;
}

export interface GanttArrowOptions {
  width?: number | undefined;
  headSize?: number | undefined;
  /** Corner radius of the orthogonal path */
  radius?: number | undefined;
  color?: string | undefined;
  /** Horizontal clearance before the first bend */
  offset?: number | undefined;
  /** `'orthogonal'` = right-angled path with rounded bends, `'straight'` = one line. Default `'orthogonal'` */
  routing?: 'orthogonal' | 'straight' | undefined;
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
  /** "Fit to screen" button: the finest zoom level that shows every task (default true) */
  fit?: boolean | undefined;
  /** A button that shows / hides the task list, first in the toolbar (default false) */
  panelToggle?: boolean | undefined;
  /**
   * What happens when the controls don't fit the width: `'menu'` moves the zoom levels, then the
   * views, into a "More" menu; `'wrap'` wraps them onto more lines. Default `'menu'`.
   */
  overflow?: 'menu' | 'wrap' | undefined;
  /**
   * Undo and Redo buttons after the task list toggle. They show only while the chart keeps
   * history (`editing` on, `history` not off, not `controlled`) and never move into the More menu.
   * Default true.
   */
  undo?: boolean | undefined;
  /**
   * An Export menu button after the view switch, with one item per `export.formats` (SVG image,
   * PNG image, CSV table, Print…): each runs `download(format)` or `print()` (`trigger:
   * 'toolbar'`). It is the first group to move into the More menu while the toolbar is too narrow.
   * Default false.
   */
  export?: boolean | undefined;
}

/** Below `breakpoint` px of chart width, the chart shows `view`. */
export interface GanttResponsiveOptions {
  /** Width in px under which the chart is narrow (default 640) */
  breakpoint?: number | undefined;
  /** View shown while narrow (default `'chart'`); a view the user picks while narrow wins */
  view?: GanttView | undefined;
}

export interface GanttKeyboardOptions {
  /**
   * Single-character shortcuts anywhere in the chart: `+` / `-` zoom, `T` scrolls to today,
   * `F` fits the tasks to the screen. Turn them off when they clash with the page (WCAG 2.1.4).
   * Default true.
   */
  characterShortcuts?: boolean | undefined;
}

/** What `tooltip.render` receives: the built-in tooltip model and the hovered / focused task. */
export interface GanttTooltipRenderContext {
  /** The content the built-in tooltip would show (title, rows, progress…) */
  model: TooltipModel;
  task: GanttTask;
  row: GanttFlatRow;
}

export interface GanttTooltipOptions {
  /**
   * What opens the tooltip: `'hover'` (pointer only), `'focus'` (keyboard focus only) or
   * `'auto'` (both, and a tap on touch screens). Default `'auto'`.
   */
  trigger?: 'auto' | 'hover' | 'focus' | undefined;
  /** How long the pointer rests on a bar before the tooltip opens, in ms (default 320). Focus opens it at once. */
  showDelay?: number | undefined;
  /** How long the tooltip stays open after the pointer leaves the bar, in ms (default 120) */
  hideDelay?: number | undefined;
  /**
   * Custom tooltip content, replacing the built-in title and rows: return a string (shown as
   * text) or a DOM node. Angular's `<ng-template ganttTooltip>` takes precedence over it.
   * Typed `unknown` because `@gantryjs/core` has no DOM types.
   */
  render?: ((ctx: GanttTooltipRenderContext) => unknown) | undefined;
}

export interface GanttLegendOptions {
  /**
   * Where the legend sits when `showLegend` is on: `'bottom'` (a strip under the chart) or
   * `'toolbar'` (at the end of the toolbar; falls back to the bottom when the toolbar is hidden).
   * Default `'bottom'`.
   */
  position?: 'bottom' | 'toolbar' | undefined;
}

export interface GanttMarkerOptions {
  /**
   * A lane under the header tiers for the today marker and the annotation labels, so labels
   * never cover bars. `'auto'` (default) shows it when at least one annotation has a label.
   */
  lane?: 'auto' | boolean | undefined;
}

/**
 * Interactive editing (`GanttOptions.editing`). In the object form every feature is on unless it is
 * set to `false`; `dependencies.parentChild` is the exception (off unless set).
 */
export interface GanttEditingOptions {
  /** Edit the cells of editable columns (F2, Enter, typing, double-click). Default true */
  cells?: boolean | undefined;
  /** The progress grip on task bars and ↑ / ↓ in move mode, `step` in % (default 5). Default true */
  progress?: boolean | { step?: number | undefined } | undefined;
  /**
   * Links: `create` (drag from a bar's connector to another bar, click a connector then a bar, or
   * L then Enter), `delete` (click an arrow, then Delete) and `parentChild` (allow links between a
   * task and its own ancestors or descendants). Default `true` = create and delete, no parent–child.
   */
  dependencies?:
    | boolean
    | {
        create?: boolean | undefined;
        delete?: boolean | undefined;
        parentChild?: boolean | undefined;
      }
    | undefined;
  /**
   * Your own check, after the built-in ones (links, dates, progress range, read-only rows): return
   * `false` or a message to reject the change (announced, shown under an edited cell). Anything
   * else accepts it.
   */
  validate?: ((change: GanttChange, ctx: GanttValidateContext) => boolean | string | null | undefined) | undefined;
  /**
   * Undo / redo (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z or Ctrl+Y, the methods and `toolbar.undo`): at most
   * `limit` steps (default 100); consecutive keyboard, progress or cell changes of one task within
   * `coalesceMs` (default 800) make one step. Default true; always off when `controlled`.
   */
  history?: boolean | { limit?: number | undefined; coalesceMs?: number | undefined } | undefined;
  /**
   * The app owns the tasks: a change is validated and announced, `before-change` can veto it, and
   * the events carry the proposed tasks (`tasks-change` with `applied: false`), but the chart
   * applies nothing and keeps no history — set the tasks yourself. Default false
   */
  controlled?: boolean | undefined;
}

/** What `editing.validate` receives besides the change. */
export interface GanttValidateContext {
  /** The chart's tasks before the change */
  tasks: readonly GanttTask[];
  /** The tasks with the change applied */
  proposed: readonly GanttTask[];
  /**
   * The chart's working calendar (`options.calendar`), `null` without one: for rules such as "no
   * task starts on a holiday" (`calendar.isWorkingDay(task.start)`)
   */
  calendar?: WorkingCalendar | null | undefined;
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

// ─── Export and print ────────────────────────────────────────

/** What an export makes: an SVG or PNG image, a CSV table, or printed pages. */
export type GanttExportFormat = 'svg' | 'png' | 'csv' | 'print';

/** What started a `download()` / `print()`: the toolbar's Export menu, or a call of the method. */
export type GanttExportTrigger = 'toolbar' | 'api';

/**
 * What an image (SVG, PNG) or a print draws. Exports are drawn from the chart's model, not copied
 * from the screen: every shown row (collapse state and sort kept, none left out by scrolling), the
 * header and marker lane, bands, grid lines, annotations, today, arrows, bars and the legend; never
 * the selection, hover, focus, grips, previews, tooltip, toolbar or scrollbars.
 */
export interface GanttImageExportOptions {
  /**
   * The view to draw: `'auto'` = the view shown (table and timeline in `'split'`, the timeline in
   * `'chart'`, the table in `'table'`). Default `'auto'`
   */
  view?: 'auto' | GanttView | undefined;
  /**
   * The dates drawn: `'all'` = the tasks' range (and a sync group's), whatever the chart's width;
   * `'visible'` = the part of the timeline on screen (`'all'` without a screen); `{ start, end }` =
   * those dates (the timeline is extended to cover them). Default `'all'`
   */
  range?: 'all' | 'visible' | { start: Date; end: Date } | undefined;
  /**
   * The colours: `'current'` = the palette shown (dark included); `'light'` / `'dark'` = that
   * palette with the chart's theme overrides. Default `'current'`; `'light'` for print
   */
  theme?: 'current' | 'light' | 'dark' | undefined;
  /**
   * `'theme'` = the chart's background, `'transparent'` (SVG and PNG) or a CSS colour. Print always
   * draws the theme's background. Default `'theme'`
   */
  background?: 'theme' | 'transparent' | (string & {}) | undefined;
  /** Draw the legend strip at the bottom. Default: as the chart (`showLegend`, with entries) */
  legend?: boolean | undefined;
  /** Draw the today line and its header pointer. Default: `showToday` */
  today?: boolean | undefined;
  /** The image's `<title>` and the print document's title. Default `labels.ariaChart` */
  title?: string | undefined;
  /** The image's `<desc>`. Default `labels.exportDescription(count, start, end)` */
  description?: string | undefined;
  /**
   * Custom bars: `'render'` = drawn as on screen (`renderBar`, Angular bar components; only
   * attributes and inline styles travel), `'builtin'` = drawn as built-in bars. Default `'render'`
   */
  customBars?: 'render' | 'builtin' | undefined;
}

/** `exportSvg()` / `download('svg')` options. */
export interface GanttSvgExportOptions extends GanttImageExportOptions {
  /** `width` / `height` of the `<svg>` times this (the `viewBox` stays the same). Default 1 */
  scale?: number | undefined;
  /** Prefix of the image's ids (`<prefix>-title`, `<prefix>-desc`…). Default `gantry-export-<n>` (unique per call) */
  idPrefix?: string | undefined;
}

/** `exportPng()` / `download('png')` options. */
export interface GanttPngExportOptions extends GanttImageExportOptions {
  /**
   * Pixels per CSS pixel. Lowered (to 0.01) until the image fits `maxSide` and `maxPixels`; below 1
   * the export fails with a `RangeError` (use `exportSvg()`, `print()` or a `range`). Default 2
   */
  scale?: number | undefined;
  /** Largest width or height of the image in pixels. Default 16 384 */
  maxSide?: number | undefined;
  /** Largest number of pixels of the image. Default 16 777 216 (4096 × 4096, safe on iOS) */
  maxPixels?: number | undefined;
}

/** `exportCsv()` / `download('csv')` options. */
export interface GanttCsvExportOptions {
  /**
   * `'visible'` = the columns of the view shown (the split panel's in the chart view), `'all'` =
   * every built-in and custom column, or a list of column keys. Default `'visible'`
   */
  columns?: 'visible' | 'all' | readonly string[] | undefined;
  /**
   * `'all'` = every loaded task in display order (children of collapsed rows included), `'shown'` =
   * the rows shown. Default `'all'`
   */
  rows?: 'all' | 'shown' | undefined;
  /**
   * `'data'` = values (local ISO dates, numbers, status and type keys, predecessor ids),
   * `'display'` = the cell texts. A column's `exportValue` wins in both. Default `'data'`
   */
  values?: 'data' | 'display' | undefined;
  /** Field separator. Default `','` */
  delimiter?: ',' | ';' | '\t' | undefined;
  /** A first line with the column labels. Default true */
  header?: boolean | undefined;
  /** A UTF-8 byte order mark at the start of a downloaded file (so Excel reads UTF-8); `exportCsv()` returns text without it. Default true */
  bom?: boolean | undefined;
  /**
   * A leading `'` on every cell starting with `=`, `+`, `-`, `@`, tab or CR that is not a plain
   * number, so a spreadsheet shows it as text instead of running it (CSV injection). Default true
   */
  neutralizeFormulas?: boolean | undefined;
}

/** A sheet of paper: a named size, or `{ width, height, unit }` (portrait: width ≤ height). */
export type GanttPaperSize =
  'a4' | 'a3' | 'letter' | 'legal' | 'tabloid' | { width: number; height: number; unit: 'mm' | 'in' };

/** `print()` options: the plan on as many pages as it takes. */
export interface GanttPrintOptions extends GanttImageExportOptions {
  /** Default `'a4'` */
  paper?: GanttPaperSize | undefined;
  /** `'auto'` = the drawing's own orientation (landscape when it is wider than tall). Default `'landscape'` */
  orientation?: 'landscape' | 'portrait' | 'auto' | undefined;
  /** Page margin in mm. Default 10 */
  margin?: number | undefined;
  /**
   * `'width'` = the whole width scaled to the page width (never enlarged, at least `minScale`),
   * then pages across; `'page'` = everything on one page; `'none'` = actual size times `scale`.
   * Rows are never cut. Default `'width'`
   */
  fit?: 'width' | 'page' | 'none' | undefined;
  /** Size with `fit: 'none'`. Default 1 */
  scale?: number | undefined;
  /** Smallest scale of `fit: 'width'`. Default 0.5 */
  minScale?: number | undefined;
  /** Draw the header on every page. Default true */
  repeatHeader?: boolean | undefined;
  /** Draw the task list on every column of pages (on the first only when it takes more than half the width). Default true */
  repeatTable?: boolean | undefined;
  /** A footer with the title and "Page n of N" (`labels.printPage`). Default true */
  pageNumbers?: boolean | undefined;
  /** More pages than this fail with a `RangeError`. Default 200 */
  maxPages?: number | undefined;
}

/** The file of a `download()`. */
export interface GanttFileOptions {
  /** The file's name: sanitized for every OS, the extension added when missing. Default `export.fileName` */
  fileName?: string | undefined;
}

/**
 * `options.export`: the file name, the formats of the toolbar's Export menu, and the defaults of
 * each format (a call's own options win over them).
 */
export interface GanttExportOptions {
  /** The downloaded file's name, or a function of the format. Default `'gantt'` */
  fileName?: string | ((format: 'svg' | 'png' | 'csv') => string) | undefined;
  /** The items of the toolbar's Export menu (`toolbar.export`), in order. Default `['svg', 'png', 'csv', 'print']` */
  formats?: readonly GanttExportFormat[] | undefined;
  svg?: GanttSvgExportOptions | undefined;
  png?: GanttPngExportOptions | undefined;
  csv?: GanttCsvExportOptions | undefined;
  print?: GanttPrintOptions | undefined;
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
   * BCP 47 locale (e.g. `'it'`, `'de-CH'`). Month/day names follow it, through `Intl`
   * (nothing to import). Default `'en'`; unknown tags fall back to `'en'`.
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
  /**
   * First day of the week: 1 = Monday, 0 = Sunday, 6 = Saturday. Default: the `weekNumbering`
   * rule's first day (Monday when neither is set).
   */
  weekStart?: WeekStart | undefined;
  /**
   * Week numbers in the header: `'iso'`, `'us'` or `'locale'` (see `WeekNumbering`); `weekStart`
   * overrides the rule's first day. Default `'us'` when `weekStart` is 0, otherwise `'iso'`.
   */
  weekNumbering?: WeekNumbering | undefined;
  /** Stretch the timeline so it always fills the viewport (default true) */
  fitToWidth?: boolean | undefined;
  /**
   * Where the timeline scrolls on the first render with data. Default `'auto'`: today when
   * it is near the tasks, otherwise the earliest task. `'today'`, `'start'` (earliest task),
   * a `Date` (centred), or `false` to stay at the timeline start.
   */
  initialScroll?: 'auto' | 'today' | 'start' | Date | false | undefined;
  gridLines?: GanttGridLines | undefined;
  /**
   * Weekends, holidays, working / intensive hours: shaded on the timeline, and the working time
   * `calendar` counts (Saturday and Sunday off when unset; `false` = no non-working time)
   */
  nonWorkingTime?: GanttNonWorkingTime | false | undefined;
  /**
   * Working calendar: durations, lags, float and the critical path count working time (the
   * weekends, holidays and — with `unit: 'hour'` — working hours of `nonWorkingTime`), and edits
   * skip non-working time. `true` = `{}` (working days, skipping on). A week without working time
   * turns it off. Default off: every duration counts calendar days.
   */
  calendar?: boolean | GanttCalendarOptions | undefined;
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
  /** Default bar and row styles by kind, parent, level and rule (`task.style` wins over them) */
  styles?: GanttStyleOptions | undefined;
  /**
   * Parent rows roll up progress, dates, colour and segments from their children. `true` =
   * `{ progress: 'duration', dates: true, color: false, segments: false }`. Default false.
   */
  rollup?: boolean | GanttRollupOptions | undefined;

  // ── Layout ──
  /**
   * Row height, header tiers and toolbar controls: `'compact'` (rows 28, tiers 28 / 24, controls
   * 28 px), `'normal'` (36, 32 / 28, 32 px) or `'comfortable'` (44, 36 / 32, 36 px). An explicit
   * `rowHeight`, `headerHeight` or `subHeaderHeight` wins. Default `'normal'`.
   */
  density?: GanttDensity | undefined;
  /**
   * Below `breakpoint` px of chart width the chart switches to `view` (the switch is never saved
   * in the state). `false` turns it off. Default `{ breakpoint: 640, view: 'chart' }`.
   */
  responsive?: GanttResponsiveOptions | false | undefined;
  panel?: GanttPanelOptions | undefined;
  /** Columns of the full table view (`view: 'table'`) */
  table?: GanttTableOptions | undefined;
  view?: GanttView | undefined;
  toolbar?: GanttToolbarOptions | false | undefined;
  /** Legend placement (`showLegend` turns it on) */
  legend?: GanttLegendOptions | undefined;
  /** Today and annotation markers */
  markers?: GanttMarkerOptions | undefined;
  /** Persist UI state (panel width, view, zoom, column widths…) in localStorage */
  stateKey?: string | undefined;

  // ── Interaction ──
  /** Keyboard shortcuts */
  keyboard?: GanttKeyboardOptions | undefined;
  /** Tooltip trigger, timing and custom content (`tooltipEnabled` turns it on) */
  tooltip?: GanttTooltipOptions | undefined;
  /**
   * Interactive editing: cells, the progress grip, creating and deleting links, undo / redo
   * (`GanttEditingOptions`). `true` turns every feature on; the object form turns on each feature
   * it does not set to `false`. Drag and resize follow `enableDrag` / `enableResize` either way, and
   * every change — drag, resize, keyboard, API — goes through the same pipeline (`before-change`,
   * `tasks-change`). Default false.
   */
  editing?: boolean | GanttEditingOptions | undefined;

  // ── Export and print ──
  /**
   * Defaults of the export methods (`exportSvg`, `exportPng`, `exportCsv`, `download`, `print`)
   * and the toolbar's Export menu (`toolbar.export`): the file name, the menu's formats and the
   * options of each format (`GanttExportOptions`).
   */
  export?: GanttExportOptions | undefined;
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
  /** The edge that moved: the task's start or its end */
  edge: 'start' | 'end';
  /** @deprecated Use `edge`: `'left'` is `'start'`, `'right'` is `'end'`. */
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

/** A task's progress changed (the progress grip, ↑ / ↓ in move mode, the `progress` cell). */
export interface TaskProgressEvent {
  taskId: string;
  oldProgress: number;
  newProgress: number;
}

// ─── Editing: changes and their events ───────────────────────

/** What made a change. */
export type GanttChangeSource =
  'drag' | 'resize' | 'progress' | 'keyboard' | 'cell' | 'link' | 'delete' | 'api' | 'undo' | 'redo';

/**
 * One task's changed fields. `after` holds the new values; `before` holds exactly the same fields
 * with their old values (`undefined` where the field was not set), so it restores the task as it was.
 */
export interface GanttTaskUpdate {
  taskId: string;
  before: Partial<GanttTask>;
  after: Partial<GanttTask>;
}

/**
 * What a change does, derived from its field updates (`deriveOps`), whatever the gesture: equal
 * start and end shifts → `move`; one edge → `resize`; both edges by different amounts → `move` then
 * `resize` (end); progress → `progress`; a dependency added / removed → `link` / `unlink`. Each op
 * fires its event (`task-dragged`, `task-resized`, `task-progress-changed`, `dependency-created`,
 * `dependency-deleted`).
 */
export type GanttChangeOp =
  | { op: 'move'; event: TaskDragEvent }
  | { op: 'resize'; event: TaskResizeEvent }
  | { op: 'progress'; event: TaskProgressEvent }
  | { op: 'link'; event: DependencyChangeEvent }
  | { op: 'unlink'; event: DependencyChangeEvent };

/** One change to the tasks: one `before-change`, one undo step. */
export interface GanttChange {
  source: GanttChangeSource;
  /** The field updates, in order */
  updates: readonly GanttTaskUpdate[];
  /** The ops derived from `updates` (`deriveOps`), in order */
  ops: readonly GanttChangeOp[];
  /** The column key of a cell edit */
  column?: string | undefined;
  /** Consecutive changes with the same key within `history.coalesceMs` make one undo step */
  coalesceKey?: string | undefined;
}

/**
 * `before-change` detail: the change about to be applied and the tasks it would give. Call
 * `preventDefault()` (synchronously) to veto it; the Web Component's event is also cancelable.
 */
export interface GanttBeforeChangeEvent {
  readonly change: GanttChange;
  /** The proposed tasks: the current tasks with the change applied */
  readonly tasks: readonly GanttTask[];
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/** `tasks-change` detail: after every accepted change (in controlled mode too). */
export interface GanttTasksChangeEvent {
  /** The tasks now (`applied`), or the proposed tasks to set yourself (controlled mode) */
  tasks: GanttTask[];
  change: GanttChange;
  /** The chart applied the change (`false` in controlled mode or when the app set the tasks during `before-change`) */
  applied: boolean;
}

/** `task-updated` detail: one per changed task, after the op events. */
export interface TaskUpdatedEvent {
  taskId: string;
  /** The task with the change */
  task: GanttTask;
  /** The task before it */
  previous: GanttTask;
  /** The changed field names */
  fields: string[];
  source: GanttChangeSource;
}

/** The undo / redo state (`history-change` detail). */
export interface GanttHistoryState {
  canUndo: boolean;
  canRedo: boolean;
  /** What Undo would undo (`describeChange`), or `null` */
  undoLabel: string | null;
  /** What Redo would redo, or `null` */
  redoLabel: string | null;
  undoCount: number;
  redoCount: number;
}

/**
 * `before-export` detail: a `download()` or `print()` (from the toolbar or the API) is about to
 * run. Call `preventDefault()` (synchronously) to cancel it; the Web Component's event is also
 * cancelable. `exportSvg()`, `exportPng()` and `exportCsv()` fire no event.
 */
export interface GanttBeforeExportEvent {
  readonly format: GanttExportFormat;
  readonly trigger: GanttExportTrigger;
  /** The file's name with its extension; `null` for print */
  readonly fileName: string | null;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/** `export` detail: a `download()` or `print()` finished. */
export interface GanttExportEvent {
  format: GanttExportFormat;
  trigger: GanttExportTrigger;
  /** The file's name with its extension; `null` for print */
  fileName: string | null;
  /** Size of the file in bytes; `null` for print */
  size: number | null;
  /** Pages printed; `null` for a download */
  pages: number | null;
}

/** The user pressed Retry: on the error state (`'error'`) or after a failed data-source page (`'dataSource'`). */
export interface RetryEvent {
  source: 'error' | 'dataSource';
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
  /**
   * The resolved theme of the chart. `ctx.visual.paint.*` may be `var(--gantt-*)` tokens: apply
   * them as CSS properties (`style.fill`), or turn them into colours with `resolvePaint(paint, ctx.theme)`.
   */
  theme: GanttTheme;
  layoutParams: GanttLayoutParams;
  /** Whether this task is on the critical path */
  isCritical: boolean;
  /** Whether this task row is currently selected */
  isSelected: boolean;
  /** Whether drag-resize handles should be shown */
  enableResize: boolean;
  /** Whether baseline bar should be rendered */
  showBaseline: boolean;
  /**
   * Effective drag/resize for this row (`enableDrag` ∧ `task.draggable` ∧ resize option).
   * Drives cursor and interaction affordances on the bar.
   */
  draggable: boolean;
  /** Geometry computed by the core render model (position, size, label…) */
  visual: BarVisual;
  /** The row's resolved style (the cascade of `options.styles`, rollup and `task.style`) */
  style: ResolvedTaskStyle;
}
