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
    name: 'snaps-public',
    globals: false,
    silent: 'passed-only',
    environment: 'node',
    // Public-app SSR snapshot tests. The repository-level + package tests
    // run via `vitest.config.snaps.ts`.
    include: ['../apps/public/tests/snaps/**/*.test.{ts,tsx}'],
    setupFiles: ['./setup.snaps.ts'],
    testTimeout: 10_000,
  },
})
