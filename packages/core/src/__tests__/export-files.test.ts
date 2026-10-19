// ─────────────────────────────────────────────────────────────
//  Tests — Phase 12 step 2.5: what the export runs share (D8 / D15).
//  Safe file names, the extension, the `fileName` string / function
//  and a call's name, a call's options over the chart's `export.<f>`
//  (range and today filled for images), the `before-export` detail,
//  and the file text (XML declaration, byte order mark).
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  DOWNLOAD_REVOKE_MS,
  EXPORT_MIME,
  createBeforeExportDetail,
  exportFileName,
  exportFileText,
  resolveConfig,
  resolveExportCall,
  sanitizeFileName,
  type GanttOptions,
} from '../index';

describe('constants', () => {
  it('names the MIME types and the URL lifetime', () => {
    expect(EXPORT_MIME).toEqual({
      svg: 'image/svg+xml;charset=utf-8',
      png: 'image/png',
      csv: 'text/csv;charset=utf-8',
    });
    expect(Object.isFrozen(EXPORT_MIME)).toBe(true);
    expect(DOWNLOAD_REVOKE_MS).toBe(30_000);
  });
});

describe('sanitizeFileName', () => {
  it.each([
    ['plan', 'plan'],
    ['Release plan 2026', 'Release plan 2026'],
    ['Pianificazione è già', 'Pianificazione è già'],
    ['計画表', '計画表'],
    ['a/b\\c:d*e?f"g<h>i|j', 'abcdefghij'],
    ['\u0000a\u001fb\u007fc\u0085d', 'abcd'],
    ['tab\there\nnew', 'tabherenew'],
    ['plan. . ', 'plan'],
    ['plan...', 'plan'],
    ['  .hidden', 'hidden'],
    ['..', 'gantt'],
    ['', 'gantt'],
    ['   ', 'gantt'],
    ['///', 'gantt'],
    ['gantt\u202Egvs.exe', 'ganttgvs.exe'],
    ['a\u200Eb\u2066c\u2069d\uFEFF', 'abcd'],
    ['lone\uD800surrogate', 'lonesurrogate'],
    ['emoji 🙂', 'emoji 🙂'],
    ['CON', '_CON'],
    ['nul.csv', '_nul.csv'],
    ['com1', '_com1'],
    ['LPT9.tar.gz', '_LPT9.tar.gz'],
    ['console', 'console'],
    ['com10', 'com10'],
  ])('%j → %j', (name, expected) => {
    expect(sanitizeFileName(name)).toBe(expected);
  });

  it('keeps at most 120 characters, never half a surrogate pair', () => {
    expect(sanitizeFileName('a'.repeat(130))).toBe('a'.repeat(120));
    expect(sanitizeFileName(`${'a'.repeat(119)}🙂b`)).toBe(`${'a'.repeat(119)}🙂`);
    // A cut that ends in a dot or a space loses it
    expect(sanitizeFileName(`${'a'.repeat(118)} .bcd`)).toBe('a'.repeat(118));
  });

  it('falls back to gantt for a value that is not a string', () => {
    expect(sanitizeFileName(undefined as unknown as string)).toBe('gantt');
    expect(sanitizeFileName(42 as unknown as string)).toBe('gantt');
  });
});

describe('exportFileName', () => {
  const exp = (options: GanttOptions = {}) => resolveConfig(options).export;

  it('adds the extension to the default name', () => {
    expect(['svg', 'png', 'csv'].map(f => exportFileName(exp(), f as 'svg'))).toEqual([
      'gantt.svg',
      'gantt.png',
      'gantt.csv',
    ]);
  });

  it('uses the configured name, a string or a function of the format', () => {
    expect(exportFileName(exp({ export: { fileName: 'release plan' } }), 'csv')).toBe('release plan.csv');
    const byFormat = exp({ export: { fileName: f => `plan-${f}` } });
    expect(exportFileName(byFormat, 'png')).toBe('plan-png.png');
    expect(exportFileName(byFormat, 'svg')).toBe('plan-svg.svg');
  });

  it('lets a call’s name win unless it is blank', () => {
    const e = exp({ export: { fileName: 'configured' } });
    expect(exportFileName(e, 'svg', 'from the call')).toBe('from the call.svg');
    expect(exportFileName(e, 'svg', '')).toBe('configured.svg');
    expect(exportFileName(e, 'svg', '   ')).toBe('configured.svg');
    expect(exportFileName(e, 'svg', undefined)).toBe('configured.svg');
  });

  it('sanitizes, and adds the extension only when missing (any case)', () => {
    const e = exp();
    expect(exportFileName(e, 'csv', 'a/b:c')).toBe('abc.csv');
    expect(exportFileName(e, 'csv', 'plan.csv')).toBe('plan.csv');
    expect(exportFileName(e, 'csv', 'Plan.CSV')).toBe('Plan.CSV');
    expect(exportFileName(e, 'csv', 'plan.svg')).toBe('plan.svg.csv');
    expect(exportFileName(e, 'png', 'plan.png. ')).toBe('plan.png');
    expect(exportFileName(e, 'png', '.png')).toBe('png.png');
    expect(exportFileName(exp({ export: { fileName: () => '' } }), 'png')).toBe('gantt.png');
    expect(exportFileName(exp({ export: { fileName: '???' } }), 'svg')).toBe('gantt.svg');
  });
});

describe('resolveExportCall', () => {
  it('fills range and today for images, leaving legend, title and description to the model', () => {
    const cfg = resolveConfig({});
    for (const format of ['svg', 'png', 'print'] as const) {
      const r = resolveExportCall(cfg, format);
      expect(r.range).toBe('all');
      expect(r.today).toBe(true);
      expect([r.legend, r.title, r.description]).toEqual([undefined, undefined, undefined]);
    }
    expect(resolveExportCall(resolveConfig({ showToday: false }), 'svg').today).toBe(false);
    expect(resolveExportCall(resolveConfig({ showToday: false }), 'png', { today: true }).today).toBe(true);
    expect(resolveExportCall(cfg, 'print', { today: false }).today).toBe(false);
  });

  it('puts the call’s options over the chart’s export.<format>, over the defaults', () => {
    const cfg = resolveConfig({
      export: { svg: { theme: 'dark', idPrefix: 'p' }, png: { scale: 3 }, print: { paper: 'a3', range: 'visible' } },
    });
    const svg = resolveExportCall(cfg, 'svg', { theme: 'light' });
    expect([svg.theme, svg.idPrefix, svg.scale, svg.view]).toEqual(['light', 'p', 1, 'auto']);
    expect(resolveExportCall(cfg, 'svg', { theme: undefined }).theme).toBe('dark');
    // A number out of range keeps the chart's value
    expect(resolveExportCall(cfg, 'png', { scale: -1 }).scale).toBe(3);
    expect(resolveExportCall(cfg, 'png', { scale: 1.5 }).scale).toBe(1.5);
    const print = resolveExportCall(cfg, 'print', { orientation: 'portrait' });
    expect([print.paper, print.orientation, print.theme, print.range]).toEqual(['a3', 'portrait', 'light', 'visible']);
  });

  it('keeps valid dates in order and drops invalid ranges to all', () => {
    const cfg = resolveConfig({});
    const start = new Date(2026, 2, 2);
    const end = new Date(2026, 2, 20);
    const range = { start, end };
    expect(resolveExportCall(cfg, 'svg', { range }).range).toBe(range);
    expect(resolveExportCall(cfg, 'svg', { range: { start: end, end: start } }).range).toEqual(range);
    expect(resolveExportCall(cfg, 'svg', { range: { start, end: new Date(NaN) } }).range).toBe('all');
    const loose = { range: { start: '2026-03-02', end: '2026-03-20' } } as unknown as { range: 'all' };
    expect(resolveExportCall(cfg, 'svg', loose).range).toBe('all');
    expect(resolveExportCall(cfg, 'svg', { range: 'everything' as 'all' }).range).toBe('all');
  });

  it('resolves CSV options without range or today', () => {
    const cfg = resolveConfig({ export: { csv: { delimiter: ';', bom: false } } });
    expect(resolveExportCall(cfg, 'csv')).toBe(cfg.export.csv);
    const csv = resolveExportCall(cfg, 'csv', { values: 'display' });
    expect(csv).toEqual({
      columns: 'visible',
      rows: 'all',
      values: 'display',
      delimiter: ';',
      header: true,
      bom: false,
      neutralizeFormulas: true,
    });
    expect('range' in csv || 'today' in csv).toBe(false);
  });

  it('never changes the config', () => {
    const cfg = resolveConfig({ export: { svg: { theme: 'dark' } } });
    const before = { ...cfg.export.svg };
    resolveExportCall(cfg, 'svg', { theme: 'light', range: 'visible', today: false });
    expect(cfg.export.svg).toEqual(before);
  });
});

describe('createBeforeExportDetail', () => {
  it('carries the export and reads defaultPrevented live', () => {
    const d = createBeforeExportDetail('csv', 'toolbar', 'plan.csv');
    expect([d.format, d.trigger, d.fileName, d.defaultPrevented]).toEqual(['csv', 'toolbar', 'plan.csv', false]);
    d.preventDefault();
    expect(d.defaultPrevented).toBe(true);
    d.preventDefault();
    expect(d.defaultPrevented).toBe(true);
  });

  it('is frozen, and each detail is independent', () => {
    const a = createBeforeExportDetail('print', 'api', null);
    const b = createBeforeExportDetail('print', 'api', null);
    expect(Object.isFrozen(a)).toBe(true);
    expect(a.fileName).toBeNull();
    a.preventDefault();
    expect([a.defaultPrevented, b.defaultPrevented]).toEqual([true, false]);
    expect(() => {
      (a as { format: string }).format = 'svg';
    }).toThrow(TypeError);
  });
});

describe('exportFileText', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

  it('starts an SVG file with the XML declaration, once', () => {
    const file = exportFileText('svg', svg);
    expect(file).toBe(`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`);
    expect(exportFileText('svg', file)).toBe(file);
    expect(exportFileText('svg', svg, { bom: true })).toBe(file);
  });

  it('starts a CSV file with the byte order mark when asked, once', () => {
    expect(exportFileText('csv', 'a,b', { bom: true })).toBe('\uFEFFa,b');
    expect(exportFileText('csv', '\uFEFFa,b', { bom: true })).toBe('\uFEFFa,b');
    expect(exportFileText('csv', 'a,b', { bom: false })).toBe('a,b');
    expect(exportFileText('csv', 'a,b')).toBe('a,b');
    expect(exportFileText('csv', 'a,b', resolveConfig({}).export.csv)).toBe('\uFEFFa,b');
  });
});
