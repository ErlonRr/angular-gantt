/**
 * The `<gantry-element>` API, read from the Custom Elements Manifest the Web Component ships
 * (`@gantryjs/vanilla/custom-elements.json`, checked in CI), so the site's API page never drifts
 * from the code. Option fields are documented in the README "Configuration" section.
 */

import manifest from '@gantryjs/vanilla/custom-elements.json' with { type: 'json' };

export interface ApiProperty {
  name: string;
  type: string;
  description: string;
  /** The reflected HTML attribute, if any (`dark-mode`). */
  attribute?: string;
  readonly: boolean;
}
export interface ApiMethod {
  name: string;
  /** `setViewMode(mode: string): void` */
  signature: string;
  description: string;
}
export interface ApiEvent {
  name: string;
  /** Type of `event.detail`. */
  detail: string;
  description: string;
}
export interface ApiNamed {
  name: string;
  description: string;
  default?: string;
}
export interface ApiModel {
  tagName: string;
  description: string;
  properties: ApiProperty[];
  methods: ApiMethod[];
  events: ApiEvent[];
  cssProperties: ApiNamed[];
  cssParts: ApiNamed[];
  cssStates: ApiNamed[];
}

interface CemType {
  text?: string;
}
interface CemMember {
  kind: string;
  name: string;
  type?: CemType;
  description?: string;
  readonly?: boolean;
  static?: boolean;
  privacy?: string;
  parameters?: { name: string; type?: CemType; optional?: boolean; default?: string }[];
  return?: { type?: CemType };
}
interface CemDeclaration {
  customElement?: boolean;
  tagName?: string;
  description?: string;
  members?: CemMember[];
  attributes?: { name: string; fieldName?: string }[];
  events?: { name: string; type?: CemType; description?: string }[];
  cssProperties?: { name: string; description?: string; default?: string }[];
  cssParts?: { name: string; description?: string }[];
  cssStates?: { name: string; description?: string }[];
}

const detailOf = (type: string | undefined) => type?.match(/^CustomEvent<(.+)>$/)?.[1] ?? type ?? 'unknown';

/** `name?: type` — a parameter with a default is optional; its type falls back to the default's. */
function parameter(p: NonNullable<CemMember['parameters']>[number]): string {
  const fromDefault =
    p.default === undefined
      ? undefined
      : /^(true|false)$/.test(p.default)
        ? 'boolean'
        : /^-?\d/.test(p.default)
          ? 'number'
          : /^['"`]/.test(p.default)
            ? 'string'
            : undefined;
  const optional = p.optional === true || p.default !== undefined;
  return `${p.name}${optional ? '?' : ''}: ${p.type?.text ?? fromDefault ?? 'unknown'}`;
}

function fromManifest(declarations: CemDeclaration[]): ApiModel {
  const el = declarations.find(d => d.customElement && d.tagName === 'gantry-element');
  if (!el) throw new Error('custom-elements.json has no <gantry-element>');
  const attributes = new Map((el.attributes ?? []).map(a => [a.fieldName ?? '', a.name]));
  const members = (el.members ?? []).filter(m => !m.static && (m.privacy ?? 'public') === 'public');
  const named = (list: { name: string; description?: string; default?: string }[] | undefined): ApiNamed[] =>
    (list ?? []).map(x => ({
      name: x.name,
      description: x.description ?? '',
      ...(x.default !== undefined && { default: x.default }),
    }));
  return {
    tagName: el.tagName ?? 'gantry-element',
    description: el.description ?? '',
    properties: members
      .filter(m => m.kind === 'field')
      .map(m => ({
        name: m.name,
        type: m.type?.text ?? 'unknown',
        description: m.description ?? '',
        readonly: m.readonly === true,
        ...(attributes.has(m.name) && { attribute: attributes.get(m.name) }),
      })),
    methods: members
      .filter(m => m.kind === 'method')
      .map(m => ({
        name: m.name,
        signature: `${m.name}(${(m.parameters ?? []).map(parameter).join(', ')}): ${m.return?.type?.text ?? 'void'}`,
        description: m.description ?? '',
      })),
    events: (el.events ?? []).map(e => ({
      name: e.name,
      detail: detailOf(e.type?.text),
      description: e.description ?? '',
    })),
    cssProperties: named(el.cssProperties),
    cssParts: named(el.cssParts),
    cssStates: named(el.cssStates),
  };
}

export const GANTRY_API: ApiModel = fromManifest(
  (manifest as { modules: { declarations?: CemDeclaration[] }[] }).modules.flatMap(m => m.declarations ?? []),
);
