import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PACKAGES, SITE } from 'demo-kit/site';

@Component({
  selector: 'app-site-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <footer class="gs-footer">
      <div class="gs-container">
        <p>
          <strong>{{ site.name }}</strong> v{{ site.version }} · {{ site.license }} ·
          <a [href]="site.repoUrl">GitHub</a> · <a [href]="npmUrl">npm</a> · made by
          <a [href]="site.authorUrl">{{ site.author }}</a>
        </p>
        <p>{{ site.tagline }}</p>
      </div>
    </footer>
  `,
})
export class SiteFooterComponent {
  protected readonly site = SITE;
  protected readonly npmUrl = PACKAGES.vanilla.npmUrl;
}
