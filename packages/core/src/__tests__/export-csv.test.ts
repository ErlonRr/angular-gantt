// ─────────────────────────────────────────────────────────────
//  Tests — Phase 12 step 2.5: the CSV export (D13 / D14). RFC 4180
//  quoting with CRLF lines, formula neutralisation (header cells too,
//  plain numbers kept), data and display values per built-in column,
//  `exportValue` winning in both, custom columns, rows all / shown,
//  columns visible / all / keys, delimiters, the chart's `export.csv`
//  under a call's options, and no byte order mark outside files.
//  Dates are built with `new Date(y, m, d)`: run under `pnpm test:tz`.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FORMATS,
  DEFAULT_LABELS,
  buildBuiltinColumns,
  buildColumnContext,
  computeCellVisual,
  csvCellValue,
  csvField,
  exportChartCsv,
  exportFileText,
  filterVisible,
  flattenTree,
  isPlainNumber,
  mergeColumnDefs,
  neutralizeFormula,
  normalizeTasks,
  reindexVisible,
  resolveConfig,
  resolveTheme,
  resolveViewColumns,
  type ChartExportSource,
  type ColumnDef,
  type GanttOptions,
  type GanttTask,
  type GanttView,
} from '../index';

// ─── Fixture: a chart snapshot built by hand (the WC rows pipeline) ──

const NOW = new Date(2026, 2, 10, 12, 0);

interface SourceInput {
  options?: GanttOptions;
  columns?: ColumnDef[];
  collapsed?: string[];
  view?: GanttView;
}

function makeSource(tasks: GanttTask[], input: SourceInput = {}): ChartExportSource {
  const options = input.options ?? {};
  const config = resolveConfig(options);
  const i18n = { locale: 'en-US', labels: DEFAULT_LABELS, formats: DEFAULT_FORMATS };
  const normalised = normalizeTasks([...tasks]);
  const allRows = flattenTree(normalised, new Set(input.collapsed ?? []));
  const rows = reindexVisible(filterVisible(allRows));
  const builtins = buildBuiltinColumns(DEFAULT_LABELS, 'en-US', DEFAULT_FORMATS.dateFormat);
  const custom = input.columns ? mergeColumnDefs(input.columns, builtins) : null;
  const columns = custom ?? builtins;
  const ofView = (view: GanttView) => resolveViewColumns({ columns, builtins, custom: custom !== null, view, config });
  const all = custom ? [...custom, ...builtins.filter(b => !custom.some(c => c.key === b.key))] : builtins;
  return {
    config,
    i18n,
    theme: resolveTheme(false),
    dark: false,
    themeOverrides: null,
    tasks: normalised,
    rows,
    allRows,
    columns: { split: ofView('split'), table: ofView('table'), all },
    columnCtx: buildColumnContext({ tasks: normalised, config, now: NOW, locale: 'en-US' }),
    rowStyle: () => ({}),
    segments: () => null,
    critical: new Set(),
    annotations: [],
    now: NOW,
    view: input.view ?? 'split',
    panelWidth: 400,
    tableWidth: null,
    shared: null,
    showLegend: false,
    viewport: null,
    customBar: null,
  };
}

const PLAN: GanttTask[] = [
  { id: 'g', name: 'Phase 1', start: new Date(2026, 2, 2), end: new Date(2026, 2, 12), progress: 50 },
  { id: 'a', name: 'Kick-off', parentId: 'g', start: new Date(2026, 2, 2), end: new Date(2026, 2, 6), progress: 100 },
  {
    id: 'b',
    name: 'Build, test',
    parentId: 'g',
    start: new Date(2026, 2, 9, 9, 30),
    end: new Date(2026, 2, 11, 17, 0, 15),
    progress: 45,
    dependency: [{ taskId: 'a', type: 'FS', lag: 2 }],
    baseline: { start: new Date(2026, 2, 9), end: new Date(2026, 2, 10) },
  },
  {
    id: 'c',
    name: 'Launch',
    type: 'milestone',
    start: new Date(2026, 2, 20),
    end: new Date(2026, 2, 20),
    dependency: [{ taskId: 'b', type: 'SS' }],
  },
];

const ALL_BUILTINS = [
  'id',
  'name',
  'type',
  'status',
  'start',
  'end',
  'duration',
  'progress',
  'predecessors',
  'baselineStart',
  'baselineEnd',
  'variance',
];

const lines = (csv: string) => csv.split('\r\n');

// ─── Fields: RFC 4180 and formula neutralisation ──────────────

describe('csvField (RFC 4180)', () => {
  it.each([
    ['plain', ',', 'plain'],
    ['', ',', ''],
    ['a,b', ',', '"a,b"'],
    ['a;b', ',', 'a;b'],
    ['a;b', ';', '"a;b"'],
    ['a,b', ';', 'a,b'],
    ['a\tb', '\t', '"a\tb"'],
    ['say "hi"', ',', '"say ""hi"""'],
    ['line\nbreak', ',', '"line\nbreak"'],
    ['carriage\rreturn', ',', '"carriage\rreturn"'],
    ['crlf\r\n', ';', '"crlf\r\n"'],
  ] as const)('%j with %j → %j', (text, delimiter, expected) => {
    expect(csvField(text, delimiter, false)).toBe(expected);
  });

  it('neutralises before quoting', () => {
    expect(csvField('=HYPERLINK("x")', ',', true)).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvField('\tx', '\t', true)).toBe('"\'\tx"');
    expect(csvField('\rx', ',', true)).toBe('"\'\rx"');
    expect(csvField('+1 approve', ',', true)).toBe("'+1 approve");
    expect(csvField('=1+1', ',', false)).toBe('=1+1');
  });
});

describe('neutralizeFormula (D14)', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+3d', "'+3d"],
    ['-Scope cut', "'-Scope cut"],
    ['@Vendor sync', "'@Vendor sync"],
    ['@SUM(A1:A9)', "'@SUM(A1:A9)"],
    ['\tTab', "'\tTab"],
    ['\rReturn', "'\rReturn"],
    ['-', "'-"],
    ['+', "'+"],
    ['-3d', "'-3d"],
    ['=HYPERLINK("https://example.com","Approve")', '\'=HYPERLINK("https://example.com","Approve")'],
  ])('%j → %j', (text, expected) => {
    expect(neutralizeFormula(text)).toBe(expected);
  });

  it.each(['-3', '+3', '+2.5', '-0.25', '.5', '-.5', '10.', '1e3', '-1.5E-3', '+4e+2'])(
    'keeps the plain number %j',
    text => {
      expect(neutralizeFormula(text)).toBe(text);
    },
  );

  it.each(['', 'Kick-off', ' =1+1', ' -3', 'a=b', '3+4', '1,5', '\n=1', '%', "'=1"])(
    'leaves %j alone (no formula start)',
    text => {
      expect(neutralizeFormula(text)).toBe(text);
    },
  );
});

describe('isPlainNumber', () => {
  it.each(['0', '-3', '+3', '2.5', '.5', '10.', '1e3', '1E-3', '-1.5e+10'])('%j is a plain number', text => {
    expect(isPlainNumber(text)).toBe(true);
  });

  it.each(['', '-', '+', '.', '+3d', '1,5', '1e', 'e3', ' 3', '3 ', '0x10', 'Infinity', 'NaN', '1.2.3', '١٢', '--3'])(
    '%j is not',
    text => {
      expect(isPlainNumber(text)).toBe(false);
    },
  );
});

// ─── Values per column ────────────────────────────────────────

describe('csvCellValue', () => {
  const source = makeSource(PLAN);
  const ctx = source.columnCtx;
  const col = (key: string) => source.columns.all.find(c => c.key === key)!;
  const row = (id: string) => source.allRows.find(r => r.task.id === id)!;
  const data = (id: string) => ALL_BUILTINS.map(k => csvCellValue(col(k), row(id), ctx, 'data'));

  it('gives data values for every built-in column', () => {
    // id, name, type, status, start, end, duration, progress, predecessors, baseline start / end, variance
    expect(data('g')).toEqual([
      'g',
      'Phase 1',
      'group',
      'inProgress',
      '2026-03-02',
      '2026-03-12',
      '10',
      '50',
      '',
      '',
      '',
      '',
    ]);
    expect(data('a')).toEqual([
      'a',
      'Kick-off',
      'task',
      'done',
      '2026-03-02',
      '2026-03-06',
      '4',
      '100',
      '',
      '',
      '',
      '',
    ]);
    expect(data('b')).toEqual([
      'b',
      'Build, test',
      'task',
      'inProgress',
      '2026-03-09T09:30',
      '2026-03-11T17:00:15',
      // 2 days 7 h 30 min
      '2.31',
      '45',
      'a FS+2d',
      '2026-03-09',
      '2026-03-10',
      // ends on day 11 at 17:00 against day 10 at midnight
      '1.71',
    ]);
    expect(data('c')).toEqual([
      'c',
      'Launch',
      'milestone',
      'notStarted',
      '2026-03-20',
      '2026-03-20',
      '0',
      '0',
      'b SS',
      '',
      '',
      '',
    ]);
  });

  it('gives the cell texts with values "display"', () => {
    for (const id of ['g', 'a', 'b', 'c']) {
      expect(ALL_BUILTINS.map(k => csvCellValue(col(k), row(id), ctx, 'display'))).toEqual(
        ALL_BUILTINS.map(k => computeCellVisual(col(k), row(id), ctx).text),
      );
    }
    const b = (key: string) => csvCellValue(col(key), row('b'), ctx, 'display');
    expect([b('type'), b('status'), b('start'), b('progress'), b('predecessors')]).toEqual([
      'Task',
      'In progress',
      'Mar 9, 2026',
      '45%',
      DEFAULT_LABELS.dependency('Kick-off', 'FS', 2),
    ]);
    expect(csvCellValue(col('type'), row('c'), ctx, 'display')).toBe('Milestone');
  });

  it('reads date-only UTC values as their own day, keeps seconds and drops milliseconds', () => {
    const s = makeSource([
      { id: 'u', name: 'UTC day', start: new Date('2026-03-02'), end: new Date('2026-03-05') },
      { id: 'm', name: 'Millis', start: new Date(2026, 2, 2, 8, 5, 0, 750), end: new Date(2026, 2, 2, 8, 5, 9, 1) },
    ]);
    const at = (id: string, key: string) =>
      csvCellValue(
        s.columns.all.find(c => c.key === key)!,
        s.allRows.find(r => r.task.id === id)!,
        s.columnCtx,
        'data',
      );
    expect([at('u', 'start'), at('u', 'end'), at('u', 'duration')]).toEqual(['2026-03-02', '2026-03-05', '3']);
    expect([at('m', 'start'), at('m', 'end')]).toEqual(['2026-03-02T08:05', '2026-03-02T08:05:09']);
  });

  it('gives the stored end as the End cell shows it (inclusive end mode)', () => {
    const s = makeSource([{ id: 'i', name: 'Inclusive', start: new Date(2026, 2, 2), end: new Date(2026, 2, 6) }], {
      options: { endDateMode: 'inclusive' },
    });
    const at = (key: string) =>
      csvCellValue(
        s.columns.all.find(c => c.key === key)!,
        s.allRows[0],
        s.columnCtx,
        'data',
      );
    // The cell shows Mar 6; the drawn span is 5 days
    expect([at('end'), at('duration')]).toEqual(['2026-03-06', '5']);
  });

  it('lets exportValue win in both modes, built-in keys included', () => {
    const s = makeSource(PLAN, {
      columns: [
        { key: 'name', label: 'Name', width: 200 },
        { key: 'start', label: 'Start', width: 100, exportValue: r => `S-${r.task.id}` },
        {
          key: 'cost',
          label: 'Cost',
          width: 80,
          render: r => `€${String(Number(r.task.data?.['cost'] ?? 0))}`,
          exportValue: r => String(Number(r.task.data?.['cost'] ?? 0)),
        },
      ],
    });
    const at = (key: string, values: 'data' | 'display') =>
      csvCellValue(
        s.columns.all.find(c => c.key === key)!,
        s.allRows[1],
        s.columnCtx,
        values,
      );
    expect([at('start', 'data'), at('start', 'display')]).toEqual(['S-a', 'S-a']);
    expect([at('cost', 'data'), at('cost', 'display')]).toEqual(['0', '0']);
  });

  it('gives a custom column its render text, else the task field (dates as ISO, numbers as is)', () => {
    const tasks: GanttTask[] = [
      {
        id: 'x',
        name: 'Custom',
        start: new Date(2026, 2, 2),
        end: new Date(2026, 2, 3),
        data: { owner: 'Ada', due: new Date(2026, 3, 1, 8, 5), cost: 1200.5, tags: { a: 1 }, n: -0 },
      },
    ];
    const s = makeSource(tasks, {
      columns: [
        { key: 'owner', label: 'Owner', width: 80 },
        { key: 'due', label: 'Due', width: 80 },
        { key: 'cost', label: 'Cost', width: 80 },
        { key: 'tags', label: 'Tags', width: 80 },
        { key: 'n', label: 'N', width: 80 },
        { key: 'label', label: 'Label', width: 80, render: r => `#${r.task.id}` },
        { key: 'start', label: 'Kick', width: 80, render: () => 'own render' },
        { key: 'name', label: 'Title', width: 80 },
      ],
    });
    const at = (key: string, values: 'data' | 'display' = 'data') =>
      csvCellValue(
        s.columns.all.find(c => c.key === key)!,
        s.allRows[0],
        s.columnCtx,
        values,
      );
    expect(['owner', 'due', 'cost', 'tags', 'n', 'label', 'start', 'name'].map(k => at(k))).toEqual([
      'Ada',
      '2026-04-01T08:05',
      '1200.5',
      '{"a":1}',
      '0',
      '#x',
      // a built-in key with its own render is the consumer's column
      'own render',
      // merged over the built-in without a render: still the built-in
      'Custom',
    ]);
    // The cell reads `task[key]` only: a `data` field shows empty
    expect(at('owner', 'display')).toBe('');
    expect(at('label', 'display')).toBe('#x');
  });
});

// ─── The whole table ──────────────────────────────────────────

describe('exportChartCsv', () => {
  it('writes a header line and one CRLF line per row, every loaded task by default', () => {
    const csv = exportChartCsv(makeSource(PLAN, { collapsed: ['g'] }));
    expect(lines(csv)).toEqual([
      'Task Name,Start,End,%',
      'Phase 1,2026-03-02,2026-03-12,50',
      'Kick-off,2026-03-02,2026-03-06,100',
      '"Build, test",2026-03-09T09:30,2026-03-11T17:00:15,45',
      'Launch,2026-03-20,2026-03-20,0',
    ]);
    expect(csv.endsWith('\r\n')).toBe(false);
    expect(csv).not.toContain('\uFEFF');
    expect(csv.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('keeps the shown rows only with rows "shown"', () => {
    const csv = exportChartCsv(makeSource(PLAN, { collapsed: ['g'] }), { rows: 'shown', columns: ['id'] });
    expect(lines(csv)).toEqual(['ID', 'g', 'c']);
  });

  it('writes the cell texts with values "display"', () => {
    const csv = exportChartCsv(makeSource(PLAN), {
      values: 'display',
      columns: ['name', 'start', 'progress', 'variance'],
    });
    expect(lines(csv)).toEqual([
      'Task Name,Start,%,Variance',
      'Phase 1,"Mar 2, 2026",50%,',
      'Kick-off,"Mar 2, 2026",100%,',
      // a cell text starting with + is neutralised (only plain numbers are kept)
      `"Build, test","Mar 9, 2026",45%,'${DEFAULT_LABELS.varianceDays(1.7)}`,
      'Launch,"Mar 20, 2026",0%,',
    ]);
  });

  it('takes the columns of the view shown, all of them, or keys', () => {
    const header = (s: ChartExportSource, columns?: 'visible' | 'all' | string[]) =>
      lines(exportChartCsv(s, columns ? { columns } : {}))[0];
    const split = makeSource(PLAN);
    expect(header(split)).toBe('Task Name,Start,End,%');
    // The chart view exports the split panel's columns
    expect(header(makeSource(PLAN, { view: 'chart' }))).toBe('Task Name,Start,End,%');
    expect(header(makeSource(PLAN, { view: 'table' }))).toBe('Task Name,Type,Status,Start,End,Duration,%,Predecessors');
    expect(header(split, 'all')).toBe(
      'ID,Task Name,Type,Status,Start,End,Duration,%,Predecessors,Baseline start,Baseline end,Variance',
    );
    // In order, each once, unknown keys left out
    expect(header(split, ['progress', 'id', 'nope', 'progress', 'variance'])).toBe('%,ID,Variance');
    expect(exportChartCsv(split, { columns: [] })).toBe('');
    expect(exportChartCsv(split, { columns: ['nope'] })).toBe('');
  });

  it('finds custom columns, table-only ones included', () => {
    const s = makeSource(PLAN, {
      columns: [
        { key: 'name', label: 'Name', width: 200 },
        { key: 'owner', label: 'Owner', width: 80, tableOnly: true, render: () => 'Ada' },
      ],
    });
    expect(lines(exportChartCsv(s))[0]).toBe('Name');
    expect(lines(exportChartCsv(s, { columns: ['owner', 'name'] }))[1]).toBe('Ada,Phase 1');
    expect(lines(exportChartCsv(s, { columns: 'all' }))[0]).toBe(
      'Name,Owner,ID,Type,Status,Start,End,Duration,%,Predecessors,Baseline start,Baseline end,Variance',
    );
  });

  it('uses ; and tab delimiters, quoting only what holds them', () => {
    const tasks: GanttTask[] = [
      { id: 'a', name: 'One, two', start: new Date(2026, 2, 2), end: new Date(2026, 2, 3) },
      { id: 'b', name: 'Three; four', start: new Date(2026, 2, 3), end: new Date(2026, 2, 4) },
      { id: 'c', name: 'Five\tsix', start: new Date(2026, 2, 4), end: new Date(2026, 2, 5) },
    ];
    const s = makeSource(tasks);
    expect(lines(exportChartCsv(s, { delimiter: ';', columns: ['id', 'name'] }))).toEqual([
      'ID;Task Name',
      'a;One, two',
      'b;"Three; four"',
      'c;Five\tsix',
    ]);
    expect(lines(exportChartCsv(s, { delimiter: '\t', columns: ['id', 'name'] }))).toEqual([
      'ID\tTask Name',
      'a\tOne, two',
      'b\tThree; four',
      'c\t"Five\tsix"',
    ]);
    // An unknown delimiter from an untyped caller falls back to a comma
    const loose = { delimiter: '|' } as unknown as { delimiter: ',' };
    expect(lines(exportChartCsv(s, { ...loose, columns: ['id', 'name'] }))[1]).toBe('a,"One, two"');
  });

  it('quotes names with quotes and line breaks', () => {
    const s = makeSource([
      { id: 'q', name: 'The "big" one', start: new Date(2026, 2, 2), end: new Date(2026, 2, 3) },
      { id: 'n', name: 'Two\r\nlines', start: new Date(2026, 2, 3), end: new Date(2026, 2, 4) },
    ]);
    expect(exportChartCsv(s, { columns: ['id', 'name'] })).toBe(
      'ID,Task Name\r\nq,"The ""big"" one"\r\nn,"Two\r\nlines"',
    );
  });

  it('leaves the header out with header false', () => {
    expect(lines(exportChartCsv(makeSource(PLAN), { header: false, columns: ['id'] }))).toEqual(['g', 'a', 'b', 'c']);
  });

  it('neutralises formulas in cells and header cells, and keeps plain numbers', () => {
    const tasks: GanttTask[] = [
      { id: 'k', name: 'Kick-off', start: new Date(2026, 2, 2), end: new Date(2026, 2, 3) },
      {
        id: 'h',
        name: '=HYPERLINK("https://example.com","Approve")',
        start: new Date(2026, 2, 3),
        end: new Date(2026, 2, 4),
      },
      { id: 'p', name: '+Budget review', start: new Date(2026, 2, 4), end: new Date(2026, 2, 5) },
      { id: 'm', name: '-Scope cut', start: new Date(2026, 2, 5), end: new Date(2026, 2, 6) },
      { id: 'v', name: '@Vendor sync', start: new Date(2026, 2, 6), end: new Date(2026, 2, 7) },
      { id: 't', name: '\tTabbed', start: new Date(2026, 2, 7), end: new Date(2026, 2, 8) },
      { id: 'r', name: '\rReturned', start: new Date(2026, 2, 8), end: new Date(2026, 2, 9) },
      { id: 'n', name: '-3', start: new Date(2026, 2, 9), end: new Date(2026, 2, 10) },
      { id: 's', name: ' =1+1', start: new Date(2026, 2, 10), end: new Date(2026, 2, 11) },
    ];
    const s = makeSource(tasks, {
      columns: [
        { key: 'name', label: '=Name', width: 200 },
        { key: 'lag', label: '@Lag', width: 60, render: r => (r.task.id === 'k' ? '-2' : '+1 approve') },
      ],
    });
    expect(lines(exportChartCsv(s, { columns: ['name', 'lag'] }))).toEqual([
      "'=Name,'@Lag",
      'Kick-off,-2',
      '"\'=HYPERLINK(""https://example.com"",""Approve"")",\'+1 approve',
      "'+Budget review,'+1 approve",
      "'-Scope cut,'+1 approve",
      "'@Vendor sync,'+1 approve",
      "'\tTabbed,'+1 approve",
      '"\'\rReturned",\'+1 approve',
      "-3,'+1 approve",
      " =1+1,'+1 approve",
    ]);
    const raw = lines(exportChartCsv(s, { columns: ['name'], neutralizeFormulas: false }));
    expect(raw[0]).toBe('=Name');
    expect(raw[3]).toBe('+Budget review');
  });

  it('quotes a lone empty field, so a record is never a blank line', () => {
    const s = makeSource(PLAN, { columns: [{ key: 'empty', label: '', width: 60, render: () => '' }] });
    expect(lines(exportChartCsv(s, { columns: ['empty'] }))).toEqual(['""', '""', '""', '""', '""']);
  });

  it('writes only the header without rows', () => {
    expect(exportChartCsv(makeSource([]))).toBe('Task Name,Start,End,%');
    expect(exportChartCsv(makeSource([]), { header: false })).toBe('');
  });

  it('reads the chart’s export.csv under the call’s options', () => {
    const s = makeSource(PLAN, {
      options: { export: { csv: { delimiter: ';', values: 'display', columns: ['id', 'start'] } } },
    });
    expect(lines(exportChartCsv(s))[1]).toBe('g;Mar 2, 2026');
    expect(lines(exportChartCsv(s, { delimiter: ',', values: 'data' }))[1]).toBe('g,2026-03-02');
    expect(lines(exportChartCsv(s, { header: undefined }))[0]).toBe('ID;Start');
  });

  it('adds the byte order mark only to files', () => {
    const csv = exportChartCsv(makeSource(PLAN), { bom: true });
    expect(csv.startsWith('\uFEFF')).toBe(false);
    const file = exportFileText('csv', csv, { bom: true });
    expect(file).toBe('\uFEFF' + csv);
    expect(exportFileText('csv', csv, { bom: false })).toBe(csv);
  });

  it('is deterministic', () => {
    const s = makeSource(PLAN);
    expect(exportChartCsv(s, { columns: 'all' })).toBe(exportChartCsv(makeSource(PLAN), { columns: 'all' }));
  });
});
