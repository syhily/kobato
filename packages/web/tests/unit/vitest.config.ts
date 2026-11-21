import { vitestTestBase } from '@kobato/test/vitest.base.ts'
import { testDefine } from '@kobato/test/vitest.define.ts'
import path from 'node:path'
import { configDefaults } from 'vitest/config'

const SETUP_FILE = path.resolve(import.meta.dirname, '../utils/setup/unit.ts')
const TIME_LABELS_TEST = 'packages/web/admin/tests/unit/ui/analytics/time-labels.test.ts'

export const webUnitProjects = [
  {
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'web-unit',
      pool: 'vmThreads',
      environment: 'happy-dom',
      setupFiles: [SETUP_FILE],
      include: [
        'packages/web/admin/tests/unit/**/*.test.{ts,tsx}',
        'packages/web/client/tests/unit/**/*.test.{ts,tsx}',
        'packages/web/public/tests/unit/**/*.test.{ts,tsx}',
      ],
      exclude: [...configDefaults.exclude, TIME_LABELS_TEST],
    },
  },
  {
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'web-tz-unit',
      pool: 'forks',
      isolate: true,
      environment: 'happy-dom',
      setupFiles: [SETUP_FILE],
      include: [TIME_LABELS_TEST],
    },
  },
]
