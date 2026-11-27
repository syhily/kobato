import { REPO_ROOT } from '@kobato/test/repo-root'
import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  root: REPO_ROOT,
  plugins: [routeWarmupScriptStubPlugin()],
  resolve: { tsconfigPaths: true },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'web-snaps',
    pool: 'vmThreads',
    environment: 'happy-dom',
    include: ['packages/web/kit/tests/snaps/**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude],
    setupFiles: [path.resolve(REPO_ROOT, 'packages/web/kit/tests/utils/setup/snaps.ts')],
  },
})
