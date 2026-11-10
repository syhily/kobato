import { defineConfig } from 'vitest/config'

import { routeWarmupScriptStubPlugin } from '../_helpers/virtual-modules.ts'
import { testDefine } from '../vitest.define.ts'

export default defineConfig({
  plugins: [routeWarmupScriptStubPlugin()],
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    globals: false,
    silent: 'passed-only',
    // Cap worker processes: the default forks pool spawns one worker per CPU
    // core, which starves the host on high-core machines.
    maxWorkers: 4,
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    setupFiles: ['./setup.ts'],
    testTimeout: 10_000,
  },
})
