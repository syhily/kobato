import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [routeWarmupScriptStubPlugin()],
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    name: 'app-snaps',
    globals: false,
    silent: 'passed-only',
    maxWorkers: 4,
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    setupFiles: ['@kobato/test/setup/snaps.ts'],
    testTimeout: 10_000,
  },
})
