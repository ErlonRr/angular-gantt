// The panel side of <gantry> (Gantry 2 phase 7, final review): the splitter's separator states its value
// and range in px (`aria-valuenow` / `aria-valuemin` / `aria-valuemax`, core `splitterValue`, as the Web
// Component's), the toggle sits `SPLITTER_TOGGLE_OFFSET` below the header, and the content slots are the
// documented ones — `[ganttToolbar]`, `[tlFooter]`, `[ganttFooter]` — with no dead slot left in the
// internal task list.
import { describe, it, expect } from 'vitest';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SPLITTER_TOGGLE_OFFSET, type GanttOptions, type GanttTask } from '@gantryjs/core';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttLayoutService } from './layout/gantt-layout.service';

const day = (d: number) => new Date(2026, 2, d);
const TASKS: GanttTask[] = [
  { id: 'a', name: 'Alpha', start: day(2), end: day(9) },
  { id: 'b', name: 'Beta', start: day(9), end: day(16) },
];

@Component({
  imports: [GantryComponent],
  template: `<gantry style="height: 400px" [series]="tasks" [options]="options()">
    <button ganttToolbar type="button" class="consumer-toolbar">Export CSV</button>
    <div tlFooter class="consumer-tl-footer">{{ tasks.length }} total tasks</div>
    <div ganttFooter class="consumer-footer">© 2026 My Company</div>
  </gantry>`,
})
class Host {
  readonly tasks = TASKS;
  readonly options = signal<GanttOptions>({ initialScroll: false });
  readonly gantt = viewChild.required(GantryComponent);
}

async function mount(): Promise<{ f: ComponentFixture<Host>; host: HTMLElement }> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(Host);
  await f.whenStable();
  return { f, host: f.debugElement.query(By.directive(GantryComponent)).nativeElement as HTMLElement };
}

const valueOf = (handle: Element) =>
  ['aria-valuenow', 'aria-valuemin', 'aria-valuemax'].map(a => Number(handle.getAttribute(a)));

describe('the splitter separator', () => {
  it('states the panel width and its range in px, from 0 (collapsible) or minWidth', async () => {
    const { f, host } = await mount();
    const handle = host.querySelector('.gantry-splitter-handle')!;
    // Nothing is measured: a 1000 px host, a 6 px splitter, 40 px kept for the timeline
    expect(valueOf(handle)).toEqual([300, 0, 954]);

    f.componentInstance.options.set({
      initialScroll: false,
      panel: { collapsible: false, minWidth: 150, maxWidth: 400 },
    });
    await f.whenStable();
    expect(valueOf(handle)).toEqual([300, 150, 400]);

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await f.whenStable();
    expect(valueOf(handle)).toEqual([324, 150, 400]);

    // Collapsed (chart view): 0 stays inside the range
    f.componentInstance.gantt().setView('chart');
    await f.whenStable();
    expect(valueOf(host.querySelector('.gantry-splitter-handle')!)).toEqual([0, 0, 400]);
  });

  it('places the collapse toggle SPLITTER_TOGGLE_OFFSET below the header', async () => {
    const { f, host } = await mount();
    const layout = f.debugElement.query(By.directive(GantryComponent)).injector.get(GanttLayoutService);
    const toggle = host.querySelector<HTMLElement>('.gantry-splitter-toggle')!;
    expect(toggle.style.top).toBe(`${layout.headerHeight() + SPLITTER_TOGGLE_OFFSET}px`);
  });
});

describe('content slots', () => {
  it('projects the documented slots; the internal task list has none of its own', async () => {
    const { host } = await mount();
    expect(host.querySelector('.gantt-tb-slot > .consumer-toolbar')).not.toBeNull();
    const panel = host.querySelector('.gantry-panel')!;
    const tlFooter = host.querySelector('.consumer-tl-footer')!;
    expect(tlFooter.parentElement).toBe(panel);
    expect(tlFooter.textContent).toBe('2 total tasks');
    expect(host.lastElementChild?.classList.contains('consumer-footer')).toBe(true);

    // The task list: the column header row and the rows, nothing else
    const tasklist = host.querySelector('gantt-tasklist')!;
    expect([...tasklist.children].map(c => c.className)).toEqual(['gantt-tl-col-headers', 'gantt-tl-rows']);
    expect(host.querySelector('.gantt-tl-header-slot, .gantt-tl-footer-slot')).toBeNull();
  });
});
