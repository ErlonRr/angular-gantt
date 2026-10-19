// The framework differences of a case (`FRAMEWORK_NOTES`), as list items.
import { GALLERY_FRAMEWORKS, GALLERY_FRAMEWORK_LABELS, type FrameworkNote } from 'demo-kit/gallery';
import { h } from '../dom';

/** Text with Markdown code spans: `like this` becomes a `<code>` (split on backticks, no HTML parsing). */
export function inlineCode(text: string): (Node | string)[] {
  return text
    .split('`')
    .flatMap((part, i) => (part === '' ? [] : [i % 2 ? h('code', { class: 'gs-code-inline' }, part) : part]));
}

/** One known difference: topic, bindings, text, what to do, until when. */
export function noteItem(note: FrameworkNote): HTMLLIElement {
  const frameworks =
    note.frameworks.length === GALLERY_FRAMEWORKS.length
      ? 'All bindings'
      : note.frameworks.map(f => GALLERY_FRAMEWORK_LABELS[f]).join(', ');
  return h(
    'li',
    { class: 'gs-case-note' },
    h('p', { class: 'gs-case-note-meta' }, h('span', { class: 'gs-tag' }, note.area), h('span', {}, frameworks)),
    h('p', {}, ...inlineCode(note.text)),
    ...(note.workaround ? [h('p', {}, h('strong', {}, 'What to do: '), ...inlineCode(note.workaround))] : []),
    ...(note.until ? [h('p', {}, h('strong', {}, 'Until'), ` ${note.until}.`)] : []),
  );
}
