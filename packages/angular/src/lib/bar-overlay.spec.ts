// The bar overlay (Gantry 2 phase 9, step 4.5, D4), the Web Component's `bar-overlay.test.ts` in
// Angular: one `g.gantt-bar-overlay` per chart between the bars and the annotation labels, attached
// only while it shows something, holding the focus ring of the bar focused from the keyboard (core
// `BarVisual.focusRect`) and the resize grips (`handles.*.grip`) of that bar, of the hovered bar and,
// on coarse pointers, of the selected bars. Keyboard vs pointer focus is tracked from the last input
// on the document (`layout.focusVisibleBarId`). Built-in bars carry the Web Component's classes
// (`gantt-bar gantt-bar--<kind>`, `gantt-bar--critical` on the critical path, D25).
import { afterEach, describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TaskType, ViewMode, type GanttOptions, type GanttTask, type Rect } from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttLayoutService } from './layout/gantt-layout.service';

const day = (d: number) => new Date(2026, 2, d);
const tasks = (): GanttTask[] => [
  { id: 'a', name: 'Alpha', start: day(2), end: day(9), progress: 20, className: 'mine' },
  { id: 'b', name: 'Beta', start: day(9), end: day(16), progress: 50, dependency: 'a' },
  { id: 'm', name: 'Launch', type: TaskType.Milestone, start: day(18), end: day(18), dependency: 'b' },
  { id: 'c', name: 'Side', start: day(3), end: day(5) },
];

@Component({
  imports: [GantryComponent],
  template: `<gantry style="height: 400px" [series]="tasks" [options]="options()" [enableResize]="resize()" />`,
})
class Host {
  readonly tasks = tasks();
  readonly options = signal<GanttOptions>({ viewMode: ViewMode.Day, initialScroll: false });
  readonly resize = signal(true);
  readonly gantt = viewChild.required(GantryComponent);
}

interface Chart {
  f: ComponentFixture<Host>;
  gantt: GantryComponent;
  layout: GanttLayoutService;
  host: HTMLElement;
  set(change: () => void): Promise<void>;
}

async function mount(setup?: (h: Host) => void): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  setup?.(f.componentInstance);
  await f.whenStable();
  const debug = f.debugElement.query(By.directive(GantryComponent));
  return {
    f,
    gantt: f.componentInstance.gantt(),
    layout: debug.injector.get(GanttLayoutService),
    host: debug.nativeElement as HTMLElement,
    async set(change) {
      change();
      await f.whenStable();
    },
  };
}

const bar = (c: Chart, id: string) => c.host.querySelector<SVGGElement>(`.gantt-bars-layer > [data-task-id="${id}"]`)!;
const overlay = (c: Chart) => c.host.querySelector<SVGGElement>('.gantt-bar-overlay');
const shapes = (c: Chart) => [...(overlay(c)?.children ?? [])].map(el => el.getAttribute('class'));
const box = (n: Element | undefined) => n && ['x', 'y', 'width', 'height', 'rx'].map(a => Number(n.getAttribute(a)));
const rect = (r: Rect & { rx: number }) => [r.x, r.y, r.width, r.height, r.rx];

/** A key on the page (not one the chart uses), as a keyboard user would press one. */
const anyKey = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true, composed: true }));
const pointerDown = (target: EventTarget) =>
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, pointerType: 'mouse' }));

/** Every rule of the document's stylesheets whose selector mentions `part`. */
const rulesWith = (part: string) =>
  [...document.styleSheets].flatMap(sheet =>
    [...sheet.cssRules].filter((r): r is CSSStyleRule => r instanceof CSSStyleRule && r.selectorText.includes(part)),
  );

afterEach(() => vi.restoreAllMocks());

describe('<gantry> bar overlay', () => {
  it('is detached until it shows something, then sits between the bars and the annotation labels', async () => {
    const c = await mount();
    expect(overlay(c)).toBeNull();
    anyKey();
    await c.set(() => bar(c, 'a').focus());
    const svg = c.host.querySelector('gantt-canvas svg')!;
    const order = [...svg.children].map(el => el.getAttribute('class')?.split(' ')[0]);
    expect(order.indexOf('gantt-bar-overlay')).toBe(order.indexOf('gantt-bars-layer') + 1);
    expect(order[order.indexOf('gantt-bar-overlay') + 1]).toBe('gantt-annotation-labels');
    expect(overlay(c)!.getAttribute('aria-hidden')).toBe('true');
    expect(overlay(c)!.getAttribute('pointer-events')).toBe('none');

    await c.set(() => bar(c, 'a').blur());
    expect(overlay(c)).toBeNull();
  });

  it('shows the focus ring (focusRect) and the grips (handles) of the bar focused from the keyboard', async () => {
    const c = await mount();
    anyKey();
    await c.set(() => bar(c, 'b').focus());
    expect(c.layout.focusVisibleBarId()).toBe('b');
    expect(shapes(c)).toEqual(['gantt-bar-focus-ring', 'gantt-bar-grip', 'gantt-bar-grip']);
    const v = c.gantt.getBarVisual('b')!;
    const [ring, left, right] = overlay(c)!.children;
    expect(box(ring)).toEqual(rect(v.focusRect));
    expect(box(left)).toEqual(rect(v.handles!.left.grip));
    expect(box(right)).toEqual(rect(v.handles!.right.grip));

    // It follows the focus, and the bar's new visual (a zoom)
    await c.set(() => bar(c, 'c').focus());
    expect(box(overlay(c)!.children[0])).toEqual(rect(c.gantt.getBarVisual('c')!.focusRect));
    await c.set(() => c.gantt.zoomOut());
    expect(box(overlay(c)!.children[0])).toEqual(rect(c.gantt.getBarVisual('c')!.focusRect));
  });

  it('shows no ring for focus from the pointer, until a key is pressed', async () => {
    const c = await mount();
    pointerDown(bar(c, 'a'));
    await c.set(() => bar(c, 'a').focus());
    expect(c.layout.focusVisibleBarId()).toBeNull();
    expect(overlay(c)).toBeNull();
    // The bar still takes the tab stop
    expect(bar(c, 'a').getAttribute('tabindex')).toBe('0');

    await c.set(() => anyKey());
    expect(shapes(c)).toContain('gantt-bar-focus-ring');
    // A pointer press anywhere hides it again
    await c.set(() => pointerDown(document.body));
    expect(overlay(c)).toBeNull();
  });

  it('shows only the ring for bars without handles (milestones, resize off)', async () => {
    const c = await mount();
    anyKey();
    await c.set(() => bar(c, 'm').focus());
    expect(shapes(c)).toEqual(['gantt-bar-focus-ring']);
    await c.set(() => c.f.componentInstance.resize.set(false));
    await c.set(() => bar(c, 'a').focus());
    expect(shapes(c)).toEqual(['gantt-bar-focus-ring']);
  });

  it('shows the grips of the hovered bar (fine pointer), without a ring', async () => {
    const c = await mount();
    await c.set(() => c.layout.hoveredBarId.set('a'));
    expect(shapes(c)).toEqual(['gantt-bar-grip', 'gantt-bar-grip']);
    expect(box(overlay(c)!.children[0])).toEqual(rect(c.gantt.getBarVisual('a')!.handles!.left.grip));
    // Hover and keyboard focus on two bars: both, in row order
    anyKey();
    await c.set(() => bar(c, 'c').focus());
    expect(shapes(c)).toEqual([
      'gantt-bar-grip',
      'gantt-bar-grip',
      'gantt-bar-focus-ring',
      'gantt-bar-grip',
      'gantt-bar-grip',
    ]);
    await c.set(() => {
      c.layout.hoveredBarId.set(null);
      bar(c, 'c').blur();
    });
    expect(overlay(c)).toBeNull();
  });

  it('on a coarse pointer, shows the grips of the selected bars', async () => {
    const win = document.defaultView!;
    const coarse = (q: string) => ({ matches: q === '(pointer: coarse)', media: q }) as MediaQueryList;
    if (typeof win.matchMedia === 'function') vi.spyOn(win, 'matchMedia').mockImplementation(coarse);
    else vi.stubGlobal('matchMedia', coarse);
    try {
      const c = await mount();
      expect(overlay(c)).toBeNull();
      await c.set(() => c.gantt.setSelectedTasks(['a', 'b']));
      expect(shapes(c)).toEqual(['gantt-bar-grip', 'gantt-bar-grip', 'gantt-bar-grip', 'gantt-bar-grip']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('paints the ring and grips with --gantt-focus-ring, like every focus ring of the task list', async () => {
    const c = await mount();
    anyKey();
    await c.set(() => bar(c, 'a').focus());
    const ring = rulesWith('.gantt-bar-focus-ring')[0].style;
    expect([
      ring.getPropertyValue('fill'),
      ring.getPropertyValue('stroke'),
      ring.getPropertyValue('stroke-width'),
    ]).toEqual(['none', 'var(--gantt-focus-ring)', '2px']);
    const grip = rulesWith('.gantt-bar-grip')[0].style;
    expect([
      grip.getPropertyValue('fill'),
      grip.getPropertyValue('stroke'),
      grip.getPropertyValue('stroke-width'),
    ]).toEqual(['var(--gantt-bg)', 'var(--gantt-focus-ring)', '1.5px']);
    const rings = rulesWith('.gantt-tl-').filter(r => r.selectorText.includes(':focus-visible'));
    expect(rings.length).toBeGreaterThan(0);
    for (const r of rings)
      expect(r.style.getPropertyValue('outline'), r.selectorText).toContain('var(--gantt-focus-ring)');
    // The task list's rings cover rows, cells, header cells and collapse toggles
    const selectors = rings.map(r => r.selectorText).join(',');
    for (const cls of ['gantt-tl-row', 'gantt-tl-cell', 'gantt-tl-col-header', 'gantt-collapse-btn'])
      expect(selectors, cls).toContain(`.${cls}`);
  });

  it('gives built-in bars the Web Component classes, gantt-bar--critical after the first on the critical path', async () => {
    const c = await mount(h => h.options.set({ viewMode: ViewMode.Day, initialScroll: false, criticalPath: true }));
    const classes = (id: string) => bar(c, id).getAttribute('class')!.split(' ');
    expect(c.gantt.criticalIds().has('a')).toBe(true);
    expect(classes('a')).toEqual([
      'gantt-bar',
      'gantt-bar--task',
      'gantt-bar--critical',
      'mine',
      'gantt-bar-draggable',
    ]);
    expect(classes('m').slice(0, 2)).toEqual(['gantt-bar', 'gantt-bar--milestone']);
    expect(classes('c')).not.toContain('gantt-bar--critical');
    await c.set(() => c.f.componentInstance.options.set({ viewMode: ViewMode.Day, initialScroll: false }));
    expect(classes('a')).toEqual(['gantt-bar', 'gantt-bar--task', 'mine', 'gantt-bar-draggable']);
  });
});
