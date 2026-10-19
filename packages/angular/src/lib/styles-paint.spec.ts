// Task styles in the Angular painters (Gantry 2 phase 10, step 4.7, D9/D10, §3c of its plan; the Web
// Component's styles-paint.test.ts): a built-in bar's classes come from the visual
// (`visual.className`: `options.styles`, `task.style.className`, the deprecated `task.className`);
// a collapsed rolled-up parent paints its children as `rect.gantt-bar-segment` right after the
// body (attached only while the visual has segments); the row backgrounds of both panes are core
// `rowPaint` with the row's resolved style, and the task-list icon takes the style's colour.
// (A custom bar's style classes are the bar outlet's: scaffold-p10.spec.ts.)
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Component,
  provideZonelessChangeDetection,
  signal,
  viewChild,
  ɵgetComponentDef as getComponentDef,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  PAINTS,
  ViewMode,
  rowPaint,
  type BarVisual,
  type GanttBarContext,
  type GanttFlatRow,
  type GanttOptions,
  type GanttTask,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttGroupBarComponent } from './bars/group-bar.component';
import { GanttTaskBarComponent } from './bars/task-bar.component';
import { GanttLayoutService } from './layout/gantt-layout.service';

const day = (d: number) => new Date(2026, 2, d);

/** A parent with two children, a root task and a milestone (March 2026). */
function tree(): GanttTask[] {
  return [
    { id: 'p', name: 'Parent', start: day(2), end: day(23), progress: 40 },
    { id: 'a', name: 'A', start: day(2), end: day(9), parentId: 'p', progress: 0 },
    { id: 'b', name: 'B', start: day(12), end: day(23), parentId: 'p', progress: 100 },
    { id: 'r', name: 'Root', start: day(3), end: day(6), progress: 10 },
    { id: 'm', name: 'Launch', type: 'milestone', start: day(24), end: day(24) },
  ];
}

const BASE: GanttOptions = { viewMode: ViewMode.Day, initialScroll: false };

@Component({
  imports: [GantryComponent],
  template: `<gantry style="height: 400px" [series]="tasks()" [options]="options()" />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(tree());
  readonly options = signal<GanttOptions>(BASE);
  readonly gantt = viewChild.required(GantryComponent);
}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  gantt: GantryComponent;
  layout: GanttLayoutService;
  set(change: () => void): Promise<void>;
}

async function mount(tasks: GanttTask[] = tree(), options: GanttOptions = BASE): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  f.componentInstance.tasks.set(tasks);
  f.componentInstance.options.set(options);
  await f.whenStable();
  const debug = f.debugElement.query(By.directive(GantryComponent));
  return {
    f,
    h: f.componentInstance,
    gantt: f.componentInstance.gantt(),
    layout: debug.injector.get(GanttLayoutService),
    async set(change) {
      change();
      await f.whenStable();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

const root = (c: Chart) => c.f.nativeElement as HTMLElement;
const bar = (c: Chart, id: string) => root(c).querySelector<SVGGElement>(`.gantt-bars-layer > [data-task-id="${id}"]`)!;
const tlRow = (c: Chart, id: string) => root(c).querySelector<HTMLElement>(`.gantt-tl-row[data-task-id="${id}"]`)!;
const icon = (c: Chart, id: string) => tlRow(c, id).querySelector<HTMLElement>('.gantt-tl-icon')!;
const rowOf = (c: Chart, id: string): GanttFlatRow => c.layout.visibleRows().find(r => r.task.id === id)!;
/** The timeline row background of `id` (rows tracked by task id, in mounted order) */
const rowRect = (c: Chart, id: string) =>
  [...root(c).querySelectorAll<SVGRectElement>('.gantt-rows > rect')][
    c.layout.mountedGeometries().findIndex(g => g.row.task.id === id)
  ];
const parts = (g: Element) => [...g.children].map(el => el.getAttribute('class'));
/** An inline colour as the DOM reports it, for comparison with `#RRGGBB` / `var(...)` inputs */
const same = (value: string, expected: string) => {
  const probe = document.createElement('div');
  probe.style.setProperty('color', expected);
  return value === expected || value === probe.style.getPropertyValue('color');
};

describe('task styles in the Angular painters', () => {
  describe('bar classes', () => {
    it('take the visual className: every layer once (styles, task.style, the deprecated task.className)', async () => {
      const c = await mount(
        tree().map(t => (t.id === 'a' ? { ...t, className: 'legacy', style: { className: 'own shared' } } : t)),
        {
          ...BASE,
          styles: {
            task: { className: 'kind' },
            parent: { className: 'is-parent' },
            levels: [null, { className: 'shared' }],
          },
        },
      );
      const v = c.gantt.getBarVisual('a')!;
      expect(v.className).not.toBeNull();
      expect(bar(c, 'a').getAttribute('class')).toBe(`gantt-bar gantt-bar--task ${v.className} gantt-bar-draggable`);
      const classes = [...bar(c, 'a').classList];
      for (const cls of ['kind', 'shared', 'legacy', 'own']) expect(classes.filter(x => x === cls)).toHaveLength(1);
      expect(bar(c, 'p').classList.contains('is-parent')).toBe(true);
      expect(bar(c, 'r').classList.contains('is-parent')).toBe(false);

      // Styles gone: the classes go with them
      await c.set(() => c.h.options.set(BASE));
      expect(bar(c, 'p').classList.contains('is-parent')).toBe(false);
      expect(bar(c, 'r').getAttribute('class')).toBe('gantt-bar gantt-bar--task gantt-bar-draggable');
    });

    it('a task.className alone still reaches the bar (through the visual, not the task)', async () => {
      const c = await mount(tree().map(t => (t.id === 'r' ? { ...t, className: 'legacy' } : t)));
      expect(c.gantt.getBarVisual('r')!.className).toBe('legacy');
      expect(bar(c, 'r').getAttribute('class')).toBe('gantt-bar gantt-bar--task legacy gantt-bar-draggable');
    });

    it('a class of the visual reaches the bar even when the task has none (the visual is the only source)', async () => {
      const c = await mount(tree(), {
        ...BASE,
        styles: { rule: row => (row.task.id === 'r' ? { className: 'ruled' } : null) },
      });
      expect(rowOf(c, 'r').task.className).toBeUndefined();
      expect(bar(c, 'r').getAttribute('class')).toBe('gantt-bar gantt-bar--task ruled gantt-bar-draggable');
    });
  });

  describe('rolled-up segments', () => {
    const SEGMENTS: GanttOptions = { ...BASE, rollup: { segments: true }, groupBar: { collapsed: true } };

    it('paints rect.gantt-bar-segment after the body: x / width from the segment, the bar y / height / rx, the fill', async () => {
      const c = await mount(
        tree().map(t => (t.id === 'b' ? { ...t, style: { color: '#AA0000' } } : t)),
        SEGMENTS,
      );
      const v = c.gantt.getBarVisual('p')!;
      expect(v.segments).toHaveLength(2);
      const g = bar(c, 'p');
      const segs = [...g.querySelectorAll<SVGRectElement>(':scope > rect.gantt-bar-segment')];
      expect(segs).toHaveLength(2);
      // Right after the body, before the other parts
      expect(parts(g).slice(0, 3)).toEqual(['gantt-bar-body', 'gantt-bar-segment', 'gantt-bar-segment']);
      v.segments!.forEach((seg, i) => {
        const r = segs[i];
        expect(Number(r.getAttribute('x'))).toBe(seg.x);
        expect(Number(r.getAttribute('width'))).toBe(seg.width);
        expect(Number(r.getAttribute('y'))).toBe(v.y);
        expect(Number(r.getAttribute('height'))).toBe(v.height);
        expect(Number(r.getAttribute('rx'))).toBe(v.rx);
        expect(same(r.style.getPropertyValue('fill'), seg.paint)).toBe(true);
        expect(r.getAttribute('pointer-events')).toBe('none');
        // Colours go through the style, never presentation attributes
        expect(r.hasAttribute('fill')).toBe(false);
      });
      expect(same(segs[1].style.getPropertyValue('fill'), '#AA0000')).toBe(true);

      // Expanded: no segments, and no node left behind
      await c.set(() => c.gantt.expandAll());
      expect(c.gantt.getBarVisual('p')!.segments).toBeNull();
      expect(bar(c, 'p').querySelector('.gantt-bar-segment')).toBeNull();
      // Collapsed again: back
      await c.set(() => c.gantt.collapseAll());
      expect(bar(c, 'p').querySelectorAll('.gantt-bar-segment')).toHaveLength(2);
    });

    it('attaches no segment without rollup.segments, nor on milestones or expanded parents', async () => {
      const c = await mount(tree(), { ...BASE, rollup: true, groupBar: { collapsed: true } });
      expect(root(c).querySelector('.gantt-bar-segment')).toBeNull();
      await c.set(() => c.h.options.set({ ...SEGMENTS }));
      expect(root(c).querySelectorAll('.gantt-bar-segment').length).toBeGreaterThan(0);
      expect(bar(c, 'm').querySelector('.gantt-bar-segment')).toBeNull();
      expect(bar(c, 'r').querySelector('.gantt-bar-segment')).toBeNull();
    });

    it('keeps the segments in order right after the body as their count changes', async () => {
      const visual = (over: Partial<BarVisual> = {}): BarVisual => ({
        kind: 'group',
        x: 10,
        y: 5,
        width: 100,
        height: 20,
        cy: 15,
        rx: 2,
        path: 'M10,5H110V25H10Z',
        tone: 'default',
        paint: { body: 'var(--gantt-group)', progress: 'var(--gantt-progress)', label: 'var(--gantt-text)' },
        progress: { path: 'M10,5H60V25H10Z', opacity: 0.35 },
        label: { text: 'Build', x: 120, y: 15, anchor: 'start', inside: false },
        baseline: null,
        caps: 'M0,0',
        handles: null,
        progressGrip: null,
        connectors: null,
        focusRect: { x: 7, y: 2, width: 106, height: 26, rx: 5 },
        hitBox: { x: 10, y: 5, width: 100, height: 20 },
        className: null,
        segments: null,
        ...over,
      });
      // The fields a built-in bar reads (the outlet's attributes are not under test here)
      const row = { task: { id: 'p' }, barType: 'group' };
      const ctxOf = (v: BarVisual) =>
        ({
          row,
          visual: v,
          isCritical: false,
          isSelected: false,
          draggable: false,
          theme: {},
        }) as unknown as GanttBarContext;

      @Component({
        imports: [GanttGroupBarComponent],
        template: `<svg><g ganttGroupBar [ctx]="ctx()"></g></svg>`,
      })
      class BarHost {
        readonly ctx = signal(ctxOf(visual()));
      }

      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      const f = TestBed.createComponent(BarHost);
      await f.whenStable();
      const g = (f.nativeElement as HTMLElement).querySelector('g')!;
      const set = async (v: BarVisual) => {
        f.componentInstance.ctx.set(ctxOf(v));
        await f.whenStable();
      };
      const seg = (x: number, paint: string) => ({ x, width: 10, paint });
      const LABEL = 'gantt-bar-label gantt-bar-label--outside';
      expect(g.getAttribute('class')).toBe('gantt-bar gantt-bar--group');
      expect(parts(g)).toEqual(['gantt-bar-body', 'gantt-bar-caps', 'gantt-bar-progress', LABEL]);

      await set(visual({ segments: [seg(10, '#111111'), seg(30, '#222222')], className: 'styled' }));
      expect(g.getAttribute('class')).toBe('gantt-bar gantt-bar--group styled');
      expect(parts(g)).toEqual([
        'gantt-bar-body',
        'gantt-bar-segment',
        'gantt-bar-segment',
        'gantt-bar-caps',
        'gantt-bar-progress',
        LABEL,
      ]);
      const first = g.children[1];

      await set(visual({ segments: [seg(12, '#333333'), seg(30, '#222222'), seg(60, '#444444')] }));
      expect(parts(g).filter(cls => cls === 'gantt-bar-segment')).toHaveLength(3);
      expect(g.children[1]).toBe(first);
      expect(first.getAttribute('x')).toBe('12');
      expect(same((g.children[3] as SVGRectElement).style.getPropertyValue('fill'), '#444444')).toBe(true);
      expect(g.children[4].getAttribute('class')).toBe('gantt-bar-caps');

      await set(visual({ segments: [seg(12, '#333333')] }));
      expect(parts(g)).toEqual(['gantt-bar-body', 'gantt-bar-segment', 'gantt-bar-caps', 'gantt-bar-progress', LABEL]);
      await set(visual());
      expect(g.querySelector('.gantt-bar-segment')).toBeNull();
    });

    it('has a forced-colors rule in every built-in bar (each child outlined in system colours)', () => {
      for (const type of [GanttTaskBarComponent, GanttGroupBarComponent]) {
        const css = (getComponentDef(type)?.styles ?? []).join('\n').replace(/\[_ng(content|host)-[^\]]+\]/g, '');
        const forced = css.slice(css.indexOf('@media (forced-colors: active)'));
        expect(forced.replace(/\s+/g, '')).toContain(
          '.gantt-bar-segment{fill:ButtonFace!important;stroke:ButtonText!important;stroke-width:1px;}',
        );
      }
    });
  });

  describe('row backgrounds and the task-list icon', () => {
    it('paint rowPaint with the resolved style in both panes: selection > rowColor > zebra', async () => {
      const c = await mount(
        tree().map(t => (t.id === 'r' ? { ...t, style: { rowColor: '#FFF7ED' } } : t)),
        { ...BASE, styles: { parent: { rowColor: '#ECFEFF' }, levels: [null, { rowColor: '#F0FDF4' }] } },
      );
      const styleOf = c.layout.rowStyle();
      for (const [id, expected] of [
        ['p', '#ECFEFF'],
        ['a', '#F0FDF4'],
        ['r', '#FFF7ED'],
      ] as const) {
        expect(rowPaint({ row: rowOf(c, id) }, false, styleOf(rowOf(c, id)))).toBe(expected);
        expect(same(rowRect(c, id).style.getPropertyValue('fill'), expected)).toBe(true);
        expect(same(tlRow(c, id).style.getPropertyValue('background-color'), expected)).toBe(true);
      }
      // The milestone has no row colour: the zebra
      const zebra = rowOf(c, 'm').visibleIndex % 2 === 0 ? PAINTS.rowBg : PAINTS.rowBgAlt;
      expect(same(rowRect(c, 'm').style.getPropertyValue('fill'), zebra)).toBe(true);
      expect(same(tlRow(c, 'm').style.getPropertyValue('background-color'), zebra)).toBe(true);

      // Selection wins over the row colour
      await c.set(() => c.gantt.setSelectedTasks(['p']));
      expect(same(rowRect(c, 'p').style.getPropertyValue('fill'), PAINTS.rowSelected)).toBe(true);
      expect(same(tlRow(c, 'p').style.getPropertyValue('background-color'), PAINTS.rowSelected)).toBe(true);

      // Styles changed without new tasks: both panes follow
      await c.set(() => c.h.options.set(BASE));
      expect(same(rowRect(c, 'a').style.getPropertyValue('fill'), '#F0FDF4')).toBe(false);
      expect(same(tlRow(c, 'a').style.getPropertyValue('background-color'), '#F0FDF4')).toBe(false);
      expect(same(tlRow(c, 'r').style.getPropertyValue('background-color'), '#FFF7ED')).toBe(true);
    });

    it('colours the icon with the style colour (styles, task.style, the deprecated barColor), else the stylesheet', async () => {
      const c = await mount(
        tree().map(t =>
          t.id === 'r' ? { ...t, barColor: '#1E3A8A' } : t.id === 'b' ? { ...t, style: { color: '#AA0000' } } : t,
        ),
        { ...BASE, styles: { parent: { color: '#0F766E' } } },
      );
      expect(same(icon(c, 'p').style.getPropertyValue('color'), '#0F766E')).toBe(true);
      expect(same(icon(c, 'b').style.getPropertyValue('color'), '#AA0000')).toBe(true);
      expect(same(icon(c, 'r').style.getPropertyValue('color'), '#1E3A8A')).toBe(true);
      expect(icon(c, 'a').style.getPropertyValue('color')).toBe('');

      // A new style without new tasks: the icon follows, the cells are not rendered again
      const name = tlRow(c, 'p').querySelector('.gantt-tl-ellipsis')!;
      await c.set(() => c.h.options.set({ ...BASE, styles: { parent: { color: '#7C3AED' } } }));
      expect(same(icon(c, 'p').style.getPropertyValue('color'), '#7C3AED')).toBe(true);
      expect(tlRow(c, 'p').querySelector('.gantt-tl-ellipsis')).toBe(name);
      await c.set(() => c.h.options.set(BASE));
      expect(icon(c, 'p').style.getPropertyValue('color')).toBe('');
    });

    it('a rolled-up status colour reaches the bar and the icon alike', async () => {
      const c = await mount(tree(), { ...BASE, rollup: { color: 'status' } });
      const style = c.layout.rowStyle()(rowOf(c, 'p'));
      expect(style.color).toBeTruthy();
      expect(same(icon(c, 'p').style.getPropertyValue('color'), style.color!)).toBe(true);
      expect(c.gantt.getBarVisual('p')!.paint.body).toBe(style.color);
    });
  });
});
