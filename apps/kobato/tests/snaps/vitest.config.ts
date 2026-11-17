import { routeWarmupScriptStubPlugin } from '@kobato/test-helpers/virtual-modules.ts'
import { testDefine } from '@kobato/test-helpers/vitest.define.ts'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [routeWarmupScriptStubPlugin()],
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    name: 'app-snaps',
    globals: false,
    silent: 'passed-only',
    // Cap worker processes: the default forks pool spawns one worker per CPU
    // core, which starves the host on high-core machines.
    maxWorkers: 4,
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    setupFiles: ['@kobato/test-helpers/setup/snaps.ts'],
    testTimeout: 10_000,
  },
})
