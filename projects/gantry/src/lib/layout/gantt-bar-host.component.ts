// ─────────────────────────────────────────────────────────────
//  gantry · layout/gantt-bar-host.component.ts
//
//  Angular: NgComponentOutlet inside <svg> often creates the dynamic
//  component host in the HTML namespace (see angular#10404, #46190),
//  so bar markup exists in the DOM but is not painted as SVG graphics.
//
//  Fix: use createComponent({ hostElement }) with
//  document.createElementNS('http://www.w3.org/2000/svg', 'g').
// ─────────────────────────────────────────────────────────────

import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  EnvironmentInjector,
  Injector,
  Type,
  ComponentRef,
  createComponent,
  effect,
  inject,
  input,
  runInInjectionContext,
} from '@angular/core';

import { GanttBarBase } from '../bar-registry';
import { GanttBarContext } from '../types';

const SVG_NS = 'http://www.w3.org/2000/svg';

@Component({
  selector: 'g[ganttBarHost]',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GanttBarHostComponent {
  /** Component class from GanttBarRegistry.resolve() */
  readonly barComponent = input.required<Type<GanttBarBase>>();
  readonly ctx = input.required<GanttBarContext>();

  private readonly _env = inject(EnvironmentInjector);
  private readonly _inj = inject(Injector);
  private readonly _appRef = inject(ApplicationRef);
  private readonly _parent = inject(ElementRef<SVGGElement>);
  private readonly _destroyRef = inject(DestroyRef);

  private _ref: ComponentRef<GanttBarBase> | null = null;
  private _hostG: SVGGElement | null = null;
  private _boundType: Type<GanttBarBase> | null = null;

  constructor() {
    this._destroyRef.onDestroy(() => this._teardown());

    runInInjectionContext(this._inj, () => {
      effect(() => {
        const Cmp = this.barComponent();
        const ctx = this.ctx();

        if (!this._ref || this._boundType !== Cmp) {
          this._teardown();
          this._hostG = document.createElementNS(SVG_NS, 'g');
          this._parent.nativeElement.appendChild(this._hostG);

          this._ref = createComponent(Cmp, {
            hostElement: this._hostG,
            environmentInjector: this._env,
            elementInjector: this._inj,
          });
          this._boundType = Cmp;
          this._appRef.attachView(this._ref.hostView);
        }
        this._ref.setInput('ctx', ctx);
      });
    });
  }

  private _teardown(): void {
    if (this._ref) {
      this._appRef.detachView(this._ref.hostView);
      this._ref.destroy();
      this._ref = null;
    }
    this._boundType = null;
    if (this._hostG?.parentNode) {
      this._hostG.parentNode.removeChild(this._hostG);
    }
    this._hostG = null;
  }
}
