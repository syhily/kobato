import { routeWarmupScriptStubPlugin } from '@kobato/test/virtual-modules.ts'
import { vitestTestBase } from '@kobato/test/vitest.base.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

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
    include: ['packages/web/*/tests/snaps/**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude],
    setupFiles: [path.resolve(REPO_ROOT, 'packages/web/admin/tests/utils/setup/snaps.ts')],
  },
})
