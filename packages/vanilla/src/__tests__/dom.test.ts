import { describe, it, expect, vi, afterEach } from 'vitest';
import { h, s, SVG_NS } from '../dom/h';
import { setAttr, setStyleProp, setText, toggleClass, forgetPatches } from '../dom/patch';
import { reconcile, createPool } from '../dom/keyed';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const ids = (parent: Element): string[] => [...parent.children].map(c => c.getAttribute('data-k') ?? c.tagName);

describe('h() / s()', () => {
  it('builds an HTML element from class, dataset, attrs, text, listeners and children', () => {
    const click = vi.fn();
    const key = vi.fn();
    const el = h(
      'button',
      {
        class: ['a', false, 'b', null],
        dataset: { taskId: 't1', index: 3 },
        attrs: { type: 'button', 'aria-pressed': true, hidden: false, title: null, tabindex: 0 },
        on: { click, keydown: [key, { passive: true }] },
      },
      'x',
      7,
      null,
      false,
      undefined,
      [h('span', { text: 'inner' }), ['deep']],
    );
    expect(el).toBeInstanceOf(HTMLButtonElement);
    expect(el.getAttribute('class')).toBe('a b');
    expect(el.dataset['taskId']).toBe('t1');
    expect(el.getAttribute('data-index')).toBe('3');
    expect(el.getAttribute('type')).toBe('button');
    expect(el.getAttribute('aria-pressed')).toBe('');
    expect(el.getAttribute('tabindex')).toBe('0');
    expect(el.hasAttribute('hidden')).toBe(false);
    expect(el.hasAttribute('title')).toBe(false);
    expect(el.textContent).toBe('x7innerdeep');
    expect(el.querySelector('span')?.textContent).toBe('inner');
    el.dispatchEvent(new MouseEvent('click'));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(key).toHaveBeenCalledTimes(1);
  });

  it('accepts a class string, text before children, and no props', () => {
    const el = h('div', { class: 'gantt-row', text: 'label' }, h('i'));
    expect(el.className).toBe('gantt-row');
    expect(el.textContent).toBe('label');
    expect(el.lastChild?.nodeName).toBe('I');
    expect(h('p').outerHTML).toBe('<p></p>');
    expect(h('p', null, 'a').textContent).toBe('a');
    expect(h('p', { class: '' }).hasAttribute('class')).toBe(false);
    expect(h('p', { on: { click: undefined } }).outerHTML).toBe('<p></p>');
  });

  it('builds SVG elements in the SVG namespace', () => {
    const g = s(
      'g',
      { class: 'gantt-bars-layer', 'data-task-id': 't1' },
      s('rect', { x: 1, width: 10, rx: null }),
      'txt',
    );
    expect(g.namespaceURI).toBe(SVG_NS);
    expect(g.getAttribute('class')).toBe('gantt-bars-layer');
    expect(g.getAttribute('data-task-id')).toBe('t1');
    const rect = g.firstElementChild!;
    expect(rect.namespaceURI).toBe(SVG_NS);
    expect(rect.tagName).toBe('rect');
    expect(rect.getAttribute('x')).toBe('1');
    expect(rect.hasAttribute('rx')).toBe(false);
    expect(g.textContent).toBe('txt');
    expect(s('svg').childNodes).toHaveLength(0);
    expect(s('svg', null).namespaceURI).toBe(SVG_NS);
  });

  it('refuses style and inline event-handler attributes (CSP)', () => {
    expect(() => h('div', { attrs: { style: 'color:red' } })).toThrow(TypeError);
    expect(() => h('div', { attrs: { onclick: 'x()' } })).toThrow(TypeError);
    expect(() => s('rect', { STYLE: 'fill:red' })).toThrow(TypeError);
    expect(() => s('rect', { onload: 'x()' })).toThrow(TypeError);
    expect(() => s('rect', { opacity: 0.5, offset: 1, o: 1 })).not.toThrow();
  });

  it('never uses innerHTML', () => {
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')!;
    const set = vi.fn();
    Object.defineProperty(Element.prototype, 'innerHTML', { ...desc, set });
    try {
      h('div', { class: 'a', text: 't', attrs: { id: 'x' } }, h('span', null, 'b'), s('svg', null, s('g')));
      expect(set).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(Element.prototype, 'innerHTML', desc);
    }
  });

  it('starts the patch cache in sync with the built attributes and text', () => {
    const el = h('div', { attrs: { id: 'x' }, text: 'hi' });
    const setAttribute = vi.spyOn(el, 'setAttribute');
    setAttr(el, 'id', 'x');
    expect(setAttribute).not.toHaveBeenCalled();
    setText(el, 'hi');
    expect(el.textContent).toBe('hi');
  });
});

describe('patch helpers', () => {
  it('setAttr writes, removes and skips unchanged values', () => {
    const el = document.createElement('div');
    const setAttribute = vi.spyOn(el, 'setAttribute');
    const removeAttribute = vi.spyOn(el, 'removeAttribute');
    setAttr(el, 'x', 1);
    setAttr(el, 'x', 1);
    expect(setAttribute).toHaveBeenCalledTimes(1);
    expect(el.getAttribute('x')).toBe('1');
    setAttr(el, 'x', '2');
    expect(el.getAttribute('x')).toBe('2');
    setAttr(el, 'x', true);
    expect(el.getAttribute('x')).toBe('');
    setAttr(el, 'x', false);
    expect(el.hasAttribute('x')).toBe(false);
    setAttr(el, 'x', undefined); // false / undefined / null are the same "absent" value
    setAttr(el, 'x', null);
    expect(removeAttribute).toHaveBeenCalledTimes(1);
    setAttr(el, 'x', 3);
    setAttr(el, 'x', '3'); // numbers and their strings are the same attribute value
    expect(setAttribute).toHaveBeenCalledTimes(4);
  });

  it('the first write of a value always reaches the DOM', () => {
    const el = document.createElement('div');
    el.setAttribute('x', 'raw');
    el.classList.add('on');
    el.style.setProperty('color', 'red');
    setAttr(el, 'x', null);
    toggleClass(el, 'on', false);
    setStyleProp(el, 'color', null);
    expect(el.hasAttribute('x')).toBe(false);
    expect(el.classList.contains('on')).toBe(false);
    expect(el.style.getPropertyValue('color')).toBe('');
  });

  it('only writes: nothing is read back from the DOM', () => {
    // A write-only stand-in: any read (getAttribute, classList.contains, getPropertyValue,
    // textContent getter, …) would throw or return undefined and fail the expectations.
    const log: string[] = [];
    const fake = {
      setAttribute: (n: string, v: string) => log.push(`set ${n}=${v}`),
      removeAttribute: (n: string) => log.push(`rm ${n}`),
      classList: { toggle: (c: string, on: boolean) => log.push(`class ${c}=${on}`) },
      style: {
        setProperty: (p: string, v: string) => log.push(`style ${p}=${v}`),
        removeProperty: (p: string) => log.push(`unstyle ${p}`),
      },
      set textContent(v: string) {
        log.push(`text ${v}`);
      },
    } as unknown as HTMLElement;
    setAttr(fake, 'x', 1);
    setAttr(fake, 'x', '1');
    setAttr(fake, 'x', null);
    toggleClass(fake, 'c', true);
    setStyleProp(fake, 'fill', 'red');
    setStyleProp(fake, 'fill', 'red');
    setText(fake, 't');
    expect(log).toEqual(['set x=1', 'rm x', 'class c=true', 'style fill=red', 'text t']);
  });

  it('refuses style and on* attributes', () => {
    const el = document.createElement('div');
    expect(() => setAttr(el, 'style', 'color:red')).toThrow(TypeError);
    expect(() => setAttr(el, 'onClick', 'x()')).toThrow(TypeError);
    expect(el.hasAttribute('style')).toBe(false);
  });

  it('setStyleProp goes through style.setProperty / removeProperty and skips unchanged values', () => {
    const el = s('rect');
    const setProperty = vi.spyOn(el.style, 'setProperty');
    const removeProperty = vi.spyOn(el.style, 'removeProperty');
    setStyleProp(el, 'fill', 'var(--gantt-bar)');
    setStyleProp(el, 'fill', 'var(--gantt-bar)');
    expect(setProperty).toHaveBeenCalledTimes(1);
    expect(el.style.getPropertyValue('fill')).toBe('var(--gantt-bar)');
    setStyleProp(el, 'stroke-width', 2);
    expect(el.style.getPropertyValue('stroke-width')).toBe('2');
    setStyleProp(el, '--gantt-x', '#fff');
    expect(el.style.getPropertyValue('--gantt-x')).toBe('#fff');
    setStyleProp(el, 'fill', null);
    setStyleProp(el, 'fill', undefined);
    expect(removeProperty).toHaveBeenCalledTimes(1);
    expect(el.style.getPropertyValue('fill')).toBe('');
    expect(el.hasAttribute('style') ? el.getAttribute('style') : '').not.toContain('fill');
  });

  it('setStyleProp rejects values that smuggle declarations', () => {
    const el = document.createElement('div');
    setStyleProp(el, 'fill', 'red;x:y');
    expect(el.style.getPropertyValue('fill')).toBe('');
    expect(el.style.getPropertyValue('x')).toBe('');
    setStyleProp(el, 'fill', 'blue');
    setStyleProp(el, 'fill', 'red;background:url(x)');
    expect(el.style.getPropertyValue('fill')).toBe('');
    expect(el.style.getPropertyValue('background')).toBe('');
    setStyleProp(el, 'color', 'red} body{color:blue');
    expect(el.style.getPropertyValue('color')).toBe('');
  });

  it('setText and toggleClass skip unchanged values', () => {
    const el = document.createElement('span');
    const text = new Text('a');
    const add = vi.spyOn(el.classList, 'toggle');
    setText(el, 'a');
    setText(el, 'a');
    setText(text, 5);
    expect(el.textContent).toBe('a');
    expect(text.data).toBe('5');
    toggleClass(el, 'sel', true);
    toggleClass(el, 'sel', true);
    expect(add).toHaveBeenCalledTimes(1);
    expect(el.className).toBe('sel');
    toggleClass(el, 'sel', false);
    expect(el.className).toBe('');
  });

  it('forgetPatches makes the next write reach the DOM again', () => {
    const el = document.createElement('div');
    setText(el, 'a');
    el.textContent = 'changed behind the cache';
    setText(el, 'a');
    expect(el.textContent).toBe('changed behind the cache');
    forgetPatches(el);
    setText(el, 'a');
    expect(el.textContent).toBe('a');
  });
});

interface Item {
  k: string;
  v?: number;
}

function keyedRender(
  parent: Element,
  items: readonly Item[],
  anchor: Node | null = null,
  release?: (el: Element) => void,
) {
  const create = vi.fn((it: Item) => h('div', { attrs: { 'data-k': it.k } }));
  const update = vi.fn((el: Element, it: Item, i: number) => setAttr(el, 'data-i', `${i}:${it.v ?? 0}`));
  const map = reconcile(parent, items, it => it.k, create, update, anchor, release);
  return { map, create, update };
}

const list = (...keys: string[]): Item[] => keys.map(k => ({ k }));

describe('reconcile()', () => {
  it('renders in order and returns the elements by key', () => {
    const parent = h('div');
    const { map, create, update } = keyedRender(parent, list('a', 'b', 'c'));
    expect(ids(parent)).toEqual(['a', 'b', 'c']);
    expect([...map.keys()]).toEqual(['a', 'b', 'c']);
    expect(map.get('b')).toBe(parent.children[1]);
    expect(create).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenCalledTimes(3);
    expect(parent.children[2].getAttribute('data-i')).toBe('2:0');
  });

  it('keeps node identity across reorders', () => {
    const parent = h('div');
    const first = keyedRender(parent, list('a', 'b', 'c', 'd', 'e')).map;
    const { map, create } = keyedRender(parent, list('e', 'c', 'a', 'd', 'b'));
    expect(ids(parent)).toEqual(['e', 'c', 'a', 'd', 'b']);
    expect(create).not.toHaveBeenCalled();
    for (const k of 'abcde') expect(map.get(k)).toBe(first.get(k));
  });

  it('does no DOM moves when the order is unchanged (fast path), and updates every element', () => {
    const parent = h('div');
    keyedRender(parent, list('a', 'b', 'c'));
    const insert = vi.spyOn(parent, 'insertBefore');
    const { update } = keyedRender(parent, [{ k: 'a' }, { k: 'b', v: 9 }, { k: 'c' }]);
    expect(insert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(3);
    expect(parent.children[1].getAttribute('data-i')).toBe('1:9');
  });

  it('moves only what left its order', () => {
    const parent = h('div');
    keyedRender(parent, list('a', 'b', 'c', 'd', 'e'));
    const insert = vi.spyOn(parent, 'insertBefore');
    keyedRender(parent, list('e', 'a', 'b', 'c', 'd'));
    expect(ids(parent)).toEqual(['e', 'a', 'b', 'c', 'd']);
    expect(insert).toHaveBeenCalledTimes(1);
    insert.mockClear();
    keyedRender(parent, list('e', 'b', 'c', 'a', 'd'));
    expect(ids(parent)).toEqual(['e', 'b', 'c', 'a', 'd']);
    expect(insert).toHaveBeenCalledTimes(1);
    insert.mockClear();
    keyedRender(parent, list('e', 'b', 'c', 'a', 'd', 'f'));
    expect(insert).toHaveBeenCalledTimes(1);
    expect(ids(parent)).toEqual(['e', 'b', 'c', 'a', 'd', 'f']);
  });

  it('removes stale keys, or hands them to release', () => {
    const parent = h('div');
    const first = keyedRender(parent, list('a', 'b', 'c', 'd')).map;
    const remove = vi.spyOn(Element.prototype, 'remove');
    keyedRender(parent, list('a', 'c'));
    expect(ids(parent)).toEqual(['a', 'c']);
    expect(remove).toHaveBeenCalledTimes(2);
    const release = vi.fn((el: Element) => el.remove());
    keyedRender(parent, list('c'), null, release);
    expect(release).toHaveBeenCalledWith(first.get('a'));
    expect(ids(parent)).toEqual(['c']);
    keyedRender(parent, []);
    expect(parent.children).toHaveLength(0);
  });

  it('renders before the anchor and leaves static siblings alone', () => {
    const before = h('header', { attrs: { 'data-k': 'H' } });
    const anchor = h('footer', { attrs: { 'data-k': 'F' } });
    const parent = h('div', null, before, anchor);
    keyedRender(parent, list('a', 'b'), anchor);
    expect(ids(parent)).toEqual(['H', 'a', 'b', 'F']);
    keyedRender(parent, list('b', 'c', 'a'), anchor);
    expect(ids(parent)).toEqual(['H', 'b', 'c', 'a', 'F']);
    keyedRender(parent, list('x'), anchor);
    expect(ids(parent)).toEqual(['H', 'x', 'F']);
  });

  it('throws on duplicate keys', () => {
    expect(() => keyedRender(h('div'), list('a', 'a'))).toThrow(/duplicate key "a"/);
  });

  it('moves with moveBefore when the parent has it and is connected, insertBefore otherwise', () => {
    const parent = h('div');
    document.body.appendChild(parent);
    const moveBefore = vi.fn((node: Node, ref: Node | null) => {
      parent.insertBefore(node, ref);
    });
    Object.defineProperty(parent, 'moveBefore', { value: moveBefore, configurable: true });
    keyedRender(parent, list('a', 'b'));
    expect(moveBefore).not.toHaveBeenCalled(); // new nodes are inserted, not moved
    keyedRender(parent, list('b', 'a', 'c'));
    expect(ids(parent)).toEqual(['b', 'a', 'c']);
    expect(moveBefore).toHaveBeenCalledTimes(1);

    moveBefore.mockImplementation(() => {
      throw new DOMException('nope', 'HierarchyRequestError');
    });
    keyedRender(parent, list('c', 'b', 'a'));
    expect(ids(parent)).toEqual(['c', 'b', 'a']);

    const detached = h('div');
    const detachedMove = vi.fn();
    Object.defineProperty(detached, 'moveBefore', { value: detachedMove });
    keyedRender(detached, list('a', 'b'));
    keyedRender(detached, list('b', 'a'));
    expect(detachedMove).not.toHaveBeenCalled();
    expect(ids(detached)).toEqual(['b', 'a']);
  });

  it('matches the item order for random edits (property check)', () => {
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const parent = h('div');
    let previous = new Map<string, Element>();
    for (let round = 0; round < 200; round++) {
      const pool = Array.from({ length: 30 }, (_, i) => `k${i}`);
      const keys: string[] = [];
      const len = rand(20);
      while (keys.length < len) {
        const k = pool.splice(rand(pool.length), 1)[0];
        keys.push(k);
      }
      const { map } = keyedRender(parent, list(...keys));
      expect(ids(parent)).toEqual(keys);
      expect(parent.children).toHaveLength(keys.length);
      // identity: a key present in two consecutive rounds keeps its element
      for (const [k, el] of map) if (previous.has(k)) expect(el).toBe(previous.get(k));
      previous = map;
    }
  });
});

describe('createPool()', () => {
  it('reuses released elements up to max, detaching them', () => {
    const create = vi.fn(() => h('div'));
    const pool = createPool(create, 1);
    const parent = h('div');
    const a = pool.acquire();
    const b = pool.acquire();
    parent.append(a, b);
    pool.release(a);
    pool.release(b);
    expect(a.isConnected || a.parentNode).toBeFalsy();
    expect(b.parentNode).toBeNull();
    expect(pool.size()).toBe(1);
    expect(pool.acquire()).toBe(a);
    expect(create).toHaveBeenCalledTimes(2);
    pool.release(b);
    pool.clear();
    expect(pool.size()).toBe(0);
    pool.acquire();
    expect(create).toHaveBeenCalledTimes(3);
  });
});
