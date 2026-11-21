import { vitestTestBase } from '@kobato/test/vitest.base.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

export default defineConfig({
  root: REPO_ROOT,
  resolve: {
    tsconfigPaths: true,
  },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'shared-unit',
    include: ['packages/shared/*/tests/unit/**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude],
    setupFiles: [path.resolve(REPO_ROOT, 'packages/shared/settings/tests/utils/setup/unit.ts')],
  },
})
