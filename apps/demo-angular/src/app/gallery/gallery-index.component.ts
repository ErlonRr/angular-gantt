import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CASE_IDS, GALLERY_FRAMEWORKS, GALLERY_FRAMEWORK_LABELS, casesByCategory } from 'demo-kit/gallery/catalog';
import { frameworkCaseUrl } from 'demo-kit/site';

/**
 * The gallery on /examples: a jump list of the categories, then each category with a card per
 * case. A card's title opens the case page on this site; its pills open the same case live in each
 * framework (the Vite demo apps, served under /wc/, /react/, /vue/ and /svelte/).
 */
@Component({
  selector: 'section[appGalleryIndex]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { class: 'gs-section', id: 'gallery', 'aria-labelledby': 'gallery-title' },
  template: `
    <div class="gs-section-head">
      <div>
        <h2 class="gs-h2" id="gallery-title">Gallery</h2>
        <p>
          {{ count }} cases, each one written for Angular, the Web Component, React, Vue and Svelte over the same data,
          with its code and the framework differences it runs into.
        </p>
      </div>
    </div>

    <nav aria-label="Gallery categories">
      <ul class="gs-gallery-cats">
        @for (group of groups; track group.category.id) {
          <li>
            <a class="gs-gallery-cat-link" routerLink="/examples" [fragment]="'gallery-' + group.category.id">
              {{ group.category.label }}
              <span class="gs-count" aria-hidden="true">{{ group.cases.length }}</span>
            </a>
          </li>
        }
      </ul>
    </nav>

    <div class="gs-gallery">
      @for (group of groups; track group.category.id) {
        <section
          class="gs-gallery-cat"
          [id]="'gallery-' + group.category.id"
          [attr.aria-labelledby]="'gallery-' + group.category.id + '-title'"
        >
          <div class="gs-gallery-cat-head">
            <h3 class="gs-h3" [id]="'gallery-' + group.category.id + '-title'">{{ group.category.label }}</h3>
            <p>{{ group.category.summary }}</p>
          </div>
          <ul class="gs-gallery-grid">
            @for (c of group.cases; track c.id) {
              <li class="gs-gallery-card">
                <h4 class="gs-gallery-card-title">
                  <a [routerLink]="'/examples/' + c.id">{{ c.title }}</a>
                  @if (c.isNew) {
                    <span class="gs-badge">New</span>
                  }
                </h4>
                <p>{{ c.summary }}</p>
                <ul class="gs-gallery-links" [attr.aria-label]="'Open ' + c.title + ' live'">
                  @for (fw of frameworks; track fw.id) {
                    <li>
                      @if (fw.id === 'angular') {
                        <a class="gs-gallery-link" [routerLink]="'/examples/' + c.id">
                          <span class="gs-sr-only">{{ c.title }} in </span>{{ fw.label }}
                        </a>
                      } @else {
                        <a class="gs-gallery-link" [href]="url(fw.id, c.id)">
                          <span class="gs-sr-only">{{ c.title }} in </span>{{ fw.label }}
                        </a>
                      }
                    </li>
                  }
                </ul>
              </li>
            }
          </ul>
        </section>
      }
    </div>
  `,
})
export class GalleryIndexComponent {
  protected readonly count = CASE_IDS.length;
  protected readonly groups = casesByCategory();
  protected readonly frameworks = GALLERY_FRAMEWORKS.map(id => ({ id, label: GALLERY_FRAMEWORK_LABELS[id] }));
  protected readonly url = frameworkCaseUrl;
}
