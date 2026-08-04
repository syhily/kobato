import { defineConfig } from 'vitest/config'

import { testDefine } from '../vitest.define'
import { PKG_ALIASES } from '../vitest.projects'

export default defineConfig({
  resolve: {
    alias: PKG_ALIASES,
  },
  define: testDefine,
  test: {
    name: 'unit',
    globals: false,
    silent: 'passed-only',
    environment: 'node',
    // Repository-level tests (guards under the owning module) + tests that moved
    // with their packages. The app tests run via the per-app configs in
    // this directory (they need app-scoped `@/` aliases).
    include: ['**/*.test.{ts,tsx}', '../packages/*/tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['./setup.unit.ts'],
    testTimeout: 10_000,
  },
})
