import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { NAV, SITE, type NavItem } from 'demo-kit/site';
import { AppThemeService } from './app-theme.service';
import { IconComponent } from './icon.component';
import { EXAMPLES } from './demo-registry';

/**
 * Which nav item a URL belongs to: the item's own page is `aria-current="page"`; an example page
 * marks Examples with `aria-current="true"` (its section, not that page).
 */
function navFor(url: string): { id: NavItem['id']; current: 'page' | 'true' } | null {
  const path = url.split(/[?#]/)[0].replace(/^\//, '');
  if (EXAMPLES.some(e => e.path === path)) return { id: 'examples', current: 'true' };
  const item = NAV.find(n => n.path === path);
  return item ? { id: item.id, current: 'page' } : null;
}

@Component({
  selector: 'app-site-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  host: { style: 'display: contents' },
  template: `
    <a class="gs-skip" href="#main" (click)="skip($event)">Skip to content</a>
    <header class="gs-header">
      <div class="gs-container gs-header-inner">
        <a class="gs-brand" routerLink="/">
          <span class="gs-logo" aria-hidden="true"></span>
          <span>{{ site.name }}</span>
          <span class="gs-version">v{{ site.version }}</span>
        </a>
        <nav class="gs-nav" aria-label="Primary">
          <ul class="gs-nav-list">
            @for (item of nav; track item.id) {
              <li>
                <a
                  class="gs-nav-link"
                  [routerLink]="'/' + item.path"
                  [attr.aria-current]="active()?.id === item.id ? active()?.current : null"
                >
                  <app-icon [name]="item.icon" />
                  <span>{{ item.label }}</span>
                </a>
              </li>
            }
          </ul>
        </nav>
        <div class="gs-header-actions">
          <button
            type="button"
            class="gs-icon-btn"
            aria-label="Dark theme"
            [attr.aria-pressed]="theme.isDark()"
            (click)="theme.toggle()"
          >
            <app-icon [name]="theme.isDark() ? 'sun' : 'moon'" />
          </button>
          <a class="gs-icon-btn" [href]="site.repoUrl" aria-label="Source code on GitHub">
            <app-icon name="github" />
          </a>
        </div>
      </div>
    </header>
  `,
})
export class SiteHeaderComponent {
  protected readonly theme = inject(AppThemeService);
  protected readonly site = SITE;
  protected readonly nav = NAV;

  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected readonly active = computed(() => navFor(this.url()));

  /** The skip link moves focus to the content without touching the route. */
  protected skip(e: Event): void {
    e.preventDefault();
    const main = (e.currentTarget as HTMLElement).ownerDocument.getElementById('main');
    main?.focus();
    main?.scrollIntoView();
  }
}
