// What opens, closes and describes the task tooltip besides the pointer over the bars (Gantry 2
// phase 9 step 4.8, the Web Component's `interaction/tooltip-triggers.ts` and tooltip layer):
// `aria-describedby` on the bar whose tooltip shows, keyboard focus on a bar
// (`layout.focusVisibleBarId`), Escape in the capture phase (D24, WCAG 1.4.13), the pointer
// resting on the tooltip, a press elsewhere, the row going away, option changes, the trigger
// rules, and custom content (`options.tooltip.render`, `<ng-template ganttTooltip>` winning over it).
// Timers are faked (setTimeout only) and the renders flushed with TestBed.tick().
import { afterEach, describe, it, expect, vi } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  TOOLTIP_HIDE_DELAY,
  TOOLTIP_SHOW_DELAY,
  TaskType,
  type GanttFlatRow,
  type GanttOptions,
  type GanttTask,
  type GanttTooltipRenderContext,
} from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttCanvasComponent } from './layout/gantt-canvas.component';
import { GanttLayoutService } from './layout/gantt-layout.service';
import { GanttDragService } from './drag/gantt-drag.service';
import { GanttTooltipState } from './tooltip/tooltip-state';
import { GanttTooltipTemplateDirective } from './tooltip/gantt-tooltip-template.directive';

const day = (d: number) => new Date(2026, 2, d);
const TASKS = (): GanttTask[] => [
  { id: 'g', name: 'Group', start: day(2), end: day(20), type: TaskType.Group },
  { id: 'a', name: 'Alpha', start: day(2), end: day(9), parentId: 'g' },
  { id: 'b', name: 'Beta', start: day(9), end: day(20), parentId: 'g' },
  { id: 'r', name: 'Root', start: day(3), end: day(6) },
];
const DAY: GanttOptions = { viewMode: 'Day', initialScroll: false };

@Component({
  imports: [GantryComponent, GanttTooltipTemplateDirective],
  template: `
    <gantry
      id="one"
      style="height: 400px"
      [series]="tasks()"
      [options]="options()"
      [tooltipEnabled]="enabled()"
      [enableDrag]="drag()"
    >
      @if (custom()) {
        <ng-template ganttTooltip let-model let-task="task" let-row="row">
          <strong class="mine">{{ task.name }}</strong
          ><i class="facts">{{ model.rows.length }} / {{ row.level }}</i>
        </ng-template>
      }
    </gantry>
    @if (second()) {
      <gantry id="two" style="height: 400px" [series]="tasks()" [options]="options()" />
    }
  `,
})
class Host {
  readonly tasks = signal<GanttTask[]>(TASKS());
  readonly options = signal<GanttOptions>(DAY);
  readonly enabled = signal(true);
  readonly drag = signal(true);
  readonly custom = signal(false);
  readonly second = signal(false);
  readonly gantt = viewChild.required(GantryComponent);
}

interface Chart {
  f: ComponentFixture<Host>;
  h: Host;
  host: HTMLElement;
  layout: GanttLayoutService;
  state: GanttTooltipState;
  tip(): HTMLElement;
  bar(id: string): SVGGElement;
  row(id: string): GanttFlatRow;
  hover(id: string, x?: number): void;
  open(id: string): HTMLElement;
}

async function mount(setup?: (host: Host) => void): Promise<Chart> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  setup?.(f.componentInstance);
  await f.whenStable();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const chart = f.debugElement.query(By.css('#one'));
  const host = chart.nativeElement as HTMLElement;
  const layout = chart.injector.get(GanttLayoutService);
  const state = chart.query(By.directive(GanttCanvasComponent)).injector.get(GanttTooltipState);
  const c: Chart = {
    f,
    h: f.componentInstance,
    host,
    layout,
    state,
    tip: () => host.querySelector<HTMLElement>('.gantt-tooltip')!,
    bar: id => host.querySelector<SVGGElement>(`.gantt-bars-layer [data-task-id="${id}"]`)!,
    row: id => layout.geometryById().get(id)!.row,
    hover(id, x = 50) {
      state.hover(c.row(id), c.bar(id), x);
      TestBed.tick();
    },
    open(id) {
      c.hover(id);
      wait(TOOLTIP_SHOW_DELAY);
      return c.tip();
    },
  };
  return c;
}

function wait(ms: number): void {
  vi.advanceTimersByTime(ms);
  TestBed.tick();
}
/** Keyboard focus reached a bar (what the keyboard model writes), or left the bars (`null`) */
function keyboardFocus(c: Chart, id: string | null): void {
  c.layout.focusVisibleBarId.set(id);
  TestBed.tick();
}
function escape(target: EventTarget): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true });
  target.dispatchEvent(e);
  TestBed.tick();
  return e;
}
const children = (tip: HTMLElement) => [...tip.children].map(c => `${c.tagName.toLowerCase()}.${c.className}`);

describe('tooltip accessibility and triggers', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('describes its bar while it shows: aria-describedby follows the tooltip, with an id unique per chart', async () => {
    const c = await mount(h => h.second.set(true));
    const [a, b] = [c.bar('a'), c.bar('b')];
    expect(a.hasAttribute('aria-describedby')).toBe(false);
    c.hover('a');
    expect(a.hasAttribute('aria-describedby')).toBe(false); // still waiting for the show delay
    wait(TOOLTIP_SHOW_DELAY);
    const tip = c.tip();
    expect(tip.id).not.toBe('');
    expect(a.getAttribute('aria-describedby')).toBe(tip.id);
    // The other chart's tooltip has its own id
    const other = c.f.debugElement.query(By.css('#two'));
    expect(other.query(By.directive(GanttCanvasComponent)).injector.get(GanttTooltipState).elementId()).not.toBe(
      tip.id,
    );
    expect(document.querySelectorAll(`[id="${tip.id}"]`)).toHaveLength(1);

    c.hover('b');
    expect(a.hasAttribute('aria-describedby')).toBe(false);
    expect(b.getAttribute('aria-describedby')).toBe(tip.id);
    // Closing (after the hide delay) removes it
    c.state.unhover();
    TestBed.tick();
    expect(b.getAttribute('aria-describedby')).toBe(tip.id);
    wait(TOOLTIP_HIDE_DELAY);
    expect(b.hasAttribute('aria-describedby')).toBe(false);
    // A child of the bar anchors to the bar itself
    c.state.focus(c.row('a'), a.firstElementChild!);
    TestBed.tick();
    expect(c.state.anchor()).toBe(a);
    expect(a.getAttribute('aria-describedby')).toBe(tip.id);
    expect(c.state.visibleId()).toBe('a');
    expect(c.state.dismiss()).toBe(true);
    TestBed.tick();
    expect(a.hasAttribute('aria-describedby')).toBe(false);
    expect(c.state.visibleId()).toBeNull();
    expect(c.state.dismiss()).toBe(false);
  });

  it('opens at once on keyboard focus of a bar and closes when focus leaves the bars', async () => {
    const c = await mount();
    keyboardFocus(c, 'a');
    const tip = c.tip();
    expect(tip.hidden).toBe(false);
    expect(tip.querySelector('.gantt-tooltip-title')!.textContent).toBe('Alpha');
    expect(c.bar('a').getAttribute('aria-describedby')).toBe(tip.id);
    expect(c.state.source()).toBe('focus');
    // From bar to bar: follows focus, no blur in between
    keyboardFocus(c, 'b');
    expect(tip.querySelector('.gantt-tooltip-title')!.textContent).toBe('Beta');
    expect(c.bar('a').hasAttribute('aria-describedby')).toBe(false);
    keyboardFocus(c, null);
    expect(tip.hidden).toBe(true);
    expect(c.bar('b').hasAttribute('aria-describedby')).toBe(false);
    // trigger 'hover': focus opens nothing
    c.h.options.set({ ...DAY, tooltip: { trigger: 'hover' } });
    TestBed.tick();
    keyboardFocus(c, 'a');
    expect(tip.hidden).toBe(true);
  });

  it('Escape closes the visible tooltip first and consumes the key; the next Escape goes on', async () => {
    const c = await mount();
    const seen = vi.fn();
    c.host.addEventListener('keydown', seen);
    keyboardFocus(c, 'a');
    const first = escape(c.bar('a'));
    expect(first.defaultPrevented).toBe(true);
    expect(seen).not.toHaveBeenCalled();
    expect(c.tip().hidden).toBe(true);
    // Dismissed: the focused bar does not reopen it until focus leaves it
    keyboardFocus(c, 'a');
    expect(c.tip().hidden).toBe(true);
    escape(c.bar('a'));
    expect(seen).toHaveBeenCalledTimes(1);

    // Focus elsewhere in the page: Escape closes a hover tooltip and stays the page's
    const outside = document.createElement('button');
    document.body.append(outside);
    try {
      keyboardFocus(c, null);
      c.open('b');
      expect(c.tip().hidden).toBe(false);
      expect(escape(outside).defaultPrevented).toBe(false);
      expect(c.tip().hidden).toBe(true);
      expect(seen).toHaveBeenCalledTimes(1);
    } finally {
      outside.remove();
    }

    // A pending (not yet visible) hover tooltip leaves Escape alone
    c.hover('r');
    escape(c.bar('r'));
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('leaves Escape to text inputs and to a drag or move mode, which dismisses the tooltip when it starts', async () => {
    const c = await mount();
    const drag = c.f.debugElement.query(By.css('#one')).injector.get(GanttDragService);
    const seen = vi.fn();
    c.host.addEventListener('keydown', seen);
    keyboardFocus(c, 'a');
    // Typing in an input inside the chart keeps its Escape
    const input = document.createElement('input');
    c.host.appendChild(input);
    escape(input);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(c.tip().hidden).toBe(false);
    input.remove();

    // Move mode starts: dismissed at once, and Escape is the move mode's
    expect(drag.startExternal('a')).toBe(true);
    TestBed.tick();
    expect(c.tip().hidden).toBe(true);
    // Moving the preview dismisses nothing else
    const dismiss = vi.spyOn(c.state, 'dismiss');
    const geo = c.layout.geometryById().get('a')!;
    drag.setExternalPreview({
      taskId: 'a',
      x: geo.barX + 10,
      width: geo.barWidth,
      y: geo.y + 4,
      height: geo.height - 8,
      delta: 1,
      unit: 'day',
      daysDelta: 1,
      start: day(3),
      end: day(10),
    });
    TestBed.tick();
    expect(dismiss).not.toHaveBeenCalled();
    c.state.focus(c.row('b'), c.bar('b'));
    TestBed.tick();
    escape(c.bar('a'));
    expect(seen).toHaveBeenCalledTimes(2);
    drag.endExternal();
    TestBed.tick();
  });

  it('stays open while the pointer rests on the tooltip, and closes after the hide delay once it leaves', async () => {
    const c = await mount();
    const tip = c.open('a');
    c.state.unhover();
    TestBed.tick();
    wait(TOOLTIP_HIDE_DELAY - 1);
    tip.dispatchEvent(new PointerEvent('pointerenter'));
    wait(TOOLTIP_HIDE_DELAY * 5);
    expect(tip.hidden).toBe(false);
    tip.dispatchEvent(new PointerEvent('pointerleave'));
    wait(TOOLTIP_HIDE_DELAY - 1);
    expect(tip.hidden).toBe(false);
    // Back on the bar before the deadline: it stays
    c.hover('a');
    wait(TOOLTIP_HIDE_DELAY * 2);
    expect(tip.hidden).toBe(false);
    c.state.unhover();
    c.state.unhover(); // a second move off the bars keeps the first deadline
    wait(TOOLTIP_HIDE_DELAY);
    expect(tip.hidden).toBe(true);
    // The stylesheet lets the pointer onto it
    const css = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
    expect(css).toMatch(/\.gantt-tooltip-custom\[_ngcontent-[^\]]+\]\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/\[_nghost-[^\]]+\]\s*\{[^}]*z-index:\s*9999;[^}]*pointer-events:\s*auto/);
  });

  it('closes on a press elsewhere, not on the tooltip itself nor on a bar', async () => {
    const c = await mount(h => h.drag.set(false));
    const press = (target: EventTarget, x = 0, y = 0) => {
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, clientX: x, clientY: y }));
      TestBed.tick();
    };
    c.state.tap(c.row('a'), c.bar('a'));
    TestBed.tick();
    const tip = c.tip();
    press(tip);
    expect(tip.hidden).toBe(false);
    // On a bar (the test DOM maps client to SVG coordinates 1:1): the canvas pointer handler's
    const v = c.h.gantt().getBarVisual('r')!;
    press(c.bar('r'), v.x + v.width / 2, v.cy);
    expect(c.state.visibleId()).not.toBeNull();
    // On the empty canvas, then anywhere else in the page
    press(c.host.querySelector('gantt-canvas .gantt-rows rect')!, v.x + v.width + 200, v.cy);
    expect(tip.hidden).toBe(true);
    c.state.tap(c.row('a'), c.bar('a'));
    TestBed.tick();
    expect(tip.hidden).toBe(false);
    press(document.body);
    expect(tip.hidden).toBe(true);

    // With the chart's bar visuals bound (core hitTestBar), a bar is hit by its box, off its shapes too
    c.state.bindBarVisual(() => geo => c.h.gantt().getBarVisual(geo.row.task.id)!);
    c.state.tap(c.row('a'), c.bar('a'));
    TestBed.tick();
    const rows = c.host.querySelector('gantt-canvas .gantt-rows rect')!;
    press(rows, v.x + v.width / 2, v.cy);
    expect(tip.hidden).toBe(false);
    press(rows, v.x + v.width + 200, v.cy);
    expect(tip.hidden).toBe(true);
  });

  it('moves with its bar when the page scrolls or the window resizes', async () => {
    const c = await mount();
    keyboardFocus(c, 'a');
    const tip = c.tip();
    vi.spyOn(tip, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 160, 80));
    const anchor = vi.spyOn(c.bar('a'), 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 100, 120, 24));
    keyboardFocus(c, null);
    keyboardFocus(c, 'a');
    const at = () => tip.style.getPropertyValue('translate');
    expect(at()).toBe(`${200 + 60 - 80}px ${100 + 24 + 8}px`);
    anchor.mockReturnValue(new DOMRect(150, 40, 120, 24));
    document.body.dispatchEvent(new Event('scroll'));
    expect(at()).toBe(`${150 + 60 - 80}px ${40 + 24 + 8}px`);
    anchor.mockReturnValue(new DOMRect(100, 40, 120, 24));
    window.dispatchEvent(new Event('resize'));
    expect(at()).toBe(`${100 + 60 - 80}px ${40 + 24 + 8}px`);
  });

  it('closes when its row goes away, and resets when tooltipEnabled or options.tooltip change', async () => {
    const c = await mount();
    keyboardFocus(c, 'a');
    const tip = c.tip();
    expect(tip.hidden).toBe(false);
    // The group collapses: Alpha's row goes away
    c.h.gantt().collapseAll();
    TestBed.tick();
    expect(tip.hidden).toBe(true);
    c.h.gantt().expandAll();
    TestBed.tick();

    keyboardFocus(c, 'r');
    expect(tip.hidden).toBe(false);
    c.h.options.set({ ...DAY, tooltip: { showDelay: 500 } });
    TestBed.tick();
    expect(tip.hidden).toBe(true);
    // Not reset by an option change outside options.tooltip
    keyboardFocus(c, null);
    keyboardFocus(c, 'r');
    expect(tip.hidden).toBe(false);
    c.h.options.set({ ...DAY, viewMode: 'Week', tooltip: { showDelay: 500 } });
    TestBed.tick();
    expect(tip.hidden).toBe(false);
    // Nor by a new render function alone (a framework re-render may pass a new one every time)
    c.h.options.set({ ...DAY, viewMode: 'Week', tooltip: { showDelay: 500, render: () => null } });
    TestBed.tick();
    expect(tip.hidden).toBe(false);
    c.h.enabled.set(false);
    TestBed.tick();
    expect(tip.hidden).toBe(true);
  });

  it('follows options.tooltip.trigger: hover only, focus only, and taps only with auto', async () => {
    const c = await mount(h => h.options.set({ ...DAY, tooltip: { trigger: 'hover' } }));
    c.state.focus(c.row('a'), c.bar('a'));
    c.state.tap(c.row('a'), c.bar('a'));
    expect(c.state.visibleId()).toBeNull();
    c.open('a');
    expect(c.state.visibleId()).toBe('a');

    c.h.options.set({ ...DAY, tooltip: { trigger: 'focus' } });
    TestBed.tick();
    c.open('a');
    c.state.tap(c.row('a'), c.bar('a'));
    expect(c.state.visibleId()).toBeNull();
    c.state.focus(c.row('a'), c.bar('a'));
    TestBed.tick();
    expect(c.tip().hidden).toBe(false);

    c.h.options.set(DAY);
    TestBed.tick();
    c.state.tap(c.row('a'), c.bar('a'));
    TestBed.tick();
    expect(c.tip().hidden).toBe(false);
    // A tapped tooltip stays until another tap
    wait(10_000);
    expect(c.tip().hidden).toBe(false);
    c.state.tap(c.row('a'), c.bar('a'));
    TestBed.tick();
    expect(c.tip().hidden).toBe(true);
  });

  it('shows options.tooltip.render content instead of the title and rows: text or a DOM node', async () => {
    const render = vi.fn((ctx: GanttTooltipRenderContext): unknown => {
      if (ctx.task.id === 'a') return `<b>${ctx.task.name}</b>`;
      if (ctx.task.id === 'b') {
        const node = document.createElement('strong');
        node.textContent = 'B!';
        return node;
      }
      if (ctx.task.id === 'g') return 42;
      return ctx.task.id === 'r' ? false : null; // the built-in content
    });
    const c = await mount(h => h.options.set({ ...DAY, tooltip: { render } }));
    const tip = c.open('a');
    expect(children(tip)).toEqual(['div.gantt-tooltip-custom']);
    let custom = tip.querySelector('.gantt-tooltip-custom')!;
    expect(custom.textContent).toBe('<b>Alpha</b>');
    expect(custom.querySelector('b')).toBeNull();
    const ctx = render.mock.calls[0][0];
    expect(ctx.model.title).toBe('Alpha');
    expect(ctx.task.id).toBe('a');
    expect(ctx.row).toBe(c.row('a'));

    c.hover('b');
    custom = tip.querySelector('.gantt-tooltip-custom')!;
    expect(custom.children).toHaveLength(1);
    expect(custom.firstElementChild!.tagName).toBe('STRONG');
    expect(custom.textContent).toBe('B!');

    c.hover('g');
    expect(tip.querySelector('.gantt-tooltip-custom')!.textContent).toBe('42');

    c.hover('r');
    expect(children(tip)).toEqual(['div.gantt-tooltip-title', 'dl.gantt-tooltip-rows']);
    expect(tip.querySelector('.gantt-tooltip-title')!.textContent).toBe('Root');
  });

  it('falls back to the built-in content when render throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const c = await mount(h =>
      h.options.set({
        ...DAY,
        tooltip: {
          render: () => {
            throw new Error('boom');
          },
        },
      }),
    );
    const tip = c.open('a');
    expect(children(tip)).toEqual(['div.gantt-tooltip-title', 'dl.gantt-tooltip-rows']);
    expect(tip.querySelector('.gantt-tooltip-title')!.textContent).toBe('Alpha');
    expect(error).toHaveBeenCalledWith('[gantry] tooltip render error:', expect.any(Error));
  });

  it('renders <ng-template ganttTooltip> in div.gantt-tooltip-custom, winning over options.tooltip.render', async () => {
    const render = vi.fn(() => 'from render');
    const c = await mount(h => {
      h.custom.set(true);
      h.options.set({ ...DAY, tooltip: { render } });
    });
    const tip = c.open('a');
    expect(children(tip)).toEqual(['div.gantt-tooltip-custom']);
    const custom = tip.querySelector('.gantt-tooltip-custom')!;
    expect(custom.querySelector('.mine')!.textContent).toBe('Alpha');
    // The model and the row reach the template (Alpha is a child of the group: level 1)
    expect(custom.querySelector('.facts')!.textContent).toMatch(/^\d+ \/ 1$/);
    expect(render).not.toHaveBeenCalled();
    c.hover('r');
    expect(tip.querySelector('.mine')!.textContent).toBe('Root');
    expect(tip.querySelector('.facts')!.textContent).toMatch(/ \/ 0$/);

    // Without the template, render takes over
    c.h.custom.set(false);
    TestBed.tick();
    expect(tip.querySelector('.gantt-tooltip-custom')!.textContent).toBe('from render');
  });
});
