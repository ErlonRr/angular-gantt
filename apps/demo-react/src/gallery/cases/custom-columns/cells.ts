// The cells: a `cellTemplate(row)` returns a DOM node (or a string). Cells render inside the chart's
// shadow root, out of reach of page CSS, so they are styled through the CSSOM with the chart's
// `--gantt-*` variables (they follow its theme and dark mode); `part` names let page CSS reach them.
import type { ColumnDef } from '@gantryjs/react';
import { PRIORITY_LABELS, initials, ownerOf, priorityOf, type Priority } from 'demo-kit/gallery';

type CellTemplate = NonNullable<ColumnDef['cellTemplate']>;

/** A `<span>` with inline styles (CSSOM writes: fine under a strict CSP) and its children */
function span(style: Partial<CSSStyleDeclaration>, ...children: (Node | string)[]): HTMLSpanElement {
  const node = document.createElement('span');
  Object.assign(node.style, style);
  node.append(...children);
  return node;
}

const line: Partial<CSSStyleDeclaration> = { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '0' };

/** Owner: the initials in an avatar, then the name */
const owner: CellTemplate = row => {
  const name = ownerOf(row);
  const avatar = span(
    {
      display: 'inline-grid',
      flex: 'none',
      placeItems: 'center',
      width: '22px',
      height: '22px',
      borderRadius: '50%',
      background: 'var(--gantt-bar)',
      color: 'var(--gantt-bar-text-on-bar)',
      fontSize: '10px',
      fontWeight: '700',
    },
    initials(name),
  );
  avatar.setAttribute('part', 'avatar');
  avatar.setAttribute('aria-hidden', 'true');
  return span(line, avatar, span({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, name));
};

const BADGES: Readonly<Record<Priority, Partial<CSSStyleDeclaration>>> = {
  high: {
    borderColor: 'var(--gantt-critical)',
    background: 'var(--gantt-critical)',
    color: 'var(--gantt-bar-text-on-critical)',
  },
  normal: { borderColor: 'var(--gantt-bar)', background: 'var(--gantt-bar)', color: 'var(--gantt-bar-text-on-bar)' },
  low: { borderColor: 'var(--gantt-border)', color: 'var(--gantt-text-sec)' },
};

/** Priority: a badge, filled for high and normal, outlined for low */
const priority: CellTemplate = row => {
  const level = priorityOf(row);
  const badge = {
    padding: '1px 8px',
    border: '1px solid',
    borderRadius: '999px',
    fontSize: '11.5px',
    fontWeight: '600',
  };
  return span({ ...badge, ...BADGES[level] }, PRIORITY_LABELS[level]);
};

/** Progress: a meter, then the value (the text is what assistive technology reads) */
const meter: CellTemplate = row => {
  const value = row.task.progress ?? 0;
  const fill = span({ display: 'block', width: `${value}%`, height: '100%', background: 'var(--gantt-bar)' });
  fill.setAttribute('part', 'meter-fill');
  const track = span(
    {
      flex: 'none',
      width: '56px',
      height: '6px',
      borderRadius: '3px',
      background: 'var(--gantt-grid-line)',
      overflow: 'hidden',
    },
    fill,
  );
  track.setAttribute('aria-hidden', 'true');
  return span(line, track, span({ fontVariantNumeric: 'tabular-nums' }, `${value} %`));
};

/** The templates by column key; the Task column keeps the built-in cell */
export const CELL_TEMPLATES: Readonly<Partial<Record<string, CellTemplate>>> = { owner, priority, meter };
