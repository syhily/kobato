import { defineConfig } from 'vitest/config'

import { routeWarmupScriptStubPlugin } from '../packages/test-utils/tests/_helpers/virtual-modules'
import { testDefine } from '../vitest.define'
import { PKG_ALIASES } from '../vitest.projects'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: PKG_ALIASES,
  },
  plugins: [routeWarmupScriptStubPlugin()],
  define: testDefine,
  test: {
    name: 'snaps',
    globals: false,
    silent: 'passed-only',
    environment: 'node',
    // Repository-level tests (guards under the owning module) + tests that moved
    // with their packages. The app tests run via the per-app configs in
    // this directory (they need app-scoped `@/` aliases).
    include: ['**/*.test.{ts,tsx}', '../packages/*/tests/snaps/**/*.test.{ts,tsx}'],
    setupFiles: ['./setup.snaps.ts'],
    testTimeout: 10_000,
  },
})
