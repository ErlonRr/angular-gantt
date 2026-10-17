import { bootstrapApplication } from '@angular/platform-browser';
import { provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { provideGantt } from 'ngx-gantry';

bootstrapApplication(AppComponent, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    // Optional: defaults for every chart (built-in bars need no provider)
    provideGantt({ darkMode: 'auto' }),
  ],
}).catch(err => console.error(err));
