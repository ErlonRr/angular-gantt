import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GantryComponent, provideGanttBar } from '@gantryjs/angular';
import { AppThemeService } from '../../shell/app-theme.service';
import { IconComponent } from '../../shell/icon.component';
import { EXAMPLES } from '../../shell/demo-registry';
import { EpicBarComponent } from '../../gantt-custom/epic-bar.component';
import { GalleryIndexComponent } from '../../gallery/gallery-index.component';
import { PREVIEWS } from './previews';

/**
 * /examples: one card per example page, each with a live preview of its idea, then the gallery
 * (every case in all five frameworks, `GalleryIndexComponent`).
 *
 * Accessibility: a card is an `<article>` whose only interactive element is the title link;
 * the link's `::after` covers the card, so a click anywhere opens the example. The preview
 * chart is `inert` (no tab stops, not in the accessibility tree, no pointer events): it is a
 * picture of the example, and a live chart inside a link would nest interactive content.
 */
@Component({
  selector: 'app-examples-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Unscoped so the icon's <svg> can be sized: page-local `exs-` classes only (the previews'
  // charts render in the light DOM, element selectors would reach them)
  encapsulation: ViewEncapsulation.None,
  imports: [RouterLink, GantryComponent, IconComponent, GalleryIndexComponent],
  // The custom-bar preview draws its epics with the example's bar component
  providers: [provideGanttBar({ type: 'epic', component: EpicBarComponent })],
  template: `
    <div class="gs-page-head">
      <div>
        <p class="gs-eyebrow">Examples</p>
        <h1 class="gs-title">Examples</h1>
        <p class="gs-lead">
          Small apps built with the chart: a roadmap, a project board, lazy loading and custom bars. Each page is the
          Angular binding at work, with its controls and the code that wires it up. Below them, the
          <a class="gs-link" routerLink="/examples" fragment="gallery">gallery</a> shows every case in all five
          frameworks.
        </p>
      </div>
    </div>

    <div class="gs-grid gs-grid--2">
      @for (ex of examples; track ex.path) {
        <article class="gs-card gs-example exs-card">
          <div class="gs-stage exs-stage" inert>
            @if (ex.preview.dataSource; as ds) {
              <gantry
                class="gs-chart exs-mini"
                [dataSource]="ds"
                [options]="ex.preview.options"
                [darkMode]="theme.isDark()"
                [showToolbar]="false"
                [enableDrag]="false"
                [enableResize]="false"
                [tooltipEnabled]="false"
              />
            } @else {
              <gantry
                class="gs-chart exs-mini"
                [series]="ex.preview.series ?? []"
                [options]="ex.preview.options"
                [darkMode]="theme.isDark()"
                [showToolbar]="false"
                [enableDrag]="false"
                [enableResize]="false"
                [tooltipEnabled]="false"
              />
            }
          </div>
          <div class="gs-example-body">
            <h2 class="gs-h3">
              <a class="exs-link" [routerLink]="'/' + ex.path">{{ ex.title }}</a>
            </h2>
            <p>{{ ex.description }}</p>
            <ul class="exs-tags" aria-label="Options and APIs">
              @for (tag of ex.tags; track tag) {
                <li class="gs-tag">{{ tag }}</li>
              }
            </ul>
            <span class="exs-open" aria-hidden="true">Open the example <app-icon name="arrowRight" /></span>
          </div>
        </article>
      }
    </div>

    <section appGalleryIndex></section>
  `,
  styles: `
    .exs-card {
      position: relative;
      transition:
        border-color 0.15s,
        box-shadow 0.15s,
        transform 0.15s var(--gs-ease);
    }
    .exs-card:hover {
      border-color: var(--gs-border-strong);
      box-shadow: var(--gs-shadow-md);
      transform: translateY(-2px);
    }
    .exs-stage {
      isolation: isolate;
    }
    .gs-stage > .gs-chart.exs-mini {
      height: 184px;
    }
    .exs-link {
      color: inherit;
      text-decoration: none;
    }
    /* The link covers the card: one target, one tab stop */
    .exs-link::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 1;
    }
    .exs-link:focus-visible {
      outline: none;
    }
    .exs-link:focus-visible::after {
      border-radius: var(--gs-radius);
      outline: 2px solid var(--gs-accent-ring);
      outline-offset: -2px;
    }
    .exs-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 2px 0 0;
      padding: 0;
      list-style: none;
    }
    .exs-open {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: auto;
      padding-top: 6px;
      color: var(--gs-accent);
      font-size: 15px;
      font-weight: 600;
    }
    .exs-open svg {
      width: 16px;
      height: 16px;
    }
    .exs-card:hover .exs-open {
      color: var(--gs-accent-hover);
    }
    @media (prefers-reduced-motion: reduce) {
      .exs-card {
        transition: none;
      }
      .exs-card:hover {
        transform: none;
      }
    }
  `,
})
export class ExamplesPageComponent {
  protected readonly theme = inject(AppThemeService);
  protected readonly examples = EXAMPLES.map(ex => ({ ...ex, preview: PREVIEWS[ex.path]() }));
}
