import { applicationConfig, type Preview } from '@storybook/angular';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideGanttLib } from '../projects/gantry/src/public-api';
import './preview.css';

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
        // Match the gantry-demo palette (tokens.scss)
        light: { name: 'light', value: '#ffffff' },
        dark:  { name: 'dark',  value: '#100E15' },
      },
    },
  },

  initialGlobals: {
    backgrounds: {
      value: 'dark',
    },
  },
};

export default preview;
