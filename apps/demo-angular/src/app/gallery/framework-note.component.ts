import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { FrameworkNote } from 'demo-kit/gallery';
import { GALLERY_FRAMEWORKS, GALLERY_FRAMEWORK_LABELS, galleryCase } from 'demo-kit/gallery/catalog';
import { InlineCodeComponent } from '../pages/api/inline-code.component';

/**
 * One known framework difference (`FRAMEWORK_NOTES` of demo-kit/gallery): its topic and bindings,
 * the text, the workaround, when it goes away, and (with `showCases`) the gallery cases it affects.
 */
@Component({
  selector: 'li[appFrameworkNote]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, InlineCodeComponent],
  host: { class: 'gs-case-note' },
  template: `
    <p class="gs-case-note-meta">
      <span class="gs-tag">{{ note().area }}</span>
      <span>{{ frameworks() }}</span>
    </p>
    <p><app-inline-code [text]="note().text" /></p>
    @if (note().workaround; as workaround) {
      <p><strong>What to do: </strong><app-inline-code [text]="workaround" /></p>
    }
    @if (note().until; as until) {
      <p><strong>Until</strong> {{ until }}.</p>
    }
    @if (showCases() && cases().length) {
      <p>
        <strong>Examples: </strong>
        @for (c of cases(); track c.id; let last = $last) {
          <a class="gs-link" [routerLink]="'/examples/' + c.id">{{ c.title }}</a
          >{{ last ? '' : ', ' }}
        }
      </p>
    }
  `,
})
export class FrameworkNoteComponent {
  readonly note = input.required<FrameworkNote>({ alias: 'appFrameworkNote' });
  /** Lists the gallery cases that run into the difference */
  readonly showCases = input(false);

  /** "All bindings", or the names of the ones the note is about */
  protected readonly frameworks = computed(() => {
    const list = this.note().frameworks;
    return list.length === GALLERY_FRAMEWORKS.length
      ? 'All bindings'
      : list.map(f => GALLERY_FRAMEWORK_LABELS[f]).join(', ');
  });
  protected readonly cases = computed(() => this.note().cases.map(galleryCase));
}
