import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import type { StorybookConfig } from '@storybook/react-vite';
import type { PluginOption } from 'vite';

/**
 * The library build's own steps, which the static Storybook (a public site) must not run: type
 * declarations, and the copy of README.md, TODO.md and the package files into the output.
 */
const LIBRARY_ONLY = new Set(['vite:dts', 'nx-copy-assets-plugin']);

const isLibraryOnly = (plugin: PluginOption) =>
  typeof plugin === 'object' && plugin !== null && 'name' in plugin && LIBRARY_ONLY.has(plugin.name);

const config: StorybookConfig = {
  stories: ['../src/**/*.@(mdx|stories.@(js|jsx|ts|tsx))'],
  addons: [],
  viteFinal: (config) => ({
    ...config,
    plugins: (config.plugins ?? []).flat(Infinity).filter((plugin) => !isLibraryOnly(plugin as PluginOption)),
  }),
  framework: {
    name: getAbsolutePath('@storybook/react-vite'),
    options: {
      builder: {
        viteConfigPath: 'vite.config.mts',
      },
    },
  },
};

function getAbsolutePath(value: string): string {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

export default config;

// To customize your Vite configuration you can use the viteFinal field.
// Check https://storybook.js.org/docs/react/builders/vite#configuration
// and https://nx.dev/recipes/storybook/custom-builder-configs
