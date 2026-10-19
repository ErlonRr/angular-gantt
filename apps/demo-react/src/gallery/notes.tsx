import { Fragment } from 'react';
import { GALLERY_FRAMEWORKS, GALLERY_FRAMEWORK_LABELS, type FrameworkNote } from 'demo-kit/gallery';

/** Text with Markdown code spans: `like this` becomes a `<code>` (split on backticks, no HTML parsing). */
export function InlineCode({ text }: { text: string }) {
  return text.split('`').map((part, i) =>
    part === '' ? null : i % 2 ? (
      <code key={i} className="gs-code-inline">
        {part}
      </code>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/** One known framework difference (`FRAMEWORK_NOTES`): topic, bindings, text, what to do, until when. */
export function NoteItem({ note }: { note: FrameworkNote }) {
  const frameworks =
    note.frameworks.length === GALLERY_FRAMEWORKS.length
      ? 'All bindings'
      : note.frameworks.map(f => GALLERY_FRAMEWORK_LABELS[f]).join(', ');
  return (
    <li className="gs-case-note">
      <p className="gs-case-note-meta">
        <span className="gs-tag">{note.area}</span>
        <span>{frameworks}</span>
      </p>
      <p>
        <InlineCode text={note.text} />
      </p>
      {note.workaround && (
        <p>
          <strong>What to do: </strong>
          <InlineCode text={note.workaround} />
        </p>
      )}
      {note.until && (
        <p>
          <strong>Until</strong> {note.until}.
        </p>
      )}
    </li>
  );
}
