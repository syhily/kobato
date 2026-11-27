import { REPO_ROOT } from '@kobato/test/repo-root'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { configDefaults } from 'vitest/config'

const SETUP_FILE = path.resolve(REPO_ROOT, 'packages/web/kit/tests/utils/setup/unit.ts')

export const webUnitProjects = [
  {
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'web-unit',
      pool: 'vmThreads',
      environment: 'happy-dom',
      setupFiles: [SETUP_FILE],
      include: ['packages/web/kit/tests/unit/**/*.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude],
    },
  },
]
