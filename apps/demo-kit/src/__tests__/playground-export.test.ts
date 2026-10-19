import { describe, expect, it } from 'vitest';
import { resolveConfig, type GanttBeforeExportEvent, type GanttExportEvent } from '@gantryjs/core';
import { GANTRY_EVENTS } from '@gantryjs/vanilla';
import {
  PLAYGROUND_DEFAULTS,
  PLAYGROUND_EXPORT_EVENTS,
  PLAYGROUND_SECTIONS,
  changedKeys,
  controlEnabled,
  decodeState,
  encodeState,
  exportEventText,
  playgroundCode,
  playgroundOptions,
  valueText,
  withValue,
  type PlaygroundKey,
  type PlaygroundState,
} from '../playground';
import { FRAMEWORKS } from '../site';

const TODAY = new Date(2026, 9, 14);
const SECTION = PLAYGROUND_SECTIONS.find(s => s.title === 'Export');
/** Every Export control away from its default. */
const CHANGED: PlaygroundState = {
  ...PLAYGROUND_DEFAULTS,
  toolbarExport: true,
  pngScale: 3,
  printPaper: 'letter',
  printOrientation: 'portrait',
  printFit: 'page',
  csvValues: 'display',
  csvBom: false,
};
const control = (key: PlaygroundKey) => PLAYGROUND_SECTIONS.flatMap(s => s.controls).find(c => c.key === key)!;

describe('playground: Export section', () => {
  it('comes before State, with one control per option', () => {
    const titles = PLAYGROUND_SECTIONS.map(s => s.title);
    expect(titles.indexOf('Export')).toBe(titles.indexOf('State') - 1);
    expect(SECTION?.controls.map(c => [c.key, c.kind, c.option])).toEqual([
      ['toolbarExport', 'check', 'toolbar.export'],
      ['pngScale', 'range', 'export.png.scale'],
      ['printPaper', 'select', 'export.print.paper'],
      ['printOrientation', 'segmented', 'export.print.orientation'],
      ['printFit', 'segmented', 'export.print.fit'],
      ['csvValues', 'segmented', 'export.csv.values'],
      ['csvBom', 'check', 'export.csv.bom'],
    ]);
    const scale = control('pngScale');
    expect(scale.kind === 'range' && [scale.min, scale.max, scale.unit]).toEqual([1, 4, '×']);
    const choices = (key: PlaygroundKey) => {
      const c = control(key);
      return c.kind === 'select' || c.kind === 'segmented' ? c.choices : null;
    };
    expect(choices('printPaper')).toEqual([
      ['a4', 'A4'],
      ['a3', 'A3'],
      ['letter', 'Letter'],
      ['legal', 'Legal'],
    ]);
    expect(choices('printOrientation')).toEqual([
      ['landscape', 'Landscape'],
      ['portrait', 'Portrait'],
      ['auto', 'Auto'],
    ]);
    expect(choices('printFit')).toEqual([
      ['width', 'Page width'],
      ['page', 'One page'],
      ['none', 'Actual size'],
    ]);
    expect(choices('csvValues')).toEqual([
      ['data', 'Data'],
      ['display', 'As shown'],
    ]);
    // Every control applies, the menu on or off (the methods use the same defaults)
    for (const c of SECTION?.controls ?? []) expect(controlEnabled(c, PLAYGROUND_DEFAULTS), c.key).toBe(true);
  });

  it('shows the scale as a factor', () => {
    expect(valueText(2, '×')).toBe('2×');
    expect(valueText(36, 'px')).toBe('36 px');
    expect(valueText(60, '%')).toBe('60%');
  });

  it('starts from the core defaults', () => {
    const core = resolveConfig({});
    expect(PLAYGROUND_DEFAULTS.toolbarExport).toBe(core.toolbar === false ? null : core.toolbar.export);
    expect(PLAYGROUND_DEFAULTS.pngScale).toBe(core.export.png.scale);
    expect(PLAYGROUND_DEFAULTS.printPaper).toBe(core.export.print.paper);
    expect(PLAYGROUND_DEFAULTS.printOrientation).toBe(core.export.print.orientation);
    expect(PLAYGROUND_DEFAULTS.printFit).toBe(core.export.print.fit);
    expect(PLAYGROUND_DEFAULTS.csvValues).toBe(core.export.csv.values);
    expect(PLAYGROUND_DEFAULTS.csvBom).toBe(core.export.csv.bom);
    // Every default fits its control
    for (const c of SECTION?.controls ?? []) {
      expect(withValue(CHANGED, c.key, PLAYGROUND_DEFAULTS[c.key])[c.key], c.key).toBe(PLAYGROUND_DEFAULTS[c.key]);
    }
    // At the defaults the chart resolves the same export settings as with no options
    const resolved = resolveConfig(playgroundOptions(PLAYGROUND_DEFAULTS, TODAY));
    expect(resolved.export).toEqual({ ...core.export, fileName: resolved.export.fileName });
    expect(resolved.export.fileName('svg')).toBe(core.export.fileName('svg'));
    expect(resolved.toolbar === false ? null : resolved.toolbar.export).toBe(false);
  });

  it('maps every control to the option the chart resolves', () => {
    const o = playgroundOptions(CHANGED, TODAY);
    expect(o.export).toEqual({
      png: { scale: 3 },
      print: { paper: 'letter', orientation: 'portrait', fit: 'page' },
      csv: { values: 'display', bom: false },
    });
    const c = resolveConfig(o);
    expect(c.toolbar === false ? null : c.toolbar.export).toBe(true);
    expect(c.export.png).toMatchObject({ scale: 3, maxSide: 16_384, maxPixels: 16_777_216 });
    expect(c.export.print).toMatchObject({
      paper: 'letter',
      orientation: 'portrait',
      fit: 'page',
      theme: 'light',
      margin: 10,
      repeatTable: true,
    });
    expect(c.export.csv).toMatchObject({ values: 'display', bom: false, delimiter: ',', header: true });
    // The other toolbar controls and formats keep their defaults
    expect(c.toolbar).toMatchObject({ zoom: true, today: true, viewToggle: true, fit: true });
    expect(c.export.formats).toEqual(['svg', 'png', 'csv', 'print']);
    expect(c.export.svg).toEqual(resolveConfig({}).export.svg);
  });

  it('round-trips through a link and drops invalid values', () => {
    expect(changedKeys(CHANGED)).toEqual([
      'toolbarExport',
      'pngScale',
      'printPaper',
      'printOrientation',
      'printFit',
      'csvValues',
      'csvBom',
    ]);
    expect(decodeState(encodeState(CHANGED))).toEqual(CHANGED);
    const forged = btoa(
      JSON.stringify({
        toolbarExport: 'yes',
        pngScale: 8,
        printPaper: 'tabloid',
        printOrientation: 'sideways',
        printFit: 'height',
        csvValues: 'raw',
        csvBom: 1,
      }),
    );
    expect(decodeState(forged)).toEqual(PLAYGROUND_DEFAULTS);
    expect(decodeState(btoa(JSON.stringify({ pngScale: 0.5 }))).pngScale).toBe(2);
  });

  it('prints only the changed keys, in every framework', () => {
    for (const { id } of FRAMEWORKS) {
      const plain = playgroundCode(PLAYGROUND_DEFAULTS, id, TODAY);
      for (const word of ['export', 'png', 'print', 'csv', 'toolbar']) {
        expect(plain, `${id} ${word}`).not.toMatch(new RegExp(`\\b${word}:`));
      }
      const code = playgroundCode(CHANGED, id, TODAY);
      expect(code, id).toContain('toolbar: { export: true }');
      expect(code, id).toContain('png: { scale: 3 }');
      expect(code, id).toContain("print: { paper: 'letter', orientation: 'portrait', fit: 'page' }");
      expect(code, id).toContain("csv: { values: 'display', bom: false }");
      expect(code, id).not.toContain('undefined');
      // One changed key prints alone: no empty format objects around it
      const one = playgroundCode({ ...PLAYGROUND_DEFAULTS, printFit: 'none' }, id, TODAY);
      expect(one, id).toContain("export: { print: { fit: 'none' } }");
      expect(one, id).not.toMatch(/\b(png|csv|toolbar):/);
    }
  });
});

describe('playground: export events', () => {
  const before = (over: Partial<GanttBeforeExportEvent>): GanttBeforeExportEvent => ({
    format: 'svg',
    trigger: 'toolbar',
    fileName: 'gantt.svg',
    defaultPrevented: false,
    preventDefault: () => undefined,
    ...over,
  });
  const done = (over: Partial<GanttExportEvent>): GanttExportEvent => ({
    format: 'svg',
    trigger: 'toolbar',
    fileName: 'gantt.svg',
    size: 24_600,
    pages: null,
    ...over,
  });

  it('lists the 2 export events of the Web Component, in the order they fire', () => {
    expect(PLAYGROUND_EXPORT_EVENTS).toEqual(['before-export', 'export']);
    for (const event of PLAYGROUND_EXPORT_EVENTS) expect(Object.keys(GANTRY_EVENTS), event).toContain(event);
  });

  it('words a download and a print', () => {
    expect(exportEventText('before-export', before({}))).toBe('toolbar · svg · gantt.svg');
    expect(exportEventText('before-export', before({ format: 'print', trigger: 'api', fileName: null }))).toBe(
      'api · print',
    );
    expect(exportEventText('export', done({}))).toBe('toolbar · gantt.svg · 24.6 KB');
    expect(exportEventText('export', done({ format: 'csv', fileName: 'plan.csv', size: 980 }))).toBe(
      'toolbar · plan.csv · 980 B',
    );
    expect(exportEventText('export', done({ format: 'png', fileName: 'gantt.png', size: 1_234_567 }))).toBe(
      'toolbar · gantt.png · 1.2 MB',
    );
    // Never "1000.0 KB"
    expect(exportEventText('export', done({ size: 999_960 }))).toBe('toolbar · gantt.svg · 1.0 MB');
    const print = done({ format: 'print', trigger: 'api', fileName: null, size: null, pages: 3 });
    expect(exportEventText('export', print)).toBe('api · print · 3 pages');
    expect(exportEventText('export', { ...print, pages: 1 })).toBe('api · print · 1 page');
  });
});
