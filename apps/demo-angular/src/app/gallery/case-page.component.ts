import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, linkedSignal, resource } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';
import {
  GALLERY_FRAMEWORKS,
  GALLERY_FRAMEWORK_LABELS,
  caseNeighbours,
  categoryOf,
  galleryCase,
  isCaseId,
  notesForCase,
  type CaseId,
  type GalleryFramework,
} from 'demo-kit/gallery';
import { CASE_SOURCES } from 'demo-kit/gallery/sources';
import { frameworkCaseUrl } from 'demo-kit/site';
import { CodeBlockComponent } from '../shell/code-block.component';
import { IconComponent } from '../shell/icon.component';
import { TABS } from '../shell/tabs';
import { GALLERY_CASE } from './case-context';
import { CASE_COMPONENTS } from './cases';
import { FrameworkNoteComponent } from './framework-note.component';

type CodeTab = GalleryFramework | 'shared';

const CODE_TABS: readonly { id: CodeTab; label: string }[] = [
  ...GALLERY_FRAMEWORKS.map(id => ({ id, label: GALLERY_FRAMEWORK_LABELS[id] })),
  { id: 'shared', label: 'Shared data' },
];

/**
 * /examples/:id: a gallery case. The live Angular example (the case's component from `cases.ts`),
 * links to the same case in the other demo apps, its code in every framework (generated from the
 * case files: `demo-kit/gallery/sources`), the framework differences it runs into, and the
 * previous and next cases. The route only matches catalog ids (`app.routes.ts`).
 */
@Component({
  selector: 'app-case-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet, RouterLink, CodeBlockComponent, IconComponent, FrameworkNoteComponent, TABS],
  template: `
    @let c = info();
    <header class="gs-page-head">
      <div>
        <p class="gs-eyebrow">Example · {{ category().label }}</p>
        <h1 class="gs-title">{{ c.title }}</h1>
        <p class="gs-lead">{{ c.summary }}</p>
      </div>
      <a class="gs-btn gs-btn--sm" routerLink="/examples" fragment="gallery">
        <span class="gs-case-back" aria-hidden="true"><app-icon name="arrowRight" /></span>
        All examples
      </a>
    </header>

    <section aria-labelledby="case-live-title">
      <h2 class="gs-sr-only" id="case-live-title">Live example in Angular</h2>
      @if (!component.error() && component.value(); as type) {
        @for (key of [id()]; track key) {
          <ng-container *ngComponentOutlet="type; injector: caseInjector()" />
        }
      }
      <nav class="gs-case-live" aria-label="This example in every framework">
        <p>Live in</p>
        <ul class="gs-gallery-links">
          @for (link of liveLinks(); track link.fw) {
            <li>
              @if (link.fw === 'angular') {
                <a class="gs-gallery-link" [routerLink]="link.href" aria-current="page">{{ link.label }}</a>
              } @else {
                <a class="gs-gallery-link" [href]="link.href">{{ link.label }}</a>
              }
            </li>
          }
        </ul>
      </nav>
      <ul class="gs-gallery-tags gs-case-tags" aria-label="Options and APIs">
        @for (tag of c.tags; track tag) {
          <li class="gs-tag">{{ tag }}</li>
        }
      </ul>
    </section>

    <section class="gs-case-section" aria-labelledby="case-code-title">
      <h2 class="gs-h2" id="case-code-title">Code</h2>
      <div
        class="gs-tabs"
        aria-label="Framework"
        tabPanel="case-code-panel"
        [appTabList]="tab()"
        (tabSelect)="tab.set($event)"
      >
        @for (t of codeTabs; track t.id) {
          <button type="button" class="gs-tab" [appTab]="t.id" [id]="'case-tab-' + t.id">{{ t.label }}</button>
        }
      </div>
      <div id="case-code-panel" class="gs-stack" role="tabpanel" [attr.aria-labelledby]="'case-tab-' + tab()">
        @if (sources.error()) {
          <p class="gs-case-hint">The code could not be loaded. Reload the page to try again.</p>
        } @else if (sources.value(); as src) {
          @let files = src[tab()] ?? [];
          @for (f of files; track f.file) {
            <app-code-block [code]="f.code" [file]="f.file" scroll />
          } @empty {
            <p class="gs-case-hint">
              This example has no {{ tabLabel() }} file yet: its {{ tabLabel() }} page draws the shared data and options
              of the Shared data tab.
            </p>
          }
        } @else {
          <p class="gs-case-hint">Loading the code…</p>
        }
      </div>
    </section>

    @if (notes().length) {
      <section class="gs-case-section" aria-labelledby="case-notes-title">
        <h2 class="gs-h2" id="case-notes-title">Framework differences</h2>
        <ul class="gs-case-notes">
          @for (note of notes(); track note.id) {
            <li [appFrameworkNote]="note"></li>
          }
        </ul>
      </section>
    }

    <nav class="gs-case-pager" aria-label="More examples">
      @if (neighbours().previous; as prev) {
        <a class="gs-case-pager-link" [routerLink]="'/examples/' + prev.id">
          <span>Previous</span>
          {{ prev.title }}
        </a>
      }
      @if (neighbours().next; as next) {
        <a class="gs-case-pager-link gs-case-pager-link--next" [routerLink]="'/examples/' + next.id">
          <span>Next</span>
          {{ next.title }}
        </a>
      }
    </nav>
  `,
  styles: `
    .gs-case-back {
      display: inline-flex;
      transform: scaleX(-1);
    }
    .gs-case-tags {
      margin-top: 12px;
    }
  `,
})
export class CasePageComponent {
  private readonly injector = inject(Injector);

  /** The case id of the route (the route only matches catalog ids) */
  protected readonly id = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      map(params => {
        const id = params.get('id');
        return isCaseId(id) ? id : 'states';
      }),
    ),
    { requireSync: true },
  );

  protected readonly info = computed(() => galleryCase(this.id()));
  protected readonly category = computed(() => categoryOf(this.id()));
  protected readonly notes = computed(() => notesForCase(this.id()));
  protected readonly neighbours = computed(() => caseNeighbours(this.id()));
  protected readonly liveLinks = computed(() =>
    GALLERY_FRAMEWORKS.map(fw => ({ fw, label: GALLERY_FRAMEWORK_LABELS[fw], href: frameworkCaseUrl(fw, this.id()) })),
  );

  /** The case's Angular component (generic until the case has its own) */
  protected readonly component = resource({
    params: () => this.id(),
    loader: ({ params }) => CASE_COMPONENTS[params](),
  });
  protected readonly caseInjector = computed(() =>
    Injector.create({ providers: [{ provide: GALLERY_CASE, useValue: this.id() }], parent: this.injector }),
  );

  protected readonly codeTabs = CODE_TABS;
  /** The code tab: Angular on every new case */
  protected readonly tab = linkedSignal<CaseId, CodeTab>({ source: this.id, computation: () => 'angular' });
  protected readonly tabLabel = computed(() => CODE_TABS.find(t => t.id === this.tab())!.label);
  protected readonly sources = resource({
    params: () => this.id(),
    loader: ({ params }) => CASE_SOURCES[params](),
  });
}
