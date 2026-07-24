import type { StorybookConfig } from '@storybook/angular';
import type { Configuration as WebpackConfig } from 'webpack';
import webpack from 'webpack';

/**
 * Angular CLI e Storybook aggiungono entrambi un `DefinePlugin` su
 * `process.env.NODE_ENV` con valori diversi → Webpack segnala conflitto.
 * Fondiamo tutti i DefinePlugin in uno solo e impostiamo NODE_ENV una volta.
 *
 * Contesto: vedi README «Development tooling» (toolchain parallela app vs Storybook).
 */
function mergeDefinePlugins(config: WebpackConfig): void {
  const plugins = config.plugins;
  if (!plugins?.length) {
    return;
  }

  const merged: Record<string, string | boolean | unknown> = {};
  const rest: WebpackConfig['plugins'] = [];

  for (const plugin of plugins) {
    if (plugin instanceof webpack.DefinePlugin) {
      Object.assign(merged, plugin.definitions);
    } else {
      rest.push(plugin);
    }
  }

  if (Object.keys(merged).length === 0) {
    return;
  }

  const nodeEnv =
    process.env['NODE_ENV'] === 'production' ? 'production' : 'development';
  merged['process.env.NODE_ENV'] = JSON.stringify(nodeEnv);

  rest.push(new webpack.DefinePlugin(merged as webpack.DefinePlugin['definitions']));
  config.plugins = rest;
}

// L'addon Chromatic in locale può causare rejection async e bloccare webpack (~9%).
// Per usarlo: `set STORYBOOK_CHROMATIC=1` (Windows) prima di `pnpm run storybook`
const addons: NonNullable<StorybookConfig['addons']> = ['@storybook/addon-docs'];
if (process.env['STORYBOOK_CHROMATIC'] === '1') {
  addons.push('@chromatic-com/storybook');
}

const config: StorybookConfig = {
  stories: ['../projects/gantry/src/stories/**/*.@(mdx|stories.@(ts))', '../projects/gantry-demo/src/**/*.@(mdx|stories.@(ts))'],
  addons,
  framework: {
    name: '@storybook/angular',
    options: {},
  },
  docs: {},

  webpackFinal: async (config) => {
    mergeDefinePlugins(config);
    return config;
  },
};

export default config;
