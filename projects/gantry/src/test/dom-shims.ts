// jsdom lacks a few layout APIs the chart touches; tests only need them to exist.
const g = globalThis as unknown as Record<string, unknown>;
g['ResizeObserver'] ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};
g['IntersectionObserver'] ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};
Element.prototype.scrollTo ??= function scrollTo(this: Element, opts?: ScrollToOptions | number): void {
  if (typeof opts === 'object') {
    if (opts.left != null) this.scrollLeft = opts.left;
    if (opts.top != null) this.scrollTop = opts.top;
  }
};
