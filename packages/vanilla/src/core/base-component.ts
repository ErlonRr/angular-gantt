/**
 * @file base-component.ts
 * Abstract base class for framework-agnostic Vanilla DOM UI components.
 */

/**
 * Base abstract class providing mounting, rendering, and cleanup lifecycles.
 */
export abstract class BaseComponent<TProps = Record<string, any>> {
  protected element: HTMLElement;
  protected props: TProps;
  protected unmountFns: Array<() => void> = [];

  constructor(container: HTMLElement, props: TProps) {
    this.element = container;
    this.props = props;
  }

  /**
   * Update component properties and re-render.
   */
  updateProps(newProps: Partial<TProps>): void {
    this.props = { ...this.props, ...newProps };
    this.render();
  }

  /**
   * Abstract render method implemented by subclass components.
   */
  abstract render(): void;

  /**
   * Register cleanup functions executed on unmount.
   */
  protected onUnmount(fn: () => void): void {
    this.unmountFns.push(fn);
  }

  /**
   * Destroy component and clear listeners.
   */
  destroy(): void {
    this.unmountFns.forEach(fn => fn());
    this.unmountFns = [];
    this.element.innerHTML = '';
  }
}
