import { testDefine } from '@kobato/test-helpers/vitest.define.ts'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  define: testDefine,
  test: {
    name: 'web-unit',
    globals: false,
    silent: 'passed-only',
    // Cap worker processes: the default forks pool spawns one worker per CPU
    // core, which starves the host on high-core machines.
    maxWorkers: 4,
    environment: 'node',
    include: ['**/*.test.{ts,tsx}', '../contract/**/*.test.{ts,tsx}'],
    setupFiles: ['@kobato/test-helpers/setup/unit.ts'],
    testTimeout: 10_000,
  },
})
