import { applicationConfig, type Preview } from '@storybook/angular';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideGanttLib } from '../projects/gantry/src/public-api';

const preview: Preview = {
  decorators: [
    applicationConfig({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideGanttLib({ darkMode: 'auto' }),
      ],
    }),
  ],

  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date:  /Date$/i,
      },
    },
    layout: 'fullscreen',
    backgrounds: {
      options: {
        light: { name: 'light', value: '#f8fafc' },
        dark: { name: 'dark',  value: '#0f172a' }
      }
    },
  },

  initialGlobals: {
    backgrounds: {
      value: 'light'
    }
  }
};

export default preview;
