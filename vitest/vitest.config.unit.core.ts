import { defineConfig } from 'vitest/config'

import { testDefine } from '../vitest.define'
import { CORE_ALIASES, PKG_ALIASES } from '../vitest.projects'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: [...CORE_ALIASES, ...PKG_ALIASES],
  },
  define: testDefine,
  test: {
    name: 'unit-core',
    globals: false,
    silent: 'passed-only',
    environment: 'node',
    // Core-app tests (admin/editor/auth routes + the app shell). The
    // repository-level + package tests run via `vitest.config.unit.ts`.
    include: ['../apps/core/tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['./setup.unit.ts'],
    testTimeout: 10_000,
  },
})
