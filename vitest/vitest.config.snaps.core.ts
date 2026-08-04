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
    name: 'snaps-core',
    globals: false,
    silent: 'passed-only',
    environment: 'node',
    // Core-app SSR snapshot tests (admin + editor routes). The
    // repository-level + package tests run via `vitest.config.snaps.ts`.
    include: ['../apps/core/tests/snaps/**/*.test.{ts,tsx}'],
    setupFiles: ['./setup.snaps.ts'],
    testTimeout: 10_000,
  },
})
