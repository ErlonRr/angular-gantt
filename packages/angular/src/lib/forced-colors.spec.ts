// Forced colours (Windows High Contrast; Gantry 2 phase 9, step 5.2, D25): every component that
// paints chart chrome or SVG carries the Web Component's `@media (forced-colors: active)` rules
// (packages/vanilla/src/styles/forced-colors.css.ts) in its own styles — system colours, with
// `!important` over the inline paints, the Highlight backgrounds opting out of forcing (the text
// backplate) — and nothing outside those blocks changes (the normal look is unchanged). Every
// focus ring reads `--gantt-focus-ring`, which the chart's host sets to Highlight in this mode.
// Read from the compiled component definitions (encapsulation attributes folded back into
// `:host(…)`), then from the styles a rendered chart injects (each rule must reach its element).
// Phase 11 (plan 3d) adds the editing nodes, each rule in the component painting its node; the
// toolbar's disabled Undo / Redo GrayText (step 4.8), and `Field` / `FieldText` (the cell editor)
// join the system colours.
import { describe, it, expect } from 'vitest';
import {
  Component,
  provideZonelessChangeDetection,
  viewChild,
  ɵgetComponentDef as getComponentDef,
  type Type,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ViewMode, type GanttAnnotation, type GanttOptions, type GanttTask } from '@gantryjs/core';

import { GantryComponent } from './gantt-component/gantry.component';
import { GanttToolbarComponent } from './annotations/gantt-toolbar.component';
import { GanttTaskListComponent } from './tasklist/gantt-tasklist.component';
import { GanttCanvasComponent } from './layout/gantt-canvas.component';
import { GanttAnnotationLabelsComponent, GanttAnnotationsComponent } from './layout/gantt-annotations.component';
import { GanttHeaderComponent } from './header/gantt-header.component';
import { GanttTooltipComponent } from './tooltip/gantt-tooltip.component';
import { GanttLegendComponent } from './legend/gantt-legend.component';
import { GanttChartStateComponent } from './states/gantt-chart-state.component';
import { GanttDragReadoutComponent } from './drag/gantt-drag-readout.component';
import { GanttDragPreviewComponent } from './drag/gantt-drag-preview.component';
import { GanttTaskBarComponent } from './bars/task-bar.component';
import { GanttMilestoneComponent } from './bars/milestone.component';
import { GanttGroupBarComponent } from './bars/group-bar.component';
import { GanttBarOverlayComponent } from './bars/bar-overlay.component';
import { GanttLoadMoreComponent } from './datasource/gantt-load-more.component';
import { GanttArrowComponent } from './arrows/gantt-arrow.component';
import { GanttIconComponent } from './icons/gantt-icon.component';

const FORCED = '@media (forced-colors: active)';
const SYSTEM = /\b(Canvas|CanvasText|Highlight|HighlightText|GrayText|ButtonFace|ButtonText|Field|FieldText)\b/;

/** A selector with Angular's encapsulation attributes folded back: `[_nghost-…]` → `:host(…)`, no `[_ngcontent-…]`. */
function normalise(selector: string): string {
  return (
    selector
      .replace(/\[_ngcontent-[^\]]+\]/g, '')
      .replace(/([^\s>+~,]*)\[_nghost-[^\]]+\]/g, (_, on: string) => (on ? `:host(${on})` : ':host'))
      // The compiler namespaces what looks like a custom property (`.g-marker--today::before`), the
      // renderer drops the placeholder; it quotes attribute values or not
      .replace(/%NS%/g, '')
      .replace(/=["']([^"'\]]*)["']\]/g, '=$1]')
      .replace(/\s*>\s*/g, ' > ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

interface Rule {
  /** The selectors as written in the stylesheet */
  readonly selectors: readonly string[];
  /** Declarations by property (`--%NS%` custom property namespaces dropped) */
  readonly decls: Readonly<Record<string, string>>;
}

function rulesOf(css: string): Rule[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
    selectors: sel.split(',').map(s => s.trim()),
    decls: Object.fromEntries(
      body
        .split(';')
        .map(d => d.trim())
        .filter(Boolean)
        .map(d => [d.slice(0, d.indexOf(':')).trim().replace(/%NS%/g, ''), d.slice(d.indexOf(':') + 1).trim()]),
    ),
  }));
}

/** The CSS split into its forced-colors blocks' bodies and the rest. */
function split(css: string): { forced: string[]; rest: string } {
  const forced: string[] = [];
  let rest = css;
  for (let at = rest.indexOf(FORCED); at !== -1; at = rest.indexOf(FORCED)) {
    const open = rest.indexOf('{', at);
    let depth = 0;
    let end = open;
    for (; end < rest.length; end++) {
      if (rest[end] === '{') depth++;
      else if (rest[end] === '}' && --depth === 0) break;
    }
    forced.push(rest.slice(open + 1, end));
    rest = rest.slice(0, at) + rest.slice(end + 1);
  }
  return { forced, rest };
}

/** The compiled styles of a component (comments dropped). */
function cssOf(type: Type<unknown>): string {
  return (getComponentDef(type)?.styles ?? []).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The forced-colors rules of a component: declarations by normalised selector (later rules win). */
function forcedRules(type: Type<unknown>): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const body of split(cssOf(type)).forced) {
    for (const rule of rulesOf(body)) {
      for (const sel of rule.selectors) out[normalise(sel)] = { ...out[normalise(sel)], ...rule.decls };
    }
  }
  return out;
}

/**
 * The Web Component's forced-colors rules, as each Angular component carries them (selectors as
 * normalised from the compiled styles). Inline paints (`[style.fill]`, `[style.stroke]`,
 * `[style.background-color]`, `[style.color]`) are overridden with `!important`.
 */
const EXPECTED: readonly [string, Type<unknown>, Record<string, Record<string, string>>][] = [
  [
    'gantry (host, splitter)',
    GantryComponent,
    {
      ':host': { '--gantt-focus-ring': 'Highlight !important' },
      '.gantry-splitter-handle::before': {
        content: '""',
        position: 'absolute',
        left: '2px',
        width: '1px',
        'background-color': 'CanvasText',
      },
      '.gantry-splitter:hover > .gantry-splitter-handle::before': {
        left: '1px',
        width: '3px',
        'background-color': 'Highlight',
      },
      '.is-resizing .gantry-splitter-handle::before': { width: '3px', 'background-color': 'Highlight' },
      '.gantry-splitter-handle:focus-visible::before': { width: '3px', 'background-color': 'Highlight' },
    },
  ],
  [
    'toolbar (checked radio and menu item, pressed toggle, disabled Undo / Redo, More menu)',
    GanttToolbarComponent,
    {
      '.gantt-tb-pill[aria-checked=true]': {
        'forced-color-adjust': 'none',
        'background-color': 'Highlight',
        'border-color': 'Highlight',
        color: 'HighlightText',
      },
      '.gantt-tb-menu-item[aria-checked=true]': {
        'forced-color-adjust': 'none',
        'background-color': 'Highlight',
        'border-color': 'Highlight',
        color: 'HighlightText',
      },
      '.gantt-tb-btn[aria-pressed=true]': { color: 'Highlight', 'border-color': 'Highlight' },
      // Important: over the normal `[aria-disabled]:hover` rule (more specific), as the Web Component's
      '.gantt-tb-btn[aria-disabled=true]': { color: 'GrayText !important', 'border-color': 'GrayText !important' },
      '.gantt-tb-menu': { 'background-color': 'Canvas', color: 'CanvasText', 'border-color': 'CanvasText' },
    },
  ],
  [
    'task list',
    GanttTaskListComponent,
    {
      '.gantt-tl-row--hover': { 'background-image': 'none' },
      '.gantt-tl-row--selected': {
        'forced-color-adjust': 'none',
        'background-color': 'Highlight !important',
        'box-shadow': 'none',
        color: 'HighlightText !important',
        'border-color': 'CanvasText !important',
      },
      '.gantt-tl-row--selected *': { color: 'HighlightText !important', 'border-color': 'CanvasText !important' },
      '.gantt-tl-status-dot': { 'background-color': 'CanvasText !important' },
      '.gantt-tl-row--selected .gantt-tl-status-dot': { 'background-color': 'HighlightText !important' },
      '.gantt-tl-row--selected:focus-visible': { 'outline-color': 'HighlightText' },
      '.gantt-tl-row--selected .gantt-tl-cell:focus-visible': { 'outline-color': 'HighlightText' },
      '.gantt-tl-row--selected .gantt-collapse-btn:focus-visible': { 'outline-color': 'HighlightText' },
      '.gantt-col-resize:hover': { 'background-color': 'Highlight' },
      // Phase 11 (step 4.7): the cell editor Field / FieldText (also in the selected row), its ring
      // Highlight, an invalid value a 2 px dashed CanvasText outline, the message CanvasText on Canvas
      ':host .gantt-tl-editor:focus-visible': { 'outline-color': 'Highlight !important' },
      ':host .gantt-tl-editor': {
        'background-color': 'Field !important',
        color: 'FieldText !important',
        'border-color': 'FieldText !important',
      },
      ':host .gantt-tl-editor[aria-invalid=true]': { outline: '2px dashed CanvasText !important' },
      '.gantt-tl-editor-error': {
        'background-color': 'Canvas !important',
        color: 'CanvasText !important',
        'border-color': 'CanvasText !important',
      },
    },
  ],
  [
    'canvas (rows, bands, grid, today, link preview)',
    GanttCanvasComponent,
    {
      '.gantt-rows > rect': { fill: 'Canvas !important' },
      '.gantt-row-hover': { display: 'none' },
      '.gantt-band': { fill: 'GrayText !important', 'fill-opacity': '0.15' },
      '.gantt-band--intensive': { fill: 'Highlight !important' },
      'pattern > line': { stroke: 'GrayText !important' },
      '.gantt-grid > line': { stroke: 'GrayText !important' },
      '.gantt-today': { stroke: 'Highlight !important' },
      // Phase 11: the link being drawn Highlight, an invalid target a 2 px dashed CanvasText
      '.gantt-link-preview': { fill: 'Highlight !important', stroke: 'Highlight !important' },
      '.gantt-link-preview--invalid': {
        fill: 'CanvasText !important',
        stroke: 'CanvasText !important',
        'stroke-width': '2px',
        'stroke-dasharray': '4 2',
      },
    },
  ],
  [
    'annotations',
    GanttAnnotationsComponent,
    { rect: { fill: 'GrayText !important' }, line: { stroke: 'GrayText !important' } },
  ],
  ['annotation labels', GanttAnnotationLabelsComponent, { text: { fill: 'CanvasText !important' } }],
  [
    'header (tiers, marker lane)',
    GanttHeaderComponent,
    {
      '.g-cell--current': {
        'forced-color-adjust': 'none',
        'background-color': 'Highlight',
        'border-color': 'CanvasText !important',
        color: 'HighlightText !important',
      },
      '.g-cell--current .g-cell-label': { color: 'HighlightText !important' },
      '.g-band': { 'background-color': 'GrayText !important', opacity: '0.15' },
      '.g-band--intensive': { 'background-color': 'Highlight !important' },
      '.g-marker--today::before': { 'background-color': 'Highlight' },
      '.g-marker--annotation::before': { 'background-color': 'GrayText' },
      '.g-marker--today .g-marker-label': {
        'forced-color-adjust': 'none',
        'background-color': 'Highlight',
        color: 'HighlightText !important',
      },
      '.g-today-pointer': {
        'forced-color-adjust': 'none',
        color: 'Highlight',
        'border-color': 'transparent',
        'border-top-color': 'Highlight',
      },
    },
  ],
  [
    'tooltip',
    GanttTooltipComponent,
    {
      ':host': { 'background-color': 'Canvas', color: 'CanvasText', 'border-color': 'CanvasText' },
      '.gantt-tooltip-label': { opacity: '1' },
      '.gantt-tooltip-track': { 'background-color': 'Canvas', outline: '1px solid CanvasText' },
      '.gantt-tooltip-fill': { 'background-color': 'CanvasText !important' },
    },
  ],
  [
    'legend',
    GanttLegendComponent,
    {
      '.gantt-legend-swatch--line > line': { stroke: 'Highlight !important' },
      '.gantt-legend-swatch--dashed > line': { stroke: 'GrayText !important' },
      '.gantt-legend-swatch--bar > rect': {
        fill: 'ButtonFace !important',
        stroke: 'ButtonText !important',
        'stroke-width': '1.5px',
        'stroke-dasharray': '4 2',
      },
      '.gantt-legend-swatch--strip > rect': { fill: 'GrayText !important' },
    },
  ],
  [
    'chart states',
    GanttChartStateComponent,
    {
      '.gantt-state-box': {
        'background-color': 'Canvas',
        color: 'CanvasText',
        border: '1px solid CanvasText',
        'border-radius': '6px',
        padding: '16px 24px',
      },
      '.gantt-skeleton-row': { 'border-bottom-color': 'GrayText' },
      '.gantt-skeleton-name': { 'background-color': 'GrayText' },
      '.gantt-skeleton-bar': { 'background-color': 'GrayText' },
    },
  ],
  [
    'drag readout',
    GanttDragReadoutComponent,
    { ':host': { 'background-color': 'Canvas', color: 'CanvasText', 'border-color': 'CanvasText' } },
  ],
  [
    'drag preview',
    GanttDragPreviewComponent,
    // The ghost has no movement label since phase 10 (the drag readout chip shows the move)
    { '.gantt-drag-preview': { fill: 'Highlight !important', stroke: 'Highlight !important' } },
  ],
  [
    'bar overlay',
    GanttBarOverlayComponent,
    {
      '.gantt-bar-focus-ring': { stroke: 'Highlight' },
      '.gantt-bar-grip': { fill: 'Canvas', stroke: 'Highlight' },
      // Phase 11: the progress grip as the grips, the link connectors (target filled, invalid dashed)
      '.gantt-progress-grip': { fill: 'Canvas !important', stroke: 'Highlight !important' },
      '.gantt-link-connector': { fill: 'Canvas !important', stroke: 'Highlight !important' },
      '.gantt-link-connector--target': { fill: 'Highlight !important' },
      '.gantt-link-connector--invalid': {
        stroke: 'CanvasText !important',
        'stroke-width': '2px',
        'stroke-dasharray': '4 2',
      },
    },
  ],
  [
    'load more',
    GanttLoadMoreComponent,
    // The Web Component's footer: no spinner, the loading button GrayText (phase 10 step 7.1)
    { '.gantt-load-more-btn[aria-disabled=true]': { color: 'GrayText', 'border-color': 'GrayText' } },
  ],
  [
    'dependency arrow',
    GanttArrowComponent,
    {
      path: { stroke: 'CanvasText !important' },
      polygon: { fill: 'CanvasText !important' },
      text: { fill: 'CanvasText !important' },
      // Phase 11: the link selected for deletion
      ':host(.gantt-arrow--selected) path': { stroke: 'Highlight !important' },
      ':host(.gantt-arrow--selected) polygon': { fill: 'Highlight !important' },
    },
  ],
];

/** The built-in bars share `BUILTIN_BAR_STYLES` */
const BAR_RULES: Record<string, Record<string, string>> = {
  '.gantt-bar-body': { fill: 'ButtonFace !important', stroke: 'ButtonText !important', 'stroke-width': '1.5px' },
  '.gantt-bar-segment': { fill: 'ButtonFace !important', stroke: 'ButtonText !important', 'stroke-width': '1px' },
  '.gantt-bar-caps': { fill: 'ButtonText !important' },
  '.gantt-bar-label': { fill: 'ButtonText !important' },
  '.gantt-bar-progress': { fill: 'ButtonText !important', 'fill-opacity': '0.45' },
  '.gantt-bar-label--outside': { fill: 'CanvasText !important' },
  '.gantt-bar-baseline': { stroke: 'GrayText !important' },
  ':host(.gantt-bar--critical) .gantt-bar-body': { 'stroke-dasharray': '4 2', 'stroke-width': '2px' },
  ':host([aria-selected=true]) .gantt-bar-body': { stroke: 'Highlight !important', 'stroke-width': '2.5px' },
};
const BARS: readonly [string, Type<unknown>][] = [
  ['task bar', GanttTaskBarComponent],
  ['milestone', GanttMilestoneComponent],
  ['summary bar', GanttGroupBarComponent],
];

/** Every component with a stylesheet (the icon has no forced rule: it paints with currentColor) */
const ALL: readonly Type<unknown>[] = [
  ...EXPECTED.map(([, type]) => type),
  ...BARS.map(([, t]) => t),
  GanttIconComponent,
];

describe('forced-colors rules (D25)', () => {
  it.each(EXPECTED)('%s: the Web Component’s rules, in one forced-colors block', (_, type, expected) => {
    expect(split(cssOf(type)).forced).toHaveLength(1);
    expect(forcedRules(type)).toMatchObject(expected);
  });

  it.each(BARS)('%s: ButtonFace / ButtonText bars, the critical path dashed, the selected bar Highlight', (_, type) => {
    expect(split(cssOf(type)).forced).toHaveLength(1);
    expect(forcedRules(type)).toEqual(BAR_RULES);
  });

  it('paints only system colours in forced-colors mode', () => {
    const COLOURED =
      /^(fill|stroke|color|background(-color)?|border(-\w+)?(-color)?|outline(-color)?|--gantt-focus-ring)$/;
    const bad: string[] = [];
    for (const type of ALL) {
      for (const [sel, decls] of Object.entries(forcedRules(type))) {
        for (const [prop, value] of Object.entries(decls)) {
          if (COLOURED.test(prop) && !/^(none|transparent|\d+px)$/.test(value) && !SYSTEM.test(value)) {
            bad.push(`${type.name} ${sel} { ${prop}: ${value} }`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('changes nothing outside forced-colors mode (no system colour, no forced-color-adjust)', () => {
    for (const type of ALL) {
      const { rest } = split(cssOf(type));
      expect(rest, type.name).not.toMatch(SYSTEM);
      expect(rest, type.name).not.toContain('forced-color-adjust');
    }
  });

  it('opts out of forcing only what has a Highlight background (the Web Component’s six, the menu item included)', () => {
    const optedOut = ALL.flatMap(type =>
      Object.entries(forcedRules(type))
        .filter(([, decls]) => 'forced-color-adjust' in decls)
        .map(([sel]) => sel),
    );
    expect(optedOut.sort()).toEqual(
      [
        '.g-cell--current',
        '.g-marker--today .g-marker-label',
        '.g-today-pointer',
        '.gantt-tb-pill[aria-checked=true]',
        '.gantt-tb-menu-item[aria-checked=true]',
        '.gantt-tl-row--selected',
      ].sort(),
    );
  });

  it('Phase 11 modifiers come after their base rule (same specificity: the later rule wins)', () => {
    /** Index of the first forced rule of `type` listing `selector` (normalised). */
    const at = (type: Type<unknown>, selector: string) =>
      split(cssOf(type))
        .forced.flatMap(body => rulesOf(body))
        .findIndex(r => r.selectors.some(s => normalise(s) === selector));
    for (const [type, base, modifier] of [
      [GanttBarOverlayComponent, '.gantt-link-connector', '.gantt-link-connector--target'],
      [GanttBarOverlayComponent, '.gantt-link-connector', '.gantt-link-connector--invalid'],
      [GanttCanvasComponent, '.gantt-link-preview', '.gantt-link-preview--invalid'],
      [GanttArrowComponent, 'path', ':host(.gantt-arrow--selected) path'],
      [GanttArrowComponent, 'polygon', ':host(.gantt-arrow--selected) polygon'],
    ] as const) {
      expect(at(type, base), base).toBeGreaterThanOrEqual(0);
      expect(at(type, modifier), modifier).toBeGreaterThan(at(type, base));
    }
  });

  it('the cell editor’s rules come after the task list’s selected-row and focus-ring rules (they win in a selected row)', () => {
    const rules = split(cssOf(GanttTaskListComponent)).forced.flatMap(body => rulesOf(body));
    const at = (selector: string) => rules.findIndex(r => r.selectors.some(s => normalise(s) === selector));
    const editor = Math.min(
      ...[
        ':host .gantt-tl-editor',
        ':host .gantt-tl-editor:focus-visible',
        ':host .gantt-tl-editor[aria-invalid=true]',
      ].map(at),
    );
    expect(editor).toBeGreaterThanOrEqual(0);
    for (const before of [
      '.gantt-tl-row--selected',
      '.gantt-tl-row--selected *',
      '.gantt-tl-row--selected:focus-visible',
      '.gantt-tl-row--selected .gantt-tl-cell:focus-visible',
    ])
      expect(at(before), before).toBeLessThan(editor);
    expect(at('.gantt-tl-editor-error')).toBeGreaterThan(at('.gantt-tl-row--selected *'));
  });

  it('the icon takes its control’s (forced) text colour', () => {
    const host = rulesOf(cssOf(GanttIconComponent)).find(r => r.selectors.some(s => normalise(s) === ':host'));
    expect(host?.decls).toMatchObject({ fill: 'none', stroke: 'currentColor' });
  });
});

describe('focus rings', () => {
  it('every focus ring paints with --gantt-focus-ring, never the selection colour', () => {
    const rings: string[] = [];
    const bad: string[] = [];
    for (const type of ALL) {
      for (const rule of rulesOf(split(cssOf(type)).rest)) {
        const focus = rule.selectors.filter(s => s.includes(':focus-visible'));
        if (!focus.length) continue;
        for (const [prop, value] of Object.entries(rule.decls)) {
          if (!/^(outline(-color)?|background(-color|-image)?|border(-color)?|box-shadow)$/.test(prop)) continue;
          const name = `${type.name} ${focus.map(normalise).join(', ')} { ${prop} }`;
          rings.push(name);
          if (!value.replace(/%NS%/g, '').includes('var(--gantt-focus-ring)') || value.includes('sel-border'))
            bad.push(name);
        }
      }
    }
    // Toolbar controls, task-list rows / cells / headers / collapse toggles, the viewport, the splitter's
    // separator and toggle, the load-more footer and its buttons, Retry
    expect(rings.length).toBeGreaterThanOrEqual(8);
    expect(bad).toEqual([]);
  });

  it('the splitter toggle and the separator ring like every other control (no --gantt-sel-border on focus)', () => {
    const rules = rulesOf(split(cssOf(GantryComponent)).rest);
    const decl = (sel: string, prop: string) =>
      rules
        .filter(r => r.selectors.some(s => normalise(s) === sel))
        .at(-1)
        ?.decls[prop]?.replace(/%NS%/g, '');
    expect(decl('.gantry-splitter-toggle:focus-visible', 'outline')).toBe('2px solid var(--gantt-focus-ring)');
    expect(decl('.gantry-splitter-handle:focus-visible', 'background')).toContain('var(--gantt-focus-ring) 1px');
    // Hover and resizing keep the selection colour
    expect(decl('.gantry-splitter:hover', 'background')).toContain('var(--gantt-sel-border)');
  });
});

// ── A rendered chart: each forced rule the chart injects reaches its element ───────────────

const today = new Date();
const at = (days: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);

const TASKS: GanttTask[] = [
  { id: 'g', name: 'Group', start: at(-6), end: at(10), type: 'group' },
  { id: 'a', name: 'Alpha', start: at(-6), end: at(-1), parentId: 'g', progress: 60, status: 'done' },
  {
    id: 'b',
    name: 'Beta',
    start: at(-1),
    end: at(6),
    parentId: 'g',
    progress: 20,
    dependency: 'a',
    baseline: { start: at(-2), end: at(5) },
    status: 'inProgress',
  },
  { id: 'm', name: 'Ship', start: at(10), end: at(10), type: 'milestone', dependency: 'b' },
];
const ANNOTATIONS: GanttAnnotation[] = [
  { x1: at(3), label: { text: 'Freeze' } },
  { x1: at(7), x2: at(9), label: { text: 'Offsite' } },
];
const OPTIONS: GanttOptions = {
  viewMode: ViewMode.Week,
  criticalPath: true,
  baseline: true,
  showToday: true,
  initialScroll: false,
  panel: { columns: ['name', 'status'] },
  nonWorkingTime: { weekends: true },
};

@Component({
  imports: [GantryComponent],
  template: `<gantry
    style="height: 400px"
    [series]="tasks"
    [options]="options"
    [annotations]="annotations"
    [showLegend]="true"
  />`,
})
class Host {
  readonly tasks = TASKS;
  readonly options = OPTIONS;
  readonly annotations = ANNOTATIONS;
  readonly gantt = viewChild.required(GantryComponent);
}

@Component({
  imports: [GantryComponent],
  template: `<gantry style="height: 400px" [series]="tasks" [options]="options" />`,
})
class EditingHost {
  readonly tasks = TASKS;
  readonly options: GanttOptions = { viewMode: ViewMode.Week, initialScroll: false, editing: true };
  readonly gantt = viewChild.required(GantryComponent);
}

/** The forced-colors selectors of the document's style elements: as injected, and normalised. */
function injectedForcedSelectors(): { real: string; norm: string }[] {
  const out: { real: string; norm: string }[] = [];
  for (const style of document.querySelectorAll('style')) {
    const css = (style.textContent ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const body of split(css).forced) {
      for (const rule of rulesOf(body)) for (const real of rule.selectors) out.push({ real, norm: normalise(real) });
    }
  }
  return out;
}

describe('forced-colors rules on a rendered chart', () => {
  it('reach the canvas, the bars, the header, the task list, the toolbar, the splitter and the legend', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    f.componentInstance.gantt().setSelectedTasks(['b']);
    await f.whenStable();
    const chart = f.nativeElement as HTMLElement;

    // Normalised selectors (as in EXPECTED / BAR_RULES) that must match an element of this chart
    const REQUIRED = [
      ':host',
      '.gantry-splitter-handle::before',
      '.gantt-tb-pill[aria-checked=true]',
      '.gantt-tl-row--selected',
      '.gantt-tl-row--selected *',
      '.gantt-tl-status-dot',
      '.gantt-tl-row--selected .gantt-tl-status-dot',
      '.gantt-rows > rect',
      '.gantt-band',
      '.gantt-grid > line',
      '.gantt-today',
      'rect',
      'line',
      'path',
      'polygon',
      '.gantt-bar-body',
      '.gantt-bar-caps',
      '.gantt-bar-progress',
      '.gantt-bar-label',
      '.gantt-bar-baseline',
      ':host(.gantt-bar--critical) .gantt-bar-body',
      ':host([aria-selected=true]) .gantt-bar-body',
      '.g-cell--current',
      '.g-cell--current .g-cell-label',
      '.g-marker--today::before',
      '.g-marker--annotation::before',
      '.g-marker--today .g-marker-label',
      '.g-today-pointer',
      '.gantt-legend-swatch--line > line',
      '.gantt-legend-swatch--dashed > line',
      '.gantt-legend-swatch--bar > rect',
      '.gantt-legend-swatch--strip > rect',
    ];
    const injected = injectedForcedSelectors();
    const missing = REQUIRED.filter(norm => {
      const reals = injected
        .filter(s => s.norm === norm)
        .map(s => s.real.replace(/::before|:hover|:focus-visible/g, ''));
      return !reals.some(sel => chart.querySelector(sel) !== null);
    });
    expect(missing).toEqual([]);
  });

  it('the disabled Undo / Redo rule reaches the history group (editing on, empty history)', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(EditingHost);
    await f.whenStable();
    const chart = f.nativeElement as HTMLElement;
    const reals = injectedForcedSelectors()
      .filter(s => s.norm === '.gantt-tb-btn[aria-disabled=true]')
      .map(s => s.real);
    expect(reals.length).toBeGreaterThan(0);
    const hits = [...chart.querySelectorAll(reals.join(', '))].map(b => b.getAttribute('class'));
    expect(hits).toEqual(['gantt-tb-btn gantt-tb-undo', 'gantt-tb-btn gantt-tb-redo']);
  });

  it('the cell editor rules reach an open, invalid editor and its message (step 4.7)', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(EditingHost);
    await f.whenStable();
    const chart = f.nativeElement as HTMLElement;
    expect(f.componentInstance.gantt().editCell('b', 'progress')).toBe(true);
    await f.whenStable();
    const input = chart.querySelector<HTMLInputElement>('input.gantt-tl-editor')!;
    input.value = '150';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await f.whenStable();
    const injected = injectedForcedSelectors();
    const missing = [
      // `:host ::ng-deep`: the rules reach a consumer's custom editor node too
      ':host .gantt-tl-editor',
      ':host .gantt-tl-editor:focus-visible',
      ':host .gantt-tl-editor[aria-invalid=true]',
      '.gantt-tl-editor-error',
    ].filter(norm => {
      const reals = injected.filter(s => s.norm === norm).map(s => s.real.replace(/:focus-visible/g, ''));
      return !reals.some(sel => chart.querySelector(sel) !== null);
    });
    expect(missing).toEqual([]);
    input.blur();
  });
});
