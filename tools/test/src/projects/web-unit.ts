import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults } from 'vitest/config'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const SETUP_FILE = path.resolve(REPO_ROOT, 'packages/web/admin/tests/utils/setup/unit.ts')
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
      include: ['packages/web/*/tests/unit/**/*.test.{ts,tsx}'],
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
