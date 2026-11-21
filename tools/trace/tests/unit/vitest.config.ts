import { vitestTestBase } from '@kobato/test/vitest.base.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
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
    name: 'trace-unit',
    include: ['tools/trace/tests/unit/**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude],
    setupFiles: ['@kobato/test/setup/unit.ts'],
  },
})
