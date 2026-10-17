// The Custom Elements Manifest (Gantry 2 phase 6, step 5.2). `custom-elements.json` is generated
// from the JSDoc of `gantry.element.ts` (`pnpm cem`; `pnpm cem:check` fails in CI when it is
// stale). These tests hold it to the element's own tables: attributes = `observedAttributes`,
// properties and methods = the public accessors and methods, events = `GANTRY_EVENTS`, parts and
// custom states = what the element renders and sets, CSS properties = `themeToCss()` tokens with
// the light theme's values as defaults.
import { readFileSync } from 'node:fs';
import { describe, it, expect, afterEach } from 'vitest';
import { LightTheme, themeToCss, type GanttTask } from '@gantry/core';
import { GantryElement } from '../gantry.element';
import { getEngine } from '../engine/registry';
import { OBSERVED_ATTRIBUTES, PROPERTY_TABLE, propertyOfAttribute, VIEW_MODE_ATTR } from '../engine/props';
import { GANTRY_EVENTS, GANTRY_PROPERTIES } from '../types';

interface Doc {
  name: string;
  description?: string;
}
interface Member extends Doc {
  kind: 'field' | 'method';
  readonly?: boolean;
  attribute?: string;
  static?: boolean;
}
interface ClassDoc extends Doc {
  kind: string;
  customElement?: boolean;
  tagName?: string;
  members: Member[];
  attributes: (Doc & { fieldName?: string })[];
  events: (Doc & { type?: { text: string } })[];
  cssParts: Doc[];
  cssProperties: (Doc & { default?: string })[];
  cssStates: Doc[];
}
interface Manifest {
  schemaVersion: string;
  modules: {
    path: string;
    declarations: ClassDoc[];
    exports: { kind: string; name: string; declaration: { name: string; module: string } }[];
  }[];
}

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const manifest = JSON.parse(read('../../custom-elements.json')) as Manifest;
const pkg = JSON.parse(read('../../package.json')) as { customElements?: string; files?: string[] };
const [mod] = manifest.modules;
const element = mod.declarations.find(d => d.tagName === 'gantry-element')!;
const names = (docs: readonly Doc[]) => docs.map(d => d.name);

/** Lifecycle callbacks: on the prototype, not in the manifest. */
const LIFECYCLE = [
  'connectedCallback',
  'disconnectedCallback',
  'connectedMoveCallback',
  'adoptedCallback',
  'attributeChangedCallback',
];

/** The element's public prototype API: accessors and methods. */
function prototypeApi() {
  const descriptors = Object.entries(Object.getOwnPropertyDescriptors(GantryElement.prototype));
  return {
    accessors: descriptors.filter(([, d]) => d.get).map(([name]) => name),
    methods: descriptors
      .filter(([name, d]) => typeof d.value === 'function' && name !== 'constructor' && !LIFECYCLE.includes(name))
      .map(([name]) => name),
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('custom-elements.json', () => {
  it('is the package manifest and describes <gantry-element> in the published bundle', () => {
    expect(pkg.customElements).toBe('custom-elements.json');
    expect(pkg.files).toContain('custom-elements.json');
    expect(manifest.modules).toHaveLength(1);
    expect(mod.path).toBe('dist/index.js');
    expect(element).toMatchObject({ kind: 'class', name: 'GantryElement', customElement: true });
    expect(element.description).toBeTruthy();
    expect(mod.exports).toEqual([
      { kind: 'js', name: 'GantryElement', declaration: { name: 'GantryElement', module: 'dist/index.js' } },
      {
        kind: 'custom-element-definition',
        name: 'gantry-element',
        declaration: { name: 'GantryElement', module: 'dist/index.js' },
      },
    ]);
  });

  it('lists the observed attributes, each linked to its property', () => {
    expect(names(element.attributes)).toEqual([...OBSERVED_ATTRIBUTES]);
    expect(names(element.attributes)).toEqual([...GantryElement.observedAttributes]);
    expect(element.attributes).toHaveLength(7);
    for (const attr of element.attributes) {
      expect(attr.description, attr.name).toBeTruthy();
      expect(attr.fieldName, attr.name).toBe(
        attr.name === VIEW_MODE_ATTR ? undefined : propertyOfAttribute(attr.name)?.name,
      );
    }
  });

  it('lists the public properties: the settable ones and the read-only viewMode, view and criticalIds', () => {
    const fields = element.members.filter(m => m.kind === 'field');
    expect(names(fields)).toEqual(expect.arrayContaining([...GANTRY_PROPERTIES]));
    expect(names(fields).sort()).toEqual(prototypeApi().accessors.sort());
    expect(
      fields
        .filter(f => f.readonly)
        .map(f => f.name)
        .sort(),
    ).toEqual(['criticalIds', 'view', 'viewMode']);
    for (const spec of PROPERTY_TABLE) {
      const field = fields.find(f => f.name === spec.name)!;
      expect(field.readonly, spec.name).toBeUndefined();
      expect(field.attribute, spec.name).toBe('attr' in spec ? spec.attr : undefined);
    }
  });

  it('lists the public methods and nothing private', () => {
    const methods = element.members.filter(m => m.kind === 'method');
    expect(names(methods).sort()).toEqual(prototypeApi().methods.sort());
    expect(methods).toHaveLength(24);
    for (const member of element.members) {
      expect(member.name.startsWith('#'), member.name).toBe(false);
      expect(member.static, member.name).toBeUndefined();
    }
  });

  it('lists the events of GANTRY_EVENTS with their detail types', () => {
    expect(names(element.events)).toEqual(Object.keys(GANTRY_EVENTS));
    for (const event of element.events) {
      expect(event.description, event.name).toBeTruthy();
      expect(event.type?.text, event.name).toMatch(/^CustomEvent<.+>$/);
    }
  });

  it('lists the five CSS parts the shadow tree exposes', () => {
    expect(names(element.cssParts)).toEqual(['wrapper', 'toolbar', 'panel', 'splitter', 'timeline']);
    const el = document.createElement('gantry-element');
    const task: GanttTask = { id: 'a', name: 'A', start: new Date(2026, 2, 2), end: new Date(2026, 2, 6), progress: 0 };
    el.tasks = [task];
    document.body.appendChild(el);
    getEngine(el).flushSync();
    const rendered = [...el.shadowRoot!.querySelectorAll('[part]')].map(node => node.getAttribute('part'));
    expect(rendered.sort()).toEqual(names(element.cssParts).sort());
    for (const part of element.cssParts) expect(part.description, part.name).toBeTruthy();
  });

  it('lists the three custom states', () => {
    expect(names(element.cssStates)).toEqual(['dark', 'dragging', 'loading']);
    for (const state of element.cssStates) expect(state.description, state.name).toBeTruthy();
  });

  it('lists every themeToCss() token as a CSS property, in order, with the light theme as default', () => {
    const tokens = themeToCss(LightTheme);
    expect(element.cssProperties).toHaveLength(40);
    expect(element.cssProperties.map(p => [p.name, p.default])).toEqual(tokens.map(([name, value]) => [name, value]));
    for (const prop of element.cssProperties) expect(prop.description, prop.name).toBeTruthy();
  });

  it('takes the CSS properties from the @cssprop JSDoc, which matches themeToCss() without regenerating', () => {
    const source = read('../gantry.element.ts');
    const jsdoc = [...source.matchAll(/@cssprop \[(--[\w-]+)=([^\]]*)\]/g)].map(([, name, value]) => [name, value]);
    expect(jsdoc).toEqual(themeToCss(LightTheme).map(([name, value]) => [name, value]));
  });
});
