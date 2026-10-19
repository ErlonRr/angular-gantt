// Phase 10 surface of the Vue binding: the `empty` named slot. `<template #empty>…</template>` is
// rendered as `<div slot="empty">…</div>` in the element's light DOM (the element's empty-state
// slot), before the default slot, which still takes a `<div slot="empty">` of its own. On the
// server too, and hydrated without warnings.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createApp, createSSRApp, defineComponent, h, nextTick, ref, type App, type Component, type VNode } from 'vue';
import { renderToString } from 'vue/server-renderer';
import type { GantryElement } from '@gantryjs/vanilla';
import { Gantry } from '../index';

const apps: App[] = [];

/** Mounts `root` into a connected host; the element is the one `<Gantry>` renders. */
function mount(root: Component) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(root);
  apps.push(app);
  app.mount(host);
  return { app, host, el: host.querySelector('gantry-element') as GantryElement };
}

/** A consumer template (compiled at runtime, as an SFC template would be) */
const template = (source: string, setup: () => Record<string, unknown> = () => ({})) =>
  defineComponent({ components: { Gantry }, setup, template: source });

/** The element's light DOM, without Vue's anchor comments */
const light = (el: Element) => el.innerHTML.replace(/<!--[^>]*-->/g, '');

afterEach(() => {
  for (const app of apps.splice(0)) app.unmount();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('#empty slot', () => {
  it('renders <template #empty> in a <div slot="empty"> inside the element, kept up to date', async () => {
    const text = ref('Nothing planned yet');
    const { el } = mount(
      template('<Gantry :tasks="[]"><template #empty>{{ text }}</template></Gantry>', () => ({ text })),
    );
    const empty = el.querySelector(':scope > div[slot="empty"]');
    expect(empty?.textContent).toBe('Nothing planned yet');
    expect(el.children).toHaveLength(1);

    text.value = 'Add a task to start';
    await nextTick();
    expect(el.querySelector(':scope > div[slot="empty"]')).toBe(empty);
    expect(empty?.textContent).toBe('Add a task to start');
  });

  it('keeps the slot content as it is: elements, listeners, several nodes', () => {
    const add = vi.fn();
    const { el } = mount(
      template(
        `<Gantry :tasks="[]">
          <template #empty>No tasks yet: <button type="button" @click="add">add one</button> to start.</template>
        </Gantry>`,
        () => ({ add }),
      ),
    );
    expect(light(el)).toBe('<div slot="empty">No tasks yet: <button type="button">add one</button> to start.</div>');
    el.querySelector('button')!.click();
    expect(add).toHaveBeenCalledOnce();
  });

  it('renders the empty slot first, then the default slot', () => {
    const { el } = mount(
      template(`<Gantry :tasks="[]">
        <template #empty>Nothing planned yet</template>
        <span class="note">Plan</span>
      </Gantry>`),
    );
    expect(light(el)).toBe('<div slot="empty">Nothing planned yet</div><span class="note">Plan</span>');
  });

  it('adds and removes the slot element with the slot (v-if on the template), keeping the other children', async () => {
    // (a <div> first in the default slot: the slot element must not take its place)
    const shown = ref(false);
    const { el } = mount(
      template(
        `<Gantry :tasks="[]">
          <template v-if="shown" #empty>Nothing planned yet</template>
          <div class="note">Plan</div>
        </Gantry>`,
        () => ({ shown }),
      ),
    );
    const note = el.querySelector(':scope > .note');
    expect(light(el)).toBe('<div class="note">Plan</div>');

    shown.value = true;
    await nextTick();
    expect(light(el)).toBe('<div slot="empty">Nothing planned yet</div><div class="note">Plan</div>');
    expect(el.querySelector(':scope > .note')).toBe(note);

    shown.value = false;
    await nextTick();
    expect(el.querySelector('[slot="empty"]')).toBeNull();
    expect(el.querySelector(':scope > .note')).toBe(note);
  });

  it('still renders a <div slot="empty"> written in the default slot', () => {
    const { el } = mount(template('<Gantry :tasks="[]"><div slot="empty">Nothing planned yet</div></Gantry>'));
    expect(light(el)).toBe('<div slot="empty">Nothing planned yet</div>');
  });

  it('maps an `empty` slot passed to h() (what the template compiles to)', () => {
    const { el } = mount({ render: (): VNode => h(Gantry, { tasks: [] }, { empty: () => ['Nothing planned yet'] }) });
    expect(light(el)).toBe('<div slot="empty">Nothing planned yet</div>');
  });

  it('renders no child without slots', () => {
    expect(mount({ render: () => h(Gantry) }).el.childNodes).toHaveLength(0);
  });

  it('renders the slot on the server and hydrates it without warnings', async () => {
    const root = template(`<Gantry class="chart" :tasks="[]"><template #empty>Nothing planned yet</template></Gantry>`);
    const html = await renderToString(createSSRApp(root));
    expect(html).toBe('<gantry-element class="chart"><div slot="empty">Nothing planned yet</div></gantry-element>');

    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.append(host);
    const server = host.querySelector('gantry-element') as GantryElement;
    const empty = server.firstElementChild;
    const warn = vi.fn();
    const app = createSSRApp(root);
    app.config.warnHandler = warn;
    apps.push(app);
    app.mount(host);

    expect(host.querySelector('gantry-element')).toBe(server);
    expect(server.firstElementChild).toBe(empty);
    expect(warn).not.toHaveBeenCalled();
  });
});
