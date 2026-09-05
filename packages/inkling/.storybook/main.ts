import type { StorybookConfig } from '@storybook/react-vite'

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { mergeConfig } from 'vite'

import { INKLING_ALIASES } from '../vite-aliases'

const require = createRequire(import.meta.url)

const config: StorybookConfig = {
  framework: {
    name: getAbsolutePath('@storybook/react-vite'),
    options: {},
  },
  viteFinal: async (viteConfig) => {
    return mergeConfig(viteConfig, {
      resolve: {
        alias: INKLING_ALIASES,
      },
      optimizeDeps: {
        include: ['@storybook/react'],
      },
    })
  },
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx|mdx)'],
  addons: [getAbsolutePath('@storybook/addon-links'), getAbsolutePath('@etchteam/storybook-addon-status')],
  features: {},
  docs: {},
}

export default config

function getAbsolutePath(value: string): string {
  return dirname(require.resolve(join(value, 'package.json')))
}
