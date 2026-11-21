import { REPO_ROOT } from '@kobato/test/repo-root'
import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

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
    setupFiles: [path.resolve(REPO_ROOT, 'packages/ui/tests/utils/setup/unit.ts')],
  },
})
