import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  afterNextRender,
  computed,
  inject,
  linkedSignal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FRAMEWORKS, PACKAGES, SITE, type FrameworkId } from 'demo-kit/site';
import { CodeBlockComponent } from '../../shell/code-block.component';
import { InstallBlockComponent } from '../../shell/install-block.component';
import { InlineCodeComponent } from '../api/inline-code.component';
import {
  CSP_CODE,
  CSP_NOTES,
  LOCALE_CODE,
  LOCALE_NOTES,
  PANELS,
  SERVER_CODE,
  SSR_NOTES,
  TYPES_CODE,
} from './frameworks.content';

const isFramework = (id: string | null): id is FrameworkId => FRAMEWORKS.some(f => f.id === id);

/** /frameworks: one tab per binding (`?f=react` opens that tab), then SSR, types, CSP and dates. */
@Component({
  selector: 'app-frameworks-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CodeBlockComponent, InstallBlockComponent, InlineCodeComponent],
  styles: `
    .fw-panel {
      gap: 18px;
    }
    .fw-intro {
      margin: 0;
      max-width: 760px;
      color: var(--gs-muted);
      font-size: 17px;
    }
    .fw-notes {
      max-width: 860px;
    }
    .fw-notes ul {
      margin: 0;
    }
    .fw-links {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 20px;
      margin: 0;
      font-size: 15px;
    }
    .fw-section .gs-prose ul {
      margin-bottom: 20px;
    }
  `,
  template: `
    <header class="gs-page-head">
      <div>
        <p class="gs-eyebrow">Frameworks</p>
        <h1 class="gs-title">Use it in your framework</h1>
        <p class="gs-lead">
          One core with thin bindings: <code class="gs-code-inline">&#64;gantry/core</code> computes the chart, the Web
          Component and the native Angular components paint it, and the React, Vue and Svelte wrappers forward to the
          Web Component. The same options, events and methods everywhere.
        </p>
      </div>
    </header>

    <div #tablist class="gs-tabs" role="tablist" aria-label="Framework">
      @for (f of frameworks; track f.id) {
        <button
          type="button"
          role="tab"
          class="gs-tab"
          [id]="'fw-tab-' + f.id"
          [attr.aria-selected]="f.id === selected()"
          [attr.aria-controls]="f.id === selected() ? 'fw-panel' : null"
          [attr.tabindex]="f.id === selected() ? 0 : -1"
          (click)="select(f.id)"
          (keydown)="onKey($event)"
        >
          {{ f.label }}
        </button>
      }
    </div>

    <div id="fw-panel" class="gs-stack fw-panel" role="tabpanel" [attr.aria-labelledby]="'fw-tab-' + selected()">
      <p class="fw-intro"><app-inline-code [text]="panel().intro" /></p>
      <app-install-block [pkg]="pkg()" />
      @for (file of panel().files; track file.title) {
        <app-code-block [code]="file.code" [file]="file.title" />
      }
      <div class="gs-prose fw-notes">
        <ul>
          @for (note of panel().notes; track $index) {
            <li><app-inline-code [text]="note" /></li>
          }
        </ul>
      </div>
      <p class="fw-links">
        <a class="gs-link" [href]="panel().readmeUrl">{{ pkg() }} README</a>
        <a class="gs-link" [href]="panel().npmUrl">{{ pkg() }} on npm</a>
        <a class="gs-link" [href]="site.configurationUrl">Every option: Configuration</a>
        <a class="gs-link" routerLink="/api">API reference</a>
      </p>
    </div>

    <section class="gs-section fw-section" aria-labelledby="fw-ssr">
      <div class="gs-section-head">
        <div>
          <h2 class="gs-h2" id="fw-ssr">Server-side rendering</h2>
          <p>
            Every package imports on the server without touching the DOM. What reaches the HTML depends on the binding.
          </p>
        </div>
      </div>
      <div class="gs-prose">
        <ul>
          @for (n of ssrNotes; track n.label) {
            <li>
              <strong>{{ n.label }}</strong> — <app-inline-code [text]="n.text" />
            </li>
          }
        </ul>
      </div>
      <app-code-block [code]="serverCode" file="server.ts" />
    </section>

    <section class="gs-section fw-section" aria-labelledby="fw-types">
      <div class="gs-section-head">
        <div>
          <h2 class="gs-h2" id="fw-types">TypeScript and editors</h2>
          <p>
            Every package ships its type declarations, and every binding re-exports the
            <code class="gs-code-inline">&#64;gantry/core</code> types (<code class="gs-code-inline">GanttTask</code>,
            <code class="gs-code-inline">GanttOptions</code>, <code class="gs-code-inline">ViewMode</code>, …).
          </p>
        </div>
      </div>
      <div class="gs-prose">
        <ul>
          <li>
            <app-inline-code
              text="\`GantryEventDetailMap\` / \`GantryEventMap\` type the event payloads; \`GANTRY_PROPERTIES\` and \`GANTRY_EVENTS\` list the properties and the callback name of each event."
            />
          </li>
          <li>
            <app-inline-code
              text="The Web Component ships a Custom Elements Manifest, \`@gantry/vanilla/custom-elements.json\` (the \`customElements\` field of its \`package.json\`): IDEs, Storybook and linters read its attributes, properties, methods, events, parts, custom states and CSS custom properties."
            />
            The <a routerLink="/api">API reference</a> on this site is generated from it.
          </li>
        </ul>
      </div>
      <app-code-block [code]="typesCode" file="types.ts" />
    </section>

    <section class="gs-section fw-section" aria-labelledby="fw-csp">
      <div class="gs-section-head">
        <div>
          <h2 class="gs-h2" id="fw-csp">Content Security Policy</h2>
          <p>
            The Web Component works under a strict policy, without
            <code class="gs-code-inline">'unsafe-inline'</code>, <code class="gs-code-inline">'unsafe-eval'</code> or
            Trusted Types policies.
          </p>
        </div>
      </div>
      <div class="gs-prose">
        <ul>
          @for (note of cspNotes; track $index) {
            <li><app-inline-code [text]="note" /></li>
          }
        </ul>
      </div>
      <app-code-block [code]="cspCode" file="HTTP header" />
    </section>

    <section class="gs-section fw-section" aria-labelledby="fw-dates">
      <div class="gs-section-head">
        <div>
          <h2 class="gs-h2" id="fw-dates">Dates and locales</h2>
          <p>
            Month and day names, header labels and tooltip dates follow
            <code class="gs-code-inline">options.locale</code>; every UI string can be replaced.
          </p>
        </div>
      </div>
      <div class="gs-prose">
        <ul>
          @for (note of localeNotes; track $index) {
            <li><app-inline-code [text]="note" /></li>
          }
        </ul>
      </div>
      <app-code-block [code]="localeCode" file="options.ts" />
    </section>
  `,
})
export class FrameworksPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  protected readonly site = SITE;
  protected readonly frameworks = FRAMEWORKS;
  protected readonly ssrNotes = SSR_NOTES;
  protected readonly serverCode = SERVER_CODE;
  protected readonly typesCode = TYPES_CODE;
  protected readonly cspNotes = CSP_NOTES;
  protected readonly cspCode = CSP_CODE;
  protected readonly localeNotes = LOCALE_NOTES;
  protected readonly localeCode = LOCALE_CODE;

  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  /** `?f=<id>` picks the tab (other pages link to /frameworks?f=react); a click keeps it in the URL. */
  protected readonly selected = linkedSignal<FrameworkId>(() => {
    const f = this.query().get('f');
    return isFramework(f) ? f : 'html';
  });
  protected readonly panel = computed(() => PANELS[this.selected()]);
  protected readonly pkg = computed(() => PACKAGES[FRAMEWORKS.find(f => f.id === this.selected())!.package].name);

  private readonly tablist = viewChild.required<ElementRef<HTMLElement>>('tablist');

  constructor() {
    // On a narrow screen the tab strip scrolls: bring a tab opened through ?f= into view
    afterNextRender(() => {
      const list = this.tablist().nativeElement;
      const tab = list.querySelector<HTMLElement>('[aria-selected="true"]');
      const overflow = tab ? tab.getBoundingClientRect().right - list.getBoundingClientRect().right : 0;
      if (overflow > 0) list.scrollLeft += overflow;
    });
  }

  protected select(id: FrameworkId): void {
    this.selected.set(id);
    // Not a router navigation: that would scroll to the top and move the focus to <main>
    const url = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: { f: id },
      queryParamsHandling: 'merge',
    });
    // Keep the router's history state (navigationId): Back still restores the scroll position
    this.location.replaceState(this.router.serializeUrl(url), '', this.location.getState());
  }

  /** Arrow keys, Home and End move between the tabs and select them (WAI-ARIA tabs pattern). */
  protected onKey(e: KeyboardEvent): void {
    const i = this.frameworks.findIndex(f => f.id === this.selected());
    const n = this.frameworks.length;
    const next =
      e.key === 'ArrowRight'
        ? (i + 1) % n
        : e.key === 'ArrowLeft'
          ? (i - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    this.select(this.frameworks[next].id);
    const tabs = (e.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role="tab"]');
    tabs?.[next]?.focus();
  }
}
