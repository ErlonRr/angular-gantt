// The test DOM (happy-dom) lacks a few layout APIs the chart touches; tests only need them to exist.
const g = globalThis as unknown as Record<string, unknown>;
const inertObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};
/** Missing, or present but inert (a constructor without `observe`, as some environments define it). */
const unusable = (name: string): boolean => {
  const ctor = g[name] as { prototype?: object } | undefined;
  return !ctor?.prototype || !('observe' in ctor.prototype);
};
if (unusable('ResizeObserver')) g['ResizeObserver'] = inertObserver;
if (unusable('IntersectionObserver')) g['IntersectionObserver'] = inertObserver;
Element.prototype.scrollTo ??= function scrollTo(this: Element, opts?: ScrollToOptions | number): void {
  if (typeof opts === 'object') {
    if (opts.left != null) this.scrollLeft = opts.left;
    if (opts.top != null) this.scrollTop = opts.top;
  }
};
