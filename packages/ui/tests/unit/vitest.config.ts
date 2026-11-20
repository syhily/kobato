import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules.ts'
import { vitestTestBase } from '@kobato/test/vitest.base.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [routeWarmupScriptStubPlugin()],
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'ui-unit',
    pool: 'vmThreads',
    environment: 'happy-dom',
    include: ['**/*.test.{ts,tsx}', '../contract/**/*.test.{ts,tsx}'],
    setupFiles: [path.resolve(import.meta.dirname, '../utils/setup/unit.ts')],
  },
})
