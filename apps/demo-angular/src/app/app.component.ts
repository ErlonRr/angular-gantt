import { ChangeDetectionStrategy, Component, DestroyRef, type ElementRef, inject, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, pairwise } from 'rxjs/operators';
import { SiteHeaderComponent } from './shell/site-header.component';
import { SiteFooterComponent } from './shell/site-footer.component';

/** The site shell: skip link, header, the routed page in `<main>`, footer. */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, SiteHeaderComponent, SiteFooterComponent],
  host: { class: 'gs-app' },
  template: `
    <app-site-header />
    <main #main id="main" class="gs-main" tabindex="-1">
      <div class="gs-container">
        <router-outlet />
      </div>
    </main>
    <app-site-footer />
  `,
})
export class AppComponent {
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');

  constructor() {
    // After a move to another page (not the first one, not a query or fragment change such as the
    // playground's ?setup=), the new page's content gets the focus, so keyboard and screen reader
    // users start reading it instead of staying in the nav
    const sub = inject(Router)
      .events.pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        map(e => e.urlAfterRedirects.split(/[?#]/)[0]),
        pairwise(),
        filter(([before, after]) => before !== after),
      )
      .subscribe(() => this.main().nativeElement.focus({ preventScroll: true }));
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }
}
