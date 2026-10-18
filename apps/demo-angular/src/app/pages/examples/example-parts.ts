import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SITE } from 'demo-kit/site';
import { CodeBlockComponent } from '../../shell/code-block.component';
import { IconComponent } from '../../shell/icon.component';
import { exampleAt } from '../../shell/demo-registry';

/**
 * The head of an example page: eyebrow, title and lead from the registry, and the way back to
 * /examples. Kept short so the chart below starts in the first viewport.
 */
@Component({
  selector: 'header[appExampleHead]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  host: { class: 'gs-page-head' },
  template: `
    <div>
      <p class="gs-eyebrow">Example</p>
      <h1 class="gs-title">{{ example().title }}</h1>
      <p class="gs-lead">{{ example().blurb }}</p>
    </div>
    <a class="gs-btn gs-btn--sm" routerLink="/examples">
      <span class="back-icon"><app-icon name="arrowRight" /></span>
      All examples
    </a>
  `,
  styles: `
    :host.gs-page-head {
      margin-bottom: 20px;
    }
    :host.gs-page-head > :first-child {
      max-width: 880px;
    }
    .gs-title {
      margin-bottom: 8px;
    }
    .back-icon {
      display: inline-flex;
      transform: scaleX(-1);
    }
  `,
})
export class ExampleHeadComponent {
  /** Route path of the example ("roadmap"). */
  readonly path = input.required<string>({ alias: 'appExampleHead' });
  protected readonly example = computed(() => exampleAt(this.path()));
}

/**
 * Styles shared by the example pages (each page adds them to its own `styles`). The chart keeps
 * to the first viewport: its top sits about 300 px down, so `100vh - 330px` leaves it whole.
 */
export const EXAMPLE_STYLES = `
  .ex-chart {
    height: clamp(480px, calc(100vh - 330px), 780px);
  }
  .ex-status {
    flex: 1 1 160px;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--gs-muted);
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

/** The "Usage" section of an example page: its snippet from the registry. */
@Component({
  selector: 'app-example-usage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CodeBlockComponent, IconComponent],
  host: { style: 'display: block' },
  template: `
    <section class="gs-section" aria-labelledby="example-usage">
      <div class="gs-section-head">
        <div>
          <h2 class="gs-h2" id="example-usage">Usage</h2>
          <p>The parts of the API this page uses, ready to copy.</p>
        </div>
        <a class="gs-btn gs-btn--sm" [href]="configurationUrl">
          Configuration reference
          <app-icon name="external" />
        </a>
      </div>
      <app-code-block [code]="example().usage" [file]="example().file" />
    </section>
  `,
})
export class ExampleUsageComponent {
  /** Route path of the example ("roadmap"). */
  readonly path = input.required<string>();
  protected readonly example = computed(() => exampleAt(this.path()));
  protected readonly configurationUrl = SITE.configurationUrl;
}
