import { defineConfig } from 'vitest/config'

import { routeWarmupScriptStubPlugin } from '../packages/test-utils/tests/_helpers/virtual-modules'
import { testDefine } from '../vitest.define'
import { CORE_ALIASES, PKG_ALIASES } from '../vitest.projects'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: [...CORE_ALIASES, ...PKG_ALIASES],
  },
  plugins: [routeWarmupScriptStubPlugin()],
  define: testDefine,
  test: {
    name: 'it-core',
    globals: false,
    silent: 'passed-only',
    environment: 'node',
    // Core-app integration tests (admin/editor/auth routes + auth flows).
    // The repository-level + package tests run via `vitest.config.ts` in
    // this directory.
    include: ['../apps/core/tests/it/**/*.test.{ts,tsx}'],
    setupFiles: ['./setup.it.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
