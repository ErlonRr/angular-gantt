// ─────────────────────────────────────────────────────────────
//  Storybook manager theme — matches the gantry-demo showcase
//  (charcoal-violet dark IDE look, same palette as tokens.scss).
// ─────────────────────────────────────────────────────────────

import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming';

const gantryTheme = create({
  base: 'dark',

  brandTitle: 'Gantry · ngx-gantry',
  brandUrl: 'https://github.com/ErlonRr/angular-gantt',
  brandTarget: '_blank',

  // Violet primary (tokens: --primary 262 83% 62%)
  colorPrimary:   '#894EEF',
  colorSecondary: '#894EEF',

  // Charcoal-violet surfaces (tokens: --background / --card / --border)
  appBg:          '#100E15',
  appContentBg:   '#100E15',
  appPreviewBg:   '#100E15',
  appBorderColor: '#292531',
  appBorderRadius: 8,

  // Text
  textColor:        '#F4F3F7',
  textInverseColor: '#100E15',
  textMutedColor:   '#9F9CA8',

  // Top toolbar
  barBg:            '#18151E',
  barTextColor:     '#9F9CA8',
  barSelectedColor: '#894EEF',
  barHoverColor:    '#894EEF',

  // Form controls
  inputBg:          '#18151E',
  inputBorder:      '#292531',
  inputTextColor:   '#F4F3F7',
  inputBorderRadius: 6,

  fontBase: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontCode: 'ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, monospace',
});

addons.setConfig({ theme: gantryTheme });
