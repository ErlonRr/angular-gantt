// ─────────────────────────────────────────────────────────────
//  gantry · bars/bar-outlet.directive.ts
//
//  Renders one bar component inside the chart's <svg>, directly in the
//  bars layer (`g.gantt-bars-layer > g[data-task-id]`, like the Web
//  Component). Used on an <ng-container> in the canvas' `@for`.
//
//  A host created from a component selector lands in the HTML namespace
//  inside SVG (angular#10404, #46190) and is not painted, so the outlet
//  creates the bar's <g> host in the SVG namespace itself (Renderer2) and
//  hands it to createComponent({ hostElement }), whatever the bar's
//  selector. The host view goes into the container's ViewContainerRef:
//  Angular inserts the host before the container's anchor comment, moves
//  it with its `@for` row when rows reorder, checks it with the canvas and
//  removes it with the row. The row context reaches the bar's `ctx` input
//  through inputBinding (a signal: no setInput, no effect per change).
//
//  The outlet also stamps `data-task-id` on the host (the canvas finds the
//  hovered bar's row through it, custom bars included) and dims the bar
//  being dragged with an `opacity` style (DRAG_SOURCE_OPACITY), restoring
//  only an opacity it set itself.
// ─────────────────────────────────────────────────────────────

import {
  DestroyRef,
  Directive,
  EnvironmentInjector,
  Injector,
  Renderer2,
  ViewContainerRef,
  createComponent,
  effect,
  inject,
  input,
  inputBinding,
  untracked,
  type ComponentRef,
  type Type,
} from '@angular/core';
import { DRAG_SOURCE_OPACITY } from '@gantryjs/core';

import { type GanttBarContext } from '../types';
import { type GanttBarBase } from './bar-base';

@Directive({ selector: '[ganttBarOutlet]' })
export class GanttBarOutletDirective {
  /** Bar component of the row (`GanttBarRegistry.resolve(row.barType)`) */
  readonly ganttBarOutlet = input.required<Type<GanttBarBase>>();
  /** The row's context, bound to the bar's `ctx` input */
  readonly ganttBarOutletCtx = input.required<GanttBarContext>();
  /** The row's bar is being dragged or resized: dimmed to DRAG_SOURCE_OPACITY */
  readonly ganttBarOutletDimmed = input(false);

  private readonly renderer = inject(Renderer2);
  private readonly container = inject(ViewContainerRef);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly elementInjector = inject(Injector);

  private ref: ComponentRef<GanttBarBase> | null = null;
  private host: Element | null = null;
  /** This outlet wrote the host's `opacity` */
  private dimmed = false;

  constructor() {
    // Whitelisted effects (creating bar components): the first tracks the component type only
    effect(() => {
      const type = this.ganttBarOutlet();
      untracked(() => this.mount(type));
    });
    effect(() => {
      const dim = this.ganttBarOutletDimmed();
      untracked(() => this.dim(dim));
    });
    inject(DestroyRef).onDestroy(() => this.unmount());
  }

  private mount(type: Type<GanttBarBase>): void {
    this.unmount();
    const host = this.renderer.createElement('g', 'svg') as Element;
    this.renderer.setAttribute(host, 'data-task-id', this.ganttBarOutletCtx().row.task.id);
    const ref = createComponent(type, {
      hostElement: host,
      environmentInjector: this.environmentInjector,
      elementInjector: this.elementInjector,
      bindings: [inputBinding('ctx', this.ganttBarOutletCtx)],
    });
    this.container.insert(ref.hostView);
    this.ref = ref;
    this.host = host;
    this.dimmed = false;
    this.dim(this.ganttBarOutletDimmed());
  }

  private dim(dim: boolean): void {
    const host = this.host;
    if (!host || dim === this.dimmed) return;
    this.dimmed = dim;
    if (dim) this.renderer.setStyle(host, 'opacity', String(DRAG_SOURCE_OPACITY));
    else this.renderer.removeStyle(host, 'opacity');
  }

  private unmount(): void {
    const ref = this.ref;
    this.ref = null;
    this.host = null;
    // Destroying the view removes it from the container and its host from the DOM
    ref?.destroy();
  }
}
