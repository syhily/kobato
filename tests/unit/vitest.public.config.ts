import { defineConfig } from 'vitest/config'

import { testDefine } from '../vitest.define'
import { PKG_ALIASES, PUBLIC_ALIASES } from '../vitest.projects'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: [...PUBLIC_ALIASES, ...PKG_ALIASES],
  },
  define: testDefine,
  test: {
    name: 'unit-public',
    globals: false,
    silent: 'passed-only',
    environment: 'node',
    // Public-app tests (the official frontend route tree). The
    // repository-level + package tests run via `vitest.config.ts` in this
    // directory.
    include: ['../../apps/public/tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['./setup.ts'],
    testTimeout: 10_000,
  },
})
