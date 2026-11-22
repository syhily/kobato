import { TRACE_UNIT_INCLUDE } from '@kobato/test/projects/unit-includes'
import { REPO_ROOT } from '@kobato/test/repo-root'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  root: REPO_ROOT,
  resolve: {
    tsconfigPaths: true,
  },
  define: testDefine,
  test: {
    ...vitestTestBase,
    name: 'trace-unit',
    include: [...TRACE_UNIT_INCLUDE],
    exclude: [...configDefaults.exclude],
    setupFiles: ['@kobato/test/setup/node'],
  },
})
