// Forced colours (Windows High Contrast; Gantry 2 phase 9, step 5.2, D25): every component that
// paints chart chrome or SVG carries the Web Component's `@media (forced-colors: active)` rules
// (packages/vanilla/src/styles/forced-colors.css.ts) in its own styles — system colours, with
// `!important` over the inline paints, the Highlight backgrounds opting out of forcing (the text
// backplate) — and nothing outside those blocks changes (the normal look is unchanged). Every
// focus ring reads `--gantt-focus-ring`, which the chart's host sets to Highlight in this mode.
// Read from the compiled component definitions (encapsulation attributes folded back into
// `:host(…)`), then from the styles a rendered chart injects (each rule must reach its element).
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
const SYSTEM = /\b(Canvas|CanvasText|Highlight|HighlightText|GrayText|ButtonFace|ButtonText)\b/;

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
    'toolbar',
    GanttToolbarComponent,
    {
      '.gantt-tb-pill[aria-checked=true]': {
        'forced-color-adjust': 'none',
        'background-color': 'Highlight',
        'border-color': 'Highlight',
        color: 'HighlightText',
      },
    },
  ],
  [
    'task list',
    GanttTaskListComponent,
    {
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
    },
  ],
  [
    'canvas (rows, bands, grid, today)',
    GanttCanvasComponent,
    {
      '.gantt-rows > rect': { fill: 'Canvas !important' },
      '.gantt-band': { fill: 'GrayText !important', 'fill-opacity': '0.15' },
      '.gantt-band--intensive': { fill: 'Highlight !important' },
      'pattern > line': { stroke: 'GrayText !important' },
      '.gantt-grid > line': { stroke: 'GrayText !important' },
      '.gantt-today': { stroke: 'Highlight !important' },
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
    {
      '.gantt-drag-preview': { fill: 'Highlight !important', stroke: 'Highlight !important' },
      '.gantt-drag-preview-label': { fill: 'CanvasText !important' },
    },
  ],
  [
    'bar overlay',
    GanttBarOverlayComponent,
    {
      '.gantt-bar-focus-ring': { stroke: 'Highlight' },
      '.gantt-bar-grip': { fill: 'Canvas', stroke: 'Highlight' },
    },
  ],
  [
    'load more',
    GanttLoadMoreComponent,
    { '.gantt-spinner': { 'border-color': 'GrayText', 'border-top-color': 'Highlight' } },
  ],
  [
    'dependency arrow',
    GanttArrowComponent,
    {
      path: { stroke: 'CanvasText !important' },
      polygon: { fill: 'CanvasText !important' },
      text: { fill: 'CanvasText !important' },
    },
  ],
];

/** The built-in bars share `BUILTIN_BAR_STYLES` */
const BAR_RULES: Record<string, Record<string, string>> = {
  '.gantt-bar-body': { fill: 'ButtonFace !important', stroke: 'ButtonText !important', 'stroke-width': '1.5px' },
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
});
