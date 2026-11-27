import { REPO_ROOT } from '@kobato/test/repo-root'
import { vitestTestBase } from '@kobato/test/vitest.base'
import { testDefine } from '@kobato/test/vitest.define'
import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

const NODE_SETUP = path.resolve(REPO_ROOT, 'tools/test/src/setup/node.ts')
const UNIT_SETUP = path.resolve(REPO_ROOT, 'packages/web/admin/tests/utils/setup/unit.ts')
const SNAPS_SETUP = path.resolve(REPO_ROOT, 'packages/web/admin/tests/utils/setup/snaps.ts')
const TZ_TEST = 'packages/web/admin/tests/unit/ui/analytics/time-labels.test.ts'

export const adminProjects = [
  defineConfig({
    root: REPO_ROOT,
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'admin-arch',
      include: ['packages/web/admin/tests/arch/**/*.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude],
      setupFiles: [NODE_SETUP],
    },
  }),
  defineConfig({
    root: REPO_ROOT,
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'admin-unit',
      pool: 'vmThreads',
      include: ['packages/web/admin/tests/unit/**/*.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude, TZ_TEST],
      setupFiles: [UNIT_SETUP],
    },
  }),
  defineConfig({
    root: REPO_ROOT,
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'admin-snaps',
      pool: 'vmThreads',
      include: ['packages/web/admin/tests/snaps/**/*.test.{ts,tsx}'],
      exclude: [...configDefaults.exclude],
      setupFiles: [SNAPS_SETUP],
    },
  }),
  defineConfig({
    root: REPO_ROOT,
    resolve: { tsconfigPaths: true },
    define: testDefine,
    test: {
      ...vitestTestBase,
      name: 'admin-tz-unit',
      pool: 'forks',
      environment: 'happy-dom',
      setupFiles: [UNIT_SETUP],
      include: [TZ_TEST],
    },
  }),
]
