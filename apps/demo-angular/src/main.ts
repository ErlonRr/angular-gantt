import { bootstrapApplication } from '@angular/platform-browser';
import { provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { provideGantt } from '@gantryjs/angular';

bootstrapApplication(AppComponent, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // New pages open at the top; back/forward restore the position
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' })),
    // Optional: defaults for every chart (built-in bars need no provider). The pages bind
    // [darkMode] to the site theme, so 'auto' only covers a chart that doesn't.
    provideGantt({ darkMode: 'auto' }),
  ],
}).catch(err => console.error(err));
