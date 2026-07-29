import { defineConfig } from 'vitest/config'

import { routeWarmupScriptStubPlugin } from '../_helpers/virtual-modules'
import { testDefine } from '../vitest.define'

export default defineConfig({
  plugins: [routeWarmupScriptStubPlugin()],
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    globals: false,
    silent: 'passed-only',
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    setupFiles: ['./setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
