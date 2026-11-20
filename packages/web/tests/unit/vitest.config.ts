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
    name: 'web',
    pool: 'vmThreads',
    environment: 'happy-dom',
    setupFiles: [path.resolve(import.meta.dirname, '../utils/setup/unit.ts')],
    projects: [
      {
        test: {
          name: 'unit',
          include: [
            'packages/web/tests/unit/**/*.test.{ts,tsx}',
            'packages/web/tests/contract/**/*.test.{ts,tsx}',
            'packages/web/admin/tests/unit/**/*.test.{ts,tsx}',
            'packages/web/client/tests/unit/**/*.test.{ts,tsx}',
            'packages/web/public/tests/unit/**/*.test.{ts,tsx}',
          ],
          exclude: [...configDefaults.exclude, 'packages/web/admin/tests/unit/ui/analytics/time-labels.test.ts'],
        },
      },
      {
        test: {
          name: 'tz-unit',
          pool: 'forks',
          isolate: true,
          include: ['packages/web/admin/tests/unit/ui/analytics/time-labels.test.ts'],
        },
      },
    ],
  },
})
