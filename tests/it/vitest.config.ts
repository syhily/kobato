import { createRequire } from 'node:module'
import Binary from 'vite-plugin-binary'
import { defineConfig } from 'vitest/config'

import { routeWarmupScriptStubPlugin } from '../_helpers/virtual-modules'

const require = createRequire(import.meta.url)
const pkg = require('../../package.json')

export default defineConfig({
  plugins: [routeWarmupScriptStubPlugin(), Binary({ gzip: false })],
  resolve: { tsconfigPaths: true },
  assetsInclude: ['**/*.wasm', '**/*.wasm?binary'],
  define: {
    __APP_NAME__: JSON.stringify(pkg.name),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_DESCRIPTION__: JSON.stringify(pkg.description),
    __APP_AUTHOR_NAME__: JSON.stringify(pkg.author.name),
    __APP_HOMEPAGE__: JSON.stringify(pkg.homepage),
    __APP_REPOSITORY__: JSON.stringify(pkg.repository.url),
  },
  test: {
    globals: false,
    silent: 'passed-only',
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    setupFiles: ['./setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
