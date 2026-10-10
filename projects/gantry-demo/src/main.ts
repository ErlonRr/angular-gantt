import { bootstrapApplication } from '@angular/platform-browser';
import { provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { provideGanttLib } from 'ngx-gantry';

bootstrapApplication(AppComponent, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideGanttLib({ darkMode: 'auto' }),
  ],
}).catch(err => console.error(err));
