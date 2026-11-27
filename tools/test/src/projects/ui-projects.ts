import { REPO_ROOT } from '@kobato/test/repo-root'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

const UNIT_SETUP = path.resolve(REPO_ROOT, 'packages/web/ui/tests/utils/setup/unit.ts')
const SNAPS_SETUP = path.resolve(REPO_ROOT, 'packages/web/ui/tests/utils/setup/snaps.ts')

export const uiProjects = [
  defineConfig({
    root: REPO_ROOT,
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'ui-unit',
      pool: 'vmThreads',
      environment: 'happy-dom',
      include: ['packages/web/ui/tests/unit/**/*.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude],
      setupFiles: [UNIT_SETUP],
    },
  }),
  defineConfig({
    root: REPO_ROOT,
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'ui-snaps',
      pool: 'vmThreads',
      include: ['packages/web/ui/tests/snaps/**/*.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude],
      setupFiles: [SNAPS_SETUP],
    },
  }),
]
