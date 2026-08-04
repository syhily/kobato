import { defineConfig } from 'vitest/config'

import { routeWarmupScriptStubPlugin } from '../packages/test-utils/tests/_helpers/virtual-modules'
import { testDefine } from '../vitest.define'
import { PKG_ALIASES, PUBLIC_ALIASES } from '../vitest.projects'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: [...PUBLIC_ALIASES, ...PKG_ALIASES],
  },
  plugins: [routeWarmupScriptStubPlugin()],
  define: testDefine,
  test: {
    name: 'it-public',
    globals: false,
    silent: 'passed-only',
    environment: 'node',
    // Public-app integration tests. The repository-level + package tests
    // run via `vitest.config.it.ts`.
    include: ['../apps/public/tests/it/**/*.test.{ts,tsx}'],
    setupFiles: ['./setup.it.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
