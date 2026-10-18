// Task-list markup shared with the Web Component (Gantry 2 phase 7, step 1.2): every inner span has
// a class (the paint-snapshot keys of both bindings), text colours come from the stylesheet (only a
// task's `barColor` is an inline paint), the collapse target and the leaf indent are 24 px, the
// column resize handle lies inside its header cell. The test DOM neither resolves `var()` colours nor
// orders rules by specificity, so the declared values are read from the matching component rules
// (`cascaded`).
import { describe, it, expect } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { GantryComponent } from '../gantt-component/gantry.component';
import { TaskType, type GanttOptions, type GanttTask } from '@gantryjs/core';

const day = (d: number) => new Date(2026, 2, d);
const TASKS: GanttTask[] = [
  { id: 'g', name: 'Group', start: day(2), end: day(20) },
  { id: 'a', name: 'Alpha', start: day(2), end: day(9), parentId: 'g', progress: 100, barColor: '#0F766E' },
  { id: 'b', name: 'Beta', start: day(9), end: day(16), parentId: 'g', progress: 30 },
  { id: 'm', name: 'Launch', start: day(20), end: day(20), type: TaskType.Milestone },
];

@Component({
  imports: [GantryComponent],
  template: `<gantry [series]="tasks()" [options]="options()" />`,
})
class Host {
  readonly tasks = signal<GanttTask[]>(TASKS);
  readonly options = signal<GanttOptions>({
    initialScroll: false,
    indentSize: 16,
    panel: { columns: ['name', 'status', 'start'] },
  });
}

async function mount(): Promise<ComponentFixture<Host>> {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  return fixture;
}

const $$ = (f: ComponentFixture<Host>, sel: string) => [
  ...(f.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(sel),
];
const $ = (f: ComponentFixture<Host>, sel: string): HTMLElement => {
  const el = $$(f, sel)[0];
  if (!el) throw new Error(`no element for ${sel}`);
  return el;
};
const classes = (el: Element) => [...el.children].map(c => c.getAttribute('class') ?? '');
const nameCell = (f: ComponentFixture<Host>, id: string) => $(f, `.gantt-tl-row[data-task-id="${id}"] .gantt-tl-name`);
const part = (f: ComponentFixture<Host>, id: string, cls: string) => {
  const el = nameCell(f, id).querySelector<HTMLElement>(cls);
  if (!el) throw new Error(`no ${cls} in ${id}`);
  return el;
};

/** CSS specificity of one compound selector, as one comparable number. */
function specificity(sel: string): number {
  const ids = (sel.match(/#[\w-]+/g) ?? []).length;
  const cls = (sel.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length;
  const types = (sel.match(/(?:^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return ids * 10_000 + cls * 100 + types;
}

/** The value of `prop` the cascade gives `el`: its inline style, else the most specific (then last) document rule. */
function cascaded(el: HTMLElement, prop: string): string {
  const inline = el.style.getPropertyValue(prop);
  if (inline) return inline.trim();
  let best = { spec: -1, value: '' };
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (!(rule instanceof CSSStyleRule)) continue;
      const value = rule.style.getPropertyValue(prop);
      if (!value) continue;
      for (const sel of rule.selectorText.split(',')) {
        let hit = false;
        try {
          hit = el.matches(sel.trim());
        } catch {
          // a selector the test DOM cannot parse never matches here
        }
        const spec = specificity(sel.trim());
        if (hit && spec >= best.spec) best = { spec, value: value.trim() };
      }
    }
  }
  return best.value;
}

describe('task-list markup (shared with the Web Component)', () => {
  it('gives every inner span a class: header label, sort icon, name parts, cell texts', async () => {
    const f = await mount();
    expect($$(f, '.gantt-tasklist span:not([class])')).toEqual([]);

    const head = $$(f, '.gantt-tl-col-header');
    expect(head.map(classes)).toEqual([
      ['gantt-tl-ellipsis', 'gantt-tl-sort-icon', 'gantt-col-resize'],
      ['gantt-tl-ellipsis', 'gantt-tl-sort-icon', 'gantt-col-resize'],
      ['gantt-tl-ellipsis', 'gantt-tl-sort-icon', 'gantt-col-resize'],
    ]);
    expect(head[0]?.querySelector('.gantt-tl-sort-icon')?.getAttribute('aria-hidden')).toBe('true');

    // Name cells: toggle (group) or indent (leaf) · icon · text, inside span.gantt-tl-name
    expect(classes(nameCell(f, 'g'))).toEqual(['gantt-collapse-btn', 'gantt-tl-icon', 'gantt-tl-ellipsis']);
    expect(classes(nameCell(f, 'b'))).toEqual(['gantt-tl-indent', 'gantt-tl-icon', 'gantt-tl-ellipsis']);
    expect(part(f, 'b', '.gantt-tl-icon').getAttribute('aria-hidden')).toBe('true');
    expect(part(f, 'm', '.gantt-tl-icon').textContent).toBe('◆');

    // Other cells: status dot? · text
    const cells = $$(f, '.gantt-tl-row[data-task-id="b"] .gantt-tl-cell');
    expect(cells.map(classes)).toEqual([
      ['gantt-tl-name'],
      ['gantt-tl-status-dot', 'gantt-tl-ellipsis'],
      ['gantt-tl-ellipsis'],
    ]);
  });

  it('takes the text colours from the stylesheet: primary labels and group names, secondary texts, muted icons', async () => {
    const f = await mount();
    expect(cascaded($(f, '.gantt-tl-col-header .gantt-tl-ellipsis'), 'color')).toBe('');
    expect(cascaded($(f, '.gantt-tl-col-header'), 'color')).toBe('var(--gantt-text)');

    const groupText = part(f, 'g', '.gantt-tl-ellipsis');
    const leafText = part(f, 'b', '.gantt-tl-ellipsis');
    expect(cascaded(groupText, 'color')).toBe('var(--gantt-text)');
    expect(cascaded(groupText, 'font-weight')).toBe('600');
    expect(cascaded(leafText, 'color')).toBe('var(--gantt-text-sec)');
    expect(cascaded(leafText, 'font-weight')).toBe('');
    const dataText = $(f, '.gantt-tl-row[data-task-id="b"] .gantt-tl-cell:nth-child(3) .gantt-tl-ellipsis');
    expect(cascaded(dataText, 'color')).toBe('var(--gantt-text-sec)');

    // No text colour, weight, size or cursor is an inline style any more
    for (const el of $$(f, '.gantt-tl-ellipsis, .gantt-tl-sort-icon, .gantt-tl-indent, .gantt-tl-name')) {
      expect(el.style.getPropertyValue('color')).toBe('');
      expect(el.style.getPropertyValue('font-weight')).toBe('');
      expect(el.style.getPropertyValue('font-size')).toBe('');
    }
    for (const el of $$(f, '.gantt-tl-col-header')) expect(el.style.getPropertyValue('cursor')).toBe('');
    expect(cascaded($(f, '.gantt-tl-col-header[aria-sort]'), 'cursor')).toBe('pointer');
  });

  it("marks the sorted column's icon --active (primary text); the others stay muted", async () => {
    const f = await mount();
    const icon = (i: number) => {
      const el = $$(f, '.gantt-tl-col-header .gantt-tl-sort-icon')[i];
      if (!el) throw new Error(`no sort icon ${i}`);
      return el;
    };
    const header = (i: number) => {
      const el = $$(f, '.gantt-tl-col-header')[i];
      if (!el) throw new Error(`no header ${i}`);
      return el;
    };
    expect(icon(0).classList.contains('gantt-tl-sort-icon--active')).toBe(false);
    expect(cascaded(icon(0), 'color')).toBe('var(--gantt-text-muted)');
    expect(cascaded(icon(0), 'font-size')).toBe('9px');

    header(2).click();
    await f.whenStable();
    expect(icon(2).classList.contains('gantt-tl-sort-icon--active')).toBe(true);
    expect(icon(2).textContent).toBe('▲');
    expect(cascaded(icon(2), 'color')).toBe('var(--gantt-text)');
    expect(icon(0).classList.contains('gantt-tl-sort-icon--active')).toBe(false);

    // Third click: back to the original order, no active icon
    header(2).click();
    await f.whenStable();
    header(2).click();
    await f.whenStable();
    expect($$(f, '.gantt-tl-sort-icon--active')).toEqual([]);
  });

  it('keeps the explicit colour of a task icon with barColor; the others take the muted token', async () => {
    const f = await mount();
    // the test DOM normalises the colour; a browser keeps '#0F766E' in the declaration
    expect(['#0F766E', 'rgb(15, 118, 110)']).toContain(part(f, 'a', '.gantt-tl-icon').style.color);
    expect(part(f, 'b', '.gantt-tl-icon').style.color).toBe('');
    expect(cascaded(part(f, 'b', '.gantt-tl-icon'), 'color')).toBe('var(--gantt-text-muted)');
    expect(cascaded(part(f, 'b', '.gantt-tl-icon'), 'font-size')).toBe('10px');

    // Dropping the colour removes the inline paint
    f.componentInstance.tasks.set(TASKS.map(t => (t.id === 'a' ? { ...t, barColor: undefined } : t)));
    await f.whenStable();
    expect(part(f, 'a', '.gantt-tl-icon').style.color).toBe('');
    expect(cascaded(part(f, 'a', '.gantt-tl-icon'), 'color')).toBe('var(--gantt-text-muted)');
  });

  it('ellipsizes the header label', async () => {
    const f = await mount();
    const label = $(f, '.gantt-tl-col-header .gantt-tl-ellipsis');
    expect(cascaded(label, 'overflow')).toBe('hidden');
    expect(cascaded(label, 'text-overflow')).toBe('ellipsis');
    expect(cascaded(label, 'white-space')).toBe('nowrap');
    expect(cascaded($(f, '.gantt-tl-col-header'), 'overflow')).toBe('hidden');
  });

  it('puts the whole 6 px resize handle inside its header cell (right: 0)', async () => {
    const f = await mount();
    const handle = $(f, '.gantt-tl-col-header .gantt-col-resize');
    expect(cascaded($(f, '.gantt-tl-col-header'), 'position')).toBe('relative');
    expect(cascaded(handle, 'position')).toBe('absolute');
    expect(['0', '0px']).toContain(cascaded(handle, 'right'));
    expect(cascaded(handle, 'width')).toBe('6px');
  });

  it('gives the collapse toggle a 24 × 24 px target and the leaf indent the same width', async () => {
    const f = await mount();
    const toggle = $(f, '.gantt-collapse-btn');
    expect(cascaded(toggle, 'min-width')).toBe('24px');
    expect(cascaded(toggle, 'min-height')).toBe('24px');
    expect(cascaded(part(f, 'b', '.gantt-tl-indent'), 'width')).toBe('24px');
    // The level indent (level × indentSize) is the one geometry the name wrapper takes inline
    expect(nameCell(f, 'b').style.paddingLeft).toBe('16px');
    expect(nameCell(f, 'g').style.paddingLeft).toBe('0px');
  });

  it('gives the toolbar slot group the first class gantt-tb-slot (paint keys of the other groups)', async () => {
    const f = await mount();
    const slot = $(f, '.gantt-toolbar .gantt-tb-slot');
    expect([...slot.classList]).toEqual(['gantt-tb-slot', 'gantt-tb-group']);
    expect(slot.childNodes).toHaveLength(0);
  });
});
