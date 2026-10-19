import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GANTRY_API } from 'demo-kit/api';
import { SITE } from 'demo-kit/site';
import { InlineCodeComponent } from './inline-code.component';

/**
 * The name of each `<gantry-element>` event in every binding: `GANTRY_EVENTS`
 * (packages/vanilla/src/types.ts) for the React and Svelte callback props, the Vue emits
 * (packages/vue/src/Gantry.ts, used as `@task-dragged`) and the outputs of `GantryComponent`
 * (packages/angular/src/lib/gantt-component/gantry.component.ts).
 */
const EVENT_NAMES: Record<string, { callback: string; vue: string; angular: string }> = {
  'task-dragged': { callback: 'onTaskDragged', vue: '@task-dragged', angular: '(taskDragged)' },
  'task-resized': { callback: 'onTaskResized', vue: '@task-resized', angular: '(taskResized)' },
  'selection-change': { callback: 'onSelectionChange', vue: '@selection-change', angular: '(selectionChange)' },
  'row-click': { callback: 'onRowClick', vue: '@row-click', angular: '(rowClick)' },
  'row-dblclick': { callback: 'onRowDblClick', vue: '@row-dblclick', angular: '(rowDblClick)' },
  'view-mode-change': { callback: 'onViewModeChange', vue: '@view-mode-change', angular: '(viewModeChange)' },
  'state-change': { callback: 'onStateChange', vue: '@state-change', angular: '(stateChange)' },
  'load-error': { callback: 'onLoadError', vue: '@load-error', angular: '(loadError)' },
  retry: { callback: 'onRetry', vue: '@retry', angular: '(retry)' },
  'before-change': { callback: 'onBeforeChange', vue: '@before-change', angular: '(beforeChange)' },
  'tasks-change': { callback: 'onTasksChange', vue: '@tasks-change', angular: '(tasksChange)' },
  'task-updated': { callback: 'onTaskUpdated', vue: '@task-updated', angular: '(taskUpdated)' },
  'task-progress-changed': {
    callback: 'onTaskProgressChanged',
    vue: '@task-progress-changed',
    angular: '(taskProgressChanged)',
  },
  'dependency-created': {
    callback: 'onDependencyCreated',
    vue: '@dependency-created',
    angular: '(dependencyCreated)',
  },
  'dependency-deleted': {
    callback: 'onDependencyDeleted',
    vue: '@dependency-deleted',
    angular: '(dependencyDeleted)',
  },
  'history-change': { callback: 'onHistoryChange', vue: '@history-change', angular: '(historyChange)' },
  'before-export': { callback: 'onBeforeExport', vue: '@before-export', angular: '(beforeExport)' },
  export: { callback: 'onExport', vue: '@export', angular: '(export)' },
};

const API = GANTRY_API;
const METHODS = API.methods.map(m => ({ ...m, params: m.signature.slice(m.name.length) }));
const BINDINGS = API.events.map(e => ({
  name: e.name,
  ...(EVENT_NAMES[e.name] ?? { callback: '', vue: '', angular: '' }),
}));

type SectionId = 'properties' | 'methods' | 'events' | 'css-properties' | 'parts' | 'states';

/** /api: the `<gantry-element>` surface from its Custom Elements Manifest, filterable. */
@Component({
  selector: 'app-api-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, InlineCodeComponent],
  styles: `
    .api-tools {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 16px 28px;
    }
    .api-search {
      flex: 1 1 260px;
      max-width: 400px;
    }
    .api-nav ul {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .api-nav a {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      box-sizing: border-box;
      text-decoration: none;
    }
    .api-sec {
      margin-top: 64px;
    }
    .api-sec:first-of-type {
      margin-top: 48px;
    }
    .api-sec h2:focus {
      outline: none;
    }
    @media (max-width: 900px) {
      .api-sec {
        scroll-margin-top: 48px;
      }
    }
    .api-h3 {
      margin: 28px 0 12px;
    }
    .api-desc {
      min-width: 260px;
    }
    .api-note {
      margin: 12px 0 0;
      color: var(--gs-muted);
      font-size: 15px;
    }
    .gs-tag {
      margin-left: 8px;
    }
    /* Break types and signatures between words only (the column keeps its longest word) */
    .gs-table .gs-type {
      overflow-wrap: normal;
    }
    .api-nowrap {
      white-space: nowrap;
    }
  `,
  template: `
    <header class="gs-page-head">
      <div>
        <p class="gs-eyebrow">API</p>
        <h1 class="gs-title">API reference</h1>
        <p class="gs-lead">
          The <code class="gs-code-inline">&lt;{{ api.tagName }}&gt;</code> surface, generated from its Custom Elements
          Manifest. Every binding uses the same names: React and Svelte take callback props (<code
            class="gs-code-inline"
            >onTaskDragged</code
          >), Vue listeners (<code class="gs-code-inline">&#64;task-dragged</code>), Angular outputs (<code
            class="gs-code-inline"
            >(taskDragged)</code
          >). Every <code class="gs-code-inline">options</code> field is documented in the README
          <a class="gs-link" [href]="site.configurationUrl">Configuration</a> section.
        </p>
      </div>
    </header>

    <div class="api-tools">
      <div class="gs-field api-search">
        <label class="gs-label" for="api-filter">Filter the API</label>
        <input
          id="api-filter"
          class="gs-input"
          type="search"
          placeholder="scroll, dark, task-dragged…"
          autocomplete="off"
          spellcheck="false"
          [value]="query()"
          (input)="onInput($event)"
        />
      </div>
      <nav class="api-nav" aria-label="API sections">
        <ul>
          @for (s of sections(); track s.id) {
            <li>
              <a class="gs-chip" [href]="'api#' + s.id" (click)="jump($event, s.id)">
                {{ s.label }} <span class="gs-count">{{ s.count }}</span>
              </a>
            </li>
          }
        </ul>
      </nav>
    </div>
    <p class="gs-sr-only" role="status">{{ status() }}</p>

    <section class="gs-section api-sec" id="properties">
      <div class="gs-section-head">
        <div>
          <h2 class="gs-h2" tabindex="-1">Properties</h2>
          <p>
            Set them as element properties (assigning <code class="gs-code-inline">undefined</code> restores the
            default). React, Vue and Svelte take them as props, Angular as inputs (<code class="gs-code-inline"
              >series</code
            >
            for <code class="gs-code-inline">tasks</code>).
          </p>
        </div>
      </div>
      @if (properties().length) {
        <div class="gs-table-wrap" tabindex="0" role="region" aria-label="Properties">
          <table class="gs-table">
            <caption class="gs-sr-only">
              Properties of gantry-element
            </caption>
            <thead>
              <tr>
                <th scope="col">Property</th>
                <th scope="col">Attribute</th>
                <th scope="col">Type</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              @for (p of properties(); track p.name) {
                <tr>
                  <td>
                    <code class="gs-name">{{ p.name }}</code>
                    @if (p.readonly) {
                      <span class="gs-tag">read-only</span>
                    }
                  </td>
                  <td class="api-nowrap">
                    @if (p.attribute) {
                      <code>{{ p.attribute }}</code>
                    } @else {
                      <span class="gs-muted">—</span>
                    }
                  </td>
                  <td>
                    <code class="gs-type">{{ p.type }}</code>
                  </td>
                  <td class="api-desc"><app-inline-code [text]="p.description" /></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <p class="gs-empty">No property matches “{{ query() }}”.</p>
      }
    </section>

    <section class="gs-section api-sec" id="methods">
      <div class="gs-section-head">
        <div>
          <h2 class="gs-h2" tabindex="-1">Methods</h2>
          <p>
            Call them on the element: the React <code class="gs-code-inline">ref</code>, the Vue template ref’s
            <code class="gs-code-inline">element</code>, Svelte’s <code class="gs-code-inline">bind:element</code>.
            Angular’s <code class="gs-code-inline">GantryComponent</code> has the same methods.
          </p>
        </div>
      </div>
      @if (methods().length) {
        <div class="gs-table-wrap" tabindex="0" role="region" aria-label="Methods">
          <table class="gs-table">
            <caption class="gs-sr-only">
              Methods of gantry-element
            </caption>
            <thead>
              <tr>
                <th scope="col">Method</th>
                <th scope="col">Signature</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              @for (m of methods(); track m.name) {
                <tr>
                  <td>
                    <code class="gs-name">{{ m.name }}</code>
                  </td>
                  <td>
                    <code class="gs-type">{{ m.params }}</code>
                  </td>
                  <td class="api-desc"><app-inline-code [text]="m.description" /></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <p class="gs-empty">No method matches “{{ query() }}”.</p>
      }
    </section>

    <section class="gs-section api-sec" id="events">
      <div class="gs-section-head">
        <div>
          <h2 class="gs-h2" tabindex="-1">Events</h2>
          <p>
            <code class="gs-code-inline">CustomEvent</code>s that bubble and cross the shadow boundary, with the payload
            in <code class="gs-code-inline">event.detail</code>. The bindings hand you the
            <code class="gs-code-inline">detail</code>.
          </p>
        </div>
      </div>
      @if (events().length) {
        <div class="gs-table-wrap" tabindex="0" role="region" aria-label="Events">
          <table class="gs-table">
            <caption class="gs-sr-only">
              Events of gantry-element
            </caption>
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">Detail</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              @for (e of events(); track e.name) {
                <tr>
                  <td>
                    <code class="gs-name">{{ e.name }}</code>
                  </td>
                  <td>
                    <code class="gs-type">{{ e.detail }}</code>
                  </td>
                  <td class="api-desc"><app-inline-code [text]="e.description" /></td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <h3 class="gs-h3 api-h3">The same event in every binding</h3>
        <div class="gs-table-wrap" tabindex="0" role="region" aria-label="Event names per binding">
          <table class="gs-table">
            <caption class="gs-sr-only">
              Event names per binding
            </caption>
            <thead>
              <tr>
                <th scope="col">Web Component</th>
                <th scope="col">React / Svelte</th>
                <th scope="col">Vue</th>
                <th scope="col">Angular</th>
              </tr>
            </thead>
            <tbody>
              @for (b of bindings(); track b.name) {
                <tr>
                  <td>
                    <code class="gs-name">{{ b.name }}</code>
                  </td>
                  <td>
                    <code>{{ b.callback }}</code>
                  </td>
                  <td>
                    <code>{{ b.vue }}</code>
                  </td>
                  <td>
                    <code>{{ b.angular }}</code>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="api-note">
          <app-inline-code
            text="Angular’s \`(viewModeChange)\` emits the level itself (it is the \`[(viewMode)]\` model) and \`[(series)]\` is a model (the tasks the chart applied); the other payloads are the same. Veto \`before-change\` and \`before-export\` with \`detail.preventDefault()\` in every binding (the element’s events also take \`event.preventDefault()\`)."
          />
          See the <a class="gs-link" routerLink="/frameworks">Frameworks</a> page for each binding.
        </p>
      } @else {
        <p class="gs-empty">No event matches “{{ query() }}”.</p>
      }
    </section>

    <section class="gs-section api-sec" id="css-properties">
      <div class="gs-section-head">
        <div>
          <h2 class="gs-h2" tabindex="-1">CSS custom properties</h2>
          <p>
            Set them on <code class="gs-code-inline">gantry-element</code> or an ancestor to override the theme; the
            defaults are the light theme’s. More on the <a class="gs-link" routerLink="/theming">Theming</a> page.
          </p>
        </div>
      </div>
      @if (cssProperties().length) {
        <div class="gs-table-wrap" tabindex="0" role="region" aria-label="CSS custom properties">
          <table class="gs-table">
            <caption class="gs-sr-only">
              CSS custom properties of gantry-element
            </caption>
            <thead>
              <tr>
                <th scope="col">Property</th>
                <th scope="col">Default</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              @for (c of cssProperties(); track c.name) {
                <tr>
                  <td>
                    <code class="gs-name">{{ c.name }}</code>
                  </td>
                  <td>
                    @if (c.default) {
                      <code class="gs-type">{{ c.default }}</code>
                    } @else {
                      <span class="gs-muted">—</span>
                    }
                  </td>
                  <td class="api-desc"><app-inline-code [text]="c.description" /></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <p class="gs-empty">No CSS custom property matches “{{ query() }}”.</p>
      }
    </section>

    <section class="gs-section api-sec" id="parts">
      <div class="gs-section-head">
        <div>
          <h2 class="gs-h2" tabindex="-1">CSS parts</h2>
          <p>
            Style the element’s regions from outside its shadow root with
            <code class="gs-code-inline">gantry-element::part(name)</code>.
          </p>
        </div>
      </div>
      @if (cssParts().length) {
        <div class="gs-table-wrap" tabindex="0" role="region" aria-label="CSS parts">
          <table class="gs-table">
            <caption class="gs-sr-only">
              CSS parts of gantry-element
            </caption>
            <thead>
              <tr>
                <th scope="col">Part</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              @for (p of cssParts(); track p.name) {
                <tr>
                  <td>
                    <code class="gs-name">::part({{ p.name }})</code>
                  </td>
                  <td class="api-desc"><app-inline-code [text]="p.description" /></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <p class="gs-empty">No part matches “{{ query() }}”.</p>
      }
    </section>

    <section class="gs-section api-sec" id="states">
      <div class="gs-section-head">
        <div>
          <h2 class="gs-h2" tabindex="-1">Custom states</h2>
          <p>
            Match what the element is doing with <code class="gs-code-inline">gantry-element:state(name)</code>; it sets
            no <code class="gs-code-inline">data-theme</code> attribute.
          </p>
        </div>
      </div>
      @if (cssStates().length) {
        <div class="gs-table-wrap" tabindex="0" role="region" aria-label="Custom states">
          <table class="gs-table">
            <caption class="gs-sr-only">
              Custom states of gantry-element
            </caption>
            <thead>
              <tr>
                <th scope="col">State</th>
                <th scope="col">While</th>
              </tr>
            </thead>
            <tbody>
              @for (s of cssStates(); track s.name) {
                <tr>
                  <td>
                    <code class="gs-name">:state({{ s.name }})</code>
                  </td>
                  <td class="api-desc"><app-inline-code [text]="s.description" /></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <p class="gs-empty">No custom state matches “{{ query() }}”.</p>
      }
    </section>
  `,
})
export class ApiPageComponent {
  private readonly doc = inject(DOCUMENT);

  protected readonly api = API;
  protected readonly site = SITE;
  protected readonly query = signal('');

  /** Matches when any of the fields contains the filter text (case-insensitive). */
  private readonly match = computed(() => {
    const q = this.query().trim().toLowerCase();
    return (...fields: (string | undefined)[]) => !q || fields.some(f => f?.toLowerCase().includes(q));
  });

  protected readonly properties = computed(() =>
    API.properties.filter(p => this.match()(p.name, p.attribute, p.type, p.description)),
  );
  protected readonly methods = computed(() => METHODS.filter(m => this.match()(m.signature, m.description)));
  protected readonly events = computed(() =>
    API.events.filter(e => {
      const b = EVENT_NAMES[e.name];
      return this.match()(e.name, e.detail, e.description, b?.callback, b?.vue, b?.angular);
    }),
  );
  protected readonly bindings = computed(() => {
    const names = new Set(this.events().map(e => e.name));
    return BINDINGS.filter(b => names.has(b.name));
  });
  protected readonly cssProperties = computed(() =>
    API.cssProperties.filter(c => this.match()(c.name, c.default, c.description)),
  );
  protected readonly cssParts = computed(() => API.cssParts.filter(p => this.match()(p.name, p.description)));
  protected readonly cssStates = computed(() => API.cssStates.filter(s => this.match()(s.name, s.description)));

  protected readonly sections = computed<{ id: SectionId; label: string; count: number }[]>(() => [
    { id: 'properties', label: 'Properties', count: this.properties().length },
    { id: 'methods', label: 'Methods', count: this.methods().length },
    { id: 'events', label: 'Events', count: this.events().length },
    { id: 'css-properties', label: 'CSS properties', count: this.cssProperties().length },
    { id: 'parts', label: 'Parts', count: this.cssParts().length },
    { id: 'states', label: 'States', count: this.cssStates().length },
  ]);

  /** Announced to screen readers while filtering. */
  protected readonly status = computed(() => {
    if (!this.query().trim()) return '';
    const n = this.sections().reduce((sum, s) => sum + s.count, 0);
    return n === 0 ? 'No matches' : n === 1 ? '1 match' : `${n} matches`;
  });

  protected onInput(e: Event): void {
    this.query.set((e.target as HTMLInputElement).value);
  }

  /**
   * In-page links: scroll the section in (honouring the sticky header's scroll padding, which
   * the router's anchor scrolling ignores) and move the focus to its heading.
   */
  protected jump(e: MouseEvent, id: SectionId): void {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const section = this.doc.getElementById(id);
    if (!section) return;
    e.preventDefault();
    const reduce = this.doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? true;
    section.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    section.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  }
}
