import { defineConfig } from 'vitest/config'

import { testDefine } from '../vitest.define'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  define: testDefine,
  test: {
    globals: false,
    silent: 'passed-only',
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    setupFiles: ['./setup.ts'],
    testTimeout: 10_000,
  },
})
