import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [routeWarmupScriptStubPlugin()],
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    name: 'ui-unit',
    globals: false,
    silent: 'passed-only',
    maxWorkers: 4,
    environment: 'node',
    include: ['**/*.test.{ts,tsx}', '../contract/**/*.test.{ts,tsx}'],
    setupFiles: ['@kobato/test/setup/unit.ts'],
    testTimeout: 10_000,
  },
})
