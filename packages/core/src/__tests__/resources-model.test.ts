// ─────────────────────────────────────────────────────────────
//  Tests — Phase 14 (step 1.2): the resource model. The index (first
//  of a duplicate id wins, blank ids dropped), the assignments as the
//  load reads them (unknown ids ignored, duplicates keep the first,
//  units default to 100), their text and the way back (`Ana, Bo 50%`),
//  and the `resources` cut-off.
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ASSIGNMENT_UNITS,
  DEFAULT_RESOURCE_CAPACITY,
  ParseError,
  formatAssignments,
  indexResources,
  parseAssignments,
  resourceCapacity,
  resourceGroup,
  sameResources,
  taskAssignments,
  type GanttAssignment,
  type GanttResource,
} from '../index';

const RES: GanttResource[] = [
  { id: 'ana', name: 'Ana Lopez' },
  { id: 'bo', name: 'Bo', capacity: 50, group: 'Eng' },
  { id: 'cy', name: 'Cy', group: ' Eng ' },
  { id: 'di', name: 'Smith, Di' },
  { id: 'ed', name: 'Ed' },
];
const INDEX = indexResources(RES);

/** The error a parse throws (the tests need its code and ref). */
const failure = (text: string, index = INDEX): ParseError => {
  try {
    parseAssignments(text, index);
  } catch (e) {
    if (e instanceof ParseError) return e;
    throw e;
  }
  throw new Error(`"${text}" parsed`);
};

describe('indexResources', () => {
  it('keeps the order, lets the first of a duplicate id win and drops blank ids', () => {
    const index = indexResources([
      { id: 'a', name: 'First' },
      { id: '', name: 'Blank' },
      { id: '  ', name: 'Spaces' },
      { id: 'a', name: 'Second' },
      { id: 'b', name: 'B' },
      null as unknown as GanttResource,
      { name: 'No id' } as unknown as GanttResource,
    ]);
    expect(index.list.map(r => r.name)).toEqual(['First', 'B']);
    expect(index.byId.get('a')?.name).toBe('First');
    expect(index.byId.size).toBe(2);
  });

  it('reads nothing as an empty index', () => {
    expect(indexResources(undefined).list).toEqual([]);
    expect(indexResources([]).byId.size).toBe(0);
    expect(indexResources('nope' as unknown as GanttResource[]).list).toEqual([]);
  });
});

describe('capacity and group', () => {
  it('reads a capacity that is finite and above 0, else 100', () => {
    expect(DEFAULT_RESOURCE_CAPACITY).toBe(100);
    expect(resourceCapacity({})).toBe(100);
    expect(resourceCapacity({ capacity: 50 })).toBe(50);
    expect(resourceCapacity({ capacity: 200 })).toBe(200);
    for (const bad of [0, -10, NaN, Infinity, '80' as unknown as number]) {
      expect(resourceCapacity({ capacity: bad }), String(bad)).toBe(100);
    }
  });

  it('trims the group and reads a blank one as none', () => {
    expect(resourceGroup({ group: ' Eng ' })).toBe('Eng');
    expect(resourceGroup({ group: '' })).toBeNull();
    expect(resourceGroup({ group: '   ' })).toBeNull();
    expect(resourceGroup({})).toBeNull();
  });
});

describe('taskAssignments', () => {
  it('reads ids and { resourceId, units }, with units 100 by default', () => {
    expect(DEFAULT_ASSIGNMENT_UNITS).toBe(100);
    expect(
      taskAssignments({ resources: ['ana', { resourceId: 'bo' }, { resourceId: 'cy', units: 25 }] }, INDEX),
    ).toEqual([
      { resourceId: 'ana', units: 100 },
      { resourceId: 'bo', units: 100 },
      { resourceId: 'cy', units: 25 },
    ]);
  });

  it('ignores unknown ids, keeps the first of a duplicate and repairs bad units', () => {
    const resources: GanttAssignment[] = [
      'ghost',
      { resourceId: 'ana', units: 50 },
      'ana',
      { resourceId: 'bo', units: 0 },
      { resourceId: 'cy', units: -5 },
      { resourceId: 'di', units: NaN },
      { resourceId: 'ed', units: Infinity },
      null as unknown as GanttAssignment,
      7 as unknown as GanttAssignment,
    ];
    expect(taskAssignments({ resources }, INDEX)).toEqual([
      { resourceId: 'ana', units: 50 },
      { resourceId: 'bo', units: 100 },
      { resourceId: 'cy', units: 100 },
      { resourceId: 'di', units: 100 },
      { resourceId: 'ed', units: 100 },
    ]);
  });

  it('is empty without assignments, without resources or when none is known', () => {
    expect(taskAssignments({}, INDEX)).toEqual([]);
    expect(taskAssignments({ resources: [] }, INDEX)).toEqual([]);
    expect(taskAssignments({ resources: ['ghost'] }, INDEX)).toEqual([]);
    expect(taskAssignments({ resources: ['ana'] }, indexResources(undefined))).toEqual([]);
  });
});

describe('formatAssignments', () => {
  it('names the resources, with the units after the name unless they are 100', () => {
    expect(formatAssignments({ resources: ['ana', { resourceId: 'bo', units: 50 }] }, INDEX)).toBe('Ana Lopez, Bo 50%');
    expect(formatAssignments({ resources: [{ resourceId: 'bo', units: 100 }] }, INDEX)).toBe('Bo');
    expect(formatAssignments({ resources: [{ resourceId: 'bo', units: 33.333 }] }, INDEX)).toBe('Bo 33.33%');
    expect(formatAssignments({}, INDEX)).toBe('');
    expect(formatAssignments({ resources: ['ghost', 'ed'] }, INDEX)).toBe('Ed');
  });

  it('uses the id of a resource whose name holds a separator', () => {
    expect(formatAssignments({ resources: ['di', 'ed'] }, INDEX)).toBe('di, Ed');
  });
});

describe('parseAssignments', () => {
  it('reads ids and names, case-insensitively, with `,` or `;` between them', () => {
    expect(parseAssignments('ana, BO; cy', INDEX)).toEqual(['ana', 'bo', 'cy']);
    expect(parseAssignments('  Ana Lopez  ,ED ', INDEX)).toEqual(['ana', 'ed']);
    expect(parseAssignments('ANA', INDEX)).toEqual(['ana']);
  });

  it('reads the units after `%`, and writes only the ones that are not 100', () => {
    expect(parseAssignments('Ana Lopez 50%, bo 100%, cy 12.5 %, ed75%', INDEX)).toEqual([
      { resourceId: 'ana', units: 50 },
      'bo',
      { resourceId: 'cy', units: 12.5 },
      { resourceId: 'ed', units: 75 },
    ]);
  });

  it('is empty for an empty text and skips empty segments', () => {
    expect(parseAssignments('', INDEX)).toEqual([]);
    expect(parseAssignments('   ', INDEX)).toEqual([]);
    expect(parseAssignments(' , ; ana ;;', INDEX)).toEqual(['ana']);
  });

  it('keeps the first of a resource named twice', () => {
    expect(parseAssignments('ana 50%, Ana Lopez', INDEX)).toEqual([{ resourceId: 'ana', units: 50 }]);
  });

  it('round-trips with formatAssignments, names with spaces included', () => {
    for (const resources of [
      [],
      ['ana'],
      ['ana', 'bo', 'cy'],
      [{ resourceId: 'ana', units: 20 }, 'ed'],
      [{ resourceId: 'bo', units: 12.5 }, { resourceId: 'di', units: 60 }, 'ana'],
    ] as GanttAssignment[][]) {
      const text = formatAssignments({ resources }, INDEX);
      const back = parseAssignments(text, INDEX);
      expect(taskAssignments({ resources: back }, INDEX), text).toEqual(taskAssignments({ resources }, INDEX));
      expect(formatAssignments({ resources: back }, INDEX), text).toBe(text);
    }
  });

  it('throws `unknown` for a reference that matches nothing, with the reference', () => {
    const e = failure('ana, ghost 50%');
    expect(e.code).toBe('unknown');
    expect(e.ref).toBe('ghost');
    expect(failure('Smith').code).toBe('unknown');
  });

  it('throws `ambiguous` when a name or an id matches several resources', () => {
    const twins = indexResources([
      { id: 'a1', name: 'Alex' },
      { id: 'a2', name: 'alex' },
      { id: 'A', name: 'Upper' },
      { id: 'a', name: 'Lower' },
    ]);
    expect(failure('ALEX', twins).code).toBe('ambiguous');
    expect(failure('ALEX', twins).ref).toBe('ALEX');
    // An id wins over a name; two ids that differ by case need the exact one
    expect(parseAssignments('a1', twins)).toEqual(['a1']);
    expect(parseAssignments('A', twins)).toEqual(['A']);
    expect(parseAssignments('a', twins)).toEqual(['a']);
    expect(failure('Ａ', twins).code).toBe('unknown');
    const clash = indexResources([
      { id: 'x1', name: 'Pat' },
      { id: 'x2', name: 'Pat' },
    ]);
    expect(failure('pat', clash).code).toBe('ambiguous');
    expect(parseAssignments('x2', clash)).toEqual(['x2']);
  });

  it('throws `syntax` for a percentage without a resource or units that are not above 0', () => {
    expect(failure('50%').code).toBe('syntax');
    expect(failure('ana, 20 %').code).toBe('syntax');
    expect(failure('ana 0%').code).toBe('syntax');
    expect(failure('ana 0.0%').ref).toBe('ana 0.0%');
  });
});

describe('sameResources', () => {
  it('compares the fields, not the array', () => {
    expect(sameResources(RES, RES)).toBe(true);
    expect(
      sameResources(
        RES,
        RES.map(r => ({ ...r })),
      ),
    ).toBe(true);
    expect(sameResources(undefined, undefined)).toBe(true);
    expect(sameResources([], [])).toBe(true);
  });

  it('sees a changed field, a changed length and a changed order', () => {
    expect(sameResources(RES, undefined)).toBe(false);
    expect(sameResources(undefined, RES)).toBe(false);
    expect(sameResources(RES, RES.slice(1))).toBe(false);
    expect(sameResources(RES, [...RES].reverse())).toBe(false);
    for (const change of [
      { name: 'Anna' },
      { capacity: 80 },
      { group: 'Ops' },
      { color: '#f00' },
      { data: { a: 1 } },
      { id: 'ana2' },
    ]) {
      expect(sameResources(RES, [{ ...RES[0], ...change }, ...RES.slice(1)]), JSON.stringify(change)).toBe(false);
    }
  });

  it('compares `data` by identity', () => {
    const data = { team: 'x' };
    expect(sameResources([{ id: 'a', name: 'A', data }], [{ id: 'a', name: 'A', data }])).toBe(true);
    expect(sameResources([{ id: 'a', name: 'A', data }], [{ id: 'a', name: 'A', data: { team: 'x' } }])).toBe(false);
  });
});
