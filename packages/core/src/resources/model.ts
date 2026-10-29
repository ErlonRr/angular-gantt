// ─────────────────────────────────────────────────────────────
//  gantry · resources/model.ts
//  The resource model (Phase 14, D3): an index over the `resources`
//  property, the assignments of a task as the load reads them, and
//  their text (`Ana, Bo 50%`) for the Resources cell. Pure: no DOM.
// ─────────────────────────────────────────────────────────────

import { ParseError } from '../editing/parse';
import { round2 } from '../calendar/time';
import type { GanttAssignment, GanttResource, GanttTask } from '../types';

/** The resources by id, in the order given (the order of the resource rows). */
export interface ResourceIndex {
  readonly list: readonly GanttResource[];
  readonly byId: ReadonlyMap<string, GanttResource>;
}

/** An assignment as the load reads it: a known resource and the percent of a full-time person it takes. */
export interface TaskAssignment {
  resourceId: string;
  units: number;
}

/** Percent of one person's time a task takes per working day when `units` is left out. */
export const DEFAULT_ASSIGNMENT_UNITS = 100;
/** Percent of one person's time a resource has per working day when `capacity` is left out. */
export const DEFAULT_RESOURCE_CAPACITY = 100;

/** Tolerance when a load is compared with a capacity (percent). */
export const OVER_EPSILON = 1e-6;

/** Row ids of the resource view: the synthetic tasks `projectResourceRows` makes (never a real task id). */
export const UNASSIGNED_ROW_ID = 'unassigned';
export const resourceRowId = (resourceId: string): string => `res:${resourceId}`;
export const teamRowId = (group: string): string => `team:${group}`;

const EMPTY_INDEX: ResourceIndex = { list: [], byId: new Map() };

/**
 * The index of `resources`: the first resource of a duplicate id wins, and a resource without an id
 * (blank or not a string) is dropped.
 */
export function indexResources(resources: readonly GanttResource[] | undefined): ResourceIndex {
  const given: unknown = resources;
  if (!Array.isArray(given) || given.length === 0) return EMPTY_INDEX;
  const list: GanttResource[] = [];
  const byId = new Map<string, GanttResource>();
  for (const r of given as readonly (GanttResource | null | undefined)[]) {
    if (!r || typeof r.id !== 'string' || r.id.trim() === '' || byId.has(r.id)) continue;
    byId.set(r.id, r);
    list.push(r);
  }
  return list.length === 0 ? EMPTY_INDEX : { list, byId };
}

/** The percent of one person's time `r` has per working day: `capacity` when finite and above 0, else 100. */
export function resourceCapacity(r: Pick<GanttResource, 'capacity'>): number {
  const c = r.capacity;
  return typeof c === 'number' && Number.isFinite(c) && c > 0 ? c : DEFAULT_RESOURCE_CAPACITY;
}

/** The team a resource belongs to (`group`, trimmed) or `null`. */
export function resourceGroup(r: Pick<GanttResource, 'group'>): string | null {
  const g = typeof r.group === 'string' ? r.group.trim() : '';
  return g === '' ? null : g;
}

const unitsOf = (units: number | undefined): number =>
  typeof units === 'number' && Number.isFinite(units) && units > 0 ? units : DEFAULT_ASSIGNMENT_UNITS;

/**
 * The assignments of `task` that the load counts: known resource ids only, a duplicate of one id
 * keeps the first, `units` that is not finite and above 0 reads as 100.
 */
export function taskAssignments(task: Pick<GanttTask, 'resources'>, index: ResourceIndex): TaskAssignment[] {
  const list = task.resources;
  if (!Array.isArray(list) || list.length === 0 || index.list.length === 0) return [];
  const out: TaskAssignment[] = [];
  const seen = new Set<string>();
  for (const a of list) {
    const resourceId = typeof a === 'string' ? a : a && typeof a === 'object' ? a.resourceId : undefined;
    if (typeof resourceId !== 'string' || !index.byId.has(resourceId) || seen.has(resourceId)) continue;
    seen.add(resourceId);
    out.push({ resourceId, units: unitsOf(typeof a === 'string' ? undefined : a.units) });
  }
  return out;
}

/** What the text of an assignment calls a resource: its name, or its id when the name holds a separator. */
function labelOf(r: GanttResource): string {
  return /[,;]/.test(r.name) ? r.id : r.name;
}

/**
 * The assignments of `task` as text, the cell's seed: resource names joined by ", ", the units
 * after a name unless they are 100 — `Ana, Bo 50%`. Unknown ids are left out.
 */
export function formatAssignments(task: Pick<GanttTask, 'resources'>, index: ResourceIndex): string {
  return taskAssignments(task, index)
    .map(a => {
      const label = labelOf(index.byId.get(a.resourceId) as GanttResource);
      return a.units === DEFAULT_ASSIGNMENT_UNITS ? label : `${label} ${round2(a.units)}%`;
    })
    .join(', ');
}

const UNITS_RE = /^(.*?)\s*(\d+(?:\.\d+)?)\s*%$/s;

/** The resource a reference names: an id, else a name — case-insensitive, exact. */
function resolve(ref: string, index: ResourceIndex): GanttResource {
  const lower = ref.toLowerCase();
  const byId = index.list.filter(r => r.id.toLowerCase() === lower);
  if (byId.length === 1) return byId[0] as GanttResource;
  if (byId.length > 1) {
    const exact = byId.filter(r => r.id === ref);
    if (exact.length === 1) return exact[0] as GanttResource;
    throw new ParseError('ambiguous', ref);
  }
  const byName = index.list.filter(r => r.name.trim().toLowerCase() === lower);
  if (byName.length === 1) return byName[0] as GanttResource;
  throw new ParseError(byName.length > 1 ? 'ambiguous' : 'unknown', ref);
}

/**
 * The assignments a text names: `Ana, Bo 50%` (`,` or `;` between them, an id or a name — case-insensitive,
 * exact —, `N%` after it for the units, which are 100 when left out). An empty text is no assignment.
 * A duplicate of one resource keeps the first.
 *
 * @throws ParseError `unknown` (no such resource), `ambiguous` (several resources by that name) or `syntax`
 * (units that are not above 0, or a percentage without a resource)
 */
export function parseAssignments(text: string, index: ResourceIndex): GanttAssignment[] {
  const out: GanttAssignment[] = [];
  const seen = new Set<string>();
  for (const part of text.split(/[,;]/)) {
    const segment = part.trim();
    if (segment === '') continue;
    let ref = segment;
    let units = DEFAULT_ASSIGNMENT_UNITS;
    const m = UNITS_RE.exec(segment);
    if (m) {
      ref = (m[1] ?? '').trim();
      units = Number(m[2]);
      if (ref === '' || !Number.isFinite(units) || units <= 0) throw new ParseError('syntax', segment);
    }
    const resource = resolve(ref, index);
    if (seen.has(resource.id)) continue;
    seen.add(resource.id);
    out.push(units === DEFAULT_ASSIGNMENT_UNITS ? resource.id : { resourceId: resource.id, units });
  }
  return out;
}

/** Same resources, field by field (a new array with equal contents is not a change; `data` by identity). */
export function sameResources(
  a: readonly GanttResource[] | undefined,
  b: readonly GanttResource[] | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i] as GanttResource;
    return (
      x === y ||
      (x.id === y.id &&
        x.name === y.name &&
        x.capacity === y.capacity &&
        x.group === y.group &&
        x.color === y.color &&
        x.data === y.data)
    );
  });
}
