import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules.ts'
import { vitestTestBase } from '@kobato/test/vitest.base.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

export default defineConfig({
  root: REPO_ROOT,
  plugins: [routeWarmupScriptStubPlugin()],
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'ui-unit',
    pool: 'vmThreads',
    environment: 'happy-dom',
    include: ['packages/ui/tests/unit/**/*.test.{ts,tsx}', 'packages/ui/tests/contract/**/*.test.{ts,tsx}'],
    setupFiles: [path.resolve(import.meta.dirname, '../utils/setup/unit.ts')],
  },
})
