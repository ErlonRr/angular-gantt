// Bars (Gantry 2 phase 7, step 2.1): `GanttBarBase` declares `ctx`, the canvas keeps a row's ctx
// object while its data is unchanged, the `[ganttBarOutlet]` swaps components on a `barType`
// change, creates the host <g> in the SVG namespace and releases every view it created. Step 4.1:
// the bars sit directly in the bars layer (no row wrapper), the outlet's views live in its
// container (they move with their `@for` row), it stamps `data-task-id` and dims the dragged bar.
import { beforeEach, describe, it, expect } from 'vitest';
import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { GantryComponent } from './gantt-component/gantry.component';
import { GanttDragService } from './drag/gantt-drag.service';
import { GanttBarBase, provideGanttBar } from './bar-registry';
import { GanttBarOutletDirective } from './bars/bar-outlet.directive';
import { DRAG_SOURCE_OPACITY, TaskType, type GanttBarContext, type GanttTask } from '@gantryjs/core';

const SVG_NS = 'http://www.w3.org/2000/svg';
const day = (d: number) => new Date(2026, 0, d);
const TASKS: GanttTask[] = [
  { id: 'g', name: 'Group', type: TaskType.Group, start: day(5), end: day(20) },
  { id: 'a', name: 'Alpha', parentId: 'g', start: day(5), end: day(12) },
  { id: 'b', name: 'Beta', parentId: 'g', start: day(9), end: day(16) },
  { id: 'm', name: 'Milestone', type: TaskType.Milestone, start: day(18), end: day(18) },
];

/** Every live custom bar, and the ones destroyed so far */
const live = new Set<GanttBarBase>();
const destroyed: GanttBarBase[] = [];
function track(bar: GanttBarBase): void {
  live.add(bar);
  inject(DestroyRef).onDestroy(() => {
    live.delete(bar);
    destroyed.push(bar);
  });
}

@Component({
  selector: 'g[spyBar]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-task-id]': 'ctx().row.task.id',
    '[attr.data-bar]': "'spy'",
    '[class.spy-selected]': 'ctx().isSelected',
  },
  template: '<svg:rect class="spy-rect" [attr.x]="ctx().visual.x" [attr.width]="ctx().visual.width" />',
})
class SpyBar extends GanttBarBase {
  constructor() {
    super();
    track(this);
  }
}

@Component({
  selector: 'g[epicBar]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-task-id]': 'ctx().row.task.id', '[attr.data-bar]': "'epic'" },
  template: '<svg:rect class="epic-rect" [attr.x]="ctx().visual.x" />',
})
class EpicBar extends GanttBarBase {
  constructor() {
    super();
    track(this);
  }
}

@Component({
  imports: [GantryComponent],
  providers: [
    provideGanttBar(
      { type: 'task', component: SpyBar },
      { type: 'group', component: SpyBar },
      { type: 'milestone', component: SpyBar },
      { type: 'epic', component: EpicBar },
    ),
  ],
  template: `@if (show()) {
    <gantry [series]="tasks()" [options]="{ initialScroll: false }" />
  }`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(TASKS);
  readonly show = signal(true);
}

async function mount(): Promise<ComponentFixture<Host>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  return fixture;
}

const barsById = () => new Map([...live].map(bar => [bar.ctx().row.task.id, bar]));
const ctxById = () => new Map([...live].map(bar => [bar.ctx().row.task.id, bar.ctx()]));
const barEl = (f: ComponentFixture<Host>, id: string): Element => {
  const [el, ...more] = (f.nativeElement as HTMLElement).querySelectorAll(`.gantt-bars-layer [data-task-id="${id}"]`);
  if (!el || more.length) throw new Error(`${more.length + (el ? 1 : 0)} bars for ${id}`);
  return el;
};

beforeEach(() => {
  live.clear();
  destroyed.length = 0;
});

describe('bars', () => {
  it('a custom bar extending GanttBarBase receives ctx (no ctx input of its own)', async () => {
    const f = await mount();
    const ctx = ctxById();
    expect([...ctx.keys()].sort()).toEqual(['a', 'b', 'g', 'm']);
    const a = ctx.get('a');
    expect(a?.row.task.name).toBe('Alpha');
    expect(a?.geometry.row).toBe(a?.row);
    expect(a?.visual.width).toBeGreaterThan(0);
    expect(barEl(f, 'a').querySelector('.spy-rect')?.getAttribute('x')).toBe(String(a?.visual.x));
  });

  it('selecting one row changes the ctx object of that row only', async () => {
    const f = await mount();
    const bars = barsById();
    const before = ctxById();
    const rows = [...(f.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.gantt-tl-row')];
    rows.find(r => r.getAttribute('data-task-id') === 'b')?.click();
    await f.whenStable();

    const after = ctxById();
    expect(after.get('b')).not.toBe(before.get('b'));
    expect(after.get('b')?.isSelected).toBe(true);
    for (const id of ['g', 'a', 'm']) expect(after.get(id), id).toBe(before.get(id));
    // Same components, the new ctx reached the selected bar (inputBinding, zoneless)
    for (const [id, bar] of barsById()) expect(bar, id).toBe(bars.get(id));
    expect(barEl(f, 'b').classList).toContain('spy-selected');
    expect(barEl(f, 'a').classList).not.toContain('spy-selected');
  });

  it('a barType change swaps the component and destroys the old one', async () => {
    const f = await mount();
    const before = barsById();
    const oldB = before.get('b');
    expect(barEl(f, 'b').getAttribute('data-bar')).toBe('spy');

    f.componentInstance.tasks.update(ts => ts.map(t => (t.id === 'b' ? { ...t, barType: 'epic' } : t)));
    await f.whenStable();

    const after = barsById();
    expect(after.get('b')).toBeInstanceOf(EpicBar);
    expect(destroyed).toEqual([oldB]);
    expect(barEl(f, 'b').getAttribute('data-bar')).toBe('epic');
    expect(barEl(f, 'b').querySelector('.epic-rect')).not.toBeNull();
    // The other rows keep their components
    for (const id of ['g', 'a', 'm']) expect(after.get(id), id).toBe(before.get(id));
  });

  it('the bar host <g> is created in the SVG namespace, directly in the bars layer', async () => {
    const f = await mount();
    const host = barEl(f, 'a');
    expect(host).toBeInstanceOf(SVGGElement);
    expect(host.namespaceURI).toBe(SVG_NS);
    // g.gantt-bars-layer > g[data-task-id] (bar host), like the Web Component
    expect(host.parentElement?.classList).toContain('gantt-bars-layer');
    const layer = host.parentElement!;
    expect([...layer.children].map(c => c.getAttribute('data-task-id'))).toEqual(['g', 'a', 'b', 'm']);
    expect(host.querySelector('.spy-rect')?.namespaceURI).toBe(SVG_NS);
  });

  it('destroying the chart destroys every bar view (they live in the canvas view tree, not the ApplicationRef)', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const appRef = TestBed.inject(ApplicationRef);
    const baseline = appRef.viewCount;
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    expect(appRef.viewCount).toBe(baseline);
    expect(live.size).toBe(4);

    f.componentInstance.show.set(false);
    await f.whenStable();
    expect(appRef.viewCount).toBe(baseline);
    expect(live.size).toBe(0);
    expect((f.nativeElement as HTMLElement).querySelector('[data-task-id]')).toBeNull();
  });

  it('dims the dragged bar with an opacity style on its host and restores it', async () => {
    const f = await mount();
    const drag = f.debugElement.query(By.directive(GantryComponent)).injector.get(GanttDragService);
    drag.state.set({ kind: 'dragging', taskId: 'a' });
    await f.whenStable();
    const host = barEl(f, 'a') as SVGGElement;
    expect(host.style.getPropertyValue('opacity')).toBe(String(DRAG_SOURCE_OPACITY));
    expect(host.hasAttribute('opacity')).toBe(false);
    expect((barEl(f, 'b') as SVGGElement).style.getPropertyValue('opacity')).toBe('');

    drag.state.set({ kind: 'idle' });
    await f.whenStable();
    expect(host.style.getPropertyValue('opacity')).toBe('');
  });
});

describe('GanttBarOutletDirective on <ng-container>', () => {
  const ctxOf = (id: string) =>
    ({
      row: { task: { id }, barType: 'task' },
      visual: { x: 1, width: 2 },
      isSelected: false,
    }) as unknown as GanttBarContext;

  @Component({
    imports: [GanttBarOutletDirective],
    template: `<svg>
      <g class="layer">
        @for (c of ctxs(); track c.row.task.id) {
          <ng-container [ganttBarOutlet]="type" [ganttBarOutletCtx]="c" />
        }
      </g>
    </svg>`,
  })
  class OutletHost {
    readonly type = SpyBar;
    readonly ctxs = signal([ctxOf('x'), ctxOf('y')]);
  }

  /** A custom bar that binds nothing on its host */
  @Component({
    selector: 'plain-bar',
    template: '<svg:rect class="plain-rect" />',
  })
  class PlainBar extends GanttBarBase {}

  @Component({
    imports: [GanttBarOutletDirective],
    template: `<svg>
      <g class="layer"><ng-container [ganttBarOutlet]="type" [ganttBarOutletCtx]="ctx" /></g>
    </svg>`,
  })
  class PlainHost {
    readonly type = PlainBar;
    readonly ctx = ctxOf('p');
  }

  it('stamps data-task-id on the host of a bar that does not bind it', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(PlainHost);
    await f.whenStable();
    const hosts = [...(f.nativeElement as HTMLElement).querySelectorAll('g.layer > g')];
    expect(hosts.map(h => h.getAttribute('data-task-id'))).toEqual(['p']);
    expect(hosts[0]?.querySelector('.plain-rect')).not.toBeNull();
  });

  it('moves the bar hosts with their rows when the @for reorders', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(OutletHost);
    await f.whenStable();
    const layer = (f.nativeElement as HTMLElement).querySelector('g.layer')!;
    const ids = () => [...layer.children].map(h => h.getAttribute('data-task-id'));
    const before = new Map([...layer.children].map(h => [h.getAttribute('data-task-id'), h]));

    f.componentInstance.ctxs.set([ctxOf('y'), ctxOf('x')]);
    await f.whenStable();
    expect(ids()).toEqual(['y', 'x']);
    // Same hosts (moved, not re-created), each right before its own anchor comment
    expect(layer.children[0]).toBe(before.get('y'));
    expect(layer.children[1]).toBe(before.get('x'));
    for (const h of layer.children) expect(h.nextSibling?.nodeType).toBe(Node.COMMENT_NODE);

    f.componentInstance.ctxs.set([ctxOf('z'), ctxOf('x'), ctxOf('y')]);
    await f.whenStable();
    expect(ids()).toEqual(['z', 'x', 'y']);
    expect(live.size).toBe(3);
  });

  it('inserts the bar host before the container anchor and removes it with the view', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(OutletHost);
    await f.whenStable();
    const layer = (f.nativeElement as HTMLElement).querySelector('g.layer');
    const hosts = [...(layer?.children ?? [])];
    expect(hosts.map(h => h.getAttribute('data-task-id'))).toEqual(['x', 'y']);
    expect(hosts.every(h => h.namespaceURI === SVG_NS && h.localName === 'g')).toBe(true);
    expect(hosts[0]?.nextSibling?.nodeType).toBe(Node.COMMENT_NODE);

    f.componentInstance.ctxs.set([ctxOf('y')]);
    await f.whenStable();
    expect([...(layer?.children ?? [])].map(h => h.getAttribute('data-task-id'))).toEqual(['y']);
    expect(live.size).toBe(1);
  });
});
